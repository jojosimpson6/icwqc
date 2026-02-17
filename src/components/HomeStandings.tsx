import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSortableTable } from "@/hooks/useSortableTable";

interface StandingRow {
  FullName: string | null;
  totalpoints: number | null;
  totalgamesplayed: number | null;
  GoalsFor: number | null;
  GoalsAgainst: number | null;
  totalgsc: number | null;
  SeasonID: number | null;
}

interface LeagueOption {
  LeagueID: number;
  LeagueName: string;
}

export function HomeStandings() {
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<number>(1);
  const [teamsByLeague, setTeamsByLeague] = useState<Record<number, string[]>>({});

  useEffect(() => {
    Promise.all([
      supabase.from("leagues").select("LeagueID, LeagueName").order("LeagueTier").order("LeagueName"),
      supabase.from("teams").select("TeamID, FullName, LeagueID"),
      supabase.from("standings").select("*").order("totalpoints", { ascending: false }),
    ]).then(([{ data: leagueData }, { data: teamData }, { data: standingsData }]) => {
      if (leagueData) setLeagues(leagueData as LeagueOption[]);
      if (teamData) {
        const map: Record<number, string[]> = {};
        teamData.forEach((t: any) => {
          if (!map[t.LeagueID]) map[t.LeagueID] = [];
          map[t.LeagueID].push(t.FullName);
        });
        setTeamsByLeague(map);
      }
      if (standingsData) setStandings(standingsData as StandingRow[]);
    });
  }, []);

  const leagueTeams = teamsByLeague[selectedLeague] || [];
  const filtered = standings.filter((s) => leagueTeams.includes(s.FullName || ""));
  
  const { sorted, sortKey, sortDir, requestSort } = useSortableTable(filtered, "totalpoints", "desc");

  const selectedLeagueName = leagues.find((l) => l.LeagueID === selectedLeague)?.LeagueName || "";

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none";
  const sortIndicator = (key: string) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">
          {selectedLeagueName} — Standings
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={selectedLeague}
            onChange={(e) => setSelectedLeague(parseInt(e.target.value))}
            className="text-xs bg-popover text-popover-foreground border border-border rounded px-2 py-1 font-sans"
          >
            {leagues.map((l) => (
              <option key={l.LeagueID} value={l.LeagueID}>{l.LeagueName}</option>
            ))}
          </select>
          <Link to={`/league/${selectedLeague}`} className="text-xs text-table-header-foreground/70 hover:text-table-header-foreground font-sans whitespace-nowrap">
            Full Standings →
          </Link>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-sans">
          <thead>
            <tr className="bg-secondary">
              <th className={`${thClass} text-left`}>#</th>
              <th className={`${thClass} text-left`} onClick={() => requestSort("FullName")}>Team{sortIndicator("FullName")}</th>
              <th className={`${thClass} text-right`} onClick={() => requestSort("totalgamesplayed")}>GP{sortIndicator("totalgamesplayed")}</th>
              <th className={`${thClass} text-right`} onClick={() => requestSort("totalpoints")}>Pts{sortIndicator("totalpoints")}</th>
              <th className={`${thClass} text-right`} onClick={() => requestSort("GoalsFor")}>GF{sortIndicator("GoalsFor")}</th>
              <th className={`${thClass} text-right`} onClick={() => requestSort("GoalsAgainst")}>GA{sortIndicator("GoalsAgainst")}</th>
              <th className={`${thClass} text-right`} onClick={() => requestSort("totalgsc")}>GSC{sortIndicator("totalgsc")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((team, i) => (
              <tr
                key={team.FullName}
                className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20 transition-colors`}
              >
                <td className="px-3 py-1.5 font-mono text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-1.5 font-medium text-accent hover:underline">
                  <Link to={`/team/${encodeURIComponent(team.FullName || "")}`}>{team.FullName}</Link>
                </td>
                <td className="px-3 py-1.5 text-right font-mono">{team.totalgamesplayed}</td>
                <td className="px-3 py-1.5 text-right font-mono font-bold">{team.totalpoints}</td>
                <td className="px-3 py-1.5 text-right font-mono">{team.GoalsFor}</td>
                <td className="px-3 py-1.5 text-right font-mono">{team.GoalsAgainst}</td>
                <td className="px-3 py-1.5 text-right font-mono">{team.totalgsc}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground italic">No standings data for this league.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
