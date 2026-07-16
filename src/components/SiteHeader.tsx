import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GlobalSearch } from "@/components/GlobalSearch";
import { useDarkMode } from "@/hooks/useDarkMode";
import { Moon, Sun, Menu, X } from "lucide-react";

interface League {
  LeagueID: number;
  LeagueName: string | null;
  LeagueTier: number | null;
}

export function SiteHeader() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { dark, toggle } = useDarkMode();
  const { pathname } = useLocation();

  useEffect(() => {
    supabase.from("leagues").select("*").order("LeagueTier").order("LeagueName").then(({ data }) => {
      if (data) setLeagues(data);
    });
  }, []);

  // Close mobile menu on navigation
  useEffect(() => { setMobileMenuOpen(false); }, [pathname]);

  const popularLeagues = leagues.filter((l) => l.LeagueTier === 1);
  const otherLeagues   = leagues.filter((l) => l.LeagueTier === 2);
  const cupComps       = leagues.filter((l) => l.LeagueTier === 0 && l.LeagueID < 20);
  const intlComps      = leagues.filter((l) => l.LeagueTier === 0 && l.LeagueID >= 20);

  const navLinks = [
    { to: "/players", label: "Players" },
    { to: "/teams", label: "Teams" },
    { to: "/managers", label: "Managers" },
    { to: "/schedule", label: "Schedule" },
    { to: "/leagues", label: "Leagues" },
    { to: "/leaders", label: "Leaders" },
    { to: "/nations", label: "Nations" },
    { to: "/compare", label: "Compare" },
    { to: "/elo",     label: "Elo" },
  ];

  return (
    <>
      <header className="sticky top-0 z-40">
        {/* Top bar */}
        <div className="bg-primary text-primary-foreground">
          <div className="container py-2.5 flex items-center justify-between gap-3">
            <Link to="/" className="flex items-center gap-2.5 shrink-0">
              <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center font-display font-bold text-accent-foreground text-base">
                QR
              </div>
              <div className="hidden sm:block">
                <h1 className="font-display text-lg font-bold leading-tight tracking-tight">QuidReference</h1>
                <p className="text-[10px] opacity-75 font-sans leading-none">Quidditch Statistics & Records</p>
              </div>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-3 text-sm font-sans flex-1 justify-end">
              {navLinks.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className={`opacity-80 hover:opacity-100 transition-opacity ${pathname.startsWith(to) ? "opacity-100 font-semibold" : ""}`}
                >
                  {label}
                </Link>
              ))}
              <GlobalSearch />
              <button
                onClick={toggle}
                aria-label="Toggle dark mode"
                className="ml-1 p-1.5 rounded hover:bg-primary-foreground/10 transition-colors opacity-80 hover:opacity-100"
              >
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>

            {/* Mobile: search + dark mode + hamburger */}
            <div className="flex md:hidden items-center gap-2">
              <GlobalSearch />
              <button
                onClick={toggle}
                aria-label="Toggle dark mode"
                className="p-1.5 rounded hover:bg-primary-foreground/10 transition-colors opacity-80"
              >
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button
                onClick={() => setMobileMenuOpen(o => !o)}
                aria-label="Toggle menu"
                className="p-1.5 rounded hover:bg-primary-foreground/10 transition-colors opacity-80"
              >
                {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-primary border-t border-primary-foreground/20 shadow-lg">
            <div className="container py-2 grid grid-cols-3 gap-1">
              {navLinks.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className={`text-sm font-sans text-primary-foreground py-2 px-2 rounded hover:bg-primary-foreground/10 transition-colors text-center ${pathname.startsWith(to) ? "font-semibold bg-primary-foreground/10" : "opacity-80"}`}
                >
                  {label}
                </Link>
              ))}
            </div>
            {/* League links in mobile menu */}
            <div className="border-t border-primary-foreground/20 px-3 py-2 space-y-1">
              {popularLeagues.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/50 mb-1">Division I</p>
                  <div className="grid grid-cols-2 gap-1">
                    {popularLeagues.map(l => (
                      <Link key={l.LeagueID} to={`/league/${l.LeagueID}`} className="text-xs font-sans text-primary-foreground/80 hover:text-primary-foreground py-1 px-2 rounded hover:bg-primary-foreground/10 truncate">
                        {l.LeagueName}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {cupComps.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/50 mb-1 mt-2">Cups</p>
                  <div className="grid grid-cols-2 gap-1">
                    {cupComps.map(l => (
                      <Link key={l.LeagueID} to={`/league/${l.LeagueID}`} className="text-xs font-sans text-primary-foreground/80 hover:text-primary-foreground py-1 px-2 rounded hover:bg-primary-foreground/10 truncate">
                        {l.LeagueName}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* League scroll bar — desktop only */}
        <div className="hidden md:block bg-navy-light border-b border-border">
          <div className="container">
            <nav className="flex items-center gap-0 overflow-x-auto scrollbar-hide">
              <span className="px-3 py-2 text-xs font-sans font-semibold text-primary-foreground/50 uppercase tracking-wider shrink-0">Division I</span>
              {popularLeagues.map((l) => (
                <Link key={l.LeagueID} to={`/league/${l.LeagueID}`}
                  className={`px-3 py-2 text-sm font-sans font-medium text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary/30 transition-colors whitespace-nowrap ${pathname === `/league/${l.LeagueID}` ? "text-primary-foreground bg-primary/20" : ""}`}>
                  {l.LeagueName}
                </Link>
              ))}
              <span className="px-3 py-2 text-xs font-sans font-semibold text-primary-foreground/50 uppercase tracking-wider shrink-0 border-l border-primary-foreground/20">Cups</span>
              {cupComps.map((l) => (
                <Link key={l.LeagueID} to={`/league/${l.LeagueID}`}
                  className={`px-3 py-2 text-sm font-sans font-medium text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary/30 transition-colors whitespace-nowrap ${pathname === `/league/${l.LeagueID}` ? "text-primary-foreground bg-primary/20" : ""}`}>
                  {l.LeagueName}
                </Link>
              ))}
              {intlComps.length > 0 && (
                <>
                  <span className="px-3 py-2 text-xs font-sans font-semibold text-primary-foreground/50 uppercase tracking-wider shrink-0 border-l border-primary-foreground/20">Intl</span>
                  {intlComps.map((l) => (
                    <Link key={l.LeagueID} to={`/league/${l.LeagueID}`}
                      className="px-3 py-2 text-sm font-sans font-medium text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary/30 transition-colors whitespace-nowrap">
                      {l.LeagueName}
                    </Link>
                  ))}
                </>
              )}
              {otherLeagues.length > 0 && (
                <>
                  <span className="px-3 py-2 text-xs font-sans font-semibold text-primary-foreground/50 uppercase tracking-wider shrink-0 border-l border-primary-foreground/20">Other</span>
                  {otherLeagues.map((l) => (
                    <Link key={l.LeagueID} to={`/league/${l.LeagueID}`}
                      className="px-3 py-2 text-sm font-sans font-medium text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary/30 transition-colors whitespace-nowrap">
                      {l.LeagueName}
                    </Link>
                  ))}
                </>
              )}
            </nav>
          </div>
        </div>
      </header>
    </>
  );
}
