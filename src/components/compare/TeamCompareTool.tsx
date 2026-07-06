import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { cachedQuery } from "@/lib/queryCache";
import { getContrastText } from "@/lib/helpers";
import { useSortableTable } from "@/hooks/useSortableTable";
import { TeamSearchBox, TeamOption } from "./TeamSearchBox";
import {
  TeamCompareMode,
  ResultRow,
  StandingsRow,
  TeamRecordTotals,
  StandingsSummary,
  seasonLabel,
  seasonRangeLabel,
  aggregateTeamResults,
  sumStandingsPoints,
  sortCompetitionNames,
  getCompOrder,
  abbrevLeague,
  formatNum,
  formatDec,
  formatPct,
  seasonsInRange,
  SLOT_COLORS,
} from "@/lib/compareUtils";

let teamSlotIdSeq = 0;
function newTeamSlotId(): string {
  teamSlotIdSeq += 1;
  return `tslot-${teamSlotIdSeq}`;
}

interface TeamSlot {
  id: string;
  team: TeamOption | null;
  results: ResultRow[];
  standings: StandingsRow[];
  loading: boolean;
  mode: TeamCompareMode;
  seasonId: number | null;
  rangeFrom: number | null;
  rangeTo: number | null;
  competition: string; // "all" or a LeagueName
}

const RESET_TEAM_FIELDS: Omit<TeamSlot, "id"> = {
  team: null, results: [], standings: [], loading: false, mode: "career",
  seasonId: null, rangeFrom: null, rangeTo: null, competition: "all",
};

function emptyTeamSlot(): TeamSlot {
  return { id: newTeamSlotId(), ...RESET_TEAM_FIELDS };
}

const RESULT_SELECT_FIELDS = "MatchID,HomeTeamID,AwayTeamID,HomeTeamScore,AwayTeamScore,LeagueID,SeasonID,WeekID,IsNeutralSite";
const STANDINGS_SELECT_FIELDS = "FullName,SeasonID,LeagueID,totalpoints,totalgsc,totalgamesplayed,GoalsFor,GoalsAgainst";

function applyTeamDefaultScope(results: ResultRow[], standings: StandingsRow[]): Pick<TeamSlot, "mode" | "seasonId" | "rangeFrom" | "rangeTo" | "competition"> {
  const seasons = [...new Set([
    ...results.map(r => r.SeasonID),
    ...standings.map(s => s.SeasonID),
  ].filter((s): s is number => s !== null && s !== undefined))].sort((a, b) => a - b);
  if (seasons.length === 0) return { mode: "career", seasonId: null, rangeFrom: null, rangeTo: null, competition: "all" };
  const latest = seasons[seasons.length - 1];
  return { mode: "season", seasonId: latest, rangeFrom: seasons[0], rangeTo: latest, competition: "all" };
}

interface CompetitionBreakdown {
  key: string;
  seasonId: number;
  leagueId: number;
  leagueName: string;
  record: TeamRecordTotals;
  points: number | null;
}

interface TeamDerivedSlot {
  availableSeasons: number[];
  resolvedSeasons: number[];
  competitions: string[];
  finalResults: ResultRow[];
  record: TeamRecordTotals;
  standingsSummary: StandingsSummary;
  byCompetition: CompetitionBreakdown[];
}

function describeTeamScope(slot: TeamSlot, d: TeamDerivedSlot): string {
  if (d.resolvedSeasons.length === 0) return "No data in this scope";
  if (slot.mode === "season" && slot.seasonId) return `${seasonLabel(slot.seasonId)} season`;
  if (slot.mode === "range" && slot.rangeFrom && slot.rangeTo) {
    return `${seasonRangeLabel(slot.rangeFrom, slot.rangeTo)} · ${d.resolvedSeasons.length} season${d.resolvedSeasons.length === 1 ? "" : "s"}`;
  }
  return `Career · ${d.resolvedSeasons.length} season${d.resolvedSeasons.length === 1 ? "" : "s"}`;
}

function modeDefaults(m: TeamCompareMode, slot: TeamSlot, d: TeamDerivedSlot): Partial<TeamSlot> {
  if (m === "season") return { mode: m, seasonId: slot.seasonId ?? d.availableSeasons[d.availableSeasons.length - 1] ?? null };
  if (m === "range") {
    return {
      mode: m,
      rangeFrom: slot.rangeFrom ?? d.availableSeasons[0] ?? null,
      rangeTo: slot.rangeTo ?? d.availableSeasons[d.availableSeasons.length - 1] ?? null,
    };
  }
  return { mode: m };
}

interface RecordRowDef {
  label: string;
  get: (d: TeamDerivedSlot) => number | null;
  fmt: (v: number) => string;
  higherBetter?: boolean;
}

const RECORD_ROWS: RecordRowDef[] = [
  { label: "Games Played", get: d => d.record.gp, fmt: formatNum },
  { label: "Wins", get: d => d.record.w, fmt: formatNum },
  { label: "Draws", get: d => d.record.d, fmt: formatNum },
  { label: "Losses", get: d => d.record.l, fmt: formatNum, higherBetter: false },
  { label: "Win %", get: d => d.record.winPct, fmt: (v: number) => formatPct(v) },
  { label: "Goals For", get: d => d.record.gf, fmt: formatNum },
  { label: "Goals Against", get: d => d.record.ga, fmt: formatNum, higherBetter: false },
  { label: "Goal Difference", get: d => d.record.gd, fmt: (v: number) => (v > 0 ? `+${v}` : String(v)) },
  { label: "Goals For / Game", get: d => d.record.gfPerGame, fmt: (v: number) => formatDec(v) },
  { label: "Goals Against / Game", get: d => d.record.gaPerGame, fmt: (v: number) => formatDec(v), higherBetter: false },
  { label: "League Points", get: d => (d.standingsSummary.seasonsCovered > 0 ? d.standingsSummary.points : null), fmt: formatNum },
];

interface MatchLogEntry {
  matchId: number;
  dateStr: string;
  seasonId: number | null;
  leagueName: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  neutral: boolean;
}

interface TeamCompareToolProps {
  initialTeamIds?: (number | null | undefined)[];
  onTeamSelected?: (index: number, teamId: number) => void;
}

export function TeamCompareTool({ initialTeamIds, onTeamSelected }: TeamCompareToolProps) {
  const initialSlotsRef = useRef<TeamSlot[] | null>(null);
  const [slots, setSlots] = useState<TeamSlot[]>(() => {
    const base = [emptyTeamSlot(), emptyTeamSlot()];
    initialSlotsRef.current = base;
    return base;
  });

  const [leagueNameById, setLeagueNameById] = useState<Map<number, string>>(new Map());
  const [leagueIdByName, setLeagueIdByName] = useState<Map<string, number>>(new Map());
  const [matchDayCompositeMap, setMatchDayCompositeMap] = useState<Map<string, string>>(new Map());

  const [h2h, setH2h] = useState<ResultRow[] | null>(null);
  const [h2hLoading, setH2hLoading] = useState(false);

  useEffect(() => {
    cachedQuery("leagues:all", async () => await supabase.from("leagues").select("LeagueID, LeagueName")).then((res: any) => {
      const byId = new Map<number, string>();
      const byName = new Map<string, number>();
      (res?.data || []).forEach((l: any) => {
        if (l.LeagueID && l.LeagueName) {
          byId.set(l.LeagueID, l.LeagueName);
          if (!byName.has(l.LeagueName)) byName.set(l.LeagueName, l.LeagueID);
        }
      });
      setLeagueNameById(byId);
      setLeagueIdByName(byName);
    });
    fetchAllRows<any>("matchdays", { select: "MatchdayID, Matchday, SeasonID, LeagueID, MatchdayWeek" }).then(mdData => {
      const mdComposite = new Map<string, string>();
      (mdData || []).forEach((md: any) => {
        if (md.SeasonID && md.LeagueID && md.MatchdayWeek != null && md.Matchday) {
          mdComposite.set(`${md.SeasonID}|${md.LeagueID}|${md.MatchdayWeek}`, md.Matchday);
        }
      });
      setMatchDayCompositeMap(mdComposite);
    });
  }, []);

  async function loadTeamData(slotId: string, team: TeamOption) {
    const [results, standings] = await Promise.all([
      fetchAllRows<ResultRow>("results", {
        select: RESULT_SELECT_FIELDS,
        filters: [{ method: "or", args: [`HomeTeamID.eq.${team.TeamID},AwayTeamID.eq.${team.TeamID}`] }],
        order: { column: "MatchID", ascending: true },
      }),
      fetchAllRows<StandingsRow>("standings", {
        select: STANDINGS_SELECT_FIELDS,
        filters: [{ method: "eq", args: ["FullName", team.FullName] }],
      }),
    ]);
    setSlots(prev => prev.map(s => (s.id === slotId ? { ...s, results, standings, loading: false, ...applyTeamDefaultScope(results, standings) } : s)));
  }

  useEffect(() => {
    const ids = (initialTeamIds || []).filter((id): id is number => typeof id === "number" && id > 0);
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const data = await fetchAllRows<TeamOption>("teams", {
        select: "TeamID, FullName, City, Country, LeagueID, PrimaryColor, SecondaryColor, logo_url",
        filters: [{ method: "in", args: ["TeamID", ids] }],
      });
      if (cancelled) return;
      const byId = new Map(data.map(t => [t.TeamID, t]));
      const base = initialSlotsRef.current || [];
      // Ensure at least ids.length slots exist
      const next: TeamSlot[] = [...base];
      while (next.length < Math.max(ids.length, 2)) next.push(emptyTeamSlot());
      ids.forEach((id, i) => {
        const t = byId.get(id);
        if (t) next[i] = { ...next[i], team: t, results: [], standings: [], loading: true };
      });
      setSlots(next);
      ids.forEach((id, i) => {
        const t = byId.get(id);
        if (t) loadTeamData(next[i].id, t);
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addSlot() {
    setSlots(prev => (prev.length >= 6 ? prev : [...prev, emptyTeamSlot()]));
  }
  function removeSlot(slotId: string) {
    setSlots(prev => (prev.length <= 2 ? prev : prev.filter(s => s.id !== slotId)));
  }

  // All-time head-to-head, independent of each slot's selected scope.
  useEffect(() => {
    const a = slots[0]?.team;
    const b = slots[1]?.team;
    if (!a || !b) { setH2h(null); return; }
    setH2hLoading(true);
    let cancelled = false;
    fetchAllRows<ResultRow>("results", {
      select: RESULT_SELECT_FIELDS,
      filters: [{ method: "or", args: [`and(HomeTeamID.eq.${a.TeamID},AwayTeamID.eq.${b.TeamID}),and(HomeTeamID.eq.${b.TeamID},AwayTeamID.eq.${a.TeamID})`] }],
      order: { column: "MatchID", ascending: false },
    }).then(rows => {
      if (cancelled) return;
      setH2h(rows);
      setH2hLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots[0]?.team?.TeamID, slots[1]?.team?.TeamID]);

  function selectTeam(idx: number, slotId: string, team: TeamOption) {
    setSlots(prev => prev.map(s => (s.id === slotId ? { ...s, team, results: [], standings: [], loading: true } : s)));
    onTeamSelected?.(idx, team.TeamID);
    loadTeamData(slotId, team);
  }

  function clearSlotTeam(slotId: string) {
    setSlots(prev => prev.map(s => (s.id === slotId ? { id: s.id, ...RESET_TEAM_FIELDS } : s)));
  }

  function updateSlot(slotId: string, patch: Partial<TeamSlot>) {
    setSlots(prev => prev.map(s => (s.id === slotId ? { ...s, ...patch } : s)));
  }

  const derived: (TeamDerivedSlot | null)[] = useMemo(() => slots.map(slot => {
    if (!slot.team) return null;
    const availableSeasons = [...new Set([
      ...slot.results.map(r => r.SeasonID),
      ...slot.standings.map(s => s.SeasonID),
    ].filter((s): s is number => s !== null && s !== undefined))].sort((a, b) => a - b);

    let resolvedSeasons: number[];
    if (slot.mode === "season" && slot.seasonId) {
      resolvedSeasons = [slot.seasonId];
    } else if (slot.mode === "range" && slot.rangeFrom !== null && slot.rangeTo !== null) {
      resolvedSeasons = seasonsInRange(availableSeasons, slot.rangeFrom, slot.rangeTo);
    } else {
      resolvedSeasons = availableSeasons;
    }

    const seasonSet = new Set(resolvedSeasons);
    const scopedResults = slot.results.filter(r => r.SeasonID !== null && r.SeasonID !== undefined && seasonSet.has(r.SeasonID));
    const competitions = sortCompetitionNames([...new Set(
      scopedResults.map(r => (r.LeagueID !== null ? leagueNameById.get(r.LeagueID) : undefined)).filter((n): n is string => !!n)
    )]);
    const selectedLeagueId = slot.competition === "all" ? null : leagueIdByName.get(slot.competition) ?? null;
    const finalResults = slot.competition === "all" ? scopedResults : scopedResults.filter(r => r.LeagueID === selectedLeagueId);
    const record = aggregateTeamResults(slot.team!.TeamID, finalResults);
    const standingsSummary = sumStandingsPoints(slot.standings, seasonSet, slot.competition === "all" ? "all" : (selectedLeagueId ?? -1));

    const groupMap = new Map<string, ResultRow[]>();
    finalResults.forEach(r => {
      if (r.SeasonID === null || r.SeasonID === undefined || r.LeagueID === null || r.LeagueID === undefined) return;
      const key = `${r.SeasonID}|${r.LeagueID}`;
      const arr = groupMap.get(key) || [];
      arr.push(r);
      groupMap.set(key, arr);
    });
    const byCompetition: CompetitionBreakdown[] = [...groupMap.entries()].map(([key, rows]) => {
      const [seasonIdStr, leagueIdStr] = key.split("|");
      const seasonId = Number(seasonIdStr);
      const leagueId = Number(leagueIdStr);
      const leagueName = leagueNameById.get(leagueId) || `League ${leagueId}`;
      const rec = aggregateTeamResults(slot.team!.TeamID, rows);
      const stSum = sumStandingsPoints(slot.standings, new Set([seasonId]), leagueId);
      return { key, seasonId, leagueId, leagueName, record: rec, points: stSum.seasonsCovered > 0 ? stSum.points : null };
    }).sort((a, b) => (a.seasonId !== b.seasonId ? a.seasonId - b.seasonId : getCompOrder(a.leagueName) - getCompOrder(b.leagueName)));

    return { availableSeasons, resolvedSeasons, competitions, finalResults, record, standingsSummary, byCompetition };
  }), [slots, leagueNameById, leagueIdByName]);

  const activeIndexes = slots.map((s, i) => i).filter(i => !!slots[i].team);

  const h2hSummary = useMemo(() => {
    const a = slots[0]?.team, b = slots[1]?.team;
    if (!h2h || !a || !b) return null;
    let aWins = 0, bWins = 0, draws = 0, aGF = 0, bGF = 0;
    h2h.forEach(r => {
      if (r.HomeTeamScore === null || r.AwayTeamScore === null) return;
      const aIsHome = r.HomeTeamID === a.TeamID;
      const aScore = aIsHome ? r.HomeTeamScore : r.AwayTeamScore;
      const bScore = aIsHome ? r.AwayTeamScore : r.HomeTeamScore;
      aGF += aScore; bGF += bScore;
      if (aScore > bScore) aWins++; else if (bScore > aScore) bWins++; else draws++;
    });
    return { aWins, bWins, draws, aGF, bGF, total: h2h.length };
  }, [h2h, slots[0]?.team, slots[1]?.team]);

  const h2hLog: MatchLogEntry[] = useMemo(() => {
    const a = slots[0]?.team, b = slots[1]?.team;
    if (!h2h || !a || !b) return [];
    return h2h.map(r => {
      const aIsHome = r.HomeTeamID === a.TeamID;
      const dateStr = r.SeasonID && r.LeagueID && r.WeekID ? matchDayCompositeMap.get(`${r.SeasonID}|${r.LeagueID}|${r.WeekID}`) || "" : "";
      return {
        matchId: r.MatchID,
        dateStr,
        seasonId: r.SeasonID,
        leagueName: r.LeagueID !== null ? (leagueNameById.get(r.LeagueID) || "—") : "—",
        homeName: aIsHome ? a.FullName : b.FullName,
        awayName: aIsHome ? b.FullName : a.FullName,
        homeScore: r.HomeTeamScore ?? 0,
        awayScore: r.AwayTeamScore ?? 0,
        neutral: !!r.IsNeutralSite,
      };
    });
  }, [h2h, slots[0]?.team, slots[1]?.team, matchDayCompositeMap, leagueNameById]);

  const { sorted: sortedH2hLog, sortKey: h2hSortKey, sortDir: h2hSortDir, requestSort: requestH2hSort } = useSortableTable(h2hLog, "dateStr", "desc");
  const h2hSortInd = (key: string) => (h2hSortKey === key ? (h2hSortDir === "asc" ? " ↑" : " ↓") : "");

  const TeamBadge = ({ team, size = "w-10 h-10" }: { team: TeamOption; size?: string }) => {
    const textColor = team.logo_url ? undefined : getContrastText(team.PrimaryColor);
    return (
      <div
        className={`${size} rounded border border-border flex items-center justify-center shrink-0 overflow-hidden`}
        style={!team.logo_url && team.PrimaryColor ? { backgroundColor: team.PrimaryColor } : undefined}
      >
        {team.logo_url ? (
          <img src={team.logo_url} alt={team.FullName} className="w-full h-full object-contain" />
        ) : (
          <span className="font-display font-bold" style={{ color: textColor }}>{team.FullName.charAt(0)}</span>
        )}
      </div>
    );
  };

  return (
    <div>
      <p className="text-sm text-muted-foreground font-sans mb-4">
        Compare any two teams' records, head-to-head history, and competition results across any span of seasons.
      </p>

      <div className="flex flex-wrap gap-4 mb-6">
        {slots.map((slot, idx) => {
          const d = derived[idx];
          const color = SLOT_COLORS[idx % SLOT_COLORS.length];
          return (
            <div key={slot.id} className={`flex-1 min-w-[280px] border border-border border-t-4 ${color.border} rounded p-4 bg-card`}>
              {!slot.team ? (
                <>
                  <label className="block text-xs font-sans font-semibold uppercase tracking-wide text-muted-foreground mb-1">Team {idx + 1}</label>
                  <TeamSearchBox onSelect={t => selectTeam(idx, slot.id, t)} />
                </>
              ) : (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <TeamBadge team={slot.team} />
                      <div className="min-w-0">
                        <Link to={`/team/${encodeURIComponent(slot.team.FullName)}`} className="font-display text-lg font-bold text-accent hover:underline truncate block">
                          {slot.team.FullName}
                        </Link>
                        <p className="text-xs text-muted-foreground font-sans truncate">{slot.team.City}{slot.team.Country ? `, ${slot.team.Country}` : ""}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => clearSlotTeam(slot.id)} className="text-[11px] font-sans text-muted-foreground hover:text-accent shrink-0">
                      Change
                    </button>
                  </div>

                  {slot.loading ? (
                    <p className="text-xs text-muted-foreground italic font-sans">Loading record…</p>
                  ) : !d || d.availableSeasons.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic font-sans">No match data found.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {(["season", "range", "career"] as const).map(m => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => updateSlot(slot.id, modeDefaults(m, slot, d))}
                            className={`px-2 py-0.5 text-xs font-sans rounded border capitalize transition-colors ${
                              slot.mode === m ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-secondary"
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>

                      {slot.mode === "season" && (
                        <select
                          value={slot.seasonId ?? ""}
                          onChange={e => updateSlot(slot.id, { seasonId: Number(e.target.value) })}
                          className="w-full text-sm border border-border rounded px-2 py-1 bg-background text-foreground font-sans mb-2"
                        >
                          {[...d.availableSeasons].sort((a, b) => b - a).map(s => <option key={s} value={s}>{seasonLabel(s)}</option>)}
                        </select>
                      )}

                      {slot.mode === "range" && (
                        <div className="flex items-center gap-1 mb-2">
                          <select
                            value={slot.rangeFrom ?? ""}
                            onChange={e => {
                              const v = Number(e.target.value);
                              updateSlot(slot.id, { rangeFrom: v, rangeTo: slot.rangeTo !== null && v > slot.rangeTo ? v : slot.rangeTo });
                            }}
                            className="flex-1 min-w-0 text-sm border border-border rounded px-2 py-1 bg-background text-foreground font-sans"
                          >
                            {d.availableSeasons.map(s => <option key={s} value={s}>{seasonLabel(s)}</option>)}
                          </select>
                          <span className="text-xs text-muted-foreground shrink-0">to</span>
                          <select
                            value={slot.rangeTo ?? ""}
                            onChange={e => {
                              const v = Number(e.target.value);
                              updateSlot(slot.id, { rangeTo: v, rangeFrom: slot.rangeFrom !== null && v < slot.rangeFrom ? v : slot.rangeFrom });
                            }}
                            className="flex-1 min-w-0 text-sm border border-border rounded px-2 py-1 bg-background text-foreground font-sans"
                          >
                            {d.availableSeasons.map(s => <option key={s} value={s}>{seasonLabel(s)}</option>)}
                          </select>
                        </div>
                      )}

                      {slot.mode === "career" && (
                        <p className="text-xs text-muted-foreground font-sans mb-2">
                          {d.availableSeasons.length} season{d.availableSeasons.length === 1 ? "" : "s"} ({seasonLabel(d.availableSeasons[0])} – {seasonLabel(d.availableSeasons[d.availableSeasons.length - 1])})
                        </p>
                      )}

                      {d.competitions.length > 0 && (
                        <select
                          value={slot.competition}
                          onChange={e => updateSlot(slot.id, { competition: e.target.value })}
                          className="w-full text-xs border border-border rounded px-2 py-1 bg-background text-foreground font-sans"
                        >
                          <option value="all">All Competitions ({d.competitions.length})</option>
                          {d.competitions.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      )}

                      <p className="text-xs text-accent font-sans mt-2">{describeTeamScope(slot, d)}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        {d.record.w}–{d.record.d}–{d.record.l} · {formatNum(d.record.gf)}–{formatNum(d.record.ga)} GF–GA
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {activeIndexes.length === 0 && (
        <div className="border border-border rounded p-12 text-center text-muted-foreground font-sans">
          <p className="text-lg font-medium mb-2">Select two teams to compare</p>
          <p className="text-sm">Search for teams above — pick any season, range, or career span for each.</p>
        </div>
      )}

      {activeIndexes.length >= 1 && (
        <div className="space-y-6">
          {/* Record comparison */}
          <div className="border border-border rounded overflow-hidden">
            <div className="bg-table-header px-3 py-2">
              <h3 className="font-display text-sm font-bold text-table-header-foreground">Comparison of Records</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-sans">
                <thead>
                  <tr className="bg-secondary">
                    <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stat</th>
                    {activeIndexes.map(i => (
                      <th key={slots[i].id} className={`px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide border-l border-border ${SLOT_COLORS[i % SLOT_COLORS.length].text}`}>
                        {slots[i].team!.FullName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RECORD_ROWS.map((row, ri) => {
                    const values = activeIndexes.map(i => (derived[i] ? row.get(derived[i]!) : null));
                    const nonNull = values.filter((v): v is number => v !== null && v !== undefined);
                    const best = nonNull.length > 1 ? (row.higherBetter === false ? Math.min(...nonNull) : Math.max(...nonNull)) : null;
                    return (
                      <tr key={row.label} className={`border-t border-border ${ri % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                        <td className="px-3 py-1.5 font-medium text-foreground">{row.label}</td>
                        {activeIndexes.map((i, ci) => {
                          const v = values[ci];
                          const isBest = best !== null && v !== null && v === best && activeIndexes.length > 1;
                          return (
                            <td key={slots[i].id} className={`px-3 py-1.5 text-center font-mono border-l border-border ${isBest ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 font-bold" : ""}`}>
                              {v !== null && v !== undefined ? row.fmt(v) : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground font-sans px-3 py-2 border-t border-border bg-secondary/30">
              GP/W/D/L/GF/GA are calculated directly from match results across every competition in scope. League Points come from
              table standings and only apply to table-based competitions (cup and international results don't carry points).
            </p>
          </div>

          {/* Head-to-head (only meaningful for exactly two teams) */}
          {slots[0]?.team && slots[1]?.team && (
            <div className="border border-border rounded overflow-hidden">
              <div className="bg-table-header px-3 py-2">
                <h3 className="font-display text-sm font-bold text-table-header-foreground">All-Time Head-to-Head</h3>
              </div>
              <div className="bg-card p-3">
                {h2hLoading ? (
                  <p className="text-xs text-muted-foreground italic font-sans">Loading head-to-head history…</p>
                ) : !h2hSummary || h2hSummary.total === 0 ? (
                  <p className="text-sm text-muted-foreground font-sans">These teams have not played each other.</p>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-6 font-sans mb-3 flex-wrap">
                      <div className="text-center">
                        <p className={`text-2xl font-display font-bold ${SLOT_COLORS[0].text}`}>{h2hSummary.aWins}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[140px]">{slots[0].team!.FullName} wins</p>
                      </div>
                      {h2hSummary.draws > 0 && (
                        <div className="text-center">
                          <p className="text-2xl font-display font-bold text-muted-foreground">{h2hSummary.draws}</p>
                          <p className="text-xs text-muted-foreground">Draws</p>
                        </div>
                      )}
                      <div className="text-center">
                        <p className={`text-2xl font-display font-bold ${SLOT_COLORS[1].text}`}>{h2hSummary.bWins}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[140px]">{slots[1].team!.FullName} wins</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-display font-bold text-foreground">{h2hSummary.aGF}–{h2hSummary.bGF}</p>
                        <p className="text-xs text-muted-foreground">Combined score</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-display font-bold text-foreground">{h2hSummary.total}</p>
                        <p className="text-xs text-muted-foreground">Meetings</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto border border-border rounded">
                      <table className="w-full text-sm font-sans">
                        <thead>
                          <tr className="bg-secondary">
                            <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer" onClick={() => requestH2hSort("dateStr")}>Date{h2hSortInd("dateStr")}</th>
                            <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer" onClick={() => requestH2hSort("seasonId")}>Season{h2hSortInd("seasonId")}</th>
                            <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comp</th>
                            <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Home</th>
                            <th className="px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score</th>
                            <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Away</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedH2hLog.map((m, i) => (
                            <tr key={m.matchId} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} hover:bg-highlight/20`}>
                              <td className="px-3 py-1.5 text-xs text-muted-foreground font-mono">{m.dateStr || "—"}{m.neutral ? " (N)" : ""}</td>
                              <td className="px-3 py-1.5 text-xs text-muted-foreground font-mono">{seasonLabel(m.seasonId)}</td>
                              <td className="px-3 py-1.5 text-xs text-muted-foreground" title={m.leagueName}>{abbrevLeague(m.leagueName)}</td>
                              <td className="px-3 py-1.5">
                                <Link to={`/team/${encodeURIComponent(m.homeName)}`} className="text-accent hover:underline">{m.homeName}</Link>
                              </td>
                              <td className="px-3 py-1.5 text-center font-mono font-bold">
                                <Link to={`/match/${m.matchId}`} className="hover:underline text-accent">{m.homeScore}–{m.awayScore}</Link>
                              </td>
                              <td className="px-3 py-1.5">
                                <Link to={`/team/${encodeURIComponent(m.awayName)}`} className="text-accent hover:underline">{m.awayName}</Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Per-competition breakdown within the selected scope */}
          <details className="border border-border rounded overflow-hidden">
            <summary className="bg-table-header px-3 py-2 font-display text-sm font-bold text-table-header-foreground cursor-pointer select-none">
              League & Competition Results in This Comparison
            </summary>
            <div className="bg-card p-3 space-y-4">
              {activeIndexes.map(i => (
                <div key={slots[i].id}>
                  <p className={`text-sm font-bold mb-1 font-sans ${SLOT_COLORS[i % SLOT_COLORS.length].text}`}>{slots[i].team!.FullName}</p>
                  {!derived[i] || derived[i]!.byCompetition.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic font-sans">No competitions in current scope.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs font-sans">
                        <thead>
                          <tr className="bg-secondary/60">
                            <th className="px-2 py-1 text-left text-muted-foreground">Season</th>
                            <th className="px-2 py-1 text-left text-muted-foreground">Competition</th>
                            <th className="px-2 py-1 text-right text-muted-foreground">GP</th>
                            <th className="px-2 py-1 text-right text-muted-foreground">W-D-L</th>
                            <th className="px-2 py-1 text-right text-muted-foreground">GF</th>
                            <th className="px-2 py-1 text-right text-muted-foreground">GA</th>
                            <th className="px-2 py-1 text-right text-muted-foreground">Pts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {derived[i]!.byCompetition.map(c => (
                            <tr key={c.key} className="border-t border-border/50">
                              <td className="px-2 py-1 font-mono">{seasonLabel(c.seasonId)}</td>
                              <td className="px-2 py-1">{c.leagueName}</td>
                              <td className="px-2 py-1 text-right font-mono">{c.record.gp}</td>
                              <td className="px-2 py-1 text-right font-mono">{c.record.w}-{c.record.d}-{c.record.l}</td>
                              <td className="px-2 py-1 text-right font-mono">{c.record.gf}</td>
                              <td className="px-2 py-1 text-right font-mono">{c.record.ga}</td>
                              <td className="px-2 py-1 text-right font-mono">{c.points ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
