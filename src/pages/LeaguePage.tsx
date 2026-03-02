import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getLeagueTierLabel } from "@/lib/helpers";
import { useSortableTable } from "@/hooks/useSortableTable";

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
}

interface AwardRow {
  awardname: string;
  placement: number;
  playerid: number;
  seasonid: number;
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

  useEffect(() => {
    if (!id) return;
    const lid = parseInt(id);

    Promise.all([
      supabase.from("leagues").select("*").eq("LeagueID", lid).single(),
      supabase.from("teams").select("*").eq("LeagueID", lid).order("FullName"),
      supabase.from("standings").select("*").order("totalpoints", { ascending: false }),
      supabase.from("awards").select("*").eq("leagueid", lid).order("seasonid", { ascending: false }),
      supabase.from("players").select("PlayerID, PlayerName, Position"),
    ]).then(([{ data: leagueData }, { data: teamData }, { data: standingsData }, { data: awardsData }, { data: playerData }]) => {
      if (leagueData) setLeague(leagueData);
      if (teamData) setTeams(teamData);
      if (standingsData && teamData) {
        const teamNames = new Set(teamData.map((t) => t.FullName));
        setStandings((standingsData as StandingRow[]).filter((s) => teamNames.has(s.FullName || "")));
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
    });
  }, [id]);

  const getViewData = () => {
    return standings.map((s) => {
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

  const hasNeutral = standings.some((s) => (s.neutralgamesplayed || 0) > 0);

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
  // Sort entries within each award by placement
  awardsBySeasonMap.forEach(seasonMap => {
    seasonMap.forEach(entries => entries.sort((a, b) => a.placement - b.placement));
  });
  const awardSeasons = [...awardsBySeasonMap.keys()].sort((a, b) => b - a);

  if (!league) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SiteHeader />
        <main className="flex-1 container py-8"><p className="text-muted-foreground font-sans">Loading league...</p></main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-2">
          <p className="text-xs text-muted-foreground font-sans uppercase tracking-wide">{getLeagueTierLabel(league.LeagueTier)}</p>
          <h1 className="font-display text-3xl font-bold text-foreground">{league.LeagueName}</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {standings.length > 0 && (
              <div className="border border-border rounded overflow-hidden">
                <div className="bg-table-header px-3 py-2 flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">Standings — 1994-1995</h3>
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

            {/* Annual Awards */}
            {awardSeasons.length > 0 && (
              <div className="border border-border rounded overflow-hidden">
                <div className="bg-table-header px-3 py-2">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">Annual Awards</h3>
                </div>
                <div className="bg-card divide-y divide-border">
                  {awardSeasons.map(seasonId => {
                    const seasonAwards = awardsBySeasonMap.get(seasonId)!;
                    const awardNames = [...seasonAwards.keys()];
                    const individualAwards = awardNames.filter(n => n !== "Team of the Year");
                    const teamOfYear = seasonAwards.get("Team of the Year");

                    return (
                      <div key={seasonId} className="px-3 py-3">
                        <h4 className="font-display text-sm font-bold text-foreground mb-2">{seasonLabel(seasonId)}</h4>
                        <div className="space-y-2">
                          {individualAwards.map(awardName => {
                            const entries = seasonAwards.get(awardName)!;
                            return (
                              <div key={awardName}>
                                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">{awardName}</p>
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                                  {entries.map((entry, i) => {
                                    const pName = playerMap.get(entry.playerid) || `Player #${entry.playerid}`;
                                    return (
                                      <span key={i} className="text-sm font-sans">
                                        <span className="text-base mr-1">
                                          {entry.placement === 1 ? "🥇" : entry.placement === 2 ? "🥈" : entry.placement === 3 ? "🥉" : ""}
                                        </span>
                                        <span className="text-muted-foreground text-xs mr-1">{ordinal(entry.placement)}</span>
                                        <Link to={`/player/${entry.playerid}`} className="text-accent hover:underline font-medium">
                                          {pName}
                                        </Link>
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                          {teamOfYear && teamOfYear.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Team of the Year</p>
                              {[...new Set(teamOfYear.map(e => e.placement))].sort().map(placement => {
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
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar: Teams */}
          <div className="space-y-6">
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
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
