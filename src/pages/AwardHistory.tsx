import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
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
  const [playerNationMap, setPlayerNationMap] = useState<Map<number, string>>(new Map());

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
      fetchAllRows("players", { select: "PlayerID, PlayerName, Nationality" }),
    ]).then(([{ data: leagueData }, awardsData, playerData]) => {
      if (leagueData) setLeague(leagueData);
      if (awardsData) setAwards(awardsData as AwardEntry[]);
      if (playerData) {
        const pm = new Map<number, string>();
        const pnm = new Map<number, string>();
        (playerData as any[]).forEach((p: any) => {
          if (p.PlayerID && p.PlayerName) pm.set(p.PlayerID, p.PlayerName);
          if (p.PlayerID && p.Nationality) pnm.set(p.PlayerID, p.Nationality);
        });
        setPlayerMap(pm);
        setPlayerNationMap(pnm);
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
  // TOTY: detect if placement = team number or sequential slot
  const totyPlacementCounts = new Map<number, number>();
  awards.forEach(e => totyPlacementCounts.set(e.placement, (totyPlacementCounts.get(e.placement) || 0) + 1));
  const totyIsTeamNumber = [...totyPlacementCounts.values()].some(c => c > 1);

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
      <div className="min-h-screen bg-background flex flex-col">
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
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-sans">
                    <thead>
                      <tr className="bg-secondary">
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Season</th>
                        {totyIsTeamNumber && <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team</th>}
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Players</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seasons.flatMap((sid, i) => {
                        const entries = (bySeason.get(sid) || []);
                        if (totyIsTeamNumber) {
                          return [...new Set(entries.map(e => e.placement))].sort().map(pl => {
                            const MEDAL_MAP: Record<number, {text: string, bg: string}> = {
                              1: {text: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/10"},
                              2: {text: "text-slate-600 dark:text-slate-300", bg: "bg-slate-400/10"},
                              3: {text: "text-amber-700 dark:text-amber-500", bg: "bg-amber-700/10"},
                            };
                            const m = MEDAL_MAP[pl] || {text: "text-muted-foreground", bg: ""};
                            return (
                              <tr key={`${sid}-${pl}`} className={`border-t border-border ${(i+pl)%2===1?"bg-table-stripe":"bg-card"}`}>
                                <td className="px-3 py-2 font-mono text-accent font-medium">{seasonLabel(sid)}</td>
                                <td className={`px-3 py-2 text-xs font-bold ${m.text}`}>{pl===1?"1st":pl===2?"2nd":"3rd"} Team</td>
                                <td className="px-3 py-2">
                                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                                    {entries.filter(e => e.placement === pl).map(e => (
                                      <Link key={e.playerid} to={`/player/${e.playerid}`} className="text-accent hover:underline text-sm">{playerMap.get(e.playerid) || `#${e.playerid}`}</Link>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          });
                        } else {
                          return [(
                            <tr key={sid} className={`border-t border-border ${i%2===1?"bg-table-stripe":"bg-card"}`}>
                              <td className="px-3 py-2 font-mono text-accent font-medium">{seasonLabel(sid)}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-x-3 gap-y-1">
                                  {entries.sort((a,b)=>a.placement-b.placement).map(e => (
                                    <Link key={e.playerid} to={`/player/${e.playerid}`} className="text-accent hover:underline text-sm">{playerMap.get(e.playerid) || `#${e.playerid}`}</Link>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )];
                        }
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="bg-secondary">
                      <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Season</th>
                      <th className={`px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>🥇 Winner</th>
                      <th className={`px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>🥈 Runner-up</th>
                      <th className={`px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>🥉 3rd Place</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasons.map((sid, i) => {
                      const entries = (bySeason.get(sid) || []).sort((a, b) => a.placement - b.placement);
                      const byP = (p: number) => entries.find(e => e.placement === p);
                      const first = byP(1);
                      const second = byP(2);
                      const third = byP(3);

                      const cell = (entry: AwardEntry | undefined, placement: 1 | 2 | 3) => {
                        const m = MEDAL[placement];
                        return (
                          <td className={`px-3 py-2 ${m.rowBg}`}>
                            {entry ? (
                              <div>
                                <Link to={`/player/${entry.playerid}`} className={`hover:underline font-medium ${placement === 1 ? "text-accent font-bold" : "text-accent"}`}>
                                  {playerMap.get(entry.playerid) || `#${entry.playerid}`}
                                </Link>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                        );
                      };

                      return (
                        <tr key={sid} className={`border-t border-border hover:bg-highlight/10`}>
                          <td className="px-3 py-2 font-mono font-medium text-sm">
                            <Link to={`/league/${id}/history`} className="text-accent hover:underline">
                              {seasonLabel(sid)}
                            </Link>
                          </td>
                          {cell(first, 1)}
                          {cell(second, 2)}
                          {cell(third, 3)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
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
    </div>
  );
}
