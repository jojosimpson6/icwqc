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

interface SeasonSummary {
  seasonId: number;
  champion: string | null;
  runnerUp: string | null;
  third: string | null;
  teams: { name: string; pts: number; gp: number; gf: number; ga: number; gsc: number }[];
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
  gold:   { bg: "bg-yellow-500/15", border: "border-yellow-500/40", text: "text-yellow-600 dark:text-yellow-400", badge: "bg-yellow-500 text-yellow-950", label: "1st", rowBg: "bg-yellow-500/10" },
  silver: { bg: "bg-slate-400/15",  border: "border-slate-400/40",  text: "text-slate-600 dark:text-slate-300",  badge: "bg-slate-400 text-slate-950",  label: "2nd", rowBg: "bg-slate-400/10"  },
  bronze: { bg: "bg-amber-700/15",  border: "border-amber-700/40",  text: "text-amber-700 dark:text-amber-500",  badge: "bg-amber-700 text-amber-50",   label: "3rd", rowBg: "bg-amber-700/10" },
};

export default function LeagueHistory() {
  const { id } = useParams();
  const [league, setLeague] = useState<League | null>(null);
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [awards, setAwards] = useState<AwardEntry[]>([]);
  const [playerMap, setPlayerMap] = useState<Map<number, string>>(new Map());
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);
  const [seasonResults, setSeasonResults] = useState<any[]>([]);
  const [teamMap, setTeamMap] = useState<Record<number, string>>({});
  const [activeTab, setActiveTab] = useState<"timeline" | "awards">("timeline");

  useEffect(() => {
    if (!id) return;
    const lid = parseInt(id);

    Promise.all([
      supabase.from("leagues").select("*").eq("LeagueID", lid).single(),
      fetchAllRows("teams", { select: "TeamID, FullName", filters: [{ method: "eq", args: ["LeagueID", lid] }] }),
      fetchAllRows("standings", { select: "*", order: { column: "totalpoints", ascending: false } }),
      fetchAllRows("awards", { select: "*", filters: [{ method: "eq", args: ["leagueid", lid] }], order: { column: "seasonid", ascending: false } }),
      fetchAllRows("players", { select: "PlayerID, PlayerName" }),
    ]).then(([{ data: leagueData }, teamData, standingsData, awardsData, playerData]) => {
      if (leagueData) setLeague(leagueData);

      const tMap: Record<number, string> = {};
      const teamNames = new Set<string>();
      if (teamData) {
        teamData.forEach(t => { tMap[t.TeamID] = t.FullName; teamNames.add(t.FullName); });
      }
      setTeamMap(tMap);

      if (standingsData) {
        const leagueStandings = standingsData.filter((s: any) => teamNames.has(s.FullName || ""));
        const bySeasonMap = new Map<number, any[]>();
        leagueStandings.forEach((s: any) => {
          const sid = s.SeasonID;
          if (sid == null) return;
          if (!bySeasonMap.has(sid)) bySeasonMap.set(sid, []);
          bySeasonMap.get(sid)!.push(s);
        });

        const summaries: SeasonSummary[] = [];
        bySeasonMap.forEach((rows, sid) => {
          const sorted = rows.sort((a: any, b: any) => (b.totalpoints || 0) - (a.totalpoints || 0));
          summaries.push({
            seasonId: sid,
            champion: sorted[0]?.FullName ?? null,
            runnerUp: sorted[1]?.FullName ?? null,
            third: sorted[2]?.FullName ?? null,
            teams: sorted.map((r: any) => ({
              name: r.FullName || "",
              pts: r.totalpoints || 0,
              gp: r.totalgamesplayed || 0,
              gf: r.GoalsFor || 0,
              ga: r.GoalsAgainst || 0,
              gsc: r.totalgsc || 0,
            })),
          });
        });
        summaries.sort((a, b) => b.seasonId - a.seasonId);
        setSeasons(summaries);
      }

      if (awardsData) setAwards(awardsData as AwardEntry[]);
      if (playerData) {
        const pm = new Map<number, string>();
        (playerData as any[]).forEach((p: any) => { if (p.PlayerID && p.PlayerName) pm.set(p.PlayerID, p.PlayerName); });
        setPlayerMap(pm);
      }
    });
  }, [id]);

  useEffect(() => {
    if (expandedSeason == null || !id) { setSeasonResults([]); return; }
    const lid = parseInt(id);
    supabase
      .from("results")
      .select("MatchID, HomeTeamID, AwayTeamID, HomeTeamScore, AwayTeamScore, WeekID")
      .eq("LeagueID", lid)
      .eq("SeasonID", expandedSeason)
      .order("WeekID", { ascending: true })
      .then(({ data }) => { setSeasonResults(data || []); });
  }, [expandedSeason, id]);

  // Awards grouped by season
  const awardsBySeason = new Map<number, Map<string, AwardEntry[]>>();
  awards.forEach(a => {
    if (!awardsBySeason.has(a.seasonid)) awardsBySeason.set(a.seasonid, new Map());
    const m = awardsBySeason.get(a.seasonid)!;
    if (!m.has(a.awardname)) m.set(a.awardname, []);
    m.get(a.awardname)!.push(a);
  });

  // All unique award names (including TOTY)
  const allAwardNames = [...new Set(awards.map(a => a.awardname))].sort();

  // Champion win counts
  const championCounts = new Map<string, number>();
  seasons.forEach(s => {
    if (s.champion) championCounts.set(s.champion, (championCounts.get(s.champion) || 0) + 1);
  });
  const mostTitles = [...championCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

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
            {" · "}{getLeagueTierLabel(league.LeagueTier)}
          </p>
          <h1 className="font-display text-3xl font-bold text-foreground">League History</h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">
            {seasons.length} seasons
            {seasons.length > 0 ? ` · ${seasonLabel(seasons[seasons.length - 1].seasonId)} — ${seasonLabel(seasons[0].seasonId)}` : ""}
          </p>
        </div>

        {/* Most Titles bar */}
        {mostTitles.length > 0 && (
          <div className="mb-6 border border-border rounded overflow-hidden">
            <div className="bg-table-header px-3 py-2">
              <h3 className="font-display text-sm font-bold text-table-header-foreground">Most League Titles</h3>
            </div>
            <div className="flex flex-wrap divide-x divide-border bg-card">
              {mostTitles.map(([team, count], i) => (
                <div key={team} className={`px-4 py-3 flex-1 min-w-[120px] ${i === 0 ? MEDAL.gold.bg : ""}`}>
                  <div className="flex items-center gap-2">
                    {i === 0 && <span className="text-lg leading-none">🏆</span>}
                    <div>
                      <Link to={`/team/${encodeURIComponent(team)}`} className="text-accent hover:underline font-sans font-medium text-sm block leading-tight">{team}</Link>
                      <span className="text-xs text-muted-foreground font-mono">{count} title{count !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0 mb-5 border-b border-border">
          {(["timeline", "awards"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-sans font-medium capitalize transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "timeline" ? "Season Timeline" : "Award History"}
            </button>
          ))}
        </div>

        {/* ═══ SEASON TIMELINE ═══ */}
        {activeTab === "timeline" && (
          <div className="space-y-3">
            {seasons.map(s => {
              const isExpanded = expandedSeason === s.seasonId;
              const seasonAwards = awardsBySeason.get(s.seasonId);
              const individualAwardEntries = seasonAwards
                ? [...seasonAwards.entries()].filter(([n]) => n !== "Team of the Year")
                : [];

              return (
                <div key={s.seasonId} className="border border-border rounded overflow-hidden">

                  {/* Clickable header */}
                  <div
                    className="cursor-pointer hover:bg-highlight/10 transition-colors bg-card"
                    onClick={() => setExpandedSeason(isExpanded ? null : s.seasonId)}
                  >
                    <div className="flex items-center justify-between px-4 pt-3 pb-2">
                      <h3 className="font-display text-base font-bold text-foreground">{seasonLabel(s.seasonId)}</h3>
                      <span className="text-xs text-muted-foreground font-sans select-none">{isExpanded ? "▲ collapse" : "▼ details"}</span>
                    </div>

                    {/* Podium */}
                    <div className="grid grid-cols-3 gap-2 px-4 pb-3">
                      {(["gold", "silver", "bronze"] as const).map((medal, rank) => {
                        const teamName = rank === 0 ? s.champion : rank === 1 ? s.runnerUp : s.third;
                        const m = MEDAL[medal];
                        return (
                          <div key={medal} className={`rounded border ${m.border} ${m.bg} px-3 py-2`}>
                            <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded ${m.badge} inline-block mb-1`}>{m.label}</span>
                            {teamName ? (
                              <Link
                                to={`/team/${encodeURIComponent(teamName)}`}
                                onClick={e => e.stopPropagation()}
                                className={`block text-sm font-medium font-sans hover:underline leading-snug ${m.text}`}
                              >
                                {teamName}
                              </Link>
                            ) : (
                              <span className="block text-xs text-muted-foreground font-sans italic">—</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Award winners strip */}
                    {individualAwardEntries.length > 0 && (
                      <div className="border-t border-border/60 bg-secondary/20 px-4 py-2 flex flex-wrap gap-x-5 gap-y-1">
                        {individualAwardEntries.map(([awardName, entries]) => {
                          const winner = entries.find(e => e.placement === 1);
                          if (!winner) return null;
                          return (
                            <span key={awardName} className="text-xs font-sans">
                              <span className="text-muted-foreground">{awardName}: </span>
                              <Link
                                to={`/player/${winner.playerid}`}
                                onClick={e => e.stopPropagation()}
                                className="text-accent hover:underline font-medium"
                              >
                                {playerMap.get(winner.playerid) || `#${winner.playerid}`}
                              </Link>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div className="border-t border-border">

                      {/* Full Standings */}
                      <div className="p-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Final Standings</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm font-sans">
                            <thead>
                              <tr className="bg-secondary">
                                {["#", "Team", "GP", "Pts", "GF", "GA", "GD", "GSC"].map((h, i) => (
                                  <th key={h} className={`px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${i < 2 ? "text-left" : "text-right"}`}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {s.teams.map((t, i) => {
                                const rowBg = i === 0 ? MEDAL.gold.rowBg : i === 1 ? MEDAL.silver.rowBg : i === 2 ? MEDAL.bronze.rowBg : i % 2 === 1 ? "bg-table-stripe" : "bg-card";
                                return (
                                  <tr key={t.name} className={`border-t border-border ${rowBg}`}>
                                    <td className="px-2 py-1.5 font-mono text-muted-foreground text-xs">{i + 1}</td>
                                    <td className="px-2 py-1.5 font-medium">
                                      <Link to={`/team/${encodeURIComponent(t.name)}`} className="text-accent hover:underline">{t.name}</Link>
                                    </td>
                                    <td className="px-2 py-1.5 text-right font-mono">{t.gp}</td>
                                    <td className="px-2 py-1.5 text-right font-mono font-bold">{t.pts}</td>
                                    <td className="px-2 py-1.5 text-right font-mono">{t.gf}</td>
                                    <td className="px-2 py-1.5 text-right font-mono">{t.ga}</td>
                                    <td className="px-2 py-1.5 text-right font-mono">{t.gf - t.ga}</td>
                                    <td className="px-2 py-1.5 text-right font-mono">{t.gsc}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Season Awards */}
                      {seasonAwards && seasonAwards.size > 0 && (
                        <div className="p-4 border-t border-border">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Season Awards</h4>
                          <div className="space-y-2.5">
                            {individualAwardEntries.map(([awardName, entries]) => {
                              const sorted = [...entries].sort((a, b) => a.placement - b.placement).slice(0, 3);
                              return (
                                <div key={awardName} className="flex flex-wrap items-center gap-2">
                                  <Link
                                    to={`/league/${id}/award/${encodeURIComponent(awardName)}`}
                                    className="text-sm font-semibold text-accent hover:underline font-sans w-48 shrink-0"
                                  >
                                    {awardName} →
                                  </Link>
                                  <div className="flex gap-2 flex-wrap">
                                    {sorted.map(e => {
                                      const m = e.placement === 1 ? MEDAL.gold : e.placement === 2 ? MEDAL.silver : MEDAL.bronze;
                                      return (
                                        <span key={e.placement} className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded border ${m.border} ${m.bg}`}>
                                          <span className={`font-mono font-bold ${m.text}`}>{ordinal(e.placement)}</span>
                                          <Link to={`/player/${e.playerid}`} className="text-accent hover:underline">
                                            {playerMap.get(e.playerid) || `#${e.playerid}`}
                                          </Link>
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Team of the Year */}
                            {seasonAwards.has("Team of the Year") && (() => {
                              const toty = seasonAwards.get("Team of the Year")!;
                              const placementCounts = new Map<number, number>();
                              toty.forEach(e => placementCounts.set(e.placement, (placementCounts.get(e.placement) || 0) + 1));
                              const isTeamNumber = [...placementCounts.values()].some(c => c > 1);
                              const placements = [...new Set(toty.map(e => e.placement))].sort();
                              return (
                                <div className="pt-1">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <Link
                                      to={`/league/${id}/award/${encodeURIComponent("Team of the Year")}`}
                                      className="text-sm font-semibold text-accent hover:underline font-sans"
                                    >
                                      Team of the Year →
                                    </Link>
                                  </div>
                                  {isTeamNumber ? placements.map(placement => {
                                    const m = placement === 1 ? MEDAL.gold : placement === 2 ? MEDAL.silver : MEDAL.bronze;
                                    return (
                                      <div key={placement} className="mb-1 flex gap-2 flex-wrap items-center">
                                        <span className={`text-xs font-bold ${m.text} w-24`}>{ordinal(placement)} Team:</span>
                                        {toty.filter(e => e.placement === placement).map((e, i, arr) => (
                                          <span key={e.playerid}>
                                            <Link to={`/player/${e.playerid}`} className="text-accent hover:underline text-xs">
                                              {playerMap.get(e.playerid) || `#${e.playerid}`}
                                            </Link>
                                            {i < arr.length - 1 && <span className="text-muted-foreground">, </span>}
                                          </span>
                                        ))}
                                      </div>
                                    );
                                  }) : (
                                    <div className="flex flex-wrap gap-1">
                                      {[...toty].sort((a, b) => a.placement - b.placement).map((e, i, arr) => (
                                        <span key={e.playerid}>
                                          <Link to={`/player/${e.playerid}`} className="text-accent hover:underline text-xs">
                                            {playerMap.get(e.playerid) || `#${e.playerid}`}
                                          </Link>
                                          {i < arr.length - 1 && <span className="text-muted-foreground">, </span>}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Match Results */}
                      {seasonResults.length > 0 && (
                        <div className="p-4 border-t border-border">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Results ({seasonResults.length} matches)</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[360px] overflow-y-auto pr-1">
                            {seasonResults.map((r: any) => (
                              <Link
                                key={r.MatchID}
                                to={`/match/${r.MatchID}`}
                                className="border border-border rounded bg-card hover:bg-highlight/20 p-2 text-sm font-sans block"
                              >
                                <div className="text-xs text-muted-foreground mb-1">Week {r.WeekID}</div>
                                <div className={`flex justify-between ${r.HomeTeamScore > r.AwayTeamScore ? "font-bold" : ""}`}>
                                  <span className="truncate mr-2">{teamMap[r.HomeTeamID] || "?"}</span>
                                  <span className="font-mono">{r.HomeTeamScore}</span>
                                </div>
                                <div className={`flex justify-between ${r.AwayTeamScore > r.HomeTeamScore ? "font-bold" : ""}`}>
                                  <span className="truncate mr-2">{teamMap[r.AwayTeamID] || "?"}</span>
                                  <span className="font-mono">{r.AwayTeamScore}</span>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ AWARD HISTORY TAB ═══ */}
        {activeTab === "awards" && (
          <div className="space-y-6">
            {allAwardNames.length === 0 && (
              <p className="text-sm text-muted-foreground font-sans italic">No individual award history found for this league.</p>
            )}

            {allAwardNames.map(awardName => {
              const isTOTY = awardName === "Team of the Year";
              const allWinners = awards
                .filter(a => a.awardname === awardName && a.placement === 1)
                .sort((a, b) => a.seasonid - b.seasonid);

              const winCounts = new Map<number, number>();
              allWinners.forEach(w => winCounts.set(w.playerid, (winCounts.get(w.playerid) || 0) + 1));
              const leaders = [...winCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

              const totySeasonEntries = awards.filter(a => a.awardname === "Team of the Year");
              const totyPlacementCounts = new Map<number, number>();
              totySeasonEntries.forEach(e => totyPlacementCounts.set(e.placement, (totyPlacementCounts.get(e.placement) || 0) + 1));
              const totyIsTeamNumber = [...totyPlacementCounts.values()].some(c => c > 1);

              return (
                <div key={awardName} className="border border-border rounded overflow-hidden">
                  <div className="bg-table-header px-4 py-2.5 flex items-center justify-between">
                    <h3 className="font-display text-sm font-bold text-table-header-foreground">{awardName}</h3>
                    <Link
                      to={`/league/${id}/award/${encodeURIComponent(awardName)}`}
                      className="text-xs text-table-header-foreground/70 hover:text-table-header-foreground font-sans transition-colors"
                    >
                      Full history →
                    </Link>
                  </div>

                  {!isTOTY && leaders.length > 0 && (
                    <div className="flex flex-wrap divide-x divide-border border-b border-border">
                      {leaders.map(([pid, count], i) => {
                        const m = i === 0 ? MEDAL.gold : i === 1 ? MEDAL.silver : MEDAL.bronze;
                        return (
                          <div key={pid} className={`px-4 py-2 flex-1 min-w-[130px] flex items-center gap-2 ${m.bg}`}>
                            <span className={`text-sm font-bold font-mono ${m.text}`}>{count}×</span>
                            <Link to={`/player/${pid}`} className="text-accent hover:underline text-sm font-sans font-medium">
                              {playerMap.get(pid) || `#${pid}`}
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  )}

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
                          {[...new Set(totySeasonEntries.map(e => e.seasonid))].sort((a, b) => a - b).flatMap((sid, i) => {
                            const entries = totySeasonEntries.filter(e => e.seasonid === sid);
                            if (totyIsTeamNumber) {
                              return [...new Set(entries.map(e => e.placement))].sort().map(pl => {
                                const m = pl === 1 ? MEDAL.gold : pl === 2 ? MEDAL.silver : MEDAL.bronze;
                                return (
                                  <tr key={`${sid}-${pl}`} className={`border-t border-border ${(i + pl) % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                                    <td className="px-3 py-1.5 font-mono font-medium text-accent">{seasonLabel(sid)}</td>
                                    <td className={`px-3 py-1.5 text-xs font-bold ${m.text}`}>{pl === 1 ? "1st" : pl === 2 ? "2nd" : "3rd"} Team</td>
                                    <td className="px-3 py-1.5">
                                      <div className="flex flex-wrap gap-2">
                                        {entries.filter(e => e.placement === pl).map(e => (
                                          <Link key={e.playerid} to={`/player/${e.playerid}`} className="text-accent hover:underline text-xs">{playerMap.get(e.playerid) || `#${e.playerid}`}</Link>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              });
                            } else {
                              return [(
                                <tr key={sid} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                                  <td className="px-3 py-1.5 font-mono font-medium text-accent">{seasonLabel(sid)}</td>
                                  <td className="px-3 py-1.5">
                                    <div className="flex flex-wrap gap-2">
                                      {entries.sort((a, b) => a.placement - b.placement).map(e => (
                                        <Link key={e.playerid} to={`/player/${e.playerid}`} className="text-accent hover:underline text-xs">{playerMap.get(e.playerid) || `#${e.playerid}`}</Link>
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
                            <th className={`px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground ${MEDAL.gold.rowBg}`}>🥇 Winner</th>
                            <th className={`px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground ${MEDAL.silver.rowBg}`}>🥈 Runner-up</th>
                            <th className={`px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground ${MEDAL.bronze.rowBg}`}>🥉 3rd Place</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allWinners.map((w, i) => {
                            const seasonEntries = awards.filter(a => a.awardname === awardName && a.seasonid === w.seasonid);
                            const p2 = seasonEntries.find(e => e.placement === 2);
                            const p3 = seasonEntries.find(e => e.placement === 3);
                            return (
                              <tr key={w.seasonid} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                                <td className="px-3 py-1.5 font-medium text-accent font-mono">{seasonLabel(w.seasonid)}</td>
                                <td className={`px-3 py-1.5 ${MEDAL.gold.rowBg}`}>
                                  <Link to={`/player/${w.playerid}`} className="text-accent hover:underline font-semibold">{playerMap.get(w.playerid) || `#${w.playerid}`}</Link>
                                </td>
                                <td className={`px-3 py-1.5 ${MEDAL.silver.rowBg}`}>
                                  {p2 ? <Link to={`/player/${p2.playerid}`} className="text-accent hover:underline">{playerMap.get(p2.playerid) || `#${p2.playerid}`}</Link> : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className={`px-3 py-1.5 ${MEDAL.bronze.rowBg}`}>
                                  {p3 ? <Link to={`/player/${p3.playerid}`} className="text-accent hover:underline">{playerMap.get(p3.playerid) || `#${p3.playerid}`}</Link> : <span className="text-muted-foreground">—</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </main>
      <SiteFooter />
    </div>
  );
}
