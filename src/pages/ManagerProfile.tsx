import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { SiteFooter } from "@/components/SiteFooter";
import { getNationFlag, formatDate, getLeagueTierLabel } from "@/lib/helpers";
import { fetchAllRows } from "@/lib/fetchAll";
import { seasonLabel, ordinal, computeStageReached, QUAL_PARENT_MAP, TournamentMatch } from "@/lib/competitionStage";
import { ProfileSkeleton } from "@/components/StateMessage";

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

interface LeagueInfo {
  LeagueID: number;
  LeagueName: string;
  LeagueTier: number | null;
}

// One row per (season, competition) the manager was in charge for.
interface RegisterRow {
  SeasonID: number;
  TeamID: number;
  TeamName: string;
  LeagueID: number;
  LeagueName: string;
  LeagueTier: number | null;
  isDomestic: boolean;
  // Domestic
  position: number | null;
  totalpoints: number | null;
  isChampion: boolean;
  // Cup / CL / Intl
  stageReached: string | null;
  // Shared
  gamesPlayed: number;
  goalsFor: number;
  goalsAgainst: number;
}

function isDomesticLeague(id: number): boolean {
  return id >= 1 && id <= 14;
}

export default function ManagerProfile() {
  const { id } = useParams();
  const [manager, setManager] = useState<Manager | null>(null);
  const [stints, setStints] = useState<Stint[]>([]);
  const [teamInfo, setTeamInfo] = useState<Map<number, TeamInfo>>(new Map());
  const [leagueMap, setLeagueMap] = useState<Map<number, LeagueInfo>>(new Map());
  const [nationName, setNationName] = useState<string | null>(null);
  const [register, setRegister] = useState<RegisterRow[]>([]);
  const [compFilter, setCompFilter] = useState<"all" | "domestic" | "cups" | "international">("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!id) return;
    const mid = parseInt(id);
    setLoading(true);
    setLoadError(false);

    (async () => {
      try {
        const [{ data: mgrData }, stintRows] = await Promise.all([
          supabase.from("managers").select("*").eq("ManagerID", mid).single(),
          fetchAllRows<Stint>("team_managers", {
            select: "TeamID, SeasonID",
            filters: [{ method: "eq", args: ["ManagerID", mid] }],
            order: { column: "SeasonID", ascending: true },
          }),
        ]);

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
        if (teamIds.length === 0) {
          setLoading(false);
          return;
        }

        const [teams, leagues] = await Promise.all([
          fetchAllRows<TeamInfo>("teams", {
            select: "TeamID, FullName, LeagueID, logo_url, PrimaryColor",
            filters: [{ method: "in", args: ["TeamID", teamIds] }],
          }),
          fetchAllRows<LeagueInfo>("leagues", { select: "LeagueID, LeagueName, LeagueTier" }),
        ]);

        const tm = new Map<number, TeamInfo>();
        teams.forEach(t => tm.set(t.TeamID, t));
        setTeamInfo(tm);

        const lm = new Map<number, LeagueInfo>();
        leagues.forEach(l => lm.set(l.LeagueID, l));
        setLeagueMap(lm);

        // Group the manager's season-by-team assignments
        const seasonsByTeam = new Map<number, Set<number>>();
        (stintRows || []).forEach(s => {
          if (!seasonsByTeam.has(s.TeamID)) seasonsByTeam.set(s.TeamID, new Set());
          seasonsByTeam.get(s.TeamID)!.add(s.SeasonID);
        });

        // Discover every competition (domestic + cup + CL + international) each
        // team entered during the manager's tenure, via player_season_stats —
        // a team's `teams.LeagueID` only reflects its domestic league, so relying
        // on it alone would silently drop all cup/CL/international appearances.
        const statsRows = await fetchAllRows<{ TeamID: number; SeasonID: number; LeagueID: number; LeagueName: string }>(
          "player_season_stats",
          {
            select: "TeamID, SeasonID, LeagueID, LeagueName",
            filters: [{ method: "in", args: ["TeamID", teamIds] }],
          }
        );

        // Map: teamId -> leagueId -> Set<seasonId> (only seasons within this manager's tenure at that team)
        const competitionsByTeam = new Map<number, Map<number, Set<number>>>();
        statsRows.forEach(r => {
          if (!r.TeamID || !r.SeasonID || !r.LeagueID) return;
          const managerSeasons = seasonsByTeam.get(r.TeamID);
          if (!managerSeasons || !managerSeasons.has(r.SeasonID)) return;
          if (!competitionsByTeam.has(r.TeamID)) competitionsByTeam.set(r.TeamID, new Map());
          const leagueMapForTeam = competitionsByTeam.get(r.TeamID)!;
          if (!leagueMapForTeam.has(r.LeagueID)) leagueMapForTeam.set(r.LeagueID, new Set());
          leagueMapForTeam.get(r.LeagueID)!.add(r.SeasonID);
        });

        const registerRows: RegisterRow[] = [];

        for (const teamId of teamIds) {
          const team = tm.get(teamId);
          if (!team) continue;
          const teamName = team.FullName;
          const leaguesForTeam = competitionsByTeam.get(teamId);
          if (!leaguesForTeam || leaguesForTeam.size === 0) continue;

          for (const [leagueId, seasonSet] of leaguesForTeam) {
            const seasons = [...seasonSet];
            const leagueInfo = lm.get(leagueId);

            if (isDomesticLeague(leagueId)) {
              // Domestic: pull standings for each season this manager was in charge,
              // scoped to the league's teams that season, to get points + position.
              const standingsRows = await Promise.all(
                seasons.map(seasonId =>
                  fetchAllRows<{ FullName: string; totalpoints: number; totalgamesplayed: number; GoalsFor: number; GoalsAgainst: number }>(
                    "standings",
                    {
                      select: "FullName, SeasonID, LeagueID, totalpoints, totalgamesplayed, GoalsFor, GoalsAgainst",
                      filters: [
                        { method: "eq", args: ["SeasonID", seasonId] },
                        { method: "eq", args: ["LeagueID", leagueId] },
                      ],
                      order: { column: "totalpoints", ascending: false },
                    }
                  )
                )
              );
              seasons.forEach((seasonId, i) => {
                const sorted = [...(standingsRows[i] || [])].sort((a, b) => (b.totalpoints || 0) - (a.totalpoints || 0));
                const idx = sorted.findIndex(s => s.FullName === teamName);
                const own = idx >= 0 ? sorted[idx] : null;
                registerRows.push({
                  SeasonID: seasonId,
                  TeamID: teamId,
                  TeamName: teamName,
                  LeagueID: leagueId,
                  LeagueName: leagueInfo?.LeagueName || "",
                  LeagueTier: leagueInfo?.LeagueTier ?? null,
                  isDomestic: true,
                  position: idx >= 0 ? idx + 1 : null,
                  totalpoints: own?.totalpoints ?? null,
                  isChampion: idx === 0,
                  stageReached: null,
                  gamesPlayed: own?.totalgamesplayed || 0,
                  goalsFor: own?.GoalsFor || 0,
                  goalsAgainst: own?.GoalsAgainst || 0,
                });
              });
            } else {
              // Cup / CL / international: need ALL matches in the tournament to
              // compute stage reached, plus this team's own matches for GP/GF/GA.
              const [ownResultsBySeason, allResultsBySeason] = await Promise.all([
                Promise.all(seasons.map(seasonId =>
                  fetchAllRows<any>("results", {
                    select: "HomeTeamID,AwayTeamID,HomeTeamScore,AwayTeamScore,WeekID",
                    filters: [
                      { method: "eq", args: ["LeagueID", leagueId] },
                      { method: "eq", args: ["SeasonID", seasonId] },
                      { method: "or", args: [`HomeTeamID.eq.${teamId},AwayTeamID.eq.${teamId}`] },
                    ],
                  })
                )),
                Promise.all(seasons.map(seasonId =>
                  fetchAllRows<any>("results", {
                    select: "MatchID,HomeTeamID,AwayTeamID,HomeTeamScore,AwayTeamScore,WeekID",
                    filters: [
                      { method: "eq", args: ["LeagueID", leagueId] },
                      { method: "eq", args: ["SeasonID", seasonId] },
                    ],
                  })
                )),
              ]);

              // For qualifying comps, also check whether the team appears in the parent comp that season
              const parentLid = QUAL_PARENT_MAP[leagueId];
              let advancedSeasons = new Set<number>();
              if (parentLid) {
                const parentRows = await fetchAllRows<any>("results", {
                  select: "SeasonID,HomeTeamID,AwayTeamID",
                  filters: [
                    { method: "eq", args: ["LeagueID", parentLid] },
                    { method: "in", args: ["SeasonID", seasons] },
                    { method: "or", args: [`HomeTeamID.eq.${teamId},AwayTeamID.eq.${teamId}`] },
                  ],
                });
                advancedSeasons = new Set(parentRows.map((r: any) => r.SeasonID));
              }

              seasons.forEach((seasonId, i) => {
                const ownResults = ownResultsBySeason[i] || [];
                const allMatches: TournamentMatch[] = (allResultsBySeason[i] || []).map((r: any) => ({
                  matchId: r.MatchID || 0,
                  homeId: r.HomeTeamID || 0,
                  awayId: r.AwayTeamID || 0,
                  homeScore: r.HomeTeamScore || 0,
                  awayScore: r.AwayTeamScore || 0,
                  weekId: r.WeekID || 0,
                }));

                let gp = 0, gf = 0, ga = 0;
                ownResults.forEach((r: any) => {
                  gp++;
                  const isHome = r.HomeTeamID === teamId;
                  gf += isHome ? (r.HomeTeamScore ?? 0) : (r.AwayTeamScore ?? 0);
                  ga += isHome ? (r.AwayTeamScore ?? 0) : (r.HomeTeamScore ?? 0);
                });

                const isCL = leagueId === 19;
                const stage = computeStageReached(teamId, leagueId, allMatches, {
                  isCL,
                  advancedToParent: advancedSeasons.has(seasonId),
                });

                registerRows.push({
                  SeasonID: seasonId,
                  TeamID: teamId,
                  TeamName: teamName,
                  LeagueID: leagueId,
                  LeagueName: leagueInfo?.LeagueName || "",
                  LeagueTier: leagueInfo?.LeagueTier ?? null,
                  isDomestic: false,
                  position: null,
                  totalpoints: null,
                  isChampion: stage.includes("Champion"),
                  stageReached: stage,
                  gamesPlayed: gp,
                  goalsFor: gf,
                  goalsAgainst: ga,
                });
              });
            }
          }
        }

        // Sort: season ascending, qualifiers before their parent comp
        const rank = (lid: number) => (QUAL_PARENT_MAP[lid] != null ? QUAL_PARENT_MAP[lid] - 0.5 : lid);
        registerRows.sort((a, b) => a.SeasonID - b.SeasonID || rank(a.LeagueID) - rank(b.LeagueID));
        setRegister(registerRows);
        setLoading(false);
      } catch (err) {
        console.error("Failed to load manager:", err);
        setLoadError(true);
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-14 md:pb-0">
        <SiteHeader />
        <main className="flex-1 container py-8"><ProfileSkeleton /></main>
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

  // A "stint" is a continuous run of consecutive seasons at the same team.
  const stintCount = (() => {
    if (stints.length === 0) return 0;
    let count = 1;
    for (let i = 1; i < stints.length; i++) {
      const prev = stints[i - 1];
      const curr = stints[i];
      if (curr.TeamID !== prev.TeamID || curr.SeasonID !== prev.SeasonID + 1) {
        count++;
      }
    }
    return count;
  })();

  // ── Career accolades ──
  const domesticRows = register.filter(r => r.isDomestic);
  const cupRows = register.filter(r => !r.isDomestic);
  const titlesWon = register.filter(r => r.isChampion);
  const domesticTitles = titlesWon.filter(r => r.isDomestic);
  const cupTitles = titlesWon.filter(r => !r.isDomestic);
  const runnerUps = cupRows.filter(r => r.stageReached === "Runner-Up");
  const top3Finishes = domesticRows.filter(r => r.position != null && r.position <= 3);

  const careerGP = register.reduce((s, r) => s + r.gamesPlayed, 0);
  const careerGF = register.reduce((s, r) => s + r.goalsFor, 0);
  const careerGA = register.reduce((s, r) => s + r.goalsAgainst, 0);
  const avgPosition = domesticRows.filter(r => r.position != null).length > 0
    ? domesticRows.filter(r => r.position != null).reduce((s, r) => s + (r.position || 0), 0) / domesticRows.filter(r => r.position != null).length
    : null;

  // ── Filter dropdown scoping ──
  const filteredRegister = compFilter === "all"
    ? register
    : compFilter === "domestic"
    ? register.filter(r => r.isDomestic)
    : compFilter === "cups"
    ? register.filter(r => !r.isDomestic && r.LeagueID < 20)
    : register.filter(r => !r.isDomestic && r.LeagueID >= 20);

  const hasCups = register.some(r => !r.isDomestic && r.LeagueID < 20);
  const hasIntl = register.some(r => !r.isDomestic && r.LeagueID >= 20);
  // Only show the Stage Reached column if the current (filtered) view actually has cup/CL/international rows to show.
  const showStageColumn = filteredRegister.some(r => !r.isDomestic);

  return (
    <div className="min-h-screen bg-background flex flex-col pb-14 md:pb-0">
      <SiteHeader />
      <main className="flex-1 container py-8">
        {/* Header — demographic info, matching player profile style */}
        <div className="mb-6 border-b-2 border-primary pb-4">
          <div className="flex items-start gap-6">
            <div className="w-24 h-24 rounded-full border border-border flex items-center justify-center shrink-0 overflow-hidden bg-secondary">
              {manager.headshot_url ? (
                <img src={manager.headshot_url} alt={`${manager.FirstName} ${manager.LastName}`} className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-display font-bold text-muted-foreground">
                  {manager.FirstName.charAt(0)}{manager.LastName.charAt(0)}
                </span>
              )}
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground font-sans uppercase tracking-wide mb-1">Manager</p>
              <h1 className="font-display text-3xl font-bold text-foreground">
                {manager.FirstName} {manager.LastName}
              </h1>
              {manager.FormerPlayerFlag && manager.FormerPlayerID ? (
                <p className="text-sm font-sans mt-1">
                  <Link to={`/player/${manager.FormerPlayerID}`} className="text-accent hover:underline font-medium">
                    View Playing Career →
                  </Link>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground font-sans mt-1 italic">No playing career on record</p>
              )}

              {/* Demographic grid, matching PlayerProfile */}
              <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm font-sans">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Born</p>
                  <p className="font-medium">{formatDate(manager.DOB)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Nationality</p>
                  <p className="font-medium">
                    {manager.NationalityID ? (
                      <Link to={`/nation/${manager.NationalityID}`} className="hover:text-accent">
                        {getNationFlag(nationName)} {nationName}
                      </Link>
                    ) : "—"}
                  </p>
                </div>
                {manager.Gender && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Gender</p>
                    <p className="font-medium">
                      {manager.Gender.toLowerCase() === 'm' || manager.Gender.toLowerCase() === 'male' ? 'Male' :
                       manager.Gender.toLowerCase() === 'f' || manager.Gender.toLowerCase() === 'female' ? 'Female' :
                       manager.Gender}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Career summary + accolades */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border border-border rounded p-3 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Stints</p>
              <p className="font-display text-2xl font-bold">{stintCount}</p>
            </div>
            <div className="border border-border rounded p-3 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Teams Managed</p>
              <p className="font-display text-2xl font-bold">{teamInfo.size}</p>
            </div>
            <div className="border border-border rounded p-3 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Titles Won</p>
              <p className="font-display text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {titlesWon.length > 0 ? `🏆 ${titlesWon.length}` : "0"}
              </p>
            </div>
            <div className="border border-border rounded p-3 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg. League Position</p>
              <p className="font-display text-2xl font-bold">{avgPosition != null ? ordinal(Math.round(avgPosition)) : "—"}</p>
            </div>
          </div>

          {/* Accolades breakdown */}
          {(titlesWon.length > 0 || runnerUps.length > 0 || top3Finishes.length > 0) && (
            <div className="border border-border rounded overflow-hidden">
              <div className="bg-table-header px-3 py-2">
                <h3 className="font-display text-sm font-bold text-table-header-foreground">Accolades</h3>
              </div>
              <div className="bg-card p-4 space-y-3">
                {domesticTitles.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1.5">League Titles</p>
                    <div className="flex flex-wrap gap-1.5">
                      {domesticTitles.map((r, i) => (
                        <span key={i} title={`${r.TeamName} — ${r.LeagueName}`}
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-mono bg-yellow-500/15 border-yellow-500/40 text-yellow-700 dark:text-yellow-400">
                          <span className="font-bold">🏆</span>
                          <span>{seasonLabel(r.SeasonID)}</span>
                          <span className="opacity-70">{r.LeagueName}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {cupTitles.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1.5">Cup / Tournament Titles</p>
                    <div className="flex flex-wrap gap-1.5">
                      {cupTitles.map((r, i) => (
                        <span key={i} title={`${r.TeamName} — ${r.LeagueName}`}
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-mono bg-yellow-500/15 border-yellow-500/40 text-yellow-700 dark:text-yellow-400">
                          <span className="font-bold">🏆</span>
                          <span>{seasonLabel(r.SeasonID)}</span>
                          <span className="opacity-70">{r.LeagueName}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {runnerUps.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1.5">Runners-Up</p>
                    <div className="flex flex-wrap gap-1.5">
                      {runnerUps.map((r, i) => (
                        <span key={i} title={`${r.TeamName} — ${r.LeagueName}`}
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-mono bg-slate-400/15 border-slate-400/40 text-slate-600 dark:text-slate-300">
                          <span className="font-bold">2nd</span>
                          <span>{seasonLabel(r.SeasonID)}</span>
                          <span className="opacity-70">{r.LeagueName}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {top3Finishes.filter(r => !r.isChampion).length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1.5">Top-3 League Finishes</p>
                    <div className="flex flex-wrap gap-1.5">
                      {top3Finishes.filter(r => !r.isChampion).map((r, i) => (
                        <span key={i} title={`${r.TeamName} — ${r.LeagueName}`}
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-mono bg-muted/40 border-border text-muted-foreground">
                          <span className="font-bold">{ordinal(r.position!)}</span>
                          <span>{seasonLabel(r.SeasonID)}</span>
                          <span className="opacity-70">{r.LeagueName}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Season-by-season register, broken down by competition */}
          <div className="border border-border rounded overflow-hidden">
            <div className="bg-table-header px-3 py-2 flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-display text-sm font-bold text-table-header-foreground">Managerial Record by Season</h3>
              {(hasCups || hasIntl) && (
                <select
                  value={compFilter}
                  onChange={e => setCompFilter(e.target.value as any)}
                  className="text-xs bg-popover text-popover-foreground border border-border rounded px-2 py-1 font-sans"
                >
                  <option value="all">All Competitions</option>
                  <option value="domestic">League Only</option>
                  {hasCups && <option value="cups">Cups Only</option>}
                  {hasIntl && <option value="international">International Only</option>}
                </select>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-sans">
                <thead>
                  <tr className="bg-secondary">
                    <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Season</th>
                    <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team</th>
                    <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Competition</th>
                    <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GP</th>
                    <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pos</th>
                    <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pts</th>
                    {showStageColumn && (
                      <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stage Reached</th>
                    )}
                    <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GF</th>
                    <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GA</th>
                    <th className="px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GD</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRegister.map((r, i) => {
                    const gd = r.goalsFor - r.goalsAgainst;
                    return (
                      <tr key={`${r.TeamID}-${r.SeasonID}-${r.LeagueID}`} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                        <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{seasonLabel(r.SeasonID)}</td>
                        <td className="px-3 py-1.5 font-medium">
                          <Link to={`/team/${encodeURIComponent(r.TeamName)}`} className="text-accent hover:underline">{r.TeamName}</Link>
                        </td>
                        <td className="px-3 py-1.5 text-xs">
                          <Link to={`/league/${r.LeagueID}`} className="text-accent hover:underline">{r.LeagueName}</Link>
                          {r.LeagueTier != null && (
                            <span className="text-muted-foreground"> · {getLeagueTierLabel(r.LeagueTier)}</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.gamesPlayed || "—"}</td>
                        <td className={`px-3 py-1.5 text-right font-mono ${r.isChampion ? "font-bold text-yellow-600 dark:text-yellow-400" : ""}`}>
                          {r.isDomestic ? (r.isChampion ? "🏆 1st" : r.position != null ? ordinal(r.position) : "—") : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.isDomestic ? (r.totalpoints ?? "—") : "—"}</td>
                        {showStageColumn && (
                          <td className={`px-3 py-1.5 text-sm ${r.stageReached?.includes("Champion") ? "font-bold text-yellow-600 dark:text-yellow-400" : ""}`}>
                            {!r.isDomestic ? (r.stageReached ?? "—") : "—"}
                          </td>
                        )}
                        <td className="px-3 py-1.5 text-right font-mono">{r.goalsFor || "—"}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.goalsAgainst || "—"}</td>
                        <td className={`px-3 py-1.5 text-right font-mono ${gd > 0 ? "text-green-600 dark:text-green-400" : gd < 0 ? "text-destructive" : ""}`}>
                          {gd > 0 ? "+" : ""}{gd || "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredRegister.length === 0 && (
                    <tr><td colSpan={showStageColumn ? 10 : 9} className="px-3 py-4 text-center text-muted-foreground italic">No managerial record on file.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {register.length > 0 && (
              <div className="px-3 py-2 bg-secondary/30 border-t border-border flex flex-wrap gap-x-6 gap-y-1 text-xs font-sans text-muted-foreground">
                <span>Career GP: <strong className="text-foreground">{careerGP}</strong></span>
                <span>Career GF: <strong className="text-foreground">{careerGF}</strong></span>
                <span>Career GA: <strong className="text-foreground">{careerGA}</strong></span>
                <span>Career GD: <strong className={careerGF - careerGA > 0 ? "text-green-600 dark:text-green-400" : careerGF - careerGA < 0 ? "text-destructive" : "text-foreground"}>{careerGF - careerGA > 0 ? "+" : ""}{careerGF - careerGA}</strong></span>
              </div>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
