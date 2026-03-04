import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useSortableTable } from "@/hooks/useSortableTable";
import { getContrastText, formatHeight, calculateAge, getNationFlag, isLightColor } from "@/lib/helpers";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Team {
  TeamID: number;
  FullName: string;
  City: string | null;
  Country: string | null;
  Nickname: string | null;
  LeagueID: number;
  PrimaryColor: string | null;
  SecondaryColor: string | null;
  Rival: string | null;
  logo_url: string | null;
}

interface StatLine {
  PlayerName: string | null;
  GamesPlayed: number | null;
  Goals: number | null;
  GoldenSnitchCatches: number | null;
  KeeperSaves: number | null;
  KeeperShotsFaced: number | null;
  Position: string | null;
  SeasonID: number | null;
  LeagueName: string | null;
}

interface SeasonRegisterRow {
  SeasonID: number;
  LeagueName: string;
  LeagueTier: number;
  position: number | null;
  isChampion: boolean;
  totalgamesplayed: number | null;
  totalpoints: number | null;
  GoalsFor: number | null;
  GoalsAgainst: number | null;
  totalgsc: number | null;
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
}

interface MatchResult {
  MatchID: number;
  HomeTeamID: number | null;
  AwayTeamID: number | null;
  HomeTeamScore: number | null;
  AwayTeamScore: number | null;
  SnitchCaughtTime: number | null;
  LeagueID: number | null;
  SeasonID: number | null;
  WeekID: number | null;
  IsNeutralSite: number | null;
}

interface PlayerInfo {
  PlayerID: number;
  PlayerName: string | null;
  DOB: string | null;
  NationalityID: number | null;
  Height: number | null;
  Weight: number | null;
  Handedness: string | null;
}

function seasonLabel(id: number): string {
  return `${id - 1}–${String(id).slice(-2)}`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function TeamPage() {
  const { name } = useParams();
  const [team, setTeam] = useState<Team | null>(null);
  const [leagueName, setLeagueName] = useState("");
  const [currentRoster, setCurrentRoster] = useState<StatLine[]>([]);
  const [allStats, setAllStats] = useState<StatLine[]>([]);
  const [currentStanding, setCurrentStanding] = useState<StandingRow | null>(null);
  const [allStandings, setAllStandings] = useState<StandingRow[]>([]);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [nations, setNations] = useState<Map<number, string>>(new Map());
  const [seasonRegister, setSeasonRegister] = useState<SeasonRegisterRow[]>([]);
  const [activeTab, setActiveTab] = useState<"register" | "results" | "roster" | "alltime">("register");
  const [rosterSeasonId, setRosterSeasonId] = useState<number | null>(null);
  const [resultsSeasonId, setResultsSeasonId] = useState<number | "all">("all");
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [teamMapState, setTeamMapState] = useState<Map<number, string>>(new Map());
  const [matchDayMap, setMatchDayMap] = useState<Map<number, string>>(new Map());
  const [matchDayCompositeMap, setMatchDayCompositeMap] = useState<Map<string, string>>(new Map());
  const [rivalTeamName, setRivalTeamName] = useState<string | null>(null);
  const [resultsOpen, setResultsOpen] = useState(true);
  const [h2hOpen, setH2hOpen] = useState(true);
  // Result sort
  const [resultSortKey, setResultSortKey] = useState<string>("date");
  const [resultSortDir, setResultSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (!name) return;
    const teamName = decodeURIComponent(name);

    Promise.all([
      supabase.from("teams").select("*").eq("FullName", teamName).single(),
      supabase.from("stats").select("*").eq("FullName", teamName),
      supabase.from("standings").select("*").eq("FullName", teamName).order("SeasonID", { ascending: false }),
      supabase.from("players").select("PlayerID, PlayerName, DOB, NationalityID, Height, Weight, Handedness"),
      supabase.from("results").select("MatchID,HomeTeamID,AwayTeamID,HomeTeamScore,AwayTeamScore,SnitchCaughtTime,LeagueID,SeasonID,WeekID,IsNeutralSite")
        .or(`HomeTeamID.eq.0,AwayTeamID.eq.0`)
        .limit(0),
      supabase.from("teams").select("TeamID, FullName"),
      supabase.from("matchdays").select("MatchdayID, Matchday, SeasonID, LeagueID, MatchdayWeek"),
      supabase.from("nations").select("NationID, Nation, ValidToDt").order("ValidToDt", { ascending: false }),
    ]).then(([{ data: teamData }, { data: statsData }, { data: standData }, { data: playerData }, , { data: allTeamsData }, { data: mdData }, { data: nationData }]) => {
      if (teamData) {
        setTeam(teamData);
        supabase.from("leagues").select("LeagueName").eq("LeagueID", teamData.LeagueID).single().then(({ data: ld }) => {
          if (ld) setLeagueName(ld.LeagueName || "");
        });

        if (teamData.Rival) {
          setRivalTeamName(teamData.Rival);
        }

        supabase.from("results")
          .select("MatchID,HomeTeamID,AwayTeamID,HomeTeamScore,AwayTeamScore,SnitchCaughtTime,LeagueID,SeasonID,WeekID,IsNeutralSite")
          .or(`HomeTeamID.eq.${teamData.TeamID},AwayTeamID.eq.${teamData.TeamID}`)
          .order("MatchID", { ascending: false })
          .limit(2000)
          .then(({ data: rData }) => {
            if (rData) setMatchResults(rData as MatchResult[]);
          });
      }

      const tm = new Map<number, string>();
      (allTeamsData || []).forEach(t => { if (t.TeamID) tm.set(t.TeamID, t.FullName); });
      setTeamMapState(tm);

      const mdm = new Map<number, string>();
      const mdComposite = new Map<string, string>();
      (mdData || []).forEach((md: any) => {
        if (md.MatchdayID && md.Matchday) mdm.set(md.MatchdayID, md.Matchday);
        if (md.SeasonID && md.LeagueID && md.MatchdayWeek != null && md.Matchday) {
          mdComposite.set(`${md.SeasonID}|${md.LeagueID}|${md.MatchdayWeek}`, md.Matchday);
        }
      });
      setMatchDayMap(mdm);
      setMatchDayCompositeMap(mdComposite);

      const nm = new Map<number, string>();
      // Data is ordered by ValidToDt desc, so first entry per NationID is the most current name
      (nationData || []).forEach((n: { NationID: number; Nation: string | null }) => {
        if (n.NationID && n.Nation && !nm.has(n.NationID)) nm.set(n.NationID, n.Nation);
      });
      setNations(nm);

      if (statsData) {
        setAllStats(statsData as StatLine[]);
        const seasons = [...new Set((statsData as StatLine[]).map(s => s.SeasonID).filter(Boolean))].sort((a, b) => (b || 0) - (a || 0));
        const latestSeason = seasons[0] || null;
        setRosterSeasonId(latestSeason);
        setCurrentRoster((statsData as StatLine[]).filter(s => s.SeasonID === latestSeason));
      }
      if (standData && standData.length > 0) {
        setAllStandings(standData as StandingRow[]);
        setCurrentStanding((standData as StandingRow[])[0]);
      }
      if (playerData) setPlayers(playerData as PlayerInfo[]);

      if (standData && standData.length > 0) {
        buildSeasonRegister(teamName, standData as StandingRow[], statsData as StatLine[]);
      }
    });
  }, [name]);

  async function buildSeasonRegister(teamName: string, standings: StandingRow[], stats: StatLine[]) {
    const seasonLeagueMap = new Map<number, string>();
    (stats || []).forEach(s => {
      if (s.SeasonID && s.LeagueName) seasonLeagueMap.set(s.SeasonID, s.LeagueName);
    });

    const { data: leagueData } = await supabase.from("leagues").select("LeagueID, LeagueName, LeagueTier");
    const leagueTierMap = new Map<string, number>();
    const leagueIdByName = new Map<string, number>();
    (leagueData || []).forEach(l => {
      if (l.LeagueName) {
        leagueTierMap.set(l.LeagueName, l.LeagueTier || 1);
        leagueIdByName.set(l.LeagueName, l.LeagueID);
      }
    });

    // Get all teams grouped by league for filtering standings
    const { data: allTeamsData } = await supabase.from("teams").select("FullName, LeagueID");
    const teamsByLeagueId = new Map<number, string[]>();
    (allTeamsData || []).forEach(t => {
      const arr = teamsByLeagueId.get(t.LeagueID) || [];
      arr.push(t.FullName);
      teamsByLeagueId.set(t.LeagueID, arr);
    });

    const registerRows: SeasonRegisterRow[] = [];
    for (const standing of standings) {
      if (!standing.SeasonID) continue;
      const leagueN = seasonLeagueMap.get(standing.SeasonID) || leagueName;
      const tier = leagueTierMap.get(leagueN) || 1;
      const leagueId = leagueIdByName.get(leagueN);
      const leagueTeamNames = leagueId ? teamsByLeagueId.get(leagueId) || [] : [];

      const { data: allTeamStandings } = await supabase.from("standings")
        .select("FullName, totalpoints")
        .eq("SeasonID", standing.SeasonID)
        .order("totalpoints", { ascending: false });

      let position: number | null = null;
      let isChampion = false;
      if (allTeamStandings && allTeamStandings.length > 0) {
        // Filter to only teams in the same league
        const leagueStandings = leagueTeamNames.length > 0
          ? allTeamStandings.filter(t => leagueTeamNames.includes(t.FullName || ""))
          : allTeamStandings;
        const idx = leagueStandings.findIndex(t => t.FullName === teamName);
        if (idx >= 0) {
          position = idx + 1;
          isChampion = idx === 0;
        }
      }

      registerRows.push({
        SeasonID: standing.SeasonID,
        LeagueName: leagueN,
        LeagueTier: tier,
        position,
        isChampion,
        totalgamesplayed: standing.totalgamesplayed,
        totalpoints: standing.totalpoints,
        GoalsFor: standing.GoalsFor,
        GoalsAgainst: standing.GoalsAgainst,
        totalgsc: standing.totalgsc,
      });
    }

    registerRows.sort((a, b) => b.SeasonID - a.SeasonID);
    setSeasonRegister(registerRows);
  }

  const getPlayerId = (playerName: string | null) => {
    if (!playerName) return null;
    return players.find((p) => p.PlayerName === playerName)?.PlayerID || null;
  };

  const getPlayerInfo = (playerName: string | null): PlayerInfo | null => {
    if (!playerName) return null;
    return players.find((p) => p.PlayerName === playerName) || null;
  };

  // De-duplicate roster: if a player appears under multiple positions in the same season,
  // merge into one entry with combined stats
  const displayRosterRaw = rosterSeasonId
    ? allStats.filter(s => s.SeasonID === rosterSeasonId)
    : currentRoster;

  // Deduplicate by PlayerName (merge multi-position entries)
  const deduped = new Map<string, StatLine & { positions: string[] }>();
  displayRosterRaw.forEach(s => {
    const key = s.PlayerName || "";
    if (deduped.has(key)) {
      const existing = deduped.get(key)!;
      existing.GamesPlayed = (existing.GamesPlayed || 0) + (s.GamesPlayed || 0);
      existing.Goals = (existing.Goals || 0) + (s.Goals || 0);
      existing.GoldenSnitchCatches = (existing.GoldenSnitchCatches || 0) + (s.GoldenSnitchCatches || 0);
      existing.KeeperSaves = (existing.KeeperSaves || 0) + (s.KeeperSaves || 0);
      if (s.Position && !existing.positions.includes(s.Position)) {
        existing.positions.push(s.Position);
      }
    } else {
      deduped.set(key, { ...s, positions: s.Position ? [s.Position] : [] });
    }
  });
  const displayRoster = [...deduped.values()];

  const posOrder: Record<string, number> = { Chaser: 1, Beater: 2, Keeper: 3, Seeker: 4 };
  const defaultSorted = [...displayRoster].sort((a, b) => (posOrder[a.Position || ""] || 5) - (posOrder[b.Position || ""] || 5));
  const { sorted: sortedRoster, sortKey, sortDir, requestSort } = useSortableTable(defaultSorted, "Position", "asc");

  const topScorer = [...displayRoster].filter((r) => r.positions.includes("Chaser")).sort((a, b) => (b.Goals || 0) - (a.Goals || 0))[0];
  const topGSC = [...displayRoster].filter((r) => r.positions.includes("Seeker")).sort((a, b) => (b.GoldenSnitchCatches || 0) - (a.GoldenSnitchCatches || 0))[0];
  const topSaves = [...displayRoster].filter((r) => r.positions.includes("Keeper")).sort((a, b) => (b.KeeperSaves || 0) - (a.KeeperSaves || 0))[0];

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none";
  const sortIndicator = (key: string) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const availableSeasons = [...new Set(allStats.map(s => s.SeasonID).filter(Boolean))].sort((a, b) => (b || 0) - (a || 0)) as number[];

  // Results season options from match data
  const resultsSeasons = [...new Set(matchResults.map(r => r.SeasonID).filter(Boolean))].sort((a, b) => (b || 0) - (a || 0)) as number[];
  const filteredResults = resultsSeasonId === "all" ? matchResults : matchResults.filter(r => r.SeasonID === resultsSeasonId);

  // Sort results
  const sortedResults = [...filteredResults].sort((a, b) => {
    if (resultSortKey === "date") {
      const dateA = a.WeekID && a.SeasonID && a.LeagueID ? matchDayCompositeMap.get(`${a.SeasonID}|${a.LeagueID}|${a.WeekID}`) || "" : "";
      const dateB = b.WeekID && b.SeasonID && b.LeagueID ? matchDayCompositeMap.get(`${b.SeasonID}|${b.LeagueID}|${b.WeekID}`) || "" : "";
      return resultSortDir === "asc" ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    }
    if (resultSortKey === "season") {
      return resultSortDir === "asc" ? (a.SeasonID || 0) - (b.SeasonID || 0) : (b.SeasonID || 0) - (a.SeasonID || 0);
    }
    if (resultSortKey === "score") {
      const isHomeA = a.HomeTeamID === team?.TeamID;
      const scoreA = isHomeA ? (a.HomeTeamScore ?? 0) : (a.AwayTeamScore ?? 0);
      const isHomeB = b.HomeTeamID === team?.TeamID;
      const scoreB = isHomeB ? (b.HomeTeamScore ?? 0) : (b.AwayTeamScore ?? 0);
      return resultSortDir === "asc" ? scoreA - scoreB : scoreB - scoreA;
    }
    return 0;
  });

  const toggleResultSort = (key: string) => {
    if (resultSortKey === key) {
      setResultSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setResultSortKey(key);
      setResultSortDir(key === "date" ? "asc" : "desc");
    }
  };
  const resultSortIndicator = (key: string) => resultSortKey === key ? (resultSortDir === "asc" ? " ↑" : " ↓") : "";

  const domesticRegister = seasonRegister.filter(r => r.LeagueTier !== 0);
  const cupRegister = seasonRegister.filter(r => r.LeagueTier === 0);

  // Team color styling with contrast-aware text
  const primaryColor = team?.PrimaryColor || null;
  const secondaryColor = team?.SecondaryColor || null;
  const headerTextColor = primaryColor ? getContrastText(primaryColor) : undefined;
  const headerStyle = primaryColor ? {
    backgroundColor: primaryColor,
    color: headerTextColor,
  } : undefined;
  // For using primaryColor as text on a light background: if the color is too light, darken it
  const safeTextColor = primaryColor
    ? (isLightColor(primaryColor) ? (secondaryColor && !isLightColor(secondaryColor) ? secondaryColor : "#1a1a1a") : primaryColor)
    : undefined;

  // Head-to-head rival data
  const rivalMatches = rivalTeamName ? matchResults.filter(r => {
    const oppId = r.HomeTeamID === team?.TeamID ? r.AwayTeamID : r.HomeTeamID;
    const oppName = oppId ? teamMapState.get(oppId) : null;
    return oppName === rivalTeamName;
  }) : [];

  const rivalRecord = { wins: 0, losses: 0, draws: 0 };
  rivalMatches.forEach(r => {
    const isHome = r.HomeTeamID === team?.TeamID;
    const teamScore = isHome ? (r.HomeTeamScore ?? 0) : (r.AwayTeamScore ?? 0);
    const oppScore = isHome ? (r.AwayTeamScore ?? 0) : (r.HomeTeamScore ?? 0);
    if (teamScore > oppScore) rivalRecord.wins++;
    else if (teamScore < oppScore) rivalRecord.losses++;
    else rivalRecord.draws++;
  });

  // Earliest season a player appeared = debut year
  const playerDebutMap = new Map<string, number>();
  allStats.forEach(s => {
    if (s.PlayerName && s.SeasonID) {
      const existing = playerDebutMap.get(s.PlayerName);
      if (!existing || s.SeasonID < existing) {
        playerDebutMap.set(s.PlayerName, s.SeasonID);
      }
    }
  });

  if (!team) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SiteHeader />
        <main className="flex-1 container py-8"><p className="text-muted-foreground font-sans">Loading team...</p></main>
        <SiteFooter />
      </div>
    );
  }

  const RegisterTable = ({ rows, title }: { rows: SeasonRegisterRow[]; title: string }) => (
    <div className="border border-border rounded overflow-hidden">
      <div className="px-3 py-2" style={headerStyle || undefined}>
        <h3 className={`font-display text-sm font-bold ${headerStyle ? "" : "text-table-header-foreground bg-table-header"}`}
          style={!headerStyle ? undefined : { color: headerStyle.color }}>
          {title}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-sans">
          <thead>
            <tr className="bg-secondary">
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Season</th>
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">League</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pos</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GP</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pts</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GF</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GA</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GD</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GSC</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const gd = (row.GoalsFor || 0) - (row.GoalsAgainst || 0);
              const posClass = row.isChampion ? "font-bold text-yellow-500" : "";
              return (
                <tr key={row.SeasonID} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                  <td className="px-3 py-1.5">
                    <button
                      onClick={() => { setRosterSeasonId(row.SeasonID); setActiveTab("roster"); }}
                      className="text-accent hover:underline font-mono"
                    >
                      {seasonLabel(row.SeasonID)}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{row.LeagueName}</td>
                  <td className={`px-3 py-1.5 text-right font-mono ${posClass}`}>
                    {row.isChampion ? "🏆 1st" : row.position != null ? ordinal(row.position) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{row.totalgamesplayed ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{row.totalpoints ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{row.GoalsFor ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{row.GoalsAgainst ?? "—"}</td>
                  <td className={`px-3 py-1.5 text-right font-mono ${gd > 0 ? "text-green-600" : gd < 0 ? "text-destructive" : ""}`}>{gd > 0 ? "+" : ""}{gd}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{row.totalgsc ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8">
        {/* Team header */}
        <div className="mb-6 border-b-2 pb-2" style={primaryColor ? { borderColor: primaryColor } : undefined}>
          <p className="text-xs text-muted-foreground font-sans uppercase tracking-wide">
            <Link to={`/league/${team.LeagueID}`} className="hover:text-accent">{leagueName}</Link>
          </p>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded border border-border flex items-center justify-center shrink-0 overflow-hidden"
              style={!team.logo_url && primaryColor ? { backgroundColor: primaryColor } : undefined}>
              {team.logo_url ? (
                <img src={team.logo_url} alt={team.FullName} className="w-full h-full object-contain" />
              ) : (
                <span className="text-2xl" style={{ color: headerTextColor || "inherit" }}>
                  {team.FullName.charAt(0)}
                </span>
              )}
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold" style={safeTextColor ? { color: safeTextColor } : undefined}>
                {team.FullName}
              </h1>
              <p className="text-sm text-muted-foreground font-sans mt-1">
                {team.City}{team.Country ? `, ${team.Country}` : ""}
                {team.Nickname ? ` — "${team.Nickname}"` : ""}
              </p>
            </div>
          </div>
          {rivalTeamName && (
            <p className="text-sm font-sans mt-1">
              <span className="text-muted-foreground">Rival: </span>
              <Link to={`/team/${encodeURIComponent(rivalTeamName)}`} className="text-accent hover:underline font-medium">
                {rivalTeamName}
              </Link>
            </p>
          )}
          {/* Coach placeholder */}
          <p className="text-sm font-sans mt-1">
            <span className="text-muted-foreground">Coach: </span>
            <span className="text-foreground italic">TBD</span>
          </p>
          {primaryColor && (
            <div className="flex gap-2 mt-2">
              <div className="w-6 h-6 rounded border border-border" style={{ backgroundColor: primaryColor }} title="Primary" />
              {secondaryColor && <div className="w-6 h-6 rounded border border-border" style={{ backgroundColor: secondaryColor }} title="Secondary" />}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-border">
          {(["register", "results", "roster", "alltime"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-sans font-medium border-b-2 -mb-px transition-colors ${activeTab === tab ? "text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              style={activeTab === tab && safeTextColor ? { borderColor: primaryColor || safeTextColor, color: safeTextColor } : activeTab === tab ? {} : undefined}
            >
              {tab === "register" ? "Season Register" : tab === "results" ? "Results" : tab === "roster" ? "Roster & Stats" : "All-Time"}
            </button>
          ))}
        </div>

        {activeTab === "register" && (
          <div className="space-y-6">
            {domesticRegister.length > 0 && <RegisterTable rows={domesticRegister} title="Domestic League Register" />}
            {cupRegister.length > 0 && <RegisterTable rows={cupRegister} title="Cup Competition Register" />}
            {seasonRegister.length === 0 && <p className="text-muted-foreground font-sans text-sm">No season data available.</p>}
          </div>
        )}

        {activeTab === "results" && (
          <div className="space-y-4">
            {/* Season filter */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-sans text-muted-foreground">Season:</label>
              <select
                className="text-sm font-sans border border-border rounded px-2 py-1 bg-background text-foreground"
                value={resultsSeasonId === "all" ? "all" : resultsSeasonId}
                onChange={e => setResultsSeasonId(e.target.value === "all" ? "all" : Number(e.target.value))}
              >
                <option value="all">All Seasons</option>
                {resultsSeasons.map(s => (
                  <option key={s} value={s}>{seasonLabel(s)}</option>
                ))}
              </select>
            </div>

            {/* Collapsible results table */}
            <div className="border border-border rounded overflow-hidden">
              <button
                onClick={() => setResultsOpen(o => !o)}
                className="w-full px-3 py-2 flex items-center justify-between"
                style={headerStyle || undefined}
              >
                <h3 className={`font-display text-sm font-bold ${headerStyle ? "" : "text-table-header-foreground"}`}
                  style={!headerStyle ? undefined : { color: headerStyle.color }}>
                  Schedule of Results ({sortedResults.length})
                </h3>
                {resultsOpen ? <ChevronDown className="w-4 h-4" style={headerStyle ? { color: headerStyle.color } : undefined} /> : <ChevronRight className="w-4 h-4" style={headerStyle ? { color: headerStyle.color } : undefined} />}
              </button>
              {resultsOpen && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-sans">
                    <thead>
                      <tr className="bg-secondary">
                        <th className={`${thClass}`} onClick={() => toggleResultSort("date")}>Date{resultSortIndicator("date")}</th>
                        <th className={`${thClass}`} onClick={() => toggleResultSort("season")}>Season{resultSortIndicator("season")}</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Opponent</th>
                        <th className="px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">H/A/N</th>
                        <th className={`${thClass} text-right`} onClick={() => toggleResultSort("score")}>Score{resultSortIndicator("score")}</th>
                        <th className="px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">W/L</th>
                        <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Min</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedResults.map((r, i) => {
                        const isHome = r.HomeTeamID === team?.TeamID;
                        const teamScore = isHome ? (r.HomeTeamScore ?? 0) : (r.AwayTeamScore ?? 0);
                        const oppScore = isHome ? (r.AwayTeamScore ?? 0) : (r.HomeTeamScore ?? 0);
                        const oppId = isHome ? r.AwayTeamID : r.HomeTeamID;
                        const oppName = oppId ? teamMapState.get(oppId) || `Team ${oppId}` : "Unknown";
                        const won = teamScore > oppScore;
                        const isNeutral = r.IsNeutralSite === 1;
                        const dateStr = r.WeekID && r.SeasonID && r.LeagueID ? matchDayCompositeMap.get(`${r.SeasonID}|${r.LeagueID}|${r.WeekID}`) : null;
                        const displayDate = dateStr
                          ? (() => { const [y,m,d] = dateStr.split("-").map(Number); return new Date(y,m-1,d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); })()
                          : "—";
                        const siteLabel = isNeutral ? "N" : isHome ? "H" : "A";
                        return (
                          <tr key={r.MatchID} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                            <td className="px-3 py-1.5 text-xs text-muted-foreground font-mono">{displayDate}</td>
                            <td className="px-3 py-1.5 text-xs text-muted-foreground font-mono">{r.SeasonID ? seasonLabel(r.SeasonID) : "—"}</td>
                            <td className="px-3 py-1.5">
                              <Link to={`/team/${encodeURIComponent(oppName)}`} className="text-accent hover:underline">{oppName}</Link>
                            </td>
                            <td className="px-3 py-1.5 text-center text-xs text-muted-foreground">{siteLabel}</td>
                            <td className="px-3 py-1.5 text-right font-mono font-bold">
                              <Link to={`/match/${r.MatchID}`} className="hover:underline text-accent">
                                {teamScore}–{oppScore}
                              </Link>
                            </td>
                            <td className={`px-3 py-1.5 text-center font-bold text-xs ${won ? "text-green-600" : "text-destructive"}`}>
                              {won ? "W" : "L"}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-muted-foreground text-xs">{r.SnitchCaughtTime ?? "—"}</td>
                          </tr>
                        );
                      })}
                      {sortedResults.length === 0 && (
                        <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">No results found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Head-to-Head Rival section */}
            {rivalTeamName && rivalMatches.length > 0 && (
              <div className="border border-border rounded overflow-hidden">
                <button
                  onClick={() => setH2hOpen(o => !o)}
                  className="w-full px-3 py-2 flex items-center justify-between"
                  style={headerStyle || undefined}
                >
                  <h3 className={`font-display text-sm font-bold ${headerStyle ? "" : "text-table-header-foreground"}`}
                    style={!headerStyle ? undefined : { color: headerStyle.color }}>
                    Head-to-Head vs {rivalTeamName} ({rivalRecord.wins}W–{rivalRecord.losses}L{rivalRecord.draws > 0 ? `–${rivalRecord.draws}D` : ""})
                  </h3>
                  {h2hOpen ? <ChevronDown className="w-4 h-4" style={headerStyle ? { color: headerStyle.color } : undefined} /> : <ChevronRight className="w-4 h-4" style={headerStyle ? { color: headerStyle.color } : undefined} />}
                </button>
                {h2hOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm font-sans">
                      <thead>
                        <tr className="bg-secondary">
                          <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                          <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Season</th>
                          <th className="px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">H/A/N</th>
                          <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score</th>
                          <th className="px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">W/L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...rivalMatches].sort((a, b) => {
                          const dateA = a.WeekID && a.SeasonID && a.LeagueID ? matchDayCompositeMap.get(`${a.SeasonID}|${a.LeagueID}|${a.WeekID}`) || "" : "";
                          const dateB = b.WeekID && b.SeasonID && b.LeagueID ? matchDayCompositeMap.get(`${b.SeasonID}|${b.LeagueID}|${b.WeekID}`) || "" : "";
                          return dateA.localeCompare(dateB);
                        }).map((r, i) => {
                          const isHome = r.HomeTeamID === team?.TeamID;
                          const teamScore = isHome ? (r.HomeTeamScore ?? 0) : (r.AwayTeamScore ?? 0);
                          const oppScore = isHome ? (r.AwayTeamScore ?? 0) : (r.HomeTeamScore ?? 0);
                          const won = teamScore > oppScore;
                          const isNeutral = r.IsNeutralSite === 1;
                          const dateStr = r.WeekID && r.SeasonID && r.LeagueID ? matchDayCompositeMap.get(`${r.SeasonID}|${r.LeagueID}|${r.WeekID}`) : null;
                          const displayDate = dateStr
                            ? (() => { const [y,m,d] = dateStr.split("-").map(Number); return new Date(y,m-1,d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); })()
                            : "—";
                          return (
                            <tr key={r.MatchID} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                              <td className="px-3 py-1.5 text-xs text-muted-foreground font-mono">{displayDate}</td>
                              <td className="px-3 py-1.5 text-xs text-muted-foreground font-mono">{r.SeasonID ? seasonLabel(r.SeasonID) : "—"}</td>
                              <td className="px-3 py-1.5 text-center text-xs text-muted-foreground">{isNeutral ? "N" : isHome ? "H" : "A"}</td>
                              <td className="px-3 py-1.5 text-right font-mono font-bold">
                                <Link to={`/match/${r.MatchID}`} className="hover:underline text-accent">{teamScore}–{oppScore}</Link>
                              </td>
                              <td className={`px-3 py-1.5 text-center font-bold text-xs ${won ? "text-green-600" : "text-destructive"}`}>{won ? "W" : "L"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "roster" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-sans text-muted-foreground">Season:</label>
                <select
                  className="text-sm font-sans border border-border rounded px-2 py-1 bg-background text-foreground"
                  value={rosterSeasonId || ""}
                  onChange={e => setRosterSeasonId(Number(e.target.value))}
                >
                  {availableSeasons.map(s => (
                    <option key={s} value={s}>{seasonLabel(s)}</option>
                  ))}
                </select>
              </div>

              {/* Roster & Stats table */}
              <div className="border border-border rounded overflow-hidden">
                <div className="px-3 py-2" style={headerStyle || undefined}>
                  <h3 className={`font-display text-sm font-bold ${headerStyle ? "" : "text-table-header-foreground"}`}
                    style={!headerStyle ? undefined : { color: headerStyle.color }}>
                    {rosterSeasonId ? `${seasonLabel(rosterSeasonId)} Roster & Statistics` : "Roster & Statistics"}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-sans">
                    <thead>
                      <tr className="bg-secondary">
                        <th className={`${thClass} text-left`} onClick={() => requestSort("PlayerName")}>Player{sortIndicator("PlayerName")}</th>
                        <th className={`${thClass} text-left`} onClick={() => requestSort("Position")}>Pos{sortIndicator("Position")}</th>
                        <th className={`${thClass} text-right`} onClick={() => requestSort("GamesPlayed")}>GP{sortIndicator("GamesPlayed")}</th>
                        <th className={`${thClass} text-right`} onClick={() => requestSort("Goals")}>Goals{sortIndicator("Goals")}</th>
                        <th className={`${thClass} text-right`} onClick={() => requestSort("GoldenSnitchCatches")}>GSC{sortIndicator("GoldenSnitchCatches")}</th>
                        <th className={`${thClass} text-right`} onClick={() => requestSort("KeeperSaves")}>Saves{sortIndicator("KeeperSaves")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRoster.map((p, i) => {
                        const pid = getPlayerId(p.PlayerName);
                        const posDisplay = (p as any).positions?.join("/") || p.Position;
                        return (
                          <tr key={i} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                            <td className="px-3 py-1.5 font-medium text-accent hover:underline">
                              {pid ? <Link to={`/player/${pid}`}>{p.PlayerName}</Link> : p.PlayerName}
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground">{posDisplay}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{p.GamesPlayed}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{p.Goals || "—"}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{p.GoldenSnitchCatches || "—"}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{p.KeeperSaves || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Roster Demographics */}
              <div className="border border-border rounded overflow-hidden">
                <div className="px-3 py-2" style={headerStyle || undefined}>
                  <h3 className={`font-display text-sm font-bold ${headerStyle ? "" : "text-table-header-foreground"}`}
                    style={!headerStyle ? undefined : { color: headerStyle.color }}>
                    Roster Information
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-sans">
                    <thead>
                      <tr className="bg-secondary">
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pos</th>
                        <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Age</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nat</th>
                        <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ht</th>
                        <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Wt</th>
                        <th className="px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hand</th>
                        <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Debut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRoster.map((p, i) => {
                        const pInfo = getPlayerInfo(p.PlayerName);
                        const pid = pInfo?.PlayerID;
                        const posDisplay = (p as any).positions?.join("/") || p.Position;
                        const nationName = pInfo?.NationalityID ? nations.get(pInfo.NationalityID) || "" : "";
                        const debut = p.PlayerName ? playerDebutMap.get(p.PlayerName) : null;
                        return (
                          <tr key={i} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                            <td className="px-3 py-1.5 font-medium text-accent hover:underline">
                              {pid ? <Link to={`/player/${pid}`}>{p.PlayerName}</Link> : p.PlayerName}
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground text-xs">{posDisplay}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs">{pInfo?.DOB ? calculateAge(pInfo.DOB) : "—"}</td>
                            <td className="px-3 py-1.5 text-xs">
                              {pInfo?.NationalityID ? (
                                <Link to={`/nation/${pInfo.NationalityID}`} className="text-accent hover:underline">
                                  {getNationFlag(nationName)} {nationName}
                                </Link>
                              ) : (
                                <>{getNationFlag(nationName)} {nationName}</>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs">{pInfo ? formatHeight(pInfo.Height) : "—"}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs">{pInfo?.Weight ? `${pInfo.Weight}` : "—"}</td>
                            <td className="px-3 py-1.5 text-center text-xs">{pInfo?.Handedness === "R" ? "R" : pInfo?.Handedness === "L" ? "L" : pInfo?.Handedness || "—"}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs">{debut ? seasonLabel(debut) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {currentStanding && (
                <div className="border border-border rounded overflow-hidden">
                  <div className="px-3 py-2" style={headerStyle || undefined}>
                    <h3 className={`font-display text-sm font-bold ${headerStyle ? "" : "text-table-header-foreground"}`}
                      style={!headerStyle ? undefined : { color: headerStyle.color }}>
                      {rosterSeasonId ? `${seasonLabel(rosterSeasonId)} Season Summary` : "Season Summary"}
                    </h3>
                  </div>
                  <div className="bg-card p-3 space-y-2 text-sm font-sans">
                    {(() => {
                      const s = allStandings.find(st => st.SeasonID === rosterSeasonId) || currentStanding;
                      const gd = (s.GoalsFor || 0) - (s.GoalsAgainst || 0);
                      return <>
                        <div className="flex justify-between"><span className="text-muted-foreground">Games Played</span><span className="font-mono font-bold">{s.totalgamesplayed}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Total Points</span><span className="font-mono font-bold">{s.totalpoints}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Goals For</span><span className="font-mono">{s.GoalsFor}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Goals Against</span><span className="font-mono">{s.GoalsAgainst}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Goal Difference</span><span className={`font-mono ${gd > 0 ? "text-green-600" : gd < 0 ? "text-destructive" : ""}`}>{gd > 0 ? "+" : ""}{gd}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Home Pts</span><span className="font-mono">{s.homepoints}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Away Pts</span><span className="font-mono">{s.awaypoints}</span></div>
                      </>;
                    })()}
                  </div>
                </div>
              )}

              <div className="border border-border rounded overflow-hidden">
                <div className="px-3 py-2" style={headerStyle || undefined}>
                  <h3 className={`font-display text-sm font-bold ${headerStyle ? "" : "text-table-header-foreground"}`}
                    style={!headerStyle ? undefined : { color: headerStyle.color }}>
                    Team Leaders
                  </h3>
                </div>
                <div className="bg-card p-3 space-y-3 text-sm font-sans">
                  {topScorer && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Top Scorer</p>
                      <p className="font-medium text-accent hover:underline">
                        {getPlayerId(topScorer.PlayerName) ? (
                          <Link to={`/player/${getPlayerId(topScorer.PlayerName)}`}>{topScorer.PlayerName}</Link>
                        ) : topScorer.PlayerName} — {topScorer.Goals} goals
                      </p>
                    </div>
                  )}
                  {topGSC && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Snitch Catches</p>
                      <p className="font-medium text-accent hover:underline">
                        {getPlayerId(topGSC.PlayerName) ? (
                          <Link to={`/player/${getPlayerId(topGSC.PlayerName)}`}>{topGSC.PlayerName}</Link>
                        ) : topGSC.PlayerName} — {topGSC.GoldenSnitchCatches} catches
                      </p>
                    </div>
                  )}
                  {topSaves && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Keeper Saves</p>
                      <p className="font-medium text-accent hover:underline">
                        {getPlayerId(topSaves.PlayerName) ? (
                          <Link to={`/player/${getPlayerId(topSaves.PlayerName)}`}>{topSaves.PlayerName}</Link>
                        ) : topSaves.PlayerName} — {topSaves.KeeperSaves} saves
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
