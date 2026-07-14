import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { SiteFooter } from "@/components/SiteFooter";
import { getNationFlag, formatHeight, calculateAge } from "@/lib/helpers";
import { useSortableTable } from "@/hooks/useSortableTable";
import { fetchAllRows } from "@/lib/fetchAll";

interface Nation {
  NationID: number;
  Nation: string | null;
}

interface PlayerRow {
  PlayerID: number;
  PlayerName: string | null;
  Position: string | null;
  DOB: string | null;
  Height: number | null;
  headshot_url: string | null;
}

interface StatRow {
  PlayerID: number | null;
  PlayerName: string | null;
  FullName: string | null;
  GamesPlayed: number | null;
  Goals: number | null;
  GoldenSnitchCatches: number | null;
  KeeperSaves: number | null;
  KeeperShotsFaced: number | null;
  Position: string | null;
  SeasonID: number | null;
  LeagueName: string | null;
}

interface CareerRecord {
  PlayerID: number;
  PlayerName: string;
  Position: string;
  mostRecentTeam: string;
  totalGP: number;
  totalGoals: number;
  totalGSC: number;
  totalSaves: number;
  latestSeason: number;
}

interface IntlResult {
  MatchID: number;
  HomeTeamID: number | null;
  AwayTeamID: number | null;
  HomeTeamScore: number | null;
  AwayTeamScore: number | null;
  SeasonID: number | null;
  LeagueID: number | null;
  WeekID: number | null;
  SnitchCaughtTime: number | null;
  IsNeutralSite: number | null;
}

interface NatStatLine {
  PlayerID: number | null;
  PlayerName: string | null;
  Position: string | null;
  SeasonID: number | null;
  GamesPlayed: number | null;
  Goals: number | null;
  GoldenSnitchCatches: number | null;
  KeeperSaves: number | null;
}

interface NatRegisterRow {
  SeasonID: number;
  LeagueID: number;
  LeagueName: string;
  gp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gsc: number;
  stage: string;
}

function seasonLabel(id: number): string {
  return `${id - 1}–${String(id).slice(-2)}`;
}

// Round label for an international match — uses fixed week structure for main knockouts.
function roundLabel(leagueId: number | null, weekId: number | null, isFinal: boolean): string {
  if (!leagueId || weekId == null) return "";
  if ([21, 23, 25, 27, 29].includes(leagueId)) return "Group Stage";
  if (leagueId === 30) return "Friendly";
  if ([20, 22, 24, 26, 28].includes(leagueId)) {
    if (weekId === 1) return "Round of 16";
    if (weekId === 2) return "Quarterfinal";
    if (weekId === 3) return "Semifinal";
    if (weekId === 4) return isFinal ? "Final" : "3rd Place Playoff";
  }
  return `Week ${weekId}`;
}



export default function NationPage() {
  const { id } = useParams();
  const [nation, setNation] = useState<Nation | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [careerRecords, setCareerRecords] = useState<CareerRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"roster" | "abroad" | "records" | "results" | "register" | "h2h">("roster");
  const [intlResults, setIntlResults] = useState<IntlResult[]>([]);
  const [teamMap, setTeamMap] = useState<Map<number, string>>(new Map());
  const [leagueMap, setLeagueMap] = useState<Map<number, string>>(new Map());
  const [nationalTeam, setNationalTeam] = useState<{ TeamID: number; FullName: string; PrimaryColor: string | null; logo_url: string | null; Rival: string | null } | null>(null);
  const [natSeasonStats, setNatSeasonStats] = useState<NatStatLine[]>([]);
  const [natRosterSeasonId, setNatRosterSeasonId] = useState<number | null>(null);
  const [matchRosterPlayers, setMatchRosterPlayers] = useState<{ PlayerID: number; PlayerName: string; Position: string }[]>([]);
  const [matchRosterSeason, setMatchRosterSeason] = useState<number | null>(null);
  const [semiWinnersMap, setSemiWinnersMap] = useState<Map<string, Set<number>>>(new Map());
  const [intlCompFilter, setIntlCompFilter] = useState<number | "all">("all");
  const [natCaptainMap, setNatCaptainMap] = useState<Map<number, number>>(new Map()); // SeasonID -> CaptainPlayerID
  const [natManagerHistory, setNatManagerHistory] = useState<{ SeasonID: number; ManagerID: number; FirstName: string; LastName: string; FormerPlayerFlag: boolean }[]>([]);

  // For each (season, league) the nation appears in W4, load W3 winners to distinguish Final vs 3rd-place.
  useEffect(() => {
    const keys = new Set<string>();
    intlResults.forEach(r => {
      if (r.WeekID === 4 && r.LeagueID && [20, 22, 24, 26, 28].includes(r.LeagueID) && r.SeasonID) {
        keys.add(`${r.SeasonID}|${r.LeagueID}`);
      }
    });
    if (keys.size === 0) { setSemiWinnersMap(new Map()); return; }
    const pairs = [...keys].map(k => k.split("|").map(Number));
    const seasons = [...new Set(pairs.map(p => p[0]))];
    const leagues = [...new Set(pairs.map(p => p[1]))];
    fetchAllRows<any>("results", {
      select: '"HomeTeamID","AwayTeamID","HomeTeamScore","AwayTeamScore","SeasonID","LeagueID","WeekID"',
      filters: [
        { method: "in", args: ["LeagueID", leagues] },
        { method: "in", args: ["SeasonID", seasons] },
        { method: "eq", args: ["WeekID", 3] },
      ],
    }).then(rows => {
      const m = new Map<string, Set<number>>();
      (rows || []).forEach((r: any) => {
        const key = `${r.SeasonID}|${r.LeagueID}`;
        if (!m.has(key)) m.set(key, new Set());
        const hs = r.HomeTeamScore ?? 0, as_ = r.AwayTeamScore ?? 0;
        if (hs > as_ && r.HomeTeamID) m.get(key)!.add(r.HomeTeamID);
        else if (as_ > hs && r.AwayTeamID) m.get(key)!.add(r.AwayTeamID);
      });
      setSemiWinnersMap(m);
    }).catch(() => {});
  }, [intlResults]);


  useEffect(() => {
    if (!id) return;
    const nid = parseInt(id);

    Promise.all([
      supabase.from("nations").select("*").eq("NationID", nid).order("ValidToDt", { ascending: false }).limit(1),
      fetchAllRows("players", { select: "PlayerID, PlayerName, Position, DOB, Height, headshot_url", filters: [{ method: "eq", args: ["NationalityID", nid] }], order: { column: "PlayerName", ascending: true } }),
      fetchAllRows("teams", { select: "TeamID, FullName, PrimaryColor, logo_url, nationid, LeagueID, Rival" }),
      supabase.from("leagues").select("LeagueID, LeagueName, LeagueTier"),
    ]).then(([{ data: nationData }, playerData, teamsData, { data: leaguesData }]) => {
      if (nationData?.[0]) setNation(nationData[0] as Nation);
      if (playerData) setPlayers(playerData as PlayerRow[]);

      const tm = new Map<number, string>();
      (teamsData || []).forEach((t: any) => { if (t.TeamID) tm.set(t.TeamID, t.FullName); });
      setTeamMap(tm);

      const lm = new Map<number, string>();
      (leaguesData || []).forEach((l: any) => { if (l.LeagueID) lm.set(l.LeagueID, l.LeagueName || ""); });
      setLeagueMap(lm);

      // Get international league IDs (tier 0)
      const intlLeagueIds = (leaguesData || []).filter((l: any) => l.LeagueTier === 0).map((l: any) => l.LeagueID);

      // Find the national team: first try nationid column match, then fall back to TeamID = NationID + 1000
      let natTeam = (teamsData || []).find((t: any) => t.nationid === nid && intlLeagueIds.includes(t.LeagueID));
      if (!natTeam) {
        // Fallback: national team ID = nation ID + 1000 (convention)
        const inferredTeamId = nid + 1000;
        natTeam = (teamsData || []).find((t: any) => t.TeamID === inferredTeamId);
      }
      if (!natTeam) {
        // Last resort: any team whose ID > 1000 that matches the nation by name
        const nationName = (teamsData || []).find((t: any) => t.TeamID === nid + 1000);
        if (nationName) natTeam = nationName;
      }
      if (natTeam) {
        setNationalTeam({ TeamID: natTeam.TeamID, FullName: natTeam.FullName, PrimaryColor: natTeam.PrimaryColor, logo_url: natTeam.logo_url, Rival: natTeam.Rival || null });

        // National-team-specific roster & stats (caps/goals/etc while playing for THIS team,
        // distinct from the "Players Abroad" tab which is club-career totals)
        fetchAllRows("player_season_stats", {
          select: "PlayerID, PlayerName, Position, SeasonID, GamesPlayed, Goals, GoldenSnitchCatches, KeeperSaves",
          filters: [{ method: "eq", args: ["TeamID", natTeam.TeamID] }],
        }).then((rows: any) => {
          setNatSeasonStats(rows || []);
          const seasons = [...new Set((rows || []).map((r: any) => r.SeasonID).filter(Boolean))] as number[];
          if (seasons.length > 0) setNatRosterSeasonId(Math.max(...seasons));
        });

        fetchAllRows("team_captains", {
          select: "SeasonID, CaptainPlayerID",
          filters: [{ method: "eq", args: ["TeamID", natTeam.TeamID] }],
        }).then((capRows: any) => {
          const cm = new Map<number, number>();
          (capRows || []).forEach((r: any) => { if (r.SeasonID && r.CaptainPlayerID) cm.set(r.SeasonID, r.CaptainPlayerID); });
          setNatCaptainMap(cm);
        });

        fetchAllRows("team_managers", {
          select: "SeasonID, ManagerID",
          filters: [{ method: "eq", args: ["TeamID", natTeam.TeamID] }],
          order: { column: "SeasonID", ascending: true },
        }).then((tmRows: any) => {
          const managerIds = [...new Set((tmRows || []).map((r: any) => r.ManagerID))];
          if (managerIds.length === 0) { setNatManagerHistory([]); return; }
          fetchAllRows("managers", {
            select: "ManagerID, FirstName, LastName, FormerPlayerFlag",
            filters: [{ method: "in", args: ["ManagerID", managerIds] }],
          }).then((mgrRows: any) => {
            const mgrById = new Map<number, any>();
            (mgrRows || []).forEach((m: any) => mgrById.set(m.ManagerID, m));
            const combined = (tmRows || []).map((r: any) => {
              const m = mgrById.get(r.ManagerID);
              return m ? { SeasonID: r.SeasonID, ManagerID: r.ManagerID, FirstName: m.FirstName, LastName: m.LastName, FormerPlayerFlag: m.FormerPlayerFlag } : null;
            }).filter(Boolean);
            setNatManagerHistory(combined as any);
          });
        });

        // Fetch intl results for this national team specifically
        fetchAllRows("results", {
          select: "MatchID,HomeTeamID,AwayTeamID,HomeTeamScore,AwayTeamScore,SeasonID,LeagueID,WeekID,SnitchCaughtTime,IsNeutralSite,HomeChaser1ID,HomeChaser2ID,HomeChaser3ID,HomeKeeperID,HomeSeekerID,HomeBeater1ID,HomeBeater2ID,AwayChaser1ID,AwayChaser2ID,AwayChaser3ID,AwayKeeperID,AwaySeekerID,AwayBeater1ID,AwayBeater2ID",
          filters: [{ method: "or", args: [`HomeTeamID.eq.${natTeam.TeamID},AwayTeamID.eq.${natTeam.TeamID}`] }],
          order: { column: "MatchID", ascending: false },
        }).then(async (rData) => {
          if (rData) {
            setIntlResults(rData as IntlResult[]);
            // Get most recent match and extract 7 players
            const mostRecent = rData[0] as any;
            if (mostRecent) {
              setMatchRosterSeason(mostRecent.SeasonID || null);
              const isHome = mostRecent.HomeTeamID === natTeam.TeamID;
              const prefix = isHome ? "Home" : "Away";
              const playerIds = [
                mostRecent[`${prefix}Chaser1ID`],
                mostRecent[`${prefix}Chaser2ID`],
                mostRecent[`${prefix}Chaser3ID`],
                mostRecent[`${prefix}KeeperID`],
                mostRecent[`${prefix}SeekerID`],
                mostRecent[`${prefix}Beater1ID`],
                mostRecent[`${prefix}Beater2ID`],
              ].filter(Boolean);
              if (playerIds.length > 0) {
                const { data: pData } = await supabase.from("players").select("PlayerID, PlayerName, Position").in("PlayerID", playerIds);
                if (pData) setMatchRosterPlayers(pData as { PlayerID: number; PlayerName: string; Position: string }[]);
              }
            }
          }
        });
      } else {
        // No national team found - nothing to show for match history
        setIntlResults([]);
        setMatchRosterPlayers([]);
      }

      if (playerData && playerData.length > 0) {
        const playerIds = (playerData as PlayerRow[]).map(p => p.PlayerID);
        fetchAllRows("player_season_stats", { select: "*", filters: [{ method: "in", args: ["PlayerID", playerIds] }] }).then((statsData) => {
          if (!statsData) return;

          const recordMap = new Map<number, CareerRecord>();
          (playerData as PlayerRow[]).forEach(p => {
            recordMap.set(p.PlayerID, {
              PlayerID: p.PlayerID,
              PlayerName: p.PlayerName || "",
              Position: p.Position || "",
              mostRecentTeam: "",
              totalGP: 0,
              totalGoals: 0,
              totalGSC: 0,
              totalSaves: 0,
              latestSeason: 0,
            });
          });

          (statsData as StatRow[]).forEach(s => {
            const pid = s.PlayerID;
            if (!pid) return;
            const rec = recordMap.get(pid);
            if (!rec) return;
            rec.totalGP += s.GamesPlayed || 0;
            rec.totalGoals += s.Goals || 0;
            rec.totalGSC += s.GoldenSnitchCatches || 0;
            rec.totalSaves += s.KeeperSaves || 0;
            if ((s.SeasonID || 0) > rec.latestSeason) {
              rec.latestSeason = s.SeasonID || 0;
              rec.mostRecentTeam = s.FullName || "";
            }
          });

          setCareerRecords([...recordMap.values()]);
        });
      }
    });
  }, [id]);

  // Most recent roster: players who played in the latest season
  const latestSeason = careerRecords.length > 0 ? Math.max(...careerRecords.map(r => r.latestSeason)) : 0;
  const currentRoster = careerRecords.filter(r => r.latestSeason === latestSeason && latestSeason > 0);

  // Records tables
  const topByGP = [...careerRecords].sort((a, b) => b.totalGP - a.totalGP).slice(0, 15);
  const topByGoals = [...careerRecords].filter(r => r.totalGoals > 0).sort((a, b) => b.totalGoals - a.totalGoals).slice(0, 15);
  const topByGSC = [...careerRecords].filter(r => r.totalGSC > 0).sort((a, b) => b.totalGSC - a.totalGSC).slice(0, 15);
  const topBySaves = [...careerRecords].filter(r => r.totalSaves > 0).sort((a, b) => b.totalSaves - a.totalSaves).slice(0, 15);

  const { sorted: sortedRoster, sortKey, sortDir, requestSort } = useSortableTable(
    currentRoster.length > 0 ? currentRoster : careerRecords,
    "totalGP",
    "desc"
  );

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none";
  const sortInd = (key: string) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  if (!nation) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-14 md:pb-0">
        <SiteHeader />
        <main className="flex-1 container py-8"><p className="text-muted-foreground font-sans">Loading nation...</p></main>
        <SiteFooter />
      </div>
    );
  }

  const RecordTable = ({ title, data, statKey, statLabel }: { title: string; data: CareerRecord[]; statKey: keyof CareerRecord; statLabel: string }) => (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2">
        <h4 className="font-display text-sm font-bold text-table-header-foreground">{title}</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-sans">
          <thead>
            <tr className="bg-secondary">
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">#</th>
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Player</th>
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pos</th>
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team</th>
              <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{statLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={r.PlayerID} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                <td className="px-3 py-1.5 font-mono text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-1.5 font-medium text-accent hover:underline">
                  <Link to={`/player/${r.PlayerID}`}>{r.PlayerName}</Link>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground text-xs">{r.Position}</td>
                <td className="px-3 py-1.5 text-accent hover:underline text-xs">
                  <Link to={`/team/${encodeURIComponent(r.mostRecentTeam)}`}>{r.mostRecentTeam}</Link>
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold">{r[statKey] as number}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Compute W-L record for national team
  const natTeamRecord = nationalTeam ? (() => {
    let w = 0, l = 0, d = 0;
    intlResults.forEach(r => {
      const isHome = r.HomeTeamID === nationalTeam.TeamID;
      const ts = isHome ? (r.HomeTeamScore ?? 0) : (r.AwayTeamScore ?? 0);
      const os = isHome ? (r.AwayTeamScore ?? 0) : (r.HomeTeamScore ?? 0);
      if (ts > os) w++; else if (ts < os) l++; else d++;
    });
    return { w, l, d };
  })() : null;

  // Season-by-season register: one row per (season, competition) the national team played in.
  const natRegisterRows: NatRegisterRow[] = (() => {
    if (!nationalTeam) return [];
    const map = new Map<string, NatRegisterRow & { lastWeek: number; lastWon: boolean; lastIsFinal: boolean }>();
    intlResults.forEach(r => {
      if (!r.SeasonID || !r.LeagueID) return;
      const key = `${r.SeasonID}|${r.LeagueID}`;
      if (!map.has(key)) {
        map.set(key, {
          SeasonID: r.SeasonID, LeagueID: r.LeagueID, LeagueName: leagueMap.get(r.LeagueID) || `League ${r.LeagueID}`,
          gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gsc: 0, stage: "", lastWeek: -1, lastWon: false, lastIsFinal: false,
        });
      }
      const row = map.get(key)!;
      const isHome = r.HomeTeamID === nationalTeam.TeamID;
      const ts = isHome ? (r.HomeTeamScore ?? 0) : (r.AwayTeamScore ?? 0);
      const os = isHome ? (r.AwayTeamScore ?? 0) : (r.HomeTeamScore ?? 0);
      row.gp++; row.gf += ts; row.ga += os;
      if (ts > os) row.w++; else if (ts < os) row.l++; else row.d++;

      const week = r.WeekID || 0;
      let isFinalMatch = false;
      if (week === 4 && r.LeagueID && r.SeasonID) {
        const winners = semiWinnersMap.get(`${r.SeasonID}|${r.LeagueID}`);
        if (winners && r.HomeTeamID && r.AwayTeamID) isFinalMatch = winners.has(r.HomeTeamID) && winners.has(r.AwayTeamID);
      }
      if (week >= row.lastWeek) {
        row.lastWeek = week; row.lastWon = ts > os; row.lastIsFinal = isFinalMatch;
      }
    });
    const rows = [...map.values()];
    rows.forEach(row => {
      if ([20, 22, 24, 26, 28].includes(row.LeagueID) && row.lastWeek === 4 && row.lastIsFinal) {
        row.stage = row.lastWon ? "Champions" : "Runners-up";
      } else {
        row.stage = roundLabel(row.LeagueID, row.lastWeek, row.lastIsFinal) || "—";
      }
    });
    rows.sort((a, b) => a.SeasonID - b.SeasonID || a.LeagueID - b.LeagueID);
    return rows;
  })();

  // Head-to-head vs the national team's rival (if one is set on the teams table)
  const rivalMatches = nationalTeam?.Rival
    ? intlResults.filter(r => {
        const oppId = r.HomeTeamID === nationalTeam.TeamID ? r.AwayTeamID : r.HomeTeamID;
        const oppName = oppId ? teamMap.get(oppId) : null;
        return oppName === nationalTeam.Rival;
      })
    : [];
  const rivalRecord = { w: 0, l: 0, d: 0 };
  rivalMatches.forEach(r => {
    const isHome = r.HomeTeamID === nationalTeam!.TeamID;
    const ts = isHome ? (r.HomeTeamScore ?? 0) : (r.AwayTeamScore ?? 0);
    const os = isHome ? (r.AwayTeamScore ?? 0) : (r.HomeTeamScore ?? 0);
    if (ts > os) rivalRecord.w++; else if (ts < os) rivalRecord.l++; else rivalRecord.d++;
  });

  const natRosterSeasons = [...new Set(natSeasonStats.map(s => s.SeasonID).filter(Boolean))].sort((a, b) => (b as number) - (a as number)) as number[];
  const natRosterRows = natSeasonStats.filter(s => s.SeasonID === natRosterSeasonId);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-2">
          <h1 className="font-display text-3xl font-bold text-foreground">
            {getNationFlag(nation.Nation)} {nation.Nation}
          </h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">
            {players.length} registered players
            {nationalTeam && (
              <> · National Team: <span className="font-medium">{nationalTeam.FullName}</span></>
            )}
            {natManagerHistory.length > 0 && (() => {
              const current = natManagerHistory[natManagerHistory.length - 1];
              return (
                <> · Manager: <Link to={`/manager/${current.ManagerID}`} className="text-accent hover:underline">{current.FirstName} {current.LastName}</Link></>
              );
            })()}
            {natCaptainMap.size > 0 && (() => {
              const latestSeason = Math.max(...natCaptainMap.keys());
              const pid = natCaptainMap.get(latestSeason);
              const pInfo = players.find(p => p.PlayerID === pid);
              if (!pInfo) return null;
              return (
                <> · Captain: <Link to={`/player/${pid}`} className="text-accent hover:underline">{pInfo.PlayerName}</Link></>
              );
            })()}
            {natTeamRecord && (
              <> · Intl Record: {natTeamRecord.w}W–{natTeamRecord.l}L{natTeamRecord.d > 0 ? `–${natTeamRecord.d}D` : ""}</>
            )}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-border overflow-x-auto">
          {(["roster", "register", "results", "h2h", "abroad", "records"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-sans font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "roster" ? "National Team Roster" : tab === "register" ? "Season Register" : tab === "abroad" ? "Players Abroad" : tab === "records" ? "Club Career Leaders" : tab === "h2h" ? "Head-to-Head" : "Match History"}
            </button>
          ))}
        </div>

        {activeTab === "roster" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-sans text-muted-foreground">Season:</label>
              <select
                className="text-sm font-sans border border-border rounded px-2 py-1 bg-background text-foreground"
                value={natRosterSeasonId ?? ""}
                onChange={e => setNatRosterSeasonId(e.target.value ? Number(e.target.value) : null)}
              >
                {natRosterSeasons.map(s => (
                  <option key={s} value={s}>{seasonLabel(s)}</option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground italic">Caps &amp; stats while playing for the national team</span>
            </div>
            {natRosterRows.length > 0 ? (
              <div className="border border-border rounded overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-sans">
                    <thead>
                      <tr className="bg-secondary">
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Player</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pos</th>
                        <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GP</th>
                        <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Goals</th>
                        <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GSC</th>
                        <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saves</th>
                      </tr>
                    </thead>
                    <tbody>
                      {natRosterRows.map((p, i) => (
                        <tr key={p.PlayerID ?? i} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                          <td className="px-3 py-1.5 font-medium text-accent hover:underline">
                            {p.PlayerID ? <Link to={`/player/${p.PlayerID}`}>{p.PlayerName}</Link> : p.PlayerName}
                            {p.PlayerID && natRosterSeasonId != null && natCaptainMap.get(natRosterSeasonId) === p.PlayerID && (
                              <span
                                className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full border border-accent text-accent align-middle"
                                title="Team Captain"
                              >C</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">{p.Position}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{p.GamesPlayed}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{p.Goals || "—"}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{p.GoldenSnitchCatches || "—"}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{p.KeeperSaves || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground font-sans text-sm italic">No national-team roster data available.</p>
            )}
          </div>
        )}

        {activeTab === "register" && (
          <div className="border border-border rounded overflow-hidden">
            <div className="bg-table-header px-3 py-2">
              <h3 className="font-display text-sm font-bold text-table-header-foreground">Season Register</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-sans">
                <thead>
                  <tr className="bg-secondary">
                    <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Season</th>
                    <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Manager</th>
                    <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Competition</th>
                    <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Result</th>
                    <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GP</th>
                    <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">W</th>
                    <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">D</th>
                    <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">L</th>
                    <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GF</th>
                    <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GA</th>
                  </tr>
                </thead>
                <tbody>
                  {natRegisterRows.map((row, i) => (
                    <tr key={`${row.SeasonID}-${row.LeagueID}`} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                      <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{seasonLabel(row.SeasonID)}</td>
                      <td className="px-3 py-1.5 text-xs">
                        {(() => {
                          const m = natManagerHistory.find(mh => mh.SeasonID === row.SeasonID);
                          return m ? (
                            <Link to={`/manager/${m.ManagerID}`} className="text-accent hover:underline">{m.FirstName} {m.LastName}</Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-1.5 text-xs"><Link to={`/league/${row.LeagueID}`} className="text-accent hover:underline">{row.LeagueName}</Link></td>
                      <td className={`px-3 py-1.5 text-xs ${row.stage === "Champions" ? "font-bold text-accent" : "text-muted-foreground"}`}>{row.stage}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{row.gp}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{row.w}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{row.d}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{row.l}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{row.gf}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{row.ga}</td>
                    </tr>
                  ))}
                  {natRegisterRows.length === 0 && (
                    <tr><td colSpan={10} className="px-3 py-4 text-center text-muted-foreground italic">No competitive history on record.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "h2h" && (
          <div className="space-y-4">
            {nationalTeam?.Rival ? (
              <div className="border border-border rounded overflow-hidden">
                <div className="bg-table-header px-3 py-2 flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">
                    vs. <Link to={`/team/${encodeURIComponent(nationalTeam.Rival)}`} className="hover:underline">{nationalTeam.Rival}</Link>
                  </h3>
                  <span className="text-sm font-mono text-table-header-foreground">{rivalRecord.w}-{rivalRecord.l}{rivalRecord.d > 0 ? `-${rivalRecord.d}` : ""}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-sans">
                    <thead>
                      <tr className="bg-secondary">
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Season</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Competition</th>
                        <th className="px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score</th>
                        <th className="px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">W/L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rivalMatches.map((r, i) => {
                        const isHome = r.HomeTeamID === nationalTeam.TeamID;
                        const ts = isHome ? (r.HomeTeamScore ?? 0) : (r.AwayTeamScore ?? 0);
                        const os = isHome ? (r.AwayTeamScore ?? 0) : (r.HomeTeamScore ?? 0);
                        const outcome = ts > os ? "W" : ts < os ? "L" : "D";
                        return (
                          <tr key={r.MatchID} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                            <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{r.SeasonID ? seasonLabel(r.SeasonID) : "—"}</td>
                            <td className="px-3 py-1.5 text-xs">{r.LeagueID ? leagueMap.get(r.LeagueID) : ""}</td>
                            <td className="px-3 py-1.5 text-center font-mono">
                              <Link to={`/match/${r.MatchID}`} className="text-accent hover:underline">{r.HomeTeamScore ?? "—"}–{r.AwayTeamScore ?? "—"}</Link>
                            </td>
                            <td className={`px-3 py-1.5 text-center font-bold ${outcome === "W" ? "text-green-600 dark:text-green-400" : outcome === "L" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{outcome}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground font-sans text-sm italic">No rivalry on record for this national team.</p>
            )}
          </div>
        )}

        {activeTab === "abroad" && (
          <div className="space-y-4">
            {latestSeason > 0 && (
              <p className="text-sm text-muted-foreground font-sans">
                Players active in {seasonLabel(latestSeason)} and their clubs
              </p>
            )}
            <div className="border border-border rounded overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="bg-secondary">
                      <th className={`${thClass} text-left`} onClick={() => requestSort("PlayerName")}>Player{sortInd("PlayerName")}</th>
                      <th className={`${thClass} text-left`} onClick={() => requestSort("Position")}>Pos{sortInd("Position")}</th>
                      <th className={`${thClass} text-left`} onClick={() => requestSort("mostRecentTeam")}>Club{sortInd("mostRecentTeam")}</th>
                      <th className={`${thClass} text-right`} onClick={() => requestSort("totalGP")}>Career GP{sortInd("totalGP")}</th>
                      <th className={`${thClass} text-right`} onClick={() => requestSort("totalGoals")}>Goals{sortInd("totalGoals")}</th>
                      <th className={`${thClass} text-right`} onClick={() => requestSort("totalGSC")}>GSC{sortInd("totalGSC")}</th>
                      <th className={`${thClass} text-right`} onClick={() => requestSort("totalSaves")}>Saves{sortInd("totalSaves")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRoster.map((r, i) => (
                      <tr key={r.PlayerID} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                        <td className="px-3 py-1.5 font-medium text-accent hover:underline">
                          <Link to={`/player/${r.PlayerID}`}>{r.PlayerName}</Link>
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.Position}</td>
                        <td className="px-3 py-1.5 text-accent hover:underline">
                          <Link to={`/team/${encodeURIComponent(r.mostRecentTeam)}`}>{r.mostRecentTeam}</Link>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.totalGP}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.totalGoals || "—"}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.totalGSC || "—"}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.totalSaves || "—"}</td>
                      </tr>
                    ))}
                    {sortedRoster.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground italic">No player data available.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "records" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <RecordTable title="Most Appearances" data={topByGP} statKey="totalGP" statLabel="GP" />
            {topByGoals.length > 0 && <RecordTable title="Most Goals" data={topByGoals} statKey="totalGoals" statLabel="Goals" />}
            {topByGSC.length > 0 && <RecordTable title="Most Golden Snitch Catches" data={topByGSC} statKey="totalGSC" statLabel="GSC" />}
            {topBySaves.length > 0 && <RecordTable title="Most Keeper Saves" data={topBySaves} statKey="totalSaves" statLabel="Saves" />}
          </div>
        )}

        {activeTab === "results" && (
          <div className="space-y-4">
            {intlResults.length > 0 ? (
              <div className="border border-border rounded overflow-hidden">
                <div className="bg-table-header px-3 py-2 flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-display text-sm font-bold text-table-header-foreground">International Match History</h3>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-sans text-table-header-foreground/80">Competition:</label>
                    <select
                      className="text-xs font-sans border border-border rounded px-2 py-1 bg-background text-foreground"
                      value={intlCompFilter}
                      onChange={e => setIntlCompFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                    >
                      <option value="all">All Competitions</option>
                      {[...new Map(intlResults.filter(r => r.LeagueID).map(r => [r.LeagueID as number, leagueMap.get(r.LeagueID as number) || `League ${r.LeagueID}`])).entries()]
                        .sort((a, b) => a[1].localeCompare(b[1]))
                        .map(([lid, lname]) => (
                          <option key={lid} value={lid}>{lname}</option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-sans">
                    <thead>
                      <tr className="bg-secondary">
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Season</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Competition</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Round</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Home</th>
                        <th className="px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Away</th>
                        <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Min</th>
                      </tr>
                    </thead>
                    <tbody>
                      {intlResults.filter(r => intlCompFilter === "all" || r.LeagueID === intlCompFilter).map((r, i) => {
                        const homeName = r.HomeTeamID ? teamMap.get(r.HomeTeamID) || `Team ${r.HomeTeamID}` : "Unknown";
                        const awayName = r.AwayTeamID ? teamMap.get(r.AwayTeamID) || `Team ${r.AwayTeamID}` : "Unknown";
                        const compName = r.LeagueID ? leagueMap.get(r.LeagueID) || "" : "";
                        const isNatHome = r.HomeTeamID === nationalTeam?.TeamID;
                        const natScore = isNatHome ? (r.HomeTeamScore ?? 0) : (r.AwayTeamScore ?? 0);
                        const oppScore = isNatHome ? (r.AwayTeamScore ?? 0) : (r.HomeTeamScore ?? 0);
                        const won = !!(nationalTeam && natScore > oppScore);
                        // W4 Final vs 3rd: match is Final if both teams won their semifinal
                        let isFinalMatch = false;
                        if (r.WeekID === 4 && r.LeagueID && r.SeasonID) {
                          const winners = semiWinnersMap.get(`${r.SeasonID}|${r.LeagueID}`);
                          if (winners && r.HomeTeamID && r.AwayTeamID) {
                            isFinalMatch = winners.has(r.HomeTeamID) && winners.has(r.AwayTeamID);
                          }
                        }
                        const round = roundLabel(r.LeagueID, r.WeekID, isFinalMatch);
                        return (
                          <tr key={r.MatchID} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                            <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{r.SeasonID ? seasonLabel(r.SeasonID) : "—"}</td>
                            <td className="px-3 py-1.5 text-xs">
                              {r.LeagueID ? <Link to={`/league/${r.LeagueID}`} className="text-accent hover:underline">{compName}</Link> : compName}
                            </td>
                            <td className="px-3 py-1.5 text-xs text-muted-foreground">{round}</td>
                            <td className={`px-3 py-1.5 text-accent hover:underline ${isNatHome && won ? "font-bold" : ""}`}>
                              <Link to={`/team/${encodeURIComponent(homeName)}`}>{homeName}</Link>
                            </td>
                            <td className="px-3 py-1.5 text-center font-mono font-bold">
                              <Link to={`/match/${r.MatchID}`} className="text-accent hover:underline">
                                {r.HomeTeamScore ?? "—"}–{r.AwayTeamScore ?? "—"}
                              </Link>
                            </td>
                            <td className={`px-3 py-1.5 text-accent hover:underline ${!isNatHome && won ? "font-bold" : ""}`}>
                              <Link to={`/team/${encodeURIComponent(awayName)}`}>{awayName}</Link>
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">{r.SnitchCaughtTime ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            ) : (
              <p className="text-muted-foreground font-sans text-sm italic">No international results found.</p>
            )}
          </div>
        )}
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}