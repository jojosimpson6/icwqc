import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatHeight, getNationFlag } from "@/lib/helpers";

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
  const [playerTeams, setPlayerTeams] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      supabase.from("players").select("*"),
      supabase.from("nations").select("*"),
      supabase.from("stats").select("PlayerName, FullName, SeasonID").order("SeasonID", { ascending: false }),
    ]).then(([{ data: playerData }, { data: nationData }, { data: statsData }]) => {
      if (playerData) {
        const shuffled = [...playerData].sort(() => Math.random() - 0.5).slice(0, 6);
        setPlayers(shuffled);
      }
      if (nationData) {
        const map: Record<number, string> = {};
        nationData.forEach((n) => { if (n.NationID) map[n.NationID] = n.Nation || ""; });
        setNations(map);
      }
      // Build player -> team map (most recent team per player)
      if (statsData) {
        const teamMap: Record<string, string> = {};
        statsData.forEach((s) => {
          if (s.PlayerName && s.FullName && !teamMap[s.PlayerName]) {
            teamMap[s.PlayerName] = s.FullName;
          }
        });
        setPlayerTeams(teamMap);
      }
    });
  }, []);

  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">Player Spotlight</h3>
      </div>
      <div className="bg-card divide-y divide-border">
        {players.map((p) => {
          const teamName = p.PlayerName ? playerTeams[p.PlayerName] : null;
          return (
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
                <p className="text-xs text-muted-foreground font-sans truncate">
                  {p.Position} · {formatHeight(p.Height)}
                  {teamName && ` · ${teamName}`}
                </p>
              </div>
              <span className="text-lg shrink-0">{getNationFlag(nations[p.NationalityID || 0])}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
