import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useSortableTable } from "@/hooks/useSortableTable";

interface Team {
  TeamID: number;
  FullName: string;
  City: string | null;
  Country: string | null;
  Nickname: string | null;
  LeagueID: number;
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

function seasonLabel(id: number): string {
  return `${id - 1}–${String(id).slice(-2)}`;
}

export default function TeamPage() {
  const { name } = useParams();
  const [team, setTeam] = useState<Team | null>(null);
  const [leagueName, setLeagueName] = useState("");
  const [currentRoster, setCurrentRoster] = useState<StatLine[]>([]);
  const [allStats, setAllStats] = useState<StatLine[]>([]);
  const [currentStanding, setCurrentStanding] = useState<StandingRow | null>(null);
  const [allStandings, setAllStandings] = useState<StandingRow[]>([]);
  const [players, setPlayers] = useState<{ PlayerID: number; PlayerName: string | null }[]>([]);
  const [seasonRegister, setSeasonRegister] = useState<SeasonRegisterRow[]>([]);
  const [activeTab, setActiveTab] = useState<"register" | "roster">("register");
  const [rosterSeasonId, setRosterSeasonId] = useState<number | null>(null);

  useEffect(() => {
    if (!name) return;
    const teamName = decodeURIComponent(name);

    Promise.all([
      supabase.from("teams").select("*").eq("FullName", teamName).single(),
      supabase.from("stats").select("*").eq("FullName", teamName),
      supabase.from("standings").select("*").eq("FullName", teamName).order("SeasonID", { ascending: false }),
      supabase.from("players").select("PlayerID, PlayerName"),
    ]).then(([{ data: teamData }, { data: statsData }, { data: standData }, { data: playerData }]) => {
      if (teamData) {
        setTeam(teamData);
        supabase.from("leagues").select("LeagueName").eq("LeagueID", teamData.LeagueID).single().then(({ data: ld }) => {
          if (ld) setLeagueName(ld.LeagueName || "");
        });
      }
      if (statsData) {
        setAllStats(statsData as StatLine[]);
        // Most recent season for roster display
        const seasons = [...new Set((statsData as StatLine[]).map(s => s.SeasonID).filter(Boolean))].sort((a, b) => (b || 0) - (a || 0));
        const latestSeason = seasons[0] || null;
        setRosterSeasonId(latestSeason);
        setCurrentRoster((statsData as StatLine[]).filter(s => s.SeasonID === latestSeason));
      }
      if (standData && standData.length > 0) {
        setAllStandings(standData as StandingRow[]);
        setCurrentStanding((standData as StandingRow[])[0]);
      }
      if (playerData) setPlayers(playerData);

      // Build season register from standings + league info
      if (standData && standData.length > 0) {
        buildSeasonRegister(teamName, standData as StandingRow[], statsData as StatLine[]);
      }
    });
  }, [name]);

  async function buildSeasonRegister(teamName: string, standings: StandingRow[], stats: StatLine[]) {
    // Get all unique season/league combos from stats
    const seasonLeagueMap = new Map<number, string>();
    (stats || []).forEach(s => {
      if (s.SeasonID && s.LeagueName) seasonLeagueMap.set(s.SeasonID, s.LeagueName);
    });

    // Get league tiers
    const leagueNames = Array.from(new Set(Array.from(seasonLeagueMap.values())));
    const { data: leagueData } = await supabase.from("leagues").select("LeagueName, LeagueTier");
    const leagueTierMap = new Map<string, number>();
    (leagueData || []).forEach(l => {
      if (l.LeagueName) leagueTierMap.set(l.LeagueName, l.LeagueTier || 1);
    });

    // For each season in standings, get all teams' points to calculate position
    const registerRows: SeasonRegisterRow[] = [];
    for (const standing of standings) {
      if (!standing.SeasonID) continue;
      const leagueN = seasonLeagueMap.get(standing.SeasonID) || leagueName;
      const tier = leagueTierMap.get(leagueN) || 1;

      // Get all teams in this season to calculate position
      const { data: allTeamStandings } = await supabase.from("standings")
        .select("FullName, totalpoints")
        .eq("SeasonID", standing.SeasonID)
        .order("totalpoints", { ascending: false });

      let position: number | null = null;
      let isChampion = false;
      if (allTeamStandings && allTeamStandings.length > 0) {
        const idx = allTeamStandings.findIndex(t => t.FullName === teamName);
        if (idx >= 0) {
          position = idx + 1;
          isChampion = idx === 0;
        }
      }

      // Top scorer for this season
      const seasonStats = (stats || []).filter(s => s.SeasonID === standing.SeasonID);

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

  // Roster for the selected season
  const displayRoster = rosterSeasonId
    ? allStats.filter(s => s.SeasonID === rosterSeasonId)
    : currentRoster;

  const posOrder: Record<string, number> = { Chaser: 1, Beater: 2, Keeper: 3, Seeker: 4 };
  const defaultSorted = [...displayRoster].sort((a, b) => (posOrder[a.Position || ""] || 5) - (posOrder[b.Position || ""] || 5));
  const { sorted: sortedRoster, sortKey, sortDir, requestSort } = useSortableTable(defaultSorted, "Position", "asc");

  const topScorer = [...displayRoster].filter((r) => r.Position === "Chaser").sort((a, b) => (b.Goals || 0) - (a.Goals || 0))[0];
  const topGSC = [...displayRoster].filter((r) => r.Position === "Seeker").sort((a, b) => (b.GoldenSnitchCatches || 0) - (a.GoldenSnitchCatches || 0))[0];
  const topSaves = [...displayRoster].filter((r) => r.Position === "Keeper").sort((a, b) => (b.KeeperSaves || 0) - (a.KeeperSaves || 0))[0];

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none";
  const sortIndicator = (key: string) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const availableSeasons = [...new Set(allStats.map(s => s.SeasonID).filter(Boolean))].sort((a, b) => (b || 0) - (a || 0)) as number[];

  // Split register into domestic and cup
  const domesticRegister = seasonRegister.filter(r => r.LeagueTier !== 0);
  const cupRegister = seasonRegister.filter(r => r.LeagueTier === 0);

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
      <div className="bg-table-header px-3 py-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">{title}</h3>
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
                    {row.isChampion ? "🏆 1" : row.position ?? "—"}
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
        <div className="mb-6 border-b-2 border-primary pb-2">
          <p className="text-xs text-muted-foreground font-sans uppercase tracking-wide">
            <Link to={`/league/${team.LeagueID}`} className="hover:text-accent">{leagueName}</Link>
          </p>
          <h1 className="font-display text-3xl font-bold text-foreground">{team.FullName}</h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">
            {team.City}{team.Country ? `, ${team.Country}` : ""}
            {team.Nickname ? ` — "${team.Nickname}"` : ""}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-border">
          <button
            onClick={() => setActiveTab("register")}
            className={`px-4 py-2 text-sm font-sans font-medium border-b-2 -mb-px transition-colors ${activeTab === "register" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Season Register
          </button>
          <button
            onClick={() => setActiveTab("roster")}
            className={`px-4 py-2 text-sm font-sans font-medium border-b-2 -mb-px transition-colors ${activeTab === "roster" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Roster & Stats
          </button>
        </div>

        {activeTab === "register" && (
          <div className="space-y-6">
            {domesticRegister.length > 0 && (
              <RegisterTable rows={domesticRegister} title="Domestic League Register" />
            )}
            {cupRegister.length > 0 && (
              <RegisterTable rows={cupRegister} title="Cup Competition Register" />
            )}
            {seasonRegister.length === 0 && (
              <p className="text-muted-foreground font-sans text-sm">No season data available.</p>
            )}
          </div>
        )}

        {activeTab === "roster" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Season selector */}
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

              <div className="border border-border rounded overflow-hidden">
                <div className="bg-table-header px-3 py-2">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">
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
                        return (
                          <tr key={i} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                            <td className="px-3 py-1.5 font-medium text-accent hover:underline">
                              {pid ? <Link to={`/player/${pid}`}>{p.PlayerName}</Link> : p.PlayerName}
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground">{p.Position}</td>
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
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {currentStanding && (
                <div className="border border-border rounded overflow-hidden">
                  <div className="bg-table-header px-3 py-2">
                    <h3 className="font-display text-sm font-bold text-table-header-foreground">
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
                <div className="bg-table-header px-3 py-2">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">Team Leaders</h3>
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
