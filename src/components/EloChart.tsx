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

export function EloChart() {
  const [chartData, setChartData] = useState<any[]>([]);
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [hiddenTeams, setHiddenTeams] = useState<Set<string>>(new Set());
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<number | null>(null);
  const [matchdays, setMatchdays] = useState<Matchday[]>([]);
  const [eloData, setEloData] = useState<EloPoint[]>([]);

  // Load leagues and raw data on mount
  useEffect(() => {
    Promise.all([
      supabase.from("leagues").select("LeagueID, LeagueName").order("LeagueTier").order("LeagueName"),
      supabase.from("elo").select("*").order("current_game_number", { ascending: true }),
      supabase.from("matchdays").select("*").order("MatchdayID", { ascending: true }),
    ]).then(([{ data: leagueData }, { data: eData }, { data: mdData }]) => {
      if (leagueData) setLeagues(leagueData as LeagueOption[]);
      if (eData) setEloData(eData as EloPoint[]);
      if (mdData) setMatchdays(mdData as Matchday[]);
    });
  }, []);

  // Build chart when data or filters change
  useEffect(() => {
    if (eloData.length === 0 || matchdays.length === 0) return;

    // Build matchday map: game_number -> date
    const mdMap = new Map<number, { date: string; leagueId: number | null }>();
    matchdays.forEach((md) => {
      mdMap.set(md.MatchdayID, { date: md.Matchday || "", leagueId: md.LeagueID });
    });

    // Filter by league if selected
    let filteredElo = eloData;
    if (selectedLeague !== null) {
      const validGameNumbers = new Set<number>();
      matchdays.forEach((md) => {
        if (md.LeagueID === selectedLeague) validGameNumbers.add(md.MatchdayID);
      });
      filteredElo = eloData.filter((d) => validGameNumbers.has(d.current_game_number));
    }

    const names = [...new Set(filteredElo.map((d) => d.player_name))].sort();
    setTeamNames(names);

    // Build chart data keyed by date
    const gameMap = new Map<string, Record<string, any>>();

    // Initial row
    const initDate = "1994-08-01";
    const gameZero: Record<string, any> = { date: initDate };
    names.forEach((n) => { gameZero[n] = 1000; });
    gameMap.set(initDate, gameZero);

    filteredElo.forEach((d) => {
      const md = mdMap.get(d.current_game_number);
      const dateKey = md?.date || `Game ${d.current_game_number}`;
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
  }, [eloData, matchdays, selectedLeague]);

  const toggleTeam = (name: string) => {
    setHiddenTeams((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const visibleTeams = teamNames.filter((n) => !hiddenTeams.has(n));

  if (chartData.length === 0) return null;

  const formatDate = (d: string) => {
    if (!d || d.startsWith("Game")) return d;
    const date = new Date(d);
    return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
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
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ fontSize: 12 }}
              labelFormatter={(label) => {
                if (!label || String(label).startsWith("Game")) return label;
                return new Date(String(label)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
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
