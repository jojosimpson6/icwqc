import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";

type StatCategory = "Goals" | "GoldenSnitchCatches" | "KeeperSaves" | "KeeperShotsFaced" | "GamesPlayed";

const statLabels: Record<StatCategory, { label: string; position: string | null }> = {
  Goals:                 { label: "Goals",              position: "Chaser" },
  GoldenSnitchCatches:   { label: "Snitch Catches",     position: "Seeker" },
  KeeperSaves:           { label: "Keeper Saves",       position: "Keeper" },
  KeeperShotsFaced:      { label: "Shots Faced",        position: "Keeper" },
  GamesPlayed:           { label: "Games Played",       position: null },
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
  SeasonID: number | null;
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
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);

  useEffect(() => {
    const cats: StatCategory[] = ["Goals", "GoldenSnitchCatches", "KeeperSaves", "GamesPlayed"];
    const picked = cats[Math.floor(Math.random() * cats.length)];
    setCategory(picked);

    Promise.all([
      fetchAllRows("players", { select: "PlayerID, PlayerName" }),
      supabase.from("leagues").select("LeagueID, LeagueName").order("LeagueTier").order("LeagueName"),
      fetchAllRows("matchdays", { select: "SeasonID" }),
    ]).then(([playersData, { data: leagueData }, mdData]) => {
      const map: Record<string, number> = {};
      (playersData || []).forEach((p: any) => { if (p.PlayerName) map[p.PlayerName] = p.PlayerID; });
      setPlayerMap(map);
      if (leagueData) setLeagues(leagueData as LeagueOption[]);
      // Get available seasons from matchdays (lightweight)
      const seasons = [...new Set((mdData || []).map((m: any) => m.SeasonID).filter(Boolean))].sort((a, b) => (b as number) - (a as number));
      setAvailableSeasons(seasons as number[]);
      if (seasons.length > 0) setSelectedSeason(seasons[0] as number);
    });
  }, []);

  // Fetch stats only for the selected season
  useEffect(() => {
    if (!selectedSeason) return;
    fetchAllRows("stats", {
      select: "*",
      filters: [{ method: "eq", args: ["SeasonID", selectedSeason] }],
    }).then((statsData) => {
      setAllStats(statsData as StatRow[]);
    });
  }, [selectedSeason]);

  // Filter by league within the already-season-filtered stats
  const leagueFilteredStats = selectedLeague === "all"
    ? allStats
    : allStats.filter(s => s.LeagueName === selectedLeague);

  const posFilter = statLabels[category].position;
  const leaders = leagueFilteredStats
    .filter(s => !posFilter || s.Position === posFilter)
    .filter(s => ((s[category] as number) || 0) > 0)
    .sort((a, b) => ((b[category] as number) || 0) - ((a[category] as number) || 0))
    .slice(0, 10);

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground";
  const seasonLabel = (id: number) => `${id - 1}–${String(id).slice(-2)}`;

  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">
          League Leaders — {statLabels[category].label} {selectedSeason ? `(${seasonLabel(selectedSeason)})` : ""}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {(Object.keys(statLabels) as StatCategory[]).map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`text-xs px-2 py-0.5 rounded font-sans ${category === cat ? "bg-accent text-accent-foreground" : "text-table-header-foreground/70 hover:text-table-header-foreground"}`}
              >
                {statLabels[cat].label}
              </button>
            ))}
          </div>
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
          {availableSeasons.length > 1 && (
            <select
              value={selectedSeason ?? ""}
              onChange={(e) => setSelectedSeason(parseInt(e.target.value))}
              className="text-xs bg-popover text-popover-foreground border border-border rounded px-2 py-1 font-sans"
            >
              {availableSeasons.map(s => (
                <option key={s} value={s}>{seasonLabel(s)}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-sans">
          <thead>
            <tr className="bg-secondary">
              <th className={`${thClass} text-left`}>#</th>
              <th className={`${thClass} text-left`}>Player</th>
              <th className={`${thClass} text-left`}>Team</th>
              <th className={`${thClass} text-left`}>Pos</th>
              <th className={`${thClass} text-right`}>{statLabels[category].label}</th>
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
            {leaders.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground italic">No data available.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
