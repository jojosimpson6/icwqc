import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { formatHeight, calculateAge, formatDate, getNationFlag } from "@/lib/helpers";
import { fetchAllRows } from "@/lib/fetchAll";
import { cachedQuery } from "@/lib/queryCache";
import { ChevronDown, ChevronRight } from "lucide-react";

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
  headshot_url: string | null;
}

interface StatLine {
  PlayerID: number | null;
  PlayerName: string | null;
  SeasonID: number | null;
  LeagueName: string | null;
  FullName: string | null;
  Position: string | null;
  Nation: string | null;
  GamesPlayed: number | null;
  MinPlayed: number | null;
  Goals: number | null;
  ShotAtt: number | null;
  ShotScored: number | null;
  PassAtt: number | null;
  PassComp: number | null;
  PassCompPct: number | null;
  ShotAccPct: number | null;
  KeeperSaves: number | null;
  KeeperShotsFaced: number | null;
  KeeperShotsParried: number | null;
  KeeperShotsConceded: number | null;
  SavePct: number | null;
  KeeperPassAtt: number | null;
  KeeperPassComp: number | null;
  KeeperPassCompPct: number | null;
  GoldenSnitchCatches: number | null;
  SnitchSpotted: number | null;
  CatchAttempts: number | null;
  CatchRatePct: number | null;
  BludgersHit: number | null;
  TurnoversForced: number | null;
  TeammatesProtected: number | null;
  BludgerShotsFaced: number | null;
}

interface LeagueLeaderEntry {
  SeasonID: number;
  LeagueName: string;
  stat: string;
  value: number;
  rank: number;
  scope: "league" | "combined";
}

type MinutesMap = Map<string, number>;

interface ExtendedStats {
  passAtt: number;
  passComp: number;
  shotAtt: number;
  shotScored: number;
  bludgersHit: number;
  turnoversForced: number;
  teammatesProtected: number;
  bludgerShotsFaced: number;
  snitchSpotted: number;
  catchAttempts: number;
  keeperShotsSaved: number;
  keeperShotsParried: number;
  keeperShotsConceded: number;
}

type ExtendedStatsMap = Map<string, ExtendedStats>;

interface MatchLogEntry {
  MatchID: number;
  SeasonID: number | null;
  opponentName: string;
  isHome: boolean;
  isNeutral: boolean;
  teamScore: number;
  oppScore: number;
  stat: string;
  date: string | null;
  leagueName: string;
}

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
  // Age as of Sep 1 of the season's START year (seasonId is end year, so start = seasonId - 1)
  const startYear = seasonId - 1;
  const ref = new Date(startYear, 8, 1); // September 1
  const birth = new Date(dob);
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  return String(age);
}

function fmtMin(minutes: number | null): string {
  if (!minutes || minutes === 0) return "—";
  return minutes.toString();
}

type CompBest = { goals: number; gsc: number; saves: number; sf: number; gp: number; mins: number };
type ExtBest = { shotPct: number | null; passPct: number | null; snitchPct: number | null; svPct: number | null; keeperPassPct: number | null; bludgersHit: number; turnovers: number; teammates: number; sfPerGP: number | null; minPerGoal: number | null };

export default function PlayerProfile() {
  const { id } = useParams();
  const [player, setPlayer] = useState<Player | null>(null);
  const [nation, setNation] = useState<string>("");
  const [stats, setStats] = useState<StatLine[]>([]);
  const [mostRecentTeam, setMostRecentTeam] = useState<string>("");
  const [leagueLeaders, setLeagueLeaders] = useState<LeagueLeaderEntry[]>([]);
  const [leagueMaxes, setLeagueMaxes] = useState<Map<string, Map<string, number>>>(new Map());
  const [matchLog, setMatchLog] = useState<MatchLogEntry[]>([]);
  const [matchLogOpen, setMatchLogOpen] = useState(false);
  const [matchLogSeason, setMatchLogSeason] = useState<number | "all">("all");
  const [matchLogSortKey, setMatchLogSortKey] = useState<string>("date");
  const [matchLogSortDir, setMatchLogSortDir] = useState<"asc" | "desc">("asc");
  const [compFilter, setCompFilter] = useState<string>("all");
  const [detectedPositions, setDetectedPositions] = useState<string[]>([]);
  const [playerAwards, setPlayerAwards] = useState<{ awardname: string; placement: number; seasonid: number; leagueid: number; leagueName?: string }[]>([]);
  const [leagueNameMap, setLeagueNameMap] = useState<Map<number, string>>(new Map());
  useEffect(() => {
    if (!id) return;
    const pid = parseInt(id);

    // Fetch player bio
    supabase.from("players").select("*").eq("PlayerID", pid).single().then(({ data }) => {
      if (data) {
        setPlayer(data);
        if (data.NationalityID) {
          supabase.from("nations").select("Nation").eq("NationID", data.NationalityID)
            .order("ValidToDt", { ascending: false }).limit(1)
            .then(({ data: nd }) => { if (nd?.[0]) setNation(nd[0].Nation || ""); });
        }
      }
    });

    // Fetch player awards + league name map
    Promise.all([
      supabase.from("awards").select("*").eq("playerid", pid).order("seasonid", { ascending: true }).order("awardname").order("placement"),
      cachedQuery("leagues:all", async () => await supabase.from("leagues").select("LeagueID, LeagueName")),
    ]).then(([{ data: awardsData }, { data: leaguesData }]) => {
      const lnm = new Map<number, string>();
      (leaguesData || []).forEach((l: any) => { if (l.LeagueID && l.LeagueName) lnm.set(l.LeagueID, l.LeagueName); });
      setLeagueNameMap(lnm);
      if (awardsData) {
        setPlayerAwards(awardsData.map((a: any) => ({
          ...a,
          leagueName: lnm.get(a.leagueid) || `League ${a.leagueid}`,
        })));
      }
    });

    // Fetch all stats from the new player_season_stats view — has everything in one query
    fetchAllRows("player_season_stats", {
      select: "*",
      filters: [{ method: "eq", args: ["PlayerID", pid] }],
      order: { column: "SeasonID", ascending: true },
    }).then(async (sData) => {
      if (!sData || sData.length === 0) return;
      setStats(sData as StatLine[]);
      setMostRecentTeam((sData[sData.length - 1] as any).FullName || "");

      const positions = [...new Set(sData.map((s: any) => s.Position).filter(Boolean))] as string[];
      setDetectedPositions(positions);

      // Build match log from results (for W/L and opponent info) — still needed for the log
      const pid2 = pid;
      const allOrFilters: string[] = [];
      if (positions.includes("Chaser")) allOrFilters.push(`HomeChaser1ID.eq.${pid2}`,`HomeChaser2ID.eq.${pid2}`,`HomeChaser3ID.eq.${pid2}`,`AwayChaser1ID.eq.${pid2}`,`AwayChaser2ID.eq.${pid2}`,`AwayChaser3ID.eq.${pid2}`);
      if (positions.includes("Seeker")) allOrFilters.push(`HomeSeekerID.eq.${pid2}`,`AwaySeekerID.eq.${pid2}`);
      if (positions.includes("Keeper")) allOrFilters.push(`HomeKeeperID.eq.${pid2}`,`AwayKeeperID.eq.${pid2}`);
      if (positions.includes("Beater")) allOrFilters.push(`HomeBeater1ID.eq.${pid2}`,`HomeBeater2ID.eq.${pid2}`,`AwayBeater1ID.eq.${pid2}`,`AwayBeater2ID.eq.${pid2}`);
      if (allOrFilters.length === 0) return;

      const [matchData, { data: leaguesData }, teamsData, mdData] = await Promise.all([
        fetchAllRows("results", {
          select: "MatchID,SeasonID,LeagueID,WeekID,SnitchCaughtTime,HomeTeamID,AwayTeamID,HomeTeamScore,AwayTeamScore,HomeKeeperID,AwayKeeperID,HomeSeekerID,AwaySeekerID,HomeChaser1ID,HomeChaser1Goals,HomeChaser2ID,HomeChaser2Goals,HomeChaser3ID,HomeChaser3Goals,AwayChaser1ID,AwayChaser1Goals,AwayChaser2ID,AwayChaser2Goals,AwayChaser3ID,AwayChaser3Goals,IsNeutralSite,HomeBeater1ID,HomeBeater2ID,AwayBeater1ID,AwayBeater2ID,HomeKeeperSaves,AwayKeeperSaves,HomeChaser1ShotAtt,HomeChaser1ShotScored,HomeChaser2ShotAtt,HomeChaser2ShotScored,HomeChaser3ShotAtt,HomeChaser3ShotScored,AwayChaser1ShotAtt,AwayChaser1ShotScored,AwayChaser2ShotAtt,AwayChaser2ShotScored,AwayChaser3ShotAtt,AwayChaser3ShotScored,HomeBeater1BludgersHit,HomeBeater2BludgersHit,AwayBeater1BludgersHit,AwayBeater2BludgersHit",
          filters: [{ method: "or", args: [allOrFilters.join(",")] }],
          order: { column: "MatchID", ascending: false },
        }),
        cachedQuery("leagues:all", async () => await supabase.from("leagues").select("LeagueID,LeagueName")),
        fetchAllRows("teams", { select: "TeamID, FullName" }),
        fetchAllRows("matchdays", { select: "MatchdayID, Matchday, SeasonID, LeagueID, MatchdayWeek" }),
      ]);

      if (!matchData || matchData.length === 0) return;
      const leagueNameMap2 = new Map<number, string>();
      (leaguesData || []).forEach((l: any) => { if (l.LeagueID && l.LeagueName) leagueNameMap2.set(l.LeagueID, l.LeagueName); });
      const teamMap = new Map<number, string>();
      (teamsData || []).forEach((t: any) => { if (t.TeamID && t.FullName) teamMap.set(t.TeamID, t.FullName); });
      const mdMap = new Map<string, string>();
      (mdData || []).forEach((md: any) => { if (md.SeasonID && md.LeagueID && md.MatchdayWeek != null && md.Matchday) mdMap.set(`${md.SeasonID}|${md.LeagueID}|${md.MatchdayWeek}`, md.Matchday); });

      const logEntries: MatchLogEntry[] = [];
      const seenMatchIds = new Set<number>();

      matchData.forEach((r: Record<string, unknown>) => {
        const matchId = r.MatchID as number;
        if (seenMatchIds.has(matchId)) return;
        seenMatchIds.add(matchId);
        const sid = r.SeasonID as number;
        const lid = r.LeagueID as number;
        const lname = leagueNameMap2.get(lid) || String(lid);
        const homePlayerIds = [r.HomeChaser1ID, r.HomeChaser2ID, r.HomeChaser3ID, r.HomeKeeperID, r.HomeSeekerID, r.HomeBeater1ID, r.HomeBeater2ID];
        const isHome = homePlayerIds.includes(pid2);
        const teamId = isHome ? (r.HomeTeamID as number) : (r.AwayTeamID as number);
        const oppId = isHome ? (r.AwayTeamID as number) : (r.HomeTeamID as number);
        const teamScore = (isHome ? r.HomeTeamScore : r.AwayTeamScore) as number || 0;
        const oppScore = (isHome ? r.AwayTeamScore : r.HomeTeamScore) as number || 0;
        const isNeutral = !!(r.IsNeutralSite);
        let matchPos: string | null = null;
        if ([r.HomeChaser1ID, r.HomeChaser2ID, r.HomeChaser3ID, r.AwayChaser1ID, r.AwayChaser2ID, r.AwayChaser3ID].includes(pid2)) matchPos = "Chaser";
        else if ([r.HomeSeekerID, r.AwaySeekerID].includes(pid2)) matchPos = "Seeker";
        else if ([r.HomeKeeperID, r.AwayKeeperID].includes(pid2)) matchPos = "Keeper";
        else if ([r.HomeBeater1ID, r.HomeBeater2ID, r.AwayBeater1ID, r.AwayBeater2ID].includes(pid2)) matchPos = "Beater";

        let stat = "";
        if (matchPos === "Chaser") {
          const chasers = [[r.HomeChaser1ID, r.HomeChaser1Goals], [r.HomeChaser2ID, r.HomeChaser2Goals], [r.HomeChaser3ID, r.HomeChaser3Goals], [r.AwayChaser1ID, r.AwayChaser1Goals], [r.AwayChaser2ID, r.AwayChaser2Goals], [r.AwayChaser3ID, r.AwayChaser3Goals]];
          const g = chasers.find(([cid]) => cid === pid2)?.[1] as number || 0;
          stat = String(g);
        } else if (matchPos === "Seeker") {
          const caught = r.SnitchCaughtBy === pid2 || (isHome ? r.HomeSeekerID === pid2 && (r.HomeTeamScore as number) > ((r.AwayTeamScore as number) || 0) + 140 : r.AwaySeekerID === pid2 && (r.AwayTeamScore as number) > ((r.HomeTeamScore as number) || 0) + 140);
          stat = caught ? "1" : "0";
        } else if (matchPos === "Keeper") {
          const saves = (isHome ? r.HomeKeeperSaves : r.AwayKeeperSaves) as number || 0;
          stat = String(saves);
        } else if (matchPos === "Beater") {
          const bhField = isHome ? (r.HomeBeater1ID === pid2 ? r.HomeBeater1BludgersHit : r.HomeBeater2BludgersHit) : (r.AwayBeater1ID === pid2 ? r.AwayBeater1BludgersHit : r.AwayBeater2BludgersHit);
          stat = String(bhField as number || 0);
        }

        const weekId = r.WeekID as number;
        const dateStr = mdMap.get(`${sid}|${lid}|${weekId}`) || null;
        logEntries.push({
          MatchID: matchId, SeasonID: sid,
          opponentName: teamMap.get(oppId) || String(oppId),
          isHome, isNeutral, teamScore, oppScore, stat,
          date: dateStr,
          leagueName: lname,
        });
      });

      logEntries.sort((a, b) => (a.SeasonID || 0) - (b.SeasonID || 0) || (a.date || "").localeCompare(b.date || ""));
      setMatchLog(logEntries);

      // Build league maxes for leader highlighting — fetch all seasons in PARALLEL (not sequential)
      const playerName = (sData[0] as any).PlayerName;
      const seasonIds = [...new Set(sData.map((s: any) => s.SeasonID).filter(Boolean))] as number[];
      const maxMap = new Map<string, Map<string, number>>();
      const awardEntries: LeagueLeaderEntry[] = [];

      // Parallel fetch — all seasons at once, results cached by fetchAllRows
      const allSeasonStats = await Promise.all(
        seasonIds.map(sid =>
          fetchAllRows("player_season_stats", {
            select: "PlayerName,Goals,GoldenSnitchCatches,KeeperSaves,KeeperShotsFaced,GamesPlayed,Position,SeasonID,LeagueName",
            filters: [{ method: "eq", args: ["SeasonID", sid] }],
          }).then(data => ({ sid, data }))
        )
      );

      for (const { sid, data: seasonStats } of allSeasonStats) {
        if (!seasonStats || seasonStats.length === 0) continue;
        const grouped = new Map<string, typeof seasonStats>();
        seasonStats.forEach((r: Record<string, unknown>) => {
          const key = `${r.SeasonID}|${r.LeagueName}`;
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push(r as typeof seasonStats[0]);
        });
        grouped.forEach((rows, pairKey) => {
          const [, ln] = pairKey.split("|");
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
        const allChasers = seasonStats.filter((r: Record<string, unknown>) => r.Position === "Chaser");
        if (allChasers.length) {
          const sorted = [...allChasers].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.Goals as number) || 0) - ((a.Goals as number) || 0));
          const rank = sorted.findIndex((r: Record<string, unknown>) => r.PlayerName === playerName) + 1;
          if (rank > 0 && rank <= 10 && !awardEntries.some(e => e.SeasonID === sid && e.stat === "Goals" && e.scope === "league")) awardEntries.push({ SeasonID: sid, LeagueName: "All Leagues", stat: "Goals", value: (sorted[rank - 1]?.Goals as number) || 0, rank, scope: "combined" });
        }
        const allSeekers = seasonStats.filter((r: Record<string, unknown>) => r.Position === "Seeker");
        if (allSeekers.length) {
          const sorted = [...allSeekers].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.GoldenSnitchCatches as number) || 0) - ((a.GoldenSnitchCatches as number) || 0));
          const rank = sorted.findIndex((r: Record<string, unknown>) => r.PlayerName === playerName) + 1;
          if (rank > 0 && rank <= 10 && !awardEntries.some(e => e.SeasonID === sid && e.stat === "Golden Snitch Catches" && e.scope === "league")) awardEntries.push({ SeasonID: sid, LeagueName: "All Leagues", stat: "Golden Snitch Catches", value: (sorted[rank - 1]?.GoldenSnitchCatches as number) || 0, rank, scope: "combined" });
        }
        const allKeepers = seasonStats.filter((r: Record<string, unknown>) => r.Position === "Keeper");
        if (allKeepers.length) {
          const sorted = [...allKeepers].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.KeeperSaves as number) || 0) - ((a.KeeperSaves as number) || 0));
          const rank = sorted.findIndex((r: Record<string, unknown>) => r.PlayerName === playerName) + 1;
          if (rank > 0 && rank <= 10 && !awardEntries.some(e => e.SeasonID === sid && e.stat === "Keeper Saves" && e.scope === "league")) awardEntries.push({ SeasonID: sid, LeagueName: "All Leagues", stat: "Keeper Saves", value: (sorted[rank - 1]?.KeeperSaves as number) || 0, rank, scope: "combined" });
        }
      }
      setLeagueMaxes(maxMap);
      awardEntries.sort((a, b) => { if (a.scope !== b.scope) return a.scope === "league" ? -1 : 1; return a.SeasonID - b.SeasonID; });
      setLeagueLeaders(awardEntries);
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

  // Use detected positions for multi-position display
  const positionsPlayed = detectedPositions.length > 0 ? detectedPositions : (player.Position ? [player.Position] : []);
  const isKeeper = positionsPlayed.includes("Keeper");
  const isSeeker = positionsPlayed.includes("Seeker");
  const isChaser = positionsPlayed.includes("Chaser");
  const isBeater = positionsPlayed.includes("Beater");
  const positionDisplay = positionsPlayed.join("/");

  // Deduplicate stats: group by SeasonID+LeagueName+FullName, show each unique row
  // (multi-position players have separate rows per position which is fine for the table)

  // Career totals
  const careerTotals = {
    gp: stats.reduce((s, r) => s + (r.GamesPlayed || 0), 0),
    goals: stats.reduce((s, r) => s + (r.Goals || 0), 0),
    gsc: stats.reduce((s, r) => s + (r.GoldenSnitchCatches || 0), 0),
    saves: stats.reduce((s, r) => s + (r.KeeperSaves || 0), 0),
    shotsFaced: stats.reduce((s, r) => s + (r.KeeperShotsFaced || 0), 0),
    minutes: stats.reduce((s, r) => s + (r.MinPlayed || 0), 0),
    shotAtt: stats.reduce((s, r) => s + (r.ShotAtt || 0), 0),
    shotScored: stats.reduce((s, r) => s + (r.ShotScored || 0), 0),
    passAtt: stats.reduce((s, r) => s + (r.PassAtt || 0), 0),
    passComp: stats.reduce((s, r) => s + (r.PassComp || 0), 0),
    keeperPassAtt: stats.reduce((s, r) => s + (r.KeeperPassAtt || 0), 0),
    keeperPassComp: stats.reduce((s, r) => s + (r.KeeperPassComp || 0), 0),
    bludgersHit: stats.reduce((s, r) => s + (r.BludgersHit || 0), 0),
    turnoversForced: stats.reduce((s, r) => s + (r.TurnoversForced || 0), 0),
    teammatesProtected: stats.reduce((s, r) => s + (r.TeammatesProtected || 0), 0),
    bludgerShotsFaced: stats.reduce((s, r) => s + (r.BludgerShotsFaced || 0), 0),
    snitchSpotted: stats.reduce((s, r) => s + (r.SnitchSpotted || 0), 0),
  };

  const allTimeGoals = Math.max(0, ...stats.filter(s => s.Position === "Chaser").map(s => s.Goals || 0));
  const allTimeGSC = Math.max(0, ...stats.filter(s => s.Position === "Seeker").map(s => s.GoldenSnitchCatches || 0));
  const allTimeSaves = Math.max(0, ...stats.filter(s => s.Position === "Keeper").map(s => s.KeeperSaves || 0));
  const allTimeGP = Math.max(0, ...stats.map(s => s.GamesPlayed || 0));
  const allTimeMinutes = Math.max(0, ...stats.map(s => s.MinPlayed || 0));

  // Competition ordering within the same season
  const compOrder: Record<string, number> = {
    "African Super League": 1, "National Quidditch Association": 1, "British and Irish Quidditch League": 1,
    "Ligue Francaise": 1, "Nordiska Ligan": 1, "Eastern European League": 1,
    "Australian Quidditch League": 1, "Nippon Professional Quidditch": 1, "Sudaconditch": 1,
    "Liga Mexicana": 1, "Banerjee Cup": 1, "Chinese Association Quidditch League": 1,
    "Balkan Championship": 1, "East African Regional League": 1,
    // Cups second
    "European Cup": 2, "All-Africa Cup": 2, "Americas Cup": 2, "Pacific Cup": 2,
    // CL third
    "Champions League": 3,
    // International last
    "Quidditch World Cup": 4,
  };
  const getCompOrder = (name: string | null) => compOrder[name || ""] || (name ? 5 : 99);

  // Sort stats: by season ASC (oldest first), then by competition order within same season
  const sortedStats = [...stats].sort((a, b) => {
    const sA = a.SeasonID || 0, sB = b.SeasonID || 0;
    if (sA !== sB) return sA - sB;
    return getCompOrder(a.LeagueName) - getCompOrder(b.LeagueName);
  });

  // All unique competitions for filter dropdown
  const allComps = [...new Set(stats.map(s => s.LeagueName).filter(Boolean))] as string[];
  // Domestic league names (LeagueID 1-14) from the leagueNameMap built during data fetch
  const domesticLeagueNames = new Set(
    [...leagueNameMap.entries()].filter(([id]) => id >= 1 && id <= 14).map(([, name]) => name)
  );
  const hasDomesticComps = allComps.some(c => domesticLeagueNames.has(c));

  const filteredStats = compFilter === "all"
    ? sortedStats
    : compFilter === "domestic"
    ? sortedStats.filter(s => s.LeagueName && domesticLeagueNames.has(s.LeagueName))
    : sortedStats.filter(s => s.LeagueName === compFilter);

  // Career bests per competition (for gold shading)
  // Key is either the league name OR "domestic" for all domestic leagues pooled
  const bestByComp = new Map<string, CompBest>();
  const bestExtByComp = new Map<string, ExtBest>();

  const updateBests = (key: string, s: typeof stats[0]) => {
    const mins = s.MinPlayed || 0;
    const existing = bestByComp.get(key) || { goals: 0, gsc: 0, saves: 0, sf: 0, gp: 0, mins: 0 };
    const existingExt = bestExtByComp.get(key) || { shotPct: null, passPct: null, snitchPct: null, svPct: null, keeperPassPct: null, bludgersHit: 0, turnovers: 0, teammates: 0, sfPerGP: null, minPerGoal: null };
    if ((s.Goals || 0) > existing.goals) existing.goals = s.Goals || 0;
    if ((s.GoldenSnitchCatches || 0) > existing.gsc) existing.gsc = s.GoldenSnitchCatches || 0;
    if ((s.KeeperSaves || 0) > existing.saves) existing.saves = s.KeeperSaves || 0;
    if ((s.KeeperShotsFaced || 0) > existing.sf) existing.sf = s.KeeperShotsFaced || 0;
    if ((s.GamesPlayed || 0) > existing.gp) existing.gp = s.GamesPlayed || 0;
    if (mins > existing.mins) existing.mins = mins;
    const shotAtt = s.ShotAtt || 0; const shotScored = s.ShotScored || 0;
    const passAtt = s.PassAtt || 0; const passComp = s.PassComp || 0;
    const kPassAtt = s.KeeperPassAtt || 0; const kPassComp = s.KeeperPassComp || 0;
    const bh = s.BludgersHit || 0; const tf = s.TurnoversForced || 0; const tp = s.TeammatesProtected || 0;
    const bsf = s.BludgerShotsFaced || 0;
    if (shotAtt > 0) { const v = (shotScored / shotAtt) * 100; if (existingExt.shotPct === null || v > existingExt.shotPct) existingExt.shotPct = v; }
    if (passAtt > 0 && s.Position === "Chaser") { const v = (passComp / passAtt) * 100; if (existingExt.passPct === null || v > existingExt.passPct) existingExt.passPct = v; }
    if (kPassAtt > 0 && s.Position === "Keeper") { const v = (kPassComp / kPassAtt) * 100; if (existingExt.keeperPassPct === null || v > existingExt.keeperPassPct) existingExt.keeperPassPct = v; }
    if ((s.GamesPlayed || 0) > 0 && (s.GoldenSnitchCatches || 0) > 0) { const v = ((s.GoldenSnitchCatches || 0) / (s.GamesPlayed || 1)) * 100; if (existingExt.snitchPct === null || v > existingExt.snitchPct) existingExt.snitchPct = v; }
    if ((s.KeeperShotsFaced || 0) > 0) { const v = (s.KeeperSaves || 0) / (s.KeeperShotsFaced || 1) * 100; if (existingExt.svPct === null || v > existingExt.svPct) existingExt.svPct = v; }
    if (bh > existingExt.bludgersHit) existingExt.bludgersHit = bh;
    if (tf > existingExt.turnovers) existingExt.turnovers = tf;
    if (tp > existingExt.teammates) existingExt.teammates = tp;
    if ((s.GamesPlayed || 0) > 0 && bsf > 0) { const v = bsf / (s.GamesPlayed || 1); if (existingExt.sfPerGP === null || v > existingExt.sfPerGP) existingExt.sfPerGP = v; }
    if ((s.Goals || 0) > 0 && mins > 0) { const v = mins / (s.Goals || 1); if (existingExt.minPerGoal === null || v < existingExt.minPerGoal) existingExt.minPerGoal = v; }
    bestByComp.set(key, existing);
    bestExtByComp.set(key, existingExt);
  };

  stats.forEach(s => {
    const key = s.LeagueName || "Unknown";
    updateBests(key, s);
    if (s.LeagueName && domesticLeagueNames.has(s.LeagueName)) updateBests("domestic", s);
  });

  // By Competition aggregates — now directly from view fields
  const byCompetition = new Map<string, { gp: number; goals: number; gsc: number; saves: number; shotsFaced: number; minutes: number; shotAtt: number; shotScored: number; passAtt: number; passComp: number; kPassAtt: number; kPassComp: number; bh: number; tf: number; tp: number; bsf: number; snitchSpotted: number }>();
  stats.forEach((s) => {
    const key = s.LeagueName || "Unknown";
    const ex = byCompetition.get(key) || { gp: 0, goals: 0, gsc: 0, saves: 0, shotsFaced: 0, minutes: 0, shotAtt: 0, shotScored: 0, passAtt: 0, passComp: 0, kPassAtt: 0, kPassComp: 0, bh: 0, tf: 0, tp: 0, bsf: 0, snitchSpotted: 0 };
    ex.gp += s.GamesPlayed || 0; ex.goals += s.Goals || 0; ex.gsc += s.GoldenSnitchCatches || 0;
    ex.saves += s.KeeperSaves || 0; ex.shotsFaced += s.KeeperShotsFaced || 0; ex.minutes += s.MinPlayed || 0;
    ex.shotAtt += s.ShotAtt || 0; ex.shotScored += s.ShotScored || 0;
    ex.passAtt += s.PassAtt || 0; ex.passComp += s.PassComp || 0;
    ex.kPassAtt += s.KeeperPassAtt || 0; ex.kPassComp += s.KeeperPassComp || 0;
    ex.bh += s.BludgersHit || 0; ex.tf += s.TurnoversForced || 0; ex.tp += s.TeammatesProtected || 0;
    ex.bsf += s.BludgerShotsFaced || 0; ex.snitchSpotted += s.SnitchSpotted || 0;
    byCompetition.set(key, ex);
  });

  function isLeagueLeader(s: StatLine, statKey: string): boolean {
    const pairKey = `${s.SeasonID}|${s.LeagueName}`;
    const maxes = leagueMaxes.get(pairKey);
    if (!maxes) return false;
    const max = maxes.get(statKey);
    if (max == null) return false;
    const val = statKey === "Goals" ? (s.Goals || 0) : statKey === "GoldenSnitchCatches" ? (s.GoldenSnitchCatches || 0) : statKey === "KeeperSaves" ? (s.KeeperSaves || 0) : 0;
    return val > 0 && val === max;
  }

  function allTimeClass(val: number, best: number): string {
    if (stats.length === 0 || best === 0) return "";
    return val === best ? "bg-yellow-100 dark:bg-yellow-900/30 font-bold" : "";
  }

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground";
  const tdClass = "px-3 py-1.5 text-foreground";

  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // Match log sorting and filtering
  const matchLogSeasons = [...new Set(matchLog.map(m => m.SeasonID).filter(Boolean))].sort((a, b) => (b || 0) - (a || 0)) as number[];
  const filteredMatchLog = matchLogSeason === "all" ? matchLog : matchLog.filter(m => m.SeasonID === matchLogSeason);
  const sortedMatchLog = [...filteredMatchLog].sort((a, b) => {
    if (matchLogSortKey === "date") {
      const dateA = a.date || "";
      const dateB = b.date || "";
      return matchLogSortDir === "asc" ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    }
    if (matchLogSortKey === "season") {
      return matchLogSortDir === "asc" ? (a.SeasonID || 0) - (b.SeasonID || 0) : (b.SeasonID || 0) - (a.SeasonID || 0);
    }
    if (matchLogSortKey === "score") {
      return matchLogSortDir === "asc" ? a.teamScore - b.teamScore : b.teamScore - a.teamScore;
    }
    return 0;
  });
  const toggleMatchLogSort = (key: string) => {
    if (matchLogSortKey === key) {
      setMatchLogSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setMatchLogSortKey(key);
      setMatchLogSortDir(key === "date" ? "asc" : "desc");
    }
  };
  const mlSortInd = (key: string) => matchLogSortKey === key ? (matchLogSortDir === "asc" ? " ↑" : " ↓") : "";

  // Determine stat column header for match log (multi-position: show generic)
  const matchStatHeader = positionsPlayed.length > 1 ? "Stat" : isChaser ? "Goals" : isKeeper ? "Saves" : isSeeker ? "GSC" : isBeater ? "BH/TF" : "Stat";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8">
        {/* Header */}
        <div className="mb-6 border-b-2 border-primary pb-4">
          <div className="flex items-start gap-6">
            <div className="w-32 h-40 bg-muted border border-border rounded flex items-center justify-center shrink-0 overflow-hidden">
              {player.headshot_url ? (
                <img src={player.headshot_url} alt={player.PlayerName || "Player"} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl text-muted-foreground">👤</span>
              )}
            </div>
            <div className="flex-1">
              <h1 className="font-display text-3xl font-bold text-foreground">
                {player.FirstName} {player.LastName}
              </h1>
              <p className="text-lg text-muted-foreground font-sans mt-1">
                {positionDisplay} ·{" "}
                {mostRecentTeam ? (
                  <Link to={`/team/${encodeURIComponent(mostRecentTeam)}`} className="hover:text-accent text-accent">
                    {mostRecentTeam}
                  </Link>
                ) : "—"}
              </p>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-sans">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Born</p>
                  <p className="font-medium">{formatDate(player.DOB)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Nationality</p>
                  <p className="font-medium">
                    {player.NationalityID ? (
                      <Link to={`/nation/${player.NationalityID}`} className="hover:text-accent">
                        {getNationFlag(nation)} {nation}
                      </Link>
                    ) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Height / Weight</p>
                  <p className="font-medium">{formatHeight(player.Height)} · {player.Weight ? `${player.Weight} lbs` : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Handedness</p>
                  <p className="font-medium">{player.Handedness === "R" ? "Right" : player.Handedness === "L" ? "Left" : player.Handedness || "—"}</p>
                </div>
                {player.Gender && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Gender</p>
                    <p className={`font-medium ${player.Gender.toLowerCase() === 'male' ? 'text-blue-600 dark:text-blue-400' : player.Gender.toLowerCase() === 'female' ? 'text-pink-600 dark:text-pink-400' : ''}`}>
                      {player.Gender.toLowerCase() === 'm' || player.Gender.toLowerCase() === 'male' ? 'Male' :
                       player.Gender.toLowerCase() === 'f' || player.Gender.toLowerCase() === 'female' ? 'Female' :
                       player.Gender}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Season-by-season stats */}
          <div className="border border-border rounded overflow-hidden">
            <div className="bg-table-header px-3 py-2 flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-display text-sm font-bold text-table-header-foreground">Season-by-Season Statistics</h3>
              {allComps.length > 1 && (
                <select
                  value={compFilter}
                  onChange={e => setCompFilter(e.target.value)}
                  className="text-xs bg-popover text-popover-foreground border border-border rounded px-2 py-1 font-sans"
                >
                  <option value="all">All Competitions</option>
                  {hasDomesticComps && <option value="domestic">All League Matches</option>}
                  {allComps.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-sans">
                <thead>
                  <tr className="bg-secondary">
                    <th className={`${thClass} text-left`}>Season</th>
                    <th className={`${thClass} text-right`}>Age</th>
                    <th className={`${thClass} text-left`}>Comp</th>
                    <th className={`${thClass} text-left`}>Team</th>
                    {positionsPlayed.length > 1 && <th className={`${thClass} text-left`}>Pos</th>}
                    <th className={`${thClass} text-right`}>GP</th>
                    <th className={`${thClass} text-right`}>Min</th>
                    {isChaser && <th className={`${thClass} text-right`}>Goals</th>}
                    {isChaser && <th className={`${thClass} text-right`}>Sh%</th>}
                    {isChaser && <th className={`${thClass} text-right`}>Pass%</th>}
                    {isChaser && <th className={`${thClass} text-right`}>Min/G</th>}
                    {isSeeker && <th className={`${thClass} text-right`}>GSC</th>}
                    {isSeeker && <th className={`${thClass} text-right`}>Snitch%</th>}
                    {isSeeker && <th className={`${thClass} text-right`}>Spotted</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Saves</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>SF</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Sv%</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Pass%</th>}
                    {isBeater && <th className={`${thClass} text-right`}>BH</th>}
                    {isBeater && <th className={`${thClass} text-right`}>TF</th>}
                    {isBeater && <th className={`${thClass} text-right`}>TP</th>}
                    {isBeater && <th className={`${thClass} text-right`}>SF/GP</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredStats.map((s, i) => {
                    const rowIsChaser = s.Position === "Chaser";
                    const rowIsSeeker = s.Position === "Seeker";
                    const rowIsKeeper = s.Position === "Keeper";
                    const rowIsBeater = s.Position === "Beater";

                    const isLeader = rowIsChaser ? isLeagueLeader(s, "Goals")
                      : rowIsSeeker ? isLeagueLeader(s, "GoldenSnitchCatches")
                      : rowIsKeeper ? isLeagueLeader(s, "KeeperSaves")
                      : false;
                    const compKey = compFilter === "domestic" && s.LeagueName && domesticLeagueNames.has(s.LeagueName)
                      ? "domestic"
                      : (s.LeagueName || "Unknown");
                    const compBest = bestByComp.get(compKey);
                    const extBest = bestExtByComp.get(compKey) || null;

                    // All values come directly from player_season_stats view
                    const mins = s.MinPlayed || 0;
                    const shotAtt = s.ShotAtt || 0; const shotScored = s.ShotScored || 0;
                    const passAtt = s.PassAtt || 0; const passComp = s.PassComp || 0;
                    const kPassAtt = s.KeeperPassAtt || 0; const kPassComp = s.KeeperPassComp || 0;
                    const bsf = s.BludgerShotsFaced || 0;

                    // Compute all displayed values
                    const minPerGoalVal = rowIsChaser && (s.Goals || 0) > 0 && mins > 0
                      ? mins / (s.Goals || 1) : null;
                    const shotPctVal = rowIsChaser && shotAtt > 0
                      ? (shotScored / shotAtt) * 100 : null;
                    const passPctChaserVal = rowIsChaser && passAtt > 0
                      ? (passComp / passAtt) * 100 : null;
                    const snitchPctVal = rowIsSeeker && (s.GamesPlayed || 0) > 0
                      ? ((s.GoldenSnitchCatches || 0) / (s.GamesPlayed || 1)) * 100 : null;
                    const svPctVal = rowIsKeeper && (s.KeeperShotsFaced || 0) > 0
                      ? (s.KeeperSaves || 0) / (s.KeeperShotsFaced || 1) * 100 : null;
                    const passPctKeeperVal = rowIsKeeper && kPassAtt > 0
                      ? (kPassComp / kPassAtt) * 100 : null;
                    const sfPerGPVal = rowIsBeater && (s.GamesPlayed || 0) > 0 && bsf > 0
                      ? bsf / (s.GamesPlayed || 1) : null;
                    const bludgersHitVal = rowIsBeater ? (s.BludgersHit || 0) : null;
                    const turnoversVal = rowIsBeater ? (s.TurnoversForced || 0) : null;
                    const teammatesVal = rowIsBeater ? (s.TeammatesProtected || 0) : null;
                    const snitchSpottedVal = rowIsSeeker ? (s.SnitchSpotted || 0) : null;
                    const sfVal = rowIsKeeper ? (s.KeeperShotsFaced || 0) : null;

                    // SWAPPED: Gold shading = league leader that season; Bold italic = career best for competition
                    const goldBg = "bg-yellow-100 dark:bg-yellow-900/30";
                    const careerBestStyle = "font-bold italic";
                    const cc = (isBest: boolean, isLead: boolean) => isLead ? goldBg : isBest ? careerBestStyle : "";

                    const goalsBest = rowIsChaser && compBest && (s.Goals || 0) > 0 && (s.Goals || 0) === compBest.goals;
                    const gscBest = rowIsSeeker && compBest && (s.GoldenSnitchCatches || 0) > 0 && (s.GoldenSnitchCatches || 0) === compBest.gsc;
                    const savesBest = rowIsKeeper && compBest && (s.KeeperSaves || 0) > 0 && (s.KeeperSaves || 0) === compBest.saves;
                    const sfBest = rowIsKeeper && compBest && (s.KeeperShotsFaced || 0) > 0 && (s.KeeperShotsFaced || 0) === compBest.sf;
                    const gpBest = compBest && (s.GamesPlayed || 0) > 0 && (s.GamesPlayed || 0) === compBest.gp;
                    const minsBest = compBest && mins > 0 && mins === compBest.mins;

                    // Rate stat bests — compare actual value to stored best (null-safe)
                    const EPS = 0.001; // float tolerance
                    const shotPctBest = rowIsChaser && shotPctVal !== null && extBest?.shotPct !== null && extBest?.shotPct !== undefined && Math.abs(shotPctVal - extBest.shotPct) < EPS;
                    const passPctChaserBest = rowIsChaser && passPctChaserVal !== null && extBest?.passPct !== null && extBest?.passPct !== undefined && Math.abs(passPctChaserVal - extBest.passPct) < EPS;
                    const minPerGoalBest = rowIsChaser && minPerGoalVal !== null && extBest?.minPerGoal !== null && extBest?.minPerGoal !== undefined && Math.abs(minPerGoalVal - extBest.minPerGoal) < EPS;
                    const snitchPctBest = rowIsSeeker && snitchPctVal !== null && extBest?.snitchPct !== null && extBest?.snitchPct !== undefined && Math.abs(snitchPctVal - extBest.snitchPct) < EPS;
                    const svPctBest = rowIsKeeper && svPctVal !== null && extBest?.svPct !== null && extBest?.svPct !== undefined && Math.abs(svPctVal - extBest.svPct) < EPS;
                    const keeperPassPctBest = rowIsKeeper && passPctKeeperVal !== null && extBest?.keeperPassPct !== null && extBest?.keeperPassPct !== undefined && Math.abs(passPctKeeperVal - extBest.keeperPassPct) < EPS;
                    const bludgersBest = rowIsBeater && bludgersHitVal !== null && bludgersHitVal > 0 && extBest?.bludgersHit !== undefined && bludgersHitVal === extBest.bludgersHit;
                    const turnoversBest = rowIsBeater && turnoversVal !== null && turnoversVal > 0 && extBest?.turnovers !== undefined && turnoversVal === extBest.turnovers;
                    const sfPerGPBest = rowIsBeater && sfPerGPVal !== null && extBest?.sfPerGP !== null && extBest?.sfPerGP !== undefined && Math.abs(sfPerGPVal - extBest.sfPerGP) < EPS;

                    const rowClass = `border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`;

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
                        {positionsPlayed.length > 1 && <td className={`${tdClass} text-xs text-muted-foreground`}>{s.Position}</td>}
                        <td className={`px-3 py-1.5 text-right font-mono ${cc(gpBest, false)}`}>{s.GamesPlayed}</td>
                        <td className={`px-3 py-1.5 text-right font-mono ${cc(minsBest, false)}`}>{fmtMin(mins)}</td>
                        {isChaser && <td className={`px-3 py-1.5 text-right font-mono ${rowIsChaser ? cc(goalsBest, isLeader) : ""}`}>{rowIsChaser ? (s.Goals || 0) : "—"}</td>}
                        {isChaser && <td className={`px-3 py-1.5 text-right font-mono ${rowIsChaser ? cc(shotPctBest, isLeader) : "text-muted-foreground"}`}>{rowIsChaser ? (shotPctVal !== null ? shotPctVal.toFixed(1) + "%" : "—") : "—"}</td>}
                        {isChaser && <td className={`px-3 py-1.5 text-right font-mono ${rowIsChaser ? cc(passPctChaserBest, isLeader) : "text-muted-foreground"}`}>{rowIsChaser ? (passPctChaserVal !== null ? passPctChaserVal.toFixed(1) + "%" : "—") : "—"}</td>}
                        {isChaser && <td className={`px-3 py-1.5 text-right font-mono ${rowIsChaser ? cc(minPerGoalBest, isLeader) : "text-muted-foreground"}`}>{rowIsChaser ? (minPerGoalVal !== null ? minPerGoalVal.toFixed(1) : "—") : "—"}</td>}
                        {isSeeker && <td className={`px-3 py-1.5 text-right font-mono ${rowIsSeeker ? cc(gscBest, isLeader) : ""}`}>{rowIsSeeker ? (s.GoldenSnitchCatches || 0) : "—"}</td>}
                        {isSeeker && <td className={`px-3 py-1.5 text-right font-mono ${rowIsSeeker ? cc(snitchPctBest, isLeader) : "text-muted-foreground"}`}>{rowIsSeeker ? (snitchPctVal !== null ? snitchPctVal.toFixed(1) + "%" : "—") : "—"}</td>}
                        {isSeeker && <td className={`px-3 py-1.5 text-right font-mono ${rowIsSeeker ? cc(false, isLeader) : "text-muted-foreground"}`}>{rowIsSeeker ? (snitchSpottedVal ?? "—") : "—"}</td>}
                        {isKeeper && <td className={`px-3 py-1.5 text-right font-mono ${rowIsKeeper ? cc(savesBest, isLeader) : ""}`}>{rowIsKeeper ? (s.KeeperSaves || 0) : "—"}</td>}
                        {isKeeper && <td className={`px-3 py-1.5 text-right font-mono ${rowIsKeeper ? cc(sfBest, isLeader) : ""}`}>{rowIsKeeper ? (sfVal ?? "—") : "—"}</td>}
                        {isKeeper && <td className={`px-3 py-1.5 text-right font-mono ${rowIsKeeper ? cc(svPctBest, isLeader) : "text-muted-foreground"}`}>{rowIsKeeper ? (svPctVal !== null ? svPctVal.toFixed(1) + "%" : "—") : "—"}</td>}
                        {isKeeper && <td className={`px-3 py-1.5 text-right font-mono ${rowIsKeeper ? cc(keeperPassPctBest, isLeader) : "text-muted-foreground"}`}>{rowIsKeeper ? (passPctKeeperVal !== null ? passPctKeeperVal.toFixed(1) + "%" : "—") : "—"}</td>}
                        {isBeater && <td className={`px-3 py-1.5 text-right font-mono ${rowIsBeater ? cc(bludgersBest, isLeader) : ""}`}>{rowIsBeater ? (bludgersHitVal ?? "—") : "—"}</td>}
                        {isBeater && <td className={`px-3 py-1.5 text-right font-mono ${rowIsBeater ? cc(turnoversBest, isLeader) : ""}`}>{rowIsBeater ? (turnoversVal ?? "—") : "—"}</td>}
                        {isBeater && <td className={`px-3 py-1.5 text-right font-mono ${rowIsBeater ? cc(false, isLeader) : ""}`}>{rowIsBeater ? (teammatesVal ?? "—") : "—"}</td>}
                        {isBeater && <td className={`px-3 py-1.5 text-right font-mono ${rowIsBeater ? cc(sfPerGPBest, isLeader) : "text-muted-foreground"}`}>{rowIsBeater ? (sfPerGPVal !== null ? sfPerGPVal.toFixed(2) : "—") : "—"}</td>}
                      </tr>
                    );
                  })}
                  {(() => {
                    const ct = "px-3 py-1.5 text-right font-mono text-primary";
                    return (
                      <tr className="border-t-2 border-primary bg-primary/5 font-bold">
                        <td className="px-3 py-1.5 text-primary font-mono" colSpan={positionsPlayed.length > 1 ? 5 : 4}>Career Totals</td>
                        <td className={ct}>{careerTotals.gp}</td>
                        <td className={ct}>{careerTotals.minutes > 0 ? careerTotals.minutes : "—"}</td>
                        {isChaser && <td className={ct}>{careerTotals.goals}</td>}
                        {isChaser && <td className={ct}>{careerTotals.shotAtt > 0 ? ((careerTotals.shotScored / careerTotals.shotAtt) * 100).toFixed(1) + "%" : "—"}</td>}
                        {isChaser && <td className={ct}>{careerTotals.passAtt > 0 ? ((careerTotals.passComp / careerTotals.passAtt) * 100).toFixed(1) + "%" : "—"}</td>}
                        {isChaser && <td className={ct}>{careerTotals.minutes > 0 && careerTotals.goals > 0 ? (careerTotals.minutes / careerTotals.goals).toFixed(1) : "—"}</td>}
                        {isSeeker && <td className={ct}>{careerTotals.gsc}</td>}
                        {isSeeker && <td className={ct}>{careerTotals.gp > 0 ? ((careerTotals.gsc / careerTotals.gp) * 100).toFixed(1) + "%" : "—"}</td>}
                        {isSeeker && <td className={ct}>{careerTotals.snitchSpotted}</td>}
                        {isKeeper && <td className={ct}>{careerTotals.saves}</td>}
                        {isKeeper && <td className={ct}>{careerTotals.shotsFaced}</td>}
                        {isKeeper && <td className={ct}>{careerTotals.shotsFaced > 0 ? ((careerTotals.saves / careerTotals.shotsFaced) * 100).toFixed(1) + "%" : "—"}</td>}
                        {isKeeper && <td className={ct}>{careerTotals.keeperPassAtt > 0 ? ((careerTotals.keeperPassComp / careerTotals.keeperPassAtt) * 100).toFixed(1) + "%" : "—"}</td>}
                        {isBeater && <td className={ct}>{careerTotals.bludgersHit}</td>}
                        {isBeater && <td className={ct}>{careerTotals.turnoversForced}</td>}
                        {isBeater && <td className={ct}>{careerTotals.teammatesProtected}</td>}
                        {isBeater && <td className={ct}>{careerTotals.gp > 0 && careerTotals.bludgerShotsFaced > 0 ? (careerTotals.bludgerShotsFaced / careerTotals.gp).toFixed(2) : "—"}</td>}
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-1.5 bg-secondary/50 text-xs text-muted-foreground font-sans flex gap-4 flex-wrap">
              <span><span className="bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">Shaded</span> = league leader that season</span>
              <span><span className="font-bold italic">Bold italic</span> = career best for competition</span>
              {isChaser && <span>Sh% = Shooting%, Pass% = Passing%</span>}
              {isBeater && <span>BH = Bludgers Hit, TF = Turnovers Forced, TP = Teammates Protected</span>}
              {isSeeker && <span>Spotted = Snitch Spottings</span>}
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
                    {isChaser && <th className={`${thClass} text-right`}>Sh%</th>}
                    {isChaser && <th className={`${thClass} text-right`}>Pass%</th>}
                    {isChaser && <th className={`${thClass} text-right`}>Min/G</th>}
                    {isSeeker && <th className={`${thClass} text-right`}>GSC</th>}
                    {isSeeker && <th className={`${thClass} text-right`}>Snitch%</th>}
                    {isSeeker && <th className={`${thClass} text-right`}>Spotted</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Saves</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>SF</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Sv%</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Pass%</th>}
                    {isBeater && <th className={`${thClass} text-right`}>BH</th>}
                    {isBeater && <th className={`${thClass} text-right`}>TF</th>}
                    {isBeater && <th className={`${thClass} text-right`}>TP</th>}
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
                      {isChaser && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.shotAtt > 0 ? ((totals.shotScored / totals.shotAtt) * 100).toFixed(1) + "%" : "—"}</td>}
                      {isChaser && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.passAtt > 0 ? ((totals.passComp / totals.passAtt) * 100).toFixed(1) + "%" : "—"}</td>}
                      {isChaser && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.minutes > 0 && totals.goals > 0 ? (totals.minutes / totals.goals).toFixed(1) : "—"}</td>}
                      {isSeeker && <td className={`${tdClass} text-right font-mono`}>{totals.gsc}</td>}
                      {isSeeker && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.gp > 0 ? ((totals.gsc / totals.gp) * 100).toFixed(1) + "%" : "—"}</td>}
                      {isSeeker && <td className={`${tdClass} text-right font-mono`}>{totals.snitchSpotted}</td>}
                      {isKeeper && <td className={`${tdClass} text-right font-mono`}>{totals.saves}</td>}
                      {isKeeper && <td className={`${tdClass} text-right font-mono`}>{totals.shotsFaced}</td>}
                      {isKeeper && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.shotsFaced > 0 ? ((totals.saves / totals.shotsFaced) * 100).toFixed(1) + "%" : "—"}</td>}
                      {isKeeper && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.kPassAtt > 0 ? ((totals.kPassComp / totals.kPassAtt) * 100).toFixed(1) + "%" : "—"}</td>}
                      {isBeater && <td className={`${tdClass} text-right font-mono`}>{totals.bh}</td>}
                      {isBeater && <td className={`${tdClass} text-right font-mono`}>{totals.tf}</td>}
                      {isBeater && <td className={`${tdClass} text-right font-mono`}>{totals.tp}</td>}
                      {isBeater && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.gp > 0 && totals.bsf > 0 ? (totals.bsf / totals.gp).toFixed(2) : "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Awards & Honours — Baseball Reference style */}
          {(playerAwards.length > 0 || leagueLeaders.length > 0) && (() => {
            const plLabel = (n: number) => n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
            const plColor = (n: number) =>
              n === 1 ? "text-yellow-600 dark:text-yellow-400 font-bold"
              : n === 2 ? "text-slate-500 dark:text-slate-300 font-semibold"
              : n === 3 ? "text-amber-700 dark:text-amber-500 font-semibold"
              : "text-muted-foreground";

            // ── Group formal awards by league, then by award name ──
            // For TOTY: detect whether placement = "team number" (BIQL style, multiple players share same placement)
            // or "player slot" (sequential 1…N, one player per placement).
            // Heuristic: if any placement has > 1 row → it's team number. Otherwise sequential.

            type AwardEntry = typeof playerAwards[0];

            const totyByLeague = new Map<number, AwardEntry[]>();
            const regularByLeague = new Map<number, AwardEntry[]>();

            playerAwards.forEach(a => {
              if (a.awardname === "Team of the Year") {
                if (!totyByLeague.has(a.leagueid)) totyByLeague.set(a.leagueid, []);
                totyByLeague.get(a.leagueid)!.push(a);
              } else {
                if (!regularByLeague.has(a.leagueid)) regularByLeague.set(a.leagueid, []);
                regularByLeague.get(a.leagueid)!.push(a);
              }
            });

            // All leagues that have any award
            const allLeagueIds = [...new Set(playerAwards.map(a => a.leagueid))].sort((a, b) => a - b);

            // For regular awards: group by (leagueId, awardname) → array of { seasonid, placement }
            // Then render as a mini table: rows = seasons, cols = placement badges

            // Group leaderboard by stat for the leaders section
            const leaderGroups = new Map<string, typeof leagueLeaders>();
            leagueLeaders.forEach(e => {
              if (!leaderGroups.has(e.stat)) leaderGroups.set(e.stat, []);
              leaderGroups.get(e.stat)!.push(e);
            });

            return (
              <div className="border border-border rounded overflow-hidden">
                <div className="bg-table-header px-3 py-2">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">Awards &amp; Honours</h3>
                </div>

                {/* ── Per-league award panels ── */}
                {allLeagueIds.map(lid => {
                  const lname = playerAwards.find(a => a.leagueid === lid)?.leagueName || `League ${lid}`;
                  const labbr = abbrevLeague(lname);
                  const regular = regularByLeague.get(lid) || [];
                  const toty = totyByLeague.get(lid) || [];

                  // Group regular awards by awardname
                  const awardGroups = new Map<string, AwardEntry[]>();
                  regular.forEach(a => {
                    if (!awardGroups.has(a.awardname)) awardGroups.set(a.awardname, []);
                    awardGroups.get(a.awardname)!.push(a);
                  });

                  // TOTY: detect if placement = team number or sequential slot
                  // Group TOTY by seasonid first
                  const totySeasonsMap = new Map<number, AwardEntry[]>();
                  toty.forEach(a => {
                    if (!totySeasonsMap.has(a.seasonid)) totySeasonsMap.set(a.seasonid, []);
                    totySeasonsMap.get(a.seasonid)!.push(a);
                  });
                  // For display: just show "TOTY 1st Team / 2nd Team" per season using placement as team#
                  // If placement > 3 it's probably a slot number — treat all as "Team of the Year" membership
                  const totySeasons = [...totySeasonsMap.keys()].sort((a, b) => b - a);

                  if (awardGroups.size === 0 && toty.length === 0) return null;

                  return (
                    <div key={lid} className="border-t border-border first:border-t-0">
                      {/* League header */}
                      <div className="px-3 py-1.5 bg-secondary/40 flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{labbr}</span>
                        <span className="text-xs text-muted-foreground font-sans">— {lname}</span>
                      </div>

                      {/* Regular awards: one row per award name, columns = winning seasons grouped */}
                      {awardGroups.size > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm font-sans">
                            <thead>
                              <tr className="bg-secondary/30">
                                <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-48">Award</th>
                                <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seasons</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...awardGroups.entries()].map(([awardName, entries], ai) => {
                                // Sort seasons newest first; group by placement
                                const byPl = new Map<number, AwardEntry[]>();
                                entries.forEach(e => {
                                  if (!byPl.has(e.placement)) byPl.set(e.placement, []);
                                  byPl.get(e.placement)!.push(e);
                                });
                                const placements = [...byPl.keys()].sort();

                                return (
                                  <tr key={awardName} className={`border-t border-border/50 ${ai % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                                    <td className="px-3 py-2 font-medium text-foreground text-sm align-top">
                                      <Link to={`/league/${lid}/award/${encodeURIComponent(awardName)}`} className="hover:text-accent hover:underline">
                                        {awardName}
                                      </Link>
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex flex-wrap gap-1.5">
                                        {placements.map(pl => {
                                          const seasonEntries = byPl.get(pl)!.sort((a, b) => a.seasonid - b.seasonid);
                                          return seasonEntries.map(e => (
                                            <span
                                              key={`${pl}-${e.seasonid}`}
                                              title={`${plLabel(pl)} place`}
                                              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-mono
                                                ${pl === 1 ? "bg-yellow-500/15 border-yellow-500/40 text-yellow-700 dark:text-yellow-400"
                                                  : pl === 2 ? "bg-slate-400/15 border-slate-400/40 text-slate-600 dark:text-slate-300"
                                                  : pl === 3 ? "bg-amber-700/15 border-amber-700/40 text-amber-700 dark:text-amber-500"
                                                  : "bg-muted/40 border-border text-muted-foreground"}`}
                                            >
                                              <span className="font-bold">{plLabel(pl)}</span>
                                              <span>{seasonLabel(e.seasonid)}</span>
                                            </span>
                                          ));
                                        })}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Team of the Year: show per season, with team number */}
                      {toty.length > 0 && (
                        <div className={`${awardGroups.size > 0 ? "border-t border-border/50" : ""}`}>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm font-sans">
                              {awardGroups.size === 0 && (
                                <thead>
                                  <tr className="bg-secondary/30">
                                    <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-48">Award</th>
                                    <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seasons</th>
                                  </tr>
                                </thead>
                              )}
                              <tbody>
                                <tr className="border-t border-border/50 bg-card">
                                  <td className="px-3 py-2 font-medium text-foreground text-sm align-top">
                                    <Link to={`/league/${lid}/award/${encodeURIComponent("Team of the Year")}`} className="hover:text-accent hover:underline">
                                      Team of the Year
                                    </Link>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap gap-1.5">
                                      {totySeasons.map(sid => {
                                        const entries = totySeasonsMap.get(sid)!;
                                        // If max placement <= 3 AND multiple players share a placement → it's team number
                                        // Otherwise treat all as just "selection" (show no team number)
                                        const placementCounts = new Map<number, number>();
                                        entries.forEach(e => placementCounts.set(e.placement, (placementCounts.get(e.placement) || 0) + 1));
                                        const maxPl = Math.max(...entries.map(e => e.placement));
                                        const isTeamNumber = maxPl <= 3 || [...placementCounts.values()].some(c => c > 1);

                                        // Get this player's placement(s) for this season
                                        const myPlacements = entries.map(e => e.placement).sort();
                                        const uniquePlacements = [...new Set(myPlacements)];

                                        return uniquePlacements.map(pl => (
                                          <span
                                            key={`toty-${sid}-${pl}`}
                                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-mono
                                              ${pl === 1 ? "bg-yellow-500/15 border-yellow-500/40 text-yellow-700 dark:text-yellow-400"
                                                : pl === 2 ? "bg-slate-400/15 border-slate-400/40 text-slate-600 dark:text-slate-300"
                                                : "bg-amber-700/15 border-amber-700/40 text-amber-700 dark:text-amber-500"}`}
                                          >
                                            {isTeamNumber && <span className="font-bold">{plLabel(pl)}</span>}
                                            <span>{seasonLabel(sid)}</span>
                                          </span>
                                        ));
                                      })}
                                    </div>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* ── Leaderboard appearances ── */}
                {leaderGroups.size > 0 && (
                  <div className="border-t border-border">
                    <div className="px-3 py-1.5 bg-secondary/40">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Leaderboard Appearances</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm font-sans">
                        <thead>
                          <tr className="bg-secondary/30">
                            <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-48">Stat</th>
                            <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seasons</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...leaderGroups.entries()].map(([statName, entries], ai) => {
                            const sorted = [...entries].sort((a, b) => a.SeasonID - b.SeasonID);
                            return (
                              <tr key={statName} className={`border-t border-border/50 ${ai % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                                <td className="px-3 py-2 font-medium text-foreground text-sm align-top">{statName}</td>
                                <td className="px-3 py-2">
                                  <div className="flex flex-wrap gap-1.5">
                                    {sorted.map((entry, i) => (
                                      <span
                                        key={i}
                                        title={`${entry.scope === "combined" ? "All Leagues" : abbrevLeague(entry.LeagueName)} — ${entry.value.toLocaleString()}`}
                                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-mono
                                          ${entry.rank === 1 ? "bg-yellow-500/15 border-yellow-500/40 text-yellow-700 dark:text-yellow-400"
                                            : entry.rank === 2 ? "bg-slate-400/15 border-slate-400/40 text-slate-600 dark:text-slate-300"
                                            : entry.rank === 3 ? "bg-amber-700/15 border-amber-700/40 text-amber-700 dark:text-amber-500"
                                            : "bg-muted/40 border-border text-muted-foreground"}`}
                                      >
                                        <span className="font-bold">{plLabel(entry.rank)}</span>
                                        <span>{seasonLabel(entry.SeasonID)}</span>
                                        <span className="opacity-60">{entry.scope === "combined" ? "★" : abbrevLeague(entry.LeagueName)}</span>
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Match Log */}
          {matchLog.length > 0 && (
            <div className="border border-border rounded overflow-hidden">
              <button
                onClick={() => setMatchLogOpen(o => !o)}
                className="w-full bg-table-header px-3 py-2 flex items-center justify-between"
              >
                <h3 className="font-display text-sm font-bold text-table-header-foreground">Match Log ({filteredMatchLog.length})</h3>
                {matchLogOpen ? <ChevronDown className="w-4 h-4 text-table-header-foreground" /> : <ChevronRight className="w-4 h-4 text-table-header-foreground" />}
              </button>
              {matchLogOpen && (
                <>
                  <div className="px-3 py-2 bg-secondary/30 flex items-center gap-3">
                    <label className="text-xs font-sans text-muted-foreground">Season:</label>
                    <select
                      className="text-xs font-sans border border-border rounded px-2 py-1 bg-background text-foreground"
                      value={matchLogSeason === "all" ? "all" : matchLogSeason}
                      onChange={e => setMatchLogSeason(e.target.value === "all" ? "all" : Number(e.target.value))}
                    >
                      <option value="all">All Seasons</option>
                      {matchLogSeasons.map(s => (
                        <option key={s} value={s}>{seasonLabel(s)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm font-sans">
                      <thead>
                        <tr className="bg-secondary">
                          <th className={`${thClass} text-left cursor-pointer hover:text-foreground select-none`} onClick={() => toggleMatchLogSort("date")}>Date{mlSortInd("date")}</th>
                          <th className={`${thClass} text-left cursor-pointer hover:text-foreground select-none`} onClick={() => toggleMatchLogSort("season")}>Season{mlSortInd("season")}</th>
                          <th className={`${thClass} text-left`}>Comp</th>
                          <th className={`${thClass} text-left`}>Opponent</th>
                          <th className={`${thClass} text-center`}>H/A/N</th>
                          <th className={`${thClass} text-right cursor-pointer hover:text-foreground select-none`} onClick={() => toggleMatchLogSort("score")}>Score{mlSortInd("score")}</th>
                          <th className={`${thClass} text-center`}>W/L</th>
                          <th className={`${thClass} text-right`}>{matchStatHeader}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedMatchLog.map((m, i) => {
                          const won = m.teamScore > m.oppScore;
                          const displayDate = m.date
                            ? (() => { const [y, mo, d] = m.date.split("-").map(Number); return new Date(y, mo - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); })()
                            : "—";
                          const siteLabel = m.isNeutral ? "N" : m.isHome ? "H" : "A";
                          return (
                            <tr key={m.MatchID} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                              <td className={`${tdClass} text-xs text-muted-foreground font-mono`}>{displayDate}</td>
                              <td className={`${tdClass} text-xs text-muted-foreground font-mono`}>{m.SeasonID ? seasonLabel(m.SeasonID) : "—"}</td>
                              <td className={`${tdClass} text-xs text-muted-foreground`} title={m.leagueName}>{abbrevLeague(m.leagueName)}</td>
                              <td className={tdClass}>
                                <Link to={`/team/${encodeURIComponent(m.opponentName)}`} className="text-accent hover:underline">{m.opponentName}</Link>
                              </td>
                              <td className={`${tdClass} text-center text-xs text-muted-foreground`}>{siteLabel}</td>
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
                </>
              )}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
