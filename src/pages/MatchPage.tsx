import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

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

function pct(num: number, den: number): string {
  if (den === 0) return "—";
  return ((num / den) * 100).toFixed(1) + "%";
}

export default function MatchPage() {
  const { id } = useParams();
  const [match, setMatch] = useState<any>(null);
  const [playerMap, setPlayerMap] = useState<PlayerMap>(new Map());
  const [teamMap, setTeamMap] = useState<Map<number, string>>(new Map());
  const [leagueName, setLeagueName] = useState("");
  const [matchDate, setMatchDate] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const mid = parseInt(id);

    Promise.all([
      supabase.from("results").select("*").eq("MatchID", mid).single(),
      fetchAllRows("players", { select: "PlayerID, PlayerName" }),
      fetchAllRows("teams", { select: "TeamID, FullName" }),
    ]).then(([{ data: matchData }, playerData, teamData]) => {
      if (matchData) setMatch(matchData);

      const pm = new Map<number, { name: string; id: number }>();
      (playerData || []).forEach((p: any) => {
        if (p.PlayerID && p.PlayerName) pm.set(p.PlayerID, { name: p.PlayerName, id: p.PlayerID });
      });
      setPlayerMap(pm);

      const tm = new Map<number, string>();
      (teamData || []).forEach((t: any) => { if (t.TeamID) tm.set(t.TeamID, t.FullName); });
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

  const snitchCatcherTeamId = match.SnitchCaughtBy;
  const snitchCatcherPlayerId = snitchCatcherTeamId === match.HomeTeamID
    ? match.HomeSeekerID
    : snitchCatcherTeamId === match.AwayTeamID
    ? match.AwaySeekerID
    : null;
  const homeCaughtSnitch = snitchCatcherTeamId === match.HomeTeamID;
  const awayCaughtSnitch = snitchCatcherTeamId === match.AwayTeamID;

  // Check if extended stats are available (95-96+)
  const hasExtendedStats = (match.HomeChaser1MinPlayed != null && match.HomeChaser1MinPlayed > 0) ||
    (match.HomeChaser1PassAtt != null && match.HomeChaser1PassAtt > 0) ||
    (match.HomeBeater1BludgersHit != null && match.HomeBeater1BludgersHit > 0);

  const thClass = "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground";
  const tdClass = "px-3 py-1.5 text-sm font-sans";

  const BoxScore = ({ side }: { side: "home" | "away" }) => {
    const isHome = side === "home";
    const teamName = isHome ? homeTeam : awayTeam;

    const chasers = isHome
      ? [
          { id: match.HomeChaser1ID, goals: match.HomeChaser1Goals, passAtt: match.HomeChaser1PassAtt, passComp: match.HomeChaser1PassComp, shotAtt: match.HomeChaser1ShotAtt, shotScored: match.HomeChaser1ShotScored, min: match.HomeChaser1MinPlayed },
          { id: match.HomeChaser2ID, goals: match.HomeChaser2Goals, passAtt: match.HomeChaser2PassAtt, passComp: match.HomeChaser2PassComp, shotAtt: match.HomeChaser2ShotAtt, shotScored: match.HomeChaser2ShotScored, min: match.HomeChaser2MinPlayed },
          { id: match.HomeChaser3ID, goals: match.HomeChaser3Goals, passAtt: match.HomeChaser3PassAtt, passComp: match.HomeChaser3PassComp, shotAtt: match.HomeChaser3ShotAtt, shotScored: match.HomeChaser3ShotScored, min: match.HomeChaser3MinPlayed },
        ]
      : [
          { id: match.AwayChaser1ID, goals: match.AwayChaser1Goals, passAtt: match.AwayChaser1PassAtt, passComp: match.AwayChaser1PassComp, shotAtt: match.AwayChaser1ShotAtt, shotScored: match.AwayChaser1ShotScored, min: match.AwayChaser1MinPlayed },
          { id: match.AwayChaser2ID, goals: match.AwayChaser2Goals, passAtt: match.AwayChaser2PassAtt, passComp: match.AwayChaser2PassComp, shotAtt: match.AwayChaser2ShotAtt, shotScored: match.AwayChaser2ShotScored, min: match.AwayChaser2MinPlayed },
          { id: match.AwayChaser3ID, goals: match.AwayChaser3Goals, passAtt: match.AwayChaser3PassAtt, passComp: match.AwayChaser3PassComp, shotAtt: match.AwayChaser3ShotAtt, shotScored: match.AwayChaser3ShotScored, min: match.AwayChaser3MinPlayed },
        ];

    const beaters = isHome
      ? [
          { id: match.HomeBeater1ID, bludgersHit: match.HomeBeater1BludgersHit, turnovers: match.HomeBeater1TurnoversForced, protected: match.HomeBeater1TeammatesProtected, min: match.HomeBeater1MinPlayed, bsf: match.HomeBeater1BludgerShotsFaced },
          { id: match.HomeBeater2ID, bludgersHit: match.HomeBeater2BludgersHit, turnovers: match.HomeBeater2TurnoversForced, protected: match.HomeBeater2TeammatesProtected, min: match.HomeBeater2MinPlayed, bsf: match.HomeBeater2BludgerShotsFaced },
        ]
      : [
          { id: match.AwayBeater1ID, bludgersHit: match.AwayBeater1BludgersHit, turnovers: match.AwayBeater1TurnoversForced, protected: match.AwayBeater1TeammatesProtected, min: match.AwayBeater1MinPlayed, bsf: match.AwayBeater1BludgerShotsFaced },
          { id: match.AwayBeater2ID, bludgersHit: match.AwayBeater2BludgersHit, turnovers: match.AwayBeater2TurnoversForced, protected: match.AwayBeater2TeammatesProtected, min: match.AwayBeater2MinPlayed, bsf: match.AwayBeater2BludgerShotsFaced },
        ];

    const keeper = isHome
      ? { id: match.HomeKeeperID, saves: match.HomeKeeperSaves, sf: match.HomeKeeperShotsFaced, sf2: match.HomeKeeperShotsFaced2, saved: match.HomeKeeperShotsSaved, parried: match.HomeKeeperShotsParried, conceded: match.HomeKeeperShotsConceded, passAtt: match.HomeKeeperPassAtt, passComp: match.HomeKeeperPassComp, min: match.HomeKeeperMinPlayed }
      : { id: match.AwayKeeperID, saves: match.AwayKeeperSaves, sf: match.AwayKeeperShotsFaced, sf2: match.AwayKeeperShotsFaced2, saved: match.AwayKeeperShotsSaved, parried: match.AwayKeeperShotsParried, conceded: match.AwayKeeperShotsConceded, passAtt: match.AwayKeeperPassAtt, passComp: match.AwayKeeperPassComp, min: match.AwayKeeperMinPlayed };

    const seeker = isHome
      ? { id: match.HomeSeekerID, caught: homeCaughtSnitch, min: match.HomeSeekerMinPlayed, spotted: match.HomeSeekerSnitchSpotted, attempts: match.HomeSeekerCatchAttempts }
      : { id: match.AwaySeekerID, caught: awayCaughtSnitch, min: match.AwaySeekerMinPlayed, spotted: match.AwaySeekerSnitchSpotted, attempts: match.AwaySeekerCatchAttempts };

    let rowIdx = 0;
    const rowClass = () => { const c = rowIdx % 2 === 0 ? "bg-card" : "bg-table-stripe"; rowIdx++; return c; };

    if (hasExtendedStats) {
      // Extended box score with all new stats
      return (
        <div className="border border-border rounded overflow-hidden">
          <div className="bg-table-header px-3 py-2">
            <h3 className="font-display text-sm font-bold text-table-header-foreground">{teamName}</h3>
          </div>
          <div className="overflow-x-auto">
            {/* Chasers */}
            <table className="w-full text-sm mb-0">
              <thead>
                <tr className="bg-secondary">
                  <th className={`${thClass} text-left`}>Chasers</th>
                  <th className={`${thClass} text-right`}>Min</th>
                  <th className={`${thClass} text-right`}>Goals</th>
                  <th className={`${thClass} text-right`}>Sh</th>
                  <th className={`${thClass} text-right`}>Sh%</th>
                  <th className={`${thClass} text-right`}>Pass</th>
                  <th className={`${thClass} text-right`}>Pass%</th>
                </tr>
              </thead>
              <tbody>
                {chasers.filter(c => c.id).map((c) => (
                  <tr key={c.id} className={`border-t border-border ${rowClass()}`}>
                    <td className={tdClass}>{playerLink(c.id, playerMap)}</td>
                    <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{c.min ?? "—"}</td>
                    <td className={`${tdClass} text-right font-mono font-bold`}>{c.goals ?? 0}</td>
                    <td className={`${tdClass} text-right font-mono`}>{c.shotScored ?? 0}/{c.shotAtt ?? 0}</td>
                    <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{pct(c.shotScored ?? 0, c.shotAtt ?? 0)}</td>
                    <td className={`${tdClass} text-right font-mono`}>{c.passComp ?? 0}/{c.passAtt ?? 0}</td>
                    <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{pct(c.passComp ?? 0, c.passAtt ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Beaters */}
            <table className="w-full text-sm mb-0">
              <thead>
                <tr className="bg-secondary border-t-2 border-border">
                  <th className={`${thClass} text-left`}>Beaters</th>
                  <th className={`${thClass} text-right`}>Min</th>
                  <th className={`${thClass} text-right`}>BH</th>
                  <th className={`${thClass} text-right`}>TF</th>
                  <th className={`${thClass} text-right`}>TP</th>
                  <th className={`${thClass} text-right`}>BSF</th>
                </tr>
              </thead>
              <tbody>
                {beaters.filter(b => b.id).map((b) => (
                  <tr key={b.id} className={`border-t border-border ${rowClass()}`}>
                    <td className={tdClass}>{playerLink(b.id, playerMap)}</td>
                    <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{b.min ?? "—"}</td>
                    <td className={`${tdClass} text-right font-mono font-bold`}>{b.bludgersHit ?? 0}</td>
                    <td className={`${tdClass} text-right font-mono`}>{b.turnovers ?? 0}</td>
                    <td className={`${tdClass} text-right font-mono`}>{b.protected ?? 0}</td>
                    <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{b.bsf ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Keeper */}
            <table className="w-full text-sm mb-0">
              <thead>
                <tr className="bg-secondary border-t-2 border-border">
                  <th className={`${thClass} text-left`}>Keeper</th>
                  <th className={`${thClass} text-right`}>Min</th>
                  <th className={`${thClass} text-right`}>SV</th>
                  <th className={`${thClass} text-right`}>SF</th>
                  <th className={`${thClass} text-right`}>Sv%</th>
                  <th className={`${thClass} text-right`}>Pass%</th>
                </tr>
              </thead>
              <tbody>
                <tr className={`border-t border-border ${rowClass()}`}>
                  <td className={tdClass}>{playerLink(keeper.id, playerMap)}</td>
                  <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{keeper.min ?? "—"}</td>
                  <td className={`${tdClass} text-right font-mono font-bold`}>{keeper.saves ?? 0}</td>
                  <td className={`${tdClass} text-right font-mono`}>{keeper.sf ?? 0}</td>
                  <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{pct(keeper.saves ?? 0, keeper.sf ?? 0)}</td>
                  <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{pct(keeper.passComp ?? 0, keeper.passAtt ?? 0)}</td>
                </tr>
              </tbody>
            </table>
            {/* Seeker */}
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary border-t-2 border-border">
                  <th className={`${thClass} text-left`}>Seeker</th>
                  <th className={`${thClass} text-right`}>Min</th>
                  <th className={`${thClass} text-right`}>Caught</th>
                  <th className={`${thClass} text-right`}>Spotted</th>
                  <th className={`${thClass} text-right`}>Attempts</th>
                </tr>
              </thead>
              <tbody>
                <tr className={`border-t border-border ${rowClass()}`}>
                  <td className={tdClass}>{playerLink(seeker.id, playerMap)}</td>
                  <td className={`${tdClass} text-right font-mono text-muted-foreground`}>{seeker.min ?? "—"}</td>
                  <td className={`${tdClass} text-right font-mono font-bold`}>{seeker.caught ? "✓" : "—"}</td>
                  <td className={`${tdClass} text-right font-mono`}>{seeker.spotted ?? 0}</td>
                  <td className={`${tdClass} text-right font-mono`}>{seeker.attempts ?? 0}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // Basic box score (pre 95-96)
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
              {beaters.filter(b => b.id).map((b) => (
                <tr key={b.id} className={`border-t border-border ${rowClass()}`}>
                  <td className={tdClass}>{playerLink(b.id, playerMap)}</td>
                  <td className={`${tdClass} text-muted-foreground`}>Beater</td>
                  <td className={`${tdClass} text-right font-mono text-muted-foreground`}>—</td>
                </tr>
              ))}
              <tr className={`border-t border-border ${rowClass()}`}>
                <td className={tdClass}>{playerLink(keeper.id, playerMap)}</td>
                <td className={`${tdClass} text-muted-foreground`}>Keeper</td>
                <td className={`${tdClass} text-right font-mono`}>{keeper.saves ?? 0}/{keeper.sf ?? 0} saves</td>
              </tr>
              <tr className={`border-t border-border ${rowClass()}`}>
                <td className={tdClass}>{playerLink(seeker.id, playerMap)}</td>
                <td className={`${tdClass} text-muted-foreground`}>Seeker</td>
                <td className={`${tdClass} text-right font-mono`}>{seeker.caught ? "✓ Caught" : "—"}</td>
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
