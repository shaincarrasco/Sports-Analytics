// Add games the schedule provider hasn't listed yet, from ESPN's scoreboard (today + the next 3
// Eastern days). Runs on every deploy, before merge-espn-finals, so a bracket game that was only
// set last night (e.g. a Thanksgiving tournament's third-place game) is on today's slate, gets a
// projection, and later gets its final score. The next provider refresh replaces these rows with
// official ones (see mergeSchedule).
//
// Input/output: public/data/games-season-2027.json (in place). Reads public/data/team-directory.json.
import { readFile, writeFile } from "node:fs/promises";
import { etDate, mergeSchedule, providerTeamsByEspn, rowFromEspn } from "./lib/espn-schedule.mjs";

const GAMES = "public/data/games-season-2027.json";
const API = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";
const DAYS_AHEAD = 3;

const readJson = async (path, fallback) => { try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; } };
const [payload, directory] = await Promise.all([readJson(GAMES, null), readJson("public/data/team-directory.json", { teams: [] })]);
if (!payload?.games) { console.log("[espn-schedule] No schedule file; nothing to merge."); process.exit(0); }

const teamsByEspn = providerTeamsByEspn(payload.games, directory.teams);
const today = etDate(new Date().toISOString());
const days = Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => new Date(Date.parse(`${today}T12:00:00Z`) + i * 864e5).toISOString().slice(0, 10));

async function scoreboard(day) {
  // groups=50 = all of Division I; limit high enough for the busiest days.
  const url = `${API}?dates=${day.replaceAll("-", "")}&groups=50&limit=500`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "d1-hoops-analytics (github.com/shaincarrasco/Sports-Analytics)" } });
      if (res.ok) return (await res.json())?.events ?? [];
      if (res.status < 500 && res.status !== 429) break;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 800 * attempt));
  }
  console.warn(`[espn-schedule] Scoreboard for ${day} didn't load; skipping that day.`);
  return [];
}

const events = (await Promise.all(days.map(scoreboard))).flat();
// Only rows on the requested Eastern days (ESPN's date filter is close to, not exactly, Eastern).
const rows = events.map(ev => rowFromEspn(ev, teamsByEspn)).filter(r => r && days.includes(etDate(r.date)));
const { games, added, replaced } = mergeSchedule(payload.games, rows);
payload.games = games;
payload.count = games.length;
await writeFile(GAMES, JSON.stringify(payload, null, 2) + "\n");
for (const r of added) console.log(`[espn-schedule] + ${etDate(r.date)} ${r.awayTeam} ${r.neutralSite ? "vs" : "at"} ${r.homeTeam}${r.tournament ? ` (${r.tournament})` : ""}`);
console.log(`[espn-schedule] Added ${added.length} game(s) from ESPN across ${days[0]}…${days.at(-1)}${replaced ? `; ${replaced} earlier ESPN row(s) now listed by the provider` : ""}.`);
