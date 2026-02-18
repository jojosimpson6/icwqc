import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
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

interface LeagueLeaderEntry {
  SeasonID: number;
  LeagueName: string;
  stat: string;
  value: number;
  rank: number;
}

// League abbreviations
const leagueAbbr: Record<string, string> = {
  "British and Irish Quidditch League": "BIQL",
  "National Quidditch Association": "NQA",
  "Ligue Francaise": "LF",
  "Nordiska Ligan": "NL",
  "Eastern European League": "EEL",
  "Australian Quidditch League": "AQL",
  "Nippon Professional Quidditch": "NPQ",
  "Sudaconditch": "SC",
  "African Super League": "ASL",
  "Liga Mexicana": "LM",
  "Banerjee Cup": "BC",
  "Chinese Association Quidditch League": "CAQL",
  "Balkan Championship": "BKC",
  "East African Regional League": "EARL",
  "European Cup": "EC",
  "All-Africa Cup": "AAC",
  "Americas Cup": "AC",
  "Pacific Cup": "PC",
  "Champions League": "CL",
  "Quidditch World Cup": "QWC",
};

function abbrevLeague(name: string | null): string {
  if (!name) return "—";
  return leagueAbbr[name] || name;
}

function seasonLabel(id: number | null): string {
  if (!id) return "—";
  return `${id - 1}–${String(id).slice(-2)}`;
}

function ageAtSeason(dob: string | null, seasonId: number | null): string {
  if (!dob || !seasonId) return "—";
  const birth = new Date(dob);
  // Season ends around June of the season year
  const age = seasonId - birth.getFullYear();
  return String(age);
}

export default function PlayerProfile() {
  const { id } = useParams();
  const [player, setPlayer] = useState<Player | null>(null);
  const [nation, setNation] = useState<string>("");
  const [stats, setStats] = useState<StatLine[]>([]);
  const [mostRecentTeam, setMostRecentTeam] = useState<string>("");
  const [leagueLeaders, setLeagueLeaders] = useState<LeagueLeaderEntry[]>([]);
  // All stats for the league in each season (for bolding league leaders)
  const [leagueMaxes, setLeagueMaxes] = useState<Map<string, Map<string, number>>>(new Map());

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

    supabase.from("players").select("PlayerName").eq("PlayerID", pid).single().then(({ data: pData }) => {
      if (!pData?.PlayerName) return;
      const playerName = pData.PlayerName;

      supabase.from("stats").select("*").eq("PlayerName", playerName).order("SeasonID", { ascending: true }).then(({ data: sData }) => {
        if (!sData) return;
        setStats(sData as StatLine[]);
        if (sData.length > 0) {
          setMostRecentTeam(sData[sData.length - 1].FullName || "");
        }

        // Fetch all stats for the seasons this player played in, to calculate league leaders
        const seasonIds = [...new Set(sData.map(s => s.SeasonID).filter(Boolean))] as number[];
        if (seasonIds.length === 0) return;

        supabase.from("stats").select("PlayerName,Goals,GoldenSnitchCatches,KeeperSaves,KeeperShotsFaced,GamesPlayed,Position,SeasonID,LeagueName")
          .in("SeasonID" as never, seasonIds)
          .then(({ data: allSeasonStats }) => {
            if (!allSeasonStats) return;
            const maxMap = new Map<string, Map<string, number>>();
            const awardEntries: LeagueLeaderEntry[] = [];

            // Group by season+league
            const grouped = new Map<string, typeof allSeasonStats>();
            allSeasonStats.forEach((r: Record<string, unknown>) => {
              const key = `${r.SeasonID}|${r.LeagueName}`;
              if (!grouped.has(key)) grouped.set(key, []);
              grouped.get(key)!.push(r as typeof allSeasonStats[0]);
            });

            grouped.forEach((rows, pairKey) => {
              const [sidStr, ln] = pairKey.split("|");
              const sid = parseInt(sidStr);
              const statMaxes = new Map<string, number>();

              const chasers = rows.filter((r: Record<string, unknown>) => r.Position === "Chaser");
              if (chasers.length) {
                const sorted = [...chasers].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.Goals as number) || 0) - ((a.Goals as number) || 0));
                statMaxes.set("Goals", (sorted[0]?.Goals as number) || 0);
                const rank = sorted.findIndex((r: Record<string, unknown>) => r.PlayerName === playerName) + 1;
                if (rank > 0 && rank <= 10) awardEntries.push({ SeasonID: sid, LeagueName: ln, stat: "Goals", value: (sorted[rank - 1]?.Goals as number) || 0, rank });
              }
              const seekers = rows.filter((r: Record<string, unknown>) => r.Position === "Seeker");
              if (seekers.length) {
                const sorted = [...seekers].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.GoldenSnitchCatches as number) || 0) - ((a.GoldenSnitchCatches as number) || 0));
                statMaxes.set("GoldenSnitchCatches", (sorted[0]?.GoldenSnitchCatches as number) || 0);
                const rank = sorted.findIndex((r: Record<string, unknown>) => r.PlayerName === playerName) + 1;
                if (rank > 0 && rank <= 10) awardEntries.push({ SeasonID: sid, LeagueName: ln, stat: "Golden Snitch Catches", value: (sorted[rank - 1]?.GoldenSnitchCatches as number) || 0, rank });
              }
              const keepers = rows.filter((r: Record<string, unknown>) => r.Position === "Keeper");
              if (keepers.length) {
                const sorted = [...keepers].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.KeeperSaves as number) || 0) - ((a.KeeperSaves as number) || 0));
                statMaxes.set("KeeperSaves", (sorted[0]?.KeeperSaves as number) || 0);
                const rank = sorted.findIndex((r: Record<string, unknown>) => r.PlayerName === playerName) + 1;
                if (rank > 0 && rank <= 10) awardEntries.push({ SeasonID: sid, LeagueName: ln, stat: "Keeper Saves", value: (sorted[rank - 1]?.KeeperSaves as number) || 0, rank });
              }

              maxMap.set(pairKey, statMaxes);
            });

            setLeagueMaxes(maxMap);
            setLeagueLeaders(awardEntries);
          });
      });
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
  const isKeeper = player.Position === "Keeper";
  const isSeeker = player.Position === "Seeker";
  const isChaser = player.Position === "Chaser";
  const isBeater = player.Position === "Beater";

  // Career totals
  const careerTotals = {
    gp: stats.reduce((s, r) => s + (r.GamesPlayed || 0), 0),
    goals: stats.reduce((s, r) => s + (r.Goals || 0), 0),
    gsc: stats.reduce((s, r) => s + (r.GoldenSnitchCatches || 0), 0),
    saves: stats.reduce((s, r) => s + (r.KeeperSaves || 0), 0),
    shotsFaced: stats.reduce((s, r) => s + (r.KeeperShotsFaced || 0), 0),
  };

  // All-time single-season records (for gold highlight)
  const allTimeGoals = Math.max(...stats.map(s => s.Goals || 0));
  const allTimeGSC = Math.max(...stats.map(s => s.GoldenSnitchCatches || 0));
  const allTimeSaves = Math.max(...stats.map(s => s.KeeperSaves || 0));
  const allTimeGP = Math.max(...stats.map(s => s.GamesPlayed || 0));

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

  // Check if a value is a league leader for that season/league
  function isLeagueLeader(s: StatLine, statKey: string): boolean {
    const pairKey = `${s.SeasonID}|${s.LeagueName}`;
    const maxes = leagueMaxes.get(pairKey);
    if (!maxes) return false;
    const max = maxes.get(statKey);
    if (max == null) return false;
    const val = statKey === "Goals" ? (s.Goals || 0) : statKey === "GoldenSnitchCatches" ? (s.GoldenSnitchCatches || 0) : statKey === "KeeperSaves" ? (s.KeeperSaves || 0) : 0;
    return val > 0 && val === max;
  }

  // Gold highlight class for all-time single-season bests
  function allTimeClass(val: number, best: number): string {
    if (stats.length === 0 || best === 0) return "";
    return val === best ? "font-bold text-yellow-500" : "";
  }

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8">
        {/* Header */}
        <div className="mb-6 border-b-2 border-primary pb-4">
          <div className="flex items-start gap-6">
            <div className="w-32 h-40 bg-muted border border-border rounded flex items-center justify-center shrink-0">
              <span className="text-4xl text-muted-foreground">👤</span>
            </div>
            <div className="flex-1">
              <h1 className="font-display text-3xl font-bold text-foreground">
                {player.FirstName} {player.LastName}
              </h1>
              <p className="text-lg text-muted-foreground font-sans mt-1">
                {player.Position} ·{" "}
                {mostRecentTeam ? (
                  <Link to={`/team/${encodeURIComponent(mostRecentTeam)}`} className="hover:text-accent text-accent">
                    {mostRecentTeam}
                  </Link>
                ) : "—"}
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

        <div className="space-y-6">
          {/* Season-by-season stats */}
          <div className="border border-border rounded overflow-hidden">
            <div className="bg-table-header px-3 py-2">
              <h3 className="font-display text-sm font-bold text-table-header-foreground">Season-by-Season Statistics</h3>
            </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-sans">
                    <thead>
                      <tr className="bg-secondary">
                        <th className={`${thClass} text-left`}>Season</th>
                        <th className={`${thClass} text-left`}>Comp</th>
                        <th className={`${thClass} text-left`}>Team</th>
                        <th className={`${thClass} text-right`}>Age</th>
                        <th className={`${thClass} text-right`}>GP</th>
                        {isChaser && <th className={`${thClass} text-right`}>Goals</th>}
                        {isChaser && <th className={`${thClass} text-right`}>G/GP</th>}
                        {isSeeker && <th className={`${thClass} text-right`}>GSC</th>}
                        {isKeeper && <th className={`${thClass} text-right`}>Saves</th>}
                        {isKeeper && <th className={`${thClass} text-right`}>SF</th>}
                        {isKeeper && <th className={`${thClass} text-right`}>Sv%</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {stats.map((s, i) => {
                        const isLeader = isChaser ? isLeagueLeader(s, "Goals")
                          : isSeeker ? isLeagueLeader(s, "GoldenSnitchCatches")
                          : isKeeper ? isLeagueLeader(s, "KeeperSaves")
                          : false;
                        const goalsAllTime = isChaser && (s.Goals || 0) === allTimeGoals && allTimeGoals > 0;
                        const gscAllTime = isSeeker && (s.GoldenSnitchCatches || 0) === allTimeGSC && allTimeGSC > 0;
                        const savesAllTime = isKeeper && (s.KeeperSaves || 0) === allTimeSaves && allTimeSaves > 0;
                        const rowClass = `border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`;
                        const goalsClass = goalsAllTime ? "font-bold text-[hsl(var(--highlight))]" : isLeader ? "font-bold" : "";
                        const gscClass = gscAllTime ? "font-bold text-[hsl(var(--highlight))]" : isLeader ? "font-bold" : "";
                        const savesClass = savesAllTime ? "font-bold text-[hsl(var(--highlight))]" : isLeader ? "font-bold" : "";
                        const gpPerGoal = isChaser && (s.Goals || 0) > 0 ? ((s.GamesPlayed || 0) / (s.Goals || 1)).toFixed(2) : null;
                        const svPct = isKeeper && s.KeeperShotsFaced ? ((s.KeeperSaves || 0) / s.KeeperShotsFaced * 100).toFixed(1) + "%" : "—";
                        return (
                          <tr key={i} className={rowClass}>
                            <td className="px-3 py-1.5 font-mono">{seasonLabel(s.SeasonID)}</td>
                            <td className="px-3 py-1.5 font-mono text-xs" title={s.LeagueName || ""}>{abbrevLeague(s.LeagueName)}</td>
                            <td className="px-3 py-1.5">
                              {s.FullName ? (
                                <Link to={`/team/${encodeURIComponent(s.FullName)}`} className="text-accent hover:underline">{s.FullName}</Link>
                              ) : "—"}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{ageAtSeason(player.DOB, s.SeasonID)}</td>
                            <td className={`px-3 py-1.5 text-right font-mono ${allTimeClass(s.GamesPlayed || 0, allTimeGP)}`}>{s.GamesPlayed}</td>
                            {isChaser && <td className={`px-3 py-1.5 text-right font-mono ${goalsClass}`}>{s.Goals || 0}</td>}
                            {isChaser && <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{gpPerGoal ?? "—"}</td>}
                            {isSeeker && <td className={`px-3 py-1.5 text-right font-mono ${gscClass}`}>{s.GoldenSnitchCatches || 0}</td>}
                            {isKeeper && <td className={`px-3 py-1.5 text-right font-mono ${savesClass}`}>{s.KeeperSaves || 0}</td>}
                            {isKeeper && <td className="px-3 py-1.5 text-right font-mono">{s.KeeperShotsFaced || 0}</td>}
                            {isKeeper && <td className="px-3 py-1.5 text-right font-mono">{svPct}</td>}
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-primary bg-primary/5 font-bold">
                        <td className="px-3 py-1.5 text-primary font-mono" colSpan={4}>Career Totals</td>
                        <td className="px-3 py-1.5 text-right font-mono text-primary">{careerTotals.gp}</td>
                        {isChaser && <td className="px-3 py-1.5 text-right font-mono text-primary">{careerTotals.goals}</td>}
                        {isChaser && (
                          <td className="px-3 py-1.5 text-right font-mono text-primary">
                            {careerTotals.gp > 0 && careerTotals.goals > 0 ? (careerTotals.gp / careerTotals.goals).toFixed(2) : "—"}
                          </td>
                        )}
                        {isSeeker && <td className="px-3 py-1.5 text-right font-mono text-primary">{careerTotals.gsc}</td>}
                        {isKeeper && <td className="px-3 py-1.5 text-right font-mono text-primary">{careerTotals.saves}</td>}
                        {isKeeper && <td className="px-3 py-1.5 text-right font-mono text-primary">{careerTotals.shotsFaced}</td>}
                        {isKeeper && (
                          <td className="px-3 py-1.5 text-right font-mono text-primary">
                            {careerTotals.shotsFaced ? ((careerTotals.saves / careerTotals.shotsFaced) * 100).toFixed(1) + "%" : "—"}
                          </td>
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="px-3 py-1.5 bg-secondary/50 text-xs text-muted-foreground font-sans flex gap-4">
                  <span><span className="font-bold">Bold</span> = league leader</span>
                  <span><span className="font-bold text-primary">Bold primary</span> = career total</span>
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
                    <th className={`${thClass} text-left`}>Competition</th>
                    <th className={`${thClass} text-right`}>GP</th>
                    {isChaser && <th className={`${thClass} text-right`}>Goals</th>}
                    {isSeeker && <th className={`${thClass} text-right`}>GSC</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Saves</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>SF</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Sv%</th>}
                  </tr>
                </thead>
                <tbody>
                  {[...byCompetition.entries()].map(([comp, totals], i) => (
                    <tr key={comp} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                      <td className="px-3 py-1.5">{comp}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{totals.gp}</td>
                      {isChaser && <td className="px-3 py-1.5 text-right font-mono">{totals.goals}</td>}
                      {isSeeker && <td className="px-3 py-1.5 text-right font-mono">{totals.gsc}</td>}
                      {isKeeper && <td className="px-3 py-1.5 text-right font-mono">{totals.saves}</td>}
                      {isKeeper && <td className="px-3 py-1.5 text-right font-mono">{totals.shotsFaced}</td>}
                      {isKeeper && (
                        <td className="px-3 py-1.5 text-right font-mono">
                          {totals.shotsFaced ? ((totals.saves / totals.shotsFaced) * 100).toFixed(1) + "%" : "—"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Awards & Leaderboard Appearances */}
          {leagueLeaders.length > 0 && (
            <div className="border border-border rounded overflow-hidden">
              <div className="bg-table-header px-3 py-2">
                <h3 className="font-display text-sm font-bold text-table-header-foreground">Appearances on Leaderboards, Awards &amp; Honours</h3>
              </div>
              <div className="bg-card divide-y divide-border">
                {leagueLeaders.map((entry, i) => (
                  <div key={i} className="px-3 py-2 flex items-center gap-3 text-sm font-sans">
                    <span className="text-base">
                      {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `#${entry.rank}`}
                    </span>
                    <div className="flex-1">
                      <span className="font-medium text-foreground">{ordinal(entry.rank)} in {entry.stat}</span>
                      <span className="text-muted-foreground ml-1">({entry.value} — {abbrevLeague(entry.LeagueName)}, {seasonLabel(entry.SeasonID)})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
