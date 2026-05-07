import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { fetchAllRows } from "@/lib/fetchAll";
import { getNationFlag } from "@/lib/helpers";

interface PlayerOption { PlayerID: number; PlayerName: string; Position: string | null; }
interface StatRow {
  SeasonID: number; LeagueName: string; GamesPlayed: number;
  Goals: number; GoldenSnitchCatches: number; KeeperSaves: number;
  KeeperShotsFaced: number; ShotAtt: number; ShotScored: number;
  Position: string; FullName: string;
}
interface PlayerStats { info: PlayerOption; rows: StatRow[]; }

function seasonLabel(id: number) { return `${id - 1}–${String(id).slice(-2)}`; }

function CareerTotals(rows: StatRow[], pos: string | null) {
  const gp = rows.reduce((s, r) => s + (r.GamesPlayed || 0), 0);
  const goals = rows.reduce((s, r) => s + (r.Goals || 0), 0);
  const gsc = rows.reduce((s, r) => s + (r.GoldenSnitchCatches || 0), 0);
  const ks = rows.reduce((s, r) => s + (r.KeeperSaves || 0), 0);
  const ksf = rows.reduce((s, r) => s + (r.KeeperShotsFaced || 0), 0);
  const sa = rows.reduce((s, r) => s + (r.ShotAtt || 0), 0);
  const ss = rows.reduce((s, r) => s + (r.ShotScored || 0), 0);
  return { gp, goals, gsc, ks, ksf, sa, ss, svPct: ksf > 0 ? (ks / ksf * 100) : null, shPct: sa > 0 ? (ss / sa * 100) : null };
}

function PlayerSearch({ onSelect, label, exclude }: { onSelect: (p: PlayerOption) => void; label: string; exclude: number[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerOption[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerOption[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAllRows("players", { select: "PlayerID, PlayerName, Position", order: { column: "PlayerName" } })
      .then(d => setAllPlayers(d as PlayerOption[]));
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const q = query.toLowerCase();
    setResults(allPlayers.filter(p => !exclude.includes(p.PlayerID) && (p.PlayerName || "").toLowerCase().includes(q)).slice(0, 8));
  }, [query, allPlayers, exclude]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-sans font-semibold uppercase tracking-wide text-muted-foreground mb-1">{label}</label>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search player name…"
        className="w-full px-3 py-2 border border-border rounded bg-card text-sm font-sans focus:outline-none focus:ring-2 focus:ring-accent"
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded shadow-lg max-h-64 overflow-y-auto">
          {results.map(p => (
            <button key={p.PlayerID} className="w-full text-left px-3 py-2 text-sm font-sans hover:bg-secondary transition-colors flex items-center justify-between"
              onClick={() => { onSelect(p); setQuery(p.PlayerName || ""); setOpen(false); }}>
              <span className="font-medium">{p.PlayerName}</span>
              <span className="text-xs text-muted-foreground">{p.Position}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [players, setPlayers] = useState<(PlayerOption | null)[]>([null, null]);
  const [stats, setStats] = useState<Map<number, StatRow[]>>(new Map());
  const [loading, setLoading] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"career" | "season">("career");
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  // Read initial players from URL
  useEffect(() => {
    const p1 = searchParams.get("p1");
    const p2 = searchParams.get("p2");
    const loadFromUrl = async (idStr: string | null, idx: number) => {
      if (!idStr) return;
      const id = parseInt(idStr);
      const data = await fetchAllRows("players", { select: "PlayerID, PlayerName, Position", filters: [{ method: "eq", args: ["PlayerID", id] }] });
      if (data[0]) {
        setPlayers(prev => { const next = [...prev]; next[idx] = data[0] as PlayerOption; return next; });
        loadStats(data[0] as PlayerOption);
      }
    };
    loadFromUrl(p1, 0);
    loadFromUrl(p2, 1);
  }, []);

  async function loadStats(player: PlayerOption) {
    if (stats.has(player.PlayerID)) return;
    setLoading(prev => new Set(prev).add(player.PlayerID));
    const data = await fetchAllRows("player_season_stats", {
      select: "SeasonID,LeagueName,GamesPlayed,Goals,GoldenSnitchCatches,KeeperSaves,KeeperShotsFaced,ShotAtt,ShotScored,Position,FullName",
      filters: [{ method: "eq", args: ["PlayerID", player.PlayerID] }],
      order: { column: "SeasonID", ascending: true },
    });
    setStats(prev => new Map(prev).set(player.PlayerID, data as StatRow[]));
    setLoading(prev => { const n = new Set(prev); n.delete(player.PlayerID); return n; });
  }

  function selectPlayer(p: PlayerOption, idx: number) {
    setPlayers(prev => { const next = [...prev]; next[idx] = p; return next; });
    loadStats(p);
    const params = new URLSearchParams(searchParams);
    params.set(idx === 0 ? "p1" : "p2", String(p.PlayerID));
    setSearchParams(params, { replace: true });
  }

  const activePlayers = players.filter((p): p is PlayerOption => p !== null);
  const allSeasons = [...new Set(activePlayers.flatMap(p => (stats.get(p.PlayerID) || []).map(r => r.SeasonID)))].sort();

  // Stat rows to display
  const getRows = (pid: number) => {
    const rows = stats.get(pid) || [];
    if (viewMode === "season" && selectedSeason) return rows.filter(r => r.SeasonID === selectedSeason);
    return rows;
  };

  const COLORS = ["text-blue-600 dark:text-blue-400", "text-red-600 dark:text-red-400"];

  const StatBlock = ({ label, vals, higherBetter = true, fmt = (v: number) => v.toLocaleString() }:
    { label: string; vals: (number | null)[]; higherBetter?: boolean; fmt?: (v: number) => string }) => {
    const best = higherBetter ? Math.max(...vals.filter((v): v is number => v !== null)) : Math.min(...vals.filter((v): v is number => v !== null));
    return (
      <div className="border border-border rounded overflow-hidden">
        <div className="bg-secondary px-3 py-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        </div>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${activePlayers.length}, 1fr)` }}>
          {activePlayers.map((p, i) => {
            const v = vals[i];
            const isBest = v !== null && v === best && activePlayers.length > 1;
            return (
              <div key={p.PlayerID} className={`px-3 py-3 text-center border-r last:border-r-0 border-border ${isBest ? "bg-yellow-500/10" : "bg-card"}`}>
                <p className={`font-mono font-bold text-xl ${isBest ? "text-yellow-600 dark:text-yellow-400" : "text-foreground"}`}>
                  {v !== null ? fmt(v) : "—"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-14 md:pb-0">
      <SiteHeader />
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-3">
          <h1 className="font-display text-3xl font-bold text-foreground">Player Comparison</h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">Compare career statistics side by side</p>
        </div>

        {/* Player selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {[0, 1].map(idx => (
            <div key={idx} className="border border-border rounded p-4 bg-card">
              <PlayerSearch
                label={`Player ${idx + 1}`}
                onSelect={p => selectPlayer(p, idx)}
                exclude={players.filter((p, i): p is PlayerOption => p !== null && i !== idx).map(p => p.PlayerID)}
              />
              {players[idx] && (
                <div className="mt-3 flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${idx === 0 ? "bg-blue-500" : "bg-red-500"}`} />
                  <Link to={`/player/${players[idx]!.PlayerID}`} className="text-sm font-medium text-accent hover:underline">
                    {players[idx]!.PlayerName}
                  </Link>
                  <span className="text-xs text-muted-foreground">{players[idx]!.Position}</span>
                  {loading.has(players[idx]!.PlayerID) && <span className="text-xs text-muted-foreground italic">loading…</span>}
                </div>
              )}
            </div>
          ))}
        </div>

        {activePlayers.length === 0 && (
          <div className="border border-border rounded p-12 text-center text-muted-foreground font-sans">
            <p className="text-lg font-medium mb-2">Select two players to compare</p>
            <p className="text-sm">Search for players by name above</p>
          </div>
        )}

        {activePlayers.length >= 1 && (
          <>
            {/* View mode */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <span className="text-sm font-sans text-muted-foreground font-medium">View:</span>
              {(["career", "season"] as const).map(mode => (
                <button key={mode} onClick={() => setViewMode(mode)}
                  className={`px-3 py-1 text-sm font-sans rounded border transition-colors capitalize ${viewMode === mode ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-secondary"}`}>
                  {mode === "career" ? "Career Totals" : "By Season"}
                </button>
              ))}
              {viewMode === "season" && allSeasons.length > 0 && (
                <select value={selectedSeason ?? ""} onChange={e => setSelectedSeason(e.target.value ? parseInt(e.target.value) : null)}
                  className="px-3 py-1 text-sm bg-card border border-border rounded font-sans">
                  <option value="">All seasons</option>
                  {allSeasons.map(s => <option key={s} value={s}>{seasonLabel(s)}</option>)}
                </select>
              )}
            </div>

            {/* Player name headers */}
            <div className="border border-border rounded overflow-hidden mb-4">
              <div className="grid border-b border-border" style={{ gridTemplateColumns: `repeat(${activePlayers.length}, 1fr)` }}>
                {activePlayers.map((p, i) => {
                  const rows = getRows(p.PlayerID);
                  const seasons = [...new Set(rows.map(r => r.LeagueName))];
                  return (
                    <div key={p.PlayerID} className={`px-4 py-3 border-r last:border-r-0 border-border bg-card ${i === 0 ? "border-t-4 border-t-blue-500" : "border-t-4 border-t-red-500"}`}>
                      <Link to={`/player/${p.PlayerID}`} className="font-display text-lg font-bold text-accent hover:underline block">{p.PlayerName}</Link>
                      <p className="text-xs text-muted-foreground font-sans">{p.Position} · {seasons.length > 0 ? seasons[0] : "—"}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Career/season stat blocks */}
            {(() => {
              const allTotals = activePlayers.map(p => CareerTotals(getRows(p.PlayerID), p.Position));
              const pos = activePlayers[0]?.Position;
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                  <StatBlock label="Games Played" vals={allTotals.map(t => t.gp)} />
                  {(pos === "Chaser" || activePlayers.some(p => p.Position === "Chaser")) && (
                    <StatBlock label="Goals" vals={allTotals.map(t => t.goals)} />
                  )}
                  {(pos === "Chaser" || activePlayers.some(p => p.Position === "Chaser")) && (
                    <StatBlock label="Shot %" vals={allTotals.map(t => t.shPct)} fmt={v => v.toFixed(1) + "%"} />
                  )}
                  {activePlayers.some(p => p.Position === "Seeker") && (
                    <StatBlock label="Snitch Catches" vals={allTotals.map(t => t.gsc)} />
                  )}
                  {activePlayers.some(p => p.Position === "Keeper") && (
                    <StatBlock label="Keeper Saves" vals={allTotals.map(t => t.ks)} />
                  )}
                  {activePlayers.some(p => p.Position === "Keeper") && (
                    <StatBlock label="Save %" vals={allTotals.map(t => t.svPct)} fmt={v => v.toFixed(1) + "%"} />
                  )}
                </div>
              );
            })()}

            {/* Season-by-season breakdown */}
            <div className="border border-border rounded overflow-hidden">
              <div className="bg-table-header px-3 py-2">
                <h3 className="font-display text-sm font-bold text-table-header-foreground">Season-by-Season</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="bg-secondary">
                      <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground sticky-col-header bg-secondary">Season</th>
                      {activePlayers.map((p, i) => (
                        <th key={p.PlayerID} colSpan={3} className={`px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide ${COLORS[i]} border-l border-border`}>
                          {p.PlayerName}
                        </th>
                      ))}
                    </tr>
                    <tr className="bg-secondary/60">
                      <th className="px-3 py-1 text-left text-xs text-muted-foreground sticky-col-header bg-secondary/60">Competition</th>
                      {activePlayers.map(p => (
                        <th key={p.PlayerID} colSpan={3} className="px-3 py-1 text-xs text-muted-foreground border-l border-border">
                          <div className="grid grid-cols-3 text-center gap-1">
                            <span>GP</span>
                            <span>{p.Position === "Seeker" ? "GSC" : p.Position === "Keeper" ? "Sv" : "G"}</span>
                            <span>League</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allSeasons.map((sid, si) => (
                      <tr key={sid} className={`border-t border-border ${si % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                        <td className="px-3 py-1.5 font-mono text-sm font-medium sticky-col bg-inherit">{seasonLabel(sid)}</td>
                        {activePlayers.map(p => {
                          const row = (stats.get(p.PlayerID) || []).find(r => r.SeasonID === sid);
                          const mainStat = row ? (p.Position === "Seeker" ? row.GoldenSnitchCatches : p.Position === "Keeper" ? row.KeeperSaves : row.Goals) : null;
                          return (
                            <td key={p.PlayerID} colSpan={3} className="border-l border-border">
                              {row ? (
                                <div className="grid grid-cols-3 text-center px-3 py-1.5 gap-1">
                                  <span className="font-mono">{row.GamesPlayed}</span>
                                  <span className="font-mono font-medium">{mainStat ?? "—"}</span>
                                  <span className="text-xs text-muted-foreground truncate">{row.LeagueName?.replace(/\b(\w+)\s(\w)/g, "$1").slice(0, 8)}</span>
                                </div>
                              ) : (
                                <div className="text-center text-muted-foreground py-1.5">—</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
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
