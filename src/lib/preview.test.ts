import { describe, expect, it } from "vitest";
import { buildPreview, expectations, formLine, formTrend, nightmare, pickLine, sleeper } from "./preview";
import { mergeSchedule, pairKey, rowFromEspn } from "../../scripts/lib/espn-schedule.mjs";
import type { Game, GameSide, Profile, TeamSummary } from "./types";

const prof = (o: Partial<Profile> = {}): Profile => ({ eff: null, efg: 50, tov: 17, orb: 30, ftr: 30, threeRate: 38, threePct: 34, twoPct: 52, ftPct: 72, astRate: 50, blkRate: 10, stlRate: 10, paintShare: 45, fastBreakShare: 12, ...o });
const mid = { efg: 180, tov: 180, orb: 180, ftr: 180, threeRate: 180, threePct: 180, twoPct: 180 };

function team(o: Partial<TeamSummary> = {}): TeamSummary {
  return {
    id: "1", slug: "t", name: "Team", short: "T", mascot: null, logo: null, color: null, altColor: null,
    conf: "X", confName: "X", confSlug: "x", w: 5, l: 1, cw: 0, cl: 0, streak: null,
    rank: 40, adjEM: 10, adjO: 112, adjD: 102, adjT: 69, sos: 0, adjORank: 60, adjDRank: 60, adjTRank: 180, sosRank: 100,
    sample: "", ratedGames: 6, off: prof(), def: prof(), offRanks: { ...mid }, defRanks: { ...mid },
    perf: [10, 10, 10, 10, 10], last: [{ r: "W", m: 10 }, { r: "W", m: 5 }, { r: "L", m: -3 }],
    quads: [], close: [0, 0], projW: 0, projL: 0, projCW: 0, projCL: 0, next: null, espnId: null, ats: [0, 0, 0], sim: null, ap: null,
    ...o,
  };
}
const side = (t: TeamSummary): GameSide => ({ id: t.id, slug: t.slug, name: t.name, short: t.short, logo: null, color: null, conf: null, rank: t.rank, adjEM: t.adjEM, record: null, score: null, periods: null });
const game = (a: TeamSummary, b: TeamSummary, o: Partial<Game> = {}): Game => ({
  id: "g", date: "2026-11-27T18:00:00.000Z", status: "scheduled", neutral: true, confGame: false, venue: null, city: null, state: null, tournament: null,
  home: side(b), away: side(a), pred: { wp: 0.407, margin: -2.7, home: 74.3, away: 77, tempo: 73.4 }, watch: null, upset: null, box: null, ...o,
});

describe("recent form", () => {
  it("summarises the last five and the last result", () => {
    const f = formLine(team({ name: "SJU", l: 1, last: [{ r: "W", m: 15 }, { r: "W", m: 39 }, { r: "W", m: 31 }, { r: "W", m: 17 }, { r: "W", m: 47 }, { r: "W", m: 11 }, { r: "L", m: -3 }] }), "a")!;
    expect(f.text).toContain("4–1 in its last five");
    expect(f.text).toContain("coming off its first loss, by 3");
  });
  it("calls a streak of three or more", () => {
    expect(formLine(team({ last: [{ r: "L", m: -1 }, { r: "L", m: -2 }, { r: "W", m: 1 }, { r: "W", m: 2 }, { r: "W", m: 3 }] }), "a")!.text).toContain("won three straight");
    // 5–0 in the last five already says it: no "won five straight" on top.
    expect(formLine(team({ last: Array.from({ length: 5 }, () => ({ r: "W" as const, m: 4 })) }), "a")!.text).not.toContain("straight");
  });
  it("flags a trend only with enough games and a real gap", () => {
    expect(formTrend([1, 2, 3, 4])).toBeNull();
    expect(formTrend([0, 0, 10, 10, 10])).toBeCloseTo(10);
    expect(formLine(team({ perf: [0, 0, 10, 10, 10] }), "a")!.trend).toBe("up");
    expect(formLine(team({ perf: [10, 10, 10, 10, 12] }), "a")!.trend).toBeNull();
  });
});

describe("matchup nightmares", () => {
  it("finds the opponent strength that hits a weakness", () => {
    const victim = team({ name: "Loose", offRanks: { ...mid, tov: 300 } });
    const opp = team({ name: "Pressure", defRanks: { ...mid, tov: 7 } });
    const n = nightmare(victim, opp, "a")!;
    expect(n.team).toBe("a");
    expect(n.text).toContain("Pressure forces turnovers (No. 7)");
  });
  it("returns null when nothing is lopsided", () => {
    expect(nightmare(team(), team(), "a")).toBeNull();
  });
  it("ignores style stats", () => {
    const victim = team({ defRanks: { ...mid, threeRate: 360 } });
    const opp = team({ offRanks: { ...mid, threeRate: 1 } });
    expect(nightmare(victim, opp, "a")).toBeNull();
  });
});

describe("slept on", () => {
  it("names a DHR top-25 team missing from the AP poll", () => {
    const s = sleeper(team({ name: "ISU", rank: 23, ap: null, adjDRank: 5 }), team({ name: "SJU", rank: 13, ap: { rank: 13, prev: 13, pts: 1, fpv: 0 } }))!;
    expect(s.team).toBe("a");
    expect(s.text).toContain("isn't in the AP Top 25");
    expect(s.text).toContain("No. 5 defense");
  });
  it("is null when there is no case", () => {
    expect(sleeper(team({ rank: 120 }), team({ rank: 130 }))).toBeNull();
  });
});

describe("possessives", () => {
  it("reads right for names ending in s", async () => {
    const { poss } = await import("./preview");
    expect(poss("St. John's")).toBe("St. John's");
    expect(poss("Texas")).toBe("Texas'");
    expect(poss("Duke")).toBe("Duke's");
  });
});

describe("what to expect", () => {
  it("always says something about pace when tempo is known", () => {
    expect(expectations(team(), team()).some(t => t.includes("Pace shouldn't decide"))).toBe(true);
    expect(expectations(team({ adjTRank: 10 }), team({ adjTRank: 300 })).some(t => t.startsWith("Tempo tug-of-war"))).toBe(true);
  });
  it("leads with the headline unit matchup", () => {
    const e = expectations(team({ name: "A", adjORank: 19, adjDRank: 18 }), team({ name: "B", adjORank: 80, adjDRank: 5 }));
    expect(e[0]).toContain("B's defense (No. 5)");
  });
});

describe("forecast stays behind the switch", () => {
  const a = team({ name: "SJU", slug: "a" }), b = team({ name: "ISU", slug: "b" });
  it("has no pick without projections", () => {
    expect(buildPreview(game(a, b), a, b)!.pick).toBeNull();
    expect(JSON.stringify(buildPreview(game(a, b), a, b))).not.toMatch(/% to win|projected/i);
  });
  it("writes the pick in words with projections on", () => {
    expect(pickLine(game(a, b), a, b)).toBe("SJU by 2.7 (59% to win), about 77–74 over 73 possessions.");
    expect(buildPreview(game(a, b), a, b, { projections: true })!.pick).toContain("SJU by 2.7");
  });
  it("handles a non-D-I opponent", () => {
    const p = buildPreview(game(a, b), a, null)!;
    expect(p.nightmares).toEqual([]);
    expect(p.summary).toContain("non-Division I");
  });
});

describe("ESPN schedule merge", () => {
  const teams = new Map([["66", { name: "Iowa State", id: 1, conference: "Big 12" }], ["2599", { name: "St. John's", id: 2, conference: "Big East" }]]);
  const ev = {
    id: "401920533", date: "2026-11-27T18:00Z", status: { type: { name: "STATUS_SCHEDULED", state: "pre", completed: false } },
    competitions: [{ neutralSite: true, conferenceCompetition: false, notes: [{ headline: "Players Era 16 - Third Place Game" }], venue: { fullName: "Michelob ULTRA Arena", address: { city: "Las Vegas", state: "NV" } },
      competitors: [{ homeAway: "home", team: { id: "66" }, score: "0" }, { homeAway: "away", team: { id: "2599" }, score: "0" }] }],
  };
  it("maps an ESPN event into a provider-shaped row", () => {
    const r = rowFromEspn(ev, teams)!;
    expect(r).toMatchObject({ id: "401920533", date: "2026-11-27T18:00:00.000Z", homeTeam: "Iowa State", awayTeam: "St. John's", homeTeamId: 1, awayTeamId: 2, neutralSite: true, tournament: "Players Era 16 - Third Place Game", status: "scheduled", homeScore: null, source: "espn" });
  });
  it("skips events with an unmapped team", () => {
    expect(rowFromEspn({ ...ev, competitions: [{ ...ev.competitions[0], competitors: [{ homeAway: "home", team: { id: "999" } }, { homeAway: "away", team: { id: "2599" } }] }] }, teams)).toBeNull();
  });
  it("adds missing games once, and yields to the provider's row later", () => {
    const r = rowFromEspn(ev, teams)!;
    const first = mergeSchedule([], [r]);
    expect(first.added).toHaveLength(1);
    expect(mergeSchedule(first.games, [r]).added).toHaveLength(0);
    const provider = { id: "999", date: "2026-11-27T18:00:00.000Z", homeTeamId: 2, awayTeamId: 1 };
    const later = mergeSchedule([...first.games, provider], [r]);
    expect(later.replaced).toBe(1);
    expect(later.games.map(g => g.id)).toEqual(["999"]);
  });
  it("pairs teams regardless of who is home", () => {
    expect(pairKey("2026-11-27T18:00:00.000Z", 1, 2)).toBe(pairKey("2026-11-27T18:00:00.000Z", 2, 1));
  });
});
