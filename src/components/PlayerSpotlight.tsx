import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
      // 1. Get latest season
      const { data: mdData } = await supabase
        .from("matchdays")
        .select("SeasonID")
        .order("SeasonID", { ascending: false })
        .limit(1);
      const latestSeason = mdData?.[0]?.SeasonID || 1998;

      // 2. Get total count of active players this season
      const { count } = await supabase
        .from("player_season_stats")
        .select("*", { count: "exact", head: true })
        .eq("SeasonID", latestSeason);

      if (!count || count === 0) return;

      // 3. Pick 6 random offsets, fetch one row each in parallel
      const usedOffsets = new Set<number>();
      while (usedOffsets.size < Math.min(6, count)) {
        usedOffsets.add(Math.floor(Math.random() * count));
      }

      const rowFetches = [...usedOffsets].map(offset =>
        supabase
          .from("player_season_stats")
          .select("PlayerID,PlayerName,FullName,Position,GamesPlayed")
          .eq("SeasonID", latestSeason)
          .order("PlayerName", { ascending: true })
          .range(offset, offset)
      );

      const results = await Promise.all(rowFetches);
      const chosen = results
        .map(r => r.data?.[0])
        .filter(Boolean)
        .filter((p, idx, arr) => arr.findIndex(x => x.PlayerID === p.PlayerID) === idx); // dedupe

      if (chosen.length === 0) return;

      const pids = chosen.map((p: any) => p.PlayerID).filter(Boolean);

      // 4. Fetch player bios for the chosen IDs
      const [{ data: pData }, { data: nData }] = await Promise.all([
        supabase
          .from("players")
          .select("PlayerID, PlayerName, Height, NationalityID, headshot_url")
          .in("PlayerID", pids),
        supabase
          .from("nations")
          .select("NationID, Nation, ValidToDt")
          .order("ValidToDt", { ascending: false }),
      ]);

      const nationMap = new Map<number, string>();
      (nData || []).forEach((n: any) => {
        if (n.NationID && !nationMap.has(n.NationID)) nationMap.set(n.NationID, n.Nation || "");
      });

      const teamMap = new Map<number, { team: string; pos: string }>();
      chosen.forEach((c: any) => teamMap.set(c.PlayerID, { team: c.FullName || "", pos: c.Position || "" }));

      const result: SpotlightPlayer[] = (pData || []).map((p: any) => {
        const meta = teamMap.get(p.PlayerID) || { team: "", pos: "" };
        return {
          PlayerID: p.PlayerID,
          PlayerName: p.PlayerName || "",
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
          [...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
              <div className="w-10 h-10 rounded-full bg-muted shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-28 bg-muted rounded" />
                <div className="h-2 w-40 bg-muted rounded" />
              </div>
            </div>
          ))
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
