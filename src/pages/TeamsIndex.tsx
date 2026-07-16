import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { fetchAllRows } from "@/lib/fetchAll";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { getLeagueTierLabel } from "@/lib/helpers";
import { ChevronUp, ChevronDown } from "lucide-react";

interface Team {
  TeamID: number;
  FullName: string;
  Nickname: string | null;
  City: string | null;
  Country: string | null;
  LeagueID: number;
  logo_url: string | null;
  nationid: number | null;
}

interface League {
  LeagueID: number;
  LeagueName: string;
  LeagueTier: number | null;
}

type SortKey = "name" | "league" | "location";
type SortDir = "asc" | "desc";

export default function TeamsIndex() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [filter, setFilter] = useState("");
  const [leagueFilter, setLeagueFilter] = useState<number | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchAllRows<Team>("teams", { select: "TeamID, FullName, Nickname, City, Country, LeagueID, logo_url, nationid" }),
      fetchAllRows<League>("leagues", { select: "LeagueID, LeagueName, LeagueTier" }),
    ]).then(([teamData, leagueData]) => {
      // Club teams only — national teams (which have a nationid) get their own Nations pages.
      setTeams(teamData.filter(t => !t.nationid));
      setLeagues(leagueData);
      setLoading(false);
    }).catch(err => {
      console.error("Failed to load teams:", err);
      setLoadError(true);
      setLoading(false);
    });
  }, []);

  const leagueMap = useMemo(() => {
    const m = new Map<number, League>();
    leagues.forEach(l => m.set(l.LeagueID, l));
    return m;
  }, [leagues]);

  const leagueOptions = useMemo(() => {
    return [...leagues]
      .filter(l => teams.some(t => t.LeagueID === l.LeagueID))
      .sort((a, b) => (a.LeagueTier ?? 9) - (b.LeagueTier ?? 9) || a.LeagueName.localeCompare(b.LeagueName));
  }, [leagues, teams]);

  const filtered = useMemo(() => {
    let list = teams.filter(t => {
      const q = filter.toLowerCase();
      if (q && !t.FullName.toLowerCase().includes(q) && !(t.Nickname || "").toLowerCase().includes(q) && !(t.City || "").toLowerCase().includes(q)) return false;
      if (leagueFilter !== "all" && t.LeagueID !== leagueFilter) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      let va = "", vb = "";
      if (sortKey === "name") { va = a.FullName; vb = b.FullName; }
      else if (sortKey === "league") { va = leagueMap.get(a.LeagueID)?.LeagueName || ""; vb = leagueMap.get(b.LeagueID)?.LeagueName || ""; }
      else if (sortKey === "location") { va = `${a.City || ""} ${a.Country || ""}`; vb = `${b.City || ""} ${b.Country || ""}`; }
      const cmp = va.localeCompare(vb);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [teams, filter, leagueFilter, sortKey, sortDir, leagueMap]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="opacity-20 text-muted-foreground ml-1">↕</span>;
    return sortDir === "asc" ? <ChevronUp size={12} className="inline ml-0.5" /> : <ChevronDown size={12} className="inline ml-0.5" />;
  };

  const Th = ({ col, label }: { col: SortKey; label: string }) => (
    <th
      className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => toggleSort(col)}
    >
      {label}<SortIcon col={col} />
    </th>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col pb-14 md:pb-0">
      <SiteHeader />
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-2">
          <h1 className="font-display text-3xl font-bold text-foreground">Teams</h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">
            {loading ? "Loading…" : `${filtered.length} of ${teams.length} teams`}
          </p>
        </div>

        {loadError ? (
          <p className="text-muted-foreground font-sans">We couldn't load team data. Please try again later.</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[160px] max-w-xs">
                <input
                  type="text"
                  placeholder="Search by name or city…"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded bg-card text-sm font-sans focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div>
                <select
                  value={leagueFilter}
                  onChange={e => setLeagueFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                  className="px-3 py-2 border border-border rounded bg-card text-sm font-sans focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="all">All Leagues</option>
                  {leagueOptions.map(l => (
                    <option key={l.LeagueID} value={l.LeagueID}>{l.LeagueName} ({getLeagueTierLabel(l.LeagueTier)})</option>
                  ))}
                </select>
              </div>
              {(filter || leagueFilter !== "all") && (
                <button
                  onClick={() => { setFilter(""); setLeagueFilter("all"); }}
                  className="text-xs text-muted-foreground hover:text-foreground font-sans px-2 py-2 border border-border rounded hover:bg-secondary transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>

            <div className="border border-border rounded overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="bg-secondary">
                      <Th col="name" label="Team" />
                      <Th col="league" label="League" />
                      <Th col="location" label="Location" />
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr><td colSpan={3} className="px-3 py-8 text-center text-muted-foreground italic">Loading teams…</td></tr>
                    )}
                    {!loading && filtered.length === 0 && (
                      <tr><td colSpan={3} className="px-3 py-8 text-center text-muted-foreground italic">No teams match your filters.</td></tr>
                    )}
                    {filtered.map((t, i) => {
                      const league = leagueMap.get(t.LeagueID);
                      return (
                        <tr key={t.TeamID} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20 transition-colors`}>
                          <td className="px-3 py-2 font-medium">
                            <Link to={`/team/${encodeURIComponent(t.FullName)}`} className="text-accent hover:underline flex items-center gap-2">
                              {t.logo_url && <img src={t.logo_url} alt="" className="w-5 h-5 object-contain shrink-0" />}
                              {t.FullName}
                            </Link>
                          </td>
                          <td className="px-3 py-2">
                            {league ? (
                              <Link to={`/league/${league.LeagueID}`} className="text-accent hover:underline text-xs">{league.LeagueName}</Link>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {[t.City, t.Country].filter(Boolean).join(", ") || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
