import { useState, useEffect, useRef } from "react";
import { fetchAllRows } from "@/lib/fetchAll";

export interface TeamOption {
  TeamID: number;
  FullName: string;
  City: string | null;
  Country: string | null;
  LeagueID: number;
  PrimaryColor: string | null;
  SecondaryColor: string | null;
  logo_url: string | null;
}

function loadAllTeams(): Promise<TeamOption[]> {
  return fetchAllRows<TeamOption>("teams", {
    select: "TeamID, FullName, City, Country, LeagueID, PrimaryColor, SecondaryColor, logo_url",
    order: { column: "FullName" },
  });
}

interface TeamSearchBoxProps {
  onSelect: (t: TeamOption) => void;
  placeholder?: string;
  initialQuery?: string;
}

export function TeamSearchBox({ onSelect, placeholder, initialQuery }: TeamSearchBoxProps) {
  const [query, setQuery] = useState(initialQuery || "");
  const [results, setResults] = useState<TeamOption[]>([]);
  const [allTeams, setAllTeams] = useState<TeamOption[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAllTeams().then(setAllTeams);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const q = query.toLowerCase();
    setResults(
      allTeams
        .filter(t => (t.FullName || "").toLowerCase().includes(q) || (t.City || "").toLowerCase().includes(q))
        .slice(0, 8)
    );
  }, [query, allTeams]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || "Search team name…"}
        className="w-full px-3 py-2 border border-border rounded bg-card text-sm font-sans focus:outline-none focus:ring-2 focus:ring-accent"
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded shadow-lg max-h-64 overflow-y-auto">
          {results.map(t => (
            <button
              key={t.TeamID}
              type="button"
              className="w-full text-left px-3 py-2 text-sm font-sans hover:bg-secondary transition-colors flex items-center justify-between"
              onClick={() => { onSelect(t); setQuery(t.FullName || ""); setOpen(false); }}
            >
              <span className="font-medium">{t.FullName}</span>
              <span className="text-xs text-muted-foreground">{t.City}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
