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
}

interface StandingRow {
  FullName: string | null;
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

export default function TeamPage() {
  const { name } = useParams();
  const [team, setTeam] = useState<Team | null>(null);
  const [leagueName, setLeagueName] = useState("");
  const [roster, setRoster] = useState<StatLine[]>([]);
  const [standing, setStanding] = useState<StandingRow | null>(null);
  const [players, setPlayers] = useState<{ PlayerID: number; PlayerName: string | null }[]>([]);

  useEffect(() => {
    if (!name) return;
    const teamName = decodeURIComponent(name);

    Promise.all([
      supabase.from("teams").select("*").eq("FullName", teamName).single(),
      supabase.from("stats").select("*").eq("FullName", teamName).order("Goals", { ascending: false }),
      supabase.from("standings").select("*").eq("FullName", teamName).single(),
      supabase.from("players").select("PlayerID, PlayerName"),
    ]).then(([{ data: teamData }, { data: statsData }, { data: standData }, { data: playerData }]) => {
      if (teamData) {
        setTeam(teamData);
        supabase.from("leagues").select("LeagueName").eq("LeagueID", teamData.LeagueID).single().then(({ data: ld }) => {
          if (ld) setLeagueName(ld.LeagueName || "");
        });
      }
      if (statsData) setRoster(statsData as StatLine[]);
      if (standData) setStanding(standData as StandingRow);
      if (playerData) setPlayers(playerData);
    });
  }, [name]);

  const getPlayerId = (playerName: string | null) => {
    if (!playerName) return null;
    const found = players.find((p) => p.PlayerName === playerName);
    return found?.PlayerID || null;
  };

  // Sort roster by position for display
  const posOrder: Record<string, number> = { Chaser: 1, Beater: 2, Keeper: 3, Seeker: 4 };
  const defaultSorted = [...roster].sort((a, b) => (posOrder[a.Position || ""] || 5) - (posOrder[b.Position || ""] || 5));
  const { sorted: sortedRoster, sortKey, sortDir, requestSort } = useSortableTable(defaultSorted, "Position", "asc");

  // Stat leaders
  const topScorer = [...roster].filter((r) => r.Position === "Chaser").sort((a, b) => (b.Goals || 0) - (a.Goals || 0))[0];
  const topGSC = [...roster].filter((r) => r.Position === "Seeker").sort((a, b) => (b.GoldenSnitchCatches || 0) - (a.GoldenSnitchCatches || 0))[0];
  const topSaves = [...roster].filter((r) => r.Position === "Keeper").sort((a, b) => (b.KeeperSaves || 0) - (a.KeeperSaves || 0))[0];

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none";
  const sortIndicator = (key: string) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  if (!team) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SiteHeader />
        <main className="flex-1 container py-8"><p className="text-muted-foreground font-sans">Loading team...</p></main>
        <SiteFooter />
      </div>
    );
  }

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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Roster */}
            <div className="border border-border rounded overflow-hidden">
              <div className="bg-table-header px-3 py-2">
                <h3 className="font-display text-sm font-bold text-table-header-foreground">1994-1995 Roster & Statistics</h3>
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
            {standing && (
              <div className="border border-border rounded overflow-hidden">
                <div className="bg-table-header px-3 py-2">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">1994-1995 Season Summary</h3>
                </div>
                <div className="bg-card p-3 space-y-2 text-sm font-sans">
                  <div className="flex justify-between"><span className="text-muted-foreground">Games Played</span><span className="font-mono font-bold">{standing.totalgamesplayed}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total Points</span><span className="font-mono font-bold">{standing.totalpoints}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Goals For</span><span className="font-mono">{standing.GoalsFor}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Goals Against</span><span className="font-mono">{standing.GoalsAgainst}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Goal Difference</span><span className="font-mono">{(standing.GoalsFor || 0) - (standing.GoalsAgainst || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Home Pts</span><span className="font-mono">{standing.homepoints}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Away Pts</span><span className="font-mono">{standing.awaypoints}</span></div>
                </div>
              </div>
            )}

            {/* Stat leaders */}
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

            {/* History placeholder */}
            <div className="border border-border rounded overflow-hidden">
              <div className="bg-table-header px-3 py-2">
                <h3 className="font-display text-sm font-bold text-table-header-foreground">Team History</h3>
              </div>
              <div className="bg-card p-3 text-sm font-sans text-muted-foreground italic">
                League placement history and awards to be populated.
              </div>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
