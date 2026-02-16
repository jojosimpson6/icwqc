import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getLeagueTierLabel } from "@/lib/helpers";

interface League {
  LeagueID: number;
  LeagueName: string | null;
  LeagueTier: number | null;
}

interface Team {
  TeamID: number;
  FullName: string;
  City: string | null;
  Country: string | null;
  Nickname: string | null;
}

interface StandingRow {
  FullName: string | null;
  totalpoints: number | null;
  totalgamesplayed: number | null;
  GoalsFor: number | null;
  GoalsAgainst: number | null;
  totalgsc: number | null;
}

export default function LeaguePage() {
  const { id } = useParams();
  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);

  useEffect(() => {
    if (!id) return;
    const lid = parseInt(id);

    supabase.from("leagues").select("*").eq("LeagueID", lid).single().then(({ data }) => {
      if (data) setLeague(data);
    });

    supabase.from("teams").select("*").eq("LeagueID", lid).order("FullName").then(({ data }) => {
      if (data) setTeams(data);
    });

    // Standings view is filtered by league in the view itself - get all and filter by team names
    if (lid === 1) {
      supabase.from("standings").select("*").order("totalpoints", { ascending: false }).then(({ data }) => {
        if (data) setStandings(data as StandingRow[]);
      });
    }
  }, [id]);

  if (!league) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SiteHeader />
        <main className="flex-1 container py-8"><p className="text-muted-foreground font-sans">Loading league...</p></main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-2">
          <p className="text-xs text-muted-foreground font-sans uppercase tracking-wide">{getLeagueTierLabel(league.LeagueTier)}</p>
          <h1 className="font-display text-3xl font-bold text-foreground">{league.LeagueName}</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Standings */}
            {standings.length > 0 && (
              <div className="border border-border rounded overflow-hidden">
                <div className="bg-table-header px-3 py-2">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">Standings — 1995</h3>
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
                        <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GD</th>
                        <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GSC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((team, i) => (
                        <tr key={team.FullName} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                          <td className="px-3 py-1.5 font-mono text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-1.5 font-medium text-accent hover:underline">
                            <Link to={`/team/${encodeURIComponent(team.FullName || "")}`}>{team.FullName}</Link>
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">{team.totalgamesplayed}</td>
                          <td className="px-3 py-1.5 text-right font-mono font-bold">{team.totalpoints}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{team.GoalsFor}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{team.GoalsAgainst}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{((team.GoalsFor || 0) - (team.GoalsAgainst || 0))}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{team.totalgsc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* League History placeholder */}
            <div className="border border-border rounded overflow-hidden">
              <div className="bg-table-header px-3 py-2">
                <h3 className="font-display text-sm font-bold text-table-header-foreground">League History</h3>
              </div>
              <div className="bg-card p-4 text-sm font-sans text-muted-foreground">
                <table className="w-full">
                  <thead>
                    <tr className="bg-secondary">
                      <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Season</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Champion</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Runner-Up</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Awards</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border">
                      <td className="px-3 py-1.5 font-mono">1995</td>
                      <td className="px-3 py-1.5 italic text-muted-foreground">To be populated</td>
                      <td className="px-3 py-1.5 italic text-muted-foreground">To be populated</td>
                      <td className="px-3 py-1.5 italic text-muted-foreground">To be populated</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Sidebar: Teams */}
          <div className="space-y-6">
            <div className="border border-border rounded overflow-hidden">
              <div className="bg-table-header px-3 py-2">
                <h3 className="font-display text-sm font-bold text-table-header-foreground">Teams</h3>
              </div>
              <div className="bg-card divide-y divide-border">
                {teams.map((t) => (
                  <Link
                    key={t.TeamID}
                    to={`/team/${encodeURIComponent(t.FullName)}`}
                    className="block px-3 py-2.5 hover:bg-highlight/20 transition-colors"
                  >
                    <p className="font-sans font-medium text-sm text-accent">{t.FullName}</p>
                    <p className="text-xs text-muted-foreground font-sans">{t.City}{t.Country ? `, ${t.Country}` : ""}</p>
                  </Link>
                ))}
                {teams.length === 0 && (
                  <p className="px-3 py-3 text-sm text-muted-foreground font-sans italic">No teams found for this league.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
