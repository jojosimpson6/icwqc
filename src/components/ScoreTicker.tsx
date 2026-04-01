import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";

interface GameScore {
  MatchID: number;
  home_team: string;
  away_team: string;
  HomeTeamScore: number;
  AwayTeamScore: number;
  SnitchCaughtTime: number | null;
  LeagueID: number | null;
  leagueName: string;
}

export function ScoreTicker() {
  const [scores, setScores] = useState<GameScore[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchLatestScores() {
      // Get reference data
      const [{ data: teams }, { data: leagues }] = await Promise.all([
        supabase.from("teams").select("TeamID, FullName"),
        supabase.from("leagues").select("LeagueID, LeagueName"),
      ]);
      const teamMap: Record<number, string> = {};
      teams?.forEach(t => { teamMap[t.TeamID] = t.FullName; });
      const leagueMap: Record<number, string> = {};
      leagues?.forEach(l => { leagueMap[l.LeagueID] = l.LeagueName || ""; });

      // Get recent matchdays ordered by date descending
      const { data: matchdays } = await supabase
        .from("matchdays")
        .select("Matchday, MatchdayWeek, SeasonID, LeagueID")
        .order("Matchday", { ascending: false });

      if (!matchdays || matchdays.length === 0) return;

      // Group matchdays by date, then try each date until we find one with results
      const dateSet = [...new Set(matchdays.map(md => md.Matchday))];

      for (const date of dateSet) {
        const mdsForDate = matchdays.filter(md => md.Matchday === date);
        const allScores: GameScore[] = [];

        // Query results for all league/week/season combos on this date in parallel
        const resultPromises = mdsForDate.map(md =>
          supabase
            .from("results")
            .select("MatchID, HomeTeamID, AwayTeamID, HomeTeamScore, AwayTeamScore, SnitchCaughtTime, LeagueID")
            .eq("LeagueID", md.LeagueID!)
            .eq("WeekID", md.MatchdayWeek!)
            .eq("SeasonID", md.SeasonID!)
        );

        const resultSets = await Promise.all(resultPromises);

        for (const { data: results } of resultSets) {
          if (results) {
            results.forEach((r: any) => {
              allScores.push({
                MatchID: r.MatchID,
                home_team: teamMap[r.HomeTeamID] || "Unknown",
                away_team: teamMap[r.AwayTeamID] || "Unknown",
                HomeTeamScore: r.HomeTeamScore,
                AwayTeamScore: r.AwayTeamScore,
                SnitchCaughtTime: r.SnitchCaughtTime,
                LeagueID: r.LeagueID,
                leagueName: leagueMap[r.LeagueID] || "",
              });
            });
          }
        }

        if (allScores.length > 0) {
          setScores(allScores);
          return; // Found a date with results, stop
        }
        // Otherwise try the next earlier date
      }
    }

    fetchLatestScores();
  }, []);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || scores.length <= 3) return;

    let animationId: number;
    const scrollSpeed = 0.5;

    const scroll = () => {
      if (el.scrollLeft >= el.scrollWidth - el.clientWidth) {
        el.scrollLeft = 0;
      } else {
        el.scrollLeft += scrollSpeed;
      }
      animationId = requestAnimationFrame(scroll);
    };

    const pause = () => cancelAnimationFrame(animationId);
    const resume = () => { animationId = requestAnimationFrame(scroll); };

    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", resume);
    animationId = requestAnimationFrame(scroll);

    return () => {
      cancelAnimationFrame(animationId);
      el.removeEventListener("mouseenter", pause);
      el.removeEventListener("mouseleave", resume);
    };
  }, [scores]);

  if (scores.length === 0) return null;

  return (
    <div className="bg-secondary border-b border-border">
      <div className="container py-3">
        <div ref={scrollRef} className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
          <span className="text-xs font-sans font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
            Latest Scores
          </span>
          {scores.map((game) => (
            <Link
              key={game.MatchID}
              to={`/match/${game.MatchID}`}
              className="border border-border rounded bg-card hover:shadow-md transition-shadow min-w-[200px] shrink-0 block"
            >
              <div className="px-3 py-1 bg-secondary text-xs text-muted-foreground font-sans border-b border-border truncate">
                {game.leagueName} · Final{game.SnitchCaughtTime ? ` · ${game.SnitchCaughtTime} min` : ""}
              </div>
              <div className="px-3 py-2 space-y-1">
                <div className={`flex justify-between text-sm font-sans ${(game.AwayTeamScore) > (game.HomeTeamScore) ? "font-bold" : ""}`}>
                  <span className="truncate mr-2">{game.away_team}</span>
                  <span className="font-mono">{game.AwayTeamScore}</span>
                </div>
                <div className={`flex justify-between text-sm font-sans ${(game.HomeTeamScore) > (game.AwayTeamScore) ? "font-bold" : ""}`}>
                  <span className="truncate mr-2">{game.home_team}</span>
                  <span className="font-mono">{game.HomeTeamScore}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
