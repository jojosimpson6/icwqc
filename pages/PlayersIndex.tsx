import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { formatHeight, calculateAge, getNationFlag } from "@/lib/helpers";
import { ChevronUp, ChevronDown } from "lucide-react";

interface Player {
  PlayerID: number;
  PlayerName: string | null;
  Position: string | null;
  Height: number | null;
  DOB: string | null;
  NationalityID: number | null;
}

type SortKey = "name" | "position" | "nationality" | "team" | "height" | "age";
type SortDir = "asc" | "desc";

export default function PlayersIndex() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState("");
  const [posFilter, setPosFilter] = useState("All");
  const [natFilter, setNatFilter] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [nations, setNations] = useState<Map<number, { name: string; id: number }>>(new Map());
  const [recentTeams, setRecentTeams] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchAllRows<Player>("players", { select: "PlayerID, PlayerName, Position, Height, DOB, NationalityID", order: { column: "PlayerName" } }),
      supabase.from("nations").select("NationID, Nation, ValidToDt").order("ValidToDt", { ascending: false }),
      fetchAllRows("player_season_stats", { select: "PlayerName, TeamFullName, SeasonID", order: { column: "SeasonID", ascending: false } }),
    ]).then(([playerData, { data: nationData }, statsData]) => {
      setPlayers(playerData);

      const nm = new Map<number, { name: string; id: number }>();
      (nationData || []).forEach((n: any) => {
        if (n.NationID && n.Nation && !nm.has(n.NationID)) nm.set(n.NationID, { name: n.Nation, id: n.NationID });
      });
      setNations(nm);

      const rt = new Map<string, string>();
      (statsData || []).forEach((s: any) => {
        if (s.PlayerName && s.FullName && !rt.has(s.PlayerName)) rt.set(s.PlayerName, s.TeamFullName);
      });
      setRecentTeams(rt);
      setLoading(false);
    });
  }, []);

  const positions = useMemo(() => ["All", ...new Set(players.map(p => p.Position).filter(Boolean) as string[])].sort(), [players]);
  const nationNames = useMemo(() => {
    const seen = new Set<string>();
    const opts = ["All"];
    players.forEach(p => {
      const n = p.NationalityID ? nations.get(p.NationalityID)?.name : null;
      if (n && !seen.has(n)) { seen.add(n); opts.push(n); }
    });
    return opts.sort((a, b) => a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b));
  }, [players, nations]);

  const filtered = useMemo(() => {
    let list = players.filter(p => {
      const name = (p.PlayerName || "").toLowerCase();
      const q = filter.toLowerCase();
      if (q && !name.includes(q)) return false;
      if (posFilter !== "All" && p.Position !== posFilter) return false;
      if (natFilter !== "All") {
        const natInfo = p.NationalityID ? nations.get(p.NationalityID) : null;
        if (!natInfo || natInfo.name !== natFilter) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      let va: string | number = "", vb: string | number = "";
      if (sortKey === "name") { va = a.PlayerName || ""; vb = b.PlayerName || ""; }
      else if (sortKey === "position") { va = a.Position || ""; vb = b.Position || ""; }
      else if (sortKey === "nationality") {
        va = (a.NationalityID ? nations.get(a.NationalityID)?.name : "") || "";
        vb = (b.NationalityID ? nations.get(b.NationalityID)?.name : "") || "";
      }
      else if (sortKey === "team") {
        va = (a.PlayerName ? recentTeams.get(a.PlayerName) : "") || "";
        vb = (b.PlayerName ? recentTeams.get(b.PlayerName) : "") || "";
      }
      else if (sortKey === "height") { va = a.Height || 0; vb = b.Height || 0; }
      else if (sortKey === "age") {
        va = a.DOB ? new Date(a.DOB).getTime() : 0;
        vb = b.DOB ? new Date(b.DOB).getTime() : 0;
      }
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [players, filter, posFilter, natFilter, sortKey, sortDir, nations, recentTeams]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
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
          <h1 className="font-display text-3xl font-bold text-foreground">Players</h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">
            {loading ? "Loading…" : `${filtered.length} of ${players.length} players`}
          </p>
        </div>

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
            <select value={posFilter} onChange={e => setPosFilter(e.target.value)}
              className="px-3 py-2 border border-border rounded bg-card text-sm font-sans focus:outline-none focus:ring-2 focus:ring-accent">
              {positions.map(p => <option key={p} value={p}>{p === "All" ? "All Positions" : p}</option>)}
            </select>
          </div>
          <div>
            <select value={natFilter} onChange={e => setNatFilter(e.target.value)}
              className="px-3 py-2 border border-border rounded bg-card text-sm font-sans focus:outline-none focus:ring-2 focus:ring-accent">
              {nationNames.map(n => <option key={n} value={n}>{n === "All" ? "All Nations" : n}</option>)}
            </select>
          </div>
          {(filter || posFilter !== "All" || natFilter !== "All") && (
            <button onClick={() => { setFilter(""); setPosFilter("All"); setNatFilter("All"); }}
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
                  <Th col="name"        label="Player" />
                  <Th col="position"    label="Pos" />
                  <Th col="nationality" label="Nationality" />
                  <Th col="team"        label="Team" />
                  <Th col="height"      label="Height" right />
                  <Th col="age"         label="Age" right />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground italic">Loading players…</td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground italic">No players match your filters.</td></tr>
                )}
                {filtered.map((p, i) => {
                  const nationInfo = p.NationalityID ? nations.get(p.NationalityID) : null;
                  const team = p.PlayerName ? recentTeams.get(p.PlayerName) : null;
                  return (
                    <tr key={p.PlayerID} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20 transition-colors`}>
                      <td className="px-3 py-2 font-medium">
                        <Link to={`/player/${p.PlayerID}`} className="text-accent hover:underline">{p.PlayerName}</Link>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{p.Position || "—"}</td>
                      <td className="px-3 py-2">
                        {nationInfo ? (
                          <Link to={`/nation/${nationInfo.id}`} className="text-accent hover:underline text-xs">
                            {getNationFlag(nationInfo.name)} {nationInfo.name}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {team ? (
                          <Link to={`/team/${encodeURIComponent(team)}`} className="text-accent hover:underline text-xs">{team}</Link>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm">{formatHeight(p.Height)}</td>
                      <td className="px-3 py-2 text-right font-mono text-sm">{calculateAge(p.DOB) ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
