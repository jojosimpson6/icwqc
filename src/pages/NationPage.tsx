import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getNationFlag, formatHeight, calculateAge } from "@/lib/helpers";
import { useSortableTable } from "@/hooks/useSortableTable";

interface Nation {
  NationID: number;
  Nation: string | null;
}

interface PlayerRow {
  PlayerID: number;
  PlayerName: string | null;
  Position: string | null;
  DOB: string | null;
  Height: number | null;
  headshot_url: string | null;
}

interface StatRow {
  PlayerName: string | null;
  FullName: string | null;
  GamesPlayed: number | null;
  Goals: number | null;
  GoldenSnitchCatches: number | null;
  KeeperSaves: number | null;
  KeeperShotsFaced: number | null;
  Position: string | null;
  SeasonID: number | null;
  LeagueName: string | null;
}

interface CareerRecord {
  PlayerID: number;
  PlayerName: string;
  Position: string;
  mostRecentTeam: string;
  totalGP: number;
  totalGoals: number;
  totalGSC: number;
  totalSaves: number;
  latestSeason: number;
}

interface IntlResult {
  MatchID: number;
  HomeTeamID: number | null;
  AwayTeamID: number | null;
  HomeTeamScore: number | null;
  AwayTeamScore: number | null;
  SeasonID: number | null;
  LeagueID: number | null;
  SnitchCaughtTime: number | null;
}

function seasonLabel(id: number): string {
  return `${id - 1}–${String(id).slice(-2)}`;
}

export default function NationPage() {
  const { id } = useParams();
  const [nation, setNation] = useState<Nation | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [careerRecords, setCareerRecords] = useState<CareerRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"roster" | "records" | "results">("roster");
  const [intlResults, setIntlResults] = useState<IntlResult[]>([]);
  const [teamMap, setTeamMap] = useState<Map<number, string>>(new Map());
  const [leagueMap, setLeagueMap] = useState<Map<number, string>>(new Map());
  const [nationalTeam, setNationalTeam] = useState<{ TeamID: number; FullName: string; PrimaryColor: string | null; logo_url: string | null } | null>(null);

  useEffect(() => {
    if (!id) return;
    const nid = parseInt(id);

    Promise.all([
      supabase.from("nations").select("*").eq("NationID", nid).order("ValidToDt", { ascending: false }).limit(1),
      supabase.from("players").select("PlayerID, PlayerName, Position, DOB, Height, headshot_url").eq("NationalityID", nid).order("PlayerName"),
      supabase.from("teams").select("TeamID, FullName, PrimaryColor, logo_url, nationid, LeagueID"),
      supabase.from("leagues").select("LeagueID, LeagueName, LeagueTier"),
    ]).then(([{ data: nationData }, { data: playerData }, { data: teamsData }, { data: leaguesData }]) => {
      if (nationData?.[0]) setNation(nationData[0] as Nation);
      if (playerData) setPlayers(playerData as PlayerRow[]);

      const tm = new Map<number, string>();
      (teamsData || []).forEach((t: any) => { if (t.TeamID) tm.set(t.TeamID, t.FullName); });
      setTeamMap(tm);

      const lm = new Map<number, string>();
      (leaguesData || []).forEach((l: any) => { if (l.LeagueID) lm.set(l.LeagueID, l.LeagueName || ""); });
      setLeagueMap(lm);

      // Get international league IDs (tier 0)
      const intlLeagueIds = (leaguesData || []).filter((l: any) => l.LeagueTier === 0).map((l: any) => l.LeagueID);

      // Find the national team (team with matching nationid in an international league)
      const natTeam = (teamsData || []).find((t: any) => t.nationid === nid && intlLeagueIds.includes(t.LeagueID));
      if (natTeam) {
        setNationalTeam({ TeamID: natTeam.TeamID, FullName: natTeam.FullName, PrimaryColor: natTeam.PrimaryColor, logo_url: natTeam.logo_url });

        // Fetch intl results for this national team specifically
        supabase.from("results")
          .select("MatchID,HomeTeamID,AwayTeamID,HomeTeamScore,AwayTeamScore,SeasonID,LeagueID,SnitchCaughtTime")
          .or(`HomeTeamID.eq.${natTeam.TeamID},AwayTeamID.eq.${natTeam.TeamID}`)
          .order("MatchID", { ascending: false })
          .then(({ data: rData }) => {
            if (rData) setIntlResults(rData as IntlResult[]);
          });
      } else if (intlLeagueIds.length > 0) {
        // Fallback: show all intl results
        supabase.from("results")
          .select("MatchID,HomeTeamID,AwayTeamID,HomeTeamScore,AwayTeamScore,SeasonID,LeagueID,SnitchCaughtTime")
          .in("LeagueID", intlLeagueIds)
          .order("MatchID", { ascending: false })
          .then(({ data: rData }) => {
            if (rData) setIntlResults(rData as IntlResult[]);
          });
      }

      if (playerData && playerData.length > 0) {
        const playerNames = playerData.map((p: any) => p.PlayerName).filter(Boolean);
        supabase.from("stats").select("*").in("PlayerName", playerNames).then(({ data: statsData }) => {
          if (!statsData) return;

          const recordMap = new Map<number, CareerRecord>();
          (playerData as PlayerRow[]).forEach(p => {
            recordMap.set(p.PlayerID, {
              PlayerID: p.PlayerID,
              PlayerName: p.PlayerName || "",
              Position: p.Position || "",
              mostRecentTeam: "",
              totalGP: 0,
              totalGoals: 0,
              totalGSC: 0,
              totalSaves: 0,
              latestSeason: 0,
            });
          });

          const playerNameToId = new Map<string, number>();
          (playerData as PlayerRow[]).forEach(p => {
            if (p.PlayerName) playerNameToId.set(p.PlayerName, p.PlayerID);
          });

          (statsData as StatRow[]).forEach(s => {
            if (!s.PlayerName) return;
            const pid = playerNameToId.get(s.PlayerName);
            if (!pid) return;
            const rec = recordMap.get(pid);
            if (!rec) return;
            rec.totalGP += s.GamesPlayed || 0;
            rec.totalGoals += s.Goals || 0;
            rec.totalGSC += s.GoldenSnitchCatches || 0;
            rec.totalSaves += s.KeeperSaves || 0;
            if ((s.SeasonID || 0) > rec.latestSeason) {
              rec.latestSeason = s.SeasonID || 0;
              rec.mostRecentTeam = s.FullName || "";
            }
          });

          setCareerRecords([...recordMap.values()]);
        });
      }
    });
  }, [id]);

  // Most recent roster: players who played in the latest season
  const latestSeason = careerRecords.length > 0 ? Math.max(...careerRecords.map(r => r.latestSeason)) : 0;
  const currentRoster = careerRecords.filter(r => r.latestSeason === latestSeason && latestSeason > 0);

  // Records tables
  const topByGP = [...careerRecords].sort((a, b) => b.totalGP - a.totalGP).slice(0, 15);
  const topByGoals = [...careerRecords].filter(r => r.totalGoals > 0).sort((a, b) => b.totalGoals - a.totalGoals).slice(0, 15);
  const topByGSC = [...careerRecords].filter(r => r.totalGSC > 0).sort((a, b) => b.totalGSC - a.totalGSC).slice(0, 15);
  const topBySaves = [...careerRecords].filter(r => r.totalSaves > 0).sort((a, b) => b.totalSaves - a.totalSaves).slice(0, 15);

  const { sorted: sortedRoster, sortKey, sortDir, requestSort } = useSortableTable(
    currentRoster.length > 0 ? currentRoster : careerRecords,
    "totalGP",
    "desc"
  );

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none";
  const sortInd = (key: string) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  if (!nation) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SiteHeader />
        <main className="flex-1 container py-8"><p className="text-muted-foreground font-sans">Loading nation...</p></main>
        <SiteFooter />
      </div>
    );
  }

  const RecordTable = ({ title, data, statKey, statLabel }: { title: string; data: CareerRecord[]; statKey: keyof CareerRecord; statLabel: string }) => (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2">
        <h4 className="font-display text-sm font-bold text-table-header-foreground">{title}</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-sans">
          <thead>
            <tr className="bg-secondary">
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">#</th>
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Player</th>
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pos</th>
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{statLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={r.PlayerID} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                <td className="px-3 py-1.5 font-mono text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-1.5 font-medium text-accent hover:underline">
                  <Link to={`/player/${r.PlayerID}`}>{r.PlayerName}</Link>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground text-xs">{r.Position}</td>
                <td className="px-3 py-1.5 text-accent hover:underline text-xs">
                  <Link to={`/team/${encodeURIComponent(r.mostRecentTeam)}`}>{r.mostRecentTeam}</Link>
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold">{r[statKey] as number}</td>
              </tr>
            ))}
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
          <h1 className="font-display text-3xl font-bold text-foreground">
            {getNationFlag(nation.Nation)} {nation.Nation}
          </h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">
            {players.length} registered players
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-border">
          {(["roster", "records", "results"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-sans font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "roster" ? "Current Roster" : tab === "records" ? "Players Abroad" : "All-Time Records"}
            </button>
          ))}
        </div>

        {activeTab === "roster" && (
          <div className="space-y-4">
            {latestSeason > 0 && (
              <p className="text-sm text-muted-foreground font-sans">
                Showing players active in {seasonLabel(latestSeason)}
              </p>
            )}
            <div className="border border-border rounded overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="bg-secondary">
                      <th className={`${thClass} text-left`} onClick={() => requestSort("PlayerName")}>Player{sortInd("PlayerName")}</th>
                      <th className={`${thClass} text-left`} onClick={() => requestSort("Position")}>Pos{sortInd("Position")}</th>
                      <th className={`${thClass} text-left`} onClick={() => requestSort("mostRecentTeam")}>Team{sortInd("mostRecentTeam")}</th>
                      <th className={`${thClass} text-right`} onClick={() => requestSort("totalGP")}>Career GP{sortInd("totalGP")}</th>
                      <th className={`${thClass} text-right`} onClick={() => requestSort("totalGoals")}>Goals{sortInd("totalGoals")}</th>
                      <th className={`${thClass} text-right`} onClick={() => requestSort("totalGSC")}>GSC{sortInd("totalGSC")}</th>
                      <th className={`${thClass} text-right`} onClick={() => requestSort("totalSaves")}>Saves{sortInd("totalSaves")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRoster.map((r, i) => (
                      <tr key={r.PlayerID} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                        <td className="px-3 py-1.5 font-medium text-accent hover:underline">
                          <Link to={`/player/${r.PlayerID}`}>{r.PlayerName}</Link>
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.Position}</td>
                        <td className="px-3 py-1.5 text-accent hover:underline">
                          <Link to={`/team/${encodeURIComponent(r.mostRecentTeam)}`}>{r.mostRecentTeam}</Link>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.totalGP}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.totalGoals || "—"}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.totalGSC || "—"}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.totalSaves || "—"}</td>
                      </tr>
                    ))}
                    {sortedRoster.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground italic">No player data available.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "records" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <RecordTable title="Most Appearances (Robes)" data={topByGP} statKey="totalGP" statLabel="GP" />
            {topByGoals.length > 0 && <RecordTable title="Most Goals" data={topByGoals} statKey="totalGoals" statLabel="Goals" />}
            {topByGSC.length > 0 && <RecordTable title="Most Golden Snitch Catches" data={topByGSC} statKey="totalGSC" statLabel="GSC" />}
            {topBySaves.length > 0 && <RecordTable title="Most Keeper Saves" data={topBySaves} statKey="totalSaves" statLabel="Saves" />}
          </div>
        )}

        {activeTab === "results" && (
          <div className="space-y-4">
            {intlResults.length > 0 ? (
              <div className="border border-border rounded overflow-hidden">
                <div className="bg-table-header px-3 py-2">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">International Match Results</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-sans">
                    <thead>
                      <tr className="bg-secondary">
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Season</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Competition</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Home</th>
                        <th className="px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Away</th>
                        <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Min</th>
                      </tr>
                    </thead>
                    <tbody>
                      {intlResults.map((r, i) => {
                        const homeName = r.HomeTeamID ? teamMap.get(r.HomeTeamID) || `Team ${r.HomeTeamID}` : "Unknown";
                        const awayName = r.AwayTeamID ? teamMap.get(r.AwayTeamID) || `Team ${r.AwayTeamID}` : "Unknown";
                        const compName = r.LeagueID ? leagueMap.get(r.LeagueID) || "" : "";
                        return (
                          <tr key={r.MatchID} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                            <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{r.SeasonID ? seasonLabel(r.SeasonID) : "—"}</td>
                            <td className="px-3 py-1.5 text-xs text-muted-foreground">{compName}</td>
                            <td className="px-3 py-1.5 text-accent hover:underline">
                              <Link to={`/team/${encodeURIComponent(homeName)}`}>{homeName}</Link>
                            </td>
                            <td className="px-3 py-1.5 text-center font-mono font-bold">
                              <Link to={`/match/${r.MatchID}`} className="text-accent hover:underline">
                                {r.HomeTeamScore ?? "—"}–{r.AwayTeamScore ?? "—"}
                              </Link>
                            </td>
                            <td className="px-3 py-1.5 text-accent hover:underline">
                              <Link to={`/team/${encodeURIComponent(awayName)}`}>{awayName}</Link>
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">{r.SnitchCaughtTime ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground font-sans text-sm italic">No international results found.</p>
            )}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}