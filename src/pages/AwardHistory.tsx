import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { SiteFooter } from "@/components/SiteFooter";
import { getLeagueTierLabel } from "@/lib/helpers";
import { fetchAllRows } from "@/lib/fetchAll";
import { cachedQuery } from "@/lib/queryCache";

interface League {
  LeagueID: number;
  LeagueName: string | null;
  LeagueTier: number | null;
}

interface AwardEntry {
  awardname: string;
  placement: number;
  playerid: number;
  seasonid: number;
}

function seasonLabel(id: number): string {
  return `${id - 1}–${String(id).slice(-2)}`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const MEDAL = {
  1: { bg: "bg-yellow-500/15", border: "border-yellow-500/40", text: "text-yellow-600 dark:text-yellow-400", rowBg: "bg-yellow-500/10", icon: "🥇" },
  2: { bg: "bg-slate-400/15",  border: "border-slate-400/40",  text: "text-slate-600 dark:text-slate-300",  rowBg: "bg-slate-400/10",  icon: "🥈" },
  3: { bg: "bg-amber-700/15",  border: "border-amber-700/40",  text: "text-amber-700 dark:text-amber-500",  rowBg: "bg-amber-700/10",  icon: "🥉" },
} as const;

export default function AwardHistory() {
  const { id, awardName: rawAwardName } = useParams();
  const awardName = rawAwardName ? decodeURIComponent(rawAwardName) : "";

  const [league, setLeague] = useState<League | null>(null);
  const [awards, setAwards] = useState<AwardEntry[]>([]);
  const [playerMap, setPlayerMap] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    if (!id || !awardName) return;
    const lid = parseInt(id);

    Promise.all([
      supabase.from("leagues").select("*").eq("LeagueID", lid).single(),
      fetchAllRows("awards", {
        select: "*",
        filters: [
          { method: "eq", args: ["leagueid", lid] },
          { method: "eq", args: ["awardname", awardName] },
        ],
        order: { column: "seasonid", ascending: false },
      }),
      fetchAllRows("players", { select: "PlayerID, PlayerName" }),
    ]).then(([{ data: leagueData }, awardsData, playerData]) => {
      if (leagueData) setLeague(leagueData);
      if (awardsData) setAwards(awardsData as AwardEntry[]);
      if (playerData) {
        const pm = new Map<number, string>();
        (playerData as any[]).forEach((p: any) => {
          if (p.PlayerID && p.PlayerName) pm.set(p.PlayerID, p.PlayerName);
        });
        setPlayerMap(pm);
      }
    });
  }, [id, awardName]);

  // Group by season
  const bySeason = new Map<number, AwardEntry[]>();
  awards.forEach(a => {
    if (!bySeason.has(a.seasonid)) bySeason.set(a.seasonid, []);
    bySeason.get(a.seasonid)!.push(a);
  });
  const seasons = [...bySeason.keys()].sort((a, b) => a - b);

  // All-time winner stats (1st place)
  const winnerStats = new Map<number, { wins: number; seasons: number[] }>();
  awards.filter(a => a.placement === 1).forEach(a => {
    if (!winnerStats.has(a.playerid)) winnerStats.set(a.playerid, { wins: 0, seasons: [] });
    const s = winnerStats.get(a.playerid)!;
    s.wins++;
    s.seasons.push(a.seasonid);
  });
  const isTOTY = awardName === "Team of the Year";
  // For TOTY: placement 1 = 1st Team, placement 2 = 2nd Team (multiple players per placement)
  const totyPlacementCounts = new Map<number, number>();
  awards.forEach(e => totyPlacementCounts.set(e.placement, (totyPlacementCounts.get(e.placement) || 0) + 1));
  const totyIsTeamNumber = [...totyPlacementCounts.values()].some(c => c > 1);

  // TOTY position labels for display
  const TOTY_POSITIONS = ["Chaser", "Chaser", "Chaser", "Beater", "Beater", "Keeper", "Seeker"] as const;
  const TOTY_TEAM_LABELS: Record<number, string> = { 1: "1st Team", 2: "2nd Team", 3: "3rd Team" };

  const leaderboard = [...winnerStats.entries()]
    .sort((a, b) => b[1].wins - a[1].wins)
    .slice(0, 10);

  // Podium counts per player (for all placements)
  const podiumStats = new Map<number, { p1: number; p2: number; p3: number }>();
  awards.filter(a => a.placement <= 3).forEach(a => {
    if (!podiumStats.has(a.playerid)) podiumStats.set(a.playerid, { p1: 0, p2: 0, p3: 0 });
    const s = podiumStats.get(a.playerid)!;
    if (a.placement === 1) s.p1++;
    else if (a.placement === 2) s.p2++;
    else if (a.placement === 3) s.p3++;
  });
  const podiumLeaderboard = [...podiumStats.entries()]
    .sort((a, b) => {
      const scoreA = a[1].p1 * 3 + a[1].p2 * 2 + a[1].p3;
      const scoreB = b[1].p1 * 3 + b[1].p2 * 2 + b[1].p3;
      return scoreB - scoreA;
    })
    .slice(0, 8);

  if (!league) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-14 md:pb-0">
        <SiteHeader />
        <main className="flex-1 container py-8"><p className="text-muted-foreground font-sans">Loading...</p></main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8">

        {/* Header */}
        <div className="mb-6 border-b-2 border-primary pb-3">
          <p className="text-xs text-muted-foreground font-sans uppercase tracking-wide">
            <Link to={`/league/${league.LeagueID}`} className="hover:text-accent">{league.LeagueName}</Link>
            {" · "}
            <Link to={`/league/${league.LeagueID}/history`} className="hover:text-accent">History</Link>
            {" · "}{getLeagueTierLabel(league.LeagueTier)}
          </p>
          <h1 className="font-display text-3xl font-bold text-foreground">{awardName}</h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">{seasons.length} seasons of data</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Main: Season-by-season */}
          <div className="lg:col-span-2 space-y-4">
            <div className="border border-border rounded overflow-hidden">
              <div className="bg-table-header px-3 py-2">
                <h3 className="font-display text-sm font-bold text-table-header-foreground">Season-by-Season Results</h3>
              </div>
              {isTOTY ? (
                <div className="space-y-0">
                  {seasons.map((sid, i) => {
                    const entries = (bySeason.get(sid) || []);
                    const teams = totyIsTeamNumber
                      ? [...new Set(entries.map(e => e.placement))].sort()
                      : [1];

                    return (
                      <div key={sid} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-table-stripe"}`}>
                        <div className="px-4 pt-3 pb-1">
                          <span className="font-mono font-bold text-accent text-sm">{seasonLabel(sid)}</span>
                        </div>
                        <div className={`px-4 pb-3 grid gap-3 ${teams.length > 1 ? "md:grid-cols-2" : "grid-cols-1"}`}>
                          {teams.map(pl => {
                            const teamEntries = totyIsTeamNumber
                              ? entries.filter(e => e.placement === pl)
                              : entries.sort((a, b) => a.placement - b.placement);
                            const m = pl === 1 ? MEDAL[1] : pl === 2 ? MEDAL[2] : MEDAL[3];
                            const teamLabel = TOTY_TEAM_LABELS[pl] || `${pl}th Team`;
                            // Group by inferred position (by slot order: 3 Chasers, 2 Beaters, 1 Keeper, 1 Seeker)
                            const slots: { label: string; players: AwardEntry[] }[] = [
                              { label: "Chasers", players: teamEntries.slice(0, 3) },
                              { label: "Beaters", players: teamEntries.slice(3, 5) },
                              { label: "Keeper", players: teamEntries.slice(5, 6) },
                              { label: "Seeker", players: teamEntries.slice(6, 7) },
                            ].filter(s => s.players.length > 0);

                            return (
                              <div key={pl} className={`rounded border ${m.border} ${m.bg} p-3`}>
                                <p className={`text-xs font-bold mb-2 ${m.text}`}>{totyIsTeamNumber ? teamLabel : "Team of the Year"}</p>
                                <div className="space-y-1.5">
                                  {slots.map(slot => (
                                    <div key={slot.label} className="flex items-start gap-2">
                                      <span className="text-xs text-muted-foreground w-16 shrink-0 pt-0.5">{slot.label}</span>
                                      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                                        {slot.players.map(e => (
                                          <Link key={e.playerid} to={`/player/${e.playerid}`} className="text-accent hover:underline text-sm font-medium">
                                            {playerMap.get(e.playerid) || `#${e.playerid}`}
                                          </Link>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (() => {
                // Dynamically determine which placement columns have any data
                const allPlacements = [...new Set(awards.map(a => a.placement))].sort((a,b)=>a-b);
                const maxPlacement = Math.min(Math.max(...allPlacements, 1), 5);
                const showPlacements = Array.from({length: maxPlacement}, (_, i) => i + 1)
                  .filter(p => allPlacements.includes(p));

                const PLACE_LABELS: Record<number, string> = {
                  1: "🥇 Winner", 2: "🥈 Runner-up", 3: "🥉 3rd Place",
                  4: "4th Place", 5: "5th Place",
                };
                const PLACE_BG: Record<number, string> = {
                  1: "bg-yellow-500/10", 2: "bg-slate-400/10", 3: "bg-amber-700/10",
                  4: "", 5: "",
                };

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm font-sans">
                      <thead>
                        <tr className="bg-secondary">
                          <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Season</th>
                          {showPlacements.map(p => (
                            <th key={p} className={`px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground ${PLACE_BG[p] || ""}`}>
                              {PLACE_LABELS[p] || `${p}th`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {seasons.map((sid, i) => {
                          const entries = (bySeason.get(sid) || []).sort((a, b) => a.placement - b.placement);
                          const byP = (p: number) => entries.find(e => e.placement === p);
                          return (
                            <tr key={sid} className={`border-t border-border hover:bg-highlight/10`}>
                              <td className="px-3 py-2 font-mono font-medium text-sm">
                                <Link to={`/league/${id}/history`} className="text-accent hover:underline">
                                  {seasonLabel(sid)}
                                </Link>
                              </td>
                              {showPlacements.map(p => {
                                const entry = byP(p);
                                return (
                                  <td key={p} className={`px-3 py-2 ${PLACE_BG[p] || ""}`}>
                                    {entry ? (
                                      <Link to={`/player/${entry.playerid}`}
                                        className={`hover:underline font-medium ${p === 1 ? "font-bold text-accent" : "text-accent"}`}>
                                        {playerMap.get(entry.playerid) || `#${entry.playerid}`}
                                      </Link>
                                    ) : (
                                      showPlacements.length === 1
                                        ? null  // only 1 column → no dash needed
                                        : <span className="text-muted-foreground text-xs">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Sidebar: Hall of Fame */}
          <div className="space-y-5">

            {/* Winners leaderboard */}
            {leaderboard.length > 0 && (
              <div className="border border-border rounded overflow-hidden">
                <div className="bg-table-header px-3 py-2">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">🏆 Most Wins</h3>
                </div>
                <div className="bg-card divide-y divide-border">
                  {leaderboard.map(([pid, stats], i) => {
                    const m = i === 0 ? MEDAL[1] : i === 1 ? MEDAL[2] : i === 2 ? MEDAL[3] : null;
                    return (
                      <div key={pid} className={`px-3 py-2.5 flex items-center gap-3 ${m ? m.bg : ""}`}>
                        <span className={`font-mono text-sm font-bold w-5 text-center ${m ? m.text : "text-muted-foreground"}`}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <Link to={`/player/${pid}`} className="text-accent hover:underline font-medium text-sm font-sans block truncate">
                            {playerMap.get(pid) || `#${pid}`}
                          </Link>
                          <p className="text-xs text-muted-foreground font-sans">
                            {stats.seasons.map(s => seasonLabel(s)).join(", ")}
                          </p>
                        </div>
                        <span className={`font-mono font-bold text-sm ${m ? m.text : "text-foreground"}`}>{stats.wins}×</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Podium appearances */}
            {podiumLeaderboard.length > 0 && (
              <div className="border border-border rounded overflow-hidden">
                <div className="bg-table-header px-3 py-2">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">Podium Finishes</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-sans">
                    <thead>
                      <tr className="bg-secondary">
                        <th className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Player</th>
                        <th className="px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">🥇</th>
                        <th className="px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">🥈</th>
                        <th className="px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">🥉</th>
                      </tr>
                    </thead>
                    <tbody>
                      {podiumLeaderboard.map(([pid, stats], i) => (
                        <tr key={pid} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                          <td className="px-2 py-1.5">
                            <Link to={`/player/${pid}`} className="text-accent hover:underline font-medium text-xs">
                              {playerMap.get(pid) || `#${pid}`}
                            </Link>
                          </td>
                          <td className={`px-2 py-1.5 text-center font-mono text-xs font-bold ${MEDAL[1].text}`}>{stats.p1 || "—"}</td>
                          <td className={`px-2 py-1.5 text-center font-mono text-xs font-bold ${MEDAL[2].text}`}>{stats.p2 || "—"}</td>
                          <td className={`px-2 py-1.5 text-center font-mono text-xs font-bold ${MEDAL[3].text}`}>{stats.p3 || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Other awards in this league */}
            <div className="border border-border rounded overflow-hidden">
              <div className="bg-table-header px-3 py-2">
                <h3 className="font-display text-sm font-bold text-table-header-foreground">Back to League</h3>
              </div>
              <div className="bg-card p-3 space-y-2">
                <Link to={`/league/${id}`} className="block text-sm text-accent hover:underline font-sans">← {league.LeagueName}</Link>
                <Link to={`/league/${id}/history`} className="block text-sm text-accent hover:underline font-sans">← League History</Link>
                <Link to={`/league/${id}/history`} onClick={() => {}} className="block text-sm text-accent hover:underline font-sans">
                  ← Award History (all awards)
                </Link>
              </div>
            </div>
          </div>
        </div>

      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
