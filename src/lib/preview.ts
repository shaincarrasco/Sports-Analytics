// Game preview: a short scouting report for every unplayed game, built only from real fields.
// Pure (no React, no fetching) so every line can be tested.
//
//   summary      one or two sentences: who these teams are and the matchup that decides it
//   form         each team's recent results, and whether it is playing above or below its earlier games
//   nightmares   for each team, the opponent strength that hits its biggest weakness
//   sleeper      the one team being slept on, when the data makes the case (else null, never padded)
//   expect       how the game should look: pace, the headline unit-vs-unit, the shot profile
//   pick         the projection in words, built only when the reader has turned on Projections
//
// Nothing forecast (win chance, margin, projected score) appears unless `projections` is true:
// the site's rule is that nothing forecast shows on a game until the reader asks for it.
import { clashes, type Clash } from "./breakdown";
import { FORM_MIN_GAP } from "./form";
import type { Game, ProfileKey, TeamSummary } from "./types";

export type Side = "a" | "b";
export type Line = { team: Side | null; text: string };
export type FormLine = { team: Side; text: string; trend: "up" | "down" | null };
export type Preview = {
  summary: string;
  form: FormLine[];
  nightmares: Line[];
  sleeper: Line | null;
  expect: string[];
  pick: string | null;
};

// ---------- thresholds (one place, so the words and the rules never drift) ----------
/** A nightmare needs the threatening unit in the top this-many... */
export const NIGHTMARE_MAX_STRONG = 100;
/** ...and the weakness at least this many places worse. Looser than "keys to the game" (170): a nightmare is each team's worst spot, not only a glaring mismatch. */
export const NIGHTMARE_MIN_GAP = 80;
/** Slept on: DHR rank this much better than the AP rank. */
export const SLEEPER_POLL_GAP = 8;
/** Slept on: recent adjusted games this many points per 100 better than earlier ones. */
export const SLEEPER_SURGE = 8;
/** Pace: "fast" = top this-many in adjusted tempo, "slow" = this many from the bottom. */
export const PACE_BAND = 100;
/** Tempo tug-of-war: tempo ranks this far apart. */
export const PACE_GAP = 140;

const no = (r: number) => `No. ${r}`;
/** Possessive that reads right for names ending in s ("St. John's" → "St. John's", "Texas" → "Texas'"). */
export const poss = (name: string) => (/'s$/i.test(name) ? name : /s$/i.test(name) ? `${name}'` : `${name}'s`);
const mean = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const count = (n: number) => words[n] ?? String(n);
const pct = (v: number | null | undefined) => (v == null ? "" : `, ${v.toFixed(1)}%`);

// ---------- recent form ----------
/** Recent adjusted games vs earlier ones (points per 100). null when there aren't enough games to say. */
export function formTrend(perf: number[]): number | null {
  if (perf.length < 5) return null;
  const recent = perf.slice(-3), earlier = perf.slice(0, -3);
  return mean(recent) - mean(earlier);
}

export function formLine(t: TeamSummary, side: Side): FormLine | null {
  const last = t.last ?? [];
  if (!last.length) return null;
  const recent = last.slice(-5);
  const w = recent.filter(x => x.r === "W").length, l = recent.length - w;
  const avg = mean(recent.map(x => x.m));
  const span = recent.length === 1 ? "its only game" : `its last ${count(recent.length)}`;
  const parts: string[] = [];
  parts.push(`${w}–${l} in ${span}, ${avg >= 0 ? "outscoring" : "outscored by"} opponents by ${Math.abs(avg).toFixed(1)} a game`);

  // Streak or the last result.
  let run = 1;
  for (let i = last.length - 2; i >= 0 && last[i].r === last.at(-1)!.r; i--) run++;
  const end = last.at(-1)!;
  if (run >= 3 && run !== recent.length) parts.push(end.r === "W" ? `won ${count(run)} straight` : `lost ${count(run)} straight`);
  else if (run >= 3 && run === recent.length) { /* "5–0 in its last five" already says it */ }
  else if (end.r === "L" && t.l === 1) parts.push(`coming off its first loss, by ${Math.abs(end.m)}`);
  else parts.push(end.r === "W" ? `won by ${end.m} last time out` : `lost by ${Math.abs(end.m)} last time out`);

  const gap = formTrend(t.perf ?? []);
  let trend: FormLine["trend"] = null;
  let tail = "";
  if (gap !== null && Math.abs(gap) >= FORM_MIN_GAP) {
    trend = gap > 0 ? "up" : "down";
    tail = gap > 0
      ? ` Its last three games rate ${gap.toFixed(1)} points per 100 better than its earlier ones, adjusted for opponent and venue.`
      : ` Its last three games rate ${Math.abs(gap).toFixed(1)} points per 100 worse than its earlier ones, adjusted for opponent and venue.`;
  }
  return { team: side, text: `${t.name}: ${parts.join("; ")}.${tail}`, trend };
}

// ---------- matchup nightmares ----------
const STYLE = new Set<ProfileKey>(["threeRate", "paintShare", "fastBreakShare", "astRate", "blkRate", "stlRate", "eff", "ftPct"]);

/** The opponent's offense attacking this team's defense (c = clashes(opp, team), diff > 0). */
function offThreat(c: Clash, opp: string, team: string): string | null {
  switch (c.k) {
    case "efg": return `${opp} shoots it (${no(c.offRank)} in effective FG%${pct(c.offVal)}), and ${poss(team)} defense ranks ${no(c.defRank)} at contesting shots.`;
    case "threePct": return `${opp} makes threes (${no(c.offRank)} in 3-point %${pct(c.offVal)}), and ${team} ranks ${no(c.defRank)} at guarding the arc.`;
    case "twoPct": return `${opp} scores inside (${no(c.offRank)} in 2-point %${pct(c.offVal)}), and ${team} ranks ${no(c.defRank)} at protecting the paint.`;
    case "tov": return `${opp} rarely gives it away (${no(c.offRank)} in turnover rate), and ${team} doesn't force many (${no(c.defRank)}). No cheap points for ${team}.`;
    case "orb": return `${opp} crashes the offensive glass (${no(c.offRank)}${pct(c.offVal)}), and ${team} ranks ${no(c.defRank)} at finishing defensive possessions. Expect second chances.`;
    case "ftr": return `${opp} gets to the line (${no(c.offRank)} in free-throw rate), and ${team} fouls a lot (${no(c.defRank)}). Foul trouble is a real risk.`;
    default: return null;
  }
}
/** The opponent's defense against this team's offense (c = clashes(team, opp), diff < 0). */
function defThreat(c: Clash, opp: string, team: string): string | null {
  switch (c.k) {
    case "efg": return `${opp} defends shots (${no(c.defRank)} in effective FG% allowed), and ${poss(team)} shooting ranks ${no(c.offRank)}${pct(c.offVal)}.`;
    case "threePct": return `${opp} guards the arc (${no(c.defRank)} in 3-point % allowed), and ${team} ranks ${no(c.offRank)} from three${pct(c.offVal)}.`;
    case "twoPct": return `${opp} protects the rim (${no(c.defRank)} in 2-point % allowed), and ${team} ranks ${no(c.offRank)} inside the arc${pct(c.offVal)}.`;
    case "tov": return `${opp} forces turnovers (${no(c.defRank)}), and ${team} is loose with the ball (${no(c.offRank)} in turnover rate${pct(c.offVal)}).`;
    case "orb": return `${opp} ends possessions on the defensive glass (${no(c.defRank)}), and ${team} rarely gets second chances (${no(c.offRank)}).`;
    case "ftr": return `${opp} defends without fouling (${no(c.defRank)}), and ${team} rarely gets to the line (${no(c.offRank)}).`;
    default: return null;
  }
}

/** The single opponent strength that lands on this team's biggest weakness, or null when nothing is lopsided enough. */
export function nightmare(team: TeamSummary, opp: TeamSummary, side: Side): Line | null {
  type Cand = { gap: number; text: string };
  const cands: Cand[] = [];
  for (const c of clashes(opp, team)) {
    if (STYLE.has(c.k) || c.diff <= 0) continue;
    if (c.offRank > NIGHTMARE_MAX_STRONG || c.diff < NIGHTMARE_MIN_GAP) continue;
    const text = offThreat(c, opp.name, team.name);
    if (text) cands.push({ gap: c.diff, text });
  }
  for (const c of clashes(team, opp)) {
    if (STYLE.has(c.k) || c.diff >= 0) continue;
    if (c.defRank > NIGHTMARE_MAX_STRONG || -c.diff < NIGHTMARE_MIN_GAP) continue;
    const text = defThreat(c, opp.name, team.name);
    if (text) cands.push({ gap: -c.diff, text });
  }
  cands.sort((x, y) => y.gap - x.gap);
  return cands[0] ? { team: side, text: cands[0].text } : null;
}

// ---------- slept on ----------
type Case = { score: number; text: string };

function sleeperCase(t: TeamSummary, opp: TeamSummary): Case | null {
  const cases: Case[] = [];
  const r = t.rank;
  if (r != null) {
    if (!t.ap && r <= 25) cases.push({ score: 40 - r, text: `${t.name} isn't in the AP Top 25, but DHR has it ${no(r)} in the country${t.adjDRank && t.adjDRank <= 25 ? `, behind the ${no(t.adjDRank)} defense` : t.adjORank && t.adjORank <= 25 ? `, behind the ${no(t.adjORank)} offense` : ""}.` });
    else if (t.ap && t.ap.rank - r >= SLEEPER_POLL_GAP) cases.push({ score: t.ap.rank - r + 5, text: `The AP poll has ${t.name} at ${no(t.ap.rank)}; DHR has it ${no(r)}. The ratings think the voters are behind.` });
  }
  const gap = formTrend(t.perf ?? []);
  if (gap !== null && gap >= SLEEPER_SURGE) {
    cases.push({ score: gap, text: `${t.name} is better than its record says right now: its last three games rate ${gap.toFixed(1)} points per 100 above its earlier ones, adjusted for opponent and venue.` });
  }
  // The lower-rated side with the single best unit on the floor.
  if (r != null && opp.rank != null && r > opp.rank) {
    const best = (x: TeamSummary) => Math.min(x.adjORank ?? 999, x.adjDRank ?? 999);
    const mine = best(t);
    if (mine <= 15 && mine < best(opp)) {
      const unit = (t.adjDRank ?? 999) <= (t.adjORank ?? 999) ? "defense" : "offense";
      cases.push({ score: 16 - mine, text: `${t.name} is the lower-rated team, but its ${unit} (${no(mine)} nationally) is the best unit in this game.` });
    }
  }
  cases.sort((x, y) => y.score - x.score);
  return cases[0] ?? null;
}

/** The team being slept on, when the data makes the case. Never padded. */
export function sleeper(a: TeamSummary, b: TeamSummary): Line | null {
  const ca = sleeperCase(a, b), cb = sleeperCase(b, a);
  if (!ca && !cb) return null;
  if (ca && (!cb || ca.score >= cb.score)) return { team: "a", text: ca.text };
  return { team: "b", text: cb!.text };
}

// ---------- what to expect (no forecast) ----------
const bestUnit = (t: TeamSummary) => {
  const o = t.adjORank, d = t.adjDRank;
  if (o == null || d == null) return null;
  return d <= o ? { unit: "defense" as const, r: d } : { unit: "offense" as const, r: o };
};

export function expectations(a: TeamSummary, b: TeamSummary, total = 365): string[] {
  const out: string[] = [];
  // Headline: each team's best unit, and what it runs into.
  const ua = bestUnit(a), ub = bestUnit(b);
  if (ua && ub) {
    const other = (t: TeamSummary, unit: "offense" | "defense") => (unit === "offense" ? t.adjDRank : t.adjORank);
    const [lead, opp, u] = ua.r <= ub.r ? [a, b, ua] : [b, a, ub];
    const counter = other(opp, u.unit);
    const counterUnit = u.unit === "offense" ? "defense" : "offense";
    if (counter != null) {
      out.push(counter <= 50
        ? `Strength on strength: ${poss(lead.name)} ${u.unit} (${no(u.r)}) against ${poss(opp.name)} ${counterUnit} (${no(counter)}). Whichever holds up likely decides it.`
        : counter > 150
          ? `The headline unit is ${poss(lead.name)} ${u.unit} (${no(u.r)}), and ${poss(opp.name)} ${counterUnit} ranks only ${no(counter)}. ${opp.name} has to win this some other way.`
          : `The matchup to watch: ${poss(lead.name)} ${u.unit} (${no(u.r)}) against ${poss(opp.name)} ${counterUnit} (${no(counter)}).`);
    }
  }
  // Pace.
  if (a.adjTRank != null && b.adjTRank != null && a.adjT != null && b.adjT != null) {
    const slow = total - PACE_BAND;
    if (a.adjTRank <= PACE_BAND && b.adjTRank <= PACE_BAND) out.push(`Expect a fast game: both teams rank in the top ${PACE_BAND} in pace (${a.adjT.toFixed(1)} and ${b.adjT.toFixed(1)} possessions).`);
    else if (a.adjTRank > slow && b.adjTRank > slow) out.push(`Expect a grind: both teams play slow (${a.adjT.toFixed(1)} and ${b.adjT.toFixed(1)} possessions). Every possession counts more, which tends to keep games close.`);
    else if (Math.abs(a.adjTRank - b.adjTRank) >= PACE_GAP) {
      const [fast, slw] = a.adjTRank < b.adjTRank ? [a, b] : [b, a];
      out.push(`Tempo tug-of-war: ${fast.name} wants to run (${no(fast.adjTRank!)} in pace) and ${slw.name} wants to slow it down (${no(slw.adjTRank!)}). Watch who sets the pace early.`);
    } else out.push(`Pace shouldn't decide this: both teams play near the D-I average.`);
  }
  // Shot profile: a team that lives behind the arc makes for a high-variance night.
  for (const t of [a, b]) {
    const rr = t.offRanks?.threeRate;
    if (rr != null && rr <= 40 && t.off?.threeRate != null) {
      out.push(`${t.name} takes ${t.off.threeRate.toFixed(0)}% of its shots from three (${no(rr)} in D-I). A hot or cold shooting night swings this one.`);
      break;
    }
  }
  return out;
}

// ---------- projection in words (only with Projections on) ----------
export function pickLine(g: Game, a: TeamSummary | null, b: TeamSummary | null): string | null {
  const p = g.pred;
  if (!p) return null;
  const awayName = a?.name ?? g.away.name, homeName = b?.name ?? g.home.name;
  const homeFav = p.margin > 0;
  const fav = homeFav ? homeName : awayName;
  const chance = Math.round((homeFav ? p.wp : 1 - p.wp) * 100);
  const hi = Math.round(Math.max(p.home, p.away)), lo = Math.round(Math.min(p.home, p.away));
  if (Math.abs(p.margin) < 1) return `A true toss-up: about ${hi}–${lo} over ${p.tempo.toFixed(0)} possessions, with neither side above ${Math.max(chance, 100 - chance)}%.`;
  let s = `${fav} by ${Math.abs(p.margin).toFixed(1)} (${chance}% to win), about ${hi}–${lo} over ${p.tempo.toFixed(0)} possessions.`;
  if (g.line && Number.isFinite(g.line.spread)) {
    const lineFavHome = g.line.spread < 0;
    const lf = lineFavHome ? homeName : awayName;
    s += ` The line has ${lf} by ${Math.abs(g.line.spread)}${g.line.total != null ? `, total ${g.line.total}` : ""}.`;
  }
  return s;
}

// ---------- the summary ----------
const recordRank = (t: TeamSummary) => `${t.name} (${t.w}–${t.l}${t.rank != null ? `, DHR ${no(t.rank)}` : ""})`;

export function buildPreview(g: Game, a: TeamSummary | null, b: TeamSummary | null, opts: { projections?: boolean; total?: number } = {}): Preview | null {
  if (!a && !b) return null;
  const form = [a && formLine(a, "a"), b && formLine(b, "b")].filter((x): x is FormLine => !!x);
  const pick = opts.projections ? pickLine(g, a, b) : null;
  if (!a || !b) {
    const t = (a ?? b)!;
    return { summary: `${recordRank(t)} against a non-Division I opponent, so there's no rating comparison for this one.`, form, nightmares: [], sleeper: null, expect: [], pick };
  }
  const nightmares = [nightmare(a, b, "a"), nightmare(b, a, "b")].filter((x): x is Line => !!x);
  const sl = sleeper(a, b);
  const expect = expectations(a, b, opts.total ?? 365);
  const where = g.tournament ? ` in the ${g.tournament.replace(/ - (.+)$/, " ($1)")}` : g.confGame ? " in conference play" : "";
  const lead = `${recordRank(a)} meets ${recordRank(b)}${where}.`;
  const hook = expect[0] ?? nightmares[0]?.text ?? "";
  return { summary: [lead, hook].filter(Boolean).join(" "), form, nightmares, sleeper: sl, expect: expect.slice(1), pick };
}
