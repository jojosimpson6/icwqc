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
  HomeTeamID: number;
  AwayTeamID: number;
  HomeScore: number | null;
  AwayScore: number | null;
  played: boolean;
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

/** Determine the current season the database is in (largest SeasonID with any matchday). */
async function fetchSeasons(): Promise<number[]> {
  const past = await supabase.from("matchdays").select('"SeasonID"').order("SeasonID", { ascending: false }).limit(5000);
  const future = await supabase.from("scheduled_matches").select('"SeasonID"').limit(5000);
  const s = new Set<number>();
  (past.data || []).forEach((r: any) => s.add(r.SeasonID));
  (future.data || []).forEach((r: any) => s.add(r.SeasonID));
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
      const [{ data: l }, { data: t }, s] = await Promise.all([
        supabase.from("leagues").select('"LeagueID","LeagueName","LeagueTier"').eq("ValidToDt", "9999-12-31").order("LeagueTier").order("LeagueName"),
        supabase.from("teams").select('"TeamID","FullName","ShortName"').eq("ValidToDt", "9999-12-31"),
        fetchSeasons(),
      ]);
      setLeagues((l || []) as League[]);
      setTeams((t || []) as Team[]);
      setSeasons(s);
      if (s.length) setSeason(s[0]); // default: most recent / current
    })();
  }, []);

  // Fetch games whenever season/league change
  useEffect(() => {
    if (!season) return;
    setLoading(true);
    setSelectedDay(null);
    (async () => {
      // 1. Past results joined to matchdays (RLS hides future automatically)
      let pastQ = supabase
        .from("results")
        .select('"MatchID","SeasonID","LeagueID","WeekID","HomeTeamID","AwayTeamID","HomeTeamScore","AwayTeamScore"')
        .eq("SeasonID", season);
      if (leagueId !== "all") pastQ = pastQ.eq("LeagueID", leagueId);

      // 2. Future scheduled (no scores)
      let futQ = supabase
        .from("scheduled_matches")
        .select('"MatchID","SeasonID","LeagueID","WeekID","HomeTeamID","AwayTeamID","Matchday"')
        .eq("SeasonID", season);
      if (leagueId !== "all") futQ = futQ.eq("LeagueID", leagueId);

      // 3. Matchday calendar for the season+league (RLS hides future dates, but past dates suffice to join past)
      let mdQ = supabase
        .from("matchdays")
        .select('"SeasonID","LeagueID","MatchdayWeek","Matchday"')
        .eq("SeasonID", season);
      if (leagueId !== "all") mdQ = mdQ.eq("LeagueID", leagueId);

      const [pastR, futR, mdR] = await Promise.all([pastQ, futQ, mdQ]);

      // Build week->date map
      const dateMap = new Map<string, string>(); // "L|W" -> YYYY-MM-DD
      (mdR.data || []).forEach((r: any) => dateMap.set(`${r.LeagueID}|${r.MatchdayWeek}`, r.Matchday));

      const list: Game[] = [];

      (pastR.data || []).forEach((r: any) => {
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

      (futR.data || []).forEach((r: any) => {
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
        });
      });

      setGames(list);
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
    games.forEach(g => { ids.add(g.HomeTeamID); ids.add(g.AwayTeamID); });
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

  function teamLabel(id: number, short = false): string {
    const t = teamMap.get(id);
    if (!t) return `Team#${id}`;
    return (short ? (t.ShortName || t.FullName) : (t.FullName || t.ShortName)) || `Team#${id}`;
  }

  const selectedTeam = teamId !== "all" ? teamMap.get(teamId as number) : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-6 pb-20 md:pb-6">
        <h1 className="font-display text-3xl font-bold mb-1">Schedule</h1>
        <p className="text-sm text-muted-foreground mb-5">
          Upcoming and past matches. Knockout-round matchups are hidden until the previous round has been decided.
        </p>

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

          <div className="ml-auto text-xs text-muted-foreground font-mono">
            {loading ? "Loading…" : `${filtered.length} matches`}
          </div>
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
                          <span className="text-[10px] bg-primary/10 text-primary px-1 rounded-sm">{dayGames.length}</span>
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

                      {/* Not team-filtered: show count + first league names */}
                      {!selectedTeam && hasGames && (
                        <div className="space-y-0.5 overflow-hidden">
                          {dayGames.slice(0, 3).map((g, i) => (
                            <div key={i} className="truncate text-[10px] text-muted-foreground">
                              {leagueMap.get(g.LeagueID)?.LeagueName?.split(" ").slice(0, 2).join(" ") || ""}
                            </div>
                          ))}
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
                const home = teamMap.get(g.HomeTeamID);
                const away = teamMap.get(g.AwayTeamID);
                return (
                  <div key={i} className="px-4 py-3 flex items-center gap-4 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-48 truncate">
                      {league ? <Link to={`/league/${league.LeagueID}`} className="hover:text-accent hover:underline">{league.LeagueName}</Link> : "—"}
                    </div>
                    <div className="flex-1 flex items-center gap-2 justify-end font-medium">
                      {home ? <Link to={`/team/${encodeURIComponent(home.FullName || "")}`} className="hover:text-accent hover:underline text-right">{home.FullName}</Link> : `#${g.HomeTeamID}`}
                    </div>
                    <div className="font-mono text-center min-w-[70px]">
                      {g.played && g.HomeScore != null ? (
                        g.MatchID ? (
                          <Link to={`/match/${g.MatchID}`} className="hover:text-accent hover:underline">
                            {g.HomeScore}–{g.AwayScore}
                          </Link>
                        ) : <span>{g.HomeScore}–{g.AwayScore}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">vs</span>
                      )}
                    </div>
                    <div className="flex-1 flex items-center gap-2 font-medium">
                      {away ? <Link to={`/team/${encodeURIComponent(away.FullName || "")}`} className="hover:text-accent hover:underline">{away.FullName}</Link> : `#${g.AwayTeamID}`}
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
