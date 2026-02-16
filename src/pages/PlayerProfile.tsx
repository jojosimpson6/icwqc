import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { formatHeight, calculateAge, formatDate, getNationFlag } from "@/lib/helpers";

interface Player {
  PlayerID: number;
  PlayerName: string | null;
  FirstName: string | null;
  LastName: string | null;
  Position: string | null;
  Height: number | null;
  Weight: number | null;
  DOB: string | null;
  Handedness: string | null;
  Gender: string | null;
  NationalityID: number | null;
}

interface StatLine {
  SeasonID: number | null;
  LeagueName: string | null;
  FullName: string | null;
  GamesPlayed: number | null;
  Goals: number | null;
  GoldenSnitchCatches: number | null;
  KeeperSaves: number | null;
  KeeperShotsFaced: number | null;
  Position: string | null;
}

export default function PlayerProfile() {
  const { id } = useParams();
  const [player, setPlayer] = useState<Player | null>(null);
  const [nation, setNation] = useState<string>("");
  const [stats, setStats] = useState<StatLine[]>([]);
  const [mostRecentTeam, setMostRecentTeam] = useState<string>("");

  useEffect(() => {
    if (!id) return;
    const pid = parseInt(id);

    supabase.from("players").select("*").eq("PlayerID", pid).single().then(({ data }) => {
      if (data) {
        setPlayer(data);
        if (data.NationalityID) {
          supabase.from("nations").select("Nation").eq("NationID", data.NationalityID).order("ValidToDt", { ascending: false }).limit(1).then(({ data: nd }) => {
            if (nd?.[0]) setNation(nd[0].Nation || "");
          });
        }
      }
    });

    supabase.from("stats").select("*").eq("PlayerName", "").then(() => {
      // We need to match by player - stats view uses PlayerName, so we need to get it first
    });

    // Get stats for this player - we'll match after getting player name
    supabase.from("players").select("PlayerName").eq("PlayerID", pid).single().then(({ data: pData }) => {
      if (pData?.PlayerName) {
        supabase.from("stats").select("*").eq("PlayerName", pData.PlayerName).order("SeasonID", { ascending: true }).then(({ data: sData }) => {
          if (sData) {
            setStats(sData as StatLine[]);
            if (sData.length > 0) {
              setMostRecentTeam(sData[sData.length - 1].FullName || "");
            }
          }
        });
      }
    });
  }, [id]);

  if (!player) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SiteHeader />
        <main className="flex-1 container py-8">
          <p className="text-muted-foreground font-sans">Loading player...</p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const age = calculateAge(player.DOB);

  // Career totals
  const careerTotals = {
    gp: stats.reduce((s, r) => s + (r.GamesPlayed || 0), 0),
    goals: stats.reduce((s, r) => s + (r.Goals || 0), 0),
    gsc: stats.reduce((s, r) => s + (r.GoldenSnitchCatches || 0), 0),
    saves: stats.reduce((s, r) => s + (r.KeeperSaves || 0), 0),
    shotsFaced: stats.reduce((s, r) => s + (r.KeeperShotsFaced || 0), 0),
  };

  // Stats by competition
  const byCompetition = new Map<string, typeof careerTotals>();
  stats.forEach((s) => {
    const key = s.LeagueName || "Unknown";
    const existing = byCompetition.get(key) || { gp: 0, goals: 0, gsc: 0, saves: 0, shotsFaced: 0 };
    existing.gp += s.GamesPlayed || 0;
    existing.goals += s.Goals || 0;
    existing.gsc += s.GoldenSnitchCatches || 0;
    existing.saves += s.KeeperSaves || 0;
    existing.shotsFaced += s.KeeperShotsFaced || 0;
    byCompetition.set(key, existing);
  });

  const isKeeper = player.Position === "Keeper";
  const isSeeker = player.Position === "Seeker";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-4">
          <div className="flex items-start gap-6">
            {/* Portrait placeholder */}
            <div className="w-32 h-40 bg-muted border border-border rounded flex items-center justify-center shrink-0">
              <span className="text-4xl text-muted-foreground">👤</span>
            </div>
            <div className="flex-1">
              <h1 className="font-display text-3xl font-bold text-foreground">
                {player.FirstName} {player.LastName}
              </h1>
              <p className="text-lg text-muted-foreground font-sans mt-1">
                {player.Position} · {mostRecentTeam}
              </p>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-sans">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Born</p>
                  <p className="font-medium">{formatDate(player.DOB)}{age !== null && ` (age ${age})`}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Nationality</p>
                  <p className="font-medium">{getNationFlag(nation)} {nation}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Height / Weight</p>
                  <p className="font-medium">{formatHeight(player.Height)} · {player.Weight ? `${player.Weight} lbs` : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Handedness</p>
                  <p className="font-medium">{player.Handedness === "R" ? "Right" : player.Handedness === "L" ? "Left" : player.Handedness || "—"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Year-by-year stats */}
        <div className="space-y-6">
          <div className="border border-border rounded overflow-hidden">
            <div className="bg-table-header px-3 py-2">
              <h3 className="font-display text-sm font-bold text-table-header-foreground">Season-by-Season Statistics</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-sans">
                <thead>
                  <tr className="bg-secondary">
                    <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Season</th>
                    <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Competition</th>
                    <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team</th>
                    <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GP</th>
                    {!isKeeper && !isSeeker && <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Goals</th>}
                    {isSeeker && <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GSC</th>}
                    {isKeeper && (
                      <>
                        <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saves</th>
                        <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">SF</th>
                        <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sv%</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s, i) => (
                    <tr key={i} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                      <td className="px-3 py-1.5 font-mono">{s.SeasonID}</td>
                      <td className="px-3 py-1.5">{s.LeagueName}</td>
                      <td className="px-3 py-1.5 text-accent">{s.FullName}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{s.GamesPlayed}</td>
                      {!isKeeper && !isSeeker && <td className="px-3 py-1.5 text-right font-mono">{s.Goals || 0}</td>}
                      {isSeeker && <td className="px-3 py-1.5 text-right font-mono">{s.GoldenSnitchCatches || 0}</td>}
                      {isKeeper && (
                        <>
                          <td className="px-3 py-1.5 text-right font-mono">{s.KeeperSaves || 0}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{s.KeeperShotsFaced || 0}</td>
                          <td className="px-3 py-1.5 text-right font-mono">
                            {s.KeeperShotsFaced ? ((s.KeeperSaves || 0) / s.KeeperShotsFaced * 100).toFixed(1) + "%" : "—"}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {/* Career totals row */}
                  <tr className="border-t-2 border-primary bg-secondary font-bold">
                    <td className="px-3 py-1.5" colSpan={3}>Career Totals</td>
                    <td className="px-3 py-1.5 text-right font-mono">{careerTotals.gp}</td>
                    {!isKeeper && !isSeeker && <td className="px-3 py-1.5 text-right font-mono">{careerTotals.goals}</td>}
                    {isSeeker && <td className="px-3 py-1.5 text-right font-mono">{careerTotals.gsc}</td>}
                    {isKeeper && (
                      <>
                        <td className="px-3 py-1.5 text-right font-mono">{careerTotals.saves}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{careerTotals.shotsFaced}</td>
                        <td className="px-3 py-1.5 text-right font-mono">
                          {careerTotals.shotsFaced ? ((careerTotals.saves / careerTotals.shotsFaced) * 100).toFixed(1) + "%" : "—"}
                        </td>
                      </>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* By competition */}
          <div className="border border-border rounded overflow-hidden">
            <div className="bg-table-header px-3 py-2">
              <h3 className="font-display text-sm font-bold text-table-header-foreground">By Competition</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-sans">
                <thead>
                  <tr className="bg-secondary">
                    <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Competition</th>
                    <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GP</th>
                    {!isKeeper && !isSeeker && <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Goals</th>}
                    {isSeeker && <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GSC</th>}
                    {isKeeper && (
                      <>
                        <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saves</th>
                        <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">SF</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {[...byCompetition.entries()].map(([comp, totals], i) => (
                    <tr key={comp} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                      <td className="px-3 py-1.5">{comp}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{totals.gp}</td>
                      {!isKeeper && !isSeeker && <td className="px-3 py-1.5 text-right font-mono">{totals.goals}</td>}
                      {isSeeker && <td className="px-3 py-1.5 text-right font-mono">{totals.gsc}</td>}
                      {isKeeper && (
                        <>
                          <td className="px-3 py-1.5 text-right font-mono">{totals.saves}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{totals.shotsFaced}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
