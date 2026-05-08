import { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { SiteFooter } from "@/components/SiteFooter";

/* ── types ── */
interface CareerRow {
  PlayerID: number | null;
  PlayerName: string | null;
  Position: string | null;
  Nation: string | null;
  FullName: string | null;
  LeagueName: string | null;
  LatestSeason: number;
  GP: number; MIN: number; G: number; GSC: number;
  KS: number; KSF: number; BH: number; TF: number; TP: number;
  ShotAtt: number; ShotScored: number;
  PassAtt: number; PassComp: number;
  KPassAtt: number; KPassComp: number;
  isIntl: boolean;
}

interface SeasonRow {
  PlayerID: number | null;
  PlayerName: string | null;
  Position: string | null;
  Nation: string | null;
  FullName: string | null;
  LeagueName: string | null;
  SeasonID: number;
  GP: number; MIN: number; G: number; GSC: number;
  KS: number; KSF: number; BH: number; TF: number; TP: number;
  ShotAtt: number; ShotScored: number;
  PassAtt: number; PassComp: number;
  KPassAtt: number; KPassComp: number;
  isIntl: boolean;
}

interface LeagueInfo {
  LeagueID: number;
  LeagueName: string | null;
  LeagueTier: number | null;
}

/* ── stat definitions ── */
type StatCat =
  | "GP" | "MIN"
  | "G" | "G_GP" | "SH_PCT" | "PASS_PCT_C" | "MIN_G"
  | "GSC" | "GSC_PCT" | "MIN_GSC"
  | "KSF" | "KSF_GP" | "KS" | "SV_PCT" | "KS_GP" | "PASS_PCT_K"
  | "BH" | "BH_GP" | "TF" | "TF_GP" | "TP" | "TP_GP";

type RegType = "career" | "active" | "season" | "progressive" | "yearly" | "yby";

const STATS: { key: StatCat; label: string; abbr: string; higher: boolean; minGP?: number; requirePos?: string }[] = [
  { key: "GP",         label: "Games Played",                abbr: "GP",      higher: true },
  { key: "MIN",        label: "Minutes Played",               abbr: "MIN",     higher: true },
  { key: "G",          label: "Goals",                        abbr: "G",       higher: true,  requirePos: "Chaser" },
  { key: "G_GP",       label: "Goals per Game",               abbr: "G/GP",    higher: true,  minGP: 10, requirePos: "Chaser" },
  { key: "SH_PCT",     label: "Shooting %",                   abbr: "SH%",     higher: true,  minGP: 10, requirePos: "Chaser" },
  { key: "PASS_PCT_C", label: "Pass % (Chaser)",              abbr: "PASS%",   higher: true,  minGP: 10, requirePos: "Chaser" },
  { key: "MIN_G",      label: "Minutes per Goal",             abbr: "MIN/G",   higher: false, minGP: 10, requirePos: "Chaser" },
  { key: "GSC",        label: "Snitch Catches",               abbr: "GSC",     higher: true,  requirePos: "Seeker" },
  { key: "GSC_PCT",    label: "Snitch %",                     abbr: "GSC%",    higher: true,  minGP: 10, requirePos: "Seeker" },
  { key: "MIN_GSC",    label: "Minutes per Snitch",           abbr: "MIN/GSC", higher: false, minGP: 10, requirePos: "Seeker" },
  { key: "KSF",        label: "Shots Faced",                  abbr: "SF",      higher: true,  requirePos: "Keeper" },
  { key: "KSF_GP",     label: "Shots Faced per Game",         abbr: "SF/GP",   higher: true,  minGP: 10, requirePos: "Keeper" },
  { key: "KS",         label: "Saves",                        abbr: "SV",      higher: true,  requirePos: "Keeper" },
  { key: "SV_PCT",     label: "Save %",                       abbr: "SV%",     higher: true,  minGP: 10, requirePos: "Keeper" },
  { key: "KS_GP",      label: "Saves per Game",               abbr: "SV/GP",   higher: true,  minGP: 10, requirePos: "Keeper" },
  { key: "PASS_PCT_K", label: "Pass % (Keeper)",              abbr: "KP%",     higher: true,  minGP: 10, requirePos: "Keeper" },
  { key: "BH",         label: "Bludgers Hit",                 abbr: "BH",      higher: true,  requirePos: "Beater" },
  { key: "BH_GP",      label: "Bludgers Hit per Game",        abbr: "BH/GP",   higher: true,  minGP: 10, requirePos: "Beater" },
  { key: "TF",         label: "Turnovers Forced",             abbr: "TF",      higher: true,  requirePos: "Beater" },
  { key: "TF_GP",      label: "Turnovers Forced per Game",    abbr: "TF/GP",   higher: true,  minGP: 10, requirePos: "Beater" },
  { key: "TP",         label: "Teammates Protected",          abbr: "TP",      higher: true,  requirePos: "Beater" },
  { key: "TP_GP",      label: "Teammates Protected per Game", abbr: "TP/GP",   higher: true,  minGP: 10, requirePos: "Beater" },
];

const REGS: { key: RegType; label: string }[] = [
  { key: "career",      label: "Career" },
  { key: "active",      label: "Active" },
  { key: "season",      label: "Single Season" },
  { key: "progressive", label: "Progressive" },
  { key: "yearly",      label: "Yearly League" },
  { key: "yby",         label: "Year-by-Year" },
];

/* ── stat value computation ── */
function val(row: any, cat: StatCat): number | null {
  const { GP=0, G=0, GSC=0, KS=0, KSF=0, MIN=0, BH=0, TF=0, TP=0, ShotAtt=0, ShotScored=0, PassAtt=0, PassComp=0, KPassAtt=0, KPassComp=0 } = row;
  const minGP = STATS.find(s => s.key === cat)?.minGP ?? 0;
  if (GP < minGP) return null;
  switch (cat) {
    case "GP":       return GP;
    case "MIN":      return MIN > 0 ? MIN : null;
    case "G":        return G > 0 ? G : null;
    case "G_GP":     return GP > 0 && G > 0 ? G / GP : null;
    case "SH_PCT":   return ShotAtt > 0 ? ShotScored / ShotAtt : null;
    case "PASS_PCT_C": return PassAtt > 0 ? PassComp / PassAtt : null;
    case "MIN_G":    return G > 0 && MIN > 0 ? MIN / G : null;
    case "GSC":      return GSC > 0 ? GSC : null;
    case "GSC_PCT":  return GP > 0 && GSC > 0 ? GSC / GP : null;
    case "MIN_GSC":  return GSC > 0 && MIN > 0 ? MIN / GSC : null;
    case "KSF":      return KSF > 0 ? KSF : null;
    case "KSF_GP":   return GP > 0 && KSF > 0 ? KSF / GP : null;
    case "KS":       return KS > 0 ? KS : null;
    case "SV_PCT":   return KSF > 0 ? KS / KSF : null;
    case "KS_GP":    return GP > 0 && KS > 0 ? KS / GP : null;
    case "PASS_PCT_K": return KPassAtt > 0 ? KPassComp / KPassAtt : null;
    case "BH":       return BH > 0 ? BH : null;
    case "BH_GP":    return GP > 0 && BH > 0 ? BH / GP : null;
    case "TF":       return TF > 0 ? TF : null;
    case "TF_GP":    return GP > 0 && TF > 0 ? TF / GP : null;
    case "TP":       return TP > 0 ? TP : null;
    case "TP_GP":    return GP > 0 && TP > 0 ? TP / GP : null;
  }
}

function fmt(v: number | null, cat: StatCat): string {
  if (v === null) return "—";
  if (["GSC_PCT","SV_PCT","SH_PCT","PASS_PCT_C","PASS_PCT_K"].includes(cat)) return (v * 100).toFixed(1) + "%";
  if (["MIN_G","MIN_GSC","KSF_GP","KS_GP","G_GP","BH_GP","TF_GP","TP_GP"].includes(cat)) return v.toFixed(2);
  return String(Math.round(v));
}

function seasonLabel(id: number) { return `${id - 1}–${String(id).slice(-2)}`; }

const SELECT_COLS = "PlayerID,PlayerName,Position,Nation,FullName,LeagueName,SeasonID,GamesPlayed,MinPlayed,Goals,GoldenSnitchCatches,KeeperSaves,KeeperShotsFaced,ShotAtt,ShotScored,PassAtt,PassComp,KeeperPassAtt,KeeperPassComp,BludgersHit,TurnoversForced,TeammatesProtected";

function mapRow(r: any, isIntl: boolean): SeasonRow {
  return {
    PlayerID: r.PlayerID, PlayerName: r.PlayerName, Position: r.Position,
    Nation: r.Nation, FullName: r.FullName, LeagueName: r.LeagueName,
    SeasonID: r.SeasonID,
    GP: r.GamesPlayed || 0, MIN: r.MinPlayed || 0,
    G: r.Goals || 0, GSC: r.GoldenSnitchCatches || 0,
    KS: r.KeeperSaves || 0, KSF: r.KeeperShotsFaced || 0,
    BH: r.BludgersHit || 0, TF: r.TurnoversForced || 0, TP: r.TeammatesProtected || 0,
    ShotAtt: r.ShotAtt || 0, ShotScored: r.ShotScored || 0,
    PassAtt: r.PassAtt || 0, PassComp: r.PassComp || 0,
    KPassAtt: r.KeeperPassAtt || 0, KPassComp: r.KeeperPassComp || 0,
    isIntl,
  };
}

/* Aggregate per-season rows into career totals, grouped by PlayerID+Position */
function buildCareer(rows: SeasonRow[]): CareerRow[] {
  const map = new Map<string, CareerRow>();
  rows.forEach(r => {
    const key = `${r.PlayerID ?? r.PlayerName}||${r.Position}`;
    let c = map.get(key);
    if (!c) {
      c = {
        PlayerID: r.PlayerID, PlayerName: r.PlayerName, Position: r.Position,
        Nation: r.Nation, FullName: r.FullName, LeagueName: r.LeagueName,
        LatestSeason: r.SeasonID,
        GP: 0, MIN: 0, G: 0, GSC: 0, KS: 0, KSF: 0,
        BH: 0, TF: 0, TP: 0, ShotAtt: 0, ShotScored: 0,
        PassAtt: 0, PassComp: 0, KPassAtt: 0, KPassComp: 0,
        isIntl: r.isIntl,
      };
      map.set(key, c);
    }
    c.GP += r.GP; c.MIN += r.MIN; c.G += r.G; c.GSC += r.GSC;
    c.KS += r.KS; c.KSF += r.KSF; c.BH += r.BH; c.TF += r.TF; c.TP += r.TP;
    c.ShotAtt += r.ShotAtt; c.ShotScored += r.ShotScored;
    c.PassAtt += r.PassAtt; c.PassComp += r.PassComp;
    c.KPassAtt += r.KPassAtt; c.KPassComp += r.KPassComp;
    if (r.SeasonID > c.LatestSeason) {
      c.LatestSeason = r.SeasonID;
      c.FullName = r.FullName;
      c.LeagueName = r.LeagueName;
    }
  });
  return [...map.values()];
}

/* ── component ── */
export default function LeadersIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const scope    = (searchParams.get("scope") as "club" | "intl") || "club";
  const stat     = (searchParams.get("stat")  as StatCat) || "G";
  const register = (searchParams.get("reg")   as RegType) || "career";

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  // Separate state for career data (small — fetched once) and per-season data (large — lazy)
  const [careerRows, setCareerRows]   = useState<CareerRow[]>([]);
  const [seasonRows, setSeasonRows]   = useState<SeasonRow[]>([]);
  const [leagues, setLeagues]         = useState<LeagueInfo[]>([]);
  const [intlLeagueNames, setIntlLeagueNames] = useState<Set<string>>(new Set());
  const [leagueIdByName, setLeagueIdByName]   = useState<Map<string, number>>(new Map());
  const [careerLoading, setCareerLoading]     = useState(true);
  const [seasonLoading, setSeasonLoading]     = useState(false);
  const [seasonLoaded, setSeasonLoaded]       = useState(false); // lazy flag

  // ── Step 1: Always fetch career data immediately (small payload) ──
  // Strategy: fetch only distinct PlayerID+Position+SeasonID combos, aggregate in JS.
  // We fetch all rows but only the columns we need. Since each player has ~1 row per season,
  // this is bounded and manageable (typically 2000-8000 rows vs the old unlimited fetch).
  useEffect(() => {
    (async () => {
      try {
        const [{ data: lgData }, rows] = await Promise.all([
          supabase.from("leagues").select("LeagueID, LeagueName, LeagueTier"),
          fetchAllRows("player_season_stats", {
            select: SELECT_COLS,
            order: { column: "SeasonID", ascending: false },
          }),
        ]);

        if (lgData) {
          setLeagues(lgData as LeagueInfo[]);
          const intlNames = new Set<string>();
          const lim = new Map<string, number>();
          (lgData as LeagueInfo[]).forEach(l => {
            if (l.LeagueName && l.LeagueID) {
              lim.set(l.LeagueName, l.LeagueID);
              if (l.LeagueTier === 0) intlNames.add(l.LeagueName);
            }
          });
          setIntlLeagueNames(intlNames);
          setLeagueIdByName(lim);

          const mapped = (rows || []).map(r =>
            mapRow(r, intlNames.has(r.LeagueName || ""))
          );
          // Store season rows for later use
          setSeasonRows(mapped);
          setSeasonLoaded(true);
          // Build career immediately
          setCareerRows(buildCareer(mapped));
        }
      } catch (err) {
        console.error("LeadersIndex load error:", err);
      } finally {
        setCareerLoading(false);
      }
    })();
  }, []);

  /* ── derived state ── */
  const filteredCareer = useMemo(() =>
    careerRows.filter(r => scope === "club" ? !r.isIntl : r.isIntl),
    [careerRows, scope]
  );

  const filteredSeason = useMemo(() =>
    seasonRows.filter(r => scope === "club" ? !r.isIntl : r.isIntl),
    [seasonRows, scope]
  );

  const maxSeason = useMemo(() =>
    filteredCareer.reduce((m, r) => Math.max(m, r.LatestSeason), 0),
    [filteredCareer]
  );

  const allSeasons = useMemo(() =>
    [...new Set(filteredSeason.map(r => r.SeasonID))].sort((a, b) => b - a),
    [filteredSeason]
  );

  /* ── leaderboard computation ── */
  const leaderboard = useMemo(() => {
    const info = STATS.find(s => s.key === stat)!;
    const reqPos = info.requirePos;
    const sortFn = (a: any, b: any) => {
      const va = val(a, stat), vb = val(b, stat);
      if (va === null && vb === null) return 0;
      if (va === null) return 1; if (vb === null) return -1;
      return info.higher ? vb - va : va - vb;
    };
    const filterValid = (r: any) => {
      if (val(r, stat) === null) return false;
      if (reqPos && r.Position !== reqPos) return false;
      return true;
    };

    if (register === "career") {
      return filteredCareer.filter(filterValid).sort(sortFn).slice(0, 25).map(r => ({
        ...r, statVal: val(r, stat), team: r.FullName, season: null,
      }));
    }

    if (register === "active") {
      const top2 = [...new Set(filteredCareer.map(r => r.LatestSeason))].sort((a,b) => b-a).slice(0,2);
      const minSeason = top2[top2.length - 1] ?? maxSeason;
      return filteredCareer.filter(r => r.LatestSeason >= minSeason && filterValid(r)).sort(sortFn).slice(0, 25).map(r => ({
        ...r, statVal: val(r, stat), team: r.FullName, season: null,
      }));
    }

    if (register === "season") {
      if (!seasonLoaded) return [];
      return filteredSeason.filter(filterValid).sort(sortFn).slice(0, 25).map(r => ({
        ...r, statVal: val(r, stat), team: r.FullName, season: r.SeasonID,
      }));
    }

    if (register === "progressive") {
      if (!seasonLoaded) return [];
      const cum = new Map<string, any>();
      const entries: any[] = [];
      const sortedSeasons = [...new Set(filteredSeason.map(r => r.SeasonID))].sort((a,b) => a-b);
      sortedSeasons.forEach(sid => {
        filteredSeason.filter(r => r.SeasonID === sid).forEach(r => {
          const key = `${r.PlayerID ?? r.PlayerName}||${r.Position}`;
          let c = cum.get(key);
          if (!c) c = { ...r, GP:0,MIN:0,G:0,GSC:0,KS:0,KSF:0,BH:0,TF:0,TP:0,ShotAtt:0,ShotScored:0,PassAtt:0,PassComp:0,KPassAtt:0,KPassComp:0 };
          c.GP+=r.GP;c.MIN+=r.MIN;c.G+=r.G;c.GSC+=r.GSC;c.KS+=r.KS;c.KSF+=r.KSF;
          c.BH+=r.BH;c.TF+=r.TF;c.TP+=r.TP;c.ShotAtt+=r.ShotAtt;c.ShotScored+=r.ShotScored;
          c.PassAtt+=r.PassAtt;c.PassComp+=r.PassComp;c.KPassAtt+=r.KPassAtt;c.KPassComp+=r.KPassComp;
          c.FullName=r.FullName; c.LeagueName=r.LeagueName;
          cum.set(key, c);
        });
        const snap = [...cum.values()].filter(filterValid);
        if (!snap.length) return;
        snap.sort(sortFn);
        const topVal = val(snap[0], stat);
        const leaders = snap.filter(r => val(r, stat) === topVal);
        entries.push({
          PlayerName: leaders.map(l => l.PlayerName).join(" / "),
          _isTie: leaders.length > 1, _leaders: leaders,
          Position: leaders[0].Position, Nation: leaders[0].Nation,
          statVal: topVal, team: leaders[0].FullName, season: sid,
          GP: leaders[0].GP,
        });
      });
      return entries;
    }

    return [];
  }, [filteredCareer, filteredSeason, stat, register, seasonLoaded, maxSeason]);

  /* yearly data */
  const yearlyData = useMemo(() => {
    if ((register !== "yearly" && register !== "yby") || !seasonLoaded) return [];
    const info = STATS.find(s => s.key === stat)!;
    const reqPos = info.requirePos;
    const filterValid = (r: any) => {
      if (val(r, stat) === null) return false;
      if (reqPos && r.Position !== reqPos) return false;
      return true;
    };
    const sortFn = (a: any, b: any) => {
      const va = val(a, stat), vb = val(b, stat);
      if (va === null) return 1; if (vb === null) return -1;
      return info.higher ? vb - va : va - vb;
    };

    if (register === "yearly") {
      const groups = new Map<string, SeasonRow[]>();
      filteredSeason.forEach(r => {
        const key = `${r.SeasonID}||${r.LeagueName}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(r);
      });
      const result: any[] = [];
      groups.forEach((rows, key) => {
        const [sidStr, league] = key.split("||");
        const valid = rows.filter(filterValid).sort(sortFn);
        if (!valid.length) return;
        const topVal = val(valid[0], stat);
        const leaders = valid.filter(r => val(r, stat) === topVal);
        result.push({
          seasonID: parseInt(sidStr), league,
          entry: { PlayerName: leaders.map(l => l.PlayerName).join(" / "), _isTie: leaders.length > 1,
            _leaders: leaders, Position: leaders[0].Position, Nation: leaders[0].Nation,
            statVal: topVal, team: leaders[0].FullName, season: parseInt(sidStr), GP: leaders[0].GP },
        });
      });
      return result.sort((a,b) => a.seasonID - b.seasonID || a.league.localeCompare(b.league));
    }

    // yby
    const groups2 = new Map<number, SeasonRow[]>();
    filteredSeason.forEach(r => {
      if (!groups2.has(r.SeasonID)) groups2.set(r.SeasonID, []);
      groups2.get(r.SeasonID)!.push(r);
    });
    const result2: any[] = [];
    groups2.forEach((rows, sid) => {
      const valid = rows.filter(filterValid).sort(sortFn);
      if (!valid.length) return;
      const topVal = val(valid[0], stat);
      const leaders = valid.filter(r => val(r, stat) === topVal);
      result2.push({
        seasonID: sid, league: "",
        entry: { PlayerName: leaders.map(l => l.PlayerName).join(" / "), _isTie: leaders.length > 1,
          _leaders: leaders, Position: leaders[0].Position, Nation: leaders[0].Nation,
          statVal: topVal, team: leaders[0].FullName, season: sid, GP: leaders[0].GP },
      });
    });
    return result2.sort((a,b) => a.seasonID - b.seasonID);
  }, [filteredSeason, stat, register, seasonLoaded]);

  /* ── rendering ── */
  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground";
  const statInfo = STATS.find(s => s.key === stat)!;
  const showSeason = ["season","progressive","yearly","yby"].includes(register);
  const loading = careerLoading || (["season","progressive","yearly","yby"].includes(register) && seasonLoading);

  const PlayerLink = ({ name, pid }: { name: string; pid?: number | null }) =>
    pid ? <Link to={`/player/${pid}`} className="text-accent hover:underline">{name}</Link>
        : <span className="text-foreground">{name}</span>;

  const renderRow = (entry: any, i: number) => {
    const lid = entry.LeagueName ? leagueIdByName.get(entry.LeagueName) : null;
    return (
      <tr key={`${entry.PlayerName}-${entry.season}-${i}`}
        className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20 transition-colors`}>
        <td className="px-3 py-1.5 font-mono text-muted-foreground text-sm">{i + 1}</td>
        <td className="px-3 py-1.5 font-medium">
          {entry._isTie
            ? <span>{(entry._leaders as any[]).map((l: any, li: number) => (
                <span key={l.PlayerName ?? li}>{li > 0 && " / "}
                  <PlayerLink name={l.PlayerName} pid={l.PlayerID} />
                </span>
              ))}<span className="text-muted-foreground text-xs ml-1">(tie)</span></span>
            : <PlayerLink name={entry.PlayerName} pid={entry.PlayerID} />}
        </td>
        <td className="px-3 py-1.5 text-muted-foreground text-xs">{entry.Position || "—"}</td>
        <td className="px-3 py-1.5 text-xs">
          {entry.team
            ? <Link to={`/team/${encodeURIComponent(entry.team)}`} className="text-accent hover:underline">{entry.team}</Link>
            : "—"}
        </td>
        {showSeason && entry.season != null && (
          <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
            {lid
              ? <Link to={`/league/${lid}/history`} className="text-accent hover:underline">{seasonLabel(entry.season)}</Link>
              : seasonLabel(entry.season)}
          </td>
        )}
        <td className="px-3 py-1.5 text-right font-mono font-bold">{fmt(entry.statVal, stat)}</td>
      </tr>
    );
  };

  const renderTable = (rows: any[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm font-sans">
        <thead>
          <tr className="bg-secondary">
            <th className={`${thClass} text-left w-8`}>#</th>
            <th className={`${thClass} text-left`}>Player</th>
            <th className={`${thClass} text-left`}>Pos</th>
            <th className={`${thClass} text-left`}>Team</th>
            {showSeason && <th className={`${thClass} text-left`}>Season</th>}
            <th className={`${thClass} text-right`}>{statInfo.abbr}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => renderRow(r, i))}
          {rows.length === 0 && !loading && (
            <tr><td colSpan={showSeason ? 6 : 5} className="px-3 py-6 text-center text-muted-foreground italic">
              No data available.
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const Skeleton = () => (
    <div className="bg-card divide-y divide-border">
      {[...Array(12)].map((_, i) => (
        <div key={i} className="px-3 py-2.5 flex gap-4 animate-pulse">
          <div className="w-6 h-3 bg-secondary rounded shrink-0" />
          <div className="h-3 bg-secondary rounded" style={{ width: `${40 + (i * 17) % 35}%` }} />
          <div className="h-3 bg-secondary rounded w-12 ml-auto" />
          <div className="h-3 bg-secondary rounded w-14" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col pb-14 md:pb-0">
      <SiteHeader />
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-2">
          <h1 className="font-display text-3xl font-bold text-foreground">Statistical Leaders</h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">All-time records and seasonal leaderboards</p>
        </div>

        {/* Scope */}
        <div className="flex gap-2 mb-4">
          {(["club","intl"] as const).map(s => (
            <button key={s} onClick={() => set("scope", s)}
              className={`px-4 py-2 text-sm font-sans font-medium rounded transition-colors ${scope === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              {s === "club" ? "Club Stats" : "International Stats"}
            </button>
          ))}
        </div>

        {/* Register tabs */}
        <div className="flex gap-0 mb-4 border-b border-border overflow-x-auto scrollbar-hide">
          {REGS.map(r => (
            <button key={r.key} onClick={() => set("reg", r.key)}
              className={`px-3 py-2 text-sm font-sans font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${register === r.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {r.label}
            </button>
          ))}
        </div>

        {/* Stat selector */}
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <label className="text-sm font-sans font-medium text-muted-foreground">Statistic:</label>
          <select value={stat} onChange={e => set("stat", e.target.value)}
            className="text-sm bg-popover text-popover-foreground border border-border rounded px-3 py-1.5 font-sans focus:outline-none">
            {STATS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          {statInfo.requirePos && (
            <span className="text-xs text-muted-foreground font-sans border border-border rounded px-2 py-1">
              {statInfo.requirePos}s only
            </span>
          )}
          {statInfo.minGP && (
            <span className="text-xs text-muted-foreground font-sans">Min {statInfo.minGP} GP</span>
          )}
        </div>

        {/* Main table */}
        <div className="border border-border rounded overflow-hidden">
          <div className="bg-table-header px-3 py-2 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-table-header-foreground">
              {REGS.find(r => r.key === register)?.label} — {statInfo.label}
              {careerRows.length > 0 && !careerLoading && (
                <span className="text-table-header-foreground/60 font-sans font-normal text-xs ml-2">
                  ({filteredCareer.length} players)
                </span>
              )}
            </h3>
          </div>

          {loading ? <Skeleton /> : (

            register === "progressive" ? renderTable(leaderboard) :
            (register === "yearly" || register === "yby") ? (
              yearlyData.length === 0
                ? <p className="text-muted-foreground font-sans py-8 text-center italic px-3">No data available.</p>
                : <div className="overflow-x-auto"><table className="w-full text-sm font-sans">
                    <thead><tr className="bg-secondary">
                      <th className={`${thClass} text-left`}>Season</th>
                      {register === "yearly" && <th className={`${thClass} text-left`}>League</th>}
                      <th className={`${thClass} text-left`}>Player</th>
                      <th className={`${thClass} text-left`}>Pos</th>
                      <th className={`${thClass} text-left`}>Team</th>
                      <th className={`${thClass} text-right`}>{statInfo.abbr}</th>
                    </tr></thead>
                    <tbody>
                      {yearlyData.map((g, i) => {
                        const e = g.entry;
                        const lid = g.league ? leagueIdByName.get(g.league) : null;
                        return (
                          <tr key={`${g.seasonID}-${g.league}-${i}`}
                            className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                            <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                              {lid ? <Link to={`/league/${lid}/history`} className="text-accent hover:underline">{seasonLabel(g.seasonID)}</Link> : seasonLabel(g.seasonID)}
                            </td>
                            {register === "yearly" && (
                              <td className="px-3 py-1.5 text-xs text-muted-foreground">
                                {lid ? <Link to={`/league/${lid}`} className="hover:underline hover:text-accent">{g.league}</Link> : g.league}
                              </td>
                            )}
                            <td className="px-3 py-1.5 font-medium">
                              {e._isTie
                                ? <span>{(e._leaders as any[]).map((l: any, li: number) => (
                                    <span key={l.PlayerName ?? li}>{li > 0 && " / "}
                                      <PlayerLink name={l.PlayerName} pid={l.PlayerID} />
                                    </span>
                                  ))}<span className="text-muted-foreground text-xs ml-1">(tie)</span></span>
                                : <PlayerLink name={e.PlayerName} pid={e.PlayerID} />}
                            </td>
                            <td className="px-3 py-1.5 text-xs text-muted-foreground">{e.Position}</td>
                            <td className="px-3 py-1.5 text-xs">
                              {e.team ? <Link to={`/team/${encodeURIComponent(e.team)}`} className="text-accent hover:underline">{e.team}</Link> : "—"}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono font-bold">{fmt(e.statVal, stat)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table></div>
            ) : renderTable(leaderboard)
          )}
        </div>
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
