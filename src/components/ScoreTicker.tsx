import { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { useAuth } from "@/hooks/useAuth";
import { Star } from "lucide-react";
import { isMatchReleased } from "@/lib/helpers";

interface GameScore {
  MatchID: number;
  HomeTeamID: number | null;
  AwayTeamID: number | null;
  home_team: string;
  away_team: string;
  HomeTeamScore: number | null;
  AwayTeamScore: number | null;
  SnitchCaughtTime: number | null;
  LeagueID: number | null;
  leagueName: string;
  inProgress?: boolean;
}

export function ScoreTicker() {
  const [scores, setScores] = useState<GameScore[]>([]);
  const [pending, setPending] = useState<GameScore[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { favoriteTeamIds, profile } = useAuth();

  useEffect(() => {
    async function fetchLatestScores() {
      // Get reference data
      const [teams, { data: leagues }] = await Promise.all([
        fetchAllRows("teams", { select: "TeamID, FullName" }),
        supabase.from("leagues").select("LeagueID, LeagueName"),
      ]);
      const teamMap: Record<number, string> = {};
      (teams || []).forEach((t: any) => { teamMap[t.TeamID] = t.FullName; });
      const leagueMap: Record<number, string> = {};
      leagues?.forEach(l => { leagueMap[l.LeagueID] = l.LeagueName || ""; });

      // Matches that have been played but whose results are not released yet
      const { data: inProg } = await supabase
        .from("scheduled_matches")
        .select("MatchID, HomeTeamID, AwayTeamID, LeagueID, Matchday")
        .eq("Status", "in_progress")
        .order("Matchday", { ascending: false })
        .limit(12);

      // Popular leagues first (ascending LeagueID), matching the "latest scores" order below.
      const inProgSorted = [...(inProg || [])].sort((a: any, b: any) => (a.LeagueID ?? 0) - (b.LeagueID ?? 0));

      setPending(
        inProgSorted.map((r: any) => ({
          MatchID: r.MatchID,
          HomeTeamID: r.HomeTeamID,
          AwayTeamID: r.AwayTeamID,
          home_team: teamMap[r.HomeTeamID] || "TBD",
          away_team: teamMap[r.AwayTeamID] || "TBD",
          HomeTeamScore: null,
          AwayTeamScore: null,
          SnitchCaughtTime: null,
          LeagueID: r.LeagueID,
          leagueName: leagueMap[r.LeagueID] || "",
          inProgress: true,
        })),
      );

      // Get recent matchdays ordered by date descending. `matchdays` now
      // exposes the full pre-populated schedule (including fixtures years in
      // the future, for the Schedule page), so this must explicitly stop at
      // today or the "latest" matchday would just be a future scheduled date
      // with no released results, and the ticker would never find anything.
      const today = new Date().toISOString().split("T")[0];
      const matchdays = await fetchAllRows("matchdays", {
        select: "Matchday, MatchdayWeek, SeasonID, LeagueID",
        filters: [{ method: "lte", args: ["Matchday", today] }],
        order: { column: "Matchday", ascending: false },
      });

      if (matchdays.length === 0) return;

      const dateSet = [...new Set(matchdays.map(md => md.Matchday))];

      for (const date of dateSet) {
        const mdsForDate = matchdays.filter(md => md.Matchday === date);
        const allScores: GameScore[] = [];

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
              // Defense-in-depth: an admin-preview session bypasses the release-date
              // RLS policy on `results` by design, so re-check here too — the ticker
              // should never surface a score before it's actually released.
              if (!isMatchReleased(date, r.SnitchCaughtTime)) return;
              allScores.push({
                MatchID: r.MatchID,
                HomeTeamID: r.HomeTeamID,
                AwayTeamID: r.AwayTeamID,
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
          // Popular leagues first — ascending LeagueID (e.g. BIQL/NQA before EARL).
          allScores.sort((a, b) => (a.LeagueID ?? 0) - (b.LeagueID ?? 0));
          setScores(allScores);
          return;
        }
      }
    }

    fetchLatestScores();
  }, []);

  // Favorites first: primary team, then other favorites, then everything else
  const favSet = useMemo(() => new Set(favoriteTeamIds), [favoriteTeamIds]);
  const primaryId = profile?.favorite_team_id ?? null;

  const ordered = useMemo(() => {
    const rank = (g: GameScore) => {
      if (primaryId != null && (g.HomeTeamID === primaryId || g.AwayTeamID === primaryId)) return 0;
      if ((g.HomeTeamID != null && favSet.has(g.HomeTeamID)) || (g.AwayTeamID != null && favSet.has(g.AwayTeamID))) return 1;
      return 2;
    };
    return [...pending, ...scores]
      .map((g, i) => ({ g, i }))
      .sort((a, b) => rank(a.g) - rank(b.g) || a.i - b.i)
      .map(x => x.g);
  }, [scores, pending, favSet, primaryId]);

  const isFav = (g: GameScore) =>
    (g.HomeTeamID != null && (favSet.has(g.HomeTeamID) || g.HomeTeamID === primaryId)) ||
    (g.AwayTeamID != null && (favSet.has(g.AwayTeamID) || g.AwayTeamID === primaryId));

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || ordered.length <= 3) return;

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
  }, [ordered]);

  if (ordered.length === 0) return null;

  return (
    <div className="bg-secondary border-b border-border">
      <div className="container py-3">
        <div ref={scrollRef} className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
          <span className="text-xs font-sans font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
            Latest Scores
          </span>
          {ordered.map((game) => {
            const fav = isFav(game);
            const card = (
              <>
                <div className="px-3 py-1 bg-secondary text-xs text-muted-foreground font-sans border-b border-border truncate flex items-center gap-1">
                  {fav && <Star size={11} className="fill-current text-accent shrink-0" />}
                  <span className="truncate">
                    {game.leagueName} · {game.inProgress ? "In progress" : `Final${game.SnitchCaughtTime ? ` · ${game.SnitchCaughtTime} min` : ""}`}
                  </span>
                </div>
                <div className="px-3 py-2 space-y-1">
                  <div className={`flex justify-between text-sm font-sans ${!game.inProgress && (game.AwayTeamScore ?? 0) > (game.HomeTeamScore ?? 0) ? "font-bold" : ""}`}>
                    <span className="truncate mr-2">{game.away_team}</span>
                    <span className="font-mono">{game.inProgress ? "—" : game.AwayTeamScore}</span>
                  </div>
                  <div className={`flex justify-between text-sm font-sans ${!game.inProgress && (game.HomeTeamScore ?? 0) > (game.AwayTeamScore ?? 0) ? "font-bold" : ""}`}>
                    <span className="truncate mr-2">{game.home_team}</span>
                    <span className="font-mono">{game.inProgress ? "—" : game.HomeTeamScore}</span>
                  </div>
                </div>
              </>
            );

            const cls = `border rounded bg-card min-w-[200px] shrink-0 block ${fav ? "border-accent" : "border-border"} ${game.inProgress ? "opacity-90" : "hover:shadow-md transition-shadow"}`;

            return game.inProgress ? (
              <div key={`p-${game.MatchID}`} className={cls}>{card}</div>
            ) : (
              <Link key={game.MatchID} to={`/match/${game.MatchID}`} className={cls}>{card}</Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
