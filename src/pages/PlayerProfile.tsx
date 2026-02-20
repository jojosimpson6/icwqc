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
  scope: "league" | "combined";
}

// Minutes played per season/league key
type MinutesMap = Map<string, number>;

interface MatchLogEntry {
  MatchID: number;
  SeasonID: number | null;
  opponentName: string;
  isHome: boolean;
  teamScore: number;
  oppScore: number;
  stat: string; // position-specific stat
  date: string | null;
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
  const age = seasonId - birth.getFullYear();
  return String(age);
}

function fmtMin(minutes: number | null): string {
  if (!minutes || minutes === 0) return "—";
  return minutes.toString();
}

export default function PlayerProfile() {
  const { id } = useParams();
  const [player, setPlayer] = useState<Player | null>(null);
  const [nation, setNation] = useState<string>("");
  const [stats, setStats] = useState<StatLine[]>([]);
  const [mostRecentTeam, setMostRecentTeam] = useState<string>("");
  const [leagueLeaders, setLeagueLeaders] = useState<LeagueLeaderEntry[]>([]);
  const [leagueMaxes, setLeagueMaxes] = useState<Map<string, Map<string, number>>>(new Map());
  const [minutesMap, setMinutesMap] = useState<MinutesMap>(new Map());
  const [shotsFacedMap, setShotsFacedMap] = useState<MinutesMap>(new Map());
  const [matchLog, setMatchLog] = useState<MatchLogEntry[]>([]);

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

        // Fetch match minutes (and shots faced for beaters/keepers) from results table
        const pos = data.Position;
        let orFilter = "";
        if (pos === "Chaser") {
          orFilter = `HomeChaser1ID.eq.${pid},HomeChaser2ID.eq.${pid},HomeChaser3ID.eq.${pid},AwayChaser1ID.eq.${pid},AwayChaser2ID.eq.${pid},AwayChaser3ID.eq.${pid}`;
        } else if (pos === "Seeker") {
          orFilter = `HomeSeekerID.eq.${pid},AwaySeekerID.eq.${pid}`;
        } else if (pos === "Keeper") {
          orFilter = `HomeKeeperID.eq.${pid},AwayKeeperID.eq.${pid}`;
        } else if (pos === "Beater") {
          orFilter = `HomeBeater1ID.eq.${pid},HomeBeater2ID.eq.${pid},AwayBeater1ID.eq.${pid},AwayBeater2ID.eq.${pid}`;
        }
        if (orFilter) {
          Promise.all([
            supabase.from("results")
              .select("MatchID,SeasonID,LeagueID,WeekID,SnitchCaughtTime,SnitchCaughtBy,HomeTeamID,AwayTeamID,HomeTeamScore,AwayTeamScore,HomeKeeperShotsFaced,AwayKeeperShotsFaced,HomeKeeperID,AwayKeeperID,HomeKeeperSaves,AwayKeeperSaves,HomeBeater1ID,HomeBeater2ID,AwayBeater1ID,AwayBeater2ID,HomeSeekerID,AwaySeekerID,HomeChaser1ID,HomeChaser1Goals,HomeChaser2ID,HomeChaser2Goals,HomeChaser3ID,HomeChaser3Goals,AwayChaser1ID,AwayChaser1Goals,AwayChaser2ID,AwayChaser2Goals,AwayChaser3ID,AwayChaser3Goals")
              .or(orFilter)
              .order("MatchID", { ascending: false })
              .limit(2000),
            supabase.from("leagues").select("LeagueID,LeagueName"),
            supabase.from("teams").select("TeamID, FullName"),
            supabase.from("matchdays").select("MatchdayID, Matchday"),
          ]).then(([{ data: matchData }, { data: leaguesData }, { data: teamsData }, { data: mdData }]) => {
            if (!matchData) return;

            const leagueNameMap = new Map<number, string>();
            (leaguesData || []).forEach((l: { LeagueID: number; LeagueName: string | null }) => {
              if (l.LeagueID && l.LeagueName) leagueNameMap.set(l.LeagueID, l.LeagueName);
            });

            const teamNameMap = new Map<number, string>();
            (teamsData || []).forEach((t: { TeamID: number; FullName: string }) => {
              if (t.TeamID) teamNameMap.set(t.TeamID, t.FullName);
            });

            const mdMap = new Map<number, string>();
            (mdData || []).forEach((md: { MatchdayID: number; Matchday: string | null }) => {
              if (md.MatchdayID && md.Matchday) mdMap.set(md.MatchdayID, md.Matchday);
            });

            const minsMap = new Map<string, number>();
            const sfMap = new Map<string, number>();
            const logEntries: MatchLogEntry[] = [];

            matchData.forEach((r: Record<string, unknown>) => {
              const sid = r.SeasonID as number;
              const lid = r.LeagueID as number;
              const lname = leagueNameMap.get(lid) || String(lid);
              const key = `${sid}|${lname}`;
              const matchMins = (r.SnitchCaughtTime as number) || 0;
              minsMap.set(key, (minsMap.get(key) || 0) + matchMins);

              // Determine if player is on home or away side
              const homePlayerIds = [r.HomeChaser1ID, r.HomeChaser2ID, r.HomeChaser3ID, r.HomeKeeperID, r.HomeSeekerID, r.HomeBeater1ID, r.HomeBeater2ID];
              const isHome = homePlayerIds.includes(pid);

              if (pos === "Beater" || pos === "Keeper") {
                const sf = isHome
                  ? (r.HomeKeeperShotsFaced as number) || 0
                  : (r.AwayKeeperShotsFaced as number) || 0;
                sfMap.set(key, (sfMap.get(key) || 0) + sf);
              }

              // Build match log entry
              const oppId = isHome ? (r.AwayTeamID as number) : (r.HomeTeamID as number);
              const teamScore = isHome ? (r.HomeTeamScore as number) ?? 0 : (r.AwayTeamScore as number) ?? 0;
              const oppScore = isHome ? (r.AwayTeamScore as number) ?? 0 : (r.HomeTeamScore as number) ?? 0;
              const weekId = r.WeekID as number;
              const dateStr = weekId ? mdMap.get(weekId) || null : null;

              // Position-specific stat
              let statStr = "";
              if (pos === "Chaser") {
                let goals = 0;
                if (isHome) {
                  if (r.HomeChaser1ID === pid) goals = (r.HomeChaser1Goals as number) || 0;
                  else if (r.HomeChaser2ID === pid) goals = (r.HomeChaser2Goals as number) || 0;
                  else if (r.HomeChaser3ID === pid) goals = (r.HomeChaser3Goals as number) || 0;
                } else {
                  if (r.AwayChaser1ID === pid) goals = (r.AwayChaser1Goals as number) || 0;
                  else if (r.AwayChaser2ID === pid) goals = (r.AwayChaser2Goals as number) || 0;
                  else if (r.AwayChaser3ID === pid) goals = (r.AwayChaser3Goals as number) || 0;
                }
                statStr = `${goals} goals`;
              } else if (pos === "Keeper") {
                const saves = isHome ? (r.HomeKeeperSaves as number) || 0 : (r.AwayKeeperSaves as number) || 0;
                const sf = isHome ? (r.HomeKeeperShotsFaced as number) || 0 : (r.AwayKeeperShotsFaced as number) || 0;
                statStr = `${saves}/${sf} saves`;
              } else if (pos === "Seeker") {
                const snitchTeam = r.SnitchCaughtBy as number;
                const myTeam = isHome ? (r.HomeTeamID as number) : (r.AwayTeamID as number);
                statStr = snitchTeam === myTeam ? "✓ Caught" : "—";
              } else if (pos === "Beater") {
                const sf = isHome ? (r.HomeKeeperShotsFaced as number) || 0 : (r.AwayKeeperShotsFaced as number) || 0;
                statStr = `${sf} SA`;
              }

              logEntries.push({
                MatchID: r.MatchID as number,
                SeasonID: sid,
                opponentName: teamNameMap.get(oppId) || `Team ${oppId}`,
                isHome,
                teamScore,
                oppScore,
                stat: statStr,
                date: dateStr,
              });
            });

            setMinutesMap(minsMap);
            setShotsFacedMap(sfMap);
            setMatchLog(logEntries);
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

            // Also group by season only (for combined cross-league ranking)
            const bySeason = new Map<number, typeof allSeasonStats>();
            allSeasonStats.forEach((r: Record<string, unknown>) => {
              const sid = r.SeasonID as number;
              if (!bySeason.has(sid)) bySeason.set(sid, []);
              bySeason.get(sid)!.push(r as typeof allSeasonStats[0]);
            });

            // Per-league top 5
            grouped.forEach((rows, pairKey) => {
              const [sidStr, ln] = pairKey.split("|");
              const sid = parseInt(sidStr);
              const statMaxes = new Map<string, number>();

              const chasers = rows.filter((r: Record<string, unknown>) => r.Position === "Chaser");
              if (chasers.length) {
                const sorted = [...chasers].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.Goals as number) || 0) - ((a.Goals as number) || 0));
                statMaxes.set("Goals", (sorted[0]?.Goals as number) || 0);
                const rank = sorted.findIndex((r: Record<string, unknown>) => r.PlayerName === playerName) + 1;
                if (rank > 0 && rank <= 5) awardEntries.push({ SeasonID: sid, LeagueName: ln, stat: "Goals", value: (sorted[rank - 1]?.Goals as number) || 0, rank, scope: "league" });
              }
              const seekers = rows.filter((r: Record<string, unknown>) => r.Position === "Seeker");
              if (seekers.length) {
                const sorted = [...seekers].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.GoldenSnitchCatches as number) || 0) - ((a.GoldenSnitchCatches as number) || 0));
                statMaxes.set("GoldenSnitchCatches", (sorted[0]?.GoldenSnitchCatches as number) || 0);
                const rank = sorted.findIndex((r: Record<string, unknown>) => r.PlayerName === playerName) + 1;
                if (rank > 0 && rank <= 5) awardEntries.push({ SeasonID: sid, LeagueName: ln, stat: "Golden Snitch Catches", value: (sorted[rank - 1]?.GoldenSnitchCatches as number) || 0, rank, scope: "league" });
              }
              const keepers = rows.filter((r: Record<string, unknown>) => r.Position === "Keeper");
              if (keepers.length) {
                const sorted = [...keepers].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.KeeperSaves as number) || 0) - ((a.KeeperSaves as number) || 0));
                statMaxes.set("KeeperSaves", (sorted[0]?.KeeperSaves as number) || 0);
                const rank = sorted.findIndex((r: Record<string, unknown>) => r.PlayerName === playerName) + 1;
                if (rank > 0 && rank <= 5) awardEntries.push({ SeasonID: sid, LeagueName: ln, stat: "Keeper Saves", value: (sorted[rank - 1]?.KeeperSaves as number) || 0, rank, scope: "league" });
              }

              maxMap.set(pairKey, statMaxes);
            });

            // Combined cross-league top 10 (all leagues in a season)
            bySeason.forEach((rows, sid) => {
              const chasers = rows.filter((r: Record<string, unknown>) => r.Position === "Chaser");
              if (chasers.length) {
                const sorted = [...chasers].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.Goals as number) || 0) - ((a.Goals as number) || 0));
                const rank = sorted.findIndex((r: Record<string, unknown>) => r.PlayerName === playerName) + 1;
                if (rank > 0 && rank <= 10) {
                  // Only add if not already added as a league entry (rank <= 5)
                  const alreadyInLeague = awardEntries.some(e => e.SeasonID === sid && e.stat === "Goals" && e.scope === "league");
                  if (!alreadyInLeague) {
                    awardEntries.push({ SeasonID: sid, LeagueName: "All Leagues", stat: "Goals", value: (sorted[rank - 1]?.Goals as number) || 0, rank, scope: "combined" });
                  }
                }
              }
              const seekers = rows.filter((r: Record<string, unknown>) => r.Position === "Seeker");
              if (seekers.length) {
                const sorted = [...seekers].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.GoldenSnitchCatches as number) || 0) - ((a.GoldenSnitchCatches as number) || 0));
                const rank = sorted.findIndex((r: Record<string, unknown>) => r.PlayerName === playerName) + 1;
                if (rank > 0 && rank <= 10) {
                  const alreadyInLeague = awardEntries.some(e => e.SeasonID === sid && e.stat === "Golden Snitch Catches" && e.scope === "league");
                  if (!alreadyInLeague) {
                    awardEntries.push({ SeasonID: sid, LeagueName: "All Leagues", stat: "Golden Snitch Catches", value: (sorted[rank - 1]?.GoldenSnitchCatches as number) || 0, rank, scope: "combined" });
                  }
                }
              }
              const keepers = rows.filter((r: Record<string, unknown>) => r.Position === "Keeper");
              if (keepers.length) {
                const sorted = [...keepers].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.KeeperSaves as number) || 0) - ((a.KeeperSaves as number) || 0));
                const rank = sorted.findIndex((r: Record<string, unknown>) => r.PlayerName === playerName) + 1;
                if (rank > 0 && rank <= 10) {
                  const alreadyInLeague = awardEntries.some(e => e.SeasonID === sid && e.stat === "Keeper Saves" && e.scope === "league");
                  if (!alreadyInLeague) {
                    awardEntries.push({ SeasonID: sid, LeagueName: "All Leagues", stat: "Keeper Saves", value: (sorted[rank - 1]?.KeeperSaves as number) || 0, rank, scope: "combined" });
                  }
                }
              }
            });

            setLeagueMaxes(maxMap);
            // Sort: league entries first, then combined, then by season desc
            awardEntries.sort((a, b) => {
              if (a.scope !== b.scope) return a.scope === "league" ? -1 : 1;
              return b.SeasonID - a.SeasonID;
            });
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
    minutes: [...minutesMap.values()].reduce((a, b) => a + b, 0),
  };

  // All-time single-season records (for gold highlight)
  const allTimeGoals = Math.max(0, ...stats.map(s => s.Goals || 0));
  const allTimeGSC = Math.max(0, ...stats.map(s => s.GoldenSnitchCatches || 0));
  const allTimeSaves = Math.max(0, ...stats.map(s => s.KeeperSaves || 0));
  const allTimeGP = Math.max(0, ...stats.map(s => s.GamesPlayed || 0));
  const allTimeMinutes = minutesMap.size > 0 ? Math.max(0, ...[...minutesMap.values()]) : 0;

  // Stats by competition
  const byCompetition = new Map<string, { gp: number; goals: number; gsc: number; saves: number; shotsFaced: number; minutes: number }>();
  stats.forEach((s) => {
    const key = s.LeagueName || "Unknown";
    const existing = byCompetition.get(key) || { gp: 0, goals: 0, gsc: 0, saves: 0, shotsFaced: 0, minutes: 0 };
    existing.gp += s.GamesPlayed || 0;
    existing.goals += s.Goals || 0;
    existing.gsc += s.GoldenSnitchCatches || 0;
    existing.saves += s.KeeperSaves || 0;
    existing.shotsFaced += s.KeeperShotsFaced || 0;
    const mKey = `${s.SeasonID}|${s.LeagueName}`;
    existing.minutes += minutesMap.get(mKey) || 0;
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
    return val === best ? "font-bold text-[hsl(var(--highlight))]" : "";
  }

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground";
  const tdClass = "px-3 py-1.5 text-foreground";

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
                    <th className={`${thClass} text-right`}>Age</th>
                    <th className={`${thClass} text-left`}>Comp</th>
                    <th className={`${thClass} text-left`}>Team</th>
                    <th className={`${thClass} text-right`}>GP</th>
                    <th className={`${thClass} text-right`}>Min</th>
                    {isChaser && <th className={`${thClass} text-right`}>Goals</th>}
                    {isChaser && <th className={`${thClass} text-right`}>Min/G</th>}
                    {isSeeker && <th className={`${thClass} text-right`}>GSC</th>}
                    {isSeeker && <th className={`${thClass} text-right`}>Snitch%</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Saves</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>SF</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Sv%</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Sv/GP</th>}
                    {isBeater && <th className={`${thClass} text-right`}>SF/GP</th>}
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

                    const mKey = `${s.SeasonID}|${s.LeagueName}`;
                    const mins = minutesMap.get(mKey) || 0;
                    const minsClass = allTimeClass(mins, allTimeMinutes);

                    // Chaser: minutes per goal
                    const minPerGoal = isChaser && (s.Goals || 0) > 0 && mins > 0
                      ? (mins / (s.Goals || 1)).toFixed(1)
                      : null;

                    // Seeker: snitch % = catches / GP * 100
                    const snitchPct = isSeeker && (s.GamesPlayed || 0) > 0
                      ? (((s.GoldenSnitchCatches || 0) / (s.GamesPlayed || 1)) * 100).toFixed(1) + "%"
                      : "—";

                    // Keeper: save % and saves/game
                    const svPct = isKeeper && s.KeeperShotsFaced
                      ? ((s.KeeperSaves || 0) / s.KeeperShotsFaced * 100).toFixed(1) + "%"
                      : "—";
                    const svPerGP = isKeeper && (s.GamesPlayed || 0) > 0
                      ? ((s.KeeperSaves || 0) / (s.GamesPlayed || 1)).toFixed(2)
                      : "—";

                    // Beater/Keeper: shots faced per game — use actual summed shots from results
                    const sfFromResults = shotsFacedMap.get(mKey) || 0;
                    const sfPerGP = (isBeater || isKeeper) && (s.GamesPlayed || 0) > 0 && sfFromResults > 0
                      ? (sfFromResults / (s.GamesPlayed || 1)).toFixed(2)
                      : "—";

                    return (
                      <tr key={i} className={rowClass}>
                        <td className={`${tdClass} font-mono`}>{seasonLabel(s.SeasonID)}</td>
                        <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{ageAtSeason(player.DOB, s.SeasonID)}</td>
                        <td className={`${tdClass} font-mono text-xs`} title={s.LeagueName || ""}>{abbrevLeague(s.LeagueName)}</td>
                        <td className={`${tdClass}`}>
                          {s.FullName ? (
                            <Link to={`/team/${encodeURIComponent(s.FullName)}`} className="text-accent hover:underline">{s.FullName}</Link>
                          ) : "—"}
                        </td>
                        <td className={`px-3 py-1.5 text-right font-mono ${allTimeClass(s.GamesPlayed || 0, allTimeGP)} text-foreground`}>{s.GamesPlayed}</td>
                        <td className={`px-3 py-1.5 text-right font-mono ${minsClass} text-foreground`}>{fmtMin(mins)}</td>
                        {isChaser && <td className={`px-3 py-1.5 text-right font-mono ${goalsClass} text-foreground`}>{s.Goals || 0}</td>}
                        {isChaser && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{minPerGoal ?? "—"}</td>}
                        {isSeeker && <td className={`px-3 py-1.5 text-right font-mono ${gscClass} text-foreground`}>{s.GoldenSnitchCatches || 0}</td>}
                        {isSeeker && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{snitchPct}</td>}
                        {isKeeper && <td className={`px-3 py-1.5 text-right font-mono ${savesClass} text-foreground`}>{s.KeeperSaves || 0}</td>}
                        {isKeeper && <td className={`${tdClass} text-right font-mono`}>{s.KeeperShotsFaced || 0}</td>}
                        {isKeeper && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{svPct}</td>}
                        {isKeeper && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{svPerGP}</td>}
                        {isBeater && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{sfPerGP}</td>}
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-primary bg-primary/5 font-bold">
                    <td className="px-3 py-1.5 text-primary font-mono" colSpan={4}>Career Totals</td>
                    <td className="px-3 py-1.5 text-right font-mono text-primary">{careerTotals.gp}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-primary">{careerTotals.minutes > 0 ? careerTotals.minutes : "—"}</td>
                    {isChaser && <td className="px-3 py-1.5 text-right font-mono text-primary">{careerTotals.goals}</td>}
                    {isChaser && (
                      <td className="px-3 py-1.5 text-right font-mono text-primary">
                        {careerTotals.minutes > 0 && careerTotals.goals > 0 ? (careerTotals.minutes / careerTotals.goals).toFixed(1) : "—"}
                      </td>
                    )}
                    {isSeeker && <td className="px-3 py-1.5 text-right font-mono text-primary">{careerTotals.gsc}</td>}
                    {isSeeker && (
                      <td className="px-3 py-1.5 text-right font-mono text-primary">
                        {careerTotals.gp > 0 ? ((careerTotals.gsc / careerTotals.gp) * 100).toFixed(1) + "%" : "—"}
                      </td>
                    )}
                    {isKeeper && <td className="px-3 py-1.5 text-right font-mono text-primary">{careerTotals.saves}</td>}
                    {isKeeper && <td className="px-3 py-1.5 text-right font-mono text-primary">{careerTotals.shotsFaced}</td>}
                    {isKeeper && (
                      <td className="px-3 py-1.5 text-right font-mono text-primary">
                        {careerTotals.shotsFaced ? ((careerTotals.saves / careerTotals.shotsFaced) * 100).toFixed(1) + "%" : "—"}
                      </td>
                    )}
                    {isKeeper && (
                      <td className="px-3 py-1.5 text-right font-mono text-primary">
                        {careerTotals.gp > 0 ? (careerTotals.saves / careerTotals.gp).toFixed(2) : "—"}
                      </td>
                    )}
                    {isBeater && (
                      <td className="px-3 py-1.5 text-right font-mono text-primary">
                        {careerTotals.gp > 0 && careerTotals.shotsFaced > 0 ? (careerTotals.shotsFaced / careerTotals.gp).toFixed(2) : "—"}
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="px-3 py-1.5 bg-secondary/50 text-xs text-muted-foreground font-sans flex gap-4">
              <span><span className="font-bold text-foreground">Bold</span> = league leader (top 5)</span>
              <span><span className="font-bold text-[hsl(var(--highlight))]">Gold</span> = career best season</span>
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
                    <th className={`${thClass} text-right`}>Min</th>
                    {isChaser && <th className={`${thClass} text-right`}>Goals</th>}
                    {isChaser && <th className={`${thClass} text-right`}>Min/G</th>}
                    {isSeeker && <th className={`${thClass} text-right`}>GSC</th>}
                    {isSeeker && <th className={`${thClass} text-right`}>Snitch%</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Saves</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>SF</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Sv%</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Sv/GP</th>}
                    {isBeater && <th className={`${thClass} text-right`}>SF/GP</th>}
                  </tr>
                </thead>
                <tbody>
                  {[...byCompetition.entries()].map(([comp, totals], i) => (
                    <tr key={comp} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                      <td className={`${tdClass}`}>{comp}</td>
                      <td className={`${tdClass} text-right font-mono`}>{totals.gp}</td>
                      <td className={`${tdClass} text-right font-mono`}>{totals.minutes > 0 ? totals.minutes : "—"}</td>
                      {isChaser && <td className={`${tdClass} text-right font-mono`}>{totals.goals}</td>}
                      {isChaser && (
                        <td className={`${tdClass} text-right font-mono text-muted-foreground`}>
                          {totals.minutes > 0 && totals.goals > 0 ? (totals.minutes / totals.goals).toFixed(1) : "—"}
                        </td>
                      )}
                      {isSeeker && <td className={`${tdClass} text-right font-mono`}>{totals.gsc}</td>}
                      {isSeeker && (
                        <td className={`${tdClass} text-right font-mono text-muted-foreground`}>
                          {totals.gp > 0 ? ((totals.gsc / totals.gp) * 100).toFixed(1) + "%" : "—"}
                        </td>
                      )}
                      {isKeeper && <td className={`${tdClass} text-right font-mono`}>{totals.saves}</td>}
                      {isKeeper && <td className={`${tdClass} text-right font-mono`}>{totals.shotsFaced}</td>}
                      {isKeeper && (
                        <td className={`${tdClass} text-right font-mono text-muted-foreground`}>
                          {totals.shotsFaced ? ((totals.saves / totals.shotsFaced) * 100).toFixed(1) + "%" : "—"}
                        </td>
                      )}
                      {isKeeper && (
                        <td className={`${tdClass} text-right font-mono text-muted-foreground`}>
                          {totals.gp > 0 ? (totals.saves / totals.gp).toFixed(2) : "—"}
                        </td>
                      )}
                      {isBeater && (
                        <td className={`${tdClass} text-right font-mono text-muted-foreground`}>
                          {totals.gp > 0 && totals.shotsFaced > 0 ? (totals.shotsFaced / totals.gp).toFixed(2) : "—"}
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
                      <span className="text-muted-foreground ml-1">
                        ({entry.value} — {entry.scope === "combined" ? "All Leagues" : abbrevLeague(entry.LeagueName)}, {seasonLabel(entry.SeasonID)})
                      </span>
                    </div>
                    {entry.scope === "combined" && (
                      <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">Combined</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Match Log */}
          {matchLog.length > 0 && (
            <div className="border border-border rounded overflow-hidden">
              <div className="bg-table-header px-3 py-2">
                <h3 className="font-display text-sm font-bold text-table-header-foreground">Match Log</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="bg-secondary">
                      <th className={`${thClass} text-left`}>Date</th>
                      <th className={`${thClass} text-left`}>Season</th>
                      <th className={`${thClass} text-left`}>Opponent</th>
                      <th className={`${thClass} text-center`}>H/A</th>
                      <th className={`${thClass} text-right`}>Score</th>
                      <th className={`${thClass} text-center`}>W/L</th>
                      <th className={`${thClass} text-right`}>{isChaser ? "Goals" : isKeeper ? "Saves" : isSeeker ? "GSC" : "SA"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchLog.map((m, i) => {
                      const won = m.teamScore > m.oppScore;
                      const displayDate = m.date
                        ? (() => { const [y, mo, d] = m.date.split("-").map(Number); return new Date(y, mo - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); })()
                        : "—";
                      return (
                        <tr key={m.MatchID} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                          <td className={`${tdClass} text-xs text-muted-foreground font-mono`}>{displayDate}</td>
                          <td className={`${tdClass} text-xs text-muted-foreground font-mono`}>{m.SeasonID ? seasonLabel(m.SeasonID) : "—"}</td>
                          <td className={tdClass}>
                            <Link to={`/team/${encodeURIComponent(m.opponentName)}`} className="text-accent hover:underline">{m.opponentName}</Link>
                          </td>
                          <td className={`${tdClass} text-center text-xs text-muted-foreground`}>{m.isHome ? "H" : "A"}</td>
                          <td className={`${tdClass} text-right font-mono font-bold`}>
                            <Link to={`/match/${m.MatchID}`} className="hover:underline text-accent">
                              {m.teamScore}–{m.oppScore}
                            </Link>
                          </td>
                          <td className={`${tdClass} text-center font-bold text-xs ${won ? "text-green-600" : "text-destructive"}`}>
                            {won ? "W" : "L"}
                          </td>
                          <td className={`${tdClass} text-right font-mono`}>{m.stat}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
