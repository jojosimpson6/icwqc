import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface StandingRow {
  FullName: string | null;
  totalpoints: number | null;
  totalgamesplayed: number | null;
  GoalsFor: number | null;
  GoalsAgainst: number | null;
  totalgsc: number | null;
  SeasonID: number | null;
}

export function HomeStandings() {
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [leagueName, setLeagueName] = useState("");

  useEffect(() => {
    // Get standings (the view is for BIQL season 1995)
    supabase
      .from("standings")
      .select("*")
      .order("totalpoints", { ascending: false })
      .then(({ data }) => {
        if (data) {
          setStandings(data as StandingRow[]);
          setLeagueName("British and Irish Quidditch League");
        }
      });
  }, []);

  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">
          {leagueName} — Standings
        </h3>
        <Link to="/league/1" className="text-xs text-table-header-foreground/70 hover:text-table-header-foreground font-sans">
          Full Standings →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-sans">
          <thead>
            <tr className="bg-secondary">
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">#</th>
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GP</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pts</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GF</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GA</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GSC</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((team, i) => (
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
