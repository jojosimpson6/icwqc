import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { formatHeight, getNationFlag } from "@/lib/helpers";

interface SpotlightPlayer {
  PlayerID: number;
  PlayerName: string;
  Position: string;
  FullName: string;
  GamesPlayed: number;
  NationName?: string;
  NationFlag?: string;
}

export function PlayerSpotlight() {
  const [players, setPlayers] = useState<SpotlightPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // 1. Get latest season — small query, no count needed
        const { data: mdData } = await supabase
          .from("matchdays")
          .select("SeasonID")
          .order("SeasonID", { ascending: false })
          .limit(1);
        const latestSeason = mdData?.[0]?.SeasonID || 1998;

        // 2. Fetch a page of players from the latest season — no count:exact on view
        //    Order by PlayerName so we get a stable, varied set; take first 200 rows
        const { data: statsData, error: statsError } = await supabase
          .from("player_season_stats")
          .select("PlayerID, PlayerName, TeamFullName, Position, GamesPlayed")
          .eq("SeasonID", latestSeason)
          .gt("GamesPlayed", 0)
          .order("PlayerID", { ascending: true })
          .range(0, 999);

        if (statsError || !statsData?.length) {
          setLoading(false);
          return;
        }

        // 3. Pick 6 random players spread across all fetched rows
        const shuffled = [...statsData].sort(() => Math.random() - 0.5);
        const chosen = shuffled.slice(0, 6);

        // 4. Enrich with nation info
        const playerIds = chosen.map((p: any) => p.PlayerID).filter(Boolean);
        const [playerRows, { data: nations }] = await Promise.all([
          fetchAllRows("players", {
            select: "PlayerID, NationalityID, headshot_url",
            filters: [{ method: "in", args: ["PlayerID", playerIds] }],
          }),
          supabase.from("nations").select("NationID, Nation").in("NationID",
            chosen.map(() => 0) // placeholder - will fix below
          ).then(() => ({ data: [] })), // skip - get from playerRows join
        ]);

        // Build nation map from separate nations fetch
        const natIds = (playerRows as any[]).map(p => p.NationalityID).filter(Boolean);
        let nationMap = new Map<number, string>();
        if (natIds.length > 0) {
          const { data: natData } = await supabase
            .from("nations")
            .select("NationID, Nation")
            .in("NationID", [...new Set(natIds)]);
          (natData || []).forEach((n: any) => { if (n.NationID) nationMap.set(n.NationID, n.Nation); });
        }

        const playerExtraMap = new Map<number, { natId: number | null; headshot: string | null }>();
        (playerRows as any[]).forEach((p: any) => {
          playerExtraMap.set(p.PlayerID, { natId: p.NationalityID, headshot: p.headshot_url });
        });

        const enriched: SpotlightPlayer[] = chosen.map((p: any) => {
          const extra = playerExtraMap.get(p.PlayerID);
          const natName = extra?.natId ? nationMap.get(extra.natId) : undefined;
          return {
            PlayerID: p.PlayerID,
            PlayerName: p.PlayerName,
            Position: p.Position,
            FullName: p.TeamFullName,
            GamesPlayed: p.GamesPlayed,
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
          {[...Array(5)].map((_, i) => (
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
        <Link to="/players" className="text-xs text-table-header-foreground/70 hover:text-table-header-foreground font-sans">All players →</Link>
      </div>
      <div className="bg-card divide-y divide-border">
        {players.map(p => (
          <Link key={p.PlayerID} to={`/player/${p.PlayerID}`}
            className="px-3 py-2.5 flex items-center gap-3 hover:bg-highlight/20 transition-colors block">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0 text-sm font-medium text-muted-foreground">
              {(p.PlayerName || "?")[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium font-sans text-foreground truncate">{p.PlayerName}</p>
              <p className="text-xs text-muted-foreground font-sans">
                {p.Position}
                {p.FullName && <> · <span className="truncate">{p.FullName}</span></>}
              </p>
            </div>
            {p.NationFlag && <span className="text-sm shrink-0">{p.NationFlag}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
