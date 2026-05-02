import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { EloChart } from "@/components/EloChart";

interface EloPoint {
  FullName: string;
  Matchday: string;
  elo_rating: number;
  current_game_number: number;
}

interface TeamCurrentElo {
  name: string;
  rating: number;
  leagueId: number | null;
  leagueName: string;
  gamesPlayed: number;
  prevRating: number;
  change: number;
}

function seasonLabel(id: number): string {
  return `${id - 1}–${String(id).slice(-2)}`;
}

export default function EloPage() {
  const [eloData, setEloData] = useState<EloPoint[]>([]);
  const [leagues, setLeagues] = useState<{ LeagueID: number; LeagueName: string; LeagueTier: number | null }[]>([]);
  const [teamLeagueMap, setTeamLeagueMap] = useState<Map<string, { id: number; name: string }>>( new Map());
  const [selectedLeague, setSelectedLeague] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<"rating" | "name" | "change" | "gp">("rating");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [teamLinkMap, setTeamLinkMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    Promise.all([
      supabase.from("leagues").select("LeagueID, LeagueName, LeagueTier").order("LeagueTier").order("LeagueName"),
      fetchAllRows("elo_new", { select: "*", order: { column: "Matchday", ascending: true } }),
      supabase.from("teams").select("TeamID, FullName, LeagueID"),
    ]).then(([{ data: lgData }, eData, { data: teamsData }]) => {
      if (lgData) setLeagues(lgData as any[]);

      const elo = (eData || []).filter((d: any) => d.FullName && d.Matchday && d.elo_rating != null) as EloPoint[];
      setEloData(elo);

      const tlm = new Map<string, { id: number; name: string }>();
      const tlidMap = new Map<string, number>();
      const lgMap = new Map<number, string>();
      (lgData || []).forEach((l: any) => lgMap.set(l.LeagueID, l.LeagueName));
      (teamsData || []).forEach((t: any) => {
        if (t.FullName && t.LeagueID) {
          tlm.set(t.FullName, { id: t.LeagueID, name: lgMap.get(t.LeagueID) || "" });
          tlidMap.set(t.FullName, t.TeamID);
        }
      });
      setTeamLeagueMap(tlm);
      setTeamLinkMap(tlidMap);
      setLoading(false);
    });
  }, []);

  // Build current Elo table: latest rating per team
  const currentElos = useMemo((): TeamCurrentElo[] => {
    const byTeam = new Map<string, EloPoint[]>();
    eloData.forEach(d => {
      if (!byTeam.has(d.FullName)) byTeam.set(d.FullName, []);
      byTeam.get(d.FullName)!.push(d);
    });

    const result: TeamCurrentElo[] = [];
    byTeam.forEach((points, name) => {
      const sorted = [...points].sort((a, b) => a.Matchday.localeCompare(b.Matchday));
      const latest = sorted[sorted.length - 1];
      const prev = sorted.length >= 2 ? sorted[sorted.length - 2].elo_rating : latest.elo_rating;
      const lgInfo = teamLeagueMap.get(name);

      if (selectedLeague !== null && lgInfo?.id !== selectedLeague) return;

      result.push({
        name,
        rating: latest.elo_rating,
        leagueId: lgInfo?.id ?? null,
        leagueName: lgInfo?.name ?? "",
        gamesPlayed: latest.current_game_number,
        prevRating: prev,
        change: latest.elo_rating - prev,
      });
    });
    return result;
  }, [eloData, teamLeagueMap, selectedLeague]);

  const sortedElos = useMemo(() => {
    return [...currentElos].sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      if (sortKey === "rating") { va = a.rating; vb = b.rating; }
      else if (sortKey === "name") { va = a.name; vb = b.name; }
      else if (sortKey === "change") { va = a.change; vb = b.change; }
      else if (sortKey === "gp") { va = a.gamesPlayed; vb = b.gamesPlayed; }
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [currentElos, sortKey, sortDir]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  };

  const sortInd = (key: typeof sortKey) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none";

  const domLeagues = leagues.filter(l => l.LeagueTier != null && l.LeagueTier > 0);
  const intlLeagues = leagues.filter(l => l.LeagueTier === 0);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8">

        <div className="mb-6 border-b-2 border-primary pb-2">
          <p className="text-xs text-muted-foreground font-sans uppercase tracking-wide">
            <Link to="/" className="hover:text-accent">Home</Link>
          </p>
          <h1 className="font-display text-3xl font-bold text-foreground">Team Elo Ratings</h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">
            Live power rankings based on match results across all leagues
          </p>
        </div>

        {/* Chart */}
        <div className="mb-6">
          <EloChart />
        </div>

        {/* League filter + table */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <label className="text-sm font-sans font-medium text-muted-foreground">Filter by league:</label>
          <select
            value={selectedLeague ?? ""}
            onChange={e => setSelectedLeague(e.target.value ? parseInt(e.target.value) : null)}
            className="text-sm bg-popover text-popover-foreground border border-border rounded px-3 py-1.5 font-sans"
          >
            <option value="">All Leagues</option>
            {domLeagues.length > 0 && (
              <optgroup label="Domestic">
                {domLeagues.map(l => <option key={l.LeagueID} value={l.LeagueID}>{l.LeagueName}</option>)}
              </optgroup>
            )}
            {intlLeagues.length > 0 && (
              <optgroup label="International">
                {intlLeagues.map(l => <option key={l.LeagueID} value={l.LeagueID}>{l.LeagueName}</option>)}
              </optgroup>
            )}
          </select>
          <span className="text-xs text-muted-foreground font-sans">{sortedElos.length} teams</span>
        </div>

        <div className="border border-border rounded overflow-hidden">
          <div className="bg-table-header px-3 py-2">
            <h3 className="font-display text-sm font-bold text-table-header-foreground">Current Ratings</h3>
          </div>
          {loading ? (
            <div className="bg-card p-8 text-center text-muted-foreground font-sans text-sm italic">Loading ratings…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-sans">
                <thead>
                  <tr className="bg-secondary">
                    <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">#</th>
                    <th className={`${thClass} text-left`} onClick={() => toggleSort("name")}>Team{sortInd("name")}</th>
                    <th className={`${thClass} text-left`}>League</th>
                    <th className={`${thClass} text-right`} onClick={() => toggleSort("rating")}>Rating{sortInd("rating")}</th>
                    <th className={`${thClass} text-right`} onClick={() => toggleSort("change")}>Change{sortInd("change")}</th>
                    <th className={`${thClass} text-right`} onClick={() => toggleSort("gp")}>GP{sortInd("gp")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedElos.map((t, i) => {
                    const changeColor = t.change > 0 ? "text-green-600 dark:text-green-400" : t.change < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground";
                    const changeStr = t.change > 0 ? `+${Math.round(t.change)}` : t.change < 0 ? `${Math.round(t.change)}` : "—";
                    return (
                      <tr key={t.name} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                        <td className="px-3 py-2 font-mono text-muted-foreground text-xs">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">
                          <Link to={`/team/${encodeURIComponent(t.name)}`} className="text-accent hover:underline">{t.name}</Link>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {t.leagueId
                            ? <Link to={`/league/${t.leagueId}`} className="hover:text-accent hover:underline">{t.leagueName}</Link>
                            : t.leagueName}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold">{Math.round(t.rating)}</td>
                        <td className={`px-3 py-2 text-right font-mono text-sm ${changeColor}`}>{changeStr}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">{t.gamesPlayed}</td>
                      </tr>
                    );
                  })}
                  {sortedElos.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground italic">No data available.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* About Elo */}
        <div className="mt-6 border border-border rounded p-4 bg-card">
          <h3 className="font-display text-sm font-bold text-foreground mb-2">About Elo Ratings</h3>
          <p className="text-xs text-muted-foreground font-sans leading-relaxed">
            Elo ratings measure team strength based on match results. A win against a stronger opponent earns more points than a win against a weaker one.
            Ratings start at 5,000 and are updated after every match. The "Change" column shows the rating shift from the most recent match played.
          </p>
        </div>

      </main>
      <SiteFooter />
    </div>
  );
}
