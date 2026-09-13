import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { useAuth } from "@/hooks/useAuth";

interface Pick { id: string; player_id: number; is_captain: boolean; }
interface Breakdown {
  points: number; matches: number; teamName: string | null; oppNames: string[];
  goals: number; shotAtt: number; passComp: number; passIncomp: number;
  saves: number; conceded: number; catches: number; spotted: number; catchAtt: number;
  bludgers: number; turnovers: number; protects: number;
}
interface Recommendation {
  PlayerID: number; PlayerName: string; Position: string; TeamName: string | null;
  recent_avg_points: number; games_sampled: number;
  opponent_name: string | null; next_match_date: string | null;
  matchup_multiplier: number; recommendation_score: number;
}

const POSITION_CAPS: Record<string, number> = { Keeper: 1, Beater: 2, Chaser: 3, Seeker: 1 };

function mostRecentSaturday(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - ((s.getDay() + 1) % 7));
  return s;
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function displayDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function WeeklyFantasyPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const currentWeek = useMemo(() => fmt(mostRecentSaturday(new Date())), []);
  const nextWeek = useMemo(() => fmt(addDays(mostRecentSaturday(new Date()), 7)), []);
  const fridayCutoff = useMemo(() => {
    const cur = mostRecentSaturday(new Date());
    const cutoff = addDays(cur, 6); // Friday of the CURRENT week is the deadline for next week's picks
    return cutoff;
  }, []);

  const [currentPicks, setCurrentPicks] = useState<Pick[]>([]);
  const [nextPicks, setNextPicks] = useState<Pick[]>([]);
  const [playerNames, setPlayerNames] = useState<Map<number, { name: string; position: string }>>(new Map());
  const [currentScore, setCurrentScore] = useState<number | null>(null);
  const [currentBreakdown, setCurrentBreakdown] = useState<Map<number, Breakdown>>(new Map());
  const [leaderboard, setLeaderboard] = useState<{ user_id: string; display_name: string; total: number }[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ PlayerID: number; PlayerName: string; Position: string }[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recPosFilter, setRecPosFilter] = useState<string>("All");
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/auth?next=/fantasy/weekly");
  }, [loading, user, navigate]);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: cur }, { data: nxt }, { data: lb }] = await Promise.all([
      supabase.from("weekly_fantasy_picks").select("id, player_id, is_captain").eq("user_id", user.id).eq("week_start", currentWeek),
      supabase.from("weekly_fantasy_picks").select("id, player_id, is_captain").eq("user_id", user.id).eq("week_start", nextWeek),
      supabase.from("weekly_fantasy_scores").select("user_id, points"),
    ]);
    setCurrentPicks((cur || []) as Pick[]);
    setNextPicks((nxt || []) as Pick[]);

    const allIds = [...new Set([...(cur || []), ...(nxt || [])].map((p: any) => p.player_id))];
    if (allIds.length > 0) {
      const { data: pdata } = await supabase.from("players").select('"PlayerID","PlayerName","Position"').in("PlayerID", allIds);
      setPlayerNames(new Map((pdata || []).map((p: any) => [p.PlayerID, { name: p.PlayerName, position: p.Position }])));
    }

    // Live/partial score + per-player breakdown for the in-progress week —
    // computed from the same match_player_stats rows the scoring function
    // uses, so the breakdown always matches the point total exactly.
    if (cur && cur.length > 0) {
      const playerIds = cur.map((p: any) => p.player_id);
      const weekEnd = fmt(addDays(new Date(currentWeek + "T00:00:00"), 6));
      const { data: matchRows } = await supabase
        .from("match_player_stats")
        .select('"PlayerID","TeamID","OppTeamID","Goals","ShotAtt","PassAtt","PassComp","KeeperShotsParried","KeeperShotsConceded","SnitchCaught","SnitchSpotted","CatchAttempts","BludgersHit","TurnoversForced","TeammatesProtected"')
        .in("PlayerID", playerIds)
        .gte("Matchday", currentWeek)
        .lte("Matchday", weekEnd);

      const teamIds = [...new Set((matchRows || []).flatMap((r: any) => [r.TeamID, r.OppTeamID]).filter(Boolean))];
      const { data: teamRows } = teamIds.length > 0
        ? await supabase.from("teams").select("TeamID, FullName").in("TeamID", teamIds)
        : { data: [] as any[] };
      const teamNameMap = new Map((teamRows || []).map((t: any) => [t.TeamID, t.FullName]));

      const breakdown = new Map<number, Breakdown>();
      (matchRows || []).forEach((r: any) => {
        const b = breakdown.get(r.PlayerID) || {
          points: 0, matches: 0, teamName: teamNameMap.get(r.TeamID) || null, oppNames: [],
          goals: 0, shotAtt: 0, passComp: 0, passIncomp: 0, saves: 0, conceded: 0,
          catches: 0, spotted: 0, catchAtt: 0, bludgers: 0, turnovers: 0, protects: 0,
        };
        b.matches += 1;
        if (r.OppTeamID) b.oppNames.push(teamNameMap.get(r.OppTeamID) || `Team #${r.OppTeamID}`);
        b.goals += r.Goals || 0;
        b.shotAtt += r.ShotAtt || 0;
        b.passComp += r.PassComp || 0;
        b.passIncomp += (r.PassAtt || 0) - (r.PassComp || 0);
        b.saves += r.KeeperShotsParried || 0;
        b.conceded += r.KeeperShotsConceded || 0;
        b.catches += r.SnitchCaught ? 1 : 0;
        b.spotted += r.SnitchSpotted || 0;
        b.catchAtt += r.CatchAttempts || 0;
        b.bludgers += r.BludgersHit || 0;
        b.turnovers += r.TurnoversForced || 0;
        b.protects += r.TeammatesProtected || 0;
        breakdown.set(r.PlayerID, b);
      });
      breakdown.forEach(b => {
        b.points = 2 * b.matches + b.goals * 10 + b.shotAtt * 1 + b.passComp * 1 - b.passIncomp * 1
          + b.saves * 4 - b.conceded * 2 + b.catches * 30 + b.spotted * 3 + b.catchAtt * 1
          + b.bludgers * 3 + b.turnovers * 4 + b.protects * 2;
      });
      setCurrentBreakdown(breakdown);
      const total = cur.reduce((sum: number, p: any) => {
        const b = breakdown.get(p.player_id);
        const pts = b ? b.points : 0;
        return sum + pts * (p.is_captain ? 2 : 1);
      }, 0);
      setCurrentScore(total);
    } else {
      setCurrentBreakdown(new Map());
      setCurrentScore(null);
    }

    // Season leaderboard
    const totalsByUser = new Map<string, number>();
    (lb || []).forEach((r: any) => totalsByUser.set(r.user_id, (totalsByUser.get(r.user_id) || 0) + Number(r.points)));
    const userIds = [...totalsByUser.keys()];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", userIds);
      const nameMap = new Map((profiles || []).map((p: any) => [p.id, p.display_name]));
      setLeaderboard(
        [...totalsByUser.entries()]
          .map(([uid, total]) => ({ user_id: uid, display_name: nameMap.get(uid) || "Unknown", total }))
          .sort((a, b) => b.total - a.total),
      );
    }
  }, [user, currentWeek, nextWeek]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const handle = setTimeout(async () => {
      const { data } = await supabase.from("active_players_detail").select("PlayerID, PlayerName, Position").ilike("PlayerName", `%${query.trim()}%`).limit(10);
      setResults((data || []) as any[]);
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const loadRecommendations = useCallback(async () => {
    setLoadingRecs(true);
    const { data, error: err } = await supabase.rpc("recommend_weekly_fantasy_players", {
      p_position: recPosFilter === "All" ? undefined : recPosFilter,
      p_limit: 15,
    });
    if (!err) setRecommendations((data || []) as Recommendation[]);
    setLoadingRecs(false);
  }, [recPosFilter]);

  useEffect(() => { loadRecommendations(); }, [loadRecommendations]);

  const addPick = async (playerId: number, position: string) => {
    if (!user) return;
    if ((nextPositionCounts[position] ?? 0) >= (POSITION_CAPS[position] ?? 0)) {
      setError(`You already have the maximum number of ${position}s (${POSITION_CAPS[position]}) for next week.`);
      return;
    }
    setBusy(true); setError("");
    const { error: err } = await supabase.from("weekly_fantasy_picks").insert({ user_id: user.id, week_start: nextWeek, player_id: playerId });
    if (err) setError(err.message);
    else { setQuery(""); await load(); }
    setBusy(false);
  };
  const removePick = async (pickId: string) => {
    await supabase.from("weekly_fantasy_picks").delete().eq("id", pickId);
    await load();
  };
  const setCaptain = async (pickId: string) => {
    setBusy(true);
    await supabase.from("weekly_fantasy_picks").update({ is_captain: false }).eq("user_id", user!.id).eq("week_start", nextWeek);
    const { error: err } = await supabase.from("weekly_fantasy_picks").update({ is_captain: true }).eq("id", pickId);
    if (err) setError(err.message);
    await load();
    setBusy(false);
  };

  const nextPositionCounts = useMemo(() => {
    const counts: Record<string, number> = { Keeper: 0, Beater: 0, Chaser: 0, Seeker: 0 };
    nextPicks.forEach(p => {
      const pos = playerNames.get(p.player_id)?.position;
      if (pos && counts[pos] !== undefined) counts[pos]++;
    });
    return counts;
  }, [nextPicks, playerNames]);

  if (!user) return null;

  const nextFull = nextPicks.length >= 7;
  const nextHasCaptain = nextPicks.some(p => p.is_captain);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-6 pb-20 md:pb-6 max-w-4xl">
        <h1 className="font-display text-3xl font-bold mb-1">Weekly Fantasy</h1>
        <Link to="/fantasy" className="text-sm text-accent hover:underline font-sans">← Fantasy Home</Link>
        <p className="text-sm text-muted-foreground font-sans mb-6 mt-1">
          Pick 7 players and a captain (2× points) each week. Picks lock Friday night; scoring runs Saturday through the following Friday.
        </p>

        {error && <div className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2 font-sans">{error}</div>}

        <section className="border border-border rounded overflow-hidden mb-6">
          <div className="bg-table-header px-4 py-2 flex justify-between items-center">
            <h2 className="font-display text-sm font-bold text-table-header-foreground">This Week ({displayDate(currentWeek)} – {displayDate(fmt(addDays(new Date(currentWeek + "T00:00:00"), 6)))})</h2>
            {currentScore != null && <span className="text-table-header-foreground font-mono text-sm">{currentScore.toFixed(0)} pts (live)</span>}
          </div>
          <div className="bg-card p-0">
            {currentPicks.length === 0 ? (
              <p className="text-sm text-muted-foreground font-sans italic p-4">No picks were locked in for this week.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="bg-secondary text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-1.5 text-left">Player</th>
                      <th className="px-3 py-1.5 text-left">Pos</th>
                      <th className="px-3 py-1.5 text-left">Opponent(s)</th>
                      <th className="px-3 py-1.5 text-right">Key Stats</th>
                      <th className="px-3 py-1.5 text-right">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentPicks.map((p, i) => {
                      const b = currentBreakdown.get(p.player_id);
                      const pos = playerNames.get(p.player_id)?.position;
                      const statBits: string[] = [];
                      if (b) {
                        if (b.goals) statBits.push(`${b.goals} G`);
                        if (b.catches) statBits.push(`${b.catches} catch`);
                        if (b.saves) statBits.push(`${b.saves} SV`);
                        if (b.conceded) statBits.push(`${b.conceded} conc`);
                        if (b.bludgers) statBits.push(`${b.bludgers} BH`);
                        if (b.turnovers) statBits.push(`${b.turnovers} TF`);
                        if (b.protects) statBits.push(`${b.protects} TP`);
                        if (b.spotted) statBits.push(`${b.spotted} spot`);
                      }
                      const rawPts = b?.points ?? 0;
                      const finalPts = rawPts * (p.is_captain ? 2 : 1);
                      return (
                        <tr key={p.id} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"}`}>
                          <td className="px-3 py-2">
                            <Link to={`/player/${p.player_id}`} className="font-semibold text-accent hover:underline">{playerNames.get(p.player_id)?.name || p.player_id}</Link>
                            {p.is_captain && <span className="text-xs text-accent font-bold ml-1" title="Captain — points doubled">(C)</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{pos}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {!b || b.matches === 0 ? <span className="italic">no match yet</span> : b.oppNames.join(", ") || "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground">{statBits.length > 0 ? statBits.join(", ") : (b && b.matches > 0 ? "—" : "")}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold">
                            {b && b.matches > 0 ? (
                              p.is_captain ? <span title={`${rawPts.toFixed(0)} × 2 (captain)`}>{finalPts.toFixed(0)}</span> : finalPts.toFixed(0)
                            ) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td colSpan={4} className="px-3 py-2 text-right">Total</td>
                      <td className="px-3 py-2 text-right font-mono">{currentScore != null ? currentScore.toFixed(0) : "—"}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="border border-border rounded overflow-hidden mb-6">
          <div className="bg-table-header px-4 py-2 flex justify-between items-center flex-wrap gap-1">
            <h2 className="font-display text-sm font-bold text-table-header-foreground">Next Week ({displayDate(nextWeek)}+) — {nextPicks.length}/7 picked</h2>
            <span className="text-xs text-table-header-foreground/80 font-sans">Locks {fridayCutoff.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} night</span>
          </div>
          <div className="bg-card p-4 space-y-3">
            <div className="flex gap-2 flex-wrap text-xs font-sans text-muted-foreground">
              {(["Keeper", "Beater", "Chaser", "Seeker"] as const).map(pos => (
                <span key={pos} className={`px-2 py-0.5 rounded border ${(nextPositionCounts[pos] ?? 0) >= POSITION_CAPS[pos] ? "border-accent text-accent font-semibold" : "border-border"}`}>
                  {pos}s {nextPositionCounts[pos] ?? 0}/{POSITION_CAPS[pos]}
                </span>
              ))}
            </div>
            <ul className="text-sm font-sans space-y-1">
              {nextPicks.map(p => (
                <li key={p.id} className="flex justify-between items-center">
                  <span>{playerNames.get(p.player_id)?.name || p.player_id} <span className="text-xs text-muted-foreground">({playerNames.get(p.player_id)?.position})</span></span>
                  <span className="flex items-center gap-2">
                    <button onClick={() => setCaptain(p.id)} disabled={busy} className={`text-xs px-2 py-0.5 rounded font-sans ${p.is_captain ? "bg-accent text-accent-foreground" : "border border-border hover:bg-secondary"}`}>
                      {p.is_captain ? "Captain" : "Make Captain"}
                    </button>
                    <button onClick={() => removePick(p.id)} className="text-xs text-destructive hover:underline">Remove</button>
                  </span>
                </li>
              ))}
            </ul>
            {!nextFull && (
              <div>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search players to add…" className="w-full border border-border rounded px-3 py-2 text-sm bg-background font-sans" />
                <div className="mt-1 max-h-56 overflow-y-auto divide-y divide-border/60">
                  {results.filter(r => !nextPicks.some(p => p.player_id === r.PlayerID)).map(r => {
                    const capped = (nextPositionCounts[r.Position] ?? 0) >= (POSITION_CAPS[r.Position] ?? 0);
                    return (
                      <button key={r.PlayerID} onClick={() => addPick(r.PlayerID, r.Position)} disabled={busy || capped} className="w-full text-left px-2 py-1.5 text-sm font-sans hover:bg-highlight/30 flex justify-between disabled:opacity-40 disabled:cursor-not-allowed">
                        <span>{r.PlayerName}</span>
                        <span className="text-xs text-muted-foreground">{r.Position}{capped ? ` (full)` : ""}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {nextFull && !nextHasCaptain && <p className="text-xs text-muted-foreground font-sans italic">Don't forget to pick a captain!</p>}
          </div>
        </section>

        <section className="border border-border rounded overflow-hidden mb-6">
          <div className="bg-table-header px-4 py-2 flex justify-between items-center flex-wrap gap-2">
            <h2 className="font-display text-sm font-bold text-table-header-foreground">Recommended Picks</h2>
            <div className="flex gap-1 flex-wrap">
              {["All", "Keeper", "Beater", "Chaser", "Seeker"].map(p => (
                <button key={p} onClick={() => setRecPosFilter(p)} className={`text-xs px-2 py-0.5 rounded font-sans ${recPosFilter === p ? "bg-accent text-accent-foreground" : "text-table-header-foreground/70 hover:text-table-header-foreground"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-card p-4">
            <p className="text-xs text-muted-foreground font-sans mb-3">
              Based on recent scoring form (last 5 matches) and upcoming opponent strength, using the same Elo ratings as the rest of the site. Retired players are never included.
            </p>
            {loadingRecs ? (
              <p className="text-sm text-muted-foreground font-sans">Loading…</p>
            ) : (
              <div className="divide-y divide-border/60">
                {recommendations.filter(r => !nextPicks.some(p => p.player_id === r.PlayerID)).map(r => {
                  const capped = (nextPositionCounts[r.Position] ?? 0) >= (POSITION_CAPS[r.Position] ?? 0);
                  return (
                    <div key={r.PlayerID} className="py-2 flex items-center justify-between gap-3 text-sm font-sans">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link to={`/player/${r.PlayerID}`} className="font-semibold text-accent hover:underline truncate">{r.PlayerName}</Link>
                          <span className="text-xs text-muted-foreground shrink-0">{r.Position} · {r.TeamName || "—"}</span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.recent_avg_points.toFixed(1)} pts/match (last {r.games_sampled})
                          {r.opponent_name && (
                            <> · next: vs {r.opponent_name} ({r.matchup_multiplier > 1 ? "favored" : r.matchup_multiplier < 1 ? "underdog" : "even"})</>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono font-semibold text-accent">{r.recommendation_score.toFixed(0)}</span>
                        {!nextFull && (
                          <button onClick={() => addPick(r.PlayerID, r.Position)} disabled={busy || capped} className="text-xs border border-border rounded px-2 py-1 hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed">
                            Add
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {recommendations.length === 0 && <p className="text-sm text-muted-foreground font-sans italic">No recommendations available right now.</p>}
              </div>
            )}
          </div>
        </section>

        <section className="border border-border rounded overflow-hidden">
          <div className="bg-table-header px-4 py-2"><h2 className="font-display text-sm font-bold text-table-header-foreground">Season Leaderboard</h2></div>
          <table className="w-full text-sm font-sans">
            <thead><tr className="bg-secondary text-xs uppercase text-muted-foreground"><th className="px-3 py-1.5 text-left">#</th><th className="px-3 py-1.5 text-left">Player</th><th className="px-3 py-1.5 text-right">Total Points</th></tr></thead>
            <tbody>
              {leaderboard.map((r, i) => (
                <tr key={r.user_id} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} ${r.user_id === user.id ? "font-semibold" : ""}`}>
                  <td className="px-3 py-1.5">{i + 1}</td>
                  <td className="px-3 py-1.5">{r.display_name}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{r.total.toFixed(0)}</td>
                </tr>
              ))}
              {leaderboard.length === 0 && <tr><td colSpan={3} className="px-3 py-3 text-center text-muted-foreground font-sans italic">No scores yet.</td></tr>}
            </tbody>
          </table>
        </section>

        <p className="text-xs text-muted-foreground font-sans mt-4">
          Prefer a season-long league with a real draft? Check out <Link to="/fantasy" className="text-accent hover:underline">Fantasy Leagues</Link>.
        </p>
      </main>
      <SiteFooter /><MobileBottomNav />
    </div>
  );
}
