import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type StatCategory = "Goals" | "GoldenSnitchCatches" | "KeeperSaves" | "KeeperShotsFaced" | "BludgersHit" | "TurnoversForced" | "TeammatesProtected" | "GamesPlayed";

const statLabels: Record<StatCategory, { label: string; position: string | null; col: string }> = {
  Goals:               { label: "Goals",               position: "Chaser", col: "Goals" },
  GoldenSnitchCatches: { label: "Snitch Catches",       position: "Seeker", col: "GoldenSnitchCatches" },
  KeeperSaves:         { label: "Saves",                position: "Keeper", col: "KeeperSaves" },
  KeeperShotsFaced:    { label: "Shots Faced",          position: "Keeper", col: "KeeperShotsFaced" },
  BludgersHit:         { label: "Bludgers Hit",         position: "Beater", col: "BludgersHit" },
  TurnoversForced:     { label: "Turnovers Forced",     position: "Beater", col: "TurnoversForced" },
  TeammatesProtected:  { label: "Teammates Protected",  position: "Beater", col: "TeammatesProtected" },
  GamesPlayed:         { label: "Games Played",         position: null,     col: "GamesPlayed" },
};

interface LeaderRow {
  PlayerName: string;
  FullName: string;
  Position: string;
  value: number;
  pid: number | null;
}

interface LeagueOption {
  LeagueID: number;
  LeagueName: string;
}

const seasonLabel = (id: number) => `${id - 1}–${String(id).slice(-2)}`;

export function LeagueLeaders() {
  const [category, setCategory] = useState<StatCategory>("Goals");
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string>("all");
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
  const [loadingLeaders, setLoadingLeaders] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // Load metadata: latest season and leagues — small targeted queries
  useEffect(() => {
    (async () => {
      const [{ data: mdData }, { data: leagueData }] = await Promise.all([
        supabase.from("matchdays").select("SeasonID").order("SeasonID", { ascending: false }).limit(200),
        supabase.from("leagues").select("LeagueID, LeagueName").order("LeagueTier").order("LeagueName"),
      ]);
      if (leagueData) setLeagues(leagueData as LeagueOption[]);
      if (mdData) {
        const seasons = [...new Set(mdData.map((m: any) => m.SeasonID).filter(Boolean))].sort((a, b) => (b as number) - (a as number)) as number[];
        setAvailableSeasons(seasons);
        if (seasons.length > 0) setSelectedSeason(seasons[0]);
      }
      setLoadingMeta(false);

      // Pick random starting category
      const cats: StatCategory[] = ["Goals", "GoldenSnitchCatches", "KeeperSaves", "BludgersHit", "GamesPlayed"];
      setCategory(cats[Math.floor(Math.random() * cats.length)]);
    })();
  }, []);

  // Fetch top 10 for selected category/season/league — direct query, no pagination needed
  const fetchLeaders = useCallback(async () => {
    if (!selectedSeason) return;
    setLoadingLeaders(true);

    const info = statLabels[category];
    const col = info.col;

    // Build query: order by the stat column descending, limit 15 (to allow for position filtering)
    let q = supabase
      .from("player_season_stats")
      .select(`PlayerName,FullName,Position,${col},PlayerID`)
      .eq("SeasonID", selectedSeason)
      .gt(col, 0)
      .order(col, { ascending: false })
      .limit(50); // overfetch slightly to handle position + league filtering

    if (selectedLeague !== "all") {
      q = q.eq("LeagueName", selectedLeague);
    }
    if (info.position) {
      q = q.eq("Position", info.position);
    }

    const { data, error } = await q;
    if (error) {
      console.error("LeagueLeaders fetch error:", error);
      setLoadingLeaders(false);
      return;
    }

    const rows: LeaderRow[] = (data || [])
      .map((r: any) => ({
        PlayerName: r.PlayerName || "",
        FullName: r.FullName || "",
        Position: r.Position || "",
        value: r[col] || 0,
        pid: r.PlayerID || null,
      }))
      .filter(r => r.value > 0)
      .slice(0, 10);

    setLeaders(rows);
    setLoadingLeaders(false);
  }, [selectedSeason, selectedLeague, category]);

  useEffect(() => {
    fetchLeaders();
  }, [fetchLeaders]);

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">
          League Leaders — {statLabels[category].label} {selectedSeason ? `(${seasonLabel(selectedSeason)})` : ""}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(statLabels) as StatCategory[]).map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`text-xs px-2 py-0.5 rounded font-sans transition-colors ${category === cat ? "bg-accent text-accent-foreground" : "text-table-header-foreground/70 hover:text-table-header-foreground"}`}
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
            {loadingMeta || loadingLeaders ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                  <td className="px-3 py-2 w-8"><div className="h-3 w-4 bg-muted rounded animate-pulse" /></td>
                  <td className="px-3 py-2"><div className="h-3 w-32 bg-muted rounded animate-pulse" /></td>
                  <td className="px-3 py-2"><div className="h-3 w-24 bg-muted rounded animate-pulse" /></td>
                  <td className="px-3 py-2"><div className="h-3 w-12 bg-muted rounded animate-pulse" /></td>
                  <td className="px-3 py-2 text-right"><div className="h-3 w-8 bg-muted rounded animate-pulse ml-auto" /></td>
                </tr>
              ))
            ) : leaders.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground italic">No data available.</td></tr>
            ) : (
              leaders.map((row, i) => (
                <tr key={i} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20 transition-colors`}>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-1.5 font-medium text-accent hover:underline">
                    {row.pid ? <Link to={`/player/${row.pid}`}>{row.PlayerName}</Link> : row.PlayerName}
                  </td>
                  <td className="px-3 py-1.5 text-accent hover:underline">
                    <Link to={`/team/${encodeURIComponent(row.FullName)}`}>{row.FullName}</Link>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{row.Position}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-bold">{row.value}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
