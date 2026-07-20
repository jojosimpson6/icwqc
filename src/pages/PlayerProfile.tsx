import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { SiteFooter } from "@/components/SiteFooter";
import { formatHeight, calculateAge, formatDate, getNationFlag, isTeamStyleAward } from "@/lib/helpers";
import { fetchAllRows } from "@/lib/fetchAll";
import { cachedQuery } from "@/lib/queryCache";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ProfileSkeleton, ErrorState } from "@/components/StateMessage";

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
  LeagueID: number | null;
  LeagueName: string | null;
  TeamID: number | null;
  TeamFullName: string | null;
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

type CompBest = { goals: number; gsc: number; saves: number; sf: number; gp: number; mins: number; shotsAllowed: number };
type ExtBest = {
  shotPct: number | null; passPct: number | null; snitchPct: number | null; svPct: number | null; keeperPassPct: number | null;
  bludgersHit: number; turnovers: number; teammates: number; minPerGoal: number | null;
  minPerSave: number | null; minPerShotFaced: number | null; minPerBH: number | null; minPerTF: number | null; minPerTP: number | null;
  minPerShotsAllowed: number | null; avgCatchTime: number | null;
};

export default function PlayerProfile() {
  const { id } = useParams();
  const [player, setPlayer] = useState<Player | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [nation, setNation] = useState<string>("");
  const [stats, setStats] = useState<StatLine[]>([]);
  const [captainSeasons, setCaptainSeasons] = useState<Set<string>>(new Set());
  const [managerCareerId, setManagerCareerId] = useState<number | null>(null);
  const [mostRecentTeam, setMostRecentTeam] = useState<string>("");
  const [leagueLeaders, setLeagueLeaders] = useState<LeagueLeaderEntry[]>([]);
  const [leagueMaxes, setLeagueMaxes] = useState<Map<string, Map<string, number>>>(new Map());
  const [matchLog, setMatchLog] = useState<MatchLogEntry[]>([]);
  const [matchLogOpen, setMatchLogOpen] = useState(false);
  const [matchLogSeason, setMatchLogSeason] = useState<number | "all">("all");
  const [matchLogSortKey, setMatchLogSortKey] = useState<string>("date");
  const [matchLogSortDir, setMatchLogSortDir] = useState<"asc" | "desc">("asc");
  const [compFilter, setCompFilter] = useState<string>("all");
  const [posFilter, setPosFilter] = useState<string>("all");
  const [detectedPositions, setDetectedPositions] = useState<string[]>([]);
  const [playerAwards, setPlayerAwards] = useState<{ awardname: string; placement: number; seasonid: number; leagueid: number; leagueName?: string }[]>([]);
  // Whether a given (leagueid, awardname) behaves as a "team style" award (multiple
  // players sharing a placement, e.g. Team of the Year) — determined from the full
  // award history for that league+award, not from this player's own rows alone,
  // since a single player's row can never reveal whether teammates share their slot.
  const [teamStyleAwardMap, setTeamStyleAwardMap] = useState<Map<string, boolean>>(new Map());
  const [leagueNameMap, setLeagueNameMap] = useState<Map<number, string>>(new Map());
  const [teamCompWins, setTeamCompWins] = useState<{ leagueId: number; leagueName: string; seasonId: number; teamName: string }[]>([]);
  // Derived from match-level data (not available in the player_season_stats view) —
  // keyed by `${SeasonID}|${LeagueID}|${TeamID}`.
  const [seekerCatchMap, setSeekerCatchMap] = useState<Map<string, { totalTime: number; catches: number }>>(new Map());
  const [beaterShotsAllowedMap, setBeaterShotsAllowedMap] = useState<Map<string, { totalShotsAllowed: number; games: number }>>(new Map());
  // League-wide bests for the two match-level-only stats above, so they can be gold-
  // highlighted the same way as every other stat — keyed by `${SeasonID}|${LeagueName}`.
  const [leagueCatchBest, setLeagueCatchBest] = useState<Map<string, number>>(new Map());
  const [leagueShotsAllowedBest, setLeagueShotsAllowedBest] = useState<Map<string, number>>(new Map());
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
    }).catch(err => {
      console.error("Failed to load player:", err);
      setLoadError(true);
    });

    // Captaincy history — key on TeamID+SeasonID so the badge only shows on the
    // team a player actually captained that season, not every team they played
    // for that year (e.g. club side + national team in the same season)
    fetchAllRows("team_captains", {
      select: "TeamID, SeasonID",
      filters: [{ method: "eq", args: ["CaptainPlayerID", pid] }],
    }).then((rows: any) => {
      setCaptainSeasons(new Set((rows || []).filter((r: any) => r.TeamID && r.SeasonID).map((r: any) => `${r.TeamID}|${r.SeasonID}`)));
    });

    // Did this player go on to manage?
    supabase.from("managers").select("ManagerID").eq("FormerPlayerID", pid).limit(1).then(({ data }) => {
      if (data?.[0]) setManagerCareerId((data[0] as any).ManagerID);
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

        // Determine which (league, award name) combos are team-style awards. This
        // can't be inferred from the player's own rows alone (one row per season),
        // so pull the full award history for each distinct combo they appear in.
        const pairs = [...new Set((awardsData as any[]).map(a => `${a.leagueid}|${a.awardname}`))];
        Promise.all(pairs.map(pairKey => {
          const [leagueidStr, awardname] = pairKey.split("|");
          return fetchAllRows<{ placement: number }>("awards", {
            select: "placement",
            filters: [
              { method: "eq", args: ["leagueid", Number(leagueidStr)] },
              { method: "eq", args: ["awardname", awardname] },
            ],
          }).then(rows => ({ pairKey, isTeamStyle: isTeamStyleAward(rows) }));
        })).then(results => {
          const m = new Map<string, boolean>();
          results.forEach(r => m.set(r.pairKey, r.isTeamStyle));
          setTeamStyleAwardMap(m);
        });
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
      setMostRecentTeam((sData[sData.length - 1] as any).TeamFullName || "");

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
          select: "MatchID,SeasonID,LeagueID,WeekID,SnitchCaughtTime,SnitchCaughtBy,HomeTeamID,AwayTeamID,HomeTeamScore,AwayTeamScore,HomeKeeperID,AwayKeeperID,HomeSeekerID,AwaySeekerID,HomeChaser1ID,HomeChaser1Goals,HomeChaser2ID,HomeChaser2Goals,HomeChaser3ID,HomeChaser3Goals,AwayChaser1ID,AwayChaser1Goals,AwayChaser2ID,AwayChaser2Goals,AwayChaser3ID,AwayChaser3Goals,IsNeutralSite,HomeBeater1ID,HomeBeater2ID,AwayBeater1ID,AwayBeater2ID,HomeKeeperSaves,AwayKeeperSaves,HomeChaser1ShotAtt,HomeChaser1ShotScored,HomeChaser2ShotAtt,HomeChaser2ShotScored,HomeChaser3ShotAtt,HomeChaser3ShotScored,AwayChaser1ShotAtt,AwayChaser1ShotScored,AwayChaser2ShotAtt,AwayChaser2ShotScored,AwayChaser3ShotAtt,AwayChaser3ShotScored,HomeBeater1BludgersHit,HomeBeater2BludgersHit,AwayBeater1BludgersHit,AwayBeater2BludgersHit",
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
      // Keyed by `${SeasonID}|${LeagueID}|${TeamID}` to align with the season-by-season
      // stats table's grain (a player can have multiple rows in the same league+season
      // if they changed teams mid-year).
      const seekerCatchAgg = new Map<string, { totalTime: number; catches: number }>();
      const beaterShotsAllowedAgg = new Map<string, { totalShotsAllowed: number; games: number }>();

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
        // SnitchCaughtBy stores the TEAM ID that caught the snitch, not a player ID
        // (confirmed against MatchPage's box score logic) — comparing it directly to
        // a player ID would only ever match by coincidence, so we compare team IDs.
        const mySnitchCaught = r.SnitchCaughtBy != null && r.SnitchCaughtBy === teamId;
        if (matchPos === "Chaser") {
          const chasers = [[r.HomeChaser1ID, r.HomeChaser1Goals], [r.HomeChaser2ID, r.HomeChaser2Goals], [r.HomeChaser3ID, r.HomeChaser3Goals], [r.AwayChaser1ID, r.AwayChaser1Goals], [r.AwayChaser2ID, r.AwayChaser2Goals], [r.AwayChaser3ID, r.AwayChaser3Goals]];
          const g = chasers.find(([cid]) => cid === pid2)?.[1] as number || 0;
          stat = String(g);
        } else if (matchPos === "Seeker") {
          stat = mySnitchCaught ? "1" : "0";
        } else if (matchPos === "Keeper") {
          const saves = (isHome ? r.HomeKeeperSaves : r.AwayKeeperSaves) as number || 0;
          stat = String(saves);
        } else if (matchPos === "Beater") {
          const bhField = isHome ? (r.HomeBeater1ID === pid2 ? r.HomeBeater1BludgersHit : r.HomeBeater2BludgersHit) : (r.AwayBeater1ID === pid2 ? r.AwayBeater1BludgersHit : r.AwayBeater2BludgersHit);
          stat = String(bhField as number || 0);
        }

        // ── New per-match aggregates, keyed by season|league|team to align with the
        // season-by-season stats table's grain (a player can appear for more than one
        // team in the same league+season if transferred mid-year). ──
        const aggKey = `${sid}|${lid}|${teamId}`;

        if (matchPos === "Seeker" && r.SnitchCaughtTime != null) {
          // Average Time to Catch is computed ONLY over games this seeker personally
          // caught the snitch — an opposing seeker's catch time must never factor into
          // this player's average (that's a different seeker's play entirely).
          if (mySnitchCaught) {
            const entry = seekerCatchAgg.get(aggKey) || { totalTime: 0, catches: 0 };
            entry.totalTime += r.SnitchCaughtTime as number;
            entry.catches += 1;
            seekerCatchAgg.set(aggKey, entry);
          }
        }

        if (matchPos === "Beater") {
          // "Shots Allowed" = how many shot attempts the OPPOSING team's chasers took
          // in this match — a defensive measure of whether these beaters kept the
          // other team's chasers from even getting looks at goal.
          const oppChaserShotAtt = isHome
            ? (r.AwayChaser1ShotAtt as number || 0) + (r.AwayChaser2ShotAtt as number || 0) + (r.AwayChaser3ShotAtt as number || 0)
            : (r.HomeChaser1ShotAtt as number || 0) + (r.HomeChaser2ShotAtt as number || 0) + (r.HomeChaser3ShotAtt as number || 0);
          const entry = beaterShotsAllowedAgg.get(aggKey) || { totalShotsAllowed: 0, games: 0 };
          entry.totalShotsAllowed += oppChaserShotAtt;
          entry.games += 1;
          beaterShotsAllowedAgg.set(aggKey, entry);
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
      setSeekerCatchMap(seekerCatchAgg);
      setBeaterShotsAllowedMap(beaterShotsAllowedAgg);

      // Build league maxes for leader highlighting — fetch all seasons in PARALLEL (not sequential)
      const playerName = (sData[0] as any).PlayerName;
      const seasonIds = [...new Set(sData.map((s: any) => s.SeasonID).filter(Boolean))] as number[];
      const maxMap = new Map<string, Map<string, number>>();
      const awardEntries: LeagueLeaderEntry[] = [];

      // Parallel fetch — all seasons at once, results cached by fetchAllRows
      const allSeasonStats = await Promise.all(
        seasonIds.map(sid =>
          fetchAllRows("player_season_stats", {
            select: "PlayerName,Goals,GoldenSnitchCatches,KeeperSaves,KeeperShotsFaced,GamesPlayed,MinPlayed,ShotAtt,ShotScored,PassAtt,PassComp,KeeperPassAtt,KeeperPassComp,BludgersHit,TurnoversForced,TeammatesProtected,Position,SeasonID,LeagueName",
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

          // GP and Minutes apply to every position, so compare across the whole
          // league+season roster, not just one position group.
          const maxGP = Math.max(0, ...rows.map((r: Record<string, unknown>) => (r.GamesPlayed as number) || 0));
          statMaxes.set("GP", maxGP);
          const maxMin = Math.max(0, ...rows.map((r: Record<string, unknown>) => (r.MinPlayed as number) || 0));
          statMaxes.set("Min", maxMin);

          const chasers = rows.filter((r: Record<string, unknown>) => r.Position === "Chaser");
          if (chasers.length) {
            const sorted = [...chasers].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.Goals as number) || 0) - ((a.Goals as number) || 0));
            statMaxes.set("Goals", (sorted[0]?.Goals as number) || 0);
            const rank = sorted.findIndex((r: Record<string, unknown>) => r.PlayerName === playerName) + 1;
            if (rank > 0 && rank <= 5) awardEntries.push({ SeasonID: sid, LeagueName: ln, stat: "Goals", value: (sorted[rank - 1]?.Goals as number) || 0, rank, scope: "league" });

            let bestShotPct = 0, bestPassPct = 0, bestMinPerGoal: number | null = null;
            chasers.forEach((r: Record<string, unknown>) => {
              const sa = (r.ShotAtt as number) || 0, ss = (r.ShotScored as number) || 0;
              const pa = (r.PassAtt as number) || 0, pc = (r.PassComp as number) || 0;
              const mp = (r.MinPlayed as number) || 0, g = (r.Goals as number) || 0;
              if (sa > 0) bestShotPct = Math.max(bestShotPct, (ss / sa) * 100);
              if (pa > 0) bestPassPct = Math.max(bestPassPct, (pc / pa) * 100);
              if (g > 0 && mp > 0) { const v = mp / g; if (bestMinPerGoal === null || v < bestMinPerGoal) bestMinPerGoal = v; }
            });
            statMaxes.set("ShotPct", bestShotPct);
            statMaxes.set("PassPct", bestPassPct);
            if (bestMinPerGoal !== null) statMaxes.set("MinPerGoal", bestMinPerGoal);
          }

          const seekers = rows.filter((r: Record<string, unknown>) => r.Position === "Seeker");
          if (seekers.length) {
            const sorted = [...seekers].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.GoldenSnitchCatches as number) || 0) - ((a.GoldenSnitchCatches as number) || 0));
            statMaxes.set("GoldenSnitchCatches", (sorted[0]?.GoldenSnitchCatches as number) || 0);
            const rank = sorted.findIndex((r: Record<string, unknown>) => r.PlayerName === playerName) + 1;
            if (rank > 0 && rank <= 5) awardEntries.push({ SeasonID: sid, LeagueName: ln, stat: "Golden Snitch Catches", value: (sorted[rank - 1]?.GoldenSnitchCatches as number) || 0, rank, scope: "league" });

            let bestSnitchPct = 0;
            seekers.forEach((r: Record<string, unknown>) => {
              const gp = (r.GamesPlayed as number) || 0, gsc = (r.GoldenSnitchCatches as number) || 0;
              if (gp > 0) bestSnitchPct = Math.max(bestSnitchPct, (gsc / gp) * 100);
            });
            statMaxes.set("SnitchPct", bestSnitchPct);
          }

          const keepers = rows.filter((r: Record<string, unknown>) => r.Position === "Keeper");
          if (keepers.length) {
            const sorted = [...keepers].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.KeeperSaves as number) || 0) - ((a.KeeperSaves as number) || 0));
            statMaxes.set("KeeperSaves", (sorted[0]?.KeeperSaves as number) || 0);
            const rank = sorted.findIndex((r: Record<string, unknown>) => r.PlayerName === playerName) + 1;
            if (rank > 0 && rank <= 5) awardEntries.push({ SeasonID: sid, LeagueName: ln, stat: "Keeper Saves", value: (sorted[rank - 1]?.KeeperSaves as number) || 0, rank, scope: "league" });

            let bestSF = 0, bestSavePct = 0, bestKPassPct = 0, bestMinPerSave: number | null = null, bestMinPerSF: number | null = null;
            keepers.forEach((r: Record<string, unknown>) => {
              const sf = (r.KeeperShotsFaced as number) || 0, sv = (r.KeeperSaves as number) || 0;
              const kpa = (r.KeeperPassAtt as number) || 0, kpc = (r.KeeperPassComp as number) || 0;
              const mp = (r.MinPlayed as number) || 0;
              bestSF = Math.max(bestSF, sf);
              if (sf > 0) bestSavePct = Math.max(bestSavePct, (sv / sf) * 100);
              if (kpa > 0) bestKPassPct = Math.max(bestKPassPct, (kpc / kpa) * 100);
              if (sv > 0 && mp > 0) { const v = mp / sv; if (bestMinPerSave === null || v < bestMinPerSave) bestMinPerSave = v; }
              if (sf > 0 && mp > 0) { const v = mp / sf; if (bestMinPerSF === null || v < bestMinPerSF) bestMinPerSF = v; }
            });
            statMaxes.set("KeeperShotsFaced", bestSF);
            statMaxes.set("SavePct", bestSavePct);
            statMaxes.set("KeeperPassPct", bestKPassPct);
            if (bestMinPerSave !== null) statMaxes.set("MinPerSave", bestMinPerSave);
            if (bestMinPerSF !== null) statMaxes.set("MinPerShotFaced", bestMinPerSF);
          }

          const beaters = rows.filter((r: Record<string, unknown>) => r.Position === "Beater");
          if (beaters.length) {
            let bestBH = 0, bestTF = 0, bestTP = 0;
            let bestMinPerBH: number | null = null, bestMinPerTF: number | null = null, bestMinPerTP: number | null = null;
            beaters.forEach((r: Record<string, unknown>) => {
              const bh = (r.BludgersHit as number) || 0, tf = (r.TurnoversForced as number) || 0, tp = (r.TeammatesProtected as number) || 0;
              const mp = (r.MinPlayed as number) || 0;
              bestBH = Math.max(bestBH, bh);
              bestTF = Math.max(bestTF, tf);
              bestTP = Math.max(bestTP, tp);
              if (bh > 0 && mp > 0) { const v = mp / bh; if (bestMinPerBH === null || v < bestMinPerBH) bestMinPerBH = v; }
              if (tf > 0 && mp > 0) { const v = mp / tf; if (bestMinPerTF === null || v < bestMinPerTF) bestMinPerTF = v; }
              if (tp > 0 && mp > 0) { const v = mp / tp; if (bestMinPerTP === null || v < bestMinPerTP) bestMinPerTP = v; }
            });
            statMaxes.set("BludgersHit", bestBH);
            statMaxes.set("TurnoversForced", bestTF);
            statMaxes.set("TeammatesProtected", bestTP);
            if (bestMinPerBH !== null) statMaxes.set("MinPerBH", bestMinPerBH);
            if (bestMinPerTF !== null) statMaxes.set("MinPerTF", bestMinPerTF);
            if (bestMinPerTP !== null) statMaxes.set("MinPerTP", bestMinPerTP);
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
      // ── League-wide bests for the two stats that need match-level data (not
      // available in the player_season_stats view): Seeker average time to catch,
      // and Beater minutes-per-shots-allowed. Scoped only to the (season, league)
      // pairs this player actually appeared in at that position, to keep the extra
      // fetch bounded rather than pulling every league's full match history. ──
      const seekerPairs = [...new Set((sData as any[]).filter(s => s.Position === "Seeker" && s.SeasonID && s.LeagueID).map(s => `${s.SeasonID}|${s.LeagueID}`))];
      const beaterPairs = [...new Set((sData as any[]).filter(s => s.Position === "Beater" && s.SeasonID && s.LeagueID).map(s => `${s.SeasonID}|${s.LeagueID}`))];
      const relevantPairs = [...new Set([...seekerPairs, ...beaterPairs])];

      const catchBestMap = new Map<string, number>(); // key: `${SeasonID}|${LeagueName}` -> lowest avg catch time (best)
      const shotsAllowedBestMap = new Map<string, number>(); // key: `${SeasonID}|${LeagueName}` -> highest Min/ShotsAllowed (best)

      if (relevantPairs.length > 0) {
        const pairResults = await Promise.all(
          relevantPairs.map(pairKey => {
            const [sidStr, lidStr] = pairKey.split("|");
            const seasonId = Number(sidStr), leagueId = Number(lidStr);
            return fetchAllRows("results", {
              select: "HomeTeamID,AwayTeamID,HomeSeekerID,AwaySeekerID,SnitchCaughtBy,SnitchCaughtTime,HomeBeater1ID,HomeBeater1MinPlayed,HomeBeater2ID,HomeBeater2MinPlayed,AwayBeater1ID,AwayBeater1MinPlayed,AwayBeater2ID,AwayBeater2MinPlayed,HomeChaser1ShotAtt,HomeChaser2ShotAtt,HomeChaser3ShotAtt,AwayChaser1ShotAtt,AwayChaser2ShotAtt,AwayChaser3ShotAtt",
              filters: [
                { method: "eq", args: ["SeasonID", seasonId] },
                { method: "eq", args: ["LeagueID", leagueId] },
              ],
            }).then(rows => ({ seasonId, leagueId, rows }));
          })
        );

        for (const { seasonId, leagueId, rows } of pairResults) {
          if (!rows || rows.length === 0) continue;
          const ln = leagueNameMap2.get(leagueId) || String(leagueId);
          const key = `${seasonId}|${ln}`;
          const isSeekerPair = seekerPairs.includes(`${seasonId}|${leagueId}`);
          const isBeaterPair = beaterPairs.includes(`${seasonId}|${leagueId}`);

          const seekerAgg = new Map<number, { totalTime: number; catches: number }>();
          const beaterAgg = new Map<number, { shotsAllowed: number; minutes: number }>();

          rows.forEach((r: Record<string, unknown>) => {
            const homeTeamId = r.HomeTeamID as number, awayTeamId = r.AwayTeamID as number;
            const caughtByTeam = r.SnitchCaughtBy as number | null;

            if (isSeekerPair) {
              const hs = r.HomeSeekerID as number | null, as_ = r.AwaySeekerID as number | null;
              if (hs != null && caughtByTeam === homeTeamId && r.SnitchCaughtTime != null) {
                const e = seekerAgg.get(hs) || { totalTime: 0, catches: 0 };
                e.totalTime += r.SnitchCaughtTime as number; e.catches++;
                seekerAgg.set(hs, e);
              }
              if (as_ != null && caughtByTeam === awayTeamId && r.SnitchCaughtTime != null) {
                const e = seekerAgg.get(as_) || { totalTime: 0, catches: 0 };
                e.totalTime += r.SnitchCaughtTime as number; e.catches++;
                seekerAgg.set(as_, e);
              }
            }

            if (isBeaterPair) {
              const homeOppShotAtt = (r.AwayChaser1ShotAtt as number || 0) + (r.AwayChaser2ShotAtt as number || 0) + (r.AwayChaser3ShotAtt as number || 0);
              const awayOppShotAtt = (r.HomeChaser1ShotAtt as number || 0) + (r.HomeChaser2ShotAtt as number || 0) + (r.HomeChaser3ShotAtt as number || 0);
              const hb1 = r.HomeBeater1ID as number | null, hb2 = r.HomeBeater2ID as number | null;
              const ab1 = r.AwayBeater1ID as number | null, ab2 = r.AwayBeater2ID as number | null;
              if (hb1 != null) { const e = beaterAgg.get(hb1) || { shotsAllowed: 0, minutes: 0 }; e.shotsAllowed += homeOppShotAtt; e.minutes += (r.HomeBeater1MinPlayed as number) || 0; beaterAgg.set(hb1, e); }
              if (hb2 != null) { const e = beaterAgg.get(hb2) || { shotsAllowed: 0, minutes: 0 }; e.shotsAllowed += homeOppShotAtt; e.minutes += (r.HomeBeater2MinPlayed as number) || 0; beaterAgg.set(hb2, e); }
              if (ab1 != null) { const e = beaterAgg.get(ab1) || { shotsAllowed: 0, minutes: 0 }; e.shotsAllowed += awayOppShotAtt; e.minutes += (r.AwayBeater1MinPlayed as number) || 0; beaterAgg.set(ab1, e); }
              if (ab2 != null) { const e = beaterAgg.get(ab2) || { shotsAllowed: 0, minutes: 0 }; e.shotsAllowed += awayOppShotAtt; e.minutes += (r.AwayBeater2MinPlayed as number) || 0; beaterAgg.set(ab2, e); }
            }
          });

          if (seekerAgg.size > 0) {
            let best: number | null = null;
            seekerAgg.forEach(({ totalTime, catches }) => {
              if (catches === 0) return;
              const avg = totalTime / catches;
              if (best === null || avg < best) best = avg; // lower time-to-catch = better
            });
            if (best !== null) catchBestMap.set(key, best);
          }

          if (beaterAgg.size > 0) {
            let best: number | null = null;
            beaterAgg.forEach(({ shotsAllowed, minutes }) => {
              if (shotsAllowed === 0 || minutes === 0) return;
              const rate = minutes / shotsAllowed;
              if (best === null || rate > best) best = rate; // higher = fewer shots allowed per minute = better defense
            });
            if (best !== null) shotsAllowedBestMap.set(key, best);
          }
        }
      }
      setLeagueCatchBest(catchBestMap);
      setLeagueShotsAllowedBest(shotsAllowedBestMap);

      setLeagueMaxes(maxMap);
      awardEntries.sort((a, b) => { if (a.scope !== b.scope) return a.scope === "league" ? -1 : 1; return a.SeasonID - b.SeasonID; });
      setLeagueLeaders(awardEntries);
    });
  }, [id]);

  // ── Team Competition Wins ──
  // For each (LeagueID, SeasonID, TeamName) the player appeared in, check whether that team
  // won the competition that season. Cup leagues (CUP_IDS) are resolved via results final;
  // round-robin leagues via the standings table.
  // Knockout/cup competitions (winner determined by results final, not standings).
  // LeagueID 21 = Quidditch World Cup Qualification — explicitly excluded from championship credit.
  const CUP_IDS_SET = new Set([15, 16, 17, 18, 19, 20, 22, 24, 26, 28]);
  const EXCLUDED_LEAGUE_IDS = new Set([21, 23, 25, 27, 29, 30]);
  const INTL_SEMI_IDS = new Set([20, 22, 24, 26, 28]);
  useEffect(() => {
    if (!stats.length || leagueNameMap.size === 0) { setTeamCompWins([]); return; }
    const leagueIdByName = new Map<string, number>();
    leagueNameMap.forEach((name, lid) => leagueIdByName.set(name, lid));

    // Unique (leagueId, seasonId, teamName) tuples this player appeared in
    const tuples = new Map<string, { leagueId: number; seasonId: number; teamName: string }>();
    stats.forEach(s => {
      if (!s.LeagueName || !s.SeasonID || !s.TeamFullName) return;
      const lid = leagueIdByName.get(s.LeagueName);
      if (!lid || EXCLUDED_LEAGUE_IDS.has(lid)) return;
      const key = `${lid}|${s.SeasonID}|${s.TeamFullName}`;
      if (!tuples.has(key)) tuples.set(key, { leagueId: lid, seasonId: s.SeasonID, teamName: s.TeamFullName });
    });
    if (tuples.size === 0) return;

    // Split into league vs cup unique (leagueId, seasonId)
    const leagueSeasons = new Map<string, { leagueId: number; seasonId: number }>();
    const cupSeasons = new Map<string, { leagueId: number; seasonId: number }>();
    tuples.forEach(t => {
      const k = `${t.leagueId}|${t.seasonId}`;
      if (CUP_IDS_SET.has(t.leagueId)) cupSeasons.set(k, { leagueId: t.leagueId, seasonId: t.seasonId });
      else leagueSeasons.set(k, { leagueId: t.leagueId, seasonId: t.seasonId });
    });

    (async () => {
      const wins: { leagueId: number; leagueName: string; seasonId: number; teamName: string }[] = [];
      const publishWins = () => {
        const deduped = new Map<string, { leagueId: number; leagueName: string; seasonId: number; teamName: string }>();
        wins.forEach(w => deduped.set(`${w.leagueId}|${w.seasonId}|${w.teamName}`, w));
        setTeamCompWins([...deduped.values()].sort((a, b) =>
          a.leagueId - b.leagueId || a.seasonId - b.seasonId || a.teamName.localeCompare(b.teamName)
        ));
      };

      // ── Round-robin league champions via standings ──
      if (leagueSeasons.size > 0) {
        const champByKey = new Map<string, string>();
        await Promise.all([...leagueSeasons.values()].map(async ({ leagueId, seasonId }) => {
          const { data } = await supabase
            .from("standings")
            .select('"LeagueID","SeasonID","FullName",totalpoints')
            .eq("SeasonID", seasonId)
            .eq("LeagueID", leagueId)
            .order("totalpoints", { ascending: false })
            .limit(1);
          const champion = data?.[0]?.FullName;
          if (champion) champByKey.set(`${leagueId}|${seasonId}`, champion);
        }));
        tuples.forEach(t => {
          if (CUP_IDS_SET.has(t.leagueId)) return;
          const k = `${t.leagueId}|${t.seasonId}`;
          if (champByKey.get(k) === t.teamName) {
            wins.push({ leagueId: t.leagueId, leagueName: leagueNameMap.get(t.leagueId) || "", seasonId: t.seasonId, teamName: t.teamName });
          }
        });
        publishWins();
      }

      // ── Cup champions via results ──
      if (cupSeasons.size > 0) {
        const cupLeagueIds = [...new Set([...cupSeasons.values()].map(v => v.leagueId))];
        const cupSeasonIds = [...new Set([...cupSeasons.values()].map(v => v.seasonId))];
        const resultsData = await fetchAllRows("results", {
          select: "MatchID,HomeTeamID,AwayTeamID,HomeTeamScore,AwayTeamScore,WeekID,SeasonID,LeagueID",
          filters: [
            { method: "in", args: ["LeagueID", cupLeagueIds] },
            { method: "in", args: ["SeasonID", cupSeasonIds] },
          ],
        });
        // Need team IDs → names
        const teamIds = new Set<number>();
        (resultsData || []).forEach((r: any) => { if (r.HomeTeamID) teamIds.add(r.HomeTeamID); if (r.AwayTeamID) teamIds.add(r.AwayTeamID); });
        const teamNameById = new Map<number, string>();
        if (teamIds.size > 0) {
          const chunks = Array.from({ length: Math.ceil(teamIds.size / 100) }, (_, i) => [...teamIds].slice(i * 100, (i + 1) * 100));
          await Promise.all(chunks.map(async ch => {
            const { data } = await supabase.from("teams").select('"TeamID","FullName"').in("TeamID", ch);
            (data || []).forEach((t: any) => { if (t.TeamID && t.FullName) teamNameById.set(t.TeamID, t.FullName); });
          }));
        }

        // Group results by (leagueId, seasonId)
        const byKey = new Map<string, any[]>();
        (resultsData || []).forEach((r: any) => {
          const k = `${r.LeagueID}|${r.SeasonID}`;
          if (!cupSeasons.has(k)) return;
          if (!byKey.has(k)) byKey.set(k, []);
          byKey.get(k)!.push(r);
        });

        const champByKey = new Map<string, string>();
        byKey.forEach((matches, key) => {
          const [lidStr] = key.split("|");
          const lid = Number(lidStr);
          const weekGroups = new Map<number, any[]>();
          matches.forEach(m => {
            const w = m.WeekID || 0;
            if (!weekGroups.has(w)) weekGroups.set(w, []);
            weekGroups.get(w)!.push(m);
          });
          const sortedWeeks = [...weekGroups.keys()].sort((a, b) => a - b);

          if (lid === 17) {
            // Americas Cup round-robin final in weeks 6,7,8
            const finalWeeks = [6, 7, 8].filter(w => weekGroups.has(w));
            if (!finalWeeks.length) return;
            const tally = new Map<number, { w: number; gf: number; ga: number }>();
            const bump = (tid: number) => { if (!tally.has(tid)) tally.set(tid, { w: 0, gf: 0, ga: 0 }); return tally.get(tid)!; };
            finalWeeks.forEach(fw => (weekGroups.get(fw) || []).forEach((m: any) => {
              if (!m.HomeTeamID || !m.AwayTeamID) return;
              const h = bump(m.HomeTeamID), a = bump(m.AwayTeamID);
              const hs = m.HomeTeamScore || 0, as = m.AwayTeamScore || 0;
              h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
              if (hs > as) h.w += 1; else if (as > hs) a.w += 1;
            }));
            const ranked = [...tally.entries()].sort((a, b) => b[1].w - a[1].w || (b[1].gf - b[1].ga) - (a[1].gf - a[1].ga));
            if (ranked[0]) champByKey.set(key, teamNameById.get(ranked[0][0]) || "");
            return;
          }

          // New-format international comps (LeagueID 20, 22, 24, 26, 28):
          // final week has 2 matches (Final + 3rd-place playoff). Final = match
          // between the two semifinal (previous week) winners.
          if (INTL_SEMI_IDS.has(lid)) {
            const maxWeek = Math.max(...sortedWeeks);
            const lastWeekMatches = weekGroups.get(maxWeek) || [];
            const semiMatches = weekGroups.get(maxWeek - 1) || [];
            if (lastWeekMatches.length === 2 && semiMatches.length === 2) {
              const semiWinners = new Set<number>();
              semiMatches.forEach((m: any) => {
                const hs = m.HomeTeamScore || 0, as = m.AwayTeamScore || 0;
                if (hs >= as && m.HomeTeamID) semiWinners.add(m.HomeTeamID);
                else if (as > hs && m.AwayTeamID) semiWinners.add(m.AwayTeamID);
              });
              const finalMatch = lastWeekMatches.find((m: any) =>
                m.HomeTeamID && m.AwayTeamID && semiWinners.has(m.HomeTeamID) && semiWinners.has(m.AwayTeamID)
              );
              if (finalMatch) {
                const hs = finalMatch.HomeTeamScore || 0, as = finalMatch.AwayTeamScore || 0;
                const champId = hs >= as ? finalMatch.HomeTeamID : finalMatch.AwayTeamID;
                if (champId) champByKey.set(key, teamNameById.get(champId) || "");
              }
            } else if (lastWeekMatches.length === 1) {
              // Single-match final week fallback
              const m = lastWeekMatches[0];
              const hs = m.HomeTeamScore || 0, as = m.AwayTeamScore || 0;
              const champId = hs >= as ? m.HomeTeamID : m.AwayTeamID;
              if (champId) champByKey.set(key, teamNameById.get(champId) || "");
            }
            return;
          }


          // Knockout: aggregate goals across final weeks (consecutive 1-match weeks)
          const finalWeeks: number[] = [];
          for (let i = sortedWeeks.length - 1; i >= 0; i--) {
            const w = sortedWeeks[i];
            if ((weekGroups.get(w) || []).length === 1) finalWeeks.unshift(w);
            else break;
          }
          if (!finalWeeks.length) return;
          // If the very last single-match week is the 3rd-place playoff, drop it
          // Detect by checking if preceding rounds had 2 matches (semis); a 3rd-place match
          // sits between semis and final as a lone game — but our reverse scan picks up
          // all trailing single-match weeks. The Final is the LAST one.
          const teamGoals = new Map<number, number>();
          const lastFinalWeek = finalWeeks[finalWeeks.length - 1];
          // Treat the final as weeks with same descriptive role: collapse consecutive trailing 1-match weeks
          // that are NOT separated by a different round — already done. Aggregate goals across them.
          finalWeeks.forEach(fw => (weekGroups.get(fw) || []).forEach((m: any) => {
            if (m.HomeTeamID) teamGoals.set(m.HomeTeamID, (teamGoals.get(m.HomeTeamID) || 0) + (m.HomeTeamScore || 0));
            if (m.AwayTeamID) teamGoals.set(m.AwayTeamID, (teamGoals.get(m.AwayTeamID) || 0) + (m.AwayTeamScore || 0));
          }));
          // If finalWeeks includes 3rd-place playoff plus final, the final winner may be wrong.
          // Safer: just use the LAST week's match aggregate (single Final leg) if multiple
          // single-match weeks are present and there's no preceding non-single week between them.
          if (finalWeeks.length > 1) {
            teamGoals.clear();
            (weekGroups.get(lastFinalWeek) || []).forEach((m: any) => {
              if (m.HomeTeamID) teamGoals.set(m.HomeTeamID, (teamGoals.get(m.HomeTeamID) || 0) + (m.HomeTeamScore || 0));
              if (m.AwayTeamID) teamGoals.set(m.AwayTeamID, (teamGoals.get(m.AwayTeamID) || 0) + (m.AwayTeamScore || 0));
            });
          }
          const sortedTeams = [...teamGoals.entries()].sort((a, b) => b[1] - a[1]);
          if (sortedTeams[0]) champByKey.set(key, teamNameById.get(sortedTeams[0][0]) || "");
        });

        tuples.forEach(t => {
          if (!CUP_IDS_SET.has(t.leagueId)) return;
          const k = `${t.leagueId}|${t.seasonId}`;
          if (champByKey.get(k) === t.teamName) {
            wins.push({ leagueId: t.leagueId, leagueName: leagueNameMap.get(t.leagueId) || "", seasonId: t.seasonId, teamName: t.teamName });
          }
        });
      }

      publishWins();
    })();
  }, [stats, leagueNameMap]);




  if (!player) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-14 md:pb-0">
        <SiteHeader />
        <main className="flex-1 container py-8">
          {loadError ? (
            <ErrorState
              title="We couldn't load this player"
              message="Something went wrong while fetching this player's profile."
              onRetry={() => window.location.reload()}
              backTo="/players"
              backLabel="Back to players"
            />
          ) : (
            <ProfileSkeleton />
          )}
        </main>
        <SiteFooter />
      </div>
    );
  }

  const age = calculateAge(player.DOB);

  // Use detected positions for multi-position display
  const positionsPlayed = detectedPositions.length > 0 ? detectedPositions : (player.Position ? [player.Position] : []);
  const effectivePositions = posFilter === "all" ? positionsPlayed : positionsPlayed.filter(p => p === posFilter);
  const isKeeper = effectivePositions.includes("Keeper");
  const isSeeker = effectivePositions.includes("Seeker");
  const isChaser = effectivePositions.includes("Chaser");
  const isBeater = effectivePositions.includes("Beater");
  const positionDisplay = positionsPlayed.join("/");

  // Deduplicate stats: group by SeasonID+LeagueName+TeamFullName, show each unique row
  // (multi-position players have separate rows per position which is fine for the table)

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
    // International: qualifying comes before its parent competition
    "Quidditch World Cup Qualification": 4,
    "Quidditch World Cup": 5,
    "EIC Qualifying": 6,
    "European International Championship": 7,
    "Gold Cup Qualifying": 8,
    "Gold Cup": 9,
    "AFCON Qualifying": 10,
    "African Continental Championship": 11,
    "PAC Qualifying": 12,
    "Pacfic-Asian Championships": 13,
    "International Friendlies": 14,
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
  // International league names (LeagueID >= 20 — cups + qualifiers + friendlies)
  const intlLeagueNames = new Set(
    [...leagueNameMap.entries()].filter(([id]) => id >= 20).map(([, name]) => name)
  );
  const hasDomesticComps = allComps.some(c => domesticLeagueNames.has(c));
  const hasIntlComps = allComps.some(c => intlLeagueNames.has(c));

  const compScoped = compFilter === "all"
    ? sortedStats
    : compFilter === "domestic"
    ? sortedStats.filter(s => s.LeagueName && domesticLeagueNames.has(s.LeagueName))
    : compFilter === "international"
    ? sortedStats.filter(s => s.LeagueName && intlLeagueNames.has(s.LeagueName))
    : sortedStats.filter(s => s.LeagueName === compFilter);
  const filteredStats = posFilter === "all" ? compScoped : compScoped.filter(s => s.Position === posFilter);

  // Career totals — reflect current comp + position filter
  const careerTotals = {
    gp: filteredStats.reduce((s, r) => s + (r.GamesPlayed || 0), 0),
    goals: filteredStats.reduce((s, r) => s + (r.Goals || 0), 0),
    gsc: filteredStats.reduce((s, r) => s + (r.GoldenSnitchCatches || 0), 0),
    saves: filteredStats.reduce((s, r) => s + (r.KeeperSaves || 0), 0),
    shotsFaced: filteredStats.reduce((s, r) => s + (r.KeeperShotsFaced || 0), 0),
    minutes: filteredStats.reduce((s, r) => s + (r.MinPlayed || 0), 0),
    shotAtt: filteredStats.reduce((s, r) => s + (r.ShotAtt || 0), 0),
    shotScored: filteredStats.reduce((s, r) => s + (r.ShotScored || 0), 0),
    passAtt: filteredStats.reduce((s, r) => s + (r.PassAtt || 0), 0),
    passComp: filteredStats.reduce((s, r) => s + (r.PassComp || 0), 0),
    keeperPassAtt: filteredStats.reduce((s, r) => s + (r.KeeperPassAtt || 0), 0),
    keeperPassComp: filteredStats.reduce((s, r) => s + (r.KeeperPassComp || 0), 0),
    bludgersHit: filteredStats.reduce((s, r) => s + (r.BludgersHit || 0), 0),
    turnoversForced: filteredStats.reduce((s, r) => s + (r.TurnoversForced || 0), 0),
    teammatesProtected: filteredStats.reduce((s, r) => s + (r.TeammatesProtected || 0), 0),
    bludgerShotsFaced: filteredStats.reduce((s, r) => s + (r.BludgerShotsFaced || 0), 0),
    snitchSpotted: filteredStats.reduce((s, r) => s + (r.SnitchSpotted || 0), 0),
    // Match-level-derived — looked up per row via the season|league|team aggregate maps
    seekerCatches: filteredStats.reduce((sum, r) => {
      if (r.SeasonID == null || r.LeagueID == null || r.TeamID == null) return sum;
      return sum + (seekerCatchMap.get(`${r.SeasonID}|${r.LeagueID}|${r.TeamID}`)?.catches || 0);
    }, 0),
    seekerCatchTotalTime: filteredStats.reduce((sum, r) => {
      if (r.SeasonID == null || r.LeagueID == null || r.TeamID == null) return sum;
      return sum + (seekerCatchMap.get(`${r.SeasonID}|${r.LeagueID}|${r.TeamID}`)?.totalTime || 0);
    }, 0),
    shotsAllowed: filteredStats.reduce((sum, r) => {
      if (r.SeasonID == null || r.LeagueID == null || r.TeamID == null) return sum;
      return sum + (beaterShotsAllowedMap.get(`${r.SeasonID}|${r.LeagueID}|${r.TeamID}`)?.totalShotsAllowed || 0);
    }, 0),
  };


  // Career bests per competition (for gold shading)
  // Key is either the league name OR "domestic" for all domestic leagues pooled
  const bestByComp = new Map<string, CompBest>();
  const bestExtByComp = new Map<string, ExtBest>();

  const updateBests = (key: string, s: typeof stats[0]) => {
    const mins = s.MinPlayed || 0;
    const existing = bestByComp.get(key) || { goals: 0, gsc: 0, saves: 0, sf: 0, gp: 0, mins: 0, shotsAllowed: 0 };
    const existingExt = bestExtByComp.get(key) || {
      shotPct: null, passPct: null, snitchPct: null, svPct: null, keeperPassPct: null,
      bludgersHit: 0, turnovers: 0, teammates: 0, minPerGoal: null,
      minPerSave: null, minPerShotFaced: null, minPerBH: null, minPerTF: null, minPerTP: null,
      minPerShotsAllowed: null, avgCatchTime: null,
    };
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
    const saves = s.KeeperSaves || 0; const sf = s.KeeperShotsFaced || 0;
    if (shotAtt > 0) { const v = (shotScored / shotAtt) * 100; if (existingExt.shotPct === null || v > existingExt.shotPct) existingExt.shotPct = v; }
    if (passAtt > 0 && s.Position === "Chaser") { const v = (passComp / passAtt) * 100; if (existingExt.passPct === null || v > existingExt.passPct) existingExt.passPct = v; }
    if (kPassAtt > 0 && s.Position === "Keeper") { const v = (kPassComp / kPassAtt) * 100; if (existingExt.keeperPassPct === null || v > existingExt.keeperPassPct) existingExt.keeperPassPct = v; }
    if ((s.GamesPlayed || 0) > 0 && (s.GoldenSnitchCatches || 0) > 0) { const v = ((s.GoldenSnitchCatches || 0) / (s.GamesPlayed || 1)) * 100; if (existingExt.snitchPct === null || v > existingExt.snitchPct) existingExt.snitchPct = v; }
    if (sf > 0) { const v = (saves / sf) * 100; if (existingExt.svPct === null || v > existingExt.svPct) existingExt.svPct = v; }
    if (bh > existingExt.bludgersHit) existingExt.bludgersHit = bh;
    if (tf > existingExt.turnovers) existingExt.turnovers = tf;
    if (tp > existingExt.teammates) existingExt.teammates = tp;
    if ((s.Goals || 0) > 0 && mins > 0) { const v = mins / (s.Goals || 1); if (existingExt.minPerGoal === null || v < existingExt.minPerGoal) existingExt.minPerGoal = v; }
    if (saves > 0 && mins > 0) { const v = mins / saves; if (existingExt.minPerSave === null || v < existingExt.minPerSave) existingExt.minPerSave = v; }
    if (sf > 0 && mins > 0) { const v = mins / sf; if (existingExt.minPerShotFaced === null || v < existingExt.minPerShotFaced) existingExt.minPerShotFaced = v; }
    if (bh > 0 && mins > 0) { const v = mins / bh; if (existingExt.minPerBH === null || v < existingExt.minPerBH) existingExt.minPerBH = v; }
    if (tf > 0 && mins > 0) { const v = mins / tf; if (existingExt.minPerTF === null || v < existingExt.minPerTF) existingExt.minPerTF = v; }
    if (tp > 0 && mins > 0) { const v = mins / tp; if (existingExt.minPerTP === null || v < existingExt.minPerTP) existingExt.minPerTP = v; }

    // Match-level-derived stats (not in the player_season_stats view) — looked up
    // via the season|league|team aggregate maps built from raw match data.
    if (s.Position === "Seeker" && s.SeasonID != null && s.LeagueID != null && s.TeamID != null) {
      const agg = seekerCatchMap.get(`${s.SeasonID}|${s.LeagueID}|${s.TeamID}`);
      if (agg && agg.catches > 0) {
        const avg = agg.totalTime / agg.catches;
        if (existingExt.avgCatchTime === null || avg < existingExt.avgCatchTime) existingExt.avgCatchTime = avg;
      }
    }
    if (s.Position === "Beater" && s.SeasonID != null && s.LeagueID != null && s.TeamID != null) {
      const agg = beaterShotsAllowedMap.get(`${s.SeasonID}|${s.LeagueID}|${s.TeamID}`);
      if (agg) {
        if (agg.totalShotsAllowed > existing.shotsAllowed) existing.shotsAllowed = agg.totalShotsAllowed;
        if (agg.totalShotsAllowed > 0 && mins > 0) {
          const rate = mins / agg.totalShotsAllowed;
          if (existingExt.minPerShotsAllowed === null || rate > existingExt.minPerShotsAllowed) existingExt.minPerShotsAllowed = rate;
        }
      }
    }

    bestByComp.set(key, existing);
    bestExtByComp.set(key, existingExt);
  };

  stats.forEach(s => {
    const key = s.LeagueName || "Unknown";
    updateBests(key, s);
    if (s.LeagueName && domesticLeagueNames.has(s.LeagueName)) updateBests("domestic", s);
  });

  // By Competition aggregates — now directly from view fields
  const byCompetition = new Map<string, { gp: number; goals: number; gsc: number; saves: number; shotsFaced: number; minutes: number; shotAtt: number; shotScored: number; passAtt: number; passComp: number; kPassAtt: number; kPassComp: number; bh: number; tf: number; tp: number; bsf: number; snitchSpotted: number; shotsAllowed: number; seekerCatches: number; seekerCatchTotalTime: number }>();
  stats.forEach((s) => {
    const key = s.LeagueName || "Unknown";
    const ex = byCompetition.get(key) || { gp: 0, goals: 0, gsc: 0, saves: 0, shotsFaced: 0, minutes: 0, shotAtt: 0, shotScored: 0, passAtt: 0, passComp: 0, kPassAtt: 0, kPassComp: 0, bh: 0, tf: 0, tp: 0, bsf: 0, snitchSpotted: 0, shotsAllowed: 0, seekerCatches: 0, seekerCatchTotalTime: 0 };
    ex.gp += s.GamesPlayed || 0; ex.goals += s.Goals || 0; ex.gsc += s.GoldenSnitchCatches || 0;
    ex.saves += s.KeeperSaves || 0; ex.shotsFaced += s.KeeperShotsFaced || 0; ex.minutes += s.MinPlayed || 0;
    ex.shotAtt += s.ShotAtt || 0; ex.shotScored += s.ShotScored || 0;
    ex.passAtt += s.PassAtt || 0; ex.passComp += s.PassComp || 0;
    ex.kPassAtt += s.KeeperPassAtt || 0; ex.kPassComp += s.KeeperPassComp || 0;
    ex.bh += s.BludgersHit || 0; ex.tf += s.TurnoversForced || 0; ex.tp += s.TeammatesProtected || 0;
    ex.bsf += s.BludgerShotsFaced || 0; ex.snitchSpotted += s.SnitchSpotted || 0;
    if (s.SeasonID != null && s.LeagueID != null && s.TeamID != null) {
      const aggKey = `${s.SeasonID}|${s.LeagueID}|${s.TeamID}`;
      ex.shotsAllowed += beaterShotsAllowedMap.get(aggKey)?.totalShotsAllowed || 0;
      const catchAgg = seekerCatchMap.get(aggKey);
      ex.seekerCatches += catchAgg?.catches || 0;
      ex.seekerCatchTotalTime += catchAgg?.totalTime || 0;
    }
    byCompetition.set(key, ex);
  });

  const LEADER_EPS = 0.001; // float tolerance for rate-stat comparisons

  // Generic per-stat league-leader check. `val` is the value THIS row/column
  // actually displays; each column calls this with its own value and stat key,
  // so a player leading in Goals but not Sh% only gets Goals highlighted.
  function isLeagueLeader(s: StatLine, statKey: string, val: number | null): boolean {
    if (val == null || val <= 0) return false;
    const pairKey = `${s.SeasonID}|${s.LeagueName}`;
    const max = leagueMaxes.get(pairKey)?.get(statKey);
    if (max == null || max <= 0) return false;
    return Math.abs(val - max) < LEADER_EPS;
  }

  // Same idea, for the two match-level-only stats (Average Time to Catch, Min/Shots
  // Allowed) whose league bests live in their own maps rather than `leagueMaxes`.
  function isLeagueLeaderFromMap(map: Map<string, number>, seasonId: number | null, leagueName: string | null, val: number | null): boolean {
    if (val == null || seasonId == null || !leagueName) return false;
    const best = map.get(`${seasonId}|${leagueName}`);
    if (best == null) return false;
    return Math.abs(val - best) < LEADER_EPS;
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
              <div className="flex items-start justify-between gap-2">
                <h1 className="font-display text-3xl font-bold text-foreground">
                  {player.FirstName} {player.LastName}
                </h1>
                <Link
                  to={`/compare?p1=${player.PlayerID}`}
                  className="text-xs font-sans text-muted-foreground hover:text-accent border border-border rounded px-2 py-1 hover:border-accent transition-colors shrink-0 mt-1.5"
                >
                  Compare →
                </Link>
              </div>
              <p className="text-lg text-muted-foreground font-sans mt-1">
                {positionDisplay} ·{" "}
                {mostRecentTeam ? (
                  <Link to={`/team/${encodeURIComponent(mostRecentTeam)}`} className="hover:text-accent text-accent">
                    {mostRecentTeam}
                  </Link>
                ) : "—"}
              </p>
              {managerCareerId && (
                <p className="text-sm font-sans mt-1">
                  <Link to={`/manager/${managerCareerId}`} className="text-accent hover:underline font-medium">
                    View Managerial Career
                  </Link>
                </p>
              )}
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
                    <p className="font-medium">
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
              <div className="flex flex-wrap gap-2">
                {positionsPlayed.length > 1 && (
                  <select
                    value={posFilter}
                    onChange={e => setPosFilter(e.target.value)}
                    className="text-xs bg-popover text-popover-foreground border border-border rounded px-2 py-1 font-sans"
                    title="Filter by position"
                  >
                    <option value="all">All Positions</option>
                    {positionsPlayed.map(p => <option key={p} value={p}>{p} only</option>)}
                  </select>
                )}
                {allComps.length > 1 && (
                  <select
                    value={compFilter}
                    onChange={e => setCompFilter(e.target.value)}
                    className="text-xs bg-popover text-popover-foreground border border-border rounded px-2 py-1 font-sans"
                  >
                    <option value="all">All Competitions</option>
                    {hasDomesticComps && <option value="domestic">All League Matches</option>}
                    {hasIntlComps && <option value="international">All International</option>}
                    {allComps.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>
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
                    {isSeeker && <th className={`${thClass} text-right`}>Avg Catch</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Saves</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>SF</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Sv%</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Pass%</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Min/Sv</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Min/SF</th>}
                    {isBeater && <th className={`${thClass} text-right`}>BH</th>}
                    {isBeater && <th className={`${thClass} text-right`}>TF</th>}
                    {isBeater && <th className={`${thClass} text-right`}>TP</th>}
                    {isBeater && <th className={`${thClass} text-right`}>Min/BH</th>}
                    {isBeater && <th className={`${thClass} text-right`}>Min/TF</th>}
                    {isBeater && <th className={`${thClass} text-right`}>Min/TP</th>}
                    {isBeater && <th className={`${thClass} text-right`}>SA</th>}
                    {isBeater && <th className={`${thClass} text-right`}>Min/SA</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredStats.map((s, i) => {
                    const rowIsChaser = s.Position === "Chaser";
                    const rowIsSeeker = s.Position === "Seeker";
                    const rowIsKeeper = s.Position === "Keeper";
                    const rowIsBeater = s.Position === "Beater";

                    const compKey = compFilter === "domestic" && s.LeagueName && domesticLeagueNames.has(s.LeagueName)
                      ? "domestic"
                      : (s.LeagueName || "Unknown");
                    const compBest = bestByComp.get(compKey);
                    const extBest = bestExtByComp.get(compKey) || null;

                    // All standard values come directly from the player_season_stats view
                    const mins = s.MinPlayed || 0;
                    const shotAtt = s.ShotAtt || 0; const shotScored = s.ShotScored || 0;
                    const passAtt = s.PassAtt || 0; const passComp = s.PassComp || 0;
                    const kPassAtt = s.KeeperPassAtt || 0; const kPassComp = s.KeeperPassComp || 0;

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
                    const bludgersHitVal = rowIsBeater ? (s.BludgersHit || 0) : null;
                    const turnoversVal = rowIsBeater ? (s.TurnoversForced || 0) : null;
                    const teammatesVal = rowIsBeater ? (s.TeammatesProtected || 0) : null;
                    const sfVal = rowIsKeeper ? (s.KeeperShotsFaced || 0) : null;
                    const minPerSaveVal = rowIsKeeper && (s.KeeperSaves || 0) > 0 && mins > 0 ? mins / (s.KeeperSaves || 1) : null;
                    const minPerSFVal = rowIsKeeper && (sfVal || 0) > 0 && mins > 0 ? mins / (sfVal || 1) : null;
                    const minPerBHVal = rowIsBeater && (bludgersHitVal || 0) > 0 && mins > 0 ? mins / (bludgersHitVal || 1) : null;
                    const minPerTFVal = rowIsBeater && (turnoversVal || 0) > 0 && mins > 0 ? mins / (turnoversVal || 1) : null;
                    const minPerTPVal = rowIsBeater && (teammatesVal || 0) > 0 && mins > 0 ? mins / (teammatesVal || 1) : null;

                    // Match-level-derived values (Seeker avg catch time, Beater shots
                    // allowed) — looked up via the season|league|team aggregate maps.
                    const aggKey = s.SeasonID != null && s.LeagueID != null && s.TeamID != null ? `${s.SeasonID}|${s.LeagueID}|${s.TeamID}` : null;
                    const seekerAgg = rowIsSeeker && aggKey ? seekerCatchMap.get(aggKey) : undefined;
                    const avgCatchVal = seekerAgg && seekerAgg.catches > 0 ? seekerAgg.totalTime / seekerAgg.catches : null;
                    const beaterAgg = rowIsBeater && aggKey ? beaterShotsAllowedMap.get(aggKey) : undefined;
                    const shotsAllowedVal = beaterAgg ? beaterAgg.totalShotsAllowed : null;
                    const minPerSAVal = rowIsBeater && (shotsAllowedVal || 0) > 0 && mins > 0 ? mins / (shotsAllowedVal || 1) : null;

                    // Gold shading = this player individually led the league in THIS
                    // stat that season (checked per-column, not once for the whole row);
                    // bold italic = career best for this competition.
                    const goldBg = "bg-yellow-100 dark:bg-yellow-900/30";
                    const careerBestStyle = "font-bold italic";
                    const cc = (isBest: boolean, isLead: boolean) => isLead ? goldBg : isBest ? careerBestStyle : "";

                    const gpLead = isLeagueLeader(s, "GP", s.GamesPlayed);
                    const minLead = isLeagueLeader(s, "Min", mins);
                    const goalsLead = rowIsChaser && isLeagueLeader(s, "Goals", s.Goals);
                    const shotPctLead = rowIsChaser && isLeagueLeader(s, "ShotPct", shotPctVal);
                    const passPctLead = rowIsChaser && isLeagueLeader(s, "PassPct", passPctChaserVal);
                    const minPerGoalLead = rowIsChaser && isLeagueLeader(s, "MinPerGoal", minPerGoalVal);
                    const gscLead = rowIsSeeker && isLeagueLeader(s, "GoldenSnitchCatches", s.GoldenSnitchCatches);
                    const snitchPctLead = rowIsSeeker && isLeagueLeader(s, "SnitchPct", snitchPctVal);
                    const avgCatchLead = rowIsSeeker && isLeagueLeaderFromMap(leagueCatchBest, s.SeasonID, s.LeagueName, avgCatchVal);
                    const savesLead = rowIsKeeper && isLeagueLeader(s, "KeeperSaves", s.KeeperSaves);
                    const sfLead = rowIsKeeper && isLeagueLeader(s, "KeeperShotsFaced", sfVal);
                    const svPctLead = rowIsKeeper && isLeagueLeader(s, "SavePct", svPctVal);
                    const keeperPassPctLead = rowIsKeeper && isLeagueLeader(s, "KeeperPassPct", passPctKeeperVal);
                    const minPerSaveLead = rowIsKeeper && isLeagueLeader(s, "MinPerSave", minPerSaveVal);
                    const minPerSFLead = rowIsKeeper && isLeagueLeader(s, "MinPerShotFaced", minPerSFVal);
                    const bhLead = rowIsBeater && isLeagueLeader(s, "BludgersHit", bludgersHitVal);
                    const tfLead = rowIsBeater && isLeagueLeader(s, "TurnoversForced", turnoversVal);
                    const tpLead = rowIsBeater && isLeagueLeader(s, "TeammatesProtected", teammatesVal);
                    const minPerBHLead = rowIsBeater && isLeagueLeader(s, "MinPerBH", minPerBHVal);
                    const minPerTFLead = rowIsBeater && isLeagueLeader(s, "MinPerTF", minPerTFVal);
                    const minPerTPLead = rowIsBeater && isLeagueLeader(s, "MinPerTP", minPerTPVal);
                    const minPerSALead = rowIsBeater && isLeagueLeaderFromMap(leagueShotsAllowedBest, s.SeasonID, s.LeagueName, minPerSAVal);

                    const gpBest = compBest && (s.GamesPlayed || 0) > 0 && s.GamesPlayed === compBest.gp;
                    const minsBest = compBest && mins > 0 && mins === compBest.mins;

                    // Rate/counting stat bests — compare actual value to stored best (null-safe)
                    const EPS = 0.001; // float tolerance
                    const goalsBest = rowIsChaser && compBest && (s.Goals || 0) > 0 && s.Goals === compBest.goals;
                    const shotPctBest = rowIsChaser && shotPctVal !== null && extBest?.shotPct != null && Math.abs(shotPctVal - extBest.shotPct) < EPS;
                    const passPctChaserBest = rowIsChaser && passPctChaserVal !== null && extBest?.passPct != null && Math.abs(passPctChaserVal - extBest.passPct) < EPS;
                    const minPerGoalBest = rowIsChaser && minPerGoalVal !== null && extBest?.minPerGoal != null && Math.abs(minPerGoalVal - extBest.minPerGoal) < EPS;
                    const gscBest = rowIsSeeker && compBest && (s.GoldenSnitchCatches || 0) > 0 && s.GoldenSnitchCatches === compBest.gsc;
                    const snitchPctBest = rowIsSeeker && snitchPctVal !== null && extBest?.snitchPct != null && Math.abs(snitchPctVal - extBest.snitchPct) < EPS;
                    const avgCatchBest = rowIsSeeker && avgCatchVal !== null && extBest?.avgCatchTime != null && Math.abs(avgCatchVal - extBest.avgCatchTime) < EPS;
                    const savesBest = rowIsKeeper && compBest && (s.KeeperSaves || 0) > 0 && s.KeeperSaves === compBest.saves;
                    const sfBest = rowIsKeeper && compBest && (sfVal || 0) > 0 && sfVal === compBest.sf;
                    const svPctBest = rowIsKeeper && svPctVal !== null && extBest?.svPct != null && Math.abs(svPctVal - extBest.svPct) < EPS;
                    const keeperPassPctBest = rowIsKeeper && passPctKeeperVal !== null && extBest?.keeperPassPct != null && Math.abs(passPctKeeperVal - extBest.keeperPassPct) < EPS;
                    const minPerSaveBest = rowIsKeeper && minPerSaveVal !== null && extBest?.minPerSave != null && Math.abs(minPerSaveVal - extBest.minPerSave) < EPS;
                    const minPerSFBest = rowIsKeeper && minPerSFVal !== null && extBest?.minPerShotFaced != null && Math.abs(minPerSFVal - extBest.minPerShotFaced) < EPS;
                    const bludgersBest = rowIsBeater && compBest && (bludgersHitVal || 0) > 0 && bludgersHitVal === extBest?.bludgersHit;
                    const turnoversBest = rowIsBeater && (turnoversVal || 0) > 0 && turnoversVal === extBest?.turnovers;
                    const teammatesBest = rowIsBeater && (teammatesVal || 0) > 0 && teammatesVal === extBest?.teammates;
                    const minPerBHBest = rowIsBeater && minPerBHVal !== null && extBest?.minPerBH != null && Math.abs(minPerBHVal - extBest.minPerBH) < EPS;
                    const minPerTFBest = rowIsBeater && minPerTFVal !== null && extBest?.minPerTF != null && Math.abs(minPerTFVal - extBest.minPerTF) < EPS;
                    const minPerTPBest = rowIsBeater && minPerTPVal !== null && extBest?.minPerTP != null && Math.abs(minPerTPVal - extBest.minPerTP) < EPS;
                    const minPerSABest = rowIsBeater && minPerSAVal !== null && extBest?.minPerShotsAllowed != null && Math.abs(minPerSAVal - extBest.minPerShotsAllowed) < EPS;

                    const rowClass = `border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`;

                    return (
                      <tr key={i} className={rowClass}>
                        <td className={`${tdClass} font-mono`}>{seasonLabel(s.SeasonID)}</td>
                        <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{ageAtSeason(player.DOB, s.SeasonID)}</td>
                        <td className={`${tdClass} font-mono text-xs`} title={s.LeagueName || ""}>{abbrevLeague(s.LeagueName)}</td>
                        <td className={`${tdClass}`}>
                          {s.TeamFullName ? (
                            <>
                              <Link to={`/team/${encodeURIComponent(s.TeamFullName)}`} className="text-accent hover:underline">{s.TeamFullName}</Link>
                              {s.TeamID != null && captainSeasons.has(`${s.TeamID}|${s.SeasonID}`) && (
                                <span
                                  className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full border border-accent text-accent align-middle"
                                  title="Team Captain"
                                >C</span>
                              )}
                            </>
                          ) : "—"}
                        </td>
                        {positionsPlayed.length > 1 && <td className={`${tdClass} text-xs text-muted-foreground`}>{s.Position}</td>}
                        <td className={`px-3 py-1.5 text-right font-mono ${cc(!!gpBest, gpLead)}`}>{s.GamesPlayed}</td>
                        <td className={`px-3 py-1.5 text-right font-mono ${cc(!!minsBest, minLead)}`}>{fmtMin(mins)}</td>
                        {isChaser && <td className={`px-3 py-1.5 text-right font-mono ${rowIsChaser ? cc(!!goalsBest, !!goalsLead) : ""}`}>{rowIsChaser ? (s.Goals || 0) : "—"}</td>}
                        {isChaser && <td className={`px-3 py-1.5 text-right font-mono ${rowIsChaser ? cc(!!shotPctBest, !!shotPctLead) : "text-muted-foreground"}`}>{rowIsChaser ? (shotPctVal !== null ? shotPctVal.toFixed(1) + "%" : "—") : "—"}</td>}
                        {isChaser && <td className={`px-3 py-1.5 text-right font-mono ${rowIsChaser ? cc(!!passPctChaserBest, !!passPctLead) : "text-muted-foreground"}`}>{rowIsChaser ? (passPctChaserVal !== null ? passPctChaserVal.toFixed(1) + "%" : "—") : "—"}</td>}
                        {isChaser && <td className={`px-3 py-1.5 text-right font-mono ${rowIsChaser ? cc(!!minPerGoalBest, !!minPerGoalLead) : "text-muted-foreground"}`}>{rowIsChaser ? (minPerGoalVal !== null ? minPerGoalVal.toFixed(1) : "—") : "—"}</td>}
                        {isSeeker && <td className={`px-3 py-1.5 text-right font-mono ${rowIsSeeker ? cc(!!gscBest, !!gscLead) : ""}`}>{rowIsSeeker ? (s.GoldenSnitchCatches || 0) : "—"}</td>}
                        {isSeeker && <td className={`px-3 py-1.5 text-right font-mono ${rowIsSeeker ? cc(!!snitchPctBest, !!snitchPctLead) : "text-muted-foreground"}`}>{rowIsSeeker ? (snitchPctVal !== null ? snitchPctVal.toFixed(1) + "%" : "—") : "—"}</td>}
                        {isSeeker && <td className={`px-3 py-1.5 text-right font-mono ${rowIsSeeker ? cc(!!avgCatchBest, !!avgCatchLead) : "text-muted-foreground"}`} title="Average minutes elapsed when THIS seeker personally caught the snitch — games they didn't catch it are excluded, not counted as 0.">{rowIsSeeker ? (avgCatchVal !== null ? avgCatchVal.toFixed(1) : "—") : "—"}</td>}
                        {isKeeper && <td className={`px-3 py-1.5 text-right font-mono ${rowIsKeeper ? cc(!!savesBest, !!savesLead) : ""}`}>{rowIsKeeper ? (s.KeeperSaves || 0) : "—"}</td>}
                        {isKeeper && <td className={`px-3 py-1.5 text-right font-mono ${rowIsKeeper ? cc(!!sfBest, !!sfLead) : ""}`}>{rowIsKeeper ? (sfVal ?? "—") : "—"}</td>}
                        {isKeeper && <td className={`px-3 py-1.5 text-right font-mono ${rowIsKeeper ? cc(!!svPctBest, !!svPctLead) : "text-muted-foreground"}`}>{rowIsKeeper ? (svPctVal !== null ? svPctVal.toFixed(1) + "%" : "—") : "—"}</td>}
                        {isKeeper && <td className={`px-3 py-1.5 text-right font-mono ${rowIsKeeper ? cc(!!keeperPassPctBest, !!keeperPassPctLead) : "text-muted-foreground"}`}>{rowIsKeeper ? (passPctKeeperVal !== null ? passPctKeeperVal.toFixed(1) + "%" : "—") : "—"}</td>}
                        {isKeeper && <td className={`px-3 py-1.5 text-right font-mono ${rowIsKeeper ? cc(!!minPerSaveBest, !!minPerSaveLead) : "text-muted-foreground"}`}>{rowIsKeeper ? (minPerSaveVal !== null ? minPerSaveVal.toFixed(1) : "—") : "—"}</td>}
                        {isKeeper && <td className={`px-3 py-1.5 text-right font-mono ${rowIsKeeper ? cc(!!minPerSFBest, !!minPerSFLead) : "text-muted-foreground"}`}>{rowIsKeeper ? (minPerSFVal !== null ? minPerSFVal.toFixed(1) : "—") : "—"}</td>}
                        {isBeater && <td className={`px-3 py-1.5 text-right font-mono ${rowIsBeater ? cc(!!bludgersBest, !!bhLead) : ""}`}>{rowIsBeater ? (bludgersHitVal ?? "—") : "—"}</td>}
                        {isBeater && <td className={`px-3 py-1.5 text-right font-mono ${rowIsBeater ? cc(!!turnoversBest, !!tfLead) : ""}`}>{rowIsBeater ? (turnoversVal ?? "—") : "—"}</td>}
                        {isBeater && <td className={`px-3 py-1.5 text-right font-mono ${rowIsBeater ? cc(!!teammatesBest, !!tpLead) : ""}`}>{rowIsBeater ? (teammatesVal ?? "—") : "—"}</td>}
                        {isBeater && <td className={`px-3 py-1.5 text-right font-mono ${rowIsBeater ? cc(!!minPerBHBest, !!minPerBHLead) : "text-muted-foreground"}`}>{rowIsBeater ? (minPerBHVal !== null ? minPerBHVal.toFixed(1) : "—") : "—"}</td>}
                        {isBeater && <td className={`px-3 py-1.5 text-right font-mono ${rowIsBeater ? cc(!!minPerTFBest, !!minPerTFLead) : "text-muted-foreground"}`}>{rowIsBeater ? (minPerTFVal !== null ? minPerTFVal.toFixed(1) : "—") : "—"}</td>}
                        {isBeater && <td className={`px-3 py-1.5 text-right font-mono ${rowIsBeater ? cc(!!minPerTPBest, !!minPerTPLead) : "text-muted-foreground"}`}>{rowIsBeater ? (minPerTPVal !== null ? minPerTPVal.toFixed(1) : "—") : "—"}</td>}
                        {isBeater && <td className={`px-3 py-1.5 text-right font-mono ${rowIsBeater ? "" : ""}`} title="Chaser shot attempts allowed by the opposing team while these beaters played">{rowIsBeater ? (shotsAllowedVal ?? "—") : "—"}</td>}
                        {isBeater && <td className={`px-3 py-1.5 text-right font-mono ${rowIsBeater ? cc(!!minPerSABest, !!minPerSALead) : "text-muted-foreground"}`} title="Higher is better here — more minutes elapsing per shot allowed means better defense">{rowIsBeater ? (minPerSAVal !== null ? minPerSAVal.toFixed(1) : "—") : "—"}</td>}
                      </tr>
                    );
                  })}
                  {(() => {
                    const ct = "px-3 py-1.5 text-right font-mono text-foreground";
                    const careerAvgCatch = careerTotals.seekerCatches > 0 ? careerTotals.seekerCatchTotalTime / careerTotals.seekerCatches : null;
                    return (
                      <tr className="border-t-2 border-primary bg-primary/5 font-bold">
                        <td className="px-3 py-1.5 text-foreground font-mono" colSpan={positionsPlayed.length > 1 ? 5 : 4}>Career Totals</td>
                        <td className={ct}>{careerTotals.gp}</td>
                        <td className={ct}>{careerTotals.minutes > 0 ? careerTotals.minutes : "—"}</td>
                        {isChaser && <td className={ct}>{careerTotals.goals}</td>}
                        {isChaser && <td className={ct}>{careerTotals.shotAtt > 0 ? ((careerTotals.shotScored / careerTotals.shotAtt) * 100).toFixed(1) + "%" : "—"}</td>}
                        {isChaser && <td className={ct}>{careerTotals.passAtt > 0 ? ((careerTotals.passComp / careerTotals.passAtt) * 100).toFixed(1) + "%" : "—"}</td>}
                        {isChaser && <td className={ct}>{careerTotals.minutes > 0 && careerTotals.goals > 0 ? (careerTotals.minutes / careerTotals.goals).toFixed(1) : "—"}</td>}
                        {isSeeker && <td className={ct}>{careerTotals.gsc}</td>}
                        {isSeeker && <td className={ct}>{careerTotals.gp > 0 ? ((careerTotals.gsc / careerTotals.gp) * 100).toFixed(1) + "%" : "—"}</td>}
                        {isSeeker && <td className={ct}>{careerAvgCatch !== null ? careerAvgCatch.toFixed(1) : "—"}</td>}
                        {isKeeper && <td className={ct}>{careerTotals.saves}</td>}
                        {isKeeper && <td className={ct}>{careerTotals.shotsFaced}</td>}
                        {isKeeper && <td className={ct}>{careerTotals.shotsFaced > 0 ? ((careerTotals.saves / careerTotals.shotsFaced) * 100).toFixed(1) + "%" : "—"}</td>}
                        {isKeeper && <td className={ct}>{careerTotals.keeperPassAtt > 0 ? ((careerTotals.keeperPassComp / careerTotals.keeperPassAtt) * 100).toFixed(1) + "%" : "—"}</td>}
                        {isKeeper && <td className={ct}>{careerTotals.minutes > 0 && careerTotals.saves > 0 ? (careerTotals.minutes / careerTotals.saves).toFixed(1) : "—"}</td>}
                        {isKeeper && <td className={ct}>{careerTotals.minutes > 0 && careerTotals.shotsFaced > 0 ? (careerTotals.minutes / careerTotals.shotsFaced).toFixed(1) : "—"}</td>}
                        {isBeater && <td className={ct}>{careerTotals.bludgersHit}</td>}
                        {isBeater && <td className={ct}>{careerTotals.turnoversForced}</td>}
                        {isBeater && <td className={ct}>{careerTotals.teammatesProtected}</td>}
                        {isBeater && <td className={ct}>{careerTotals.minutes > 0 && careerTotals.bludgersHit > 0 ? (careerTotals.minutes / careerTotals.bludgersHit).toFixed(1) : "—"}</td>}
                        {isBeater && <td className={ct}>{careerTotals.minutes > 0 && careerTotals.turnoversForced > 0 ? (careerTotals.minutes / careerTotals.turnoversForced).toFixed(1) : "—"}</td>}
                        {isBeater && <td className={ct}>{careerTotals.minutes > 0 && careerTotals.teammatesProtected > 0 ? (careerTotals.minutes / careerTotals.teammatesProtected).toFixed(1) : "—"}</td>}
                        {isBeater && <td className={ct}>{careerTotals.shotsAllowed > 0 ? careerTotals.shotsAllowed : "—"}</td>}
                        {isBeater && <td className={ct}>{careerTotals.minutes > 0 && careerTotals.shotsAllowed > 0 ? (careerTotals.minutes / careerTotals.shotsAllowed).toFixed(1) : "—"}</td>}
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-1.5 bg-secondary/50 text-xs text-muted-foreground font-sans flex gap-4 flex-wrap">
              <span><span className="bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">Shaded</span> = led the league in that stat that season</span>
              <span><span className="font-bold italic">Bold italic</span> = career best for competition</span>
              {isChaser && <span>Sh% = Shooting%, Pass% = Passing%, Min/G = Minutes per Goal</span>}
              {isSeeker && <span>Avg Catch = average minutes to catch, over games caught only</span>}
              {isKeeper && <span>SF = Shots Faced, Sv% = Save%</span>}
              {isBeater && <span>BH = Bludgers Hit, TF = Turnovers Forced, TP = Teammates Protected, SA = Shots Allowed (higher Min/SA = better defense)</span>}
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
                    {isSeeker && <th className={`${thClass} text-right`}>Avg Catch</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Saves</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>SF</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Sv%</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Pass%</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Min/Sv</th>}
                    {isKeeper && <th className={`${thClass} text-right`}>Min/SF</th>}
                    {isBeater && <th className={`${thClass} text-right`}>BH</th>}
                    {isBeater && <th className={`${thClass} text-right`}>TF</th>}
                    {isBeater && <th className={`${thClass} text-right`}>TP</th>}
                    {isBeater && <th className={`${thClass} text-right`}>Min/BH</th>}
                    {isBeater && <th className={`${thClass} text-right`}>Min/TF</th>}
                    {isBeater && <th className={`${thClass} text-right`}>Min/TP</th>}
                    {isBeater && <th className={`${thClass} text-right`}>SA</th>}
                    {isBeater && <th className={`${thClass} text-right`}>Min/SA</th>}
                  </tr>
                </thead>
                <tbody>
                  {[...byCompetition.entries()].map(([comp, totals], i) => {
                    const compAvgCatch = totals.seekerCatches > 0 ? totals.seekerCatchTotalTime / totals.seekerCatches : null;
                    return (
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
                      {isSeeker && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{compAvgCatch !== null ? compAvgCatch.toFixed(1) : "—"}</td>}
                      {isKeeper && <td className={`${tdClass} text-right font-mono`}>{totals.saves}</td>}
                      {isKeeper && <td className={`${tdClass} text-right font-mono`}>{totals.shotsFaced}</td>}
                      {isKeeper && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.shotsFaced > 0 ? ((totals.saves / totals.shotsFaced) * 100).toFixed(1) + "%" : "—"}</td>}
                      {isKeeper && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.kPassAtt > 0 ? ((totals.kPassComp / totals.kPassAtt) * 100).toFixed(1) + "%" : "—"}</td>}
                      {isKeeper && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.minutes > 0 && totals.saves > 0 ? (totals.minutes / totals.saves).toFixed(1) : "—"}</td>}
                      {isKeeper && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.minutes > 0 && totals.shotsFaced > 0 ? (totals.minutes / totals.shotsFaced).toFixed(1) : "—"}</td>}
                      {isBeater && <td className={`${tdClass} text-right font-mono`}>{totals.bh}</td>}
                      {isBeater && <td className={`${tdClass} text-right font-mono`}>{totals.tf}</td>}
                      {isBeater && <td className={`${tdClass} text-right font-mono`}>{totals.tp}</td>}
                      {isBeater && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.minutes > 0 && totals.bh > 0 ? (totals.minutes / totals.bh).toFixed(1) : "—"}</td>}
                      {isBeater && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.minutes > 0 && totals.tf > 0 ? (totals.minutes / totals.tf).toFixed(1) : "—"}</td>}
                      {isBeater && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.minutes > 0 && totals.tp > 0 ? (totals.minutes / totals.tp).toFixed(1) : "—"}</td>}
                      {isBeater && <td className={`${tdClass} text-right font-mono`}>{totals.shotsAllowed > 0 ? totals.shotsAllowed : "—"}</td>}
                      {isBeater && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.minutes > 0 && totals.shotsAllowed > 0 ? (totals.minutes / totals.shotsAllowed).toFixed(1) : "—"}</td>}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Awards & Honours — Baseball Reference style */}
          {(playerAwards.length > 0 || leagueLeaders.length > 0 || teamCompWins.length > 0) && (() => {
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
            // Track the actual award name(s) used for team-style awards per league,
            // since it may differ across leagues (e.g. a cup competition's own
            // "Cup Team of the Year" alongside a domestic league's "Team of the Year").
            const totyNameByLeague = new Map<number, string>();

            playerAwards.forEach(a => {
              if (teamStyleAwardMap.get(`${a.leagueid}|${a.awardname}`)) {
                if (!totyByLeague.has(a.leagueid)) totyByLeague.set(a.leagueid, []);
                totyByLeague.get(a.leagueid)!.push(a);
                if (!totyNameByLeague.has(a.leagueid)) totyNameByLeague.set(a.leagueid, a.awardname);
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
                  const totyAwardName = totyNameByLeague.get(lid) || "Team of the Year";

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
                  const totySeasons = [...totySeasonsMap.keys()].sort((a, b) => a - b);

                  if (awardGroups.size === 0 && toty.length === 0) return null;

                  return (
                    <div key={lid} className="border-t border-border first:border-t-0">
                      {/* League header */}
                      <div className="px-3 py-1.5 bg-secondary/40 flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{labbr}</span>
                        <span className="text-xs text-muted-foreground font-sans">— {lname}</span>
                      </div>

                      {/* Unified awards table: regular awards + Team of the Year share one table
                          so columns, padding and zebra-striping line up consistently. */}
                      {(awardGroups.size > 0 || toty.length > 0) && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm font-sans">
                            <thead>
                              <tr className="bg-secondary/30">
                                <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-48">Award</th>
                                <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seasons</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                // Build a unified row list: regular awards first, then TOTY (if any).
                                type RowKind =
                                  | { kind: "regular"; awardName: string; entries: AwardEntry[] }
                                  | { kind: "toty" };
                                const rows: RowKind[] = [...awardGroups.entries()].map(([awardName, entries]) => ({
                                  kind: "regular" as const, awardName, entries,
                                }));
                                if (toty.length > 0) rows.push({ kind: "toty" as const });

                                return rows.map((row, ai) => {
                                  const stripeCls = ai % 2 === 1 ? "bg-table-stripe" : "bg-card";

                                  if (row.kind === "regular") {
                                    const sortedEntries = [...row.entries].sort((a, b) =>
                                      a.seasonid - b.seasonid || a.placement - b.placement
                                    );

                                    return (
                                      <tr key={`reg-${row.awardName}`} className={`border-t border-border/50 ${stripeCls}`}>
                                        <td className="px-3 py-2 font-medium text-foreground text-sm align-top">
                                          <Link to={`/league/${lid}/award/${encodeURIComponent(row.awardName)}`} className="hover:text-accent hover:underline">
                                            {row.awardName}
                                          </Link>
                                        </td>
                                        <td className="px-3 py-2">
                                          <div className="flex flex-wrap gap-1.5">
                                            {sortedEntries.map(e => (
                                              <span
                                                key={`${e.placement}-${e.seasonid}`}
                                                title={`${plLabel(e.placement)} place`}
                                                className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-mono
                                                  ${e.placement === 1 ? "bg-yellow-500/15 border-yellow-500/40 text-yellow-700 dark:text-yellow-400"
                                                    : e.placement === 2 ? "bg-slate-400/15 border-slate-400/40 text-slate-600 dark:text-slate-300"
                                                    : e.placement === 3 ? "bg-amber-700/15 border-amber-700/40 text-amber-700 dark:text-amber-500"
                                                    : "bg-muted/40 border-border text-muted-foreground"}`}
                                              >
                                                <span className="font-bold">{plLabel(e.placement)}</span>
                                                <span>{seasonLabel(e.seasonid)}</span>
                                              </span>
                                            ))}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  }

                                  // TOTY row
                                  return (
                                    <tr key="toty" className={`border-t border-border/50 ${stripeCls}`}>
                                      <td className="px-3 py-2 font-medium text-foreground text-sm align-top">
                                        <Link to={`/league/${lid}/award/${encodeURIComponent(totyAwardName)}`} className="hover:text-accent hover:underline">
                                          {totyAwardName}
                                        </Link>
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="flex flex-wrap gap-1.5">
                                          {totySeasons.map(sid => {
                                            const entries = totySeasonsMap.get(sid)!;
                                            const placementCounts = new Map<number, number>();
                                            entries.forEach(e => placementCounts.set(e.placement, (placementCounts.get(e.placement) || 0) + 1));
                                            const maxPl = Math.max(...entries.map(e => e.placement));
                                            const isTeamNumber = maxPl <= 3 || [...placementCounts.values()].some(c => c > 1);

                                            const myPlacements = entries.map(e => e.placement).sort();
                                            const uniquePlacements = [...new Set(myPlacements)];

                                            return uniquePlacements.map(pl => (
                                              <span
                                                key={`toty-${sid}-${pl}`}
                                                title={isTeamNumber ? `${plLabel(pl)} Team` : "Selection"}
                                                className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-mono
                                                  ${pl === 1 ? "bg-yellow-500/15 border-yellow-500/40 text-yellow-700 dark:text-yellow-400"
                                                    : pl === 2 ? "bg-slate-400/15 border-slate-400/40 text-slate-600 dark:text-slate-300"
                                                    : pl === 3 ? "bg-amber-700/15 border-amber-700/40 text-amber-700 dark:text-amber-500"
                                                    : "bg-muted/40 border-border text-muted-foreground"}`}
                                              >
                                                {isTeamNumber && <span className="font-bold">{plLabel(pl)}</span>}
                                                <span>{seasonLabel(sid)}</span>
                                              </span>
                                            ));
                                          })}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>
                      )}

                    </div>
                  );
                })}

                {/* ── Team Competition Wins ── */}
                {teamCompWins.length > 0 && (() => {
                  // Group by leagueId → list of { seasonId, teamName }
                  const byLeague = new Map<number, { leagueName: string; entries: { seasonId: number; teamName: string }[] }>();
                  teamCompWins.forEach(w => {
                    if (!byLeague.has(w.leagueId)) byLeague.set(w.leagueId, { leagueName: w.leagueName, entries: [] });
                    byLeague.get(w.leagueId)!.entries.push({ seasonId: w.seasonId, teamName: w.teamName });
                  });
                  const leagueIds = [...byLeague.keys()].sort((a, b) => a - b);
                  return (
                    <div className="border-t border-border">
                      <div className="px-3 py-1.5 bg-secondary/40">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Team Competition Wins</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm font-sans">
                          <thead>
                            <tr className="bg-secondary/30">
                              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-48">Competition</th>
                              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seasons</th>
                            </tr>
                          </thead>
                          <tbody>
                            {leagueIds.map((lid, i) => {
                              const grp = byLeague.get(lid)!;
                              const sorted = [...grp.entries].sort((a, b) => a.seasonId - b.seasonId);
                              return (
                                <tr key={lid} className={`border-t border-border/50 ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                                  <td className="px-3 py-2 font-medium text-foreground text-sm align-top">
                                    <Link to={`/league/${lid}`} className="hover:text-accent hover:underline">
                                      {grp.leagueName}
                                    </Link>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap gap-1.5">
                                      {sorted.map(e => (
                                        <span
                                          key={`${e.seasonId}-${e.teamName}`}
                                          title={`${e.teamName} — Champion`}
                                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-mono bg-yellow-500/15 border-yellow-500/40 text-yellow-700 dark:text-yellow-400"
                                        >
                                          <span className="font-bold">1st</span>
                                          <span>{seasonLabel(e.seasonId)}</span>
                                          <span className="opacity-70">{e.teamName}</span>
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
                  );
                })()}

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
                              <td className={`${tdClass} text-center font-bold text-xs ${won ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
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
      <MobileBottomNav />
    </div>
  );
}
