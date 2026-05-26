import { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { SiteFooter } from "@/components/SiteFooter";
import { cachedQuery } from "@/lib/queryCache";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CareerRow {
  PlayerID: number | null;
  PlayerName: string | null;
  Position: string | null;
  Nation: string | null;
  FullName: string | null;        // most recent team
  LeagueName: string | null;
  LatestSeason: number;
  GP: number; MIN: number;
  G: number; GSC: number; KS: number; KSF: number;
  BH: number; TF: number; TP: number;
  ShotAtt: number; ShotScored: number;
  PassAtt: number; PassComp: number;
  KPassAtt: number; KPassComp: number;
  isIntl: boolean;
}

interface SeasonRow extends Omit<CareerRow, "LatestSeason"> {
  SeasonID: number;
}

interface LeagueInfo {
  LeagueID: number;
  LeagueName: string | null;
  LeagueTier: number | null;
}

// ─── Stat Definitions ────────────────────────────────────────────────────────

type StatCat =
  "GP" | "G" | "G_GP" | "SH_PCT" | "PASS_PCT_C" | "MIN_G"
  | "GSC" | "GSC_GP" | "MIN_GSC"
  | "KSF" | "KS" | "SV_PCT" | "KS_GP" | "PASS_PCT_K"
  | "BH" | "BH_GP" | "TF" | "TF_GP" | "TP" | "TP_GP";

type RegType = "career" | "active" | "season" | "progressive" | "yearly" | "yby";

const STATS: {
  key: StatCat; label: string; abbr: string; higher: boolean;
  minGP?: number; requirePos?: string;
}[] = [
  { key: "GP",         label: "Games Played",              abbr: "GP",    higher: true },
  { key: "G",          label: "Goals",                     abbr: "G",     higher: true,  requirePos: "Chaser" },
  { key: "G_GP",       label: "Goals per Game",            abbr: "G/GP",  higher: true,  minGP: 10, requirePos: "Chaser" },
  { key: "SH_PCT",     label: "Shooting %",                abbr: "SH%",   higher: true,  minGP: 10, requirePos: "Chaser" },
  { key: "PASS_PCT_C", label: "Pass % (Chaser)",           abbr: "PASS%", higher: true,  minGP: 10, requirePos: "Chaser" },
  { key: "MIN_G",      label: "Minutes per Goal",          abbr: "MIN/G", higher: false, minGP: 10, requirePos: "Chaser" },
  { key: "GSC",        label: "Snitch Catches",            abbr: "GSC",   higher: true,  requirePos: "Seeker" },
  { key: "GSC_GP",     label: "Snitch Catches per Game",   abbr: "GSC/GP",higher: true,  minGP: 10, requirePos: "Seeker" },
  { key: "MIN_GSC",    label: "Minutes per Snitch",        abbr: "MIN/GSC",higher: false,minGP: 10, requirePos: "Seeker" },
  { key: "KSF",        label: "Shots Faced",               abbr: "SF",    higher: true,  requirePos: "Keeper" },
  { key: "KS",         label: "Saves",                     abbr: "SV",    higher: true,  requirePos: "Keeper" },
  { key: "SV_PCT",     label: "Save %",                    abbr: "SV%",   higher: true,  minGP: 10, requirePos: "Keeper" },
  { key: "KS_GP",      label: "Saves per Game",            abbr: "SV/GP", higher: true,  minGP: 10, requirePos: "Keeper" },
  { key: "PASS_PCT_K", label: "Pass % (Keeper)",           abbr: "KP%",   higher: true,  minGP: 10, requirePos: "Keeper" },
  { key: "BH",         label: "Bludgers Hit",              abbr: "BH",    higher: true,  requirePos: "Beater" },
  { key: "BH_GP",      label: "Bludgers Hit per Game",     abbr: "BH/GP", higher: true,  minGP: 10, requirePos: "Beater" },
  { key: "TF",         label: "Turnovers Forced",          abbr: "TF",    higher: true,  requirePos: "Beater" },
  { key: "TF_GP",      label: "Turnovers Forced / Game",   abbr: "TF/GP", higher: true,  minGP: 10, requirePos: "Beater" },
  { key: "TP",         label: "Teammates Protected",       abbr: "TP",    higher: true,  requirePos: "Beater" },
  { key: "TP_GP",      label: "Teammates Protected / Game",abbr: "TP/GP", higher: true,  minGP: 10, requirePos: "Beater" },
];

const REGS: { key: RegType; label: string }[] = [
  { key: "career",      label: "Career" },
  { key: "active",      label: "Active" },
  { key: "season",      label: "Single Season" },
  { key: "progressive", label: "Progressive" },
  { key: "yearly",      label: "Yearly League" },
  { key: "yby",         label: "Year-by-Year" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function seasonLabel(id: number) { return `${id - 1}–${String(id).slice(-2)}`; }

function val(row: any, cat: StatCat): number | null {
  const g = row.GP || 0, mn = row.MIN || 0;
  const goals = row.G || 0, gsc = row.GSC || 0, ks = row.KS || 0, ksf = row.KSF || 0;
  const bh = row.BH || 0, tf = row.TF || 0, tp = row.TP || 0;
  const sa = row.ShotAtt || 0, ss = row.ShotScored || 0;
  const pa = row.PassAtt || 0, pc = row.PassComp || 0;
  const kpa = row.KPassAtt || 0, kpc = row.KPassComp || 0;
  const minGP = STATS.find(s => s.key === cat)?.minGP ?? 0;
  if (g < minGP) return null;
  switch (cat) {
    case "GP":       return g > 0 ? g : null;
    case "G":        return goals > 0 ? goals : null;
    case "G_GP":     return g > 0 && goals > 0 ? goals / g : null;
    case "SH_PCT":   return sa > 0 ? ss / sa : null;
    case "PASS_PCT_C": return pa > 0 ? pc / pa : null;
    case "MIN_G":    return goals > 0 && mn > 0 ? mn / goals : null;
    case "GSC":      return gsc > 0 ? gsc : null;
    case "GSC_GP":   return g > 0 && gsc > 0 ? gsc / g : null;
    case "MIN_GSC":  return gsc > 0 && mn > 0 ? mn / gsc : null;
    case "KSF":      return ksf > 0 ? ksf : null;
    case "KS":       return ks > 0 ? ks : null;
    case "SV_PCT":   return ksf > 0 ? ks / ksf : null;
    case "KS_GP":    return g > 0 && ks > 0 ? ks / g : null;
    case "PASS_PCT_K": return kpa > 0 ? kpc / kpa : null;
    case "BH":       return bh > 0 ? bh : null;
    case "BH_GP":    return g > 0 && bh > 0 ? bh / g : null;
    case "TF":       return tf > 0 ? tf : null;
    case "TF_GP":    return g > 0 && tf > 0 ? tf / g : null;
    case "TP":       return tp > 0 ? tp : null;
    case "TP_GP":    return g > 0 && tp > 0 ? tp / g : null;
  }
}

function fmt(v: number | null, cat: StatCat): string {
  if (v === null) return "—";
  if (["SV_PCT","SH_PCT","PASS_PCT_C","PASS_PCT_K"].includes(cat)) return (v * 100).toFixed(1) + "%";
  if (["GSC_GP","SV_PCT","MIN_G","MIN_GSC","KS_GP","G_GP","BH_GP","TF_GP","TP_GP"].includes(cat)) return v.toFixed(2);
  return String(Math.round(v));
}

// ─── DB fetch: server-side aggregation via PostgREST ─────────────────────────
// Uses PostgREST aggregate functions (sum, max) so the DB does the grouping —
// returns one row per player+position, not one row per season.
// Payload: ~2-5k rows instead of tens of thousands.

const AGG_SELECT = [
  "PlayerID", "PlayerName", "Position", "Nation",
  "TeamFullName.max()", "LeagueName.max()", "SeasonID.max()",
  "GamesPlayed.sum()", "MinPlayed.sum()",
  "Goals.sum()", "GoldenSnitchCatches.sum()",
  "KeeperSaves.sum()", "KeeperShotsFaced.sum()",
  "BludgersHit.sum()", "TurnoversForced.sum()", "TeammatesProtected.sum()",
  "ShotAtt.sum()", "ShotScored.sum()",
  "PassAtt.sum()", "PassComp.sum()",
  "KeeperPassAtt.sum()", "KeeperPassComp.sum()",
].join(",");

// For single-season or active (recent seasons): fetch per-season rows (no aggregation)
// but filtered to just those seasons — still small payload.
const SEASON_SELECT = [
  "PlayerID", "PlayerName", "Position", "Nation",
  "TeamFullName", "LeagueName", "SeasonID",
  "GamesPlayed", "MinPlayed", "Goals", "GoldenSnitchCatches",
  "KeeperSaves", "KeeperShotsFaced",
  "BludgersHit", "TurnoversForced", "TeammatesProtected",
  "ShotAtt", "ShotScored", "PassAtt", "PassComp",
  "KeeperPassAtt", "KeeperPassComp",
].join(",");

function mapAggRow(r: any, intlNames: Set<string>): CareerRow {
  // PostgREST returns aggregate columns as e.g. "Goals.sum()" → key is "Goals.sum()"
  // but supabase-js v2 strips the suffix and returns them as the base column name
  // Actually with supabase-js the key comes back as the expression — let's handle both
  const g = (r["GamesPlayed"] ?? r["GamesPlayed.sum()"] ?? 0) as number;
  const ln = (r["LeagueName"] ?? r["LeagueName.max()"] ?? null) as string | null;
  const fn = (r["TeamFullName"] ?? r["TeamFullName.max()"] ?? null) as string | null;
  const ls = (r["SeasonID"] ?? r["SeasonID.max()"] ?? 0) as number;
  return {
    PlayerID: r.PlayerID,
    PlayerName: r.PlayerName,
    Position: r.Position,
    Nation: r.Nation,
    FullName: fn,
    LeagueName: ln,
    LatestSeason: ls,
    GP:  g,
    MIN: (r["MinPlayed"] ?? r["MinPlayed.sum()"] ?? 0) as number,
    G:   (r["Goals"] ?? r["Goals.sum()"] ?? 0) as number,
    GSC: (r["GoldenSnitchCatches"] ?? r["GoldenSnitchCatches.sum()"] ?? 0) as number,
    KS:  (r["KeeperSaves"] ?? r["KeeperSaves.sum()"] ?? 0) as number,
    KSF: (r["KeeperShotsFaced"] ?? r["KeeperShotsFaced.sum()"] ?? 0) as number,
    BH:  (r["BludgersHit"] ?? r["BludgersHit.sum()"] ?? 0) as number,
    TF:  (r["TurnoversForced"] ?? r["TurnoversForced.sum()"] ?? 0) as number,
    TP:  (r["TeammatesProtected"] ?? r["TeammatesProtected.sum()"] ?? 0) as number,
    ShotAtt:  (r["ShotAtt"] ?? r["ShotAtt.sum()"] ?? 0) as number,
    ShotScored:(r["ShotScored"] ?? r["ShotScored.sum()"] ?? 0) as number,
    PassAtt:  (r["PassAtt"] ?? r["PassAtt.sum()"] ?? 0) as number,
    PassComp: (r["PassComp"] ?? r["PassComp.sum()"] ?? 0) as number,
    KPassAtt: (r["KeeperPassAtt"] ?? r["KeeperPassAtt.sum()"] ?? 0) as number,
    KPassComp:(r["KeeperPassComp"] ?? r["KeeperPassComp.sum()"] ?? 0) as number,
    isIntl: intlNames.has(ln || ""),
  };
}

function mapSeasonRow(r: any, intlNames: Set<string>): SeasonRow {
  return {
    PlayerID: r.PlayerID, PlayerName: r.PlayerName, Position: r.Position,
    Nation: r.Nation, FullName: r.TeamFullName, LeagueName: r.LeagueName,
    SeasonID: r.SeasonID,
    GP: r.GamesPlayed || 0, MIN: r.MinPlayed || 0,
    G: r.Goals || 0, GSC: r.GoldenSnitchCatches || 0,
    KS: r.KeeperSaves || 0, KSF: r.KeeperShotsFaced || 0,
    BH: r.BludgersHit || 0, TF: r.TurnoversForced || 0, TP: r.TeammatesProtected || 0,
    ShotAtt: r.ShotAtt || 0, ShotScored: r.ShotScored || 0,
    PassAtt: r.PassAtt || 0, PassComp: r.PassComp || 0,
    KPassAtt: r.KeeperPassAtt || 0, KPassComp: r.KeeperPassComp || 0,
    isIntl: intlNames.has(r.LeagueName || ""),
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LeadersIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const scope    = (searchParams.get("scope") as "club" | "intl") || "club";
  const stat     = (searchParams.get("stat")  as StatCat) || "G";
  const register = (searchParams.get("reg")   as RegType) || "career";

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const [careerRows, setCareerRows]   = useState<CareerRow[]>([]);
  const [seasonRows, setSeasonRows]   = useState<SeasonRow[]>([]);
  const [leagues, setLeagues]         = useState<LeagueInfo[]>([]);
  const [intlNames, setIntlNames]     = useState<Set<string>>(new Set());
  const [lgIdByName, setLgIdByName]   = useState<Map<string, number>>(new Map());
  const [careerLoading, setCareerLoading] = useState(true);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [seasonLoaded,  setSeasonLoaded]  = useState(false);
  const [careerError, setCareerError] = useState<string | null>(null);

  // ── Load leagues once (tiny query) ──────────────────────────────────────────
  useEffect(() => {
    supabase.from("leagues").select("LeagueID, LeagueName, LeagueTier")
      .then(({ data }) => {
        if (!data) return;
        setLeagues(data as LeagueInfo[]);
        const intl = new Set<string>();
        const lim  = new Map<string, number>();
        (data as LeagueInfo[]).forEach(l => {
          if (l.LeagueName && l.LeagueID) {
            lim.set(l.LeagueName, l.LeagueID);
            if (l.LeagueTier === 0) intl.add(l.LeagueName);
          }
        });
        setIntlNames(intl);
        setLgIdByName(lim);
      });
  }, []);

  // ── Load career totals via server-side aggregation ──────────────────────────
  // PostgREST runs GROUP BY PlayerID, PlayerName, Position, Nation on the DB.
  // Returns ~2-5k rows (one per player+position) instead of 50k+ raw rows.
  useEffect(() => {
    if (intlNames.size === 0 && leagues.length === 0) return; // wait for leagues
    setCareerLoading(true);
    setCareerError(null);

    cachedQuery("leaders:career:client-agg-v1", async () => {
      // PostgREST aggregate functions are disabled on this project — fetch raw
      // per-season rows (paginated) and aggregate client-side.
      const PAGE = 1000;
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("player_season_stats")
          .select(SEASON_SELECT)
          .order("SeasonID", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return all;
    }).then(data => {
      // Group by PlayerID + Position, sum stats, take latest season's team/league
      const groups = new Map<string, any>();
      for (const r of data as any[]) {
        const key = `${r.PlayerID}||${r.Position}`;
        let g = groups.get(key);
        if (!g) {
          g = { PlayerID: r.PlayerID, PlayerName: r.PlayerName, Position: r.Position,
                Nation: r.Nation, _latestSeason: -1, TeamFullName: null, LeagueName: null,
                SeasonID: 0, GamesPlayed: 0, MinPlayed: 0, Goals: 0, GoldenSnitchCatches: 0,
                KeeperSaves: 0, KeeperShotsFaced: 0, BludgersHit: 0, TurnoversForced: 0,
                TeammatesProtected: 0, ShotAtt: 0, ShotScored: 0, PassAtt: 0, PassComp: 0,
                KeeperPassAtt: 0, KeeperPassComp: 0 };
          groups.set(key, g);
        }
        const sid = r.SeasonID || 0;
        if (sid > g._latestSeason) {
          g._latestSeason = sid;
          g.SeasonID = sid;
          g.TeamFullName = r.TeamFullName ?? g.TeamFullName;
          g.LeagueName = r.LeagueName ?? g.LeagueName;
        }
        g.GamesPlayed        += r.GamesPlayed || 0;
        g.MinPlayed          += r.MinPlayed || 0;
        g.Goals              += r.Goals || 0;
        g.GoldenSnitchCatches+= r.GoldenSnitchCatches || 0;
        g.KeeperSaves        += r.KeeperSaves || 0;
        g.KeeperShotsFaced   += r.KeeperShotsFaced || 0;
        g.BludgersHit        += r.BludgersHit || 0;
        g.TurnoversForced    += r.TurnoversForced || 0;
        g.TeammatesProtected += r.TeammatesProtected || 0;
        g.ShotAtt            += r.ShotAtt || 0;
        g.ShotScored         += r.ShotScored || 0;
        g.PassAtt            += r.PassAtt || 0;
        g.PassComp           += r.PassComp || 0;
        g.KeeperPassAtt      += r.KeeperPassAtt || 0;
        g.KeeperPassComp     += r.KeeperPassComp || 0;
      }
      const rows = Array.from(groups.values()).map(r => mapAggRow(r, intlNames));
      setCareerRows(rows);
      setCareerLoading(false);
    }).catch(err => {
      console.error("Career leaders error:", err);
      setCareerError("Failed to load career data. Please refresh.");
      setCareerLoading(false);
    });
  }, [intlNames, leagues.length]);

  // ── Lazy-load per-season rows only when a season-based register is selected ──
  // This runs a FILTERED query — only fetches a few seasons of data, not all time.
  const loadSeasonRows = useCallback(async () => {
    if (seasonLoaded || seasonLoading) return;
    setSeasonLoading(true);
    try {
      const rows = await cachedQuery("leaders:seasons:mat-v1", async () => {
        // Fetch all season rows — but only the columns we need
        // These are already filtered per-season (no aggregation) so each row is small
        const PAGE = 1000;
        const all: any[] = [];
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from("player_season_stats")
            .select(SEASON_SELECT)
            .range(from, from + PAGE - 1)
            .order("SeasonID", { ascending: false });
          if (error) throw new Error(error.message);
          if (!data || data.length === 0) break;
          all.push(...data);
          if (data.length < PAGE) break;
          from += PAGE;
        }
        return all;
      });
      const mapped = (rows as any[]).map(r => mapSeasonRow(r, intlNames));
      setSeasonRows(mapped);
      setSeasonLoaded(true);
    } catch (err) {
      console.error("Season rows error:", err);
    } finally {
      setSeasonLoading(false);
    }
  }, [seasonLoaded, seasonLoading, intlNames]);

  useEffect(() => {
    if (["season", "progressive", "yearly", "yby"].includes(register)) {
      loadSeasonRows();
    }
  }, [register, loadSeasonRows]);

  // ── Filtered views ───────────────────────────────────────────────────────────
  const filteredCareer = useMemo(() =>
    careerRows.filter(r => scope === "club" ? !r.isIntl : r.isIntl),
    [careerRows, scope]
  );
  // Classify each player by their career-level scope (matches the Career tab logic)
  // so per-season tabs (progressive, season, yearly) include the same totals.
  const playerScope = useMemo(() => {
    const m = new Map<string, boolean>(); // key: PlayerID||Position → isIntl
    careerRows.forEach(r => {
      m.set(`${r.PlayerID}||${r.Position}`, r.isIntl);
    });
    return m;
  }, [careerRows]);
  const filteredSeason = useMemo(() =>
    seasonRows.filter(r => {
      const isIntl = playerScope.get(`${r.PlayerID}||${r.Position}`);
      if (isIntl === undefined) return scope === "club" ? !r.isIntl : r.isIntl;
      return scope === "club" ? !isIntl : isIntl;
    }),
    [seasonRows, scope, playerScope]
  );
  const maxSeason = useMemo(() =>
    filteredCareer.reduce((m, r) => Math.max(m, r.LatestSeason || 0), 0),
    [filteredCareer]
  );

  // ── Leaderboard computation ──────────────────────────────────────────────────
  const statInfo   = STATS.find(s => s.key === stat)!;
  const reqPos     = statInfo.requirePos;
  const higherBetter = statInfo.higher;
  const sortFn = (a: any, b: any) => {
    const va = val(a, stat), vb = val(b, stat);
    if (va === null && vb === null) return 0;
    if (va === null) return 1; if (vb === null) return -1;
    return higherBetter ? vb - va : va - vb;
  };
  const filterValid = (r: any) =>
    val(r, stat) !== null && (!reqPos || r.Position === reqPos);

  const leaderboard = useMemo(() => {
    if (register === "career") {
      return filteredCareer.filter(filterValid).sort(sortFn).slice(0, 25)
        .map(r => ({ ...r, statVal: val(r, stat), season: null }));
    }
    if (register === "active") {
      const recentSeasons = [...new Set(filteredCareer.map(r => r.LatestSeason))]
        .sort((a,b) => b - a).slice(0, 2);
      const minSeason = recentSeasons[recentSeasons.length - 1] ?? maxSeason;
      return filteredCareer
        .filter(r => r.LatestSeason >= minSeason && filterValid(r))
        .sort(sortFn).slice(0, 25)
        .map(r => ({ ...r, statVal: val(r, stat), season: null }));
    }
    if (register === "season" && seasonLoaded) {
      return filteredSeason.filter(filterValid).sort(sortFn).slice(0, 25)
        .map(r => ({ ...r, statVal: val(r, stat) }));
    }
    if (register === "progressive" && seasonLoaded) {
      const cum = new Map<string, any>();
      const results: any[] = [];
      const seasons = [...new Set(filteredSeason.map(r => r.SeasonID))].sort((a,b) => a-b);
      seasons.forEach(sid => {
        filteredSeason.filter(r => r.SeasonID === sid).forEach(r => {
          const key = `${r.PlayerID ?? r.PlayerName}||${r.Position}`;
          const c = cum.get(key) || { ...r, GP:0,G:0,GSC:0,KS:0,KSF:0,BH:0,TF:0,TP:0,MIN:0,ShotAtt:0,ShotScored:0,PassAtt:0,PassComp:0,KPassAtt:0,KPassComp:0 };
          c.GP+=r.GP; c.G+=r.G; c.GSC+=r.GSC; c.KS+=r.KS; c.KSF+=r.KSF;
          c.BH+=r.BH; c.TF+=r.TF; c.TP+=r.TP; c.MIN+=r.MIN;
          c.ShotAtt+=r.ShotAtt; c.ShotScored+=r.ShotScored;
          c.PassAtt+=r.PassAtt; c.PassComp+=r.PassComp;
          c.KPassAtt+=r.KPassAtt; c.KPassComp+=r.KPassComp;
          c.FullName=r.FullName ?? (r as any).TeamFullName; c.LeagueName=r.LeagueName;
          cum.set(key, c);
        });
        const snap = [...cum.values()].filter(filterValid).sort(sortFn);
        if (!snap.length) return;
        const topVal = val(snap[0], stat);
        const leaders = snap.filter(r => val(r, stat) === topVal);
        results.push({ ...leaders[0], _leaders: leaders, _isTie: leaders.length > 1,
          PlayerName: leaders.map(l => l.PlayerName).join(" / "),
          statVal: topVal, SeasonID: sid });
      });
      return results;
    }
    return [];
  }, [filteredCareer, filteredSeason, stat, register, seasonLoaded, maxSeason, scope]);

  const yearlyData = useMemo(() => {
    if (!["yearly","yby"].includes(register) || !seasonLoaded) return [];
    const sortFnLocal = sortFn;
    const filterValidLocal = filterValid;

    if (register === "yearly") {
      const groups = new Map<string, SeasonRow[]>();
      filteredSeason.forEach(r => {
        const k = `${r.SeasonID}||${r.LeagueName}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(r);
      });
      const results: any[] = [];
      groups.forEach((rows, key) => {
        const [sidStr, league] = key.split("||");
        const valid = rows.filter(filterValidLocal).sort(sortFnLocal);
        if (!valid.length) return;
        const topVal = val(valid[0], stat);
        const leaders = valid.filter(r => val(r, stat) === topVal);
        results.push({ seasonID: parseInt(sidStr), league,
          entry: { ...leaders[0], _leaders: leaders, _isTie: leaders.length>1,
            PlayerName: leaders.map(l=>l.PlayerName).join(" / "),
            statVal: topVal, season: parseInt(sidStr) }});
      });
      return results.sort((a,b) => a.seasonID-b.seasonID || a.league.localeCompare(b.league));
    }
    // yby
    const groups2 = new Map<number, SeasonRow[]>();
    filteredSeason.forEach(r => {
      if (!groups2.has(r.SeasonID)) groups2.set(r.SeasonID, []);
      groups2.get(r.SeasonID)!.push(r);
    });
    const results2: any[] = [];
    groups2.forEach((rows, sid) => {
      const valid = rows.filter(filterValidLocal).sort(sortFnLocal);
      if (!valid.length) return;
      const topVal = val(valid[0], stat);
      const leaders = valid.filter(r => val(r, stat) === topVal);
      results2.push({ seasonID: sid, league: "",
        entry: { ...leaders[0], _leaders: leaders, _isTie: leaders.length>1,
          PlayerName: leaders.map(l=>l.PlayerName).join(" / "),
          statVal: topVal, season: sid }});
    });
    return results2.sort((a,b) => a.seasonID-b.seasonID);
  }, [filteredSeason, stat, register, seasonLoaded, scope]);

  // ── Rendering ────────────────────────────────────────────────────────────────
  const showSeason = ["season","progressive","yearly","yby"].includes(register);
  const loading = careerLoading || (showSeason && seasonLoading);

  const PlayerLink = ({ name, pid }: { name: string; pid?: number | null }) =>
    pid ? <Link to={`/player/${pid}`} className="text-accent hover:underline">{name}</Link>
        : <span className="text-foreground">{name}</span>;

  const thCls = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

  const renderRow = (entry: any, i: number) => {
    const lid = entry.LeagueName ? lgIdByName.get(entry.LeagueName) : null;
    return (
      <tr key={`${entry.PlayerName}-${i}`}
        className={`border-t border-border ${i%2===1?"bg-table-stripe":"bg-card"} hover:bg-highlight/20 transition-colors`}>
        <td className="px-3 py-1.5 font-mono text-muted-foreground text-sm w-8">{i+1}</td>
        <td className="px-3 py-1.5 font-medium">
          {entry._isTie
            ? <span>{(entry._leaders as any[]).map((l:any,li:number)=>(
                <span key={li}>{li>0&&" / "}<PlayerLink name={l.PlayerName} pid={l.PlayerID}/></span>
              ))}<span className="text-muted-foreground text-xs ml-1">(tie)</span></span>
            : <PlayerLink name={entry.PlayerName} pid={entry.PlayerID}/>}
        </td>
        <td className="px-3 py-1.5 text-muted-foreground text-xs">{entry.Position||"—"}</td>
        <td className="px-3 py-1.5 text-xs">
          {entry.FullName
            ? <Link to={`/team/${encodeURIComponent(entry.FullName)}`} className="text-accent hover:underline">{entry.FullName}</Link>
            : "—"}
        </td>
        {showSeason && (
          <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
            {entry.SeasonID
              ? lid
                ? <Link to={`/league/${lid}/history`} className="text-accent hover:underline">{seasonLabel(entry.SeasonID)}</Link>
                : seasonLabel(entry.SeasonID)
              : "—"}
          </td>
        )}
        <td className="px-3 py-1.5 text-right font-mono font-bold">{fmt(entry.statVal, stat)}</td>
      </tr>
    );
  };

  const Skeleton = () => (
    <div className="bg-card">
      {[...Array(15)].map((_,i) => (
        <div key={i} className={`border-t border-border px-3 py-2.5 flex gap-4 animate-pulse ${i%2===1?"bg-table-stripe":""}`}>
          <div className="w-5 h-3 bg-secondary rounded shrink-0"/>
          <div className="h-3 bg-secondary rounded" style={{width:`${35+(i*19)%40}%`}}/>
          <div className="h-3 bg-secondary rounded w-12 ml-auto"/>
          <div className="h-3 bg-secondary rounded w-16"/>
        </div>
      ))}
    </div>
  );

  const renderTable = (rows: any[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm font-sans">
        <thead><tr className="bg-secondary">
          <th className={`${thCls} text-left w-8`}>#</th>
          <th className={`${thCls} text-left`}>Player</th>
          <th className={`${thCls} text-left`}>Pos</th>
          <th className={`${thCls} text-left`}>Team</th>
          {showSeason && <th className={`${thCls} text-left`}>Season</th>}
          <th className={`${thCls} text-right`}>{statInfo.abbr}</th>
        </tr></thead>
        <tbody>
          {rows.map((r,i) => renderRow(r,i))}
          {rows.length===0 && (
            <tr><td colSpan={showSeason?6:5} className="px-3 py-8 text-center text-muted-foreground italic">
              {seasonLoading ? "Loading season data…" : "No data available."}
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderYearly = () => (
    yearlyData.length === 0
      ? <p className="text-muted-foreground font-sans py-8 text-center italic px-3">
          {seasonLoading ? "Loading season data…" : "No data available."}
        </p>
      : <div className="overflow-x-auto"><table className="w-full text-sm font-sans">
          <thead><tr className="bg-secondary">
            <th className={`${thCls} text-left`}>Season</th>
            {register==="yearly" && <th className={`${thCls} text-left`}>League</th>}
            <th className={`${thCls} text-left`}>Player</th>
            <th className={`${thCls} text-left`}>Pos</th>
            <th className={`${thCls} text-left`}>Team</th>
            <th className={`${thCls} text-right`}>{statInfo.abbr}</th>
          </tr></thead>
          <tbody>{yearlyData.map((g,i) => {
            const e = g.entry;
            const lid = g.league ? lgIdByName.get(g.league) : null;
            return (
              <tr key={`${g.seasonID}-${g.league}-${i}`}
                className={`border-t border-border ${i%2===1?"bg-table-stripe":"bg-card"} hover:bg-highlight/20`}>
                <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                  {lid ? <Link to={`/league/${lid}/history`} className="text-accent hover:underline">{seasonLabel(g.seasonID)}</Link> : seasonLabel(g.seasonID)}
                </td>
                {register==="yearly" && <td className="px-3 py-1.5 text-xs text-muted-foreground">
                  {lid ? <Link to={`/league/${lid}`} className="hover:underline hover:text-accent">{g.league}</Link> : g.league}
                </td>}
                <td className="px-3 py-1.5 font-medium">
                  {e._isTie
                    ? <span>{(e._leaders as any[]).map((l:any,li:number)=>(
                        <span key={li}>{li>0&&" / "}<PlayerLink name={l.PlayerName} pid={l.PlayerID}/></span>
                      ))}<span className="text-muted-foreground text-xs ml-1">(tie)</span></span>
                    : <PlayerLink name={e.PlayerName} pid={e.PlayerID}/>}
                </td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">{e.Position}</td>
                <td className="px-3 py-1.5 text-xs">
                  {e.FullName ? <Link to={`/team/${encodeURIComponent(e.FullName)}`} className="text-accent hover:underline">{e.FullName}</Link> : "—"}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold">{fmt(e.statVal, stat)}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col pb-14 md:pb-0">
      <SiteHeader/>
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-2">
          <h1 className="font-display text-3xl font-bold text-foreground">Statistical Leaders</h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">All-time records and seasonal leaderboards</p>
        </div>

        {/* Scope */}
        <div className="flex gap-2 mb-4">
          {(["club","intl"] as const).map(s => (
            <button key={s} onClick={() => setParam("scope", s)}
              className={`px-4 py-2 text-sm font-sans font-medium rounded transition-colors ${scope===s?"bg-primary text-primary-foreground":"bg-secondary text-muted-foreground hover:text-foreground"}`}>
              {s==="club" ? "Club Stats" : "International Stats"}
            </button>
          ))}
        </div>

        {/* Register tabs */}
        <div className="flex gap-0 mb-4 border-b border-border overflow-x-auto scrollbar-hide">
          {REGS.map(r => (
            <button key={r.key} onClick={() => setParam("reg", r.key)}
              className={`px-3 py-2 text-sm font-sans font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${register===r.key?"border-primary text-foreground":"border-transparent text-muted-foreground hover:text-foreground"}`}>
              {r.label}
            </button>
          ))}
        </div>

        {/* Stat selector */}
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <label className="text-sm font-sans font-medium text-muted-foreground">Statistic:</label>
          <select value={stat} onChange={e => setParam("stat", e.target.value)}
            className="text-sm bg-popover text-popover-foreground border border-border rounded px-3 py-1.5 font-sans focus:outline-none">
            {STATS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          {statInfo.requirePos && (
            <span className="text-xs text-muted-foreground font-sans border border-border rounded px-2 py-1">
              {statInfo.requirePos}s only
            </span>
          )}
          {statInfo.minGP && <span className="text-xs text-muted-foreground font-sans">Min {statInfo.minGP} GP</span>}
        </div>

        {careerError && (
          <div className="mb-4 border border-red-500/40 rounded bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400 font-sans">
            {careerError}
            <button onClick={() => { setCareerError(null); setCareerLoading(true); }}
              className="ml-3 underline hover:no-underline">Retry</button>
          </div>
        )}

        {/* Main leaderboard */}
        <div className="border border-border rounded overflow-hidden">
          <div className="bg-table-header px-3 py-2 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-table-header-foreground">
              {REGS.find(r=>r.key===register)?.label} — {statInfo.label}
              {!careerLoading && filteredCareer.length > 0 && (
                <span className="text-table-header-foreground/60 font-sans font-normal text-xs ml-2">
                  ({filteredCareer.length} players)
                </span>
              )}
            </h3>
          </div>
          {loading
            ? <Skeleton/>
            : register==="yearly"||register==="yby"
              ? renderYearly()
              : renderTable(leaderboard)}
        </div>
      </main>
      <SiteFooter/>
      <MobileBottomNav/>
    </div>
  );
}
