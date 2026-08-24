// Shared types & helper functions for the Compare tool (player + team comparison).
// Kept self-contained so the comparison feature doesn't disturb existing pages.

export type CompareMode = "season" | "range" | "age" | "career";
export type TeamCompareMode = "season" | "range" | "career";

// ─────────────────────────────────────────────────────────────────────────
// Generic formatting
// ─────────────────────────────────────────────────────────────────────────

export function seasonLabel(id: number | null | undefined): string {
  if (!id) return "—";
  return `${id - 1}–${String(id).slice(-2)}`;
}

export function seasonRangeLabel(from: number, to: number): string {
  if (from === to) return seasonLabel(from);
  return `${seasonLabel(from)} to ${seasonLabel(to)}`;
}

export function formatNum(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString();
}

export function formatDec(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toFixed(decimals);
}

export function formatPct(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(decimals)}%`;
}

// ─────────────────────────────────────────────────────────────────────────
// Age calculation (mirrors PlayerProfile's "age as of Sep 1 of season start")
// ─────────────────────────────────────────────────────────────────────────

export function ageForSeason(dob: string | null | undefined, seasonId: number | null | undefined): number | null {
  if (!dob || !seasonId) return null;
  const startYear = seasonId - 1;
  const ref = new Date(startYear, 8, 1); // September 1
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  return age;
}

export interface AgeOption {
  age: number;
  seasons: number[];
}

/** For a player's available seasons, build a list of { age, seasons[] } so the UI
 *  can only offer ages that actually have data (instead of a free-text number input). */
export function ageOptionsForSeasons(dob: string | null | undefined, allSeasons: number[]): AgeOption[] {
  if (!dob) return [];
  const map = new Map<number, number[]>();
  allSeasons.forEach(sid => {
    const age = ageForSeason(dob, sid);
    if (age === null) return;
    const arr = map.get(age) || [];
    arr.push(sid);
    map.set(age, arr);
  });
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([age, seasons]) => ({ age, seasons: [...seasons].sort((a, b) => a - b) }));
}

// ─────────────────────────────────────────────────────────────────────────
// Competition (league) display ordering — domestic leagues first, then cups,
// then continental, then international. Falls back to alphabetical.
// ─────────────────────────────────────────────────────────────────────────

export const leagueAbbr: Record<string, string> = {
  "British and Irish Quidditch League": "BIQL",
  "National Quidditch Association": "NQA",
  "Ligue Francaise": "LF",
  "Nordiska Ligan": "NL",
  "Eastern European League": "EEL",
  "Australian Quidditch League": "AQL",
  "Nippon Professional Quidditch": "NPQ",
  "Sudaconditch": "SC",
  "African Super League": "ASL",
  "Liga Mexicana": "LM",
  "Banerjee Cup": "BC",
  "Chinese Association Quidditch League": "CAQL",
  "Balkan Championship": "BKC",
  "East African Regional League": "EARL",
  "European Cup": "EC",
  "All-Africa Cup": "AAC",
  "Americas Cup": "AC",
  "Pacific Cup": "PC",
  "Champions League": "CL",
  "Quidditch World Cup": "QWC",
  "Quidditch World Cup Qualification": "QWCQ",
};

export function abbrevLeague(name: string | null | undefined): string {
  if (!name) return "—";
  return leagueAbbr[name] || name;
}

const compOrder: Record<string, number> = {
  "African Super League": 1, "National Quidditch Association": 1, "British and Irish Quidditch League": 1,
  "Ligue Francaise": 1, "Nordiska Ligan": 1, "Eastern European League": 1,
  "Australian Quidditch League": 1, "Nippon Professional Quidditch": 1, "Sudaconditch": 1,
  "Liga Mexicana": 1, "Banerjee Cup": 1, "Chinese Association Quidditch League": 1,
  "Balkan Championship": 1, "East African Regional League": 1,
  "European Cup": 2, "All-Africa Cup": 2, "Americas Cup": 2, "Pacific Cup": 2,
  "Champions League": 3,
  "Quidditch World Cup": 4, "Quidditch World Cup Qualification": 4,
};

export function getCompOrder(name: string | null | undefined): number {
  return compOrder[name || ""] ?? (name ? 5 : 99);
}

export function sortCompetitionNames(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const oa = getCompOrder(a), ob = getCompOrder(b);
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b);
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Player season-stat aggregation (player_season_stats view)
// ─────────────────────────────────────────────────────────────────────────

export interface PlayerSeasonRow {
  SeasonID: number | null;
  LeagueID: number | null;
  LeagueName: string | null;
  TeamID: number | null;
  TeamFullName: string | null;
  Position: string | null;
  Nation: string | null;
  GamesPlayed: number | null;
  MinPlayed: number | null;
  Goals: number | null;
  ShotAtt: number | null;
  ShotScored: number | null;
  PassAtt: number | null;
  PassComp: number | null;
  KeeperSaves: number | null;
  KeeperShotsFaced: number | null;
  KeeperShotsParried: number | null;
  KeeperShotsConceded: number | null;
  KeeperPassAtt: number | null;
  KeeperPassComp: number | null;
  GoldenSnitchCatches: number | null;
  SnitchSpotted: number | null;
  CatchAttempts: number | null;
  BludgersHit: number | null;
  TurnoversForced: number | null;
  TeammatesProtected: number | null;
  BludgerShotsFaced: number | null;
}

export interface PlayerTotals {
  gp: number;
  minutes: number;
  goals: number;
  shotAtt: number;
  shotScored: number;
  shotPct: number | null;
  passAtt: number;
  passComp: number;
  passPct: number | null;
  keeperSaves: number;
  keeperShotsFaced: number;
  savePct: number | null;
  keeperShotsParried: number;
  keeperShotsConceded: number;
  keeperPassAtt: number;
  keeperPassComp: number;
  keeperPassPct: number | null;
  gsc: number;
  snitchSpotted: number;
  catchAttempts: number;
  catchPct: number | null;
  bludgersHit: number;
  turnoversForced: number;
  teammatesProtected: number;
  bludgerShotsFaced: number;
  goalsPerGame: number | null;
  savesPerGame: number | null;
  gscPerGame: number | null;
}

function sumOf(rows: PlayerSeasonRow[], key: keyof PlayerSeasonRow): number {
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}

export function aggregatePlayerRows(rows: PlayerSeasonRow[]): PlayerTotals {
  const gp = sumOf(rows, "GamesPlayed");
  const minutes = sumOf(rows, "MinPlayed");
  const goals = sumOf(rows, "Goals");
  const shotAtt = sumOf(rows, "ShotAtt");
  const shotScored = sumOf(rows, "ShotScored");
  const passAtt = sumOf(rows, "PassAtt");
  const passComp = sumOf(rows, "PassComp");
  const keeperSaves = sumOf(rows, "KeeperSaves");
  const keeperShotsFaced = sumOf(rows, "KeeperShotsFaced");
  const keeperShotsParried = sumOf(rows, "KeeperShotsParried");
  const keeperShotsConceded = sumOf(rows, "KeeperShotsConceded");
  const keeperPassAtt = sumOf(rows, "KeeperPassAtt");
  const keeperPassComp = sumOf(rows, "KeeperPassComp");
  const gsc = sumOf(rows, "GoldenSnitchCatches");
  const snitchSpotted = sumOf(rows, "SnitchSpotted");
  const catchAttempts = sumOf(rows, "CatchAttempts");
  const bludgersHit = sumOf(rows, "BludgersHit");
  const turnoversForced = sumOf(rows, "TurnoversForced");
  const teammatesProtected = sumOf(rows, "TeammatesProtected");
  const bludgerShotsFaced = sumOf(rows, "BludgerShotsFaced");

  return {
    gp, minutes, goals, shotAtt, shotScored,
    shotPct: shotAtt > 0 ? (shotScored / shotAtt) * 100 : null,
    passAtt, passComp,
    passPct: passAtt > 0 ? (passComp / passAtt) * 100 : null,
    keeperSaves, keeperShotsFaced,
    savePct: keeperShotsFaced > 0 ? (keeperSaves / keeperShotsFaced) * 100 : null,
    keeperShotsParried, keeperShotsConceded,
    keeperPassAtt, keeperPassComp,
    keeperPassPct: keeperPassAtt > 0 ? (keeperPassComp / keeperPassAtt) * 100 : null,
    gsc, snitchSpotted, catchAttempts,
    catchPct: catchAttempts > 0 ? (gsc / catchAttempts) * 100 : null,
    bludgersHit, turnoversForced, teammatesProtected, bludgerShotsFaced,
    goalsPerGame: gp > 0 ? goals / gp : null,
    savesPerGame: gp > 0 ? keeperSaves / gp : null,
    gscPerGame: gp > 0 ? gsc / gp : null,
  };
}

export const POSITION_ORDER = ["Chaser", "Keeper", "Seeker", "Beater"];

export function getPositionsInRows(rows: PlayerSeasonRow[]): string[] {
  const set = new Set(rows.map(r => r.Position).filter((p): p is string => !!p));
  return POSITION_ORDER.filter(p => set.has(p)).concat([...set].filter(p => !POSITION_ORDER.includes(p)));
}

export function getTeamsInRows(rows: PlayerSeasonRow[]): string[] {
  return [...new Set(rows.map(r => r.TeamFullName).filter((t): t is string => !!t))];
}

// ─────────────────────────────────────────────────────────────────────────
// Team / results aggregation
// ─────────────────────────────────────────────────────────────────────────

export interface ResultRow {
  MatchID: number;
  HomeTeamID: number | null;
  AwayTeamID: number | null;
  HomeTeamScore: number | null;
  AwayTeamScore: number | null;
  LeagueID: number | null;
  SeasonID: number | null;
  WeekID: number | null;
  IsNeutralSite: number | null;
  SnitchCaughtTime: number | null;
}

export interface TeamRecordTotals {
  gp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  winPct: number | null;
  gfPerGame: number | null;
  gaPerGame: number | null;
}

export function aggregateTeamResults(teamId: number, rows: ResultRow[]): TeamRecordTotals {
  let gp = 0, w = 0, d = 0, l = 0, gf = 0, ga = 0;
  rows.forEach(r => {
    if (r.HomeTeamScore === null || r.AwayTeamScore === null) return;
    const isHome = r.HomeTeamID === teamId;
    const isAway = r.AwayTeamID === teamId;
    if (!isHome && !isAway) return;
    const ts = isHome ? r.HomeTeamScore : r.AwayTeamScore;
    const os = isHome ? r.AwayTeamScore : r.HomeTeamScore;
    gp++;
    gf += ts;
    ga += os;
    if (ts > os) w++;
    else if (ts < os) l++;
    else d++;
  });
  return {
    gp, w, d, l, gf, ga, gd: gf - ga,
    winPct: gp > 0 ? (w / gp) * 100 : null,
    gfPerGame: gp > 0 ? gf / gp : null,
    gaPerGame: gp > 0 ? ga / gp : null,
  };
}

export interface StandingsRow {
  FullName: string | null;
  SeasonID: number | null;
  LeagueID: number | null;
  totalpoints: number | null;
  totalgsc: number | null;
  totalgamesplayed: number | null;
  GoalsFor: number | null;
  GoalsAgainst: number | null;
}

export interface StandingsSummary {
  points: number;
  gsc: number;
  seasonsCovered: number;
}

/** Sum league "points" (and snitch-catch totals) from the standings table for the
 *  given season scope. Standings only exist for table-based competitions (mostly
 *  domestic leagues), so this is reported alongside — not instead of — the
 *  results-derived W/D/L record, which covers every competition type. */
export function sumStandingsPoints(
  rows: StandingsRow[],
  seasonIds: Set<number>,
  leagueId: number | "all"
): StandingsSummary {
  let points = 0, gsc = 0;
  const covered = new Set<number>();
  rows.forEach(r => {
    if (!r.SeasonID || !seasonIds.has(r.SeasonID)) return;
    if (leagueId !== "all" && r.LeagueID !== leagueId) return;
    points += r.totalpoints || 0;
    gsc += r.totalgsc || 0;
    covered.add(r.SeasonID);
  });
  return { points, gsc, seasonsCovered: covered.size };
}

// ─────────────────────────────────────────────────────────────────────────
// Misc
// ─────────────────────────────────────────────────────────────────────────

export function seasonsInRange(allSeasons: number[], from: number, to: number): number[] {
  const lo = Math.min(from, to), hi = Math.max(from, to);
  return allSeasons.filter(s => s >= lo && s <= hi);
}

export const SLOT_COLORS = [
  { text: "text-blue-600 dark:text-blue-400", border: "border-t-blue-500", dot: "bg-blue-500", bg: "bg-blue-500/10" },
  { text: "text-red-600 dark:text-red-400", border: "border-t-red-500", dot: "bg-red-500", bg: "bg-red-500/10" },
  { text: "text-emerald-600 dark:text-emerald-400", border: "border-t-emerald-500", dot: "bg-emerald-500", bg: "bg-emerald-500/10" },
  { text: "text-amber-600 dark:text-amber-400", border: "border-t-amber-500", dot: "bg-amber-500", bg: "bg-amber-500/10" },
];
