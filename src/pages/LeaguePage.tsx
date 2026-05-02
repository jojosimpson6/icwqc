import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getLeagueTierLabel } from "@/lib/helpers";
import { useSortableTable } from "@/hooks/useSortableTable";
import { fetchAllRows } from "@/lib/fetchAll";

interface League {
  LeagueID: number;
  LeagueName: string | null;
  LeagueTier: number | null;
}

interface Team {
  TeamID: number;
  FullName: string;
  City: string | null;
  Country: string | null;
  Nickname: string | null;
}

interface StandingRow {
  FullName: string | null;
  SeasonID: number | null;
  totalpoints: number | null;
  totalgamesplayed: number | null;
  GoalsFor: number | null;
  GoalsAgainst: number | null;
  totalgsc: number | null;
  homepoints: number | null;
  awaypoints: number | null;
  homegamesplayed: number | null;
  awaygamesplayed: number | null;
  homegoalsfor: number | null;
  homegoalsagainst: number | null;
  homegsc: number | null;
  awaygoalsfor: number | null;
  awaygoalsagainst: number | null;
  awaygsc: number | null;
  neutralpoints: number | null;
  neutralgamesplayed: number | null;
  neutralgoalsfor: number | null;
  neutralgoalsagainst: number | null;
  neutralgsc: number | null;
  LeagueID: number | null;
}

interface AwardRow {
  awardname: string;
  placement: number;
  playerid: number;
  seasonid: number;
}

interface MatchResult {
  MatchID: number;
  HomeTeamID: number | null;
  AwayTeamID: number | null;
  HomeTeamScore: number | null;
  AwayTeamScore: number | null;
  WeekID: number | null;
  SeasonID: number | null;
  LeagueID: number | null;
  IsNeutralSite: number | null;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function seasonLabel(id: number): string {
  return `${id - 1}–${String(id).slice(-2)}`;
}

export default function LeaguePage() {
  const { id } = useParams();
  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [view, setView] = useState<"total" | "home" | "away" | "neutral">("total");
  const [awards, setAwards] = useState<AwardRow[]>([]);
  const [playerMap, setPlayerMap] = useState<Map<number, string>>(new Map());
  const [playerPosMap, setPlayerPosMap] = useState<Map<number, string>>(new Map());
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [teamMap, setTeamMap] = useState<Map<number, string>>(new Map());
  const [matchDayMap, setMatchDayMap] = useState<Map<string, string>>(new Map());
  const [awardsOpen, setAwardsOpen] = useState(false);

  const lid = id ? parseInt(id) : 0;
  const isCup = lid >= 15 && lid <= 18;
  const isChampionsLeague = lid === 19;
  const isDomestic = lid >= 1 && lid <= 14;

  useEffect(() => {
    if (!id) return;

    Promise.all([
      supabase.from("leagues").select("*").eq("LeagueID", lid).single(),
      fetchAllRows("teams", { select: "*", filters: [{ method: "eq", args: ["LeagueID", lid] }], order: { column: "FullName", ascending: true } }),
      fetchAllRows<StandingRow>("standings", { select: "*", order: { column: "totalpoints", ascending: false } }),
      fetchAllRows("awards", { select: "*", filters: [{ method: "eq", args: ["leagueid", lid] }], order: { column: "seasonid", ascending: false } }),
      fetchAllRows("players", { select: "PlayerID, PlayerName, Position" }),
      fetchAllRows("teams", { select: "TeamID, FullName" }),
      fetchAllRows("matchdays", { select: "SeasonID, LeagueID, MatchdayWeek, Matchday" }),
    ]).then(([{ data: leagueData }, teamData, standingsData, awardsData, playerData, allTeamsData, mdData]) => {
      if (leagueData) setLeague(leagueData);
      if (teamData) setTeams(teamData);

      // Team map for resolving IDs
      const tm = new Map<number, string>();
      (allTeamsData || []).forEach((t: any) => { if (t.TeamID) tm.set(t.TeamID, t.FullName); });
      setTeamMap(tm);

      // Matchday map
      const mdm = new Map<string, string>();
      (mdData || []).forEach((md: any) => {
        if (md.SeasonID && md.LeagueID && md.MatchdayWeek != null && md.Matchday) {
          mdm.set(`${md.SeasonID}|${md.LeagueID}|${md.MatchdayWeek}`, md.Matchday);
        }
      });
      setMatchDayMap(mdm);

      if (isDomestic && standingsData && teamData) {
        const teamNames = new Set(teamData.map((t: any) => t.FullName));
        const filtered = (standingsData as StandingRow[]).filter((s) => teamNames.has(s.FullName || ""));
        setStandings(filtered);
        const seasons = [...new Set(filtered.map(s => s.SeasonID).filter(Boolean))].sort((a, b) => (b || 0) - (a || 0)) as number[];
        setAvailableSeasons(seasons);
        if (seasons.length > 0) setSelectedSeason(seasons[0]);
      }

      if (awardsData) setAwards(awardsData as AwardRow[]);
      if (playerData) {
        const pm = new Map<number, string>();
        const ppm = new Map<number, string>();
        playerData.forEach((p: any) => {
          if (p.PlayerID && p.PlayerName) pm.set(p.PlayerID, p.PlayerName);
          if (p.PlayerID && p.Position) ppm.set(p.PlayerID, p.Position);
        });
        setPlayerMap(pm);
        setPlayerPosMap(ppm);
      }

      // For cups/CL, fetch match results
      if (isCup || isChampionsLeague || lid === 20 || lid === 21) {
        fetchAllRows<MatchResult>("results", {
          select: "MatchID,HomeTeamID,AwayTeamID,HomeTeamScore,AwayTeamScore,WeekID,SeasonID,LeagueID,IsNeutralSite",
          filters: [{ method: "eq", args: ["LeagueID", lid] }],
          order: { column: "WeekID", ascending: true },
        }).then(results => {
          setMatchResults(results);
          const seasons = [...new Set(results.map(r => r.SeasonID).filter(Boolean))].sort((a, b) => (b as number) - (a as number)) as number[];
          if (!isDomestic) {
            setAvailableSeasons(seasons);
            if (seasons.length > 0) setSelectedSeason(seasons[0]);
          }
        });
      }
    });
  }, [id]);

  const seasonStandings = standings.filter(s => s.SeasonID === selectedSeason);

  const getViewData = () => {
    return seasonStandings.map((s) => {
      switch (view) {
        case "home":
          return { ...s, _gp: s.homegamesplayed, _pts: s.homepoints, _gf: s.homegoalsfor, _ga: s.homegoalsagainst, _gsc: s.homegsc };
        case "away":
          return { ...s, _gp: s.awaygamesplayed, _pts: s.awaypoints, _gf: s.awaygoalsfor, _ga: s.awaygoalsagainst, _gsc: s.awaygsc };
        case "neutral":
          return { ...s, _gp: s.neutralgamesplayed, _pts: s.neutralpoints, _gf: s.neutralgoalsfor, _ga: s.neutralgoalsagainst, _gsc: s.neutralgsc };
        default:
          return { ...s, _gp: s.totalgamesplayed, _pts: s.totalpoints, _gf: s.GoalsFor, _ga: s.GoalsAgainst, _gsc: s.totalgsc };
      }
    });
  };

  const viewData = getViewData();
  const { sorted, sortKey, sortDir, requestSort } = useSortableTable(viewData, "_pts", "desc");

  const hasNeutral = seasonStandings.some((s) => (s.neutralgamesplayed || 0) > 0);

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none";
  const sortIndicator = (key: string) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  // Group awards by season, then by award name
  const awardsBySeasonMap = new Map<number, Map<string, AwardRow[]>>();
  awards.forEach(a => {
    if (!awardsBySeasonMap.has(a.seasonid)) awardsBySeasonMap.set(a.seasonid, new Map());
    const seasonMap = awardsBySeasonMap.get(a.seasonid)!;
    if (!seasonMap.has(a.awardname)) seasonMap.set(a.awardname, []);
    seasonMap.get(a.awardname)!.push(a);
  });
  awardsBySeasonMap.forEach(seasonMap => {
    seasonMap.forEach(entries => entries.sort((a, b) => a.placement - b.placement));
  });
  const awardSeasons = [...awardsBySeasonMap.keys()].sort((a, b) => a - b);

  // Cup/CL match data for selected season
  const seasonMatches = matchResults.filter(r => r.SeasonID === selectedSeason);

  // Build knockout rounds from match data
  const buildKnockoutRounds = (matches: MatchResult[], startWeek: number = 1) => {
    const weekGroups = new Map<number, MatchResult[]>();
    matches.filter(m => (m.WeekID || 0) >= startWeek).forEach(m => {
      const w = m.WeekID || 0;
      if (!weekGroups.has(w)) weekGroups.set(w, []);
      weekGroups.get(w)!.push(m);
    });
    const weeks = [...weekGroups.keys()].sort((a, b) => a - b);

    // Determine round names based on match count
    const roundNames = (count: number): string => {
      if (count === 1) return "Final";
      if (count === 2) return "Semifinals";
      if (count === 4) return "Quarterfinals";
      if (count === 8) return "Round of 16";
      if (count === 16) return "Round of 32";
      return `Round (${count} matches)`;
    };

    // For two-leg rounds, group pairs of weeks
    const rounds: { name: string; matches: MatchResult[] }[] = [];
    let i = 0;
    while (i < weeks.length) {
      const w1Matches = weekGroups.get(weeks[i])!;
      // Check if next week has same number of matches (two-leg)
      if (i + 1 < weeks.length) {
        const w2Matches = weekGroups.get(weeks[i + 1])!;
        if (w1Matches.length === w2Matches.length && w1Matches.length > 1) {
          // Two-leg round
          rounds.push({ name: roundNames(w1Matches.length), matches: [...w1Matches, ...w2Matches] });
          i += 2;
          continue;
        }
      }
      rounds.push({ name: roundNames(w1Matches.length), matches: w1Matches });
      i++;
    }
    return rounds;
  };

  // Build CL group standings from weeks 1-6
  const buildCLGroups = (matches: MatchResult[]) => {
    const groupMatches = matches.filter(m => (m.WeekID || 0) <= 6);
    // Determine groups: teams that play each other are in the same group
    const teamAdj = new Map<number, Set<number>>();
    groupMatches.forEach(m => {
      if (!m.HomeTeamID || !m.AwayTeamID) return;
      if (!teamAdj.has(m.HomeTeamID)) teamAdj.set(m.HomeTeamID, new Set());
      if (!teamAdj.has(m.AwayTeamID)) teamAdj.set(m.AwayTeamID, new Set());
      teamAdj.get(m.HomeTeamID)!.add(m.AwayTeamID);
      teamAdj.get(m.AwayTeamID)!.add(m.HomeTeamID);
    });

    // BFS to find connected components (groups)
    const visited = new Set<number>();
    const groups: number[][] = [];
    for (const teamId of teamAdj.keys()) {
      if (visited.has(teamId)) continue;
      const group: number[] = [];
      const queue = [teamId];
      while (queue.length > 0) {
        const t = queue.shift()!;
        if (visited.has(t)) continue;
        visited.add(t);
        group.push(t);
        for (const neighbor of teamAdj.get(t) || []) {
          if (!visited.has(neighbor)) queue.push(neighbor);
        }
      }
      groups.push(group.sort((a, b) => a - b));
    }

    // Build standings for each group
    const groupStandings = groups.map((groupTeams, idx) => {
      const teamSet = new Set(groupTeams);
      const gMatches = groupMatches.filter(m => teamSet.has(m.HomeTeamID!) || teamSet.has(m.AwayTeamID!));
      
      const stats = new Map<number, { gp: number; w: number; l: number; d: number; gf: number; ga: number; pts: number }>();
      groupTeams.forEach(t => stats.set(t, { gp: 0, w: 0, l: 0, d: 0, gf: 0, ga: 0, pts: 0 }));

      gMatches.forEach(m => {
        if (!m.HomeTeamID || !m.AwayTeamID) return;
        const hs = m.HomeTeamScore ?? 0;
        const as_ = m.AwayTeamScore ?? 0;
        const home = stats.get(m.HomeTeamID);
        const away = stats.get(m.AwayTeamID);
        if (home) { home.gp++; home.gf += hs; home.ga += as_; }
        if (away) { away.gp++; away.gf += as_; away.ga += hs; }
        if (hs > as_) {
          const diff = hs - as_;
          let bonus = 0;
          if (diff > 150) bonus = 5;
          else if (diff > 100) bonus = 3;
          else if (diff > 50) bonus = 1;
          if (home) { home.w++; home.pts += 2 + bonus; }
          if (away) away.l++;
        } else if (as_ > hs) {
          const diff = as_ - hs;
          let bonus = 0;
          if (diff > 150) bonus = 5;
          else if (diff > 100) bonus = 3;
          else if (diff > 50) bonus = 1;
          if (away) { away.w++; away.pts += 2 + bonus; }
          if (home) home.l++;
        } else {
          if (home) { home.d++; home.pts += 1; }
          if (away) { away.d++; away.pts += 1; }
        }
      });

      const sorted = groupTeams.sort((a, b) => {
        const sa = stats.get(a)!;
        const sb = stats.get(b)!;
        if (sb.pts !== sa.pts) return sb.pts - sa.pts;
        return (sb.gf - sb.ga) - (sa.gf - sa.ga);
      });

      return { label: String.fromCharCode(65 + idx), teams: sorted, stats };
    });

    return groupStandings.sort((a, b) => a.label.localeCompare(b.label));
  };

  if (!league) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SiteHeader />
        <main className="flex-1 container py-8"><p className="text-muted-foreground font-sans">Loading league...</p></main>
        <SiteFooter />
      </div>
    );
  }

  // Season selector component
  const SeasonSelector = () => (
    availableSeasons.length > 1 ? (
      <select
        value={selectedSeason ?? ""}
        onChange={(e) => setSelectedSeason(parseInt(e.target.value))}
        className="text-xs bg-popover text-popover-foreground border border-border rounded px-2 py-1 font-sans"
      >
        {availableSeasons.map(s => (
          <option key={s} value={s}>{seasonLabel(s)}</option>
        ))}
      </select>
    ) : null
  );

  // Knockout round display
  const KnockoutDisplay = ({ rounds }: { rounds: { name: string; matches: MatchResult[] }[] }) => (
    <div className="space-y-4">
      {rounds.map((round, ri) => (
        <div key={ri} className="border border-border rounded overflow-hidden">
          <div className="bg-table-header px-3 py-2">
            <h4 className="font-display text-sm font-bold text-table-header-foreground">{round.name}</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-sans">
              <thead>
                <tr className="bg-secondary">
                  <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Home</th>
                  <th className="px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score</th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Away</th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody>
                {round.matches.map((m, mi) => {
                  const homeName = m.HomeTeamID ? teamMap.get(m.HomeTeamID) || `Team ${m.HomeTeamID}` : "TBD";
                  const awayName = m.AwayTeamID ? teamMap.get(m.AwayTeamID) || `Team ${m.AwayTeamID}` : "TBD";
                  const homeWin = (m.HomeTeamScore ?? 0) > (m.AwayTeamScore ?? 0);
                  const awayWin = (m.AwayTeamScore ?? 0) > (m.HomeTeamScore ?? 0);
                  const dateStr = m.WeekID && m.SeasonID ? matchDayMap.get(`${m.SeasonID}|${lid}|${m.WeekID}`) : null;
                  const displayDate = dateStr
                    ? (() => { const [y, mo, d] = dateStr.split("-").map(Number); return new Date(y, mo - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); })()
                    : "";
                  return (
                    <tr key={m.MatchID} className={`border-t border-border ${mi % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                      <td className={`px-3 py-1.5 ${homeWin ? "font-bold" : ""}`}>
                        <Link to={`/team/${encodeURIComponent(homeName)}`} className="text-accent hover:underline">{homeName}</Link>
                      </td>
                      <td className="px-3 py-1.5 text-center font-mono">
                        <Link to={`/match/${m.MatchID}`} className="hover:text-accent">
                          <span className={homeWin ? "font-bold" : ""}>{m.HomeTeamScore ?? "—"}</span>
                          {" – "}
                          <span className={awayWin ? "font-bold" : ""}>{m.AwayTeamScore ?? "—"}</span>
                        </Link>
                      </td>
                      <td className={`px-3 py-1.5 text-right ${awayWin ? "font-bold" : ""}`}>
                        <Link to={`/team/${encodeURIComponent(awayName)}`} className="text-accent hover:underline">{awayName}</Link>
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs text-muted-foreground font-mono">{displayDate}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-2">
          <p className="text-xs text-muted-foreground font-sans uppercase tracking-wide">{getLeagueTierLabel(league.LeagueTier)}</p>
          <h1 className="font-display text-3xl font-bold text-foreground">{league.LeagueName}</h1>
          <div className="flex items-center gap-4 mt-1">
            <Link to={`/league/${league.LeagueID}/history`} className="text-sm text-accent hover:underline font-sans inline-block">
              Season-by-Season History →
            </Link>
            <SeasonSelector />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Domestic league standings */}
            {isDomestic && standings.length > 0 && (
              <div className="border border-border rounded overflow-hidden">
                <div className="bg-table-header px-3 py-2 flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">
                    Standings{selectedSeason ? ` — ${seasonLabel(selectedSeason)}` : ""}
                  </h3>
                  <div className="flex gap-1">
                    {(["total", "home", "away", ...(hasNeutral ? ["neutral" as const] : [])] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setView(v)}
                        className={`text-xs px-2 py-0.5 rounded font-sans capitalize ${
                          view === v
                            ? "bg-accent text-accent-foreground"
                            : "text-table-header-foreground/70 hover:text-table-header-foreground"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-sans">
                    <thead>
                      <tr className="bg-secondary">
                        <th className={`${thClass} text-left`}>#</th>
                        <th className={`${thClass} text-left`} onClick={() => requestSort("FullName")}>Team{sortIndicator("FullName")}</th>
                        <th className={`${thClass} text-right`} onClick={() => requestSort("_gp")}>GP{sortIndicator("_gp")}</th>
                        <th className={`${thClass} text-right`} onClick={() => requestSort("_pts")}>Pts{sortIndicator("_pts")}</th>
                        <th className={`${thClass} text-right`} onClick={() => requestSort("_gf")}>GF{sortIndicator("_gf")}</th>
                        <th className={`${thClass} text-right`} onClick={() => requestSort("_ga")}>GA{sortIndicator("_ga")}</th>
                        <th className={`${thClass} text-right`}>GD</th>
                        <th className={`${thClass} text-right`} onClick={() => requestSort("_gsc")}>GSC{sortIndicator("_gsc")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((team, i) => (
                        <tr key={team.FullName} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                          <td className="px-3 py-1.5 font-mono text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-1.5 font-medium text-accent hover:underline">
                            <Link to={`/team/${encodeURIComponent(team.FullName || "")}`}>{team.FullName}</Link>
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">{team._gp}</td>
                          <td className="px-3 py-1.5 text-right font-mono font-bold">{team._pts}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{team._gf}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{team._ga}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{((team._gf || 0) - (team._ga || 0))}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{team._gsc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Cup knockout display */}
            {isCup && seasonMatches.length > 0 && (
              <div>
                <h3 className="font-display text-lg font-bold text-foreground mb-3">
                  Knockout Tournament {selectedSeason ? `— ${seasonLabel(selectedSeason)}` : ""}
                </h3>
                <KnockoutDisplay rounds={buildKnockoutRounds(seasonMatches)} />
              </div>
            )}

            {/* Champions League: Group Stage + Knockouts */}
            {isChampionsLeague && seasonMatches.length > 0 && (() => {
              const groups = buildCLGroups(seasonMatches);
              const knockoutMatches = seasonMatches.filter(m => (m.WeekID || 0) > 6);
              const knockoutRounds = buildKnockoutRounds(seasonMatches, 7);
              return (
                <div className="space-y-6">
                  <h3 className="font-display text-lg font-bold text-foreground">
                    Group Stage {selectedSeason ? `— ${seasonLabel(selectedSeason)}` : ""}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {groups.map(group => (
                      <div key={group.label} className="border border-border rounded overflow-hidden">
                        <div className="bg-table-header px-3 py-1.5">
                          <h4 className="font-display text-xs font-bold text-table-header-foreground">Group {group.label}</h4>
                        </div>
                        <table className="w-full text-xs font-sans">
                          <thead>
                            <tr className="bg-secondary">
                              <th className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">#</th>
                              <th className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team</th>
                             <th className="px-2 py-1 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GP</th>
                              <th className="px-2 py-1 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">W</th>
                              <th className="px-2 py-1 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">D</th>
                              <th className="px-2 py-1 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">L</th>
                              <th className="px-2 py-1 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GF</th>
                              <th className="px-2 py-1 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GA</th>
                              <th className="px-2 py-1 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground font-bold">Pts</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.teams.map((tid, i) => {
                              const s = group.stats.get(tid)!;
                              const tName = teamMap.get(tid) || `Team ${tid}`;
                              const qualifies = i < 2;
                              return (
                                <tr key={tid} className={`border-t border-border ${qualifies ? "bg-highlight/10" : i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                                  <td className="px-2 py-1 font-mono text-muted-foreground">{i + 1}</td>
                                  <td className="px-2 py-1 font-medium text-accent hover:underline truncate max-w-[120px]">
                                    <Link to={`/team/${encodeURIComponent(tName)}`}>{tName}</Link>
                                  </td>
                                  <td className="px-2 py-1 text-right font-mono">{s.gp}</td>
                                  <td className="px-2 py-1 text-right font-mono">{s.w}</td>
                                  <td className="px-2 py-1 text-right font-mono">{s.d}</td>
                                  <td className="px-2 py-1 text-right font-mono">{s.l}</td>
                                  <td className="px-2 py-1 text-right font-mono">{s.gf}</td>
                                  <td className="px-2 py-1 text-right font-mono">{s.ga}</td>
                                  <td className="px-2 py-1 text-right font-mono font-bold">{s.pts}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>

                  {knockoutRounds.length > 0 && (
                    <>
                      <h3 className="font-display text-lg font-bold text-foreground">Knockout Stage</h3>
                      <KnockoutDisplay rounds={knockoutRounds} />
                    </>
                  )}
                </div>
              );
            })()}

            {/* Non-domestic, non-cup, non-CL (World Cup etc) — show results as knockout */}
            {!isDomestic && !isCup && !isChampionsLeague && seasonMatches.length > 0 && (
              <div>
                <h3 className="font-display text-lg font-bold text-foreground mb-3">
                  Results {selectedSeason ? `— ${seasonLabel(selectedSeason)}` : ""}
                </h3>
                <KnockoutDisplay rounds={buildKnockoutRounds(seasonMatches)} />
              </div>
            )}

            {/* Annual Awards */}
            {awardSeasons.length > 0 && (
              <div className="border border-border rounded overflow-hidden">
                <div
                  className="bg-table-header px-3 py-2 flex items-center justify-between cursor-pointer"
                  onClick={() => setAwardsOpen(o => !o)}
                >
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">Annual Awards</h3>
                  <span className="text-table-header-foreground/70 text-xs font-sans">{awardsOpen ? "▲ collapse" : "▼ expand"}</span>
                </div>
                {awardsOpen && <div className="bg-card divide-y divide-border">
                  {awardSeasons.map(seasonId => {
                    const seasonAwards = awardsBySeasonMap.get(seasonId)!;
                    const awardNames = [...seasonAwards.keys()];
                    const individualAwards = awardNames.filter(n => n !== "Team of the Year");
                    const teamOfYear = seasonAwards.get("Team of the Year");

                    return (
                      <div key={seasonId} className="px-3 py-3">
                        <h4 className="font-display text-sm font-bold text-foreground mb-2">{seasonLabel(seasonId)}</h4>
                        <div className="space-y-2">
                          {individualAwards.length > 0 && (
                            <table className="w-full text-sm font-sans">
                              <thead>
                                <tr className="bg-secondary">
                                  <th className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Award</th>
                                  <th className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">1st</th>
                                  <th className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">2nd</th>
                                  <th className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">3rd</th>
                                </tr>
                              </thead>
                              <tbody>
                                {individualAwards.map((awardName, ai) => {
                                  const entries = seasonAwards.get(awardName)!;
                                  const byP = (p: number) => entries.find(e => e.placement === p);
                                  const first = byP(1);
                                  const second = byP(2);
                                  const third = byP(3);
                                  const cell = (entry: AwardRow | undefined, bg: string) => (
                                    <td className={`px-2 py-1.5 ${bg}`}>
                                      {entry ? (
                                        <Link to={`/player/${entry.playerid}`} className="text-accent hover:underline font-medium">
                                          {playerMap.get(entry.playerid) || `Player #${entry.playerid}`}
                                        </Link>
                                      ) : "—"}
                                    </td>
                                  );
                                  return (
                                    <tr key={awardName} className={`border-t border-border ${ai % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                                      <td className="px-2 py-1.5 font-medium">
                                        <Link to={`/league/${league.LeagueID}/award/${encodeURIComponent(awardName)}`} className="text-accent hover:underline">
                                          {awardName}
                                        </Link>
                                      </td>
                                      {cell(first, "bg-highlight/20")}
                                      {cell(second, "bg-secondary/60")}
                                      {cell(third, "bg-muted/40")}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                          {teamOfYear && teamOfYear.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                                <Link to={`/league/${league.LeagueID}/award/${encodeURIComponent("Team of the Year")}`} className="hover:text-accent hover:underline">
                                  Team of the Year →
                                </Link>
                              </p>
                              {(() => {
                                const placementCounts = new Map();
                                teamOfYear.forEach(e => placementCounts.set(e.placement, (placementCounts.get(e.placement) || 0) + 1));
                                const isTeamNumber = [...placementCounts.values()].some(c => c > 1);
                                if (isTeamNumber) {
                                  const teamNumbers = [...new Set(teamOfYear.map(e => e.placement))].sort();
                                  return teamNumbers.map(placement => {
                                    const teamEntries = teamOfYear.filter(e => e.placement === placement);
                                    return (
                                      <div key={placement} className="mb-2">
                                        <p className="text-xs text-muted-foreground font-mono mb-0.5">{ordinal(placement)} Team</p>
                                        <table className="w-full text-sm font-sans">
                                          <thead>
                                            <tr className="bg-secondary">
                                              <th className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Player</th>
                                              <th className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pos</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {teamEntries.map((entry, i) => {
                                              const pName = playerMap.get(entry.playerid) || `Player #${entry.playerid}`;
                                              const pos = playerPosMap.get(entry.playerid) || "—";
                                              return (
                                                <tr key={i} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                                                  <td className="px-2 py-1">
                                                    <Link to={`/player/${entry.playerid}`} className="text-accent hover:underline font-medium">{pName}</Link>
                                                  </td>
                                                  <td className="px-2 py-1 text-muted-foreground text-xs">{pos}</td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    );
                                  });
                                } else {
                                  const sorted = [...teamOfYear].sort((a, b) => a.placement - b.placement);
                                  return (
                                    <table className="w-full text-sm font-sans">
                                      <thead>
                                        <tr className="bg-secondary">
                                          <th className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Player</th>
                                          <th className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pos</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {sorted.map((entry, i) => {
                                          const pName = playerMap.get(entry.playerid) || `Player #${entry.playerid}`;
                                          const pos = playerPosMap.get(entry.playerid) || "—";
                                          return (
                                            <tr key={i} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                                              <td className="px-2 py-1">
                                                <Link to={`/player/${entry.playerid}`} className="text-accent hover:underline font-medium">{pName}</Link>
                                              </td>
                                              <td className="px-2 py-1 text-muted-foreground text-xs">{pos}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  );
                                }
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>}
              </div>
            )}
          </div>

          {/* Sidebar: Teams */}
          <div className="space-y-6">
            {teams.length > 0 && (
              <div className="border border-border rounded overflow-hidden">
                <div className="bg-table-header px-3 py-2">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">Teams</h3>
                </div>
                <div className="bg-card divide-y divide-border">
                  {teams.map((t) => (
                    <Link
                      key={t.TeamID}
                      to={`/team/${encodeURIComponent(t.FullName)}`}
                      className="block px-3 py-2.5 hover:bg-highlight/20 transition-colors"
                    >
                      <p className="font-sans font-medium text-sm text-accent">{t.FullName}</p>
                      <p className="text-xs text-muted-foreground font-sans">{t.City}{t.Country ? `, ${t.Country}` : ""}</p>
                    </Link>
                  ))}
                  {teams.length === 0 && (
                    <p className="px-3 py-3 text-sm text-muted-foreground font-sans italic">No teams found for this league.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
