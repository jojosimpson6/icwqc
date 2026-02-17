import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSortableTable } from "@/hooks/useSortableTable";

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

  const { sorted, sortKey, sortDir, requestSort } = useSortableTable(leaders, category, "desc");

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none";
  const sortIndicator = (key: string) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

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
              <th className={`${thClass} text-left`}>#</th>
              <th className={`${thClass} text-left`} onClick={() => requestSort("PlayerName")}>Player{sortIndicator("PlayerName")}</th>
              <th className={`${thClass} text-left`} onClick={() => requestSort("FullName")}>Team{sortIndicator("FullName")}</th>
              <th className={`${thClass} text-left`} onClick={() => requestSort("Position")}>Pos{sortIndicator("Position")}</th>
              <th className={`${thClass} text-right`} onClick={() => requestSort(category)}>{statLabels[category]}{sortIndicator(category)}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
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
