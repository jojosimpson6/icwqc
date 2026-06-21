import { useState, useEffect, useRef } from "react";
import { fetchAllRows } from "@/lib/fetchAll";

export interface PlayerOption {
  PlayerID: number;
  PlayerName: string | null;
  Position: string | null;
  DOB: string | null;
}

// fetchAllRows already memoizes/caches identical queries, so we can just call it
// from every instance of this component without worrying about duplicate requests.
function loadAllPlayers(): Promise<PlayerOption[]> {
  return fetchAllRows<PlayerOption>("players", {
    select: "PlayerID, PlayerName, Position, DOB",
    order: { column: "PlayerName" },
  });
}

interface PlayerSearchBoxProps {
  onSelect: (p: PlayerOption) => void;
  placeholder?: string;
  initialQuery?: string;
}

export function PlayerSearchBox({ onSelect, placeholder, initialQuery }: PlayerSearchBoxProps) {
  const [query, setQuery] = useState(initialQuery || "");
  const [results, setResults] = useState<PlayerOption[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerOption[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAllPlayers().then(setAllPlayers);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const q = query.toLowerCase();
    setResults(
      allPlayers
        .filter(p => (p.PlayerName || "").toLowerCase().includes(q))
        .slice(0, 8)
    );
  }, [query, allPlayers]);

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
        placeholder={placeholder || "Search player name…"}
        className="w-full px-3 py-2 border border-border rounded bg-card text-sm font-sans focus:outline-none focus:ring-2 focus:ring-accent"
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded shadow-lg max-h-64 overflow-y-auto">
          {results.map(p => (
            <button
              key={p.PlayerID}
              type="button"
              className="w-full text-left px-3 py-2 text-sm font-sans hover:bg-secondary transition-colors flex items-center justify-between"
              onClick={() => { onSelect(p); setQuery(p.PlayerName || ""); setOpen(false); }}
            >
              <span className="font-medium">{p.PlayerName}</span>
              <span className="text-xs text-muted-foreground">{p.Position}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
