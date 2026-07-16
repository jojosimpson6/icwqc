import { useEffect, useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchAllRows } from "@/lib/fetchAll";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { getNationFlag, getLeagueTierLabel } from "@/lib/helpers";

interface PlayerRow { PlayerID: number; PlayerName: string; Position: string | null; NationalityID: number | null; }
interface TeamRow { TeamID: number; FullName: string; LeagueID: number; nationid: number | null; }
interface ManagerRow { ManagerID: number; FirstName: string; LastName: string; NationalityID: number | null; }
interface NationRow { NationID: number; Nation: string; }
interface LeagueRow { LeagueID: number; LeagueName: string; LeagueTier: number | null; }

type EntityType = "players" | "teams" | "managers" | "nations";

const ALL_TYPES: EntityType[] = ["players", "teams", "managers", "nations"];
const TYPE_LABELS: Record<EntityType, string> = { players: "Players", teams: "Teams", managers: "Managers", nations: "Nations" };

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [types, setTypes] = useState<Set<EntityType>>(new Set(ALL_TYPES));
  const [positionFilter, setPositionFilter] = useState("All");
  const [nationFilter, setNationFilter] = useState<number | "all">("all");
  const [leagueFilter, setLeagueFilter] = useState<number | "all">("all");

  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [nations, setNations] = useState<NationRow[]>([]);
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchAllRows<PlayerRow>("players", { select: "PlayerID, PlayerName, Position, NationalityID" }),
      fetchAllRows<TeamRow>("teams", { select: "TeamID, FullName, LeagueID, nationid" }),
      fetchAllRows<ManagerRow>("managers", { select: "ManagerID, FirstName, LastName, NationalityID" }),
      fetchAllRows<NationRow>("nations", { select: "NationID, Nation, ValidToDt", order: { column: "ValidToDt", ascending: false } }),
      fetchAllRows<LeagueRow>("leagues", { select: "LeagueID, LeagueName, LeagueTier" }),
    ]).then(([playerData, teamData, managerData, nationData, leagueData]) => {
      setPlayers(playerData);
      setTeams(teamData.filter(t => !t.nationid && t.TeamID <= 999)); // club teams only — nations get their own results section
      setManagers(managerData);
      // Dedupe nations (historical name changes can produce repeat NationIDs)
      const seenNations = new Map<number, NationRow>();
      nationData.forEach(n => { if (n.NationID && !seenNations.has(n.NationID)) seenNations.set(n.NationID, n); });
      setNations([...seenNations.values()]);
      setLeagues(leagueData);
      setLoading(false);
    }).catch(err => {
      console.error("Search data load failed:", err);
      setLoading(false);
    });
  }, []);

  // Keep the query string in the URL so searches are shareable/bookmarkable.
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (query) params.set("q", query); else params.delete("q");
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const nationMap = useMemo(() => new Map(nations.map(n => [n.NationID, n.Nation])), [nations]);
  const leagueMap = useMemo(() => new Map(leagues.map(l => [l.LeagueID, l])), [leagues]);

  const positionOptions = useMemo(() => ["All", ...new Set(players.map(p => p.Position).filter(Boolean) as string[])].sort(
    (a, b) => a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b)
  ), [players]);

  const nationOptions = useMemo(() => [...nations].sort((a, b) => a.Nation.localeCompare(b.Nation)), [nations]);
  const leagueOptions = useMemo(() => [...leagues].sort((a, b) => (a.LeagueTier ?? 9) - (b.LeagueTier ?? 9) || a.LeagueName.localeCompare(b.LeagueName)), [leagues]);

  function toggleType(t: EntityType) {
    setTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  const q = query.trim().toLowerCase();
  const hasQuery = q.length > 0;
  const hasExtraFilters = positionFilter !== "All" || nationFilter !== "all" || leagueFilter !== "all";

  const filteredPlayers = useMemo(() => {
    if (!types.has("players")) return [];
    return players.filter(p => {
      if (hasQuery && !p.PlayerName.toLowerCase().includes(q)) return false;
      if (positionFilter !== "All" && p.Position !== positionFilter) return false;
      if (nationFilter !== "all" && p.NationalityID !== nationFilter) return false;
      return true;
    });
  }, [players, types, q, hasQuery, positionFilter, nationFilter]);

  const filteredTeams = useMemo(() => {
    if (!types.has("teams")) return [];
    return teams.filter(t => {
      if (hasQuery && !t.FullName.toLowerCase().includes(q)) return false;
      if (leagueFilter !== "all" && t.LeagueID !== leagueFilter) return false;
      return true;
    });
  }, [teams, types, q, hasQuery, leagueFilter]);

  const filteredManagers = useMemo(() => {
    if (!types.has("managers")) return [];
    return managers.filter(m => {
      const name = `${m.FirstName} ${m.LastName}`.toLowerCase();
      if (hasQuery && !name.includes(q)) return false;
      if (nationFilter !== "all" && m.NationalityID !== nationFilter) return false;
      return true;
    });
  }, [managers, types, q, hasQuery, nationFilter]);

  const filteredNations = useMemo(() => {
    if (!types.has("nations")) return [];
    // Position/league filters don't apply to nations; a nation filter selected
    // in the sidebar narrows this list to just that one nation.
    return nations.filter(n => {
      if (hasQuery && !n.Nation.toLowerCase().includes(q)) return false;
      if (nationFilter !== "all" && n.NationID !== nationFilter) return false;
      return true;
    });
  }, [nations, types, q, hasQuery, nationFilter]);

  const totalResults = filteredPlayers.length + filteredTeams.length + filteredManagers.length + filteredNations.length;
  const showResults = hasQuery || hasExtraFilters;

  return (
    <div className="min-h-screen bg-background flex flex-col pb-14 md:pb-0">
      <SiteHeader />
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-2">
          <h1 className="font-display text-3xl font-bold text-foreground">Advanced Search</h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">
            Search and filter across players, teams, managers, and nations at once.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Filter panel */}
          <div className="lg:col-span-1 space-y-4">
            <div>
              <label className="block text-xs font-sans font-semibold uppercase tracking-wide text-muted-foreground mb-1">Name</label>
              <input
                type="text"
                autoFocus
                placeholder="Search by name…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded bg-card text-sm font-sans focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-sans font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Include</label>
              <div className="space-y-1.5">
                {ALL_TYPES.map(t => (
                  <label key={t} className="flex items-center gap-2 text-sm font-sans cursor-pointer">
                    <input type="checkbox" checked={types.has(t)} onChange={() => toggleType(t)} className="accent-accent" />
                    {TYPE_LABELS[t]}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-sans font-semibold uppercase tracking-wide text-muted-foreground mb-1">Position</label>
              <select
                value={positionFilter}
                onChange={e => setPositionFilter(e.target.value)}
                disabled={!types.has("players")}
                className="w-full px-3 py-2 border border-border rounded bg-card text-sm font-sans focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              >
                {positionOptions.map(p => <option key={p} value={p}>{p === "All" ? "All Positions" : p}</option>)}
              </select>
              <p className="text-[11px] text-muted-foreground font-sans mt-0.5">Applies to players only.</p>
            </div>

            <div>
              <label className="block text-xs font-sans font-semibold uppercase tracking-wide text-muted-foreground mb-1">Nationality</label>
              <select
                value={nationFilter}
                onChange={e => setNationFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                disabled={!types.has("players") && !types.has("managers") && !types.has("nations")}
                className="w-full px-3 py-2 border border-border rounded bg-card text-sm font-sans focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              >
                <option value="all">All Nationalities</option>
                {nationOptions.map(n => <option key={n.NationID} value={n.NationID}>{getNationFlag(n.Nation)} {n.Nation}</option>)}
              </select>
              <p className="text-[11px] text-muted-foreground font-sans mt-0.5">Applies to players, managers &amp; nations.</p>
            </div>

            <div>
              <label className="block text-xs font-sans font-semibold uppercase tracking-wide text-muted-foreground mb-1">League</label>
              <select
                value={leagueFilter}
                onChange={e => setLeagueFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                disabled={!types.has("teams")}
                className="w-full px-3 py-2 border border-border rounded bg-card text-sm font-sans focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              >
                <option value="all">All Leagues</option>
                {leagueOptions.map(l => <option key={l.LeagueID} value={l.LeagueID}>{l.LeagueName} ({getLeagueTierLabel(l.LeagueTier)})</option>)}
              </select>
              <p className="text-[11px] text-muted-foreground font-sans mt-0.5">Applies to teams only.</p>
            </div>

            {(query || positionFilter !== "All" || nationFilter !== "all" || leagueFilter !== "all" || types.size !== ALL_TYPES.length) && (
              <button
                onClick={() => { setQuery(""); setPositionFilter("All"); setNationFilter("all"); setLeagueFilter("all"); setTypes(new Set(ALL_TYPES)); }}
                className="text-xs text-muted-foreground hover:text-foreground font-sans px-3 py-2 border border-border rounded hover:bg-secondary transition-colors w-full"
              >
                Clear all filters
              </button>
            )}
          </div>

          {/* Results */}
          <div className="lg:col-span-3 space-y-6">
            {loading ? (
              <p className="text-sm text-muted-foreground font-sans italic">Loading search index…</p>
            ) : !showResults ? (
              <p className="text-sm text-muted-foreground font-sans italic">Enter a name or choose a filter to start searching.</p>
            ) : totalResults === 0 ? (
              <p className="text-sm text-muted-foreground font-sans italic">No results match your search and filters.</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground font-sans">{totalResults} result{totalResults === 1 ? "" : "s"}</p>

                {filteredPlayers.length > 0 && (
                  <div className="border border-border rounded overflow-hidden">
                    <div className="bg-table-header px-3 py-2">
                      <h3 className="font-display text-sm font-bold text-table-header-foreground">Players ({filteredPlayers.length})</h3>
                    </div>
                    <div className="bg-card divide-y divide-border max-h-96 overflow-y-auto">
                      {filteredPlayers.slice(0, 100).map(p => (
                        <Link key={p.PlayerID} to={`/player/${p.PlayerID}`} className="flex items-center justify-between px-3 py-2 text-sm font-sans hover:bg-highlight/20 transition-colors">
                          <span className="text-accent hover:underline font-medium">{p.PlayerName}</span>
                          <span className="text-xs text-muted-foreground">
                            {p.Position}{p.NationalityID && nationMap.has(p.NationalityID) ? ` · ${getNationFlag(nationMap.get(p.NationalityID)!)} ${nationMap.get(p.NationalityID)}` : ""}
                          </span>
                        </Link>
                      ))}
                      {filteredPlayers.length > 100 && (
                        <p className="px-3 py-2 text-xs text-muted-foreground italic">Showing first 100 of {filteredPlayers.length} — narrow your search to see more precisely.</p>
                      )}
                    </div>
                  </div>
                )}

                {filteredTeams.length > 0 && (
                  <div className="border border-border rounded overflow-hidden">
                    <div className="bg-table-header px-3 py-2">
                      <h3 className="font-display text-sm font-bold text-table-header-foreground">Teams ({filteredTeams.length})</h3>
                    </div>
                    <div className="bg-card divide-y divide-border max-h-96 overflow-y-auto">
                      {filteredTeams.slice(0, 100).map(t => (
                        <Link key={t.TeamID} to={`/team/${encodeURIComponent(t.FullName)}`} className="flex items-center justify-between px-3 py-2 text-sm font-sans hover:bg-highlight/20 transition-colors">
                          <span className="text-accent hover:underline font-medium">{t.FullName}</span>
                          <span className="text-xs text-muted-foreground">{leagueMap.get(t.LeagueID)?.LeagueName || ""}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {filteredManagers.length > 0 && (
                  <div className="border border-border rounded overflow-hidden">
                    <div className="bg-table-header px-3 py-2">
                      <h3 className="font-display text-sm font-bold text-table-header-foreground">Managers ({filteredManagers.length})</h3>
                    </div>
                    <div className="bg-card divide-y divide-border max-h-96 overflow-y-auto">
                      {filteredManagers.slice(0, 100).map(m => (
                        <Link key={m.ManagerID} to={`/manager/${m.ManagerID}`} className="flex items-center justify-between px-3 py-2 text-sm font-sans hover:bg-highlight/20 transition-colors">
                          <span className="text-accent hover:underline font-medium">{m.FirstName} {m.LastName}</span>
                          <span className="text-xs text-muted-foreground">
                            {m.NationalityID && nationMap.has(m.NationalityID) ? `${getNationFlag(nationMap.get(m.NationalityID)!)} ${nationMap.get(m.NationalityID)}` : ""}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {filteredNations.length > 0 && (
                  <div className="border border-border rounded overflow-hidden">
                    <div className="bg-table-header px-3 py-2">
                      <h3 className="font-display text-sm font-bold text-table-header-foreground">Nations ({filteredNations.length})</h3>
                    </div>
                    <div className="bg-card divide-y divide-border max-h-96 overflow-y-auto">
                      {filteredNations.slice(0, 100).map(n => (
                        <Link key={n.NationID} to={`/nation/${n.NationID}`} className="flex items-center gap-2 px-3 py-2 text-sm font-sans hover:bg-highlight/20 transition-colors">
                          <span>{getNationFlag(n.Nation)}</span>
                          <span className="text-accent hover:underline font-medium">{n.Nation}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
