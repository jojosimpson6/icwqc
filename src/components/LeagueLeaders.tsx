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
  LeagueName: string | null;
}

interface LeagueOption {
  LeagueID: number;
  LeagueName: string;
}

export function LeagueLeaders() {
  const [allStats, setAllStats] = useState<StatRow[]>([]);
  const [category, setCategory] = useState<StatCategory>("Goals");
  const [playerMap, setPlayerMap] = useState<Record<string, number>>({});
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string>("all");

  useEffect(() => {
    const cats: StatCategory[] = ["Goals", "GoldenSnitchCatches", "KeeperSaves", "GamesPlayed"];
    const picked = cats[Math.floor(Math.random() * cats.length)];
    setCategory(picked);

    Promise.all([
      supabase.from("stats").select("*").not(picked, "is", null).order(picked, { ascending: false }).limit(500),
      supabase.from("players").select("PlayerID, PlayerName"),
      supabase.from("leagues").select("LeagueID, LeagueName").order("LeagueTier").order("LeagueName"),
    ]).then(([{ data: statsData }, { data: playersData }, { data: leagueData }]) => {
      if (statsData) setAllStats(statsData as StatRow[]);
      if (playersData) {
        const map: Record<string, number> = {};
        playersData.forEach((p) => { if (p.PlayerName) map[p.PlayerName] = p.PlayerID; });
        setPlayerMap(map);
      }
      if (leagueData) setLeagues(leagueData as LeagueOption[]);
    });
  }, []);

  const filtered = selectedLeague === "all"
    ? allStats.slice(0, 10)
    : allStats.filter(s => s.LeagueName === selectedLeague).slice(0, 10);

  const { sorted, sortKey, sortDir, requestSort } = useSortableTable(filtered, category, "desc");

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none";
  const sortIndicator = (key: string) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">
          League Leaders — {statLabels[category]}
        </h3>
        <select
          value={selectedLeague}
          onChange={(e) => setSelectedLeague(e.target.value)}
          className="text-xs bg-popover text-popover-foreground border border-border rounded px-2 py-1 font-sans"
        >
          <option value="all">All Leagues</option>
          {leagues.map((l) => (
            <option key={l.LeagueID} value={l.LeagueName}>{l.LeagueName}</option>
          ))}
        </select>
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
            {sorted.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground italic">No data available.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
