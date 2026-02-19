import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const COLORS = [
  "hsl(0, 72%, 45%)", "hsl(220, 60%, 45%)", "hsl(140, 50%, 35%)", "hsl(30, 80%, 50%)",
  "hsl(280, 50%, 50%)", "hsl(180, 50%, 40%)", "hsl(50, 80%, 45%)", "hsl(340, 60%, 50%)",
  "hsl(200, 70%, 40%)", "hsl(100, 50%, 40%)", "hsl(260, 40%, 55%)", "hsl(15, 70%, 45%)",
  "hsl(160, 60%, 35%)",
];

interface EloPoint {
  current_game_number: number;
  new_elo: number;
  player_name: string;
  MatchID: number | null;
}

interface Matchday {
  MatchdayID: number;
  Matchday: string | null;
  LeagueID: number | null;
}

interface LeagueOption {
  LeagueID: number;
  LeagueName: string;
}

// Parse date string as local (not UTC) to avoid timezone-shift display issues
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function EloChart() {
  const [chartData, setChartData] = useState<any[]>([]);
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [hiddenTeams, setHiddenTeams] = useState<Set<string>>(new Set());
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<number | null>(null);
  const [matchdays, setMatchdays] = useState<Matchday[]>([]);
  const [eloData, setEloData] = useState<EloPoint[]>([]);
  // MatchID -> date string (YYYY-MM-DD)
  const [matchDateMap, setMatchDateMap] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    Promise.all([
      supabase.from("leagues").select("LeagueID, LeagueName").order("LeagueTier").order("LeagueName"),
      supabase.from("elo").select("*").order("current_game_number", { ascending: true }).limit(5000),
      supabase.from("matchdays").select("*").order("MatchdayID", { ascending: true }),
    ]).then(([{ data: leagueData }, { data: eData }, { data: mdData }]) => {
      if (leagueData) setLeagues(leagueData as LeagueOption[]);
      if (mdData) setMatchdays(mdData as Matchday[]);

      const elo = (eData || []) as EloPoint[];
      setEloData(elo);

      // Get unique MatchIDs from elo view, then look up WeekID in results -> date in matchdays
      const matchIds = [...new Set(elo.map(e => e.MatchID).filter(Boolean))] as number[];
      if (matchIds.length > 0 && mdData) {
        // Build WeekID -> Matchday date
        const weekToDate = new Map<number, string>();
        (mdData as Matchday[]).forEach(md => {
          if (md.MatchdayID && md.Matchday) weekToDate.set(md.MatchdayID, md.Matchday);
        });

        // Fetch results in batches of 1000
        supabase.from("results").select("MatchID,WeekID").in("MatchID", matchIds.slice(0, 1000))
          .then(({ data: resultsData }) => {
            const mMap = new Map<number, string>();
            (resultsData || []).forEach((r: { MatchID: number; WeekID: number | null }) => {
              if (r.MatchID && r.WeekID) {
                const date = weekToDate.get(r.WeekID);
                if (date) mMap.set(r.MatchID, date);
              }
            });
            setMatchDateMap(mMap);
          });
      }
    });
  }, []);

  // Build chart when data or filters change
  useEffect(() => {
    if (eloData.length === 0 || matchdays.length === 0) return;

    // Build matchdayID -> leagueId map (for filtering by league)
    const mdLeagueMap = new Map<number, number | null>();
    matchdays.forEach((md) => mdLeagueMap.set(md.MatchdayID, md.LeagueID));

    // For filtering by league: a match belongs to a league if its WeekID maps to that league's matchdays
    // We use matchDateMap keys (MatchIDs) and filter elo by league via MatchID->WeekID->LeagueID
    let filteredElo = eloData;
    if (selectedLeague !== null) {
      // Valid matchdays for this league
      const validMatchdayIds = new Set<number>(
        matchdays.filter(md => md.LeagueID === selectedLeague).map(md => md.MatchdayID)
      );
      // We need MatchID->WeekID to filter. Build from matchDateMap source data.
      // Approximate: use current_game_number (which is MatchdayID in the elo view's logic)
      filteredElo = eloData.filter((d) => validMatchdayIds.has(d.current_game_number));
    }

    const names = [...new Set(filteredElo.map((d) => d.player_name))].sort();
    setTeamNames(names);

    // Build chart keyed by date string — use MatchID -> date from matchDateMap first,
    // fall back to current_game_number -> matchday date
    const mdMap = new Map<number, string>();
    matchdays.forEach((md) => {
      if (md.Matchday) mdMap.set(md.MatchdayID, md.Matchday);
    });

    const gameMap = new Map<string, Record<string, any>>();

    // Initial row (before any games)
    const initDate = "1994-08-01";
    const gameZero: Record<string, any> = { date: initDate };
    names.forEach((n) => { gameZero[n] = 1000; });
    gameMap.set(initDate, gameZero);

    filteredElo.forEach((d) => {
      // Prefer MatchID-based date; fall back to current_game_number as matchday id
      const dateKey = (d.MatchID && matchDateMap.get(d.MatchID))
        || mdMap.get(d.current_game_number)
        || `Game ${d.current_game_number}`;

      if (!gameMap.has(dateKey)) {
        gameMap.set(dateKey, { date: dateKey });
      }
      gameMap.get(dateKey)![d.player_name] = d.new_elo;
    });

    // Sort by date and fill forward
    const sorted = [...gameMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const lastKnown: Record<string, number> = {};
    names.forEach((n) => { lastKnown[n] = 1000; });

    const filled = sorted.map(([, row]) => {
      const newRow: Record<string, any> = { date: row.date };
      names.forEach((n) => {
        if (row[n] !== undefined) lastKnown[n] = row[n];
        newRow[n] = lastKnown[n];
      });
      return newRow;
    });

    setChartData(filled);
  }, [eloData, matchdays, selectedLeague, matchDateMap]);

  const toggleTeam = (name: string) => {
    setHiddenTeams((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (chartData.length === 0) return null;

  const formatDate = (d: string) => {
    if (!d || d.startsWith("Game")) return d;
    return parseLocalDate(d).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  };

  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">
          Team Elo Ratings Over Time
        </h3>
        <select
          value={selectedLeague ?? ""}
          onChange={(e) => setSelectedLeague(e.target.value ? parseInt(e.target.value) : null)}
          className="text-xs bg-popover text-popover-foreground border border-border rounded px-2 py-1 font-sans"
        >
          <option value="">All Leagues</option>
          {leagues.map((l) => (
            <option key={l.LeagueID} value={l.LeagueID}>{l.LeagueName}</option>
          ))}
        </select>
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
                if (!label || String(label).startsWith("Game")) return label;
                return parseLocalDate(String(label)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} onClick={(e) => toggleTeam(String(e.dataKey))} />
            {teamNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={COLORS[i % COLORS.length]}
                dot={false}
                strokeWidth={1.5}
                hide={hiddenTeams.has(name)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
