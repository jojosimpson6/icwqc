import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getLeagueTierLabel } from "@/lib/helpers";

interface League {
  LeagueID: number;
  LeagueName: string | null;
  LeagueTier: number | null;
}

export default function LeaguesIndex() {
  const [leagues, setLeagues] = useState<League[]>([]);

  useEffect(() => {
    supabase.from("leagues").select("*").order("LeagueTier").order("LeagueName").then(({ data }) => {
      if (data) setLeagues(data);
    });
  }, []);

  const grouped = {
    international: leagues.filter((l) => l.LeagueTier === 0 && (l.LeagueName === "Quidditch World Cup" || l.LeagueName === "Quidditch World Cup Qualification")),
    cups: leagues.filter((l) => l.LeagueTier === 0 && l.LeagueName !== "Quidditch World Cup" && l.LeagueName !== "Quidditch World Cup Qualification"),
    popular: leagues.filter((l) => l.LeagueTier === 1),
    other: leagues.filter((l) => l.LeagueTier === 2),
  };

  const renderSection = (title: string, items: League[]) => (
    items.length > 0 && (
      <div className="border border-border rounded overflow-hidden">
        <div className="bg-table-header px-3 py-2">
          <h3 className="font-display text-sm font-bold text-table-header-foreground">{title}</h3>
        </div>
        <div className="bg-card divide-y divide-border">
          {items.map((l) => (
            <Link key={l.LeagueID} to={`/league/${l.LeagueID}`} className="block px-3 py-2.5 hover:bg-highlight/20 transition-colors">
              <p className="font-sans font-medium text-sm text-accent">{l.LeagueName}</p>
              <p className="text-xs text-muted-foreground font-sans">{getLeagueTierLabel(l.LeagueTier)}</p>
            </Link>
          ))}
        </div>
      </div>
    )
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-2">
          <h1 className="font-display text-3xl font-bold text-foreground">Leagues & Competitions</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {renderSection("Popular Leagues", grouped.popular)}
          {renderSection("Other Leagues", grouped.other)}
          {renderSection("Cup Competitions", grouped.cups)}
          {renderSection("International", grouped.international)}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
