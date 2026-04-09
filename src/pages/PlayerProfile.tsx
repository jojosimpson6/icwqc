import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { formatHeight, calculateAge, formatDate, getNationFlag } from "@/lib/helpers";
import { fetchAllRows } from "@/lib/fetchAll";
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

function ageAtSeasonFromDate(dob: string | null, firstMatchDate: string | null): string {
  if (!dob || !firstMatchDate) return "—";
  const birth = new Date(dob);
  const [fy, fm, fd] = firstMatchDate.split("-").map(Number);
  const refDate = new Date(fy, fm - 1, fd);
  let age = refDate.getFullYear() - birth.getFullYear();
  const m = refDate.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && refDate.getDate() < birth.getDate())) age--;
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
  const [extStatsMap, setExtStatsMap] = useState<ExtendedStatsMap>(new Map());
  const [matchLog, setMatchLog] = useState<MatchLogEntry[]>([]);
  const [matchLogOpen, setMatchLogOpen] = useState(true);
  const [matchLogSeason, setMatchLogSeason] = useState<number | "all">("all");
  const [matchLogSortKey, setMatchLogSortKey] = useState<string>("date");
  const [matchLogSortDir, setMatchLogSortDir] = useState<"asc" | "desc">("asc");
  const [compFilter, setCompFilter] = useState<string>("all");
  const [detectedPositions, setDetectedPositions] = useState<string[]>([]);
  const [playerAwards, setPlayerAwards] = useState<{ awardname: string; placement: number; seasonid: number; leagueid: number; leagueName?: string }[]>([]);
  const [leagueNameMap, setLeagueNameMap] = useState<Map<number, string>>(new Map());
  const [firstMatchDateMap, setFirstMatchDateMap] = useState<Map<number, string>>(new Map());
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

    // Fetch player awards
    Promise.all([
      supabase.from("awards").select("*").eq("playerid", pid).order("seasonid", { ascending: false }).order("awardname").order("placement"),
      supabase.from("leagues").select("LeagueID, LeagueName"),
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

    supabase.from("players").select("PlayerName").eq("PlayerID", pid).single().then(({ data: pData }) => {
      if (!pData?.PlayerName) return;
      const playerName = pData.PlayerName;

      fetchAllRows("stats", { select: "*", filters: [{ method: "eq", args: ["PlayerName", playerName] }], order: { column: "SeasonID", ascending: true } }).then(async (sData) => {
        if (!sData || sData.length === 0) return;
        setStats(sData as StatLine[]);
        if (sData.length > 0) {
          setMostRecentTeam((sData[sData.length - 1] as any).FullName || "");
        }

        // Detect all positions played
        const positions = [...new Set(sData.map(s => s.Position).filter(Boolean))] as string[];
        setDetectedPositions(positions);

        // Fetch match data for minutes/shots using ALL position filters
        const allOrFilters: string[] = [];
        if (positions.includes("Chaser")) {
          allOrFilters.push(`HomeChaser1ID.eq.${pid}`, `HomeChaser2ID.eq.${pid}`, `HomeChaser3ID.eq.${pid}`, `AwayChaser1ID.eq.${pid}`, `AwayChaser2ID.eq.${pid}`, `AwayChaser3ID.eq.${pid}`);
        }
        if (positions.includes("Seeker")) {
          allOrFilters.push(`HomeSeekerID.eq.${pid}`, `AwaySeekerID.eq.${pid}`);
        }
        if (positions.includes("Keeper")) {
          allOrFilters.push(`HomeKeeperID.eq.${pid}`, `AwayKeeperID.eq.${pid}`);
        }
        if (positions.includes("Beater")) {
          allOrFilters.push(`HomeBeater1ID.eq.${pid}`, `HomeBeater2ID.eq.${pid}`, `AwayBeater1ID.eq.${pid}`, `AwayBeater2ID.eq.${pid}`);
        }

        if (allOrFilters.length > 0) {
          Promise.all([
            fetchAllRows("results", {
              select: "MatchID,SeasonID,LeagueID,WeekID,SnitchCaughtTime,SnitchCaughtBy,HomeTeamID,AwayTeamID,HomeTeamScore,AwayTeamScore,HomeKeeperShotsFaced,AwayKeeperShotsFaced,HomeKeeperID,AwayKeeperID,HomeKeeperSaves,AwayKeeperSaves,HomeBeater1ID,HomeBeater2ID,AwayBeater1ID,AwayBeater2ID,HomeSeekerID,AwaySeekerID,HomeChaser1ID,HomeChaser1Goals,HomeChaser2ID,HomeChaser2Goals,HomeChaser3ID,HomeChaser3Goals,AwayChaser1ID,AwayChaser1Goals,AwayChaser2ID,AwayChaser2Goals,AwayChaser3ID,AwayChaser3Goals,IsNeutralSite,HomeChaser1PassAtt,HomeChaser1PassComp,HomeChaser1ShotAtt,HomeChaser1ShotScored,HomeChaser2PassAtt,HomeChaser2PassComp,HomeChaser2ShotAtt,HomeChaser2ShotScored,HomeChaser3PassAtt,HomeChaser3PassComp,HomeChaser3ShotAtt,HomeChaser3ShotScored,AwayChaser1PassAtt,AwayChaser1PassComp,AwayChaser1ShotAtt,AwayChaser1ShotScored,AwayChaser2PassAtt,AwayChaser2PassComp,AwayChaser2ShotAtt,AwayChaser2ShotScored,AwayChaser3PassAtt,AwayChaser3PassComp,AwayChaser3ShotAtt,AwayChaser3ShotScored,HomeKeeperPassAtt,HomeKeeperPassComp,HomeKeeperShotsSaved,HomeKeeperShotsParried,HomeKeeperShotsConceded,AwayKeeperPassAtt,AwayKeeperPassComp,AwayKeeperShotsSaved,AwayKeeperShotsParried,AwayKeeperShotsConceded,HomeBeater1BludgersHit,HomeBeater1TurnoversForced,HomeBeater1TeammatesProtected,HomeBeater1BludgerShotsFaced,HomeBeater2BludgersHit,HomeBeater2TurnoversForced,HomeBeater2TeammatesProtected,HomeBeater2BludgerShotsFaced,AwayBeater1BludgersHit,AwayBeater1TurnoversForced,AwayBeater1TeammatesProtected,AwayBeater1BludgerShotsFaced,AwayBeater2BludgersHit,AwayBeater2TurnoversForced,AwayBeater2TeammatesProtected,AwayBeater2BludgerShotsFaced,HomeSeekerSnitchSpotted,HomeSeekerCatchAttempts,AwaySeekerSnitchSpotted,AwaySeekerCatchAttempts",
              filters: [{ method: "or", args: [allOrFilters.join(",")] }],
              order: { column: "MatchID", ascending: false },
            }),
            supabase.from("leagues").select("LeagueID,LeagueName"),
            fetchAllRows("teams", { select: "TeamID, FullName" }),
            fetchAllRows("matchdays", { select: "MatchdayID, Matchday, SeasonID, LeagueID, MatchdayWeek" }),
          ]).then(([matchData, { data: leaguesData }, teamsData, mdData]) => {
            if (!matchData || matchData.length === 0) return;

            const leagueNameMap = new Map<number, string>();
            (leaguesData || []).forEach((l: { LeagueID: number; LeagueName: string | null }) => {
              if (l.LeagueID && l.LeagueName) leagueNameMap.set(l.LeagueID, l.LeagueName);
            });

            const teamNameMap = new Map<number, string>();
            (teamsData || []).forEach((t: any) => {
              if (t.TeamID) teamNameMap.set(t.TeamID, t.FullName);
            });

            const mdMap = new Map<string, string>();
            const fmdMap = new Map<number, string>();
            (mdData || []).forEach((md: any) => {
              if (md.SeasonID && md.LeagueID && md.MatchdayWeek != null && md.Matchday) {
                mdMap.set(`${md.SeasonID}|${md.LeagueID}|${md.MatchdayWeek}`, md.Matchday);
              }
              if (md.SeasonID && md.Matchday) {
                const existing = fmdMap.get(md.SeasonID);
                if (!existing || md.Matchday < existing) fmdMap.set(md.SeasonID, md.Matchday);
              }
            });

            const minsMap = new Map<string, number>();
            const sfMap = new Map<string, number>();
            const extMap: ExtendedStatsMap = new Map();
            const logEntries: MatchLogEntry[] = [];
            const seenMatchIds = new Set<number>();

            const getExt = (key: string): ExtendedStats => {
              if (!extMap.has(key)) extMap.set(key, { passAtt: 0, passComp: 0, shotAtt: 0, shotScored: 0, bludgersHit: 0, turnoversForced: 0, teammatesProtected: 0, bludgerShotsFaced: 0, snitchSpotted: 0, catchAttempts: 0, keeperShotsSaved: 0, keeperShotsParried: 0, keeperShotsConceded: 0 });
              return extMap.get(key)!;
            };

            matchData.forEach((r: Record<string, unknown>) => {
              const matchId = r.MatchID as number;
              if (seenMatchIds.has(matchId)) return;
              seenMatchIds.add(matchId);

              const sid = r.SeasonID as number;
              const lid = r.LeagueID as number;
              const lname = leagueNameMap.get(lid) || String(lid);
              const key = `${sid}|${lname}`;
              const matchMins = (r.SnitchCaughtTime as number) || 0;
              minsMap.set(key, (minsMap.get(key) || 0) + matchMins);

              const homePlayerIds = [r.HomeChaser1ID, r.HomeChaser2ID, r.HomeChaser3ID, r.HomeKeeperID, r.HomeSeekerID, r.HomeBeater1ID, r.HomeBeater2ID];
              const isHome = homePlayerIds.includes(pid);

              let matchPos: string | null = null;
              if ([r.HomeChaser1ID, r.HomeChaser2ID, r.HomeChaser3ID, r.AwayChaser1ID, r.AwayChaser2ID, r.AwayChaser3ID].includes(pid)) matchPos = "Chaser";
              else if ([r.HomeSeekerID, r.AwaySeekerID].includes(pid)) matchPos = "Seeker";
              else if ([r.HomeKeeperID, r.AwayKeeperID].includes(pid)) matchPos = "Keeper";
              else if ([r.HomeBeater1ID, r.HomeBeater2ID, r.AwayBeater1ID, r.AwayBeater2ID].includes(pid)) matchPos = "Beater";

              if (matchPos === "Beater" || matchPos === "Keeper") {
                const sf = isHome ? (r.HomeKeeperShotsFaced as number) || 0 : (r.AwayKeeperShotsFaced as number) || 0;
                sfMap.set(key, (sfMap.get(key) || 0) + sf);
              }

              // Aggregate extended stats
              const ext = getExt(key);
              if (matchPos === "Chaser") {
                const prefix = isHome ? "Home" : "Away";
                const chaserNum = isHome
                  ? (r.HomeChaser1ID === pid ? 1 : r.HomeChaser2ID === pid ? 2 : 3)
                  : (r.AwayChaser1ID === pid ? 1 : r.AwayChaser2ID === pid ? 2 : 3);
                ext.passAtt += (r[`${prefix}Chaser${chaserNum}PassAtt`] as number) || 0;
                ext.passComp += (r[`${prefix}Chaser${chaserNum}PassComp`] as number) || 0;
                ext.shotAtt += (r[`${prefix}Chaser${chaserNum}ShotAtt`] as number) || 0;
                ext.shotScored += (r[`${prefix}Chaser${chaserNum}ShotScored`] as number) || 0;
              } else if (matchPos === "Keeper") {
                const prefix = isHome ? "Home" : "Away";
                ext.passAtt += (r[`${prefix}KeeperPassAtt`] as number) || 0;
                ext.passComp += (r[`${prefix}KeeperPassComp`] as number) || 0;
                ext.keeperShotsSaved += (r[`${prefix}KeeperShotsSaved`] as number) || 0;
                ext.keeperShotsParried += (r[`${prefix}KeeperShotsParried`] as number) || 0;
                ext.keeperShotsConceded += (r[`${prefix}KeeperShotsConceded`] as number) || 0;
              } else if (matchPos === "Beater") {
                const prefix = isHome ? "Home" : "Away";
                const beaterNum = isHome
                  ? (r.HomeBeater1ID === pid ? 1 : 2)
                  : (r.AwayBeater1ID === pid ? 1 : 2);
                ext.bludgersHit += (r[`${prefix}Beater${beaterNum}BludgersHit`] as number) || 0;
                ext.turnoversForced += (r[`${prefix}Beater${beaterNum}TurnoversForced`] as number) || 0;
                ext.teammatesProtected += (r[`${prefix}Beater${beaterNum}TeammatesProtected`] as number) || 0;
                ext.bludgerShotsFaced += (r[`${prefix}Beater${beaterNum}BludgerShotsFaced`] as number) || 0;
              } else if (matchPos === "Seeker") {
                const prefix = isHome ? "Home" : "Away";
                ext.snitchSpotted += (r[`${prefix}SeekerSnitchSpotted`] as number) || 0;
                ext.catchAttempts += (r[`${prefix}SeekerCatchAttempts`] as number) || 0;
              }

              const oppId = isHome ? (r.AwayTeamID as number) : (r.HomeTeamID as number);
              const teamScore = isHome ? (r.HomeTeamScore as number) ?? 0 : (r.AwayTeamScore as number) ?? 0;
              const oppScore = isHome ? (r.AwayTeamScore as number) ?? 0 : (r.HomeTeamScore as number) ?? 0;
              const weekId = r.WeekID as number;
              const dateStr = weekId && sid && lid ? mdMap.get(`${sid}|${lid}|${weekId}`) || null : null;
              const isNeutral = (r.IsNeutralSite as number) === 1;

              let statStr = "";
              if (matchPos === "Chaser") {
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
              } else if (matchPos === "Keeper") {
                const saves = isHome ? (r.HomeKeeperSaves as number) || 0 : (r.AwayKeeperSaves as number) || 0;
                const sf = isHome ? (r.HomeKeeperShotsFaced as number) || 0 : (r.AwayKeeperShotsFaced as number) || 0;
                statStr = `${saves}/${sf} saves`;
              } else if (matchPos === "Seeker") {
                const snitchTeam = r.SnitchCaughtBy as number;
                const myTeam = isHome ? (r.HomeTeamID as number) : (r.AwayTeamID as number);
                statStr = snitchTeam === myTeam ? "✓ Caught" : "—";
              } else if (matchPos === "Beater") {
                const prefix = isHome ? "Home" : "Away";
                const beaterNum = isHome ? (r.HomeBeater1ID === pid ? 1 : 2) : (r.AwayBeater1ID === pid ? 1 : 2);
                const bh = (r[`${prefix}Beater${beaterNum}BludgersHit`] as number) || 0;
                const tf = (r[`${prefix}Beater${beaterNum}TurnoversForced`] as number) || 0;
                statStr = `${bh} BH, ${tf} TF`;
              }

              logEntries.push({
                MatchID: matchId,
                SeasonID: sid,
                opponentName: teamNameMap.get(oppId) || `Team ${oppId}`,
                isHome,
                isNeutral,
                teamScore,
                oppScore,
                stat: statStr,
                date: dateStr,
                leagueName: lname,
              });
            });

            setMinutesMap(minsMap);
            setShotsFacedMap(sfMap);
            setExtStatsMap(extMap);
            setMatchLog(logEntries);
            setFirstMatchDateMap(fmdMap);
          });
        }

        // League leaders logic - fetch one season at a time to avoid timeout
        const seasonIds = [...new Set(sData.map(s => s.SeasonID).filter(Boolean))] as number[];
        if (seasonIds.length === 0) return;

        const maxMap = new Map<string, Map<string, number>>();
        const awardEntries: LeagueLeaderEntry[] = [];

        for (const sid of seasonIds) {
          const seasonStats = await fetchAllRows("stats", {
            select: "PlayerName,Goals,GoldenSnitchCatches,KeeperSaves,KeeperShotsFaced,GamesPlayed,Position,SeasonID,LeagueName",
            filters: [{ method: "eq", args: ["SeasonID", sid] }],
          });
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

          // Combined all-league rankings for this season
          const allChasers = seasonStats.filter((r: Record<string, unknown>) => r.Position === "Chaser");
          if (allChasers.length) {
            const sorted = [...allChasers].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.Goals as number) || 0) - ((a.Goals as number) || 0));
            const rank = sorted.findIndex((r: Record<string, unknown>) => r.PlayerName === playerName) + 1;
            if (rank > 0 && rank <= 10 && !awardEntries.some(e => e.SeasonID === sid && e.stat === "Goals" && e.scope === "league")) {
              awardEntries.push({ SeasonID: sid, LeagueName: "All Leagues", stat: "Goals", value: (sorted[rank - 1]?.Goals as number) || 0, rank, scope: "combined" });
            }
          }
          const allSeekers = seasonStats.filter((r: Record<string, unknown>) => r.Position === "Seeker");
          if (allSeekers.length) {
            const sorted = [...allSeekers].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.GoldenSnitchCatches as number) || 0) - ((a.GoldenSnitchCatches as number) || 0));
            const rank = sorted.findIndex((r: Record<string, unknown>) => r.PlayerName === playerName) + 1;
            if (rank > 0 && rank <= 10 && !awardEntries.some(e => e.SeasonID === sid && e.stat === "Golden Snitch Catches" && e.scope === "league")) {
              awardEntries.push({ SeasonID: sid, LeagueName: "All Leagues", stat: "Golden Snitch Catches", value: (sorted[rank - 1]?.GoldenSnitchCatches as number) || 0, rank, scope: "combined" });
            }
          }
          const allKeepers = seasonStats.filter((r: Record<string, unknown>) => r.Position === "Keeper");
          if (allKeepers.length) {
            const sorted = [...allKeepers].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.KeeperSaves as number) || 0) - ((a.KeeperSaves as number) || 0));
            const rank = sorted.findIndex((r: Record<string, unknown>) => r.PlayerName === playerName) + 1;
            if (rank > 0 && rank <= 10 && !awardEntries.some(e => e.SeasonID === sid && e.stat === "Keeper Saves" && e.scope === "league")) {
              awardEntries.push({ SeasonID: sid, LeagueName: "All Leagues", stat: "Keeper Saves", value: (sorted[rank - 1]?.KeeperSaves as number) || 0, rank, scope: "combined" });
            }
          }
        }

        setLeagueMaxes(maxMap);
        awardEntries.sort((a, b) => {
          if (a.scope !== b.scope) return a.scope === "league" ? -1 : 1;
          return b.SeasonID - a.SeasonID;
        });
        setLeagueLeaders(awardEntries);
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
    minutes: [...minutesMap.values()].reduce((a, b) => a + b, 0),
  };

  const allTimeGoals = Math.max(0, ...stats.filter(s => s.Position === "Chaser").map(s => s.Goals || 0));
  const allTimeGSC = Math.max(0, ...stats.filter(s => s.Position === "Seeker").map(s => s.GoldenSnitchCatches || 0));
  const allTimeSaves = Math.max(0, ...stats.filter(s => s.Position === "Keeper").map(s => s.KeeperSaves || 0));
  const allTimeGP = Math.max(0, ...stats.map(s => s.GamesPlayed || 0));
  const allTimeMinutes = minutesMap.size > 0 ? Math.max(0, ...[...minutesMap.values()]) : 0;

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
  const bestByComp = new Map<string, { goals: number; gsc: number; saves: number; gp: number; mins: number }>();
  const bestExtByComp = new Map<string, { shotPct: number | null; snitchPct: number | null; svPct: number | null; bludgersHit: number; turnovers: number; sfPerGP: number | null; minPerGoal: number | null }>();
  stats.forEach(s => {
    const key = s.LeagueName || "Unknown";
    const mKey = `${s.SeasonID}|${s.LeagueName}`;
    const mins = minutesMap.get(mKey) || 0;
    const ext = extStatsMap.get(mKey);
    const sfFromResults = shotsFacedMap.get(mKey) || 0;
    const existing = bestByComp.get(key) || { goals: 0, gsc: 0, saves: 0, gp: 0, mins: 0 };
    const existingExt = bestExtByComp.get(key) || { shotPct: null, snitchPct: null, svPct: null, bludgersHit: 0, turnovers: 0, sfPerGP: null, minPerGoal: null };
    if ((s.Goals || 0) > existing.goals) existing.goals = s.Goals || 0;
    if ((s.GoldenSnitchCatches || 0) > existing.gsc) existing.gsc = s.GoldenSnitchCatches || 0;
    if ((s.KeeperSaves || 0) > existing.saves) existing.saves = s.KeeperSaves || 0;
    if ((s.GamesPlayed || 0) > existing.gp) existing.gp = s.GamesPlayed || 0;
    if (mins > existing.mins) existing.mins = mins;
    // Rate stats
    if (ext && ext.shotAtt > 0) { const v = (ext.shotScored / ext.shotAtt) * 100; if (existingExt.shotPct === null || v > existingExt.shotPct) existingExt.shotPct = v; }
    if ((s.GamesPlayed || 0) > 0) { const v = ((s.GoldenSnitchCatches || 0) / (s.GamesPlayed || 1)) * 100; if (existingExt.snitchPct === null || v > existingExt.snitchPct) existingExt.snitchPct = v; }
    if (s.KeeperShotsFaced) { const v = (s.KeeperSaves || 0) / s.KeeperShotsFaced * 100; if (existingExt.svPct === null || v > existingExt.svPct) existingExt.svPct = v; }
    if (ext && ext.bludgersHit > existingExt.bludgersHit) existingExt.bludgersHit = ext.bludgersHit;
    if (ext && ext.turnoversForced > existingExt.turnovers) existingExt.turnovers = ext.turnoversForced;
    if ((s.GamesPlayed || 0) > 0 && sfFromResults > 0) { const v = sfFromResults / (s.GamesPlayed || 1); if (existingExt.sfPerGP === null || v > existingExt.sfPerGP) existingExt.sfPerGP = v; }
    if ((s.Goals || 0) > 0 && mins > 0) { const v = mins / (s.Goals || 1); if (existingExt.minPerGoal === null || v < existingExt.minPerGoal) existingExt.minPerGoal = v; }
    bestByComp.set(key, existing);
    bestExtByComp.set(key, existingExt);
  });

  const byCompetition = new Map<string, { gp: number; goals: number; gsc: number; saves: number; shotsFaced: number; minutes: number; ext: ExtendedStats }>();
  stats.forEach((s) => {
    const key = s.LeagueName || "Unknown";
    const existing = byCompetition.get(key) || { gp: 0, goals: 0, gsc: 0, saves: 0, shotsFaced: 0, minutes: 0, ext: { passAtt: 0, passComp: 0, shotAtt: 0, shotScored: 0, bludgersHit: 0, turnoversForced: 0, teammatesProtected: 0, bludgerShotsFaced: 0, snitchSpotted: 0, catchAttempts: 0, keeperShotsSaved: 0, keeperShotsParried: 0, keeperShotsConceded: 0 } };
    existing.gp += s.GamesPlayed || 0;
    existing.goals += s.Goals || 0;
    existing.gsc += s.GoldenSnitchCatches || 0;
    existing.saves += s.KeeperSaves || 0;
    existing.shotsFaced += s.KeeperShotsFaced || 0;
    const mKey = `${s.SeasonID}|${s.LeagueName}`;
    existing.minutes += minutesMap.get(mKey) || 0;
    const ext = extStatsMap.get(mKey);
    if (ext) {
      existing.ext.passAtt += ext.passAtt; existing.ext.passComp += ext.passComp;
      existing.ext.shotAtt += ext.shotAtt; existing.ext.shotScored += ext.shotScored;
      existing.ext.bludgersHit += ext.bludgersHit; existing.ext.turnoversForced += ext.turnoversForced;
      existing.ext.teammatesProtected += ext.teammatesProtected; existing.ext.bludgerShotsFaced += ext.bludgerShotsFaced;
      existing.ext.snitchSpotted += ext.snitchSpotted; existing.ext.catchAttempts += ext.catchAttempts;
    }
    byCompetition.set(key, existing);
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
                    const compKey = s.LeagueName || "Unknown";
                    const compBest = bestByComp.get(compKey);
                    const mKey = `${s.SeasonID}|${s.LeagueName}`;
                    const mins = minutesMap.get(mKey) || 0;
                    const ext = extStatsMap.get(mKey);
                    const sfFromResults = shotsFacedMap.get(mKey) || 0;

                    // Compute all displayed values
                    const minPerGoalVal = rowIsChaser && (s.Goals || 0) > 0 && mins > 0
                      ? mins / (s.Goals || 1) : null;
                    const shotPctVal = rowIsChaser && ext && ext.shotAtt > 0
                      ? (ext.shotScored / ext.shotAtt) * 100 : null;
                    const passPctChaserVal = rowIsChaser && ext && ext.passAtt > 0
                      ? (ext.passComp / ext.passAtt) * 100 : null;
                    const snitchPctVal = rowIsSeeker && (s.GamesPlayed || 0) > 0
                      ? ((s.GoldenSnitchCatches || 0) / (s.GamesPlayed || 1)) * 100 : null;
                    const svPctVal = rowIsKeeper && s.KeeperShotsFaced
                      ? (s.KeeperSaves || 0) / s.KeeperShotsFaced * 100 : null;
                    const passPctKeeperVal = rowIsKeeper && ext && ext.passAtt > 0
                      ? (ext.passComp / ext.passAtt) * 100 : null;
                    const sfPerGPVal = rowIsBeater && (s.GamesPlayed || 0) > 0 && sfFromResults > 0
                      ? sfFromResults / (s.GamesPlayed || 1) : null;
                    const bludgersHitVal = rowIsBeater && ext ? ext.bludgersHit : null;
                    const turnoversVal = rowIsBeater && ext ? ext.turnoversForced : null;
                    const teammatesVal = rowIsBeater && ext ? ext.teammatesProtected : null;
                    const snitchSpottedVal = rowIsSeeker && ext ? ext.snitchSpotted : null;
                    const sfVal = rowIsKeeper ? (s.KeeperShotsFaced || 0) : null;

                    // Bold = career best for that competition; italic = league leader
                    // Track bests for each computed value
                    const goldBg = "bg-yellow-100 dark:bg-yellow-900/30 font-bold";
                    const lead = "italic font-semibold";
                    const cc = (isBest: boolean, isLead: boolean) => isBest ? goldBg : isLead ? lead : "";

                    const goalsBest = rowIsChaser && compBest && (s.Goals || 0) > 0 && (s.Goals || 0) === compBest.goals;
                    const gscBest = rowIsSeeker && compBest && (s.GoldenSnitchCatches || 0) > 0 && (s.GoldenSnitchCatches || 0) === compBest.gsc;
                    const savesBest = rowIsKeeper && compBest && (s.KeeperSaves || 0) > 0 && (s.KeeperSaves || 0) === compBest.saves;
                    const gpBest = compBest && (s.GamesPlayed || 0) > 0 && (s.GamesPlayed || 0) === compBest.gp;
                    const minsBest = compBest && mins > 0 && mins === compBest.mins;
                    // Rate stats: use per-comp best computed on the fly
                    const extBest = compBest ? (bestExtByComp.get(compKey) || null) : null;
                    const shotPctBest = rowIsChaser && shotPctVal !== null && extBest && shotPctVal >= (extBest.shotPct || 0) && shotPctVal > 0;
                    const passPctBest = (rowIsChaser || rowIsKeeper) && extBest && (rowIsChaser ? passPctChaserVal : passPctKeeperVal) !== null;
                    const minPerGoalBest = rowIsChaser && minPerGoalVal !== null && extBest && extBest.minPerGoal !== null && minPerGoalVal <= extBest.minPerGoal;
                    const snitchPctBest = rowIsSeeker && snitchPctVal !== null && extBest && snitchPctVal >= (extBest.snitchPct || 0);
                    const svPctBest = rowIsKeeper && svPctVal !== null && extBest && svPctVal >= (extBest.svPct || 0);
                    const bludgersBest = rowIsBeater && bludgersHitVal !== null && extBest && bludgersHitVal >= (extBest.bludgersHit || 0) && bludgersHitVal > 0;
                    const turnoversBest = rowIsBeater && turnoversVal !== null && extBest && turnoversVal >= (extBest.turnovers || 0) && turnoversVal > 0;
                    const sfPerGPBest = rowIsBeater && sfPerGPVal !== null && extBest && extBest.sfPerGP !== null && sfPerGPVal >= extBest.sfPerGP;

                    const rowClass = `border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`;

                    return (
                      <tr key={i} className={rowClass}>
                        <td className={`${tdClass} font-mono`}>{seasonLabel(s.SeasonID)}</td>
                        <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{ageAtSeasonFromDate(player.DOB, s.SeasonID ? firstMatchDateMap.get(s.SeasonID) || null : null)}</td>
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
                        {isChaser && <td className={`px-3 py-1.5 text-right font-mono ${rowIsChaser ? cc(!!passPctBest, isLeader) : "text-muted-foreground"}`}>{rowIsChaser ? (passPctChaserVal !== null ? passPctChaserVal.toFixed(1) + "%" : "—") : "—"}</td>}
                        {isChaser && <td className={`px-3 py-1.5 text-right font-mono ${rowIsChaser ? cc(minPerGoalBest, isLeader) : "text-muted-foreground"}`}>{rowIsChaser ? (minPerGoalVal !== null ? minPerGoalVal.toFixed(1) : "—") : "—"}</td>}
                        {isSeeker && <td className={`px-3 py-1.5 text-right font-mono ${rowIsSeeker ? cc(gscBest, isLeader) : ""}`}>{rowIsSeeker ? (s.GoldenSnitchCatches || 0) : "—"}</td>}
                        {isSeeker && <td className={`px-3 py-1.5 text-right font-mono ${rowIsSeeker ? cc(snitchPctBest, isLeader) : "text-muted-foreground"}`}>{rowIsSeeker ? (snitchPctVal !== null ? snitchPctVal.toFixed(1) + "%" : "—") : "—"}</td>}
                        {isSeeker && <td className={`px-3 py-1.5 text-right font-mono ${rowIsSeeker ? cc(false, isLeader) : "text-muted-foreground"}`}>{rowIsSeeker ? (snitchSpottedVal ?? "—") : "—"}</td>}
                        {isKeeper && <td className={`px-3 py-1.5 text-right font-mono ${rowIsKeeper ? cc(savesBest, isLeader) : ""}`}>{rowIsKeeper ? (s.KeeperSaves || 0) : "—"}</td>}
                        {isKeeper && <td className={`px-3 py-1.5 text-right font-mono ${rowIsKeeper ? cc(false, isLeader) : ""}`}>{rowIsKeeper ? (sfVal ?? "—") : "—"}</td>}
                        {isKeeper && <td className={`px-3 py-1.5 text-right font-mono ${rowIsKeeper ? cc(svPctBest, isLeader) : "text-muted-foreground"}`}>{rowIsKeeper ? (svPctVal !== null ? svPctVal.toFixed(1) + "%" : "—") : "—"}</td>}
                        {isKeeper && <td className={`px-3 py-1.5 text-right font-mono ${rowIsKeeper ? cc(!!passPctBest, isLeader) : "text-muted-foreground"}`}>{rowIsKeeper ? (passPctKeeperVal !== null ? passPctKeeperVal.toFixed(1) + "%" : "—") : "—"}</td>}
                        {isBeater && <td className={`px-3 py-1.5 text-right font-mono ${rowIsBeater ? cc(bludgersBest, isLeader) : ""}`}>{rowIsBeater ? (bludgersHitVal ?? "—") : "—"}</td>}
                        {isBeater && <td className={`px-3 py-1.5 text-right font-mono ${rowIsBeater ? cc(turnoversBest, isLeader) : ""}`}>{rowIsBeater ? (turnoversVal ?? "—") : "—"}</td>}
                        {isBeater && <td className={`px-3 py-1.5 text-right font-mono ${rowIsBeater ? cc(false, isLeader) : ""}`}>{rowIsBeater ? (teammatesVal ?? "—") : "—"}</td>}
                        {isBeater && <td className={`px-3 py-1.5 text-right font-mono ${rowIsBeater ? cc(sfPerGPBest, isLeader) : "text-muted-foreground"}`}>{rowIsBeater ? (sfPerGPVal !== null ? sfPerGPVal.toFixed(2) : "—") : "—"}</td>}
                      </tr>
                    );
                  })}
                  {(() => {
                    const careerExt: ExtendedStats = { passAtt: 0, passComp: 0, shotAtt: 0, shotScored: 0, bludgersHit: 0, turnoversForced: 0, teammatesProtected: 0, bludgerShotsFaced: 0, snitchSpotted: 0, catchAttempts: 0, keeperShotsSaved: 0, keeperShotsParried: 0, keeperShotsConceded: 0 };
                    extStatsMap.forEach(v => {
                      careerExt.passAtt += v.passAtt; careerExt.passComp += v.passComp;
                      careerExt.shotAtt += v.shotAtt; careerExt.shotScored += v.shotScored;
                      careerExt.bludgersHit += v.bludgersHit; careerExt.turnoversForced += v.turnoversForced;
                      careerExt.teammatesProtected += v.teammatesProtected; careerExt.bludgerShotsFaced += v.bludgerShotsFaced;
                      careerExt.snitchSpotted += v.snitchSpotted; careerExt.catchAttempts += v.catchAttempts;
                      careerExt.keeperShotsSaved += v.keeperShotsSaved; careerExt.keeperShotsParried += v.keeperShotsParried;
                      careerExt.keeperShotsConceded += v.keeperShotsConceded;
                    });
                    const ct = "px-3 py-1.5 text-right font-mono text-primary";
                    return (
                      <tr className="border-t-2 border-primary bg-primary/5 font-bold">
                        <td className="px-3 py-1.5 text-primary font-mono" colSpan={positionsPlayed.length > 1 ? 5 : 4}>Career Totals</td>
                        <td className={ct}>{careerTotals.gp}</td>
                        <td className={ct}>{careerTotals.minutes > 0 ? careerTotals.minutes : "—"}</td>
                        {isChaser && <td className={ct}>{careerTotals.goals}</td>}
                        {isChaser && <td className={ct}>{careerExt.shotAtt > 0 ? ((careerExt.shotScored / careerExt.shotAtt) * 100).toFixed(1) + "%" : "—"}</td>}
                        {isChaser && <td className={ct}>{careerExt.passAtt > 0 ? ((careerExt.passComp / careerExt.passAtt) * 100).toFixed(1) + "%" : "—"}</td>}
                        {isChaser && <td className={ct}>{careerTotals.minutes > 0 && careerTotals.goals > 0 ? (careerTotals.minutes / careerTotals.goals).toFixed(1) : "—"}</td>}
                        {isSeeker && <td className={ct}>{careerTotals.gsc}</td>}
                        {isSeeker && <td className={ct}>{careerTotals.gp > 0 ? ((careerTotals.gsc / careerTotals.gp) * 100).toFixed(1) + "%" : "—"}</td>}
                        {isSeeker && <td className={ct}>{careerExt.snitchSpotted}</td>}
                        {isKeeper && <td className={ct}>{careerTotals.saves}</td>}
                        {isKeeper && <td className={ct}>{careerTotals.shotsFaced}</td>}
                        {isKeeper && <td className={ct}>{careerTotals.shotsFaced ? ((careerTotals.saves / careerTotals.shotsFaced) * 100).toFixed(1) + "%" : "—"}</td>}
                        {isKeeper && <td className={ct}>{careerExt.passAtt > 0 ? ((careerExt.passComp / careerExt.passAtt) * 100).toFixed(1) + "%" : "—"}</td>}
                        {isBeater && <td className={ct}>{careerExt.bludgersHit}</td>}
                        {isBeater && <td className={ct}>{careerExt.turnoversForced}</td>}
                        {isBeater && <td className={ct}>{careerExt.teammatesProtected}</td>}
                        {isBeater && <td className={ct}>{careerTotals.gp > 0 && careerExt.bludgerShotsFaced > 0 ? (careerExt.bludgerShotsFaced / careerTotals.gp).toFixed(2) : "—"}</td>}
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-1.5 bg-secondary/50 text-xs text-muted-foreground font-sans flex gap-4 flex-wrap">
              <span><span className="font-bold">Bold</span> = league leader</span>
              <span><span className="bg-yellow-100 dark:bg-yellow-900/30 font-bold px-1 rounded">Shaded</span> = career best</span>
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
                      {isChaser && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.ext.shotAtt > 0 ? ((totals.ext.shotScored / totals.ext.shotAtt) * 100).toFixed(1) + "%" : "—"}</td>}
                      {isChaser && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.ext.passAtt > 0 ? ((totals.ext.passComp / totals.ext.passAtt) * 100).toFixed(1) + "%" : "—"}</td>}
                      {isChaser && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.minutes > 0 && totals.goals > 0 ? (totals.minutes / totals.goals).toFixed(1) : "—"}</td>}
                      {isSeeker && <td className={`${tdClass} text-right font-mono`}>{totals.gsc}</td>}
                      {isSeeker && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.gp > 0 ? ((totals.gsc / totals.gp) * 100).toFixed(1) + "%" : "—"}</td>}
                      {isSeeker && <td className={`${tdClass} text-right font-mono`}>{totals.ext.snitchSpotted}</td>}
                      {isKeeper && <td className={`${tdClass} text-right font-mono`}>{totals.saves}</td>}
                      {isKeeper && <td className={`${tdClass} text-right font-mono`}>{totals.shotsFaced}</td>}
                      {isKeeper && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.shotsFaced ? ((totals.saves / totals.shotsFaced) * 100).toFixed(1) + "%" : "—"}</td>}
                      {isKeeper && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.ext.passAtt > 0 ? ((totals.ext.passComp / totals.ext.passAtt) * 100).toFixed(1) + "%" : "—"}</td>}
                      {isBeater && <td className={`${tdClass} text-right font-mono`}>{totals.ext.bludgersHit}</td>}
                      {isBeater && <td className={`${tdClass} text-right font-mono`}>{totals.ext.turnoversForced}</td>}
                      {isBeater && <td className={`${tdClass} text-right font-mono`}>{totals.ext.teammatesProtected}</td>}
                      {isBeater && <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{totals.gp > 0 && totals.ext.bludgerShotsFaced > 0 ? (totals.ext.bludgerShotsFaced / totals.gp).toFixed(2) : "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Awards & Honours */}
          {(playerAwards.length > 0 || leagueLeaders.length > 0) && (() => {
            // Group formal awards by name
            const awardGroups = new Map<string, typeof playerAwards>();
            playerAwards.forEach(a => {
              if (!awardGroups.has(a.awardname)) awardGroups.set(a.awardname, []);
              awardGroups.get(a.awardname)!.push(a);
            });

            // Group leaderboard by stat
            const leaderGroups = new Map<string, typeof leagueLeaders>();
            leagueLeaders.forEach(e => {
              if (!leaderGroups.has(e.stat)) leaderGroups.set(e.stat, []);
              leaderGroups.get(e.stat)!.push(e);
            });

            return (
              <div className="border border-border rounded overflow-hidden">
                <div className="bg-table-header px-3 py-2">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">Awards, Leaderboards &amp; Honours</h3>
                </div>
                <div className="bg-card">
                  {/* Formal Awards grouped by award name */}
                  {awardGroups.size > 0 && (
                    <div className="border-b border-border">
                      <div className="px-3 py-2 bg-secondary/40">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Awards</p>
                      </div>
                      <table className="w-full text-sm font-sans">
                        <tbody>
                          {[...awardGroups.entries()].map(([awardName, entries]) => (
                            entries.map((award, i) => (
                              <tr key={`award-${awardName}-${i}`} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-table-stripe"}`}>
                                <td className="px-3 py-1.5 w-8 text-center">
                                  <span className="text-base">
                                    {award.placement === 1 ? "🏆" : award.placement === 2 ? "🥈" : award.placement === 3 ? "🥉" : "🎖️"}
                                  </span>
                                </td>
                                <td className="px-3 py-1.5 font-medium text-foreground">
                                  {award.placement === 1 ? award.awardname : `${ordinal(award.placement)} — ${award.awardname}`}
                                </td>
                                <td className="px-3 py-1.5 text-muted-foreground text-xs">
                                  {abbrevLeague(award.leagueName || null)}
                                </td>
                                <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                                  {seasonLabel(award.seasonid)}
                                </td>
                              </tr>
                            ))
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Leaderboard appearances grouped by stat, then listed by season */}
                  {leaderGroups.size > 0 && (
                    <div>
                      <div className="px-3 py-2 bg-secondary/40">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appearances on Leaderboards</p>
                      </div>
                      {[...leaderGroups.entries()].map(([statName, entries]) => (
                        <div key={statName} className="border-t border-border">
                          <div className="px-3 py-1.5 bg-secondary/20">
                            <p className="text-xs font-semibold text-foreground">{statName}</p>
                          </div>
                          <table className="w-full text-sm font-sans">
                            <tbody>
                              {entries.sort((a, b) => b.SeasonID - a.SeasonID).map((entry, i) => (
                                <tr key={`leader-${statName}-${i}`} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-table-stripe"}`}>
                                  <td className="px-3 py-1 w-8 text-center">
                                    <span className="text-sm">
                                      {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : <span className="text-xs font-mono text-muted-foreground">#{entry.rank}</span>}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1 text-foreground text-xs">
                                    {ordinal(entry.rank)} ({entry.value})
                                  </td>
                                  <td className="px-3 py-1 text-muted-foreground text-xs">
                                    {entry.scope === "combined" ? "All Leagues" : abbrevLeague(entry.LeagueName)}
                                  </td>
                                  <td className="px-3 py-1 text-right font-mono text-xs text-muted-foreground">
                                    {seasonLabel(entry.SeasonID)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
