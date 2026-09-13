import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Search } from "lucide-react";

interface SearchResult {
  type: "player" | "team" | "league" | "manager";
  id: number | string;
  name: string;
  subtitle: string;
  isActive?: boolean;
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Debounced, server-side, on-demand search — the previous version eagerly
  // preloaded every player (8,700), every player-season-minutes row
  // (150,000+, just to compute a season range and "active" flag), every
  // team, and every manager on first render of every page (this component
  // lives in the header). That made the search bar unusable until that
  // whole payload finished loading. Searching live per keystroke instead
  // means each query only touches a handful of rows.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setSearching(false); return; }

    setSearching(true);
    const handle = setTimeout(async () => {
      const [playersRes, teamsRes, leaguesRes, managersRes] = await Promise.all([
        supabase.from("players").select('"PlayerID","PlayerName","Position"').ilike("PlayerName", `%${q}%`).limit(5),
        supabase.from("teams").select("TeamID, FullName").ilike("FullName", `%${q}%`).limit(4),
        supabase.from("leagues").select("LeagueID, LeagueName").ilike("LeagueName", `%${q}%`).limit(3),
        supabase.from("managers").select("ManagerID, FirstName, LastName")
          .or(`FirstName.ilike.%${q}%,LastName.ilike.%${q}%`).limit(3),
      ]);

      const playerRows = playersRes.data || [];
      const playerIds = playerRows.map((p: any) => p.PlayerID);

      // Season range + active flag only for the handful of matched players
      const [{ data: seasonRows }, { data: activeRows }] = playerIds.length > 0
        ? await Promise.all([
            supabase.from("player_numbers").select("PlayerID, SeasonID").in("PlayerID", playerIds),
            supabase.from("active_players").select("PlayerID").in("PlayerID", playerIds),
          ])
        : [{ data: [] }, { data: [] }];

      const seasonRangeMap = new Map<number, { min: number; max: number }>();
      (seasonRows || []).forEach((r: any) => {
        const existing = seasonRangeMap.get(r.PlayerID);
        if (existing) {
          existing.min = Math.min(existing.min, r.SeasonID);
          existing.max = Math.max(existing.max, r.SeasonID);
        } else {
          seasonRangeMap.set(r.PlayerID, { min: r.SeasonID, max: r.SeasonID });
        }
      });
      const activeSet = new Set((activeRows || []).map((r: any) => r.PlayerID));

      const matched: SearchResult[] = [];
      playerRows.forEach((p: any) => {
        const range = seasonRangeMap.get(p.PlayerID);
        const subtitle = range ? (range.min === range.max ? `${range.min - 1}–${String(range.min).slice(-2)}` : `${range.min - 1}–${range.max - 1}`) : (p.Position || "");
        matched.push({ type: "player", id: p.PlayerID, name: p.PlayerName, subtitle, isActive: activeSet.has(p.PlayerID) });
      });
      (teamsRes.data || []).forEach((t: any) => matched.push({ type: "team", id: encodeURIComponent(t.FullName), name: t.FullName, subtitle: "Team" }));
      (leaguesRes.data || []).forEach((l: any) => matched.push({ type: "league", id: l.LeagueID, name: l.LeagueName, subtitle: "League" }));
      (managersRes.data || []).forEach((m: any) => matched.push({ type: "manager", id: m.ManagerID, name: `${m.FirstName || ""} ${m.LastName || ""}`.trim(), subtitle: "Manager" }));

      setResults(matched);
      setSelectedIndex(-1);
      setSearching(false);
    }, 250);

    return () => clearTimeout(handle);
  }, [query]);

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
    else if (result.type === "manager") navigate(`/manager/${result.id}`);
    else navigate(`/league/${result.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault();
      navigateTo(results[selectedIndex]);
    } else if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      goToAdvancedSearch();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const goToAdvancedSearch = () => {
    setOpen(false);
    const q = query;
    setQuery("");
    navigate(`/search${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
  };

  const typeLabel: Record<string, string> = { player: "Player", team: "Team", league: "League", manager: "Manager" };

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

      {open && (searching || results.length > 0) && (
        <div className="absolute top-full mt-1 right-0 w-80 bg-popover border border-border rounded shadow-lg z-50 overflow-hidden">
          {searching && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground font-sans">Searching…</div>
          )}
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
                <p className={`text-foreground truncate ${r.isActive ? "font-bold" : "font-medium"}`}>{r.name}</p>
                {r.subtitle && (
                  <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                )}
              </div>
            </button>
          ))}
          {results.length > 0 && (
            <button
              onClick={goToAdvancedSearch}
              className="w-full text-left px-3 py-2 text-xs font-sans font-semibold text-accent hover:bg-accent/10 transition-colors border-t border-border"
            >
              Advanced search &amp; filters →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
