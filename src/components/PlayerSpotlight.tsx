import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { formatHeight, getNationFlag } from "@/lib/helpers";

interface SpotlightPlayer {
  PlayerID: number;
  PlayerName: string;
  Position: string;
  Height: number | null;
  NationalityID: number | null;
  headshot_url: string | null;
  teamName: string;
  nationName: string;
}

export function PlayerSpotlight() {
  const [players, setPlayers] = useState<SpotlightPlayer[]>([]);

  useEffect(() => {
    (async () => {
      // 1. Get latest season ID
      const { data: mdData } = await supabase
        .from("matchdays")
        .select("SeasonID")
        .order("SeasonID", { ascending: false })
        .limit(1);
      const latestSeason = mdData?.[0]?.SeasonID || 1998;

      // 2. Fetch ALL players active in latest season (paginated)
      const statsData = await fetchAllRows("stats", {
        select: "PlayerName, FullName, Position, GamesPlayed",
        filters: [{ method: "eq", args: ["SeasonID", latestSeason] }],
      });

      if (!statsData || statsData.length === 0) return;

      // Deduplicate — keep best GP per player
      const metaMap = new Map<string, { team: string; pos: string; gp: number }>();
      statsData.forEach((s: any) => {
        if (!s.PlayerName) return;
        const existing = metaMap.get(s.PlayerName);
        const gp = s.GamesPlayed || 0;
        if (!existing || gp > existing.gp) {
          metaMap.set(s.PlayerName, { team: s.FullName || "", pos: s.Position || "", gp });
        }
      });

      // True random: use Fisher-Yates on indices
      const names = [...metaMap.keys()];
      for (let i = names.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [names[i], names[j]] = [names[j], names[i]];
      }
      const chosen = names.slice(0, 6);
      if (chosen.length === 0) return;

      // 3. Fetch player details for the 6 chosen
      const { data: pData } = await supabase
        .from("players")
        .select("PlayerID, PlayerName, Height, NationalityID, headshot_url")
        .in("PlayerName", chosen);
      if (!pData) return;

      // 4. Fetch nation names
      const natIds = [...new Set(pData.map((p: any) => p.NationalityID).filter(Boolean))];
      const nationMap = new Map<number, string>();
      if (natIds.length > 0) {
        const { data: nData } = await supabase
          .from("nations")
          .select("NationID, Nation, ValidToDt")
          .in("NationID", natIds)
          .order("ValidToDt", { ascending: false });
        (nData || []).forEach((n: any) => {
          if (n.NationID && !nationMap.has(n.NationID)) nationMap.set(n.NationID, n.Nation || "");
        });
      }

      const result: SpotlightPlayer[] = pData.map((p: any) => {
        const meta = metaMap.get(p.PlayerName) || { team: "", pos: "", gp: 0 };
        return {
          PlayerID: p.PlayerID,
          PlayerName: p.PlayerName,
          Position: meta.pos,
          Height: p.Height,
          NationalityID: p.NationalityID,
          headshot_url: p.headshot_url,
          teamName: meta.team,
          nationName: p.NationalityID ? (nationMap.get(p.NationalityID) || "") : "",
        };
      });

      setPlayers(result);
    })();
  }, []);

  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">Player Spotlight</h3>
      </div>
      <div className="bg-card divide-y divide-border">
        {players.length === 0 && (
          <p className="px-3 py-4 text-xs text-muted-foreground italic">Loading...</p>
        )}
        {players.map((p) => (
          <Link
            key={p.PlayerID}
            to={`/player/${p.PlayerID}`}
            className="flex items-center gap-3 px-3 py-2.5 hover:bg-highlight/20 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-mono shrink-0 overflow-hidden">
              {p.headshot_url ? (
                <img src={p.headshot_url} alt={p.PlayerName} className="w-full h-full object-cover" />
              ) : (
                p.Position?.[0] || "?"
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-sans font-medium text-sm text-accent truncate">{p.PlayerName}</p>
              <p className="text-xs text-muted-foreground font-sans truncate">
                {p.Position} · {formatHeight(p.Height)}
                {p.teamName && ` · ${p.teamName}`}
              </p>
            </div>
            <span className="text-lg shrink-0">{getNationFlag(p.nationName)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
