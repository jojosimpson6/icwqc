import { useEffect, useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

/* ── types ── */
/* Row from player_season_stats view — only columns we need for leaderboard computation */
interface RawStat {
  PlayerName: string | null;
  Position: string | null;
  Nation: string | null;
  FullName: string | null;
  SeasonID: number | null;
  LeagueName: string | null;
  GamesPlayed: number | null;
  MinPlayed: number | null;
  Goals: number | null;
  GoldenSnitchCatches: number | null;
  KeeperSaves: number | null;
  KeeperShotsFaced: number | null;
  ShotAtt: number | null;
  ShotScored: number | null;
  PassAtt: number | null;
  PassComp: number | null;
  KeeperPassAtt: number | null;
  KeeperPassComp: number | null;
  BludgersHit: number | null;
  TurnoversForced: number | null;
  TeammatesProtected: number | null;
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
  BH: number;
  TF: number;
  TP: number;
  ShotAtt: number;
  ShotScored: number;
  PassAtt: number;
  PassComp: number;
  KPassAtt: number;
  KPassComp: number;
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
  BH: number;
  TF: number;
  TP: number;
  ShotAtt: number;
  ShotScored: number;
  PassAtt: number;
  PassComp: number;
  KPassAtt: number;
  KPassComp: number;
}

/* progressive entry */
interface ProgEntry {
  PlayerName: string;
  Team: string;
  SeasonID: number;
  value: number;
}

/* ── constants ── */
type StatCat =
  | "GP" | "MIN"
  | "G" | "G_GP" | "SH_PCT" | "PASS_PCT_C" | "MIN_G"
  | "GSC" | "GSC_PCT" | "MIN_GSC"
  | "KSF" | "KSF_GP" | "KS" | "SV_PCT" | "KS_GP" | "PASS_PCT_K"
  | "BH" | "BH_GP" | "TF" | "TF_GP" | "TP" | "TP_GP";
type RegType = "career" | "active" | "season" | "progressive" | "yearly" | "yby";

const STATS: { key: StatCat; label: string; abbr: string; higher: boolean; minGP?: number; requirePos?: string }[] = [
  // General
  { key: "GP",         label: "Games Played",               abbr: "GP",       higher: true },
  { key: "MIN",        label: "Minutes Played",              abbr: "MIN",      higher: true },
  // Chaser
  { key: "G",          label: "Goals",                       abbr: "G",        higher: true,  requirePos: "Chaser" },
  { key: "G_GP",       label: "Goals per Game",              abbr: "G/GP",     higher: true,  minGP: 10, requirePos: "Chaser" },
  { key: "SH_PCT",     label: "Shooting %",                  abbr: "SH%",      higher: true,  minGP: 10, requirePos: "Chaser" },
  { key: "PASS_PCT_C", label: "Pass % (Chaser)",             abbr: "PASS%",    higher: true,  minGP: 10, requirePos: "Chaser" },
  { key: "MIN_G",      label: "Minutes per Goal",            abbr: "MIN/G",    higher: false, minGP: 10, requirePos: "Chaser" },
  // Seeker
  { key: "GSC",        label: "Snitch Catches",              abbr: "GSC",      higher: true,  requirePos: "Seeker" },
  { key: "GSC_PCT",    label: "Snitch %",                    abbr: "GSC%",     higher: true,  minGP: 10, requirePos: "Seeker" },
  { key: "MIN_GSC",    label: "Minutes per Snitch",          abbr: "MIN/GSC",  higher: false, minGP: 10, requirePos: "Seeker" },
  // Keeper
  { key: "KSF",        label: "Shots Faced",                 abbr: "SF",       higher: true,  requirePos: "Keeper" },
  { key: "KSF_GP",     label: "Shots Faced per Game",        abbr: "SF/GP",    higher: true,  minGP: 10, requirePos: "Keeper" },
  { key: "KS",         label: "Saves",                       abbr: "SV",       higher: true,  requirePos: "Keeper" },
  { key: "SV_PCT",     label: "Save %",                      abbr: "SV%",      higher: true,  minGP: 10, requirePos: "Keeper" },
  { key: "KS_GP",      label: "Saves per Game",              abbr: "SV/GP",    higher: true,  minGP: 10, requirePos: "Keeper" },
  { key: "PASS_PCT_K", label: "Pass % (Keeper)",             abbr: "KP%",      higher: true,  minGP: 10, requirePos: "Keeper" },
  // Beater
  { key: "BH",         label: "Bludgers Hit",                abbr: "BH",       higher: true,  requirePos: "Beater" },
  { key: "BH_GP",      label: "Bludgers Hit per Game",       abbr: "BH/GP",    higher: true,  minGP: 10, requirePos: "Beater" },
  { key: "TF",         label: "Turnovers Forced",            abbr: "TF",       higher: true,  requirePos: "Beater" },
  { key: "TF_GP",      label: "Turnovers Forced per Game",   abbr: "TF/GP",    higher: true,  minGP: 10, requirePos: "Beater" },
  { key: "TP",         label: "Teammates Protected",         abbr: "TP",       higher: true,  requirePos: "Beater" },
  { key: "TP_GP",      label: "Teammates Protected per Game", abbr: "TP/GP",   higher: true,  minGP: 10, requirePos: "Beater" },
];

const REGS: { key: RegType; label: string }[] = [
  { key: "career", label: "Career" },
  { key: "active", label: "Active" },
  { key: "season", label: "Single Season" },
  { key: "progressive", label: "Progressive" },
  { key: "yearly", label: "Yearly League" },
  { key: "yby", label: "Year-by-Year" },
];

function val(line: SLLine, cat: StatCat): number | null {
  const { GP, G, GSC, KS, KSF, MIN, BH, TF, TP, ShotAtt, ShotScored, PassAtt, PassComp, KPassAtt, KPassComp } = line;
  const statDef = STATS.find(s => s.key === cat);
  const minGP = statDef?.minGP ?? 0;
  if (GP < minGP) return null;
  switch (cat) {
    case "GP": return GP;
    case "MIN": return MIN > 0 ? MIN : null;
    case "G": return G > 0 ? G : null;
    case "G_GP": return GP > 0 && G > 0 ? G / GP : null;
    case "SH_PCT": return ShotAtt > 0 ? ShotScored / ShotAtt : null;
    case "PASS_PCT_C": return PassAtt > 0 ? PassComp / PassAtt : null;
    case "MIN_G": return G > 0 && MIN > 0 ? MIN / G : null;
    case "GSC": return GSC > 0 ? GSC : null;
    case "GSC_PCT": return GP > 0 && GSC > 0 ? GSC / GP : null;
    case "MIN_GSC": return GSC > 0 && MIN > 0 ? MIN / GSC : null;
    case "KSF": return KSF > 0 ? KSF : null;
    case "KSF_GP": return GP > 0 && KSF > 0 ? KSF / GP : null;
    case "KS": return KS > 0 ? KS : null;
    case "SV_PCT": return KSF > 0 ? KS / KSF : null;
    case "KS_GP": return GP > 0 && KS > 0 ? KS / GP : null;
    case "PASS_PCT_K": return KPassAtt > 0 ? KPassComp / KPassAtt : null;
    case "BH": return BH > 0 ? BH : null;
    case "BH_GP": return GP > 0 && BH > 0 ? BH / GP : null;
    case "TF": return TF > 0 ? TF : null;
    case "TF_GP": return GP > 0 && TF > 0 ? TF / GP : null;
    case "TP": return TP > 0 ? TP : null;
    case "TP_GP": return GP > 0 && TP > 0 ? TP / GP : null;
  }
}

function fmt(v: number | null, cat: StatCat): string {
  if (v === null) return "—";
  if (["GSC_PCT", "SV_PCT", "SH_PCT", "PASS_PCT_C", "PASS_PCT_K"].includes(cat)) return (v * 100).toFixed(1) + "%";
  if (["MIN_G", "MIN_GSC", "KSF_GP", "KS_GP", "G_GP", "BH_GP", "TF_GP", "TP_GP"].includes(cat)) return v.toFixed(2);
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
  const [playerMap, setPlayerMap] = useState<Map<string, number>>(new Map());
  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [intlTeamNames, setIntlTeamNames] = useState<Set<string>>(new Set());
  const [leagueIdByName, setLeagueIdByName] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);

      // All fetches go through queryCache (memory + sessionStorage), no manual caching needed
      const [lg, teamsData, statsData, playersData] = await Promise.all([
        supabase.from("leagues").select("LeagueID, LeagueName, LeagueTier"),
        fetchAllRows("teams", { select: "TeamID, FullName", order: { column: "TeamID", ascending: true } }),
        fetchAllRows<RawStat>("player_season_stats", {
          select: "PlayerName,Position,Nation,FullName,SeasonID,LeagueName,GamesPlayed,MinPlayed,Goals,GoldenSnitchCatches,KeeperSaves,KeeperShotsFaced,ShotAtt,ShotScored,PassAtt,PassComp,KeeperPassAtt,KeeperPassComp,BludgersHit,TurnoversForced,TeammatesProtected",
          order: { column: "PlayerName", ascending: true },
        }),
        fetchAllRows("players", { select: "PlayerID, PlayerName", order: { column: "PlayerID", ascending: true } }),
      ]);

      setRawStats(statsData || []);
      const pm = new Map<string, number>();
      (playersData || []).forEach((p: any) => { if (p.PlayerName) pm.set(p.PlayerName, p.PlayerID); });
      setPlayerMap(pm);
      if (lg.data) {
        setLeagues(lg.data as LeagueInfo[]);
        const lim = new Map<string, number>();
        (lg.data as LeagueInfo[]).forEach(l => { if (l.LeagueName && l.LeagueID) lim.set(l.LeagueName, l.LeagueID); });
        setLeagueIdByName(lim);
      }
      const intlNames = new Set<string>();
      (teamsData || []).forEach((t: any) => { if (t.TeamID > 1000 && t.FullName) intlNames.add(t.FullName); });
      setIntlTeamNames(intlNames);
      setLoading(false);
    })();
  }, []);

  /* intl league names set — kept for reference but intl scope now uses team IDs */
  const intlLeagues = useMemo(() => new Set(leagues.filter(l => l.LeagueTier === 0).map(l => l.LeagueName)), [leagues]);

  /* season+league lines — built directly from player_season_stats view */
  const slLines = useMemo(() => {
    const map = new Map<string, SLLine>();
    rawStats.forEach(s => {
      if (!s.PlayerName || s.SeasonID == null || !s.LeagueName) return;
      const isIntl = s.FullName ? intlTeamNames.has(s.FullName) : intlLeagues.has(s.LeagueName);
      if (scope === "club" && isIntl) return;
      if (scope === "intl" && !isIntl) return;
      const key = `${s.PlayerName}||${s.SeasonID}||${s.LeagueName}`;
      let line = map.get(key);
      if (!line) {
        line = {
          PlayerName: s.PlayerName,
          SeasonID: s.SeasonID,
          LeagueName: s.LeagueName,
          Teams: [],
          Positions: [],
          Nation: s.Nation || "",
          GP: 0, G: 0, GSC: 0, KS: 0, KSF: 0, MIN: 0,
          BH: 0, TF: 0, TP: 0,
          ShotAtt: 0, ShotScored: 0,
          PassAtt: 0, PassComp: 0,
          KPassAtt: 0, KPassComp: 0,
        };
        map.set(key, line);
      }
      line.GP += s.GamesPlayed || 0;
      line.G += s.Goals || 0;
      line.GSC += s.GoldenSnitchCatches || 0;
      line.KS += s.KeeperSaves || 0;
      line.KSF += s.KeeperShotsFaced || 0;
      line.MIN += s.MinPlayed || 0;
      line.BH += s.BludgersHit || 0;
      line.TF += s.TurnoversForced || 0;
      line.TP += s.TeammatesProtected || 0;
      line.ShotAtt += s.ShotAtt || 0;
      line.ShotScored += s.ShotScored || 0;
      line.PassAtt += s.PassAtt || 0;
      line.PassComp += s.PassComp || 0;
      line.KPassAtt += s.KeeperPassAtt || 0;
      line.KPassComp += s.KeeperPassComp || 0;
      if (s.FullName && !line.Teams.includes(s.FullName)) line.Teams.push(s.FullName);
      if (s.Position && !line.Positions.includes(s.Position)) line.Positions.push(s.Position);
    });
    return [...map.values()];
  }, [rawStats, scope, intlLeagues, intlTeamNames]);

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
        line.BH += sl.BH; line.TF += sl.TF; line.TP += sl.TP;
        line.ShotAtt += sl.ShotAtt; line.ShotScored += sl.ShotScored;
        line.PassAtt += sl.PassAtt; line.PassComp += sl.PassComp;
        line.KPassAtt += sl.KPassAtt; line.KPassComp += sl.KPassComp;
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
          BH: 0, TF: 0, TP: 0, ShotAtt: 0, ShotScored: 0, PassAtt: 0, PassComp: 0,
          KPassAtt: 0, KPassComp: 0,
        };
        map.set(sl.PlayerName, c);
      }
      c.GP += sl.GP;
      c.G += sl.G;
      c.GSC += sl.GSC;
      c.KS += sl.KS;
      c.KSF += sl.KSF;
      c.MIN += sl.MIN;
      c.BH += sl.BH; c.TF += sl.TF; c.TP += sl.TP;
      c.ShotAtt += sl.ShotAtt; c.ShotScored += sl.ShotScored;
      c.PassAtt += sl.PassAtt; c.PassComp += sl.PassComp;
      c.KPassAtt += sl.KPassAtt; c.KPassComp += sl.KPassComp;
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
    const reqPos = info.requirePos;
    const sortFn = (a: any, b: any) => {
      const va = val(a, stat);
      const vb = val(b, stat);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return info.higher ? vb - va : va - vb;
    };
    // Filter: stat must have a value AND player must play the required position (if any)
    const filterValid = (line: any) => {
      if (val(line, stat) === null) return false;
      if (reqPos && !line.Positions?.includes(reqPos)) return false;
      return true;
    };

    if (register === "career") {
      return careerLines.filter(filterValid).sort(sortFn).slice(0, 25).map(c => ({
        ...c, statVal: val(c, stat), team: c.Team, season: null as number | null,
      }));
    }
    if (register === "active") {
      const topSeasons = [...new Set(careerLines.map(c => c.LatestSeason))].sort((a, b) => b - a).slice(0, 2);
      const minActiveSeason = topSeasons[topSeasons.length - 1] ?? maxSeason;
      return careerLines.filter(c => c.LatestSeason >= minActiveSeason && filterValid(c)).sort(sortFn).slice(0, 25).map(c => ({
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
      // Progressive: career cumulative leader at end of each season
      // Row for season X shows who had the career-best stat value as of the end of that season
      const info2 = STATS.find(s => s.key === stat)!;
      const allSeasons = [...new Set(seasonLines.map(s => s.SeasonID))].sort((a, b) => a - b);
      const cum = new Map<string, { GP: number; G: number; GSC: number; KS: number; KSF: number; MIN: number; BH: number; TF: number; TP: number; ShotAtt: number; ShotScored: number; PassAtt: number; PassComp: number; KPassAtt: number; KPassComp: number; team: string; Positions: string[]; Nation: string }>();
      const entries: any[] = [];

      allSeasons.forEach(sid => {
        // Add this season's stats to each player's cumulative total
        seasonLines.filter(s => s.SeasonID === sid).forEach(s => {
          let c = cum.get(s.PlayerName);
          if (!c) c = { GP: 0, G: 0, GSC: 0, KS: 0, KSF: 0, MIN: 0, BH: 0, TF: 0, TP: 0, ShotAtt: 0, ShotScored: 0, PassAtt: 0, PassComp: 0, KPassAtt: 0, KPassComp: 0, team: s.Teams[0] || "", Positions: [], Nation: s.Nation };
          c.GP += s.GP; c.G += s.G; c.GSC += s.GSC; c.KS += s.KS; c.KSF += s.KSF; c.MIN += s.MIN;
          c.BH += s.BH; c.TF += s.TF; c.TP += s.TP;
          c.ShotAtt += s.ShotAtt; c.ShotScored += s.ShotScored;
          c.PassAtt += s.PassAtt; c.PassComp += s.PassComp;
          c.KPassAtt += s.KPassAtt; c.KPassComp += s.KPassComp;
          c.team = s.Teams[0] || c.team;
          s.Positions.forEach(p => { if (!c!.Positions.includes(p)) c!.Positions.push(p); });
          cum.set(s.PlayerName, c);
        });

        // Find career leader(s) as of end of this season
        const snapshot = [...cum.entries()].map(([name, c]) => ({
          PlayerName: name, ...c,
          Teams: [c.team], LeagueName: "", SeasonID: sid,
          statVal: val(c as any as SLLine, stat),
        }));
        const valid = snapshot.filter(e => e.statVal !== null);
        if (valid.length === 0) return;

        valid.sort((a, b) => {
          if (a.statVal === null) return 1;
          if (b.statVal === null) return -1;
          return info2.higher ? (b.statVal as number) - (a.statVal as number) : (a.statVal as number) - (b.statVal as number);
        });

        const topVal = valid[0].statVal;
        const leaders = valid.filter(e => e.statVal === topVal);
        const isTie = leaders.length > 1;
        const displayName = isTie ? leaders.map(l => l.PlayerName).join(" / ") : leaders[0].PlayerName;

        entries.push({
          PlayerName: displayName,
          _isTie: isTie,
          _leaders: leaders,
          GP: leaders[0].GP, G: leaders[0].G, GSC: leaders[0].GSC, KS: leaders[0].KS, KSF: leaders[0].KSF, MIN: leaders[0].MIN,
          Positions: leaders[0].Positions,
          Nation: leaders[0].Nation,
          statVal: topVal,
          team: leaders[0].team,
          season: sid,
        });
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
      // Compact: one row per season+league showing the leader (with ties)
      const result: { label: string; seasonID: number; league: string; entries: any[] }[] = [];
      const groups = new Map<string, SLLine[]>();
      slLines.forEach(sl => {
        const key = `${sl.SeasonID}||${sl.LeagueName}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(sl);
      });
      [...groups.entries()].forEach(([key, lines]) => {
        const [sid, league] = key.split("||");
        const valid = lines.filter(l => val(l, stat) !== null);
        if (valid.length === 0) return;
        valid.sort((a, b) => {
          const va = val(a, stat)!, vb = val(b, stat)!;
          return info.higher ? vb - va : va - vb;
        });
        const topVal = val(valid[0], stat);
        const leaders = valid.filter(l => val(l, stat) === topVal);
        const isTie = leaders.length > 1;
        const leader = leaders[0];
        result.push({
          label: `${seasonLabel(Number(sid))} — ${league}`,
          seasonID: Number(sid),
          league,
          entries: [{
            PlayerName: isTie ? leaders.map(l => l.PlayerName).join(" / ") : leader.PlayerName,
            _isTie: isTie,
            _leaders: leaders.map(l => ({ PlayerName: l.PlayerName, team: l.Teams[0] || "" })),
            GP: leader.GP, G: leader.G, GSC: leader.GSC, KS: leader.KS, KSF: leader.KSF, MIN: leader.MIN,
            Positions: leader.Positions, Nation: leader.Nation,
            statVal: topVal, team: leader.Teams.join(", "), season: Number(sid),
            LeagueName: league,
          }],
        });
      });
      return result.sort((a, b) => a.seasonID - b.seasonID || a.league.localeCompare(b.league));
    }

    // yby: one row per season showing the leader
    const groups2 = new Map<number, SLLine[]>();
    seasonLines.forEach(sl => {
      if (!groups2.has(sl.SeasonID)) groups2.set(sl.SeasonID, []);
      groups2.get(sl.SeasonID)!.push(sl);
    });
    const result2: { label: string; seasonID: number; league: string; entries: any[] }[] = [];
    [...groups2.entries()].forEach(([sid, lines]) => {
      const valid = lines.filter(l => val(l, stat) !== null);
      if (valid.length === 0) return;
      valid.sort((a, b) => {
        const va = val(a, stat)!, vb = val(b, stat)!;
        return info.higher ? vb - va : va - vb;
      });
      const topVal = val(valid[0], stat);
      const leaders = valid.filter(l => val(l, stat) === topVal);
      const isTie = leaders.length > 1;
      const leader = leaders[0];
      result2.push({
        label: seasonLabel(sid),
        seasonID: sid,
        league: "",
        entries: [{
          PlayerName: isTie ? leaders.map(l => l.PlayerName).join(" / ") : leader.PlayerName,
          _isTie: isTie,
          _leaders: leaders.map(l => ({ PlayerName: l.PlayerName, team: l.Teams[0] || "" })),
          GP: leader.GP, G: leader.G, GSC: leader.GSC, KS: leader.KS, KSF: leader.KSF, MIN: leader.MIN,
          Positions: leader.Positions, Nation: leader.Nation,
          statVal: topVal, team: leader.Teams.join(", "), season: sid,
        }],
      });
    });
    return result2.sort((a, b) => a.seasonID - b.seasonID);
  }, [slLines, seasonLines, stat, register]);

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground";
  const statInfo = STATS.find(s => s.key === stat)!;

  const renderRow = (entry: any, i: number) => {
    const isTie = !!entry._isTie;
    const pid = !isTie ? playerMap.get(entry.PlayerName) : undefined;
    const leagueName = entry.LeagueName || null;
    const leagueId = leagueName ? leagueIdByName.get(leagueName) : null;
    const seasonLink = entry.season && leagueId ? `/league/${leagueId}/history` : null;

    const playerCell = isTie ? (
      <span className="text-foreground">
        {(entry._leaders as any[]).map((l: any, li: number) => {
          const lpid = playerMap.get(l.PlayerName);
          return (
            <span key={l.PlayerName}>
              {li > 0 && " / "}
              {lpid ? <Link to={`/player/${lpid}`} className="text-accent hover:underline">{l.PlayerName}</Link> : l.PlayerName}
            </span>
          );
        })}
        <span className="text-muted-foreground text-xs ml-1">(tie)</span>
      </span>
    ) : pid
      ? <Link to={`/player/${pid}`} className="text-accent hover:underline">{entry.PlayerName}</Link>
      : <span className="text-foreground">{entry.PlayerName}</span>;

    return (
      <tr key={`${entry.PlayerName}-${entry.season}-${i}`}
        className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20 transition-colors`}>
        <td className="px-3 py-1.5 font-mono text-muted-foreground">{i + 1}</td>
        <td className="px-3 py-1.5 font-medium">{playerCell}</td>
        <td className="px-3 py-1.5 text-muted-foreground text-xs">{entry.Positions?.join(", ") || ""}</td>
        <td className="px-3 py-1.5 text-accent hover:underline text-xs">
          {entry.team ? <Link to={`/team/${encodeURIComponent(entry.team.split(", ")[0])}`}>{entry.team}</Link> : "—"}
        </td>
        {entry.season && (
          <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
            {seasonLink
              ? <Link to={seasonLink} className="text-accent hover:underline">{seasonLabel(entry.season)}</Link>
              : seasonLabel(entry.season)
            }
          </td>
        )}
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
  const isProgressive = register === "progressive";
  const showSeason = register === "season" || register === "progressive" || register === "yearly" || register === "yby";

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
          <div className="border border-border rounded overflow-hidden">
            <div className="bg-table-header px-3 py-2">
              <p className="text-table-header-foreground font-sans text-sm font-medium">Loading statistics…</p>
            </div>
            <div className="bg-card divide-y divide-border">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="px-3 py-2.5 flex items-center gap-4 animate-pulse">
                  <div className="w-6 h-3 bg-muted rounded" />
                  <div className="flex-1 h-3 bg-muted rounded" style={{ width: `${50 + Math.random() * 30}%` }} />
                  <div className="w-20 h-3 bg-muted rounded" />
                  <div className="w-16 h-3 bg-muted rounded" />
                  <div className="w-12 h-3 bg-muted rounded" />
                </div>
              ))}
            </div>
          </div>
        ) : isProgressive ? (
          /* Progressive: register showing who led each year */
          <div className="border border-border rounded overflow-hidden">
            <div className="bg-table-header px-3 py-2">
              <h3 className="font-display text-sm font-bold text-table-header-foreground">
                Progressive — Yearly {statInfo.label} Leaders
              </h3>
            </div>
            {renderTable(leaderboard, true)}
          </div>
        ) : isYearly ? (
          <div className="border border-border rounded overflow-hidden">
            <div className="bg-table-header px-3 py-2">
              <h3 className="font-display text-sm font-bold text-table-header-foreground">
                {register === "yearly" ? "Yearly League" : "Year-by-Year"} — {statInfo.label} Leaders
              </h3>
            </div>
            {yearlyData.length === 0 ? (
              <p className="text-muted-foreground font-sans py-8 text-center italic px-3">No data available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="bg-secondary">
                      <th className={`${thClass} text-left`}>Season</th>
                      {register === "yearly" && <th className={`${thClass} text-left`}>League</th>}
                      <th className={`${thClass} text-left`}>Player</th>
                      <th className={`${thClass} text-left`}>Pos</th>
                      <th className={`${thClass} text-left`}>Team</th>
                      <th className={`${thClass} text-right`}>{statInfo.abbr}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearlyData.map((group, i) => {
                      const entry = group.entries[0];
                      const lid = group.league ? leagueIdByName.get(group.league) : null;
                      const isTie = !!entry._isTie;
                      const pid = !isTie ? playerMap.get(entry.PlayerName) : undefined;
                      const playerCell = isTie ? (
                        <span>
                          {(entry._leaders as any[]).map((l: any, li: number) => {
                            const lpid = playerMap.get(l.PlayerName);
                            return (
                              <span key={l.PlayerName}>
                                {li > 0 && " / "}
                                {lpid ? <Link to={`/player/${lpid}`} className="text-accent hover:underline">{l.PlayerName}</Link> : l.PlayerName}
                              </span>
                            );
                          })}
                          <span className="text-muted-foreground text-xs ml-1">(tie)</span>
                        </span>
                      ) : pid
                        ? <Link to={`/player/${pid}`} className="text-accent hover:underline">{entry.PlayerName}</Link>
                        : <span>{entry.PlayerName}</span>;

                      return (
                        <tr key={`${group.seasonID}-${group.league}-${i}`}
                          className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                          <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                            {lid
                              ? <Link to={`/league/${lid}/history`} className="text-accent hover:underline">{seasonLabel(group.seasonID)}</Link>
                              : seasonLabel(group.seasonID)
                            }
                          </td>
                          {register === "yearly" && (
                            <td className="px-3 py-1.5 text-xs text-muted-foreground">
                              {lid ? <Link to={`/league/${lid}`} className="hover:underline hover:text-accent">{group.league}</Link> : group.league}
                            </td>
                          )}
                          <td className="px-3 py-1.5 font-medium">{playerCell}</td>
                          <td className="px-3 py-1.5 text-muted-foreground text-xs">{entry.Positions?.join(", ") || ""}</td>
                          <td className="px-3 py-1.5 text-xs">
                            {entry.team ? <Link to={`/team/${encodeURIComponent(entry.team.split(", ")[0])}`} className="text-accent hover:underline">{entry.team}</Link> : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono font-bold">{fmt(entry.statVal, stat)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
