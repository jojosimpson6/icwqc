import { Link } from "react-router-dom";

const leagues = [
  { name: "Major League", path: "/league/major" },
  { name: "Minor League", path: "/league/minor" },
  { name: "All-Star", path: "/allstar" },
];

const navLinks = [
  { name: "Players", path: "/players" },
  { name: "Teams", path: "/teams" },
  { name: "Standings", path: "/standings" },
  { name: "Leaders", path: "/leaders" },
  { name: "Scores", path: "/scores" },
  { name: "Schedule", path: "/schedule" },
];

export function SiteHeader() {
  return (
    <header>
      {/* Top bar */}
      <div className="bg-primary text-primary-foreground">
        <div className="container py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center font-display font-bold text-accent-foreground text-lg">
              SR
            </div>
            <div>
              <h1 className="font-display text-xl font-bold leading-tight tracking-tight">
                StatReference
              </h1>
              <p className="text-xs opacity-75 font-sans">Custom League Statistics</p>
            </div>
          </Link>
          <div className="hidden md:flex items-center gap-4 text-sm font-sans">
            {leagues.map((league) => (
              <Link
                key={league.name}
                to={league.path}
                className="opacity-80 hover:opacity-100 transition-opacity"
              >
                {league.name}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Nav bar */}
      <div className="bg-navy-light border-b border-border">
        <div className="container">
          <nav className="flex items-center gap-0 overflow-x-auto">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.path}
                className="px-4 py-2 text-sm font-sans font-medium text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary/30 transition-colors whitespace-nowrap"
              >
                {link.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
