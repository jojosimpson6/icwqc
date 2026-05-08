import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { useSortableTable } from "@/hooks/useSortableTable";

interface StandingRow {
  FullName: string | null;
  totalpoints: number | null;
  totalgamesplayed: number | null;
  GoalsFor: number | null;
  GoalsAgainst: number | null;
  totalgsc: number | null;
  SeasonID: number | null;
  LeagueID: number | null;
}

interface LeagueOption {
  LeagueID: number;
  LeagueName: string;
  LeagueTier: number | null;
}

const seasonLabel = (id: number) => `${id - 1}–${String(id).slice(-2)}`;

export function HomeStandings() {
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<number>(1);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
  const [loadingStandings, setLoadingStandings] = useState(false);

  // Load league list once
  useEffect(() => {
    supabase.from("leagues").select("LeagueID, LeagueName, LeagueTier")
      .order("LeagueTier").order("LeagueName")
      .then(({ data }) => {
        if (data) {
          const domestic = (data as LeagueOption[]).filter(l => l.LeagueTier === 1 || l.LeagueTier === 2);
          setLeagues(domestic);
          if (domestic.length > 0) setSelectedLeague(domestic[0].LeagueID);
        }
      });
  }, []);

  // Fetch standings for selected league only — fast, targeted query
  const loadStandings = useCallback(async (lid: number) => {
    setLoadingStandings(true);
    const data = await fetchAllRows<StandingRow>("standings", {
      select: "*",
      filters: [{ method: "eq", args: ["LeagueID", lid] }],
      order: { column: "totalpoints", ascending: false },
    });
    setStandings(data);
    const seasons = [...new Set(data.map(s => s.SeasonID).filter(Boolean))].sort((a, b) => (b || 0) - (a || 0)) as number[];
    setAvailableSeasons(seasons);
    setSelectedSeason(seasons[0] ?? null);
    setLoadingStandings(false);
  }, []);

  useEffect(() => {
    if (selectedLeague) loadStandings(selectedLeague);
  }, [selectedLeague, loadStandings]);

  const filtered = standings.filter(s => s.SeasonID === selectedSeason);
  const { sorted, sortKey, sortDir, requestSort } = useSortableTable(filtered, "totalpoints", "desc");

  const thClass = "px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none";
  const ind = (k: string) => sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const selectedLeagueName = leagues.find(l => l.LeagueID === selectedLeague)?.LeagueName || "";

  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">
          Standings
        </h3>
        <Link to={`/league/${selectedLeague}`} className="text-xs text-table-header-foreground/70 hover:text-table-header-foreground font-sans">
          Full table →
        </Link>
      </div>

      {/* League + season selectors */}
      <div className="bg-secondary/30 border-b border-border px-3 py-2 flex flex-wrap gap-2">
        <select value={selectedLeague} onChange={e => setSelectedLeague(parseInt(e.target.value))}
          className="flex-1 min-w-[120px] text-xs bg-card border border-border rounded px-2 py-1 font-sans focus:outline-none">
          {leagues.map(l => <option key={l.LeagueID} value={l.LeagueID}>{l.LeagueName}</option>)}
        </select>
        {availableSeasons.length > 0 && (
          <select value={selectedSeason ?? ""} onChange={e => setSelectedSeason(parseInt(e.target.value))}
            className="text-xs bg-card border border-border rounded px-2 py-1 font-sans focus:outline-none">
            {availableSeasons.map(s => <option key={s} value={s}>{seasonLabel(s)}</option>)}
          </select>
        )}
      </div>

      {loadingStandings ? (
        <div className="bg-card divide-y divide-border">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="px-3 py-2 flex gap-3 animate-pulse">
              <div className="h-3 bg-secondary rounded w-4 shrink-0" />
              <div className="h-3 bg-secondary rounded flex-1" />
              <div className="h-3 bg-secondary rounded w-8" />
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-sans">
            <thead>
              <tr className="bg-secondary">
                <th className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-left w-6">#</th>
                <th className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-left">Team</th>
                <th className={`${thClass} text-right`} onClick={() => requestSort("totalgamesplayed")}>GP{ind("totalgamesplayed")}</th>
                <th className={`${thClass} text-right`} onClick={() => requestSort("totalpoints")}>Pts{ind("totalpoints")}</th>
                <th className={`${thClass} text-right hidden sm:table-cell`} onClick={() => requestSort("GoalsFor")}>GF{ind("GoalsFor")}</th>
                <th className={`${thClass} text-right hidden sm:table-cell`} onClick={() => requestSort("GoalsAgainst")}>GA{ind("GoalsAgainst")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr key={row.FullName} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                  <td className="px-2 py-1.5 font-mono text-muted-foreground text-xs">{i + 1}</td>
                  <td className="px-2 py-1.5 font-medium">
                    <Link to={`/team/${encodeURIComponent(row.FullName || "")}`} className="text-accent hover:underline text-xs">
                      {row.FullName}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{row.totalgamesplayed}</td>
                  <td className="px-2 py-1.5 text-right font-mono font-bold text-xs">{row.totalpoints}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs hidden sm:table-cell">{row.GoalsFor}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs hidden sm:table-cell">{row.GoalsAgainst}</td>
                </tr>
              ))}
              {!loadingStandings && sorted.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground text-xs italic">No standings data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
