import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { useAuth } from "@/hooks/useAuth";
import { seasonLabel } from "@/lib/fantasy";

interface League {
  id: string; name: string; owner_id: string; season_id: number | null;
  status: "forming" | "drafting" | "active" | "complete";
  draft_date: string | null; draft_order_mode: "random" | "manual";
  invite_code: string; is_public: boolean;
}
interface Team { id: string; user_id: string; name: string; }
interface DraftOrderRow { fantasy_team_id: string; pick_position: number; }
interface DraftPick { pick_number: number; fantasy_team_id: string; player_id: number; picked_at: string; }
interface RosterRow { fantasy_team_id: string; player_id: number; slot: string; }
interface Matchup {
  id: string; month_index: number; period_start: string; period_end: string;
  home_fantasy_team_id: string; away_fantasy_team_id: string; home_score: number | null; away_score: number | null;
}

const ROSTER_CAPS: Record<string, number> = { Keeper: 2, Beater: 4, Chaser: 6, Seeker: 2 };
const inputCls = "border border-border rounded px-3 py-2 text-sm bg-background font-sans focus:outline-none focus:ring-2 focus:ring-primary";
const btn = "bg-primary text-primary-foreground font-sans font-semibold text-sm px-4 py-2 rounded hover:opacity-90 disabled:opacity-50";

export default function FantasyLeaguePage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [draftOrder, setDraftOrder] = useState<DraftOrderRow[]>([]);
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [rosters, setRosters] = useState<RosterRow[]>([]);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [playerNames, setPlayerNames] = useState<Map<number, { name: string; position: string }>>(new Map());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate(`/auth?next=/fantasy/${id}`);
  }, [loading, user, navigate, id]);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: lg }, { data: tms }, { data: ord }, { data: pks }, { data: ros }, { data: mus }] = await Promise.all([
      supabase.from("fantasy_leagues").select("id, name, owner_id, season_id, status, draft_date, draft_order_mode, invite_code, is_public").eq("id", id).maybeSingle(),
      supabase.from("fantasy_teams").select("id, user_id, name").eq("fantasy_league_id", id),
      supabase.from("fantasy_draft_order").select("fantasy_team_id, pick_position").eq("fantasy_league_id", id),
      supabase.from("fantasy_draft_picks").select("pick_number, fantasy_team_id, player_id, picked_at").eq("fantasy_league_id", id).order("pick_number"),
      supabase.from("fantasy_rosters").select("fantasy_team_id, player_id, slot").eq("fantasy_league_id", id),
      supabase.from("fantasy_matchups").select("*").eq("fantasy_league_id", id).order("month_index"),
    ]);
    setLeague(lg as League | null);
    setTeams((tms || []) as Team[]);
    setDraftOrder((ord || []) as DraftOrderRow[]);
    setPicks((pks || []) as DraftPick[]);
    setRosters((ros || []) as RosterRow[]);
    setMatchups((mus || []) as Matchup[]);

    const pids = [...new Set([...(pks || []).map((p: any) => p.player_id), ...(ros || []).map((r: any) => r.player_id)])];
    if (pids.length > 0) {
      const { data: pdata } = await supabase.from("players").select('"PlayerID","PlayerName","Position"').in("PlayerID", pids);
      setPlayerNames(new Map((pdata || []).map((p: any) => [p.PlayerID, { name: p.PlayerName, position: p.Position }])));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Live updates during the draft
  useEffect(() => {
    if (!id || league?.status !== "drafting") return;
    const channel = supabase
      .channel(`draft-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fantasy_draft_picks", filter: `fantasy_league_id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "fantasy_leagues", filter: `id=eq.${id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, league?.status, load]);

  const myTeam = useMemo(() => teams.find(t => t.user_id === user?.id) || null, [teams, user]);
  const teamName = (tid: string) => teams.find(t => t.id === tid)?.name || "—";

  const numTeams = draftOrder.length || teams.length;
  const pickNumber = picks.length + 1;
  const round = Math.floor((pickNumber - 1) / Math.max(numTeams, 1));
  const indexInRound = (pickNumber - 1) % Math.max(numTeams, 1);
  const pickPosition = round % 2 === 0 ? indexInRound + 1 : numTeams - indexInRound;
  const onTheClockTeamId = draftOrder.find(o => o.pick_position === pickPosition)?.fantasy_team_id;
  const isMyTurn = league?.status === "drafting" && myTeam && onTheClockTeamId === myTeam.id;
  const draftComplete = numTeams > 0 && picks.length >= numTeams * 14;

  const startDraft = async () => {
    setBusy(true); setError("");
    const { error: err } = await supabase.rpc("start_fantasy_draft", { p_league_id: id });
    if (err) setError(err.message);
    setBusy(false);
    await load();
  };

  if (!user || !league) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SiteHeader />
        <main className="flex-1 container py-6 pb-20 md:pb-6">
          <p className="text-sm text-muted-foreground font-sans">{league === null ? "Loading…" : "League not found."}</p>
        </main>
        <SiteFooter /><MobileBottomNav />
      </div>
    );
  }

  const isOwner = league.owner_id === user.id;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-6 pb-20 md:pb-6">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h1 className="font-display text-3xl font-bold">{league.name}</h1>
          <Link to="/fantasy" className="text-sm text-accent hover:underline font-sans">← All leagues</Link>
        </div>
        <p className="text-sm text-muted-foreground font-sans mb-5">
          {seasonLabel(league.season_id || 0)} · {teams.length} team{teams.length === 1 ? "" : "s"} · invite code <span className="font-mono">{league.invite_code}</span>
        </p>

        {error && <div className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2 font-sans">{error}</div>}

        {league.status === "forming" && (
          <section className="border border-border rounded overflow-hidden mb-6">
            <div className="bg-table-header px-4 py-2">
              <h2 className="font-display text-sm font-bold text-table-header-foreground">Teams</h2>
            </div>
            <div className="bg-card p-4">
              <ul className="text-sm font-sans space-y-1 mb-4">
                {teams.map(t => (
                  <li key={t.id} className="flex justify-between">
                    <span>{t.name}</span>
                    {t.user_id === league.owner_id && <span className="text-xs text-muted-foreground">Creator</span>}
                  </li>
                ))}
              </ul>
              {isOwner ? (
                <button onClick={startDraft} disabled={busy || teams.length < 2} className={btn}>
                  {teams.length < 2 ? "Need at least 2 teams to draft" : "Start Draft Now"}
                </button>
              ) : (
                <p className="text-sm text-muted-foreground font-sans italic">Waiting for the league creator to start the draft.</p>
              )}
            </div>
          </section>
        )}

        {league.status === "drafting" && (
          <DraftRoom
            leagueId={id!}
            teams={teams}
            draftOrder={draftOrder}
            picks={picks}
            playerNames={playerNames}
            myTeam={myTeam}
            isMyTurn={!!isMyTurn}
            teamName={teamName}
            draftComplete={draftComplete}
            onPicked={load}
          />
        )}

        {(league.status === "active" || league.status === "complete") && (
          <FantasyLeagueHome
            teams={teams}
            rosters={rosters}
            matchups={matchups}
            playerNames={playerNames}
            myTeam={myTeam}
            teamName={teamName}
          />
        )}
      </main>
      <SiteFooter /><MobileBottomNav />
    </div>
  );
}

function DraftRoom({
  leagueId, teams, draftOrder, picks, playerNames, myTeam, isMyTurn, teamName, draftComplete, onPicked,
}: {
  leagueId: string; teams: Team[]; draftOrder: DraftOrderRow[]; picks: DraftPick[];
  playerNames: Map<number, { name: string; position: string }>;
  myTeam: Team | null; isMyTurn: boolean; teamName: (id: string) => string; draftComplete: boolean;
  onPicked: () => void;
}) {
  const [query, setQuery] = useState("");
  const [posFilter, setPosFilter] = useState<string>("All");
  const [results, setResults] = useState<{ PlayerID: number; PlayerName: string; Position: string }[]>([]);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState("");

  const draftedIds = useMemo(() => new Set(picks.map(p => p.player_id)), [picks]);

  const myRosterCounts = useMemo(() => {
    const counts: Record<string, number> = { Keeper: 0, Beater: 0, Chaser: 0, Seeker: 0 };
    picks.filter(p => p.fantasy_team_id === myTeam?.id).forEach(p => {
      const pos = playerNames.get(p.player_id)?.position;
      if (pos && counts[pos] !== undefined) counts[pos]++;
    });
    return counts;
  }, [picks, myTeam, playerNames]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const handle = setTimeout(async () => {
      let q = supabase.from("players").select('"PlayerID","PlayerName","Position"').ilike("PlayerName", `%${query.trim()}%`).limit(15);
      if (posFilter !== "All") q = q.eq("Position", posFilter);
      const { data } = await q;
      setResults((data || []) as any[]);
    }, 300);
    return () => clearTimeout(handle);
  }, [query, posFilter]);

  const makePick = async (playerId: number) => {
    setPicking(true); setPickError("");
    const { error } = await supabase.rpc("make_draft_pick", { p_league_id: leagueId, p_player_id: playerId });
    if (error) setPickError(error.message);
    else { setQuery(""); onPicked(); }
    setPicking(false);
  };

  if (draftComplete) {
    return (
      <div className="border border-border rounded p-6 text-center">
        <p className="font-display text-lg font-bold mb-1">Draft complete!</p>
        <p className="text-sm text-muted-foreground font-sans">The season schedule has been generated. Refresh to see your league home.</p>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-4">
        <div className={`border rounded p-3 font-sans text-sm ${isMyTurn ? "border-accent bg-accent/10" : "border-border bg-card"}`}>
          {isMyTurn ? (
            <span className="font-bold text-accent">It's your pick! ({picks.length + 1} of {draftOrder.length * 14})</span>
          ) : (
            <span>Waiting on <span className="font-semibold">{teamName(draftOrder.find(o => o.pick_position === ((Math.floor(picks.length / draftOrder.length) % 2 === 0) ? (picks.length % draftOrder.length) + 1 : draftOrder.length - (picks.length % draftOrder.length)))?.fantasy_team_id || "")}</span> — pick {picks.length + 1} of {draftOrder.length * 14}</span>
          )}
        </div>

        {isMyTurn && (
          <div className="border border-border rounded p-4 space-y-3">
            <div className="flex gap-1 flex-wrap">
              {["All", "Keeper", "Beater", "Chaser", "Seeker"].map(p => (
                <button key={p} onClick={() => setPosFilter(p)} className={`text-xs px-2 py-1 rounded font-sans ${posFilter === p ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary"}`}>
                  {p}{p !== "All" && ` (${myRosterCounts[p]}/${ROSTER_CAPS[p]})`}
                </button>
              ))}
            </div>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search players to draft…" className={`${inputCls} w-full`} />
            {pickError && <p className="text-xs text-destructive font-sans">{pickError}</p>}
            <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
              {results.filter(r => !draftedIds.has(r.PlayerID)).map(r => (
                <button
                  key={r.PlayerID}
                  disabled={picking || (myRosterCounts[r.Position] ?? 0) >= (ROSTER_CAPS[r.Position] ?? 0)}
                  onClick={() => makePick(r.PlayerID)}
                  className="w-full text-left px-2 py-2 text-sm font-sans hover:bg-highlight/30 flex justify-between disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>{r.PlayerName}</span>
                  <span className="text-xs text-muted-foreground">{r.Position}</span>
                </button>
              ))}
              {query.trim().length >= 2 && results.length === 0 && <p className="text-xs text-muted-foreground font-sans px-2 py-2">No players found.</p>}
            </div>
          </div>
        )}

        <div>
          <h3 className="font-display text-sm font-bold mb-2">Draft order (snake)</h3>
          <div className="flex flex-wrap gap-2 text-xs font-sans">
            {draftOrder.sort((a, b) => a.pick_position - b.pick_position).map(o => (
              <span key={o.fantasy_team_id} className="border border-border rounded px-2 py-1">{o.pick_position}. {teamName(o.fantasy_team_id)}</span>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h3 className="font-display text-sm font-bold mb-2">Recent picks</h3>
        <div className="border border-border rounded divide-y divide-border/60 max-h-96 overflow-y-auto">
          {[...picks].reverse().map(p => (
            <div key={p.pick_number} className="px-3 py-1.5 text-xs font-sans flex justify-between gap-2">
              <span className="text-muted-foreground">#{p.pick_number}</span>
              <span className="flex-1 truncate">{playerNames.get(p.player_id)?.name || p.player_id}</span>
              <span className="text-muted-foreground truncate max-w-[6rem]">{teamName(p.fantasy_team_id)}</span>
            </div>
          ))}
          {picks.length === 0 && <p className="text-xs text-muted-foreground font-sans px-3 py-2">No picks yet.</p>}
        </div>
      </div>
    </div>
  );
}

function FantasyLeagueHome({
  teams, rosters, matchups, playerNames, myTeam, teamName,
}: {
  teams: Team[]; rosters: RosterRow[]; matchups: Matchup[];
  playerNames: Map<number, { name: string; position: string }>;
  myTeam: Team | null; teamName: (id: string) => string;
}) {
  const standings = useMemo(() => {
    const rows = new Map<string, { wins: number; losses: number; ties: number; pf: number; pa: number }>();
    teams.forEach(t => rows.set(t.id, { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 }));
    matchups.forEach(m => {
      if (m.home_score == null || m.away_score == null) return;
      const h = rows.get(m.home_fantasy_team_id), a = rows.get(m.away_fantasy_team_id);
      if (!h || !a) return;
      h.pf += m.home_score; h.pa += m.away_score;
      a.pf += m.away_score; a.pa += m.home_score;
      if (m.home_score > m.away_score) { h.wins++; a.losses++; }
      else if (m.home_score < m.away_score) { a.wins++; h.losses++; }
      else { h.ties++; a.ties++; }
    });
    return [...rows.entries()].map(([id, r]) => ({ id, ...r })).sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses) || b.pf - a.pf);
  }, [teams, matchups]);

  const myRoster = rosters.filter(r => r.fantasy_team_id === myTeam?.id);

  return (
    <div className="space-y-6">
      <section className="border border-border rounded overflow-hidden">
        <div className="bg-table-header px-4 py-2"><h2 className="font-display text-sm font-bold text-table-header-foreground">Standings</h2></div>
        <table className="w-full text-sm font-sans">
          <thead><tr className="bg-secondary text-xs uppercase text-muted-foreground"><th className="px-3 py-1.5 text-left">Team</th><th className="px-3 py-1.5">W</th><th className="px-3 py-1.5">L</th><th className="px-3 py-1.5">T</th><th className="px-3 py-1.5">PF</th><th className="px-3 py-1.5">PA</th></tr></thead>
          <tbody>
            {standings.map((s, i) => (
              <tr key={s.id} className={`border-t border-border ${i % 2 === 1 ? "bg-table-stripe" : "bg-card"} ${s.id === myTeam?.id ? "font-semibold" : ""}`}>
                <td className="px-3 py-1.5">{teamName(s.id)}</td>
                <td className="px-3 py-1.5 text-center">{s.wins}</td>
                <td className="px-3 py-1.5 text-center">{s.losses}</td>
                <td className="px-3 py-1.5 text-center">{s.ties}</td>
                <td className="px-3 py-1.5 text-center font-mono">{s.pf.toFixed(0)}</td>
                <td className="px-3 py-1.5 text-center font-mono">{s.pa.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {myTeam && (
        <section className="border border-border rounded overflow-hidden">
          <div className="bg-table-header px-4 py-2"><h2 className="font-display text-sm font-bold text-table-header-foreground">My Roster — {myTeam.name}</h2></div>
          <div className="bg-card p-4 grid sm:grid-cols-2 gap-x-6 gap-y-1">
            {["Keeper", "Beater", "Chaser", "Seeker"].map(pos => (
              <div key={pos}>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{pos}s</h4>
                {myRoster.filter(r => playerNames.get(r.player_id)?.position === pos).map(r => (
                  <div key={r.player_id} className="text-sm font-sans py-0.5">{playerNames.get(r.player_id)?.name || r.player_id}</div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="border border-border rounded overflow-hidden">
        <div className="bg-table-header px-4 py-2"><h2 className="font-display text-sm font-bold text-table-header-foreground">Schedule</h2></div>
        <div className="bg-card divide-y divide-border/60">
          {matchups.sort((a, b) => a.month_index - b.month_index).map(m => (
            <div key={m.id} className="px-4 py-2 text-sm font-sans flex justify-between">
              <span className="text-muted-foreground text-xs w-24">Month {m.month_index}</span>
              <span className="flex-1">{teamName(m.home_fantasy_team_id)} vs {teamName(m.away_fantasy_team_id)}</span>
              <span className="font-mono">{m.home_score != null ? `${m.home_score.toFixed(0)} – ${m.away_score?.toFixed(0)}` : "—"}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
