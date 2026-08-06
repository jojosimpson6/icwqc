import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface League { LeagueID: number; LeagueName: string | null; LeagueTier: number | null; }
interface Team   { TeamID: number; FullName: string | null; Nickname: string | null; }
interface Game {
  MatchID: number | null;
  SeasonID: number;
  LeagueID: number;
  WeekID: number;
  Matchday: string;          // YYYY-MM-DD
  HomeTeamID: number | null;
  AwayTeamID: number | null;
  HomeScore: number | null;
  AwayScore: number | null;
  played: boolean;
  inProgress?: boolean;
}

function seasonLabel(id: number): string {
  return `${id - 1}–${String(id).slice(-2)}`;
}
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseLocal(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Deterministic color per league — golden-angle hue rotation for good separation
function leagueColor(id: number): string {
  const hue = Math.round((id * 137.508) % 360);
  return `hsl(${hue} 65% 42%)`;
}
function leagueBg(id: number): string {
  const hue = Math.round((id * 137.508) % 360);
  return `hsl(${hue} 65% 42% / 0.12)`;
}

/** Determine all seasons that have any matchday (past or future). */
async function fetchSeasons(): Promise<number[]> {
  const [past, future] = await Promise.all([
    fetchAllRows<{ SeasonID: number }>("matchdays", { select: '"SeasonID"' }),
    fetchAllRows<{ SeasonID: number }>("scheduled_matches", { select: '"SeasonID"' }).catch(() => []),
  ]);
  const s = new Set<number>();
  past.forEach(r => s.add(r.SeasonID));
  future.forEach(r => s.add(r.SeasonID));
  return [...s].sort((a, b) => b - a);
}

export default function SchedulePage() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const teamMap = useMemo(() => {
    const m = new Map<number, Team>();
    teams.forEach(t => m.set(t.TeamID, t));
    return m;
  }, [teams]);
  const leagueMap = useMemo(() => {
    const m = new Map<number, League>();
    leagues.forEach(l => m.set(l.LeagueID, l));
    return m;
  }, [leagues]);

  const [seasons, setSeasons] = useState<number[]>([]);
  const [season, setSeason] = useState<number | null>(null);
  const [leagueId, setLeagueId] = useState<number | "all">("all");
  const [teamId, setTeamId] = useState<number | "all">("all");

  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);

  // Calendar focus month
  const today = new Date();
  const [cursor, setCursor] = useState<{ y: number; m: number }>({ y: today.getFullYear(), m: today.getMonth() });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Initial bootstrap
  useEffect(() => {
    (async () => {
      const [l, tRows, s] = await Promise.all([
        fetchAllRows<League>("leagues", {
          select: '"LeagueID","LeagueName","LeagueTier"',
          filters: [{ method: "eq", args: ["ValidToDt", "9999-12-31"] }],
        }),
        fetchAllRows<Team & { ValidFromDt: string }>("teams", {
          select: '"TeamID","FullName","Nickname","ValidFromDt"',
        }),
        fetchSeasons(),
      ]);
      // Dedupe teams: latest ValidFromDt per TeamID
      const latest = new Map<number, Team>();
      const latestDt = new Map<number, string>();
      (tRows || []).forEach((r: any) => {
        const cur = latestDt.get(r.TeamID);
        if (!cur || (r.ValidFromDt || "") > cur) {
          latestDt.set(r.TeamID, r.ValidFromDt || "");
          latest.set(r.TeamID, { TeamID: r.TeamID, FullName: r.FullName, Nickname: r.Nickname });
        }
      });
      setLeagues((l || []) as League[]);
      setTeams([...latest.values()]);
      setSeasons(s);
      if (s.length) setSeason(s[0]);
    })();
  }, []);

  // Fetch games whenever season/league change
  useEffect(() => {
    if (!season) return;
    setLoading(true);
    setSelectedDay(null);
    (async () => {
      const leagueFilter = leagueId !== "all"
        ? [{ method: "eq" as const, args: ["LeagueID", leagueId] }]
        : [];

      const [pastRows, futRows, mdRows] = await Promise.all([
        fetchAllRows<any>("results", {
          select: '"MatchID","SeasonID","LeagueID","WeekID","HomeTeamID","AwayTeamID","HomeTeamScore","AwayTeamScore"',
          filters: [{ method: "eq", args: ["SeasonID", season] }, ...leagueFilter],
        }),
        fetchAllRows<any>("scheduled_matches", {
          select: '"MatchID","SeasonID","LeagueID","WeekID","HomeTeamID","AwayTeamID","Matchday","Status"',
          filters: [{ method: "eq", args: ["SeasonID", season] }, ...leagueFilter],
        }).catch(() => []),
        fetchAllRows<any>("matchdays", {
          select: '"SeasonID","LeagueID","MatchdayWeek","Matchday"',
          filters: [{ method: "eq", args: ["SeasonID", season] }, ...leagueFilter],
        }),
      ]);


      // Build week->date map
      const dateMap = new Map<string, string>(); // "L|W" -> YYYY-MM-DD
      (mdRows || []).forEach((r: any) => dateMap.set(`${r.LeagueID}|${r.MatchdayWeek}`, r.Matchday));

      const list: Game[] = [];

      (pastRows || []).forEach((r: any) => {
        const d = dateMap.get(`${r.LeagueID}|${r.WeekID}`);
        if (!d) return;
        list.push({
          MatchID: r.MatchID,
          SeasonID: r.SeasonID,
          LeagueID: r.LeagueID,
          WeekID: r.WeekID,
          Matchday: d,
          HomeTeamID: r.HomeTeamID,
          AwayTeamID: r.AwayTeamID,
          HomeScore: r.HomeTeamScore,
          AwayScore: r.AwayTeamScore,
          played: true,
        });
      });

      // Track MatchIDs already present in results so scheduled_matches doesn't duplicate them
      const playedIds = new Set<number>();
      (pastRows || []).forEach((r: any) => { if (r.MatchID != null) playedIds.add(r.MatchID); });

      (futRows || []).forEach((r: any) => {
        if (r.MatchID != null && playedIds.has(r.MatchID)) return;
        list.push({
          MatchID: r.MatchID,
          SeasonID: r.SeasonID,
          LeagueID: r.LeagueID,
          WeekID: r.WeekID,
          Matchday: r.Matchday,
          HomeTeamID: r.HomeTeamID,
          AwayTeamID: r.AwayTeamID,
          HomeScore: null,
          AwayScore: null,
          played: false,
          inProgress: r.Status === "in_progress",
        });
      });


      // Final safety dedup — by MatchID first, then by (date|home|away) for rows without MatchID
      const seenMatchId = new Set<number>();
      const seenSig = new Set<string>();
      const deduped: Game[] = [];
      for (const g of list) {
        if (g.MatchID != null) {
          if (seenMatchId.has(g.MatchID)) continue;
          seenMatchId.add(g.MatchID);
        } else {
          const sig = `${g.Matchday}|${g.LeagueID}|${g.HomeTeamID}|${g.AwayTeamID}`;
          if (seenSig.has(sig)) continue;
          seenSig.add(sig);
        }
        deduped.push(g);
      }

      setGames(deduped);
      setLoading(false);

      // jump to the month containing today, or earliest game if outside range
      if (list.length) {
        const dates = list.map(g => parseLocal(g.Matchday).getTime());
        const minT = Math.min(...dates);
        const maxT = Math.max(...dates);
        const nowT = today.getTime();
        if (nowT < minT) {
          const d = new Date(minT); setCursor({ y: d.getFullYear(), m: d.getMonth() });
        } else if (nowT > maxT) {
          const d = new Date(maxT); setCursor({ y: d.getFullYear(), m: d.getMonth() });
        }
      }
    })();
  }, [season, leagueId]);

  // Reset team if league changes
  useEffect(() => { setTeamId("all"); }, [leagueId]);

  // Teams available for the league filter
  const teamsForFilter = useMemo(() => {
    const ids = new Set<number>();
    games.forEach(g => { if (g.HomeTeamID != null) ids.add(g.HomeTeamID); if (g.AwayTeamID != null) ids.add(g.AwayTeamID); });
    return [...ids]
      .map(id => teamMap.get(id))
      .filter((t): t is Team => !!t)
      .sort((a, b) => (a.FullName || "").localeCompare(b.FullName || ""));
  }, [games, teamMap]);

  // Apply team filter
  const filtered = useMemo(() => {
    if (teamId === "all") return games;
    return games.filter(g => g.HomeTeamID === teamId || g.AwayTeamID === teamId);
  }, [games, teamId]);

  // Group by date
  const byDate = useMemo(() => {
    const m = new Map<string, Game[]>();
    filtered.forEach(g => {
      const arr = m.get(g.Matchday) || [];
      arr.push(g);
      m.set(g.Matchday, arr);
    });
    return m;
  }, [filtered]);

  // Build calendar grid: Sun-Sat, 6 weeks
  const calendarDays = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay()); // back to Sunday
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }, [cursor]);

  const todayStr = ymd(today);

  function shiftMonth(delta: number) {
    setCursor(c => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  function teamLabel(id: number | null, short = false): string {
    if (id == null) return "TBD";
    const t = teamMap.get(id);
    if (!t) return `Team#${id}`;
    return (short ? (t.Nickname || t.FullName) : (t.FullName || t.Nickname)) || `Team#${id}`;
  }

  const selectedTeam = teamId !== "all" ? teamMap.get(teamId as number) : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-6 pb-20 md:pb-6">
        <h1 className="font-display text-3xl font-bold mb-5">Schedule</h1>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-card border border-border rounded">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Season</label>
            <select
              value={season ?? ""}
              onChange={e => setSeason(Number(e.target.value))}
              className="bg-background border border-border rounded px-2 py-1 text-sm"
            >
              {seasons.map(s => (
                <option key={s} value={s}>{seasonLabel(s)}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">League</label>
            <select
              value={leagueId}
              onChange={e => setLeagueId(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="bg-background border border-border rounded px-2 py-1 text-sm"
            >
              <option value="all">All leagues</option>
              {leagues.map(l => (
                <option key={l.LeagueID} value={l.LeagueID}>{l.LeagueName}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team</label>
            <select
              value={teamId}
              onChange={e => setTeamId(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="bg-background border border-border rounded px-2 py-1 text-sm min-w-[180px]"
              disabled={!teamsForFilter.length}
            >
              <option value="all">All teams</option>
              {teamsForFilter.map(t => (
                <option key={t.TeamID} value={t.TeamID}>{t.FullName}</option>
              ))}
            </select>
          </div>

          {loading && <div className="ml-auto text-xs text-muted-foreground font-mono">Loading…</div>}
        </div>

        {/* Calendar header */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => shiftMonth(-1)} className="p-2 rounded hover:bg-muted transition-colors" aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <h2 className="font-display text-xl font-bold">
            {MONTH_NAMES[cursor.m]} {cursor.y}
          </h2>
          <button onClick={() => shiftMonth(1)} className="p-2 rounded hover:bg-muted transition-colors" aria-label="Next month">
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-1 mb-1">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
            <div key={d} className="text-center">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <TooltipProvider delayDuration={150}>
          <div className="grid grid-cols-7 gap-px bg-border border border-border rounded overflow-hidden">
            {calendarDays.map((d, idx) => {
              const ds = ymd(d);
              const inMonth = d.getMonth() === cursor.m;
              const isToday = ds === todayStr;
              const isSelected = ds === selectedDay;
              const dayGames = byDate.get(ds) || [];
              const hasGames = dayGames.length > 0;

              return (
                <Tooltip key={idx}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setSelectedDay(isSelected ? null : ds)}
                      className={`min-h-[90px] p-1.5 text-left text-xs flex flex-col transition-colors
                        ${inMonth ? "bg-card" : "bg-muted/30 text-muted-foreground"}
                        ${isSelected ? "ring-2 ring-accent z-10" : ""}
                        ${hasGames ? "hover:bg-accent/10 cursor-pointer" : "cursor-default"}
                      `}
                    >
                      <div className={`font-mono font-semibold mb-0.5 flex items-center justify-between ${isToday ? "text-accent" : ""}`}>
                        <span>{d.getDate()}</span>
                        {hasGames && (
                          <span className="text-[10px] bg-accent/10 text-accent px-1 rounded-sm">{dayGames.length}</span>
                        )}
                      </div>

                      {/* If team-filtered: show team's match inline */}
                      {selectedTeam && dayGames.slice(0, 2).map((g, i) => {
                        const isHome = g.HomeTeamID === selectedTeam.TeamID;
                        const opp = teamLabel(isHome ? g.AwayTeamID : g.HomeTeamID, true);
                        return (
                          <div key={i} className="leading-tight mb-0.5">
                            <div className="font-semibold truncate">{isHome ? "vs." : "@"} {opp}</div>
                            {g.played && g.HomeScore != null && (
                              <div className="font-mono text-[10px] text-muted-foreground">
                                {isHome ? `${g.HomeScore}–${g.AwayScore}` : `${g.AwayScore}–${g.HomeScore}`}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Not team-filtered: show colored league chips */}
                      {!selectedTeam && hasGames && (
                        <div className="space-y-0.5 overflow-hidden">
                          {dayGames.slice(0, 3).map((g, i) => {
                            const lg = leagueMap.get(g.LeagueID);
                            const home = teamLabel(g.HomeTeamID, true);
                            const away = teamLabel(g.AwayTeamID, true);
                            return (
                              <div
                                key={i}
                                className="truncate text-[10px] px-1 rounded-sm border-l-2"
                                style={{ borderLeftColor: leagueColor(g.LeagueID), backgroundColor: leagueBg(g.LeagueID), color: leagueColor(g.LeagueID) }}
                                title={lg?.LeagueName || ""}
                              >
                                {home} v {away}
                              </div>
                            );
                          })}
                          {dayGames.length > 3 && <div className="text-[10px] text-muted-foreground">+{dayGames.length - 3} more</div>}
                        </div>
                      )}
                    </button>
                  </TooltipTrigger>
                  {hasGames && !selectedTeam && (
                    <TooltipContent side="top" className="max-w-xs p-2">
                      <div className="font-semibold mb-1 text-xs">
                        {d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                      </div>
                      <div className="space-y-1 text-xs">
                        {dayGames.slice(0, 8).map((g, i) => (
                          <div key={i} className="flex items-center justify-between gap-3">
                            <span className="truncate">
                              {teamLabel(g.HomeTeamID, true)} vs {teamLabel(g.AwayTeamID, true)}
                            </span>
                            {g.played && g.HomeScore != null ? (
                              <span className="font-mono text-[10px]">{g.HomeScore}–{g.AwayScore}</span>
                            ) : g.inProgress ? (
                              <span className="text-[10px] text-accent">In progress</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">TBD</span>
                            )}
                          </div>
                        ))}
                        {dayGames.length > 8 && (
                          <div className="text-[10px] text-muted-foreground">+{dayGames.length - 8} more — click to see all</div>
                        )}
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>

        {/* Selected day list */}
        {selectedDay && (
          <div className="mt-6 bg-card border border-border rounded">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-display text-lg font-bold">
                {parseLocal(selectedDay).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </h3>
              <button onClick={() => setSelectedDay(null)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
            </div>
            <div className="divide-y divide-border">
              {(byDate.get(selectedDay) || []).map((g, i) => {
                const league = leagueMap.get(g.LeagueID);
                const home = g.HomeTeamID != null ? teamMap.get(g.HomeTeamID) : null;
                const away = g.AwayTeamID != null ? teamMap.get(g.AwayTeamID) : null;
                return (
                  <div
                    key={i}
                    className="px-4 py-3 flex items-center gap-4 text-sm border-l-4"
                    style={{ borderLeftColor: leagueColor(g.LeagueID) }}
                  >
                    <div
                      className="text-xs font-semibold uppercase tracking-wider w-48 truncate px-2 py-1 rounded"
                      style={{ backgroundColor: leagueBg(g.LeagueID), color: leagueColor(g.LeagueID) }}
                    >
                      {league ? <Link to={`/league/${league.LeagueID}`} className="hover:underline">{league.LeagueName}</Link> : "—"}
                    </div>
                    <div className="flex-1 flex items-center gap-2 justify-end font-medium">
                      {home ? <Link to={`/team/${encodeURIComponent(home.FullName || "")}`} className="hover:text-accent hover:underline text-right">{home.FullName}</Link> : (teamLabel(g.HomeTeamID))}
                    </div>
                    <div className="font-mono text-center min-w-[70px]">
                      {g.played && g.HomeScore != null ? (
                        g.MatchID ? (
                          <Link to={`/match/${g.MatchID}`} className="hover:text-accent hover:underline">
                            {g.HomeScore}–{g.AwayScore}
                          </Link>
                        ) : <span>{g.HomeScore}–{g.AwayScore}</span>
                      ) : g.inProgress ? (
                        <span className="text-[10px] font-sans uppercase tracking-wide text-accent whitespace-nowrap">In progress</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">vs</span>
                      )}
                    </div>
                    <div className="flex-1 flex items-center gap-2 font-medium">
                      {away ? <Link to={`/team/${encodeURIComponent(away.FullName || "")}`} className="hover:text-accent hover:underline">{away.FullName}</Link> : (teamLabel(g.AwayTeamID))}
                    </div>
                  </div>
                );
              })}
              {(byDate.get(selectedDay) || []).length === 0 && (
                <div className="px-4 py-6 text-sm text-muted-foreground text-center">No matches.</div>
              )}
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
