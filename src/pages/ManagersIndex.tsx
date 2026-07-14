import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { getNationFlag } from "@/lib/helpers";
import { seasonLabel } from "@/lib/competitionStage";
import { ChevronUp, ChevronDown } from "lucide-react";

interface Manager {
  ManagerID: number;
  FirstName: string;
  LastName: string;
  NationalityID: number | null;
  FormerPlayerFlag: boolean;
}

interface Stint {
  ManagerID: number;
  TeamID: number;
  SeasonID: number;
}

interface TeamInfo {
  TeamID: number;
  FullName: string;
}

type SortKey = "name" | "nationality" | "team" | "seasons";
type SortDir = "asc" | "desc";

export default function ManagersIndex() {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [stints, setStints] = useState<Stint[]>([]);
  const [teamNames, setTeamNames] = useState<Map<number, string>>(new Map());
  const [nations, setNations] = useState<Map<number, { name: string; id: number }>>(new Map());
  const [filter, setFilter] = useState("");
  const [natFilter, setNatFilter] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchAllRows<Manager>("managers", { select: "ManagerID, FirstName, LastName, NationalityID, FormerPlayerFlag", order: { column: "LastName" } }),
      fetchAllRows<Stint>("team_managers", { select: "ManagerID, TeamID, SeasonID", order: { column: "SeasonID", ascending: false } }),
      fetchAllRows<TeamInfo>("teams", { select: "TeamID, FullName" }),
      supabase.from("nations").select("NationID, Nation, ValidToDt").order("ValidToDt", { ascending: false }),
    ]).then(([mgrData, stintData, teamData, { data: nationData }]) => {
      setManagers(mgrData);
      setStints(stintData);

      const tm = new Map<number, string>();
      teamData.forEach(t => tm.set(t.TeamID, t.FullName));
      setTeamNames(tm);

      const nm = new Map<number, { name: string; id: number }>();
      (nationData || []).forEach((n: any) => {
        if (n.NationID && n.Nation && !nm.has(n.NationID)) nm.set(n.NationID, { name: n.Nation, id: n.NationID });
      });
      setNations(nm);
      setLoading(false);
    }).catch(err => {
      console.error("Failed to load managers:", err);
      setLoadError(true);
      setLoading(false);
    });
  }, []);

  // Per-manager derived summary: most recent team, total seasons, stint count
  const summaryByManager = useMemo(() => {
    const byMgr = new Map<number, Stint[]>();
    stints.forEach(s => {
      if (!byMgr.has(s.ManagerID)) byMgr.set(s.ManagerID, []);
      byMgr.get(s.ManagerID)!.push(s);
    });

    const result = new Map<number, { mostRecentTeam: string | null; mostRecentSeason: number | null; seasonCount: number; stintCount: number }>();
    byMgr.forEach((rows, mgrId) => {
      const sorted = [...rows].sort((a, b) => a.SeasonID - b.SeasonID);
      const mostRecent = sorted[sorted.length - 1];
      let stintCount = sorted.length > 0 ? 1 : 0;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].TeamID !== sorted[i - 1].TeamID || sorted[i].SeasonID !== sorted[i - 1].SeasonID + 1) {
          stintCount++;
        }
      }
      result.set(mgrId, {
        mostRecentTeam: mostRecent ? teamNames.get(mostRecent.TeamID) || null : null,
        mostRecentSeason: mostRecent ? mostRecent.SeasonID : null,
        seasonCount: new Set(rows.map(r => r.SeasonID)).size,
        stintCount,
      });
    });
    return result;
  }, [stints, teamNames]);

  const nationNames = useMemo(() => {
    const seen = new Set<string>();
    const opts = ["All"];
    managers.forEach(m => {
      const n = m.NationalityID ? nations.get(m.NationalityID)?.name : null;
      if (n && !seen.has(n)) { seen.add(n); opts.push(n); }
    });
    return opts.sort((a, b) => a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b));
  }, [managers, nations]);

  const filtered = useMemo(() => {
    let list = managers.filter(m => {
      const name = `${m.FirstName} ${m.LastName}`.toLowerCase();
      const q = filter.toLowerCase();
      if (q && !name.includes(q)) return false;
      if (natFilter !== "All") {
        const natInfo = m.NationalityID ? nations.get(m.NationalityID) : null;
        if (!natInfo || natInfo.name !== natFilter) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      let va: string | number = "", vb: string | number = "";
      if (sortKey === "name") { va = `${a.FirstName} ${a.LastName}`; vb = `${b.FirstName} ${b.LastName}`; }
      else if (sortKey === "nationality") {
        va = (a.NationalityID ? nations.get(a.NationalityID)?.name : "") || "";
        vb = (b.NationalityID ? nations.get(b.NationalityID)?.name : "") || "";
      }
      else if (sortKey === "team") {
        va = summaryByManager.get(a.ManagerID)?.mostRecentTeam || "";
        vb = summaryByManager.get(b.ManagerID)?.mostRecentTeam || "";
      }
      else if (sortKey === "seasons") {
        va = summaryByManager.get(a.ManagerID)?.seasonCount || 0;
        vb = summaryByManager.get(b.ManagerID)?.seasonCount || 0;
      }
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [managers, filter, natFilter, sortKey, sortDir, nations, summaryByManager]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "seasons" ? "desc" : "asc"); }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="opacity-20 text-muted-foreground ml-1">↕</span>;
    return sortDir === "asc" ? <ChevronUp size={12} className="inline ml-0.5" /> : <ChevronDown size={12} className="inline ml-0.5" />;
  };

  const Th = ({ col, label, right }: { col: SortKey; label: string; right?: boolean }) => (
    <th
      className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors ${right ? "text-right" : "text-left"}`}
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
          <h1 className="font-display text-3xl font-bold text-foreground">Managers</h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">
            {loading ? "Loading…" : `${filtered.length} of ${managers.length} managers`}
          </p>
        </div>

        {loadError ? (
          <p className="text-muted-foreground font-sans">
            We couldn't load manager data. Make sure the database migration adding the <code>managers</code> and{" "}
            <code>team_managers</code> tables has been applied.
          </p>
        ) : (
          <>
            {/* Filters */}
            <div className="mb-4 flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[160px] max-w-xs">
                <input
                  type="text"
                  placeholder="Search by name…"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded bg-card text-sm font-sans focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div>
                <select value={natFilter} onChange={e => setNatFilter(e.target.value)}
                  className="px-3 py-2 border border-border rounded bg-card text-sm font-sans focus:outline-none focus:ring-2 focus:ring-accent">
                  {nationNames.map(n => <option key={n} value={n}>{n === "All" ? "All Nations" : n}</option>)}
                </select>
              </div>
              {(filter || natFilter !== "All") && (
                <button onClick={() => { setFilter(""); setNatFilter("All"); }}
                  className="text-xs text-muted-foreground hover:text-foreground font-sans px-2 py-2 border border-border rounded hover:bg-secondary transition-colors">
                  Clear filters
                </button>
              )}
            </div>

            <div className="border border-border rounded overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="bg-secondary">
                      <Th col="name"        label="Manager" />
                      <Th col="nationality" label="Nationality" />
                      <Th col="team"        label="Most Recent Team" />
                      <Th col="seasons"     label="Seasons" right />
                      <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Playing Career</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground italic">Loading managers…</td></tr>
                    )}
                    {!loading && filtered.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground italic">No managers match your filters.</td></tr>
                    )}
                    {filtered.map((m, i) => {
                      const nationInfo = m.NationalityID ? nations.get(m.NationalityID) : null;
                      const summary = summaryByManager.get(m.ManagerID);
                      return (
                        <tr key={m.ManagerID} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20 transition-colors`}>
                          <td className="px-3 py-2 font-medium">
                            <Link to={`/manager/${m.ManagerID}`} className="text-accent hover:underline">{m.FirstName} {m.LastName}</Link>
                          </td>
                          <td className="px-3 py-2">
                            {nationInfo ? (
                              <Link to={`/nation/${nationInfo.id}`} className="text-accent hover:underline text-xs">
                                {getNationFlag(nationInfo.name)} {nationInfo.name}
                              </Link>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {summary?.mostRecentTeam ? (
                              <Link to={`/team/${encodeURIComponent(summary.mostRecentTeam)}`} className="text-accent hover:underline text-xs">
                                {summary.mostRecentTeam}
                              </Link>
                            ) : "—"}
                            {summary?.mostRecentSeason != null && (
                              <span className="text-muted-foreground text-xs"> ({seasonLabel(summary.mostRecentSeason)})</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-sm">{summary?.seasonCount ?? "—"}</td>
                          <td className="px-3 py-2 text-xs">
                            {m.FormerPlayerFlag ? (
                              <span className="text-accent">Former Player</span>
                            ) : (
                              <span className="text-muted-foreground italic">None on record</span>
                            )}
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
