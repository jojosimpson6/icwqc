import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getLeagueTierLabel } from "@/lib/helpers";
import { fetchAllRows } from "@/lib/fetchAll";

interface League {
  LeagueID: number;
  LeagueName: string | null;
  LeagueTier: number | null;
}

interface SeasonSummary {
  seasonId: number;
  champion: string | null;
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

export default function LeagueHistory() {
  const { id } = useParams();
  const [league, setLeague] = useState<League | null>(null);
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [awards, setAwards] = useState<AwardEntry[]>([]);
  const [playerMap, setPlayerMap] = useState<Map<number, string>>(new Map());
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);
  const [seasonResults, setSeasonResults] = useState<any[]>([]);
  const [teamMap, setTeamMap] = useState<Record<number, string>>({});

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
        teamData.forEach(t => {
          tMap[t.TeamID] = t.FullName;
          teamNames.add(t.FullName);
        });
      }
      setTeamMap(tMap);

      // Build season summaries from standings
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
            champion: sorted.length > 0 ? sorted[0].FullName : null,
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
        playerData.forEach((p: any) => { if (p.PlayerID && p.PlayerName) pm.set(p.PlayerID, p.PlayerName); });
        setPlayerMap(pm);
      }
    });
  }, [id]);

  // Fetch results for expanded season
  useEffect(() => {
    if (expandedSeason == null || !id) {
      setSeasonResults([]);
      return;
    }
    const lid = parseInt(id);
    supabase
      .from("results")
      .select("MatchID, HomeTeamID, AwayTeamID, HomeTeamScore, AwayTeamScore, SnitchCaughtTime, WeekID")
      .eq("LeagueID", lid)
      .eq("SeasonID", expandedSeason)
      .order("WeekID", { ascending: true })
      .then(({ data }) => {
        setSeasonResults(data || []);
      });
  }, [expandedSeason, id]);

  // Awards grouped by season
  const awardsBySeason = new Map<number, Map<string, AwardEntry[]>>();
  awards.forEach(a => {
    if (!awardsBySeason.has(a.seasonid)) awardsBySeason.set(a.seasonid, new Map());
    const m = awardsBySeason.get(a.seasonid)!;
    if (!m.has(a.awardname)) m.set(a.awardname, []);
    m.get(a.awardname)!.push(a);
  });

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
        <div className="mb-6 border-b-2 border-primary pb-2">
          <p className="text-xs text-muted-foreground font-sans uppercase tracking-wide">
            <Link to={`/league/${league.LeagueID}`} className="hover:text-accent">{league.LeagueName}</Link> · {getLeagueTierLabel(league.LeagueTier)}
          </p>
          <h1 className="font-display text-3xl font-bold text-foreground">Season-by-Season History</h1>
        </div>

        {/* Season Register Table */}
        <div className="border border-border rounded overflow-hidden mb-6">
          <div className="bg-table-header px-3 py-2">
            <h3 className="font-display text-sm font-bold text-table-header-foreground">Season Register</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-sans">
              <thead>
                <tr className="bg-secondary">
                  <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Season</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Champion</th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Teams</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Awards</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((s, i) => {
                  const seasonAwards = awardsBySeason.get(s.seasonId);
                  const mvpAward = seasonAwards
                    ? [...seasonAwards.entries()].find(([name]) => name !== "Team of the Year")
                    : undefined;
                  const mvpWinner = mvpAward ? mvpAward[1].find(e => e.placement === 1) : undefined;

                  return (
                    <tr
                      key={s.seasonId}
                      className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20 cursor-pointer`}
                      onClick={() => setExpandedSeason(expandedSeason === s.seasonId ? null : s.seasonId)}
                    >
                      <td className="px-3 py-1.5 font-medium text-accent">{seasonLabel(s.seasonId)}</td>
                      <td className="px-3 py-1.5">
                        {s.champion ? (
                          <Link to={`/team/${encodeURIComponent(s.champion)}`} className="text-accent hover:underline" onClick={e => e.stopPropagation()}>
                            {s.champion}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">{s.teams.length}</td>
                      <td className="px-3 py-1.5 text-muted-foreground text-xs">
                        {mvpWinner ? (
                          <span>
                            {mvpAward![0]}:{" "}
                            <Link to={`/player/${mvpWinner.playerid}`} className="text-accent hover:underline" onClick={e => e.stopPropagation()}>
                              {playerMap.get(mvpWinner.playerid) || `#${mvpWinner.playerid}`}
                            </Link>
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expanded season detail */}
        {expandedSeason != null && (() => {
          const season = seasons.find(s => s.seasonId === expandedSeason);
          if (!season) return null;
          const seasonAwardsMap = awardsBySeason.get(expandedSeason);

          return (
            <div className="border border-border rounded overflow-hidden mb-6">
              <div className="bg-table-header px-3 py-2 flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-table-header-foreground">
                  {seasonLabel(expandedSeason)} Season Detail
                </h3>
                <button onClick={() => setExpandedSeason(null)} className="text-xs text-table-header-foreground/70 hover:text-table-header-foreground">✕ Close</button>
              </div>

              {/* Standings */}
              <div className="p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Final Standings</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-sans">
                    <thead>
                      <tr className="bg-secondary">
                        <th className="px-2 py-1 text-left text-xs font-semibold text-muted-foreground">#</th>
                        <th className="px-2 py-1 text-left text-xs font-semibold text-muted-foreground">Team</th>
                        <th className="px-2 py-1 text-right text-xs font-semibold text-muted-foreground">GP</th>
                        <th className="px-2 py-1 text-right text-xs font-semibold text-muted-foreground">Pts</th>
                        <th className="px-2 py-1 text-right text-xs font-semibold text-muted-foreground">GF</th>
                        <th className="px-2 py-1 text-right text-xs font-semibold text-muted-foreground">GA</th>
                        <th className="px-2 py-1 text-right text-xs font-semibold text-muted-foreground">GD</th>
                        <th className="px-2 py-1 text-right text-xs font-semibold text-muted-foreground">GSC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {season.teams.map((t, i) => (
                        <tr key={t.name} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                          <td className="px-2 py-1 font-mono text-muted-foreground">{i + 1}</td>
                          <td className="px-2 py-1">
                            <Link to={`/team/${encodeURIComponent(t.name)}`} className="text-accent hover:underline font-medium">{t.name}</Link>
                          </td>
                          <td className="px-2 py-1 text-right font-mono">{t.gp}</td>
                          <td className="px-2 py-1 text-right font-mono font-bold">{t.pts}</td>
                          <td className="px-2 py-1 text-right font-mono">{t.gf}</td>
                          <td className="px-2 py-1 text-right font-mono">{t.ga}</td>
                          <td className="px-2 py-1 text-right font-mono">{t.gf - t.ga}</td>
                          <td className="px-2 py-1 text-right font-mono">{t.gsc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Results */}
              {seasonResults.length > 0 && (
                <div className="p-3 border-t border-border">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Results ({seasonResults.length} matches)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
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

              {/* Awards */}
              {seasonAwardsMap && seasonAwardsMap.size > 0 && (
                <div className="p-3 border-t border-border">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Awards</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm font-sans">
                      <thead>
                        <tr className="bg-secondary">
                          <th className="px-2 py-1 text-left text-xs font-semibold text-muted-foreground">Award</th>
                          <th className="px-2 py-1 text-left text-xs font-semibold text-muted-foreground">1st</th>
                          <th className="px-2 py-1 text-left text-xs font-semibold text-muted-foreground">2nd</th>
                          <th className="px-2 py-1 text-left text-xs font-semibold text-muted-foreground">3rd</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...seasonAwardsMap.entries()].map(([awardName, entries], i) => {
                          const sorted = entries.sort((a, b) => a.placement - b.placement);
                          const first = sorted.find(e => e.placement === 1);
                          const second = sorted.find(e => e.placement === 2);
                          const third = sorted.find(e => e.placement === 3);
                          return (
                            <tr key={awardName} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                              <td className="px-2 py-1.5 font-medium text-foreground">{awardName}</td>
                              <td className="px-2 py-1.5 bg-highlight/20 font-semibold">
                                {first ? <Link to={`/player/${first.playerid}`} className="text-accent hover:underline">{playerMap.get(first.playerid) || `#${first.playerid}`}</Link> : "—"}
                              </td>
                              <td className="px-2 py-1.5 bg-secondary/60">
                                {second ? <Link to={`/player/${second.playerid}`} className="text-accent hover:underline">{playerMap.get(second.playerid) || `#${second.playerid}`}</Link> : "—"}
                              </td>
                              <td className="px-2 py-1.5 bg-muted/40">
                                {third ? <Link to={`/player/${third.playerid}`} className="text-accent hover:underline">{playerMap.get(third.playerid) || `#${third.playerid}`}</Link> : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </main>
      <SiteFooter />
    </div>
  );
}
