import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { SiteFooter } from "@/components/SiteFooter";
import { getNationFlag, calculateAge } from "@/lib/helpers";
import { fetchAllRows } from "@/lib/fetchAll";

interface Manager {
  ManagerID: number;
  FirstName: string;
  LastName: string;
  Gender: string;
  DOB: string;
  NationalityID: number | null;
  FormerPlayerFlag: boolean;
  FormerPlayerID: number | null;
  headshot_url: string | null;
}

interface Stint {
  TeamID: number;
  SeasonID: number;
}

interface TeamInfo {
  TeamID: number;
  FullName: string;
  LeagueID: number;
  logo_url: string | null;
  PrimaryColor: string | null;
}

interface SeasonRecord {
  TeamID: number;
  SeasonID: number;
  wins: number;
  losses: number;
  ties: number;
}

function seasonLabel(id: number): string {
  return `${id - 1}–${String(id).slice(-2)}`;
}

export default function ManagerProfile() {
  const { id } = useParams();
  const [manager, setManager] = useState<Manager | null>(null);
  const [stints, setStints] = useState<Stint[]>([]);
  const [teamInfo, setTeamInfo] = useState<Map<number, TeamInfo>>(new Map());
  const [leagueMap, setLeagueMap] = useState<Map<number, string>>(new Map());
  const [nationName, setNationName] = useState<string | null>(null);
  const [seasonRecords, setSeasonRecords] = useState<SeasonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!id) return;
    const mid = parseInt(id);
    setLoading(true);

    Promise.all([
      supabase.from("managers").select("*").eq("ManagerID", mid).single(),
      fetchAllRows<Stint>("team_managers", {
        select: "TeamID, SeasonID",
        filters: [{ method: "eq", args: ["ManagerID", mid] }],
        order: { column: "SeasonID", ascending: true },
      }),
    ]).then(async ([{ data: mgrData }, stintRows]) => {
      if (mgrData) setManager(mgrData as Manager);
      setStints(stintRows || []);

      if (mgrData?.NationalityID) {
        const { data: nData } = await supabase
          .from("nations")
          .select("Nation")
          .eq("NationID", mgrData.NationalityID)
          .order("ValidToDt", { ascending: false })
          .limit(1);
        if (nData?.[0]) setNationName((nData[0] as any).Nation);
      }

      const teamIds = [...new Set((stintRows || []).map(s => s.TeamID))];
      if (teamIds.length > 0) {
        const teams = await fetchAllRows<TeamInfo>("teams", {
          select: "TeamID, FullName, LeagueID, logo_url, PrimaryColor",
          filters: [{ method: "in", args: ["TeamID", teamIds] }],
        });
        const tm = new Map<number, TeamInfo>();
        teams.forEach(t => tm.set(t.TeamID, t));
        setTeamInfo(tm);

        const leagueIds = [...new Set(teams.map(t => t.LeagueID))];
        if (leagueIds.length > 0) {
          const { data: leagues } = await supabase.from("leagues").select("LeagueID, LeagueName").in("LeagueID", leagueIds);
          const lm = new Map<number, string>();
          (leagues || []).forEach((l: any) => lm.set(l.LeagueID, l.LeagueName || ""));
          setLeagueMap(lm);
        }

        // For each team this manager led, fetch that team's results and keep only
        // the seasons in which they were actually in charge, then tally W/L/T.
        const seasonsByTeam = new Map<number, Set<number>>();
        (stintRows || []).forEach(s => {
          if (!seasonsByTeam.has(s.TeamID)) seasonsByTeam.set(s.TeamID, new Set());
          seasonsByTeam.get(s.TeamID)!.add(s.SeasonID);
        });

        const allRecords: SeasonRecord[] = [];
        for (const teamId of teamIds) {
          const seasons = [...(seasonsByTeam.get(teamId) || [])];
          if (seasons.length === 0) continue;
          const results = await fetchAllRows<any>("results", {
            select: "MatchID,HomeTeamID,AwayTeamID,HomeTeamScore,AwayTeamScore,SeasonID",
            filters: [
              { method: "or", args: [`HomeTeamID.eq.${teamId},AwayTeamID.eq.${teamId}`] },
              { method: "in", args: ["SeasonID", seasons] },
            ],
          });
          const bySeason = new Map<number, SeasonRecord>();
          seasons.forEach(s => bySeason.set(s, { TeamID: teamId, SeasonID: s, wins: 0, losses: 0, ties: 0 }));
          results.forEach(r => {
            const rec = bySeason.get(r.SeasonID);
            if (!rec) return;
            const isHome = r.HomeTeamID === teamId;
            const ts = isHome ? (r.HomeTeamScore ?? 0) : (r.AwayTeamScore ?? 0);
            const os = isHome ? (r.AwayTeamScore ?? 0) : (r.HomeTeamScore ?? 0);
            if (ts > os) rec.wins++; else if (ts < os) rec.losses++; else rec.ties++;
          });
          allRecords.push(...bySeason.values());
        }
        allRecords.sort((a, b) => a.SeasonID - b.SeasonID);
        setSeasonRecords(allRecords);
      }
      setLoading(false);
    }).catch((err) => {
      console.error("Failed to load manager:", err);
      setLoadError(true);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-14 md:pb-0">
        <SiteHeader />
        <main className="flex-1 container py-8"><p className="text-muted-foreground font-sans">Loading manager...</p></main>
        <SiteFooter />
      </div>
    );
  }

  if (loadError || !manager) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-14 md:pb-0">
        <SiteHeader />
        <main className="flex-1 container py-8">
          <p className="text-muted-foreground font-sans">
            We couldn't find that manager. If manager data was recently added, make sure the database migration
            adding the <code>managers</code>, <code>team_captains</code>, and <code>team_managers</code> tables has been applied.
          </p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const age = calculateAge(manager.DOB);
  const recordByKey = new Map<string, SeasonRecord>();
  seasonRecords.forEach(r => recordByKey.set(`${r.TeamID}|${r.SeasonID}`, r));

  const career = seasonRecords.reduce(
    (acc, r) => ({ wins: acc.wins + r.wins, losses: acc.losses + r.losses, ties: acc.ties + r.ties }),
    { wins: 0, losses: 0, ties: 0 }
  );
  const careerGames = career.wins + career.losses + career.ties;
  const careerWinPct = careerGames > 0 ? (career.wins / careerGames) : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col pb-14 md:pb-0">
      <SiteHeader />
      <main className="flex-1 container py-8">
        <div className="mb-6 border-b-2 border-primary pb-2">
          <p className="text-xs text-muted-foreground font-sans uppercase tracking-wide">Manager</p>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full border border-border flex items-center justify-center shrink-0 overflow-hidden bg-secondary">
              {manager.headshot_url ? (
                <img src={manager.headshot_url} alt={`${manager.FirstName} ${manager.LastName}`} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl font-display font-bold text-muted-foreground">
                  {manager.FirstName.charAt(0)}{manager.LastName.charAt(0)}
                </span>
              )}
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground">
                {manager.FirstName} {manager.LastName}
              </h1>
              <p className="text-sm text-muted-foreground font-sans mt-1">
                {nationName && <>{getNationFlag(nationName)} <Link to={`/nation/${manager.NationalityID}`} className="text-accent hover:underline">{nationName}</Link> · </>}
                {age != null && <>Age {age} · </>}
                {manager.FormerPlayerFlag && manager.FormerPlayerID ? (
                  <>
                    Former player —{" "}
                    <Link to={`/player/${manager.FormerPlayerID}`} className="text-accent hover:underline font-medium">
                      view playing career
                    </Link>
                  </>
                ) : (
                  <span className="italic">No playing career on record</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Career summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="border border-border rounded p-3 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Stints</p>
            <p className="font-display text-2xl font-bold">{stints.length}</p>
          </div>
          <div className="border border-border rounded p-3 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Record</p>
            <p className="font-display text-2xl font-bold">{career.wins}-{career.losses}{career.ties > 0 ? `-${career.ties}` : ""}</p>
          </div>
          <div className="border border-border rounded p-3 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Win %</p>
            <p className="font-display text-2xl font-bold">{(careerWinPct * 100).toFixed(1)}%</p>
          </div>
          <div className="border border-border rounded p-3 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Teams Managed</p>
            <p className="font-display text-2xl font-bold">{teamInfo.size}</p>
          </div>
        </div>

        {/* Season-by-season history */}
        <div className="border border-border rounded overflow-hidden">
          <div className="bg-table-header px-3 py-2">
            <h3 className="font-display text-sm font-bold text-table-header-foreground">Career Statistics</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-sans">
              <thead>
                <tr className="bg-secondary">
                  <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Season</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">League</th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GP</th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">W</th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">L</th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Win%</th>
                </tr>
              </thead>
              <tbody>
                {stints.map((s, i) => {
                  const team = teamInfo.get(s.TeamID);
                  const rec = recordByKey.get(`${s.TeamID}|${s.SeasonID}`);
                  const gp = rec ? rec.wins + rec.losses + rec.ties : 0;
                  const winPct = gp > 0 ? ((rec!.wins / gp) * 100).toFixed(1) : "—";
                  return (
                    <tr key={`${s.TeamID}-${s.SeasonID}`} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                      <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{seasonLabel(s.SeasonID)}</td>
                      <td className="px-3 py-1.5 font-medium text-accent hover:underline">
                        {team ? <Link to={`/team/${encodeURIComponent(team.FullName)}`}>{team.FullName}</Link> : `Team ${s.TeamID}`}
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        {team ? <Link to={`/league/${team.LeagueID}`} className="text-accent hover:underline">{leagueMap.get(team.LeagueID) || ""}</Link> : ""}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">{gp || "—"}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{rec?.wins ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{rec?.losses ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{winPct}{winPct !== "—" ? "%" : ""}</td>
                    </tr>
                  );
                })}
                {stints.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground italic">No managerial record on file.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
