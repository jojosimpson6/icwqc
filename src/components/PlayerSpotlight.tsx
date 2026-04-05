import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { formatHeight, getNationFlag } from "@/lib/helpers";

interface Player {
  PlayerID: number;
  PlayerName: string | null;
  Position: string | null;
  Height: number | null;
  NationalityID: number | null;
  DOB: string | null;
  headshot_url: string | null;
}

export function PlayerSpotlight() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [nations, setNations] = useState<Record<number, string>>({});
  const [playerTeams, setPlayerTeams] = useState<Record<string, string>>({});
  const [playerPositions, setPlayerPositions] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      supabase.from("players").select("*"),
      supabase.from("nations").select("*"),
      supabase.from("stats").select("PlayerName, FullName, SeasonID, Position, GamesPlayed").order("SeasonID", { ascending: false }),
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
      if (statsData) {
        const teamMap: Record<string, string> = {};
        // For multi-position players, determine primary position (most GP)
        const posGpMap: Record<string, Record<string, number>> = {};
        statsData.forEach((s) => {
          if (s.PlayerName && s.FullName && !teamMap[s.PlayerName]) {
            teamMap[s.PlayerName] = s.FullName;
          }
          if (s.PlayerName && s.Position) {
            if (!posGpMap[s.PlayerName]) posGpMap[s.PlayerName] = {};
            posGpMap[s.PlayerName][s.Position] = (posGpMap[s.PlayerName][s.Position] || 0) + (s.GamesPlayed || 0);
          }
        });
        setPlayerTeams(teamMap);

        // Determine primary position by most GP
        const primaryPosMap: Record<string, string> = {};
        Object.entries(posGpMap).forEach(([name, posMap]) => {
          let bestPos = "";
          let bestGP = 0;
          Object.entries(posMap).forEach(([pos, gp]) => {
            if (gp > bestGP) { bestGP = gp; bestPos = pos; }
          });
          primaryPosMap[name] = bestPos;
        });
        setPlayerPositions(primaryPosMap);
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
          const displayPos = p.PlayerName ? (playerPositions[p.PlayerName] || p.Position) : p.Position;
          return (
            <Link
              key={p.PlayerID}
              to={`/player/${p.PlayerID}`}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-highlight/20 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-mono shrink-0 overflow-hidden">
                {p.headshot_url ? (
                  <img src={p.headshot_url} alt={p.PlayerName || ""} className="w-full h-full object-cover" />
                ) : (
                  displayPos?.[0] || "?"
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-sans font-medium text-sm text-accent truncate">{p.PlayerName}</p>
                <p className="text-xs text-muted-foreground font-sans truncate">
                  {displayPos} · {formatHeight(p.Height)}
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
