import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface League {
  LeagueID: number;
  LeagueName: string | null;
  LeagueTier: number | null;
}

export function SiteHeader() {
  const [leagues, setLeagues] = useState<League[]>([]);

  useEffect(() => {
    supabase.from("leagues").select("*").order("LeagueTier").order("LeagueName").then(({ data }) => {
      if (data) setLeagues(data);
    });
  }, []);

  const popularLeagues = leagues.filter((l) => l.LeagueTier === 1);
  const otherLeagues = leagues.filter((l) => l.LeagueTier === 2);
  const cupComps = leagues.filter((l) => l.LeagueTier === 0 && l.LeagueName !== "Quidditch World Cup" && l.LeagueName !== "Quidditch World Cup Qualification");
  const internationalComps = leagues.filter((l) => l.LeagueTier === 0 && (l.LeagueName === "Quidditch World Cup" || l.LeagueName === "Quidditch World Cup Qualification"));

  return (
    <header>
      <div className="bg-primary text-primary-foreground">
        <div className="container py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center font-display font-bold text-accent-foreground text-lg">
              QR
            </div>
            <div>
              <h1 className="font-display text-xl font-bold leading-tight tracking-tight">
                QuidReference
              </h1>
              <p className="text-xs opacity-75 font-sans">Quidditch Statistics & Records</p>
            </div>
          </Link>
          <div className="hidden md:flex items-center gap-4 text-sm font-sans">
            <Link to="/players" className="opacity-80 hover:opacity-100 transition-opacity">Players</Link>
            <Link to="/leagues" className="opacity-80 hover:opacity-100 transition-opacity">Leagues</Link>
          </div>
        </div>
      </div>

      <div className="bg-navy-light border-b border-border">
        <div className="container">
          <nav className="flex items-center gap-0 overflow-x-auto">
            <span className="px-3 py-2 text-xs font-sans font-semibold text-primary-foreground/50 uppercase tracking-wider shrink-0">Popular</span>
            {popularLeagues.map((l) => (
              <Link
                key={l.LeagueID}
                to={`/league/${l.LeagueID}`}
                className="px-3 py-2 text-sm font-sans font-medium text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary/30 transition-colors whitespace-nowrap"
              >
                {l.LeagueName}
              </Link>
            ))}
            <span className="px-3 py-2 text-xs font-sans font-semibold text-primary-foreground/50 uppercase tracking-wider shrink-0 border-l border-primary-foreground/20">Cups</span>
            {cupComps.map((l) => (
              <Link
                key={l.LeagueID}
                to={`/league/${l.LeagueID}`}
                className="px-3 py-2 text-sm font-sans font-medium text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary/30 transition-colors whitespace-nowrap"
              >
                {l.LeagueName}
              </Link>
            ))}
            {internationalComps.length > 0 && (
              <>
                <span className="px-3 py-2 text-xs font-sans font-semibold text-primary-foreground/50 uppercase tracking-wider shrink-0 border-l border-primary-foreground/20">Intl</span>
                {internationalComps.map((l) => (
                  <Link
                    key={l.LeagueID}
                    to={`/league/${l.LeagueID}`}
                    className="px-3 py-2 text-sm font-sans font-medium text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary/30 transition-colors whitespace-nowrap"
                  >
                    {l.LeagueName}
                  </Link>
                ))}
              </>
            )}
            {otherLeagues.length > 0 && (
              <>
                <span className="px-3 py-2 text-xs font-sans font-semibold text-primary-foreground/50 uppercase tracking-wider shrink-0 border-l border-primary-foreground/20">Other</span>
                {otherLeagues.map((l) => (
                  <Link
                    key={l.LeagueID}
                    to={`/league/${l.LeagueID}`}
                    className="px-3 py-2 text-sm font-sans font-medium text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary/30 transition-colors whitespace-nowrap"
                  >
                    {l.LeagueName}
                  </Link>
                ))}
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
