import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { Search } from "lucide-react";

interface SearchResult {
  type: "player" | "team" | "league";
  id: number | string;
  name: string;
  subtitle: string;
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Cache data on mount
  const [players, setPlayers] = useState<{ PlayerID: number; PlayerName: string; seasons: string }[]>([]);
  const [teams, setTeams] = useState<{ TeamID: number; FullName: string }[]>([]);
  const [leagues, setLeagues] = useState<{ LeagueID: number; LeagueName: string }[]>([]);

  useEffect(() => {
    // Load all searchable entities
    Promise.all([
      fetchAllRows("players", { select: "PlayerID, PlayerName" }),
      fetchAllRows("stats", { select: "PlayerName, SeasonID" }),
      supabase.from("teams").select("TeamID, FullName").then(({ data }) => data || []),
      supabase.from("leagues").select("LeagueID, LeagueName").then(({ data }) => data || []),
    ]).then(([playerData, statsData, teamData, leagueData]) => {
      // Build player season ranges
      const seasonMap = new Map<string, { min: number; max: number }>();
      statsData.forEach((s: any) => {
        if (!s.PlayerName || !s.SeasonID) return;
        const existing = seasonMap.get(s.PlayerName);
        if (existing) {
          existing.min = Math.min(existing.min, s.SeasonID);
          existing.max = Math.max(existing.max, s.SeasonID);
        } else {
          seasonMap.set(s.PlayerName, { min: s.SeasonID, max: s.SeasonID });
        }
      });

      const formatSeason = (year: number) => `${year - 1}-${year}`;

      setPlayers(
        playerData.map((p: any) => {
          const range = seasonMap.get(p.PlayerName);
          const seasons = range
            ? range.min === range.max
              ? formatSeason(range.min)
              : `${formatSeason(range.min)} to ${formatSeason(range.max)}`
            : "";
          return { PlayerID: p.PlayerID, PlayerName: p.PlayerName || "", seasons };
        })
      );
      setTeams(teamData.map((t: any) => ({ TeamID: t.TeamID, FullName: t.FullName || "" })));
      setLeagues(leagueData.map((l: any) => ({ LeagueID: l.LeagueID, LeagueName: l.LeagueName || "" })));
    });
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const q = query.toLowerCase();
    const matched: SearchResult[] = [];

    players
      .filter((p) => p.PlayerName.toLowerCase().includes(q))
      .slice(0, 5)
      .forEach((p) =>
        matched.push({ type: "player", id: p.PlayerID, name: p.PlayerName, subtitle: p.seasons })
      );

    teams
      .filter((t) => t.FullName.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((t) =>
        matched.push({ type: "team", id: encodeURIComponent(t.FullName), name: t.FullName, subtitle: "Team" })
      );

    leagues
      .filter((l) => l.LeagueName.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((l) =>
        matched.push({ type: "league", id: l.LeagueID, name: l.LeagueName, subtitle: "League" })
      );

    setResults(matched);
    setSelectedIndex(-1);
  }, [query, players, teams, leagues]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navigateTo = (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    if (result.type === "player") navigate(`/player/${result.id}`);
    else if (result.type === "team") navigate(`/team/${result.id}`);
    else navigate(`/league/${result.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      navigateTo(results[selectedIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const typeLabel: Record<string, string> = { player: "Player", team: "Team", league: "League" };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center bg-primary-foreground/10 rounded px-2 py-1">
        <Search className="w-3.5 h-3.5 text-primary-foreground/60 mr-1.5" />
        <input
          type="text"
          placeholder="Search players, teams, leagues..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="bg-transparent text-primary-foreground placeholder:text-primary-foreground/40 text-sm w-48 focus:w-64 transition-all outline-none font-sans"
        />
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 right-0 w-80 bg-popover border border-border rounded shadow-lg z-50 overflow-hidden">
          {results.map((r, i) => (
            <button
              key={`${r.type}-${r.id}`}
              onClick={() => navigateTo(r)}
              className={`w-full text-left px-3 py-2 flex items-center gap-3 text-sm font-sans hover:bg-accent/10 transition-colors ${
                i === selectedIndex ? "bg-accent/10" : ""
              } ${i > 0 ? "border-t border-border" : ""}`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-secondary px-1.5 py-0.5 rounded shrink-0">
                {typeLabel[r.type]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{r.name}</p>
                {r.subtitle && (
                  <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
