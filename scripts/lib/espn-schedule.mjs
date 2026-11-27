// Pure helpers for scripts/merge-espn-schedule.mjs: turn ESPN scoreboard events into schedule rows
// in the College Basketball Data shape, and decide which ones the provider is missing.
//
// Why: the provider refreshes once a day and only lists bracket games (placement, third-place,
// championship) once the earlier rounds are played, so a Thanksgiving tournament's day-3 games
// can be missing from the slate on the day they tip. ESPN lists them as soon as they're set.

export const normName = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
// Same aliases as build-app-data / merge-espn-finals (provider name → ESPN directory location).
export const ALIASES = { neworleans: "lsuneworleans", stthomasminnesota: "stthomas" };

export const etDate = iso => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));

/**
 * ESPN team id → provider team ({ name, id, conference }), built from the provider's own game rows
 * so names and ids match what every other script expects.
 */
export function providerTeamsByEspn(games, directoryTeams) {
  const dirByLoc = new Map((directoryTeams ?? []).map(t => [normName(t.location || t.displayName), t]));
  const findDir = name => dirByLoc.get(normName(name)) ?? dirByLoc.get(ALIASES[normName(name)] ?? "") ?? null;
  const out = new Map();
  for (const g of games ?? []) {
    for (const [name, id, conference] of [[g.homeTeam, g.homeTeamId, g.homeConference], [g.awayTeam, g.awayTeamId, g.awayConference]]) {
      if (id == null || !name) continue;
      const d = findDir(name);
      if (d?.id == null || out.has(String(d.id))) continue;
      out.set(String(d.id), { name, id, conference: conference ?? null });
    }
  }
  return out;
}

const statusOf = ev => {
  const t = ev?.status?.type ?? ev?.competitions?.[0]?.status?.type ?? {};
  const name = String(t.name ?? "").toUpperCase();
  if (t.completed || name.includes("FINAL")) return "final";
  if (name.includes("POSTPONED")) return "postponed";
  if (name.includes("CANCELED") || name.includes("CANCELLED")) return "canceled";
  if (t.state === "in" || name.includes("IN_PROGRESS") || name.includes("HALFTIME")) return "in_progress";
  return "scheduled";
};

/**
 * One ESPN scoreboard event → a schedule row, or null when either side isn't a known D-I team
 * (we only add games between two mapped teams: a non-D-I opponent has no provider id to rate).
 */
export function rowFromEspn(ev, teamsByEspn) {
  const c = ev?.competitions?.[0];
  if (!c || !Array.isArray(c.competitors) || c.competitors.length !== 2) return null;
  const home = c.competitors.find(x => x.homeAway === "home"), away = c.competitors.find(x => x.homeAway === "away");
  if (!home || !away) return null;
  const h = teamsByEspn.get(String(home.team?.id ?? home.id)), a = teamsByEspn.get(String(away.team?.id ?? away.id));
  if (!h || !a) return null;
  const status = statusOf(ev);
  const score = s => (status === "final" && s.score != null && s.score !== "" ? Number(s.score) : null);
  const hs = score(home), as = score(away);
  const note = (c.notes ?? []).find(n => n?.headline)?.headline ?? null;
  const addr = c.venue?.address ?? {};
  return {
    id: String(ev.id),
    date: ev.date && ev.date.length === 17 ? ev.date.replace("Z", ":00.000Z") : ev.date,
    season: 2027,
    seasonType: "regular",
    status,
    homeTeam: h.name, awayTeam: a.name,
    homeTeamId: h.id, awayTeamId: a.id,
    homeConference: h.conference, awayConference: a.conference,
    homeScore: hs, awayScore: as,
    homeWinner: hs != null && as != null ? hs > as : null,
    awayWinner: hs != null && as != null ? as > hs : null,
    neutralSite: c.neutralSite === true,
    conferenceGame: c.conferenceCompetition === true,
    tournament: note,
    venue: c.venue?.fullName ?? null,
    city: addr.city ?? null,
    state: addr.state ?? addr.country ?? null,
    homePeriodPoints: null, awayPeriodPoints: null,
    source: "espn",
  };
}

/** Day + unordered pair of provider ids: the same game whichever side the provider calls home. */
export const pairKey = (date, x, y) => `${etDate(date)}:${[String(x), String(y)].sort().join("-")}`;

/**
 * Merge: drop earlier ESPN-sourced rows the provider now lists (its row wins), then add ESPN rows
 * the provider doesn't have. Returns { games, added, replaced }.
 */
export function mergeSchedule(games, espnRows) {
  const provider = games.filter(g => g.source !== "espn");
  // A provider row a day either side also counts (TBA tip times can land on the next UTC/Eastern day).
  const have = new Set(provider.flatMap(g => [-1, 0, 1].map(d => pairKey(new Date(Date.parse(g.date) + d * 864e5).toISOString(), g.homeTeamId, g.awayTeamId))));
  const kept = games.filter(g => g.source !== "espn" || !have.has(pairKey(g.date, g.homeTeamId, g.awayTeamId)));
  const replaced = games.length - kept.length;
  const ids = new Set(kept.map(g => String(g.id)));
  const keys = new Set(kept.map(g => pairKey(g.date, g.homeTeamId, g.awayTeamId)));
  const added = [];
  for (const r of espnRows) {
    if (!r) continue;
    const k = pairKey(r.date, r.homeTeamId, r.awayTeamId);
    if (have.has(k)) continue;
    if (keys.has(k)) {
      // Already added on an earlier run: refresh it in place (tip time, status, final score).
      const i = kept.findIndex(g => g.source === "espn" && String(g.id) === r.id);
      if (i >= 0) kept[i] = r;
      continue;
    }
    if (ids.has(r.id)) continue;
    kept.push(r); keys.add(k); ids.add(r.id); added.push(r);
  }
  kept.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  return { games: kept, added, replaced };
}
