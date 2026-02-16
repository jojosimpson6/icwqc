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

export function EloChart() {
  const [chartData, setChartData] = useState<any[]>([]);
  const [teamNames, setTeamNames] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from("elo")
      .select("*")
      .order("current_game_number", { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        const eloData = data as EloPoint[];
        const names = [...new Set(eloData.map((d) => d.player_name))].sort();
        setTeamNames(names);

        // Build chart data: each game_number gets a row with all team elos
        const gameMap = new Map<number, Record<string, number>>();
        // Start with initial elos of 1000
        const gameZero: Record<string, number> = { game: 0 };
        names.forEach((n) => { gameZero[n] = 1000; });
        gameMap.set(0, gameZero);

        eloData.forEach((d) => {
          const gn = d.current_game_number;
          if (!gameMap.has(gn)) {
            gameMap.set(gn, { game: gn } as any);
          }
          const row = gameMap.get(gn)!;
          (row as any)[d.player_name] = d.new_elo;
        });

        // Fill forward missing values
        const sorted = [...gameMap.entries()].sort((a, b) => a[0] - b[0]);
        const lastKnown: Record<string, number> = {};
        names.forEach((n) => { lastKnown[n] = 1000; });

        const filled = sorted.map(([, row]) => {
          const newRow: Record<string, any> = { game: (row as any).game };
          names.forEach((n) => {
            if ((row as any)[n] !== undefined) {
              lastKnown[n] = (row as any)[n];
            }
            newRow[n] = lastKnown[n];
          });
          return newRow;
        });

        setChartData(filled);
      });
  }, []);

  if (chartData.length === 0) return null;

  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">
          Team Elo Ratings Over Time
        </h3>
      </div>
      <div className="bg-card p-4">
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData}>
            <XAxis dataKey="game" label={{ value: "Match #", position: "insideBottom", offset: -5 }} tick={{ fontSize: 11 }} />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {teamNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={COLORS[i % COLORS.length]}
                dot={false}
                strokeWidth={1.5}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
