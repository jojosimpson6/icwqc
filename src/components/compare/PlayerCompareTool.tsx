import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { fetchAllRows } from "@/lib/fetchAll";
import { PlayerSearchBox, PlayerOption } from "./PlayerSearchBox";
import {
  CompareMode,
  PlayerSeasonRow,
  PlayerTotals,
  AgeOption,
  seasonLabel,
  seasonRangeLabel,
  ageOptionsForSeasons,
  aggregatePlayerRows,
  getPositionsInRows,
  getTeamsInRows,
  sortCompetitionNames,
  abbrevLeague,
  formatNum,
  formatDec,
  formatPct,
  seasonsInRange,
  SLOT_COLORS,
} from "@/lib/compareUtils";

let slotIdSeq = 0;
function newSlotId(): string {
  slotIdSeq += 1;
  return `pslot-${slotIdSeq}`;
}

interface PlayerSlot {
  id: string;
  player: PlayerOption | null;
  rows: PlayerSeasonRow[];
  loading: boolean;
  mode: CompareMode;
  seasonId: number | null;
  rangeFrom: number | null;
  rangeTo: number | null;
  age: number | null;
  competition: string; // "all" or a LeagueName
}

const RESET_FIELDS: Omit<PlayerSlot, "id"> = {
  player: null, rows: [], loading: false, mode: "career",
  seasonId: null, rangeFrom: null, rangeTo: null, age: null, competition: "all",
};

function emptySlot(): PlayerSlot {
  return { id: newSlotId(), ...RESET_FIELDS };
}

function applyDefaultScope(rows: PlayerSeasonRow[]): Pick<PlayerSlot, "mode" | "seasonId" | "rangeFrom" | "rangeTo" | "age" | "competition"> {
  const seasons = [...new Set(rows.map(r => r.SeasonID).filter((s): s is number => s !== null && s !== undefined))].sort((a, b) => a - b);
  if (seasons.length === 0) {
    return { mode: "career", seasonId: null, rangeFrom: null, rangeTo: null, age: null, competition: "all" };
  }
  const latest = seasons[seasons.length - 1];
  return { mode: "season", seasonId: latest, rangeFrom: seasons[0], rangeTo: latest, age: null, competition: "all" };
}

function primaryStatLabel(r: PlayerSeasonRow): string {
  if (r.Position === "Chaser") return `${r.Goals ?? 0} G`;
  if (r.Position === "Keeper") return `${r.KeeperSaves ?? 0} Sv`;
  if (r.Position === "Seeker") return `${r.GoldenSnitchCatches ?? 0} GSC`;
  if (r.Position === "Beater") return `${r.BludgersHit ?? 0} BH`;
  return "";
}

interface DerivedSlot {
  availableSeasons: number[];
  resolvedSeasons: number[];
  competitions: string[];
  finalRows: PlayerSeasonRow[];
  totals: PlayerTotals;
  positions: string[];
  teams: string[];
  ageOpts: AgeOption[];
}

function describeScope(slot: PlayerSlot, d: DerivedSlot): string {
  if (d.resolvedSeasons.length === 0) return "No data in this scope";
  if (slot.mode === "season" && slot.seasonId) return `${seasonLabel(slot.seasonId)} season`;
  if (slot.mode === "age" && slot.age !== null) {
    const seasons = d.resolvedSeasons;
    const label = seasons.length === 1
      ? seasonLabel(seasons[0])
      : seasonRangeLabel(seasons[0], seasons[seasons.length - 1]);
    return `Age ${slot.age} (${label})`;
  }
  if (slot.mode === "range" && slot.rangeFrom && slot.rangeTo) {
    return `${seasonRangeLabel(slot.rangeFrom, slot.rangeTo)} · ${d.resolvedSeasons.length} season${d.resolvedSeasons.length === 1 ? "" : "s"}`;
  }
  return `Career · ${d.resolvedSeasons.length} season${d.resolvedSeasons.length === 1 ? "" : "s"}`;
}

function modeDefaults(m: CompareMode, slot: PlayerSlot, d: DerivedSlot): Partial<PlayerSlot> {
  if (m === "season") return { mode: m, seasonId: slot.seasonId ?? d.availableSeasons[d.availableSeasons.length - 1] ?? null };
  if (m === "range") {
    return {
      mode: m,
      rangeFrom: slot.rangeFrom ?? d.availableSeasons[0] ?? null,
      rangeTo: slot.rangeTo ?? d.availableSeasons[d.availableSeasons.length - 1] ?? null,
    };
  }
  if (m === "age") return { mode: m, age: slot.age ?? d.ageOpts[d.ageOpts.length - 1]?.age ?? null };
  return { mode: m };
}

const PLAYER_SELECT_FIELDS = "SeasonID,LeagueID,LeagueName,TeamID,TeamFullName,Position,Nation,GamesPlayed,MinPlayed,Goals,ShotAtt,ShotScored,PassAtt,PassComp,KeeperSaves,KeeperShotsFaced,KeeperShotsParried,KeeperShotsConceded,KeeperPassAtt,KeeperPassComp,GoldenSnitchCatches,SnitchSpotted,CatchAttempts,BludgersHit,TurnoversForced,TeammatesProtected,BludgerShotsFaced";

interface StatRowDef {
  label: string;
  get: (t: PlayerTotals) => number | null;
  fmt: (v: number) => string;
  higherBetter?: boolean;
}
interface StatGroupDef {
  title: string;
  show: boolean;
  rows: StatRowDef[];
}

interface PlayerCompareToolProps {
  initialPlayerIds?: (number | null | undefined)[];
  onPlayerSelected?: (index: number, playerId: number) => void;
}

export function PlayerCompareTool({ initialPlayerIds, onPlayerSelected }: PlayerCompareToolProps) {
  const initialSlotsRef = useRef<PlayerSlot[] | null>(null);
  const [slots, setSlots] = useState<PlayerSlot[]>(() => {
    const base = [emptySlot(), emptySlot()];
    initialSlotsRef.current = base;
    return base;
  });

  async function loadRowsFor(slotId: string, player: PlayerOption) {
    const rows = await fetchAllRows<PlayerSeasonRow>("player_season_stats", {
      select: PLAYER_SELECT_FIELDS,
      filters: [{ method: "eq", args: ["PlayerID", player.PlayerID] }],
      order: { column: "SeasonID", ascending: true },
    });
    setSlots(prev => prev.map(s => (s.id === slotId ? { ...s, rows, loading: false, ...applyDefaultScope(rows) } : s)));
  }

  // Bootstrap players referenced in the URL (?p1=&p2=...) once on mount.
  useEffect(() => {
    const ids = (initialPlayerIds || []).filter((id): id is number => typeof id === "number" && id > 0);
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const data = await fetchAllRows<PlayerOption>("players", {
        select: "PlayerID, PlayerName, Position, DOB",
        filters: [{ method: "in", args: ["PlayerID", ids] }],
      });
      if (cancelled) return;
      const byId = new Map(data.map(p => [p.PlayerID, p]));
      const base = initialSlotsRef.current || [];
      const next = [...base];
      while (next.length < ids.length) next.push(emptySlot());
      ids.forEach((id, i) => {
        const p = byId.get(id);
        if (p) next[i] = { ...next[i], player: p, rows: [], loading: true };
      });
      setSlots(next);
      ids.forEach((id, i) => {
        const p = byId.get(id);
        if (p) loadRowsFor(next[i].id, p);
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectPlayer(idx: number, slotId: string, player: PlayerOption) {
    setSlots(prev => prev.map(s => (s.id === slotId ? { ...s, player, rows: [], loading: true } : s)));
    onPlayerSelected?.(idx, player.PlayerID);
    loadRowsFor(slotId, player);
  }

  function clearSlotPlayer(slotId: string) {
    setSlots(prev => prev.map(s => (s.id === slotId ? { id: s.id, ...RESET_FIELDS } : s)));
  }

  function updateSlot(slotId: string, patch: Partial<PlayerSlot>) {
    setSlots(prev => prev.map(s => (s.id === slotId ? { ...s, ...patch } : s)));
  }

  function addSlot() {
    setSlots(prev => (prev.length >= 4 ? prev : [...prev, emptySlot()]));
  }

  function removeSlot(slotId: string) {
    setSlots(prev => (prev.length <= 2 ? prev : prev.filter(s => s.id !== slotId)));
  }

  const derived: (DerivedSlot | null)[] = useMemo(() => slots.map(slot => {
    if (!slot.player) return null;
    const availableSeasons = [...new Set(slot.rows.map(r => r.SeasonID).filter((s): s is number => s !== null && s !== undefined))].sort((a, b) => a - b);

    let resolvedSeasons: number[];
    const ageOpts = ageOptionsForSeasons(slot.player.DOB, availableSeasons);
    if (slot.mode === "season" && slot.seasonId) {
      resolvedSeasons = [slot.seasonId];
    } else if (slot.mode === "range" && slot.rangeFrom !== null && slot.rangeTo !== null) {
      resolvedSeasons = seasonsInRange(availableSeasons, slot.rangeFrom, slot.rangeTo);
    } else if (slot.mode === "age" && slot.age !== null) {
      const opt = ageOpts.find(o => o.age === slot.age);
      resolvedSeasons = opt ? opt.seasons : [];
    } else {
      resolvedSeasons = availableSeasons;
    }

    const seasonSet = new Set(resolvedSeasons);
    const scopedPreComp = slot.rows.filter(r => r.SeasonID !== null && r.SeasonID !== undefined && seasonSet.has(r.SeasonID));
    const competitions = sortCompetitionNames([...new Set(scopedPreComp.map(r => r.LeagueName).filter((l): l is string => !!l))]);
    const finalRows = slot.competition === "all" ? scopedPreComp : scopedPreComp.filter(r => r.LeagueName === slot.competition);
    const totals = aggregatePlayerRows(finalRows);
    const positions = getPositionsInRows(finalRows);
    const teams = getTeamsInRows(finalRows);

    return { availableSeasons, resolvedSeasons, competitions, finalRows, totals, positions, teams, ageOpts };
  }), [slots]);

  const activeIndexes = slots.map((s, i) => i).filter(i => !!slots[i].player);
  const positionsUnion = new Set<string>();
  activeIndexes.forEach(i => { (derived[i]?.positions || []).forEach(p => positionsUnion.add(p)); });
  const minutesAny = activeIndexes.some(i => (derived[i]?.totals.minutes || 0) > 0);

  const groups: StatGroupDef[] = [
    {
      title: "General",
      show: true,
      rows: [
        { label: "Games Played", get: t => t.gp, fmt: formatNum },
        ...(minutesAny ? [{ label: "Minutes Played", get: (t: PlayerTotals) => t.minutes, fmt: formatNum }] : []),
      ],
    },
    {
      title: "Chasing",
      show: positionsUnion.has("Chaser"),
      rows: [
        { label: "Goals", get: t => t.goals, fmt: formatNum },
        { label: "Goals / Game", get: t => t.goalsPerGame, fmt: (v: number) => formatDec(v) },
        { label: "Shot Attempts", get: t => t.shotAtt, fmt: formatNum },
        { label: "Shots Scored", get: t => t.shotScored, fmt: formatNum },
        { label: "Shooting %", get: t => t.shotPct, fmt: (v: number) => formatPct(v) },
        { label: "Pass Attempts", get: t => t.passAtt, fmt: formatNum },
        { label: "Pass Completions", get: t => t.passComp, fmt: formatNum },
        { label: "Pass %", get: t => t.passPct, fmt: (v: number) => formatPct(v) },
      ],
    },
    {
      title: "Keeping",
      show: positionsUnion.has("Keeper"),
      rows: [
        { label: "Keeper Saves", get: t => t.keeperSaves, fmt: formatNum },
        { label: "Saves / Game", get: t => t.savesPerGame, fmt: (v: number) => formatDec(v) },
        { label: "Shots Faced", get: t => t.keeperShotsFaced, fmt: formatNum },
        { label: "Save %", get: t => t.savePct, fmt: (v: number) => formatPct(v) },
        { label: "Shots Parried", get: t => t.keeperShotsParried, fmt: formatNum },
        { label: "Shots Conceded", get: t => t.keeperShotsConceded, fmt: formatNum, higherBetter: false },
        { label: "Keeper Pass Att", get: t => t.keeperPassAtt, fmt: formatNum },
        { label: "Keeper Pass Comp", get: t => t.keeperPassComp, fmt: formatNum },
        { label: "Keeper Pass %", get: t => t.keeperPassPct, fmt: (v: number) => formatPct(v) },
      ],
    },
    {
      title: "Seeking",
      show: positionsUnion.has("Seeker"),
      rows: [
        { label: "Golden Snitch Catches", get: t => t.gsc, fmt: formatNum },
        { label: "GSC / Game", get: t => t.gscPerGame, fmt: (v: number) => formatDec(v) },
        { label: "Snitch Spotted", get: t => t.snitchSpotted, fmt: formatNum },
        { label: "Catch Attempts", get: t => t.catchAttempts, fmt: formatNum },
        { label: "Catch %", get: t => t.catchPct, fmt: (v: number) => formatPct(v) },
      ],
    },
    {
      title: "Beating",
      show: positionsUnion.has("Beater"),
      rows: [
        { label: "Bludgers Hit", get: t => t.bludgersHit, fmt: formatNum },
        { label: "Turnovers Forced", get: t => t.turnoversForced, fmt: formatNum },
        { label: "Teammates Protected", get: t => t.teammatesProtected, fmt: formatNum },
        { label: "Bludger Shots Faced", get: t => t.bludgerShotsFaced, fmt: formatNum },
      ],
    },
  ];

  const GroupTable = ({ group }: { group: StatGroupDef }) => (
    <div className="border border-border rounded overflow-hidden">
      <div className="bg-table-header px-3 py-2">
        <h3 className="font-display text-sm font-bold text-table-header-foreground">{group.title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-sans">
          <thead>
            <tr className="bg-secondary">
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stat</th>
              {activeIndexes.map(i => (
                <th key={slots[i].id} className={`px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide border-l border-border ${SLOT_COLORS[i % SLOT_COLORS.length].text}`}>
                  {slots[i].player!.PlayerName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row, ri) => {
              const values = activeIndexes.map(i => (derived[i] ? row.get(derived[i]!.totals) : null));
              const nonNull = values.filter((v): v is number => v !== null && v !== undefined);
              const best = nonNull.length > 1
                ? (row.higherBetter === false ? Math.min(...nonNull) : Math.max(...nonNull))
                : null;
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
    </div>
  );

  return (
    <div>
      <p className="text-sm text-muted-foreground font-sans mb-4">
        Pick any season, age, or career span for each player — they don't have to match. Filter to a single competition or combine them all.
      </p>

      <div className="flex flex-wrap gap-4 mb-3">
        {slots.map((slot, idx) => {
          const d = derived[idx];
          const color = SLOT_COLORS[idx % SLOT_COLORS.length];
          return (
            <div key={slot.id} className={`relative flex-1 min-w-[280px] border border-border border-t-4 ${color.border} rounded p-4 bg-card`}>
              {slots.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeSlot(slot.id)}
                  className="absolute top-2 right-2 text-muted-foreground hover:text-destructive text-xs leading-none w-5 h-5 flex items-center justify-center"
                  aria-label="Remove player slot"
                >
                  ✕
                </button>
              )}
              {!slot.player ? (
                <>
                  <label className="block text-xs font-sans font-semibold uppercase tracking-wide text-muted-foreground mb-1">Player {idx + 1}</label>
                  <PlayerSearchBox onSelect={p => selectPlayer(idx, slot.id, p)} />
                </>
              ) : (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color.dot}`} />
                      <Link to={`/player/${slot.player.PlayerID}`} className="font-display text-lg font-bold text-accent hover:underline truncate">
                        {slot.player.PlayerName}
                      </Link>
                    </div>
                    <button type="button" onClick={() => clearSlotPlayer(slot.id)} className="text-[11px] font-sans text-muted-foreground hover:text-accent shrink-0">
                      Change
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground font-sans mb-3 truncate">
                    {slot.player.Position}
                    {d && d.teams.length === 1 && (
                      <> · <Link to={`/team/${encodeURIComponent(d.teams[0])}`} className="hover:text-accent hover:underline">{d.teams[0]}</Link></>
                    )}
                    {d && d.teams.length > 1 && (
                      <> · <span title={d.teams.join(", ")}>{d.teams.length} teams</span></>
                    )}
                  </p>

                  {slot.loading ? (
                    <p className="text-xs text-muted-foreground italic font-sans">Loading stats…</p>
                  ) : !d || d.availableSeasons.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic font-sans">No season statistics found.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {(["season", "range", "age", "career"] as const).map(m => {
                          const disabled = m === "age" && d.ageOpts.length === 0;
                          return (
                            <button
                              key={m}
                              type="button"
                              disabled={disabled}
                              onClick={() => updateSlot(slot.id, modeDefaults(m, slot, d))}
                              className={`px-2 py-0.5 text-xs font-sans rounded border capitalize transition-colors ${
                                slot.mode === m
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : disabled
                                  ? "opacity-40 cursor-not-allowed border-border"
                                  : "bg-card border-border hover:bg-secondary"
                              }`}
                            >
                              {m}
                            </button>
                          );
                        })}
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

                      {slot.mode === "age" && (
                        <select
                          value={slot.age ?? ""}
                          onChange={e => updateSlot(slot.id, { age: Number(e.target.value) })}
                          className="w-full text-sm border border-border rounded px-2 py-1 bg-background text-foreground font-sans mb-2"
                        >
                          {d.ageOpts.map(o => (
                            <option key={o.age} value={o.age}>Age {o.age} ({o.seasons.map(s => seasonLabel(s)).join(", ")})</option>
                          ))}
                        </select>
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

                      <p className="text-xs text-accent font-sans mt-2">{describeScope(slot, d)}</p>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {slots.length < 4 && (
        <button type="button" onClick={addSlot} className="mb-6 text-sm font-sans text-accent hover:underline">
          + Add another player
        </button>
      )}

      {activeIndexes.length === 0 && (
        <div className="border border-border rounded p-12 text-center text-muted-foreground font-sans">
          <p className="text-lg font-medium mb-2">Select players to compare</p>
          <p className="text-sm">Search for players above — pick any season, age, or career span for each.</p>
        </div>
      )}

      {activeIndexes.length >= 1 && (
        <div className="space-y-4">
          {groups.filter(g => g.show && g.rows.length > 0).map(g => <GroupTable key={g.title} group={g} />)}

          <details className="border border-border rounded overflow-hidden">
            <summary className="bg-table-header px-3 py-2 font-display text-sm font-bold text-table-header-foreground cursor-pointer select-none">
              Seasons Included in This Comparison
            </summary>
            <div className="bg-card p-3 space-y-4">
              {activeIndexes.map(i => (
                <div key={slots[i].id}>
                  <p className={`text-sm font-bold mb-1 font-sans ${SLOT_COLORS[i % SLOT_COLORS.length].text}`}>{slots[i].player!.PlayerName}</p>
                  {!derived[i] || derived[i]!.finalRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic font-sans">No rows in current scope.</p>
                  ) : (
                    <ul className="text-xs font-sans space-y-0.5">
                      {derived[i]!.finalRows.map((r, ri) => (
                        <li key={ri} className="text-muted-foreground">
                          {seasonLabel(r.SeasonID)} · {abbrevLeague(r.LeagueName)} · {r.TeamFullName || "—"} · {r.Position || "—"} — GP {r.GamesPlayed ?? 0}, {primaryStatLabel(r)}
                        </li>
                      ))}
                    </ul>
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
