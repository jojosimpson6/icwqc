import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getNationFlag } from "@/lib/helpers";

interface NationEntry {
  NationID: number;
  Nation: string | null;
  playerCount: number;
}

export default function NationsIndex() {
  const [nations, setNations] = useState<NationEntry[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from("nations").select("NationID, Nation, ValidToDt").order("ValidToDt", { ascending: false }),
      supabase.from("players").select("NationalityID"),
    ]).then(([{ data: nationData }, { data: playerData }]) => {
      // Get most current name per NationID
      const nameMap = new Map<number, string>();
      (nationData || []).forEach((n: any) => {
        if (n.NationID && n.Nation && !nameMap.has(n.NationID)) nameMap.set(n.NationID, n.Nation);
      });

      // Count players per nation
      const countMap = new Map<number, number>();
      (playerData || []).forEach((p: any) => {
        if (p.NationalityID) countMap.set(p.NationalityID, (countMap.get(p.NationalityID) || 0) + 1);
      });

      const entries: NationEntry[] = [];
      nameMap.forEach((name, id) => {
        const count = countMap.get(id) || 0;
        if (count > 0) entries.push({ NationID: id, Nation: name, playerCount: count });
      });

      entries.sort((a, b) => b.playerCount - a.playerCount);
      setNations(entries);
    });
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-2">
          <h1 className="font-display text-3xl font-bold text-foreground">Nations</h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">All nations with registered players</p>
        </div>

        <div className="border border-border rounded overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-sans">
              <thead>
                <tr className="bg-secondary">
                  <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nation</th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Players</th>
                </tr>
              </thead>
              <tbody>
                {nations.map((n, i) => (
                  <tr key={n.NationID} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                    <td className="px-3 py-1.5 font-medium text-accent hover:underline">
                      <Link to={`/nation/${n.NationID}`}>
                        {getNationFlag(n.Nation)} {n.Nation}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">{n.playerCount}</td>
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