import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

interface Champion {
  leagueId: number;
  teamName: string;
  seasonId: number;
}

function seasonLabel(id: number): string {
  return `${id - 1}–${String(id).slice(-2)}`;
}

export default function LeaguesIndex() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [champions, setChampions] = useState<Map<number, Champion>>(new Map());

  useEffect(() => {
    supabase.from("leagues").select("*").order("LeagueTier").order("LeagueName").then(({ data }) => {
      if (data) setLeagues(data);
    });
    // Fetch most recent champion per league from standings (domestic only)
    fetchAllRows("standings", {
      select: "LeagueID, FullName, SeasonID, totalpoints",
      order: { column: "SeasonID", ascending: false },
    }).then(data => {
      const champMap = new Map<number, Champion>();
      // Group by league, find most recent season, then top team by points
      const byLeague = new Map<number, any[]>();
      (data as any[]).forEach(r => {
        if (!r.LeagueID || !r.SeasonID) return;
        if (!byLeague.has(r.LeagueID)) byLeague.set(r.LeagueID, []);
        byLeague.get(r.LeagueID)!.push(r);
      });
      byLeague.forEach((rows, lid) => {
        const maxSeason = Math.max(...rows.map((r: any) => r.SeasonID));
        const seasonRows = rows.filter((r: any) => r.SeasonID === maxSeason);
        const topTeam = seasonRows.sort((a: any, b: any) => (b.totalpoints || 0) - (a.totalpoints || 0))[0];
        if (topTeam?.FullName) {
          champMap.set(lid, { leagueId: lid, teamName: topTeam.FullName, seasonId: maxSeason });
        }
      });
      setChampions(champMap);
    });
  }, []);

  const grouped = {
    popular: leagues.filter(l => l.LeagueTier === 1),
    other: leagues.filter(l => l.LeagueTier === 2),
    cups: leagues.filter(l => l.LeagueTier === 0 && l.LeagueName !== "Quidditch World Cup" && l.LeagueName !== "Quidditch World Cup Qualification"),
    international: leagues.filter(l => l.LeagueTier === 0 && (l.LeagueName === "Quidditch World Cup" || l.LeagueName === "Quidditch World Cup Qualification")),
  };

  const renderSection = (title: string, items: League[], isCup = false) =>
    items.length > 0 && (
      <div className="border border-border rounded overflow-hidden">
        <div className="bg-table-header px-3 py-2">
          <h3 className="font-display text-sm font-bold text-table-header-foreground">{title}</h3>
        </div>
        <div className="bg-card divide-y divide-border">
          {items.map(l => {
            const champ = champions.get(l.LeagueID);
            return (
              <div key={l.LeagueID} className="px-3 py-2.5 hover:bg-highlight/20 transition-colors flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link to={`/league/${l.LeagueID}`} className="font-sans font-medium text-sm text-accent hover:underline block truncate">
                    {l.LeagueName}
                  </Link>
                  {champ && !isCup ? (
                    <p className="text-xs text-muted-foreground font-sans mt-0.5">
                      <span className="text-yellow-600 dark:text-yellow-400">🏆</span>{" "}
                      <Link to={`/team/${encodeURIComponent(champ.teamName)}`} className="hover:underline hover:text-accent">
                        {champ.teamName}
                      </Link>
                      <span className="opacity-60 ml-1">({seasonLabel(champ.seasonId)})</span>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground font-sans">{getLeagueTierLabel(l.LeagueTier)}</p>
                  )}
                </div>
                <Link
                  to={`/league/${l.LeagueID}/history`}
                  className="text-xs text-muted-foreground hover:text-accent font-sans shrink-0 border border-border rounded px-2 py-0.5 hover:border-accent transition-colors"
                >
                  History
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-2">
          <h1 className="font-display text-3xl font-bold text-foreground">Leagues & Competitions</h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">All leagues, cups, and international competitions</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {renderSection("Popular Leagues", grouped.popular)}
          {renderSection("Other Leagues", grouped.other)}
          {renderSection("Cup Competitions", grouped.cups, true)}
          {renderSection("International", grouped.international, true)}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
