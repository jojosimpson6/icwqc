import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

interface MatchResult {
  MatchID: number;
  HomeTeamID: number | null;
  AwayTeamID: number | null;
  HomeTeamScore: number | null;
  AwayTeamScore: number | null;
  SnitchCaughtTime: number | null;
  SnitchCaughtBy: number | null; // This is a TeamID, not PlayerID
  LeagueID: number | null;
  SeasonID: number | null;
  WeekID: number | null;
  IsNeutralSite: number | null;
  HomeChaser1ID: number | null; HomeChaser1Goals: number | null;
  HomeChaser2ID: number | null; HomeChaser2Goals: number | null;
  HomeChaser3ID: number | null; HomeChaser3Goals: number | null;
  AwayChaser1ID: number | null; AwayChaser1Goals: number | null;
  AwayChaser2ID: number | null; AwayChaser2Goals: number | null;
  AwayChaser3ID: number | null; AwayChaser3Goals: number | null;
  HomeKeeperID: number | null; HomeKeeperSaves: number | null; HomeKeeperShotsFaced: number | null;
  AwayKeeperID: number | null; AwayKeeperSaves: number | null; AwayKeeperShotsFaced: number | null;
  HomeSeekerID: number | null;
  AwaySeekerID: number | null;
  HomeBeater1ID: number | null;
  HomeBeater2ID: number | null;
  AwayBeater1ID: number | null;
  AwayBeater2ID: number | null;
}

type PlayerMap = Map<number, { name: string; id: number }>;

function playerLink(id: number | null, playerMap: PlayerMap) {
  if (!id) return <span className="text-muted-foreground">—</span>;
  const p = playerMap.get(id);
  if (!p) return <span className="text-muted-foreground font-mono text-xs">#{id}</span>;
  return <Link to={`/player/${p.id}`} className="text-accent hover:underline">{p.name}</Link>;
}

function seasonLabel(id: number | null): string {
  if (!id) return "—";
  return `${id - 1}–${String(id).slice(-2)}`;
}

export default function MatchPage() {
  const { id } = useParams();
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [playerMap, setPlayerMap] = useState<PlayerMap>(new Map());
  const [teamMap, setTeamMap] = useState<Map<number, string>>(new Map());
  const [leagueName, setLeagueName] = useState("");
  const [matchDate, setMatchDate] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const mid = parseInt(id);

    Promise.all([
      supabase.from("results").select("*").eq("MatchID", mid).single(),
      supabase.from("players").select("PlayerID, PlayerName"),
      supabase.from("teams").select("TeamID, FullName"),
    ]).then(([{ data: matchData }, { data: playerData }, { data: teamData }]) => {
      if (matchData) setMatch(matchData as MatchResult);
      
      const pm = new Map<number, { name: string; id: number }>();
      (playerData || []).forEach(p => {
        if (p.PlayerID && p.PlayerName) pm.set(p.PlayerID, { name: p.PlayerName, id: p.PlayerID });
      });
      setPlayerMap(pm);

      const tm = new Map<number, string>();
      (teamData || []).forEach(t => { if (t.TeamID) tm.set(t.TeamID, t.FullName); });
      setTeamMap(tm);

      if (matchData?.LeagueID) {
        supabase.from("leagues").select("LeagueName").eq("LeagueID", matchData.LeagueID).single()
          .then(({ data: ld }) => { if (ld) setLeagueName(ld.LeagueName || ""); });
      }

      if (matchData?.WeekID && matchData?.SeasonID && matchData?.LeagueID) {
        supabase.from("matchdays").select("Matchday")
          .eq("MatchdayWeek", matchData.WeekID)
          .eq("SeasonID", matchData.SeasonID)
          .eq("LeagueID", matchData.LeagueID)
          .limit(1)
          .then(({ data: mdArr }) => {
            const md = mdArr?.[0];
            if (md?.Matchday) {
              const [y, m, d] = md.Matchday.split("-");
              setMatchDate(new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
                .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }));
            }
          });
      }
    });
  }, [id]);

  if (!match) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SiteHeader />
        <main className="flex-1 container py-8">
          <p className="text-muted-foreground font-sans">Loading match...</p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const homeTeam = match.HomeTeamID ? teamMap.get(match.HomeTeamID) || `Team ${match.HomeTeamID}` : "Unknown";
  const awayTeam = match.AwayTeamID ? teamMap.get(match.AwayTeamID) || `Team ${match.AwayTeamID}` : "Unknown";
  const homeWin = (match.HomeTeamScore || 0) > (match.AwayTeamScore || 0);
  const awayWin = (match.AwayTeamScore || 0) > (match.HomeTeamScore || 0);

  // SnitchCaughtBy is a TeamID — resolve to the correct seeker
  const snitchCatcherTeamId = match.SnitchCaughtBy;
  const snitchCatcherPlayerId = snitchCatcherTeamId === match.HomeTeamID
    ? match.HomeSeekerID
    : snitchCatcherTeamId === match.AwayTeamID
    ? match.AwaySeekerID
    : null;
  const homeCaughtSnitch = snitchCatcherTeamId === match.HomeTeamID;
  const awayCaughtSnitch = snitchCatcherTeamId === match.AwayTeamID;

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground";
  const tdClass = "px-3 py-1.5 text-sm font-sans";

  // Box score component for one side
  const BoxScore = ({ side }: { side: "home" | "away" }) => {
    const isHome = side === "home";
    const teamName = isHome ? homeTeam : awayTeam;
    const chasers = isHome
      ? [
          { id: match.HomeChaser1ID, goals: match.HomeChaser1Goals },
          { id: match.HomeChaser2ID, goals: match.HomeChaser2Goals },
          { id: match.HomeChaser3ID, goals: match.HomeChaser3Goals },
        ]
      : [
          { id: match.AwayChaser1ID, goals: match.AwayChaser1Goals },
          { id: match.AwayChaser2ID, goals: match.AwayChaser2Goals },
          { id: match.AwayChaser3ID, goals: match.AwayChaser3Goals },
        ];
    const beaters = isHome
      ? [match.HomeBeater1ID, match.HomeBeater2ID]
      : [match.AwayBeater1ID, match.AwayBeater2ID];
    const keeperId = isHome ? match.HomeKeeperID : match.AwayKeeperID;
    const keeperSaves = isHome ? match.HomeKeeperSaves : match.AwayKeeperSaves;
    const keeperSF = isHome ? match.HomeKeeperShotsFaced : match.AwayKeeperShotsFaced;
    const seekerId = isHome ? match.HomeSeekerID : match.AwaySeekerID;
    const caughtSnitch = isHome ? homeCaughtSnitch : awayCaughtSnitch;
    // Shots faced by the opposing team's keeper = shots allowed by this team's beaters
    const oppSF = isHome ? match.AwayKeeperShotsFaced : match.HomeKeeperShotsFaced;

    let rowIdx = 0;
    const rowClass = () => { const c = rowIdx % 2 === 0 ? "bg-card" : "bg-table-stripe"; rowIdx++; return c; };

    return (
      <div className="border border-border rounded overflow-hidden">
        <div className="bg-table-header px-3 py-2">
          <h3 className="font-display text-sm font-bold text-table-header-foreground">{teamName}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary">
                <th className={`${thClass} text-left`}>Player</th>
                <th className={`${thClass} text-left`}>Pos</th>
                <th className={`${thClass} text-right`}>Stat</th>
              </tr>
            </thead>
            <tbody>
              {chasers.filter(c => c.id).map((c) => (
                <tr key={c.id} className={`border-t border-border ${rowClass()}`}>
                  <td className={tdClass}>{playerLink(c.id, playerMap)}</td>
                  <td className={`${tdClass} text-muted-foreground`}>Chaser</td>
                  <td className={`${tdClass} text-right font-mono`}>{c.goals ?? 0} goals</td>
                </tr>
              ))}
              {beaters.filter(Boolean).map((bId) => (
                <tr key={bId} className={`border-t border-border ${rowClass()}`}>
                  <td className={tdClass}>{playerLink(bId, playerMap)}</td>
                  <td className={`${tdClass} text-muted-foreground`}>Beater</td>
                  <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{oppSF ?? "—"} SA</td>
                </tr>
              ))}
              <tr className={`border-t border-border ${rowClass()}`}>
                <td className={tdClass}>{playerLink(keeperId, playerMap)}</td>
                <td className={`${tdClass} text-muted-foreground`}>Keeper</td>
                <td className={`${tdClass} text-right font-mono`}>{keeperSaves ?? 0}/{keeperSF ?? 0} saves</td>
              </tr>
              <tr className={`border-t border-border ${rowClass()}`}>
                <td className={tdClass}>{playerLink(seekerId, playerMap)}</td>
                <td className={`${tdClass} text-muted-foreground`}>Seeker</td>
                <td className={`${tdClass} text-right font-mono`}>{caughtSnitch ? "✓ Caught" : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-8">
        {/* Breadcrumb */}
        <p className="text-xs text-muted-foreground font-sans uppercase tracking-wide mb-2">
          <Link to={`/league/${match.LeagueID}`} className="hover:text-accent">{leagueName}</Link>
          {matchDate && <> · {matchDate}</>}
          {match.SeasonID && <> · {seasonLabel(match.SeasonID)}</>}
          {match.IsNeutralSite ? " · Neutral Site" : ""}
        </p>

        {/* Score header */}
        <div className="mb-6 border-b-2 border-primary pb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <Link to={`/team/${encodeURIComponent(homeTeam)}`} className={`font-display text-2xl font-bold hover:text-accent ${homeWin ? "text-foreground" : "text-muted-foreground"}`}>
                {homeTeam}
              </Link>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`font-display text-4xl font-bold ${homeWin ? "text-foreground" : "text-muted-foreground"}`}>
                {match.HomeTeamScore ?? "—"}
              </span>
              <span className="text-muted-foreground font-display text-2xl">–</span>
              <span className={`font-display text-4xl font-bold ${awayWin ? "text-foreground" : "text-muted-foreground"}`}>
                {match.AwayTeamScore ?? "—"}
              </span>
            </div>
            <div className="flex-1 min-w-0 text-right">
              <Link to={`/team/${encodeURIComponent(awayTeam)}`} className={`font-display text-2xl font-bold hover:text-accent ${awayWin ? "text-foreground" : "text-muted-foreground"}`}>
                {awayTeam}
              </Link>
            </div>
          </div>
          {match.SnitchCaughtTime && snitchCatcherPlayerId && (
            <p className="text-sm text-muted-foreground font-sans mt-2">
              Snitch caught at {match.SnitchCaughtTime} min by {playerLink(snitchCatcherPlayerId, playerMap)}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BoxScore side="home" />
          <BoxScore side="away" />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
