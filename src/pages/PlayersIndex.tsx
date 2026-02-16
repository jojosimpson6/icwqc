import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { formatHeight, calculateAge } from "@/lib/helpers";

interface Player {
  PlayerID: number;
  PlayerName: string | null;
  Position: string | null;
  Height: number | null;
  DOB: string | null;
}

export default function PlayersIndex() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    supabase.from("players").select("*").order("PlayerName").then(({ data }) => {
      if (data) setPlayers(data);
    });
  }, []);

  const filtered = players.filter((p) =>
    (p.PlayerName || "").toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-2">
          <h1 className="font-display text-3xl font-bold text-foreground">Players</h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">All registered players</p>
        </div>

        <div className="mb-4">
          <input
            type="text"
            placeholder="Search players..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full max-w-sm px-3 py-2 border border-border rounded bg-card text-sm font-sans focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div className="border border-border rounded overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-sans">
              <thead>
                <tr className="bg-secondary">
                  <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Player</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Position</th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Height</th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Age</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr key={p.PlayerID} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                    <td className="px-3 py-1.5 font-medium text-accent hover:underline">
                      <Link to={`/player/${p.PlayerID}`}>{p.PlayerName}</Link>
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{p.Position}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatHeight(p.Height)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{calculateAge(p.DOB) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
