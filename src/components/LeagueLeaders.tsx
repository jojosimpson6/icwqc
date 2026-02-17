import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type StatCategory = "Goals" | "GoldenSnitchCatches" | "KeeperSaves" | "GamesPlayed";

const statLabels: Record<StatCategory, string> = {
  Goals: "Goals",
  GoldenSnitchCatches: "Golden Snitch Catches",
  KeeperSaves: "Keeper Saves",
  GamesPlayed: "Games Played",
};

interface StatRow {
  PlayerName: string | null;
  FullName: string | null;
  Goals: number | null;
  GoldenSnitchCatches: number | null;
  KeeperSaves: number | null;
  GamesPlayed: number | null;
  Position: string | null;
}

export function LeagueLeaders() {
  const [leaders, setLeaders] = useState<StatRow[]>([]);
  const [category, setCategory] = useState<StatCategory>("Goals");
  const [playerMap, setPlayerMap] = useState<Record<string, number>>({});

  useEffect(() => {
    const cats: StatCategory[] = ["Goals", "GoldenSnitchCatches", "KeeperSaves", "GamesPlayed"];
    const picked = cats[Math.floor(Math.random() * cats.length)];
    setCategory(picked);

    Promise.all([
      supabase.from("stats").select("*").not(picked, "is", null).order(picked, { ascending: false }).limit(10),
      supabase.from("players").select("PlayerID, PlayerName"),
    ]).then(([{ data: statsData }, { data: playersData }]) => {
      if (statsData) setLeaders(statsData as StatRow[]);
      if (playersData) {
        const map: Record<string, number> = {};
        playersData.forEach((p) => { if (p.PlayerName) map[p.PlayerName] = p.PlayerID; });
        setPlayerMap(map);
      }
    });
  }, []);

  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">
          League Leaders — {statLabels[category]}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-sans">
          <thead>
            <tr className="bg-secondary">
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">#</th>
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Player</th>
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team</th>
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pos</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{statLabels[category]}</th>
            </tr>
          </thead>
          <tbody>
            {leaders.map((row, i) => {
              const pid = row.PlayerName ? playerMap[row.PlayerName] : null;
              return (
                <tr
                  key={i}
                  className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20 transition-colors`}
                >
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-1.5 font-medium text-accent hover:underline">
                    {pid ? <Link to={`/player/${pid}`}>{row.PlayerName}</Link> : row.PlayerName}
                  </td>
                  <td className="px-3 py-1.5 text-accent hover:underline">
                    <Link to={`/team/${encodeURIComponent(row.FullName || "")}`}>{row.FullName}</Link>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{row.Position}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-bold">{row[category] ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
