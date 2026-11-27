// Types for espn-schedule.mjs (imported by the site's tests).
export type ProviderTeam = { name: string; id: number | string; conference: string | null };
export type ScheduleRow = { id: string; date: string; homeTeamId: number | string | null; awayTeamId: number | string | null; source?: string; [k: string]: unknown };
export const ALIASES: Record<string, string>;
export function normName(s: unknown): string;
export function etDate(iso: string): string;
export function providerTeamsByEspn(games: unknown[], directoryTeams: unknown[]): Map<string, ProviderTeam>;
export function rowFromEspn(ev: unknown, teamsByEspn: Map<string, ProviderTeam>): ScheduleRow | null;
export function pairKey(date: string, x: unknown, y: unknown): string;
export function mergeSchedule(games: ScheduleRow[], espnRows: (ScheduleRow | null)[]): { games: ScheduleRow[]; added: ScheduleRow[]; replaced: number };
