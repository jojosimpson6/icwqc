import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_SCORING_RULES, seasonLabel } from "@/lib/fantasy";

interface FLeague {
  id: string;
  name: string;
  owner_id: string;
  season_id: number | null;
  is_public: boolean;
  invite_code: string;
  max_teams: number;
  roster_size: number;
  status: "forming" | "drafting" | "active" | "complete";
}
interface FTeam { id: string; fantasy_league_id: string; user_id: string; name: string; }

// Fantasy seasons always track the current quidditch season — no picker needed.
function currentSeasonId(): number {
  const now = new Date();
  return now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
}

export default function FantasyPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  const [leagues, setLeagues] = useState<FLeague[]>([]);
  const [myTeams, setMyTeams] = useState<FTeam[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [newName, setNewName] = useState("");
  const [newPublic, setNewPublic] = useState(true);
  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate("/auth?next=/fantasy");
  }, [loading, user, navigate]);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: ls }, { data: ts }] = await Promise.all([
      supabase.from("fantasy_leagues").select("id, name, owner_id, season_id, is_public, invite_code, max_teams, roster_size, status").order("created_at", { ascending: false }),
      supabase.from("fantasy_teams").select("id, fantasy_league_id, user_id, name").eq("user_id", user.id),
    ]);
    setLeagues((ls || []) as FLeague[]);
    setMyTeams((ts || []) as FTeam[]);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const myLeagueIds = useMemo(() => new Set(myTeams.map(t => t.fantasy_league_id)), [myTeams]);

  const createLeague = async () => {
    if (!user || !newName.trim()) return;
    setBusy(true); setError("");
    const { data, error: err } = await supabase
      .from("fantasy_leagues")
      .insert({ name: newName.trim().slice(0, 80), owner_id: user.id, season_id: currentSeasonId(), is_public: newPublic })
      .select("id")
      .single();
    if (err || !data) { setError(err?.message || "Could not create league"); setBusy(false); return; }

    await supabase.from("fantasy_scoring_rules").insert(
      DEFAULT_SCORING_RULES.map(r => ({ fantasy_league_id: data.id, stat_key: r.key, points: r.points })),
    );
    await supabase.from("fantasy_teams").insert({
      fantasy_league_id: data.id,
      user_id: user.id,
      name: (profile?.display_name || "My") + "'s Team",
    });
    setNewName("");
    setBusy(false);
    navigate(`/fantasy/${data.id}`);
  };

  const joinLeague = async () => {
    if (!user || !joinCode.trim()) return;
    setBusy(true); setError("");
    const { data: lg } = await supabase
      .from("fantasy_leagues")
      .select("id")
      .eq("invite_code", joinCode.trim().toLowerCase())
      .maybeSingle();
    if (!lg) { setError("No league found with that invite code (private leagues must be public to join by code)."); setBusy(false); return; }
    const { error: err } = await supabase.from("fantasy_teams").insert({
      fantasy_league_id: lg.id,
      user_id: user.id,
      name: (profile?.display_name || "My") + "'s Team",
    });
    if (err) setError(err.message);
    setJoinCode("");
    setBusy(false);
    if (!err) navigate(`/fantasy/${lg.id}`);
    await load();
  };

  const leaveLeague = async (leagueId: string) => {
    const t = myTeams.find(x => x.fantasy_league_id === leagueId);
    if (!t) return;
    await supabase.from("fantasy_teams").delete().eq("id", t.id);
    await load();
  };

  if (!user) return null;

  const inputCls = "border border-border rounded px-3 py-2 text-sm bg-background font-sans focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-6 pb-20 md:pb-6">
        <h1 className="font-display text-3xl font-bold mb-1">Fantasy Quidditch</h1>
        <p className="text-sm text-muted-foreground font-sans mb-1">
          Create a league, invite friends, and draft a roster for the {seasonLabel(currentSeasonId())} season.
        </p>
        <p className="text-sm font-sans mb-5">
          Looking for something quicker? Try the <Link to="/fantasy/weekly" className="text-accent hover:underline font-semibold">sitewide Weekly Fantasy</Link> game — pick 7 players and a captain every week.
        </p>

        {error && (
          <div className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2 font-sans">{error}</div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <section className="border border-border rounded overflow-hidden">
            <div className="bg-table-header px-4 py-2">
              <h2 className="font-display text-sm font-bold text-table-header-foreground">Create a league</h2>
            </div>
            <div className="bg-card p-4 space-y-3">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="League name" maxLength={80} className={`${inputCls} w-full`} />
              <label className="flex items-center gap-2 text-sm font-sans">
                <input type="checkbox" checked={newPublic} onChange={e => setNewPublic(e.target.checked)} />
                Public league (joinable by invite code)
              </label>
              <button
                onClick={createLeague}
                disabled={busy || !newName.trim()}
                className="bg-primary text-primary-foreground font-sans font-semibold text-sm px-4 py-2 rounded hover:opacity-90 disabled:opacity-50"
              >
                Create league
              </button>
            </div>
          </section>

          <section className="border border-border rounded overflow-hidden">
            <div className="bg-table-header px-4 py-2">
              <h2 className="font-display text-sm font-bold text-table-header-foreground">Join with an invite code</h2>
            </div>
            <div className="bg-card p-4 space-y-3">
              <input value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="e.g. 4f2a9c1b8e07" className={`${inputCls} w-full font-mono`} />
              <button
                onClick={joinLeague}
                disabled={busy || !joinCode.trim()}
                className="bg-primary text-primary-foreground font-sans font-semibold text-sm px-4 py-2 rounded hover:opacity-90 disabled:opacity-50"
              >
                Join league
              </button>
            </div>
          </section>
        </div>

        <section className="border border-border rounded overflow-hidden">
          <div className="bg-table-header px-4 py-2">
            <h2 className="font-display text-sm font-bold text-table-header-foreground">Leagues</h2>
          </div>
          <div className="bg-card">
            {leagues.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground font-sans">No leagues yet. Create one above to get started.</p>
            )}
            <table className="w-full text-sm font-sans">
              <tbody>
                {leagues.map(l => {
                  const joined = myLeagueIds.has(l.id) || l.owner_id === user.id;
                  const statusLabel = { forming: "Forming", drafting: "Drafting", active: "In Season", complete: "Complete" }[l.status];
                  return (
                    <tr key={l.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2">
                        <Link to={`/fantasy/${l.id}`} className="font-semibold text-accent hover:underline">{l.name}</Link>
                        <div className="text-xs text-muted-foreground">
                          {seasonLabel(l.season_id ?? currentSeasonId())} · {l.is_public ? "Public" : "Private"} · {statusLabel} · roster {l.roster_size}
                        </div>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">{l.invite_code}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {joined ? (
                          <Link to={`/fantasy/${l.id}`} className="text-xs font-semibold text-accent mr-3 hover:underline">Open →</Link>
                        ) : null}
                        {myLeagueIds.has(l.id) && l.owner_id !== user.id && (
                          <button onClick={() => leaveLeague(l.id)} className="text-xs border border-border rounded px-2 py-1 hover:bg-muted">Leave</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 border border-border rounded overflow-hidden">
          <div className="bg-table-header px-4 py-2">
            <h2 className="font-display text-sm font-bold text-table-header-foreground">Default scoring</h2>
          </div>
          <div className="bg-card p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
            {DEFAULT_SCORING_RULES.map(r => (
              <div key={r.key} className="flex justify-between text-sm font-sans border-b border-border/50 py-1">
                <span>{r.label}</span>
                <span className="font-mono">{r.points > 0 ? `+${r.points}` : r.points}</span>
              </div>
            ))}
          </div>
        </section>

        <p className="text-xs text-muted-foreground font-sans mt-4">
          Once your league fills up, its creator can start the draft from the league page. Manage favorites from your{" "}
          <Link to="/account" className="text-accent hover:underline">account page</Link>.
        </p>
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
