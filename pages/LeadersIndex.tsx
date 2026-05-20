import { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { SiteFooter } from "@/components/SiteFooter";
import { fetchAllRows } from "@/lib/fetchAll";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RawRow {
  PlayerID: number | null;
  PlayerName: string | null;
  Position: string | null;
  Nation: string | null;
  TeamFullName: string | null;
  LeagueName: string | null;
  SeasonID: number | null;
  GamesPlayed: number | null;
  MinPlayed: number | null;
  Goals: number | null;
  GoldenSnitchCatches: number | null;
  KeeperSaves: number | null;
  KeeperShotsFaced: number | null;
  BludgersHit: number | null;
  TurnoversForced: number | null;
  TeammatesProtected: number | null;
  ShotAtt: number | null;
  ShotScored: number | null;
  PassAtt: number | null;
  PassComp: number | null;
  KeeperPassAtt: number | null;
  KeeperPassComp: number | null;
}

interface CareerRow {
  PlayerID: number | null;
  PlayerName: string | null;
  Position: string | null;
  Nation: string | null;
  TeamFullName: string | null;
  LeagueName: string | null;
  LatestSeason: number;
  isIntl: boolean;
  GP: number; MIN: number;
  G: number; GSC: number; KS: number; KSF: number;
  BH: number; TF: number; TP: number;
  SA: number; SS: number; PA: number; PC: number; KPA: number; KPC: number;
}

interface LeagueInfo {
  LeagueID: number;
  LeagueName: string | null;
  LeagueTier: number | null;
}

// ─── Stat Definitions ────────────────────────────────────────────────────────

type StatCat =
  "GP" | "G" | "G_GP" | "SH_PCT" | "PASS_PCT_C" | "MIN_G"
  | "GSC" | "GSC_GP"
  | "KSF" | "KS" | "SV_PCT" | "KS_GP" | "PASS_PCT_K"
  | "BH" | "BH_GP" | "TF" | "TF_GP" | "TP" | "TP_GP";

type RegType = "career" | "active" | "season" | "progressive" | "yearly" | "yby";

const STATS: { key: StatCat; label: string; abbr: string; higher: boolean; minGP?: number; requirePos?: string }[] = [
  { key: "GP",         label: "Games Played",              abbr: "GP",     higher: true },
  { key: "G",          label: "Goals",                     abbr: "G",      higher: true,  requirePos: "Chaser" },
  { key: "G_GP",       label: "Goals per Game",            abbr: "G/GP",   higher: true,  minGP: 10, requirePos: "Chaser" },
  { key: "SH_PCT",     label: "Shooting %",                abbr: "SH%",    higher: true,  minGP: 10, requirePos: "Chaser" },
  { key: "PASS_PCT_C", label: "Pass % (Chaser)",           abbr: "PASS%",  higher: true,  minGP: 10, requirePos: "Chaser" },
  { key: "MIN_G",      label: "Minutes per Goal",          abbr: "MIN/G",  higher: false, minGP: 10, requirePos: "Chaser" },
  { key: "GSC",        label: "Snitch Catches",            abbr: "GSC",    higher: true,  requirePos: "Seeker" },
  { key: "GSC_GP",     label: "Snitch Catches per Game",   abbr: "GSC/GP", higher: true,  minGP: 10, requirePos: "Seeker" },
  { key: "KSF",        label: "Shots Faced",               abbr: "SF",     higher: true,  requirePos: "Keeper" },
  { key: "KS",         label: "Saves",                     abbr: "SV",     higher: true,  requirePos: "Keeper" },
  { key: "SV_PCT",     label: "Save %",                    abbr: "SV%",    higher: true,  minGP: 10, requirePos: "Keeper" },
  { key: "KS_GP",      label: "Saves per Game",            abbr: "SV/GP",  higher: true,  minGP: 10, requirePos: "Keeper" },
  { key: "PASS_PCT_K", label: "Pass % (Keeper)",           abbr: "KP%",    higher: true,  minGP: 10, requirePos: "Keeper" },
  { key: "BH",         label: "Bludgers Hit",              abbr: "BH",     higher: true,  requirePos: "Beater" },
  { key: "BH_GP",      label: "Bludgers Hit per Game",     abbr: "BH/GP",  higher: true,  minGP: 10, requirePos: "Beater" },
  { key: "TF",         label: "Turnovers Forced",          abbr: "TF",     higher: true,  requirePos: "Beater" },
  { key: "TF_GP",      label: "Turnovers Forced / Game",   abbr: "TF/GP",  higher: true,  minGP: 10, requirePos: "Beater" },
  { key: "TP",         label: "Teammates Protected",       abbr: "TP",     higher: true,  requirePos: "Beater" },
  { key: "TP_GP",      label: "Teammates Protected / Game",abbr: "TP/GP",  higher: true,  minGP: 10, requirePos: "Beater" },
];

const REGS: { key: RegType; label: string }[] = [
  { key: "career",      label: "Career" },
  { key: "active",      label: "Active" },
  { key: "season",      label: "Single Season" },
  { key: "progressive", label: "Progressive" },
  { key: "yearly",      label: "Yearly League" },
  { key: "yby",         label: "Year-by-Year" },
];

const FETCH_SELECT = "PlayerID,PlayerName,Position,Nation,TeamFullName,LeagueName,SeasonID,GamesPlayed,MinPlayed,Goals,GoldenSnitchCatches,KeeperSaves,KeeperShotsFaced,BludgersHit,TurnoversForced,TeammatesProtected,ShotAtt,ShotScored,PassAtt,PassComp,KeeperPassAtt,KeeperPassComp";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sl = (id: number) => `${id - 1}–${String(id).slice(-2)}`;

function val(row: any, cat: StatCat): number | null {
  const gp = row.GP ?? row.GamesPlayed ?? 0;
  const mn = row.MIN ?? row.MinPlayed ?? 0;
  const g  = row.G  ?? row.Goals ?? 0;
  const gsc = row.GSC ?? row.GoldenSnitchCatches ?? 0;
  const ks  = row.KS  ?? row.KeeperSaves ?? 0;
  const ksf = row.KSF ?? row.KeeperShotsFaced ?? 0;
  const bh  = row.BH  ?? row.BludgersHit ?? 0;
  const tf  = row.TF  ?? row.TurnoversForced ?? 0;
  const tp  = row.TP  ?? row.TeammatesProtected ?? 0;
  const sa  = row.SA  ?? row.ShotAtt ?? 0;
  const ss  = row.SS  ?? row.ShotScored ?? 0;
  const pa  = row.PA  ?? row.PassAtt ?? 0;
  const pc  = row.PC  ?? row.PassComp ?? 0;
  const kpa = row.KPA ?? row.KeeperPassAtt ?? 0;
  const kpc = row.KPC ?? row.KeeperPassComp ?? 0;
  const minGP = STATS.find(s => s.key === cat)?.minGP ?? 0;
  if (gp < minGP) return null;
  switch (cat) {
    case "GP":       return gp > 0 ? gp : null;
    case "G":        return g > 0 ? g : null;
    case "G_GP":     return gp > 0 && g > 0 ? g / gp : null;
    case "SH_PCT":   return sa > 0 ? ss / sa : null;
    case "PASS_PCT_C": return pa > 0 ? pc / pa : null;
    case "MIN_G":    return g > 0 && mn > 0 ? mn / g : null;
    case "GSC":      return gsc > 0 ? gsc : null;
    case "GSC_GP":   return gp > 0 && gsc > 0 ? gsc / gp : null;
    case "KSF":      return ksf > 0 ? ksf : null;
    case "KS":       return ks > 0 ? ks : null;
    case "SV_PCT":   return ksf > 0 ? ks / ksf : null;
    case "KS_GP":    return gp > 0 && ks > 0 ? ks / gp : null;
    case "PASS_PCT_K": return kpa > 0 ? kpc / kpa : null;
    case "BH":       return bh > 0 ? bh : null;
    case "BH_GP":    return gp > 0 && bh > 0 ? bh / gp : null;
    case "TF":       return tf > 0 ? tf : null;
    case "TF_GP":    return gp > 0 && tf > 0 ? tf / gp : null;
    case "TP":       return tp > 0 ? tp : null;
    case "TP_GP":    return gp > 0 && tp > 0 ? tp / gp : null;
  }
}

function fmt(v: number | null, cat: StatCat): string {
  if (v === null) return "—";
  if (["SV_PCT","SH_PCT","PASS_PCT_C","PASS_PCT_K"].includes(cat)) return (v * 100).toFixed(1) + "%";
  if (["GSC_GP","KS_GP","G_GP","BH_GP","TF_GP","TP_GP","MIN_G"].includes(cat)) return v.toFixed(2);
  return String(Math.round(v));
}

// Aggregate raw per-season rows into career totals, grouped by PlayerID+Position
function buildCareer(rows: RawRow[], intlNames: Set<string>): CareerRow[] {
  const map = new Map<string, CareerRow>();
  rows.forEach(r => {
    const key = `${r.PlayerID ?? r.PlayerName}|${r.Position}`;
    const ln = r.LeagueName || "";
    let c = map.get(key);
    if (!c) {
      c = {
        PlayerID: r.PlayerID, PlayerName: r.PlayerName, Position: r.Position,
        Nation: r.Nation, TeamFullName: r.TeamFullName, LeagueName: r.LeagueName,
        LatestSeason: r.SeasonID ?? 0, isIntl: intlNames.has(ln),
        GP:0, MIN:0, G:0, GSC:0, KS:0, KSF:0, BH:0, TF:0, TP:0,
        SA:0, SS:0, PA:0, PC:0, KPA:0, KPC:0,
      };
      map.set(key, c);
    }
    c.GP  += r.GamesPlayed ?? 0;
    c.MIN += r.MinPlayed ?? 0;
    c.G   += r.Goals ?? 0;
    c.GSC += r.GoldenSnitchCatches ?? 0;
    c.KS  += r.KeeperSaves ?? 0;
    c.KSF += r.KeeperShotsFaced ?? 0;
    c.BH  += r.BludgersHit ?? 0;
    c.TF  += r.TurnoversForced ?? 0;
    c.TP  += r.TeammatesProtected ?? 0;
    c.SA  += r.ShotAtt ?? 0;
    c.SS  += r.ShotScored ?? 0;
    c.PA  += r.PassAtt ?? 0;
    c.PC  += r.PassComp ?? 0;
    c.KPA += r.KeeperPassAtt ?? 0;
    c.KPC += r.KeeperPassComp ?? 0;
    if ((r.SeasonID ?? 0) > c.LatestSeason) {
      c.LatestSeason = r.SeasonID!;
      c.TeamFullName = r.TeamFullName;
      c.LeagueName = r.LeagueName;
    }
  });
  return [...map.values()];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LeadersIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const scope    = (searchParams.get("scope") as "club" | "intl") || "club";
  const stat     = (searchParams.get("stat")  as StatCat) || "G";
  const register = (searchParams.get("reg")   as RegType) || "career";

  const setParam = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams);
    p.set(key, value);
    setSearchParams(p, { replace: true });
  };

  // All raw rows — fetched once from the materialized view (fast because it's pre-computed)
  const [rawRows,    setRawRows]    = useState<RawRow[]>([]);
  const [leagues,    setLeagues]    = useState<LeagueInfo[]>([]);
  const [intlNames,  setIntlNames]  = useState<Set<string>>(new Set());
  const [lgIdByName, setLgIdByName] = useState<Map<string, number>>(new Map());
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch leagues first (tiny query)
        const { data: lgData } = await supabase
          .from("leagues")
          .select("LeagueID, LeagueName, LeagueTier");

        const intl = new Set<string>();
        const lim  = new Map<string, number>();
        (lgData || []).forEach((l: any) => {
          if (l.LeagueName && l.LeagueID) {
            lim.set(l.LeagueName, l.LeagueID);
            if (l.LeagueTier === 0) intl.add(l.LeagueName);
          }
        });
        setLeagues((lgData || []) as LeagueInfo[]);
        setIntlNames(intl);
        setLgIdByName(lim);

        // Fetch ALL rows from the materialized view — it's pre-computed so this is fast
        // No aggregate syntax — just raw rows, aggregate in JS
        const rows = await fetchAllRows<RawRow>("player_season_stats", {
          select: FETCH_SELECT,
        });

        setRawRows(rows);
      } catch (err: any) {
        console.error("LeadersIndex load error:", err);
        setError(err?.message || "Failed to load data. Please refresh.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Career rows (aggregated in JS)
  const careerRows = useMemo(() => buildCareer(rawRows, intlNames), [rawRows, intlNames]);

  // Scoped views
  const filteredCareer = useMemo(
    () => careerRows.filter(r => scope === "club" ? !r.isIntl : r.isIntl),
    [careerRows, scope]
  );
  const filteredSeason = useMemo(
    () => rawRows.filter(r => {
      const isIntl = intlNames.has(r.LeagueName || "");
      return scope === "club" ? !isIntl : isIntl;
    }),
    [rawRows, intlNames, scope]
  );

  const maxSeason = useMemo(
    () => filteredCareer.reduce((m, r) => Math.max(m, r.LatestSeason), 0),
    [filteredCareer]
  );

  // Leaderboard
  const statInfo = STATS.find(s => s.key === stat)!;
  const reqPos   = statInfo.requirePos;

  const sortFn = (a: any, b: any) => {
    const va = val(a, stat), vb = val(b, stat);
    if (va === null && vb === null) return 0;
    if (va === null) return 1; if (vb === null) return -1;
    return statInfo.higher ? vb - va : va - vb;
  };
  const isValid = (r: any) =>
    val(r, stat) !== null && (!reqPos || r.Position === reqPos);

  const leaderboard = useMemo(() => {
    if (register === "career") {
      return filteredCareer.filter(isValid).sort(sortFn).slice(0, 25)
        .map(r => ({ ...r, statVal: val(r, stat), SeasonID: null }));
    }
    if (register === "active") {
      const top2 = [...new Set(filteredCareer.map(r => r.LatestSeason))].sort((a, b) => b - a).slice(0, 2);
      const minS  = top2[top2.length - 1] ?? maxSeason;
      return filteredCareer.filter(r => r.LatestSeason >= minS && isValid(r)).sort(sortFn).slice(0, 25)
        .map(r => ({ ...r, statVal: val(r, stat), SeasonID: null }));
    }
    if (register === "season") {
      return filteredSeason.filter(isValid).sort(sortFn).slice(0, 25)
        .map(r => ({ ...r, statVal: val(r, stat) }));
    }
    if (register === "progressive") {
      const cum = new Map<string, any>();
      const results: any[] = [];
      const seasons = [...new Set(filteredSeason.map(r => r.SeasonID).filter(Boolean))].sort((a, b) => (a as number) - (b as number)) as number[];
      seasons.forEach(sid => {
        filteredSeason.filter(r => r.SeasonID === sid).forEach(r => {
          const key = `${r.PlayerID ?? r.PlayerName}|${r.Position}`;
          const c = cum.get(key) || { ...r, GP:0,G:0,GSC:0,KS:0,KSF:0,BH:0,TF:0,TP:0,MIN:0,SA:0,SS:0,PA:0,PC:0,KPA:0,KPC:0 };
          c.GP+=(r.GamesPlayed??0); c.G+=(r.Goals??0); c.GSC+=(r.GoldenSnitchCatches??0);
          c.KS+=(r.KeeperSaves??0); c.KSF+=(r.KeeperShotsFaced??0); c.BH+=(r.BludgersHit??0);
          c.TF+=(r.TurnoversForced??0); c.TP+=(r.TeammatesProtected??0); c.MIN+=(r.MinPlayed??0);
          c.SA+=(r.ShotAtt??0); c.SS+=(r.ShotScored??0); c.PA+=(r.PassAtt??0); c.PC+=(r.PassComp??0);
          c.KPA+=(r.KeeperPassAtt??0); c.KPC+=(r.KeeperPassComp??0);
          c.TeamFullName=r.TeamFullName; c.LeagueName=r.LeagueName;
          cum.set(key, c);
        });
        const snap = [...cum.values()].filter(isValid).sort(sortFn);
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
  }, [filteredCareer, filteredSeason, stat, register, maxSeason, scope]);

  const yearlyData = useMemo(() => {
    if (!["yearly", "yby"].includes(register)) return [];

    if (register === "yearly") {
      const groups = new Map<string, RawRow[]>();
      filteredSeason.forEach(r => {
        const k = `${r.SeasonID}|${r.LeagueName}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(r);
      });
      const results: any[] = [];
      groups.forEach((rows, key) => {
        const [sidStr, league] = key.split("|");
        const valid = rows.filter(isValid).sort(sortFn);
        if (!valid.length) return;
        const topVal = val(valid[0], stat);
        const leaders = valid.filter(r => val(r, stat) === topVal);
        results.push({ seasonID: parseInt(sidStr), league,
          entry: { ...leaders[0], _leaders: leaders, _isTie: leaders.length > 1,
            PlayerName: leaders.map(l => l.PlayerName).join(" / "), statVal: topVal }});
      });
      return results.sort((a, b) => a.seasonID - b.seasonID || a.league.localeCompare(b.league));
    }

    // yby
    const groups2 = new Map<number, RawRow[]>();
    filteredSeason.forEach(r => {
      if (r.SeasonID == null) return;
      if (!groups2.has(r.SeasonID)) groups2.set(r.SeasonID, []);
      groups2.get(r.SeasonID)!.push(r);
    });
    const results2: any[] = [];
    groups2.forEach((rows, sid) => {
      const valid = rows.filter(isValid).sort(sortFn);
      if (!valid.length) return;
      const topVal = val(valid[0], stat);
      const leaders = valid.filter(r => val(r, stat) === topVal);
      results2.push({ seasonID: sid, league: "",
        entry: { ...leaders[0], _leaders: leaders, _isTie: leaders.length > 1,
          PlayerName: leaders.map(l => l.PlayerName).join(" / "), statVal: topVal }});
    });
    return results2.sort((a, b) => a.seasonID - b.seasonID);
  }, [filteredSeason, stat, register, scope]);

  // ── Rendering ────────────────────────────────────────────────────────────────
  const showSeason = ["season", "progressive", "yearly", "yby"].includes(register);
  const thCls = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

  const PlayerLink = ({ name, pid }: { name: string; pid?: number | null }) =>
    pid ? <Link to={`/player/${pid}`} className="text-accent hover:underline">{name}</Link>
        : <span>{name}</span>;

  const renderRow = (entry: any, i: number) => {
    const lid = entry.LeagueName ? lgIdByName.get(entry.LeagueName) : null;
    const team = entry.TeamFullName;
    return (
      <tr key={`${entry.PlayerName}-${entry.SeasonID}-${i}`}
        className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20 transition-colors`}>
        <td className="px-3 py-1.5 font-mono text-muted-foreground text-sm w-8">{i + 1}</td>
        <td className="px-3 py-1.5 font-medium">
          {entry._isTie
            ? <span>{(entry._leaders as any[]).map((l: any, li: number) => (
                <span key={li}>{li > 0 && " / "}<PlayerLink name={l.PlayerName} pid={l.PlayerID} /></span>
              ))}<span className="text-muted-foreground text-xs ml-1">(tie)</span></span>
            : <PlayerLink name={entry.PlayerName} pid={entry.PlayerID} />}
        </td>
        <td className="px-3 py-1.5 text-muted-foreground text-xs">{entry.Position || "—"}</td>
        <td className="px-3 py-1.5 text-xs">
          {team
            ? <Link to={`/team/${encodeURIComponent(team)}`} className="text-accent hover:underline">{team}</Link>
            : "—"}
        </td>
        {showSeason && (
          <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
            {entry.SeasonID
              ? lid
                ? <Link to={`/league/${lid}/history`} className="text-accent hover:underline">{sl(entry.SeasonID)}</Link>
                : sl(entry.SeasonID)
              : "—"}
          </td>
        )}
        <td className="px-3 py-1.5 text-right font-mono font-bold">{fmt(entry.statVal, stat)}</td>
      </tr>
    );
  };

  const Skeleton = () => (
    <div className="bg-card">
      {[...Array(15)].map((_, i) => (
        <div key={i} className={`border-t border-border px-3 py-2.5 flex gap-4 animate-pulse ${i % 2 === 1 ? "bg-table-stripe" : ""}`}>
          <div className="w-5 h-3 bg-secondary rounded shrink-0" />
          <div className="h-3 bg-secondary rounded" style={{ width: `${35 + (i * 19) % 40}%` }} />
          <div className="h-3 bg-secondary rounded w-12 ml-auto" />
          <div className="h-3 bg-secondary rounded w-16" />
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
          {rows.map((r, i) => renderRow(r, i))}
          {rows.length === 0 && (
            <tr><td colSpan={showSeason ? 6 : 5} className="px-3 py-8 text-center text-muted-foreground italic">
              No data available.
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderYearly = () => yearlyData.length === 0
    ? <p className="text-muted-foreground font-sans py-8 text-center italic px-3">No data available.</p>
    : <div className="overflow-x-auto"><table className="w-full text-sm font-sans">
        <thead><tr className="bg-secondary">
          <th className={`${thCls} text-left`}>Season</th>
          {register === "yearly" && <th className={`${thCls} text-left`}>League</th>}
          <th className={`${thCls} text-left`}>Player</th>
          <th className={`${thCls} text-left`}>Pos</th>
          <th className={`${thCls} text-left`}>Team</th>
          <th className={`${thCls} text-right`}>{statInfo.abbr}</th>
        </tr></thead>
        <tbody>{yearlyData.map((g, i) => {
          const e = g.entry;
          const lid = g.league ? lgIdByName.get(g.league) : null;
          return (
            <tr key={`${g.seasonID}-${g.league}-${i}`}
              className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
              <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                {lid ? <Link to={`/league/${lid}/history`} className="text-accent hover:underline">{sl(g.seasonID)}</Link> : sl(g.seasonID)}
              </td>
              {register === "yearly" && (
                <td className="px-3 py-1.5 text-xs text-muted-foreground">
                  {lid ? <Link to={`/league/${lid}`} className="hover:underline hover:text-accent">{g.league}</Link> : g.league}
                </td>
              )}
              <td className="px-3 py-1.5 font-medium">
                {e._isTie
                  ? <span>{(e._leaders as any[]).map((l: any, li: number) => (
                      <span key={li}>{li > 0 && " / "}<PlayerLink name={l.PlayerName} pid={l.PlayerID} /></span>
                    ))}<span className="text-muted-foreground text-xs ml-1">(tie)</span></span>
                  : <PlayerLink name={e.PlayerName} pid={e.PlayerID} />}
              </td>
              <td className="px-3 py-1.5 text-xs text-muted-foreground">{e.Position}</td>
              <td className="px-3 py-1.5 text-xs">
                {e.TeamFullName ? <Link to={`/team/${encodeURIComponent(e.TeamFullName)}`} className="text-accent hover:underline">{e.TeamFullName}</Link> : "—"}
              </td>
              <td className="px-3 py-1.5 text-right font-mono font-bold">{fmt(e.statVal, stat)}</td>
            </tr>
          );
        })}</tbody>
      </table></div>;

  return (
    <div className="min-h-screen bg-background flex flex-col pb-14 md:pb-0">
      <SiteHeader />
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-2">
          <h1 className="font-display text-3xl font-bold text-foreground">Statistical Leaders</h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">All-time records and seasonal leaderboards</p>
        </div>

        <div className="flex gap-2 mb-4">
          {(["club", "intl"] as const).map(s => (
            <button key={s} onClick={() => setParam("scope", s)}
              className={`px-4 py-2 text-sm font-sans font-medium rounded transition-colors ${scope === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              {s === "club" ? "Club Stats" : "International Stats"}
            </button>
          ))}
        </div>

        <div className="flex gap-0 mb-4 border-b border-border overflow-x-auto scrollbar-hide">
          {REGS.map(r => (
            <button key={r.key} onClick={() => setParam("reg", r.key)}
              className={`px-3 py-2 text-sm font-sans font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${register === r.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {r.label}
            </button>
          ))}
        </div>

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

        {error && (
          <div className="mb-4 border border-red-500/40 rounded bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400 font-sans">
            {error}
            <button onClick={() => window.location.reload()} className="ml-3 underline hover:no-underline">Retry</button>
          </div>
        )}

        <div className="border border-border rounded overflow-hidden">
          <div className="bg-table-header px-3 py-2 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-table-header-foreground">
              {REGS.find(r => r.key === register)?.label} — {statInfo.label}
              {!loading && rawRows.length > 0 && (
                <span className="text-table-header-foreground/60 font-sans font-normal text-xs ml-2">
                  ({filteredCareer.length} players)
                </span>
              )}
            </h3>
          </div>
          {loading ? <Skeleton />
            : register === "yearly" || register === "yby" ? renderYearly()
            : renderTable(leaderboard)}
        </div>
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
