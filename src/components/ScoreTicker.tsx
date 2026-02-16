import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface GameScore {
  MatchID: number;
  home_team: string;
  away_team: string;
  HomeTeamScore: number;
  AwayTeamScore: number;
  SnitchCaughtTime: number | null;
  LeagueID: number | null;
}

export function ScoreTicker() {
  const [scores, setScores] = useState<GameScore[]>([]);

  useEffect(() => {
    // Get the most recent matchday's scores for BIQL
    supabase
      .from("results")
      .select(`
        "MatchID",
        "HomeTeamScore",
        "AwayTeamScore",
        "SnitchCaughtTime",
        "LeagueID",
        "HomeTeamID",
        "AwayTeamID"
      `)
      .eq("LeagueID", 1)
      .eq("WeekID", 39)
      .then(async ({ data }) => {
        if (!data) return;
        // Get team names
        const { data: teams } = await supabase.from("teams").select("*");
        const teamMap: Record<number, string> = {};
        teams?.forEach((t) => { teamMap[t.TeamID] = t.FullName; });
        
        const mapped = data.map((r: any) => ({
          MatchID: r.MatchID,
          home_team: teamMap[r.HomeTeamID] || "Unknown",
          away_team: teamMap[r.AwayTeamID] || "Unknown",
          HomeTeamScore: r.HomeTeamScore,
          AwayTeamScore: r.AwayTeamScore,
          SnitchCaughtTime: r.SnitchCaughtTime,
          LeagueID: r.LeagueID,
        }));
        setScores(mapped);
      });
  }, []);

  if (scores.length === 0) return null;

  return (
    <div className="bg-secondary border-b border-border">
      <div className="container py-3">
        <div className="flex items-center gap-3 overflow-x-auto pb-1">
          <span className="text-xs font-sans font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
            Latest Scores
          </span>
          {scores.map((game) => (
            <div
              key={game.MatchID}
              className="border border-border rounded bg-card hover:shadow-md transition-shadow min-w-[200px] shrink-0"
            >
              <div className="px-3 py-1 bg-secondary text-xs text-muted-foreground font-sans border-b border-border">
                Final · {game.SnitchCaughtTime ? `${game.SnitchCaughtTime} min` : ""}
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
