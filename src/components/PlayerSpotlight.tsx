import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getNationFlag } from "@/lib/helpers";

interface SpotlightPlayer {
  PlayerID: number;
  PlayerName: string;
  Position: string;
  TeamFullName: string;
  NationName?: string;
  NationFlag?: string;
}

export function PlayerSpotlight() {
  const [players, setPlayers] = useState<SpotlightPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Fetch directly from players table — always works, no view dependency
        const { data: playerData, error: playerError } = await supabase
          .from("players")
          .select("PlayerID, PlayerName, Position, NationalityID")
          .not("PlayerName", "is", null)
          .order("PlayerID", { ascending: true })
          .range(0, 999);

        if (playerError || !playerData?.length) {
          setLoading(false);
          return;
        }

        // Shuffle and pick 6 from across the full range
        const shuffled = [...playerData].sort(() => Math.random() - 0.5);
        const chosen = shuffled.slice(0, 6);

        // Get nation names
        const natIds = [...new Set(chosen.map(p => p.NationalityID).filter(Boolean))] as number[];
        const nationMap = new Map<number, string>();
        if (natIds.length > 0) {
          const { data: natData } = await supabase
            .from("nations")
            .select("NationID, Nation")
            .in("NationID", natIds);
          (natData || []).forEach((n: any) => {
            if (n.NationID && n.Nation) nationMap.set(n.NationID, n.Nation);
          });
        }

        // Get most recent team for each player from player_season_stats
        const pids = chosen.map(p => p.PlayerID).filter(Boolean) as number[];
        const teamMap = new Map<number, string>();
        if (pids.length > 0) {
          const { data: teamData } = await supabase
            .from("player_season_stats")
            .select("PlayerID, TeamFullName, SeasonID")
            .in("PlayerID", pids)
            .order("SeasonID", { ascending: false });
          // Take most recent team per player
          (teamData || []).forEach((r: any) => {
            if (r.PlayerID && r.TeamFullName && !teamMap.has(r.PlayerID)) {
              teamMap.set(r.PlayerID, r.TeamFullName);
            }
          });
        }

        const enriched: SpotlightPlayer[] = chosen.map(p => {
          const natName = p.NationalityID ? nationMap.get(p.NationalityID) : undefined;
          return {
            PlayerID: p.PlayerID,
            PlayerName: p.PlayerName || "",
            Position: p.Position || "",
            TeamFullName: teamMap.get(p.PlayerID) || "",
            NationName: natName,
            NationFlag: natName ? getNationFlag(natName) : undefined,
          };
        });

        setPlayers(enriched);
      } catch (err) {
        console.error("PlayerSpotlight error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="border border-border rounded overflow-hidden">
        <div className="bg-table-header px-3 py-2">
          <h3 className="font-display text-sm font-bold text-table-header-foreground">Player Spotlight</h3>
        </div>
        <div className="bg-card divide-y divide-border">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="px-3 py-2.5 flex items-center gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-secondary shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-secondary rounded w-3/4" />
                <div className="h-2.5 bg-secondary rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (players.length === 0) return null;

  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">Player Spotlight</h3>
        <Link to="/players" className="text-xs text-table-header-foreground/70 hover:text-table-header-foreground font-sans">
          All players →
        </Link>
      </div>
      <div className="bg-card divide-y divide-border">
        {players.map(p => (
          <Link
            key={p.PlayerID}
            to={`/player/${p.PlayerID}`}
            className="px-3 py-2.5 flex items-center gap-3 hover:bg-highlight/20 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0 text-sm font-medium text-muted-foreground">
              {(p.PlayerName || "?")[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium font-sans text-foreground truncate">{p.PlayerName}</p>
              <p className="text-xs text-muted-foreground font-sans truncate">
                {p.Position}
                {p.TeamFullName && <> · {p.TeamFullName}</>}
              </p>
            </div>
            {p.NationFlag && <span className="text-sm shrink-0">{p.NationFlag}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
