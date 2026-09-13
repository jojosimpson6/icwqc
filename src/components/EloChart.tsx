import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = [
  "hsl(0, 72%, 45%)", "hsl(220, 60%, 45%)", "hsl(140, 50%, 35%)", "hsl(30, 80%, 50%)",
  "hsl(280, 50%, 50%)", "hsl(180, 50%, 40%)", "hsl(50, 80%, 45%)", "hsl(340, 60%, 50%)",
  "hsl(200, 70%, 40%)", "hsl(100, 50%, 40%)", "hsl(260, 40%, 55%)", "hsl(15, 70%, 45%)",
  "hsl(160, 60%, 35%)",
];

interface EloNewPoint {
  FullName: string;
  Matchday: string;
  elo_rating: number;
}

interface LeagueOption {
  LeagueID: number;
  LeagueName: string;
  LeagueTier?: number | null;
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function EloChart({ scope = "club" }: { scope?: "club" | "intl" }) {
  const [chartData, setChartData] = useState<any[]>([]);
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<number | null>(null);
  const [eloData, setEloData] = useState<EloNewPoint[]>([]);
  const [teamLeagueMap, setTeamLeagueMap] = useState<Map<string, number>>(new Map());
  // The full history can span decades; defaulting to the last ~2 years and
  // widening on demand (instead of always fetching everything) is what
  // actually keeps this page fast — a narrower default *label* alone
  // wouldn't help if the fetch itself still pulled all-time data.
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
  const [trueMinDate, setTrueMinDate] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [availableDateRange, setAvailableDateRange] = useState<{ min: string; max: string }>({ min: "", max: "" });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    (async () => {
      // Find the true earliest date once (cheap: one column, one row) so the
      // date picker can offer the full range even before it's loaded.
      const { data: earliestRow } = await supabase.from("elo_history").select("Matchday").order("Matchday", { ascending: true }).limit(1);
      const trueMin = earliestRow?.[0]?.Matchday || "";
      setTrueMinDate(trueMin);

      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const defaultFrom = trueMin && trueMin > twoYearsAgo.toISOString().slice(0, 10) ? trueMin : twoYearsAgo.toISOString().slice(0, 10);

      const [{ data: leagueData }, eData, { data: teamsData }] = await Promise.all([
        supabase.from("leagues").select("LeagueID, LeagueName, LeagueTier").order("LeagueTier").order("LeagueName"),
        fetchAllRows("elo_history", { select: "TeamID,PostElo,Matchday", filters: [{ method: "gte", args: ["Matchday", defaultFrom] }], order: { column: "Matchday", ascending: true } }),
        supabase.from("teams").select("TeamID, FullName, LeagueID"),
      ]);
      if (leagueData) setLeagues(leagueData as LeagueOption[]);

      const tlm = new Map<string, number>();
      const teamIdToName = new Map<number, string>();
      (teamsData || []).forEach((t: any) => {
        if (t.FullName && t.LeagueID) tlm.set(t.FullName, t.LeagueID);
        if (t.TeamID && t.FullName) { teamIdToName.set(t.TeamID, t.FullName); }
      });
      setTeamLeagueMap(tlm);

      const elo: EloNewPoint[] = (eData || [])
        .filter((d: any) => d.TeamID && d.Matchday && d.PostElo != null)
        .map((d: any) => ({
          FullName: teamIdToName.get(d.TeamID) || `Team#${d.TeamID}`,
          Matchday: d.Matchday,
          elo_rating: d.PostElo,
        }));
      setEloData(elo);
      setLoadedFrom(defaultFrom);
      setStartDate(defaultFrom);
    })();
  }, []);

  // If the user picks a start date earlier than what's currently loaded,
  // widen the fetch instead of silently clipping to the loaded window.
  useEffect(() => {
    if (!loadedFrom || !startDate || startDate >= loadedFrom) return;
    fetchAllRows<{ TeamID: number; PostElo: number; Matchday: string }>("elo_history", {
      select: "TeamID,PostElo,Matchday",
      filters: [{ method: "gte", args: ["Matchday", startDate] }, { method: "lt", args: ["Matchday", loadedFrom] }],
      order: { column: "Matchday", ascending: true },
    }).then(extra => {
      if (!extra || extra.length === 0) { setLoadedFrom(startDate); return; }
      // Need FullName lookups again for the newly-fetched rows
      supabase.from("teams").select("TeamID, FullName").then(({ data: teamsData }) => {
        const teamIdToName = new Map<number, string>();
        (teamsData || []).forEach((t: any) => { if (t.TeamID && t.FullName) teamIdToName.set(t.TeamID, t.FullName); });
        const newPoints: EloNewPoint[] = extra
          .filter(d => d.TeamID && d.Matchday && d.PostElo != null)
          .map(d => ({ FullName: teamIdToName.get(d.TeamID) || `Team#${d.TeamID}`, Matchday: d.Matchday, elo_rating: d.PostElo }));
        setEloData(prev => [...newPoints, ...prev]);
        setLoadedFrom(startDate);
      });
    });
  }, [startDate, loadedFrom]);

  // Only offer leagues/teams matching the page's club-vs-international scope
  // (a domestic league's roster is always club, a tier-0 competition's is
  // always national, so this is a clean split without needing per-team lookups).
  const scopedLeagues = leagues.filter(l => scope === "club" ? (l.LeagueTier ?? 0) > 0 : (l.LeagueTier ?? 0) === 0);

  useEffect(() => {
    if (eloData.length === 0) return;

    const scopedLeagueIds = new Set(scopedLeagues.map(l => l.LeagueID));
    let filtered = eloData.filter(d => {
      const lid = teamLeagueMap.get(d.FullName);
      return lid !== undefined && scopedLeagueIds.has(lid);
    });
    if (selectedLeague !== null) {
      const leagueTeams = new Set<string>();
      teamLeagueMap.forEach((lid, name) => {
        if (lid === selectedLeague) leagueTeams.add(name);
      });
      filtered = filtered.filter(d => leagueTeams.has(d.FullName));
    }

    const names = [...new Set(filtered.map(d => d.FullName))].sort();
    setTeamNames(names);
    // Auto-select all teams when league changes
    setSelectedTeams(new Set(names));

    const gameMap = new Map<string, Record<string, any>>();
    filtered.forEach(d => {
      const dateKey = d.Matchday;
      if (!gameMap.has(dateKey)) gameMap.set(dateKey, { date: dateKey });
      gameMap.get(dateKey)![d.FullName] = d.elo_rating;
    });

    const sorted = [...gameMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    if (sorted.length > 0) {
      const maxD = sorted[sorted.length - 1][0];
      // min comes from the true full-history bound (fetched separately),
      // not just whatever's currently loaded, so the picker always shows
      // the real earliest option even before that range is fetched.
      setAvailableDateRange({ min: trueMinDate || sorted[0][0], max: maxD });
      if (!endDate) setEndDate(maxD);
    }

    const effStart = startDate || "";
    const effEnd = endDate || "9999-12-31";
    const dateFiltered = sorted.filter(([dateKey]) => dateKey >= effStart && dateKey <= effEnd);

    const lastKnown: Record<string, number> = {};
    names.forEach(n => { lastKnown[n] = 5000; });

    sorted.forEach(([dateKey, row]) => {
      if (dateKey >= effStart) return;
      names.forEach(n => {
        if (row[n] !== undefined) lastKnown[n] = row[n];
      });
    });

    const filled = dateFiltered.map(([, row]) => {
      const newRow: Record<string, any> = { date: row.date };
      names.forEach(n => {
        if (row[n] !== undefined) lastKnown[n] = row[n];
        newRow[n] = lastKnown[n];
      });
      return newRow;
    });

    setChartData(filled);
  }, [eloData, selectedLeague, teamLeagueMap, startDate, endDate, scope, trueMinDate]);

  // Reset the league filter if it no longer matches the active scope
  useEffect(() => {
    if (selectedLeague !== null && !scopedLeagues.some(l => l.LeagueID === selectedLeague)) {
      setSelectedLeague(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const toggleTeam = (name: string) => {
    setSelectedTeams(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAll = () => setSelectedTeams(new Set(teamNames));
  const selectNone = () => setSelectedTeams(new Set());

  if (chartData.length === 0) return null;

  const formatDate = (d: string) => {
    if (!d) return d;
    return parseLocalDate(d).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  };

  const visibleTeams = teamNames.filter(n => selectedTeams.has(n));

  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">
          Team Elo Ratings Over Time
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedLeague ?? ""}
            onChange={(e) => setSelectedLeague(e.target.value ? parseInt(e.target.value) : null)}
            className="text-xs bg-popover text-popover-foreground border border-border rounded px-2 py-1 font-sans"
          >
            <option value="">{scope === "club" ? "All Domestic Leagues" : "All International Competitions"}</option>
            {scopedLeagues.map((l) => (
              <option key={l.LeagueID} value={l.LeagueID}>{l.LeagueName}</option>
            ))}
          </select>

          {/* Team selector dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(o => !o)}
              className="text-xs bg-popover text-popover-foreground border border-border rounded px-2 py-1 font-sans flex items-center gap-1"
            >
              Teams ({selectedTeams.size}/{teamNames.length})
              <span className="text-[10px]">▼</span>
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded shadow-lg w-56 max-h-64 overflow-y-auto">
                <div className="px-2 py-1.5 border-b border-border flex gap-2">
                  <button onClick={selectAll} className="text-xs text-accent hover:underline font-sans">All</button>
                  <button onClick={selectNone} className="text-xs text-accent hover:underline font-sans">None</button>
                </div>
                {teamNames.map((name, i) => (
                  <label
                    key={name}
                    className={`flex items-center gap-2 px-2 py-1 text-xs font-sans cursor-pointer hover:bg-highlight/20 ${i % 2 === 1 ? "bg-secondary/30" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTeams.has(name)}
                      onChange={() => toggleTeam(name)}
                      className="accent-[hsl(var(--accent))] w-3 h-3"
                    />
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: COLORS[teamNames.indexOf(name) % COLORS.length] }}
                    />
                    <span className="truncate text-popover-foreground">{name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <input
            type="date"
            value={startDate}
            min={availableDateRange.min}
            max={availableDateRange.max}
            onChange={e => setStartDate(e.target.value)}
            className="text-xs bg-popover text-popover-foreground border border-border rounded px-2 py-1 font-sans"
          />
          <span className="text-xs text-table-header-foreground">to</span>
          <input
            type="date"
            value={endDate}
            min={availableDateRange.min}
            max={availableDateRange.max}
            onChange={e => setEndDate(e.target.value)}
            className="text-xs bg-popover text-popover-foreground border border-border rounded px-2 py-1 font-sans"
          />
        </div>
      </div>
      <div className="bg-card p-4">
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData}>
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11 }}
              type="category"
              interval="preserveStartEnd"
            />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ fontSize: 12 }}
              labelFormatter={(label) => {
                if (!label) return label;
                return parseLocalDate(String(label)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
              }}
              // Recharts renders tooltip rows in the order the <Line>s were
              // declared (alphabetical, since that's how the legend/lines
              // list is built) — sort by the actual Elo value at this point
              // instead, highest first, so the tooltip reads like a ranking.
              itemSorter={(item) => -(typeof item.value === "number" ? item.value : 0)}
            />
            {visibleTeams.map((name) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={COLORS[teamNames.indexOf(name) % COLORS.length]}
                dot={false}
                strokeWidth={1.5}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        {/* Compact legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 px-1">
          {visibleTeams.map(name => (
            <span key={name} className="flex items-center gap-1 text-[10px] font-sans text-muted-foreground">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[teamNames.indexOf(name) % COLORS.length] }} />
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}