import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { useAuth } from "@/hooks/useAuth";

interface Pick { id: string; player_id: number; is_captain: boolean; }

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
  const [leaderboard, setLeaderboard] = useState<{ user_id: string; display_name: string; total: number }[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ PlayerID: number; PlayerName: string; Position: string }[]>([]);
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

    // Live/partial score for the in-progress week
    if (cur && cur.length > 0) {
      const totals = await Promise.all(cur.map(async (p: any) => {
        const { data } = await supabase.rpc("compute_weekly_fantasy_points", { p_player_id: p.player_id, p_week_start: currentWeek });
        return (data || 0) * (p.is_captain ? 2 : 1);
      }));
      setCurrentScore(totals.reduce((a, b) => a + b, 0));
    } else {
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
      const { data } = await supabase.from("players").select('"PlayerID","PlayerName","Position"').ilike("PlayerName", `%${query.trim()}%`).limit(10);
      setResults((data || []) as any[]);
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const addPick = async (playerId: number) => {
    if (!user) return;
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

  if (!user) return null;

  const nextFull = nextPicks.length >= 7;
  const nextHasCaptain = nextPicks.some(p => p.is_captain);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-6 pb-20 md:pb-6 max-w-4xl">
        <h1 className="font-display text-3xl font-bold mb-1">Weekly Fantasy</h1>
        <p className="text-sm text-muted-foreground font-sans mb-6">
          Pick 7 players and a captain (2× points) each week. Picks lock Friday night; scoring runs Saturday through the following Friday.
        </p>

        {error && <div className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2 font-sans">{error}</div>}

        <section className="border border-border rounded overflow-hidden mb-6">
          <div className="bg-table-header px-4 py-2 flex justify-between items-center">
            <h2 className="font-display text-sm font-bold text-table-header-foreground">This Week ({displayDate(currentWeek)} – {displayDate(fmt(addDays(new Date(currentWeek + "T00:00:00"), 6)))})</h2>
            {currentScore != null && <span className="text-table-header-foreground font-mono text-sm">{currentScore.toFixed(0)} pts (live)</span>}
          </div>
          <div className="bg-card p-4">
            {currentPicks.length === 0 ? (
              <p className="text-sm text-muted-foreground font-sans italic">No picks were locked in for this week.</p>
            ) : (
              <ul className="text-sm font-sans space-y-1">
                {currentPicks.map(p => (
                  <li key={p.id} className="flex justify-between">
                    <span>{playerNames.get(p.player_id)?.name || p.player_id} {p.is_captain && <span className="text-xs text-accent font-bold ml-1">(C)</span>}</span>
                    <span className="text-xs text-muted-foreground">{playerNames.get(p.player_id)?.position}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="border border-border rounded overflow-hidden mb-6">
          <div className="bg-table-header px-4 py-2 flex justify-between items-center flex-wrap gap-1">
            <h2 className="font-display text-sm font-bold text-table-header-foreground">Next Week ({displayDate(nextWeek)}+) — {nextPicks.length}/7 picked</h2>
            <span className="text-xs text-table-header-foreground/80 font-sans">Locks {fridayCutoff.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} night</span>
          </div>
          <div className="bg-card p-4 space-y-3">
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
                  {results.filter(r => !nextPicks.some(p => p.player_id === r.PlayerID)).map(r => (
                    <button key={r.PlayerID} onClick={() => addPick(r.PlayerID)} disabled={busy} className="w-full text-left px-2 py-1.5 text-sm font-sans hover:bg-highlight/30 flex justify-between">
                      <span>{r.PlayerName}</span>
                      <span className="text-xs text-muted-foreground">{r.Position}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {nextFull && !nextHasCaptain && <p className="text-xs text-muted-foreground font-sans italic">Don't forget to pick a captain!</p>}
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
