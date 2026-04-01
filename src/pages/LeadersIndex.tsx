import { useEffect, useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

/* ── types ── */
interface RawStat {
  PlayerName: string | null;
  FullName: string | null;
  GamesPlayed: number | null;
  Goals: number | null;
  GoldenSnitchCatches: number | null;
  KeeperSaves: number | null;
  KeeperShotsFaced: number | null;
  Position: string | null;
  Nation: string | null;
  SeasonID: number | null;
  LeagueName: string | null;
}

interface MinRow {
  PlayerName: string | null;
  FullName: string | null;
  SeasonID: number | null;
  LeagueName: string | null;
  MinutesPlayed: number | null;
}

interface LeagueInfo {
  LeagueID: number;
  LeagueName: string | null;
  LeagueTier: number | null;
}

/* aggregated line at season+league grain */
interface SLLine {
  PlayerName: string;
  SeasonID: number;
  LeagueName: string;
  Teams: string[];
  Positions: string[];
  Nation: string;
  GP: number;
  G: number;
  GSC: number;
  KS: number;
  KSF: number;
  MIN: number;
}

/* career grain */
interface CareerLine {
  PlayerName: string;
  Team: string;
  Positions: string[];
  Nation: string;
  LatestSeason: number;
  GP: number;
  G: number;
  GSC: number;
  KS: number;
  KSF: number;
  MIN: number;
}

/* progressive entry */
interface ProgEntry {
  PlayerName: string;
  Team: string;
  SeasonID: number;
  value: number;
}

/* ── constants ── */
type StatCat = "GP" | "MIN" | "G" | "MIN_G" | "GSC" | "GSC_PCT" | "MIN_GSC" | "KSF" | "KSF_GP" | "MIN_KSF" | "KS" | "SV_PCT" | "KS_GP";
type RegType = "career" | "active" | "season" | "progressive" | "yearly" | "yby";

const STATS: { key: StatCat; label: string; abbr: string; higher: boolean }[] = [
  { key: "GP", label: "Games Played", abbr: "GP", higher: true },
  { key: "MIN", label: "Minutes Played", abbr: "MIN", higher: true },
  { key: "G", label: "Goals", abbr: "G", higher: true },
  { key: "MIN_G", label: "Minutes per Goal", abbr: "MIN/G", higher: false },
  { key: "GSC", label: "Golden Snitch Catches", abbr: "GSC", higher: true },
  { key: "GSC_PCT", label: "Snitch Percentage", abbr: "GSC%", higher: true },
  { key: "MIN_GSC", label: "Minutes per Snitch", abbr: "MIN/GSC", higher: false },
  { key: "KSF", label: "Shots Faced", abbr: "SF", higher: true },
  { key: "KSF_GP", label: "Shots Faced per Game", abbr: "SF/G", higher: true },
  { key: "MIN_KSF", label: "Minutes per Shot Faced", abbr: "MIN/SF", higher: false },
  { key: "KS", label: "Saves", abbr: "SV", higher: true },
  { key: "SV_PCT", label: "Save Percentage", abbr: "SV%", higher: true },
  { key: "KS_GP", label: "Saves per Game", abbr: "SV/G", higher: true },
];

const REGS: { key: RegType; label: string }[] = [
  { key: "career", label: "Career" },
  { key: "active", label: "Active" },
  { key: "season", label: "Single Season" },
  { key: "progressive", label: "Progressive" },
  { key: "yearly", label: "Yearly League" },
  { key: "yby", label: "Year-by-Year" },
];

function val(line: { GP: number; G: number; GSC: number; KS: number; KSF: number; MIN: number }, cat: StatCat): number | null {
  const { GP, G, GSC, KS, KSF, MIN } = line;
  switch (cat) {
    case "GP": return GP;
    case "MIN": return MIN;
    case "G": return G;
    case "MIN_G": return G > 0 ? MIN / G : null;
    case "GSC": return GSC;
    case "GSC_PCT": return GP > 0 ? GSC / GP : null;
    case "MIN_GSC": return GSC > 0 ? MIN / GSC : null;
    case "KSF": return KSF;
    case "KSF_GP": return GP > 0 ? KSF / GP : null;
    case "MIN_KSF": return KSF > 0 ? MIN / KSF : null;
    case "KS": return KS;
    case "SV_PCT": return KSF > 0 ? KS / KSF : null;
    case "KS_GP": return GP > 0 ? KS / GP : null;
  }
}

function fmt(v: number | null, cat: StatCat): string {
  if (v === null) return "—";
  if (cat === "GSC_PCT" || cat === "SV_PCT") return (v * 100).toFixed(1) + "%";
  if (["MIN_G", "MIN_GSC", "MIN_KSF", "KSF_GP", "KS_GP"].includes(cat)) return v.toFixed(2);
  return String(Math.round(v));
}

function seasonLabel(id: number): string {
  return `${id - 1}–${String(id).slice(-2)}`;
}

/* ── component ── */
export default function LeadersIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = (searchParams.get("scope") as "club" | "intl") || "club";
  const stat = (searchParams.get("stat") as StatCat) || "G";
  const register = (searchParams.get("reg") as RegType) || "career";

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const [rawStats, setRawStats] = useState<RawStat[]>([]);
  const [rawMin, setRawMin] = useState<MinRow[]>([]);
  const [playerMap, setPlayerMap] = useState<Map<string, number>>(new Map());
  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [statsData, minData, pl, lg] = await Promise.all([
        fetchAllRows<RawStat>("stats"),
        fetchAllRows<MinRow>("player_season_minutes"),
        supabase.from("players").select("PlayerID, PlayerName"),
        supabase.from("leagues").select("LeagueID, LeagueName, LeagueTier"),
      ]);
      setRawStats(statsData);
      setRawMin(minData);
      const pm = new Map<string, number>();
      (pl.data || []).forEach((p: any) => { if (p.PlayerName) pm.set(p.PlayerName, p.PlayerID); });
      setPlayerMap(pm);
      if (lg.data) setLeagues(lg.data as LeagueInfo[]);
      setLoading(false);
    })();
  }, []);

  /* intl league names set */
  const intlLeagues = useMemo(() => new Set(leagues.filter(l => l.LeagueTier === 0).map(l => l.LeagueName)), [leagues]);

  /* season+league lines */
  const slLines = useMemo(() => {
    // build minutes map
    const minMap = new Map<string, number>();
    rawMin.forEach(m => {
      if (!m.PlayerName || m.SeasonID == null || !m.LeagueName) return;
      // filter scope
      const isIntl = intlLeagues.has(m.LeagueName);
      if (scope === "club" && isIntl) return;
      if (scope === "intl" && !isIntl) return;
      const key = `${m.PlayerName}||${m.SeasonID}||${m.LeagueName}`;
      minMap.set(key, (minMap.get(key) || 0) + (m.MinutesPlayed || 0));
    });

    // aggregate stats
    const map = new Map<string, SLLine>();
    rawStats.forEach(s => {
      if (!s.PlayerName || s.SeasonID == null || !s.LeagueName) return;
      const isIntl = intlLeagues.has(s.LeagueName);
      if (scope === "club" && isIntl) return;
      if (scope === "intl" && !isIntl) return;
      const key = `${s.PlayerName}||${s.SeasonID}||${s.LeagueName}`;
      let line = map.get(key);
      if (!line) {
        const minKey = key;
        line = {
          PlayerName: s.PlayerName,
          SeasonID: s.SeasonID,
          LeagueName: s.LeagueName,
          Teams: [],
          Positions: [],
          Nation: s.Nation || "",
          GP: 0, G: 0, GSC: 0, KS: 0, KSF: 0,
          MIN: minMap.get(minKey) || 0,
        };
        map.set(key, line);
      }
      line.GP += s.GamesPlayed || 0;
      line.G += s.Goals || 0;
      line.GSC += s.GoldenSnitchCatches || 0;
      line.KS += s.KeeperSaves || 0;
      line.KSF += s.KeeperShotsFaced || 0;
      if (s.FullName && !line.Teams.includes(s.FullName)) line.Teams.push(s.FullName);
      if (s.Position && !line.Positions.includes(s.Position)) line.Positions.push(s.Position);
    });
    return [...map.values()];
  }, [rawStats, rawMin, scope, intlLeagues]);

  /* season lines (per player per season, across leagues) */
  const seasonLines = useMemo(() => {
    const map = new Map<string, SLLine>();
    slLines.forEach(sl => {
      const key = `${sl.PlayerName}||${sl.SeasonID}`;
      let line = map.get(key);
      if (!line) {
        line = { ...sl, Teams: [...sl.Teams], Positions: [...sl.Positions] };
        map.set(key, line);
      } else {
        line.GP += sl.GP;
        line.G += sl.G;
        line.GSC += sl.GSC;
        line.KS += sl.KS;
        line.KSF += sl.KSF;
        line.MIN += sl.MIN;
        sl.Teams.forEach(t => { if (!line!.Teams.includes(t)) line!.Teams.push(t); });
        sl.Positions.forEach(p => { if (!line!.Positions.includes(p)) line!.Positions.push(p); });
      }
    });
    return [...map.values()];
  }, [slLines]);

  /* career lines */
  const careerLines = useMemo(() => {
    const map = new Map<string, CareerLine>();
    slLines.forEach(sl => {
      let c = map.get(sl.PlayerName);
      if (!c) {
        c = {
          PlayerName: sl.PlayerName,
          Team: sl.Teams[0] || "",
          Positions: [...sl.Positions],
          Nation: sl.Nation,
          LatestSeason: sl.SeasonID,
          GP: 0, G: 0, GSC: 0, KS: 0, KSF: 0, MIN: 0,
        };
        map.set(sl.PlayerName, c);
      }
      c.GP += sl.GP;
      c.G += sl.G;
      c.GSC += sl.GSC;
      c.KS += sl.KS;
      c.KSF += sl.KSF;
      c.MIN += sl.MIN;
      sl.Positions.forEach(p => { if (!c!.Positions.includes(p)) c!.Positions.push(p); });
      if (sl.SeasonID > c.LatestSeason) {
        c.LatestSeason = sl.SeasonID;
        c.Team = sl.Teams[0] || c.Team;
      }
    });
    return [...map.values()];
  }, [slLines]);

  const maxSeason = useMemo(() => Math.max(0, ...careerLines.map(c => c.LatestSeason)), [careerLines]);

  /* compute leaderboard for given register */
  const leaderboard = useMemo(() => {
    const info = STATS.find(s => s.key === stat)!;
    const sortFn = (a: any, b: any) => {
      const va = val(a, stat);
      const vb = val(b, stat);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return info.higher ? vb - va : va - vb;
    };
    const filterValid = (line: any) => val(line, stat) !== null;

    if (register === "career") {
      return careerLines.filter(filterValid).sort(sortFn).slice(0, 25).map(c => ({
        ...c, statVal: val(c, stat), team: c.Team, season: null as number | null,
      }));
    }
    if (register === "active") {
      return careerLines.filter(c => c.LatestSeason === maxSeason && filterValid(c)).sort(sortFn).slice(0, 25).map(c => ({
        ...c, statVal: val(c, stat), team: c.Team, season: null as number | null,
      }));
    }
    if (register === "season") {
      return seasonLines.filter(filterValid).sort(sortFn).slice(0, 25).map(s => ({
        PlayerName: s.PlayerName, GP: s.GP, G: s.G, GSC: s.GSC, KS: s.KS, KSF: s.KSF, MIN: s.MIN,
        Positions: s.Positions, Nation: s.Nation,
        statVal: val(s, stat), team: s.Teams.join(", "), season: s.SeasonID,
      }));
    }
    if (register === "progressive") {
      // chronological career accumulation, track record-breaking moments
      const sorted = [...seasonLines].sort((a, b) => a.SeasonID - b.SeasonID);
      const cum = new Map<string, { GP: number; G: number; GSC: number; KS: number; KSF: number; MIN: number; team: string }>();
      let record = info.higher ? -Infinity : Infinity;
      const entries: any[] = [];
      sorted.forEach(s => {
        let c = cum.get(s.PlayerName);
        if (!c) c = { GP: 0, G: 0, GSC: 0, KS: 0, KSF: 0, MIN: 0, team: s.Teams[0] || "" };
        c.GP += s.GP; c.G += s.G; c.GSC += s.GSC; c.KS += s.KS; c.KSF += s.KSF; c.MIN += s.MIN;
        c.team = s.Teams[0] || c.team;
        cum.set(s.PlayerName, c);
        const v = val(c, stat);
        if (v !== null && ((info.higher && v > record) || (!info.higher && v < record))) {
          record = v;
          entries.push({
            PlayerName: s.PlayerName, ...c, Positions: s.Positions, Nation: s.Nation,
            statVal: v, team: c.team, season: s.SeasonID,
          });
        }
      });
      return entries;
    }
    return [];
  }, [careerLines, seasonLines, stat, register, maxSeason]);

  /* yearly data (per season per league) */
  const yearlyData = useMemo(() => {
    if (register !== "yearly" && register !== "yby") return [];
    const info = STATS.find(s => s.key === stat)!;
    const sortFn = (a: any, b: any) => {
      const va = val(a, stat);
      const vb = val(b, stat);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return info.higher ? vb - va : va - vb;
    };

    if (register === "yearly") {
      // group by season+league
      const groups = new Map<string, SLLine[]>();
      slLines.forEach(sl => {
        if (sl.GP < 5) return;
        const key = `${sl.SeasonID}||${sl.LeagueName}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(sl);
      });
      const result: { label: string; seasonID: number; league: string; entries: any[] }[] = [];
      [...groups.entries()].forEach(([key, lines]) => {
        const [sid, league] = key.split("||");
        const sorted = lines.filter(l => val(l, stat) !== null).sort(sortFn).slice(0, 10);
        if (sorted.length > 0) {
          result.push({
            label: `${seasonLabel(Number(sid))} ${league}`,
            seasonID: Number(sid),
            league,
            entries: sorted.map(s => ({
              PlayerName: s.PlayerName, ...s, statVal: val(s, stat), team: s.Teams.join(", "), season: Number(sid),
            })),
          });
        }
      });
      return result.sort((a, b) => b.seasonID - a.seasonID || a.league.localeCompare(b.league));
    }

    // yby: group by season
    const groups = new Map<number, SLLine[]>();
    seasonLines.forEach(sl => {
      if (sl.GP < 5) return;
      if (!groups.has(sl.SeasonID)) groups.set(sl.SeasonID, []);
      groups.get(sl.SeasonID)!.push(sl);
    });
    const result: { label: string; seasonID: number; league: string; entries: any[] }[] = [];
    [...groups.entries()].forEach(([sid, lines]) => {
      const sorted = lines.filter(l => val(l, stat) !== null).sort(sortFn).slice(0, 10);
      if (sorted.length > 0) {
        result.push({
          label: seasonLabel(sid),
          seasonID: sid,
          league: "",
          entries: sorted.map(s => ({
            PlayerName: s.PlayerName, ...s, statVal: val(s, stat), team: s.Teams.join(", "), season: sid,
          })),
        });
      }
    });
    return result.sort((a, b) => b.seasonID - a.seasonID);
  }, [slLines, seasonLines, stat, register]);

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground";
  const statInfo = STATS.find(s => s.key === stat)!;

  const renderRow = (entry: any, i: number) => {
    const pid = playerMap.get(entry.PlayerName);
    return (
      <tr key={`${entry.PlayerName}-${entry.season}-${i}`}
        className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20 transition-colors`}>
        <td className="px-3 py-1.5 font-mono text-muted-foreground">{i + 1}</td>
        <td className="px-3 py-1.5 font-medium text-accent hover:underline">
          {pid ? <Link to={`/player/${pid}`}>{entry.PlayerName}</Link> : entry.PlayerName}
        </td>
        <td className="px-3 py-1.5 text-muted-foreground text-xs">{entry.Positions?.join(", ") || ""}</td>
        <td className="px-3 py-1.5 text-accent hover:underline text-xs">
          {entry.team ? <Link to={`/team/${encodeURIComponent(entry.team.split(", ")[0])}`}>{entry.team}</Link> : "—"}
        </td>
        {entry.season && <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{seasonLabel(entry.season)}</td>}
        <td className="px-3 py-1.5 text-right font-mono font-bold">{fmt(entry.statVal, stat)}</td>
      </tr>
    );
  };

  const renderTable = (rows: any[], showSeason: boolean) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm font-sans">
        <thead>
          <tr className="bg-secondary">
            <th className={`${thClass} text-left`}>#</th>
            <th className={`${thClass} text-left`}>Player</th>
            <th className={`${thClass} text-left`}>Pos</th>
            <th className={`${thClass} text-left`}>Team</th>
            {showSeason && <th className={`${thClass} text-left`}>Season</th>}
            <th className={`${thClass} text-right`}>{statInfo.abbr}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => renderRow(r, i))}
          {rows.length === 0 && (
            <tr><td colSpan={showSeason ? 6 : 5} className="px-3 py-4 text-center text-muted-foreground italic">No data available.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const isYearly = register === "yearly" || register === "yby";
  const showSeason = register === "season" || register === "progressive";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-2">
          <h1 className="font-display text-3xl font-bold text-foreground">Statistical Leaders</h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">All-time records and seasonal leaderboards</p>
        </div>

        {/* Scope tabs */}
        <div className="flex gap-2 mb-4">
          {(["club", "intl"] as const).map(s => (
            <button key={s} onClick={() => set("scope", s)}
              className={`px-4 py-2 text-sm font-sans font-medium rounded transition-colors ${
                scope === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}>
              {s === "club" ? "Club Stats" : "International Stats"}
            </button>
          ))}
        </div>

        {/* Register tabs */}
        <div className="flex gap-1 mb-4 border-b border-border overflow-x-auto">
          {REGS.map(r => (
            <button key={r.key} onClick={() => set("reg", r.key)}
              className={`px-3 py-2 text-sm font-sans font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                register === r.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {r.label}
            </button>
          ))}
        </div>

        {/* Stat category selector */}
        <div className="mb-4 flex items-center gap-3">
          <label className="text-sm font-sans font-medium text-muted-foreground">Statistic:</label>
          <select
            value={stat}
            onChange={e => set("stat", e.target.value)}
            className="text-sm bg-popover text-popover-foreground border border-border rounded px-3 py-1.5 font-sans"
          >
            {STATS.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-muted-foreground font-sans py-8 text-center">Loading statistics...</p>
        ) : isYearly ? (
          <div className="space-y-6">
            {yearlyData.length === 0 && (
              <p className="text-muted-foreground font-sans py-8 text-center italic">No data available.</p>
            )}
            {yearlyData.map(group => (
              <div key={group.label} className="border border-border rounded overflow-hidden">
                <div className="bg-table-header px-3 py-2">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">{group.label}</h3>
                </div>
                {renderTable(group.entries, false)}
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-border rounded overflow-hidden">
            <div className="bg-table-header px-3 py-2">
              <h3 className="font-display text-sm font-bold text-table-header-foreground">
                {REGS.find(r => r.key === register)?.label} — {statInfo.label}
              </h3>
            </div>
            {renderTable(leaderboard, showSeason)}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
