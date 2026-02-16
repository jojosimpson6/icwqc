import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatHeight, calculateAge, getNationFlag } from "@/lib/helpers";

interface Player {
  PlayerID: number;
  PlayerName: string | null;
  Position: string | null;
  Height: number | null;
  NationalityID: number | null;
  DOB: string | null;
}

export function PlayerSpotlight() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [nations, setNations] = useState<Record<number, string>>({});

  useEffect(() => {
    // Get random players
    supabase.from("players").select("*").then(({ data }) => {
      if (data) {
        const shuffled = [...data].sort(() => Math.random() - 0.5).slice(0, 6);
        setPlayers(shuffled);
      }
    });
    supabase.from("nations").select("*").then(({ data }) => {
      if (data) {
        const map: Record<number, string> = {};
        data.forEach((n) => { if (n.NationID) map[n.NationID] = n.Nation || ""; });
        setNations(map);
      }
    });
  }, []);

  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">Player Spotlight</h3>
      </div>
      <div className="bg-card divide-y divide-border">
        {players.map((p) => (
          <Link
            key={p.PlayerID}
            to={`/player/${p.PlayerID}`}
            className="flex items-center gap-3 px-3 py-2.5 hover:bg-highlight/20 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-mono shrink-0">
              {p.Position?.[0] || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-sans font-medium text-sm text-accent truncate">{p.PlayerName}</p>
              <p className="text-xs text-muted-foreground font-sans">
                {p.Position} · {formatHeight(p.Height)}
                {p.DOB && ` · Age ${calculateAge(p.DOB)}`}
              </p>
            </div>
            <span className="text-lg shrink-0">{getNationFlag(nations[p.NationalityID || 0])}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
