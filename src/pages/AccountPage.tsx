import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { useAuth } from "@/hooks/useAuth";
import { Star, X } from "lucide-react";

interface TeamRow { TeamID: number; FullName: string | null; }
interface PlayerRow { PlayerID: number; PlayerName: string | null; }

export default function AccountPage() {
  const { user, profile, favorites, loading, updateProfile, toggleFavorite, signOut } = useAuth();
  const navigate = useNavigate();

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/auth?next=/account");
  }, [loading, user, navigate]);

  useEffect(() => { setName(profile?.display_name || ""); }, [profile?.display_name]);

  useEffect(() => {
    (async () => {
      const [t, p] = await Promise.all([
        fetchAllRows<TeamRow & { ValidToDt: string }>("teams", { select: '"TeamID","FullName","ValidToDt"' }),
        fetchAllRows<PlayerRow>("players", { select: '"PlayerID","PlayerName"' }),
      ]);
      const uniq = new Map<number, TeamRow>();
      (t || []).forEach(r => { if (!uniq.has(r.TeamID)) uniq.set(r.TeamID, { TeamID: r.TeamID, FullName: r.FullName }); });
      setTeams([...uniq.values()].sort((a, b) => (a.FullName || "").localeCompare(b.FullName || "")));
      setPlayers(p || []);
    })();
  }, []);

  const teamMap = useMemo(() => new Map(teams.map(t => [t.TeamID, t.FullName || `Team #${t.TeamID}`])), [teams]);
  const playerMap = useMemo(() => new Map(players.map(p => [p.PlayerID, p.PlayerName || `Player #${p.PlayerID}`])), [players]);

  const favTeams = favorites.filter(f => f.entity_type === "team");
  const favPlayers = favorites.filter(f => f.entity_type === "player");

  const save = async () => {
    await updateProfile({ display_name: name.trim() || null });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const setPrimaryTeam = async (id: number | null) => {
    await updateProfile({ favorite_team_id: id });
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 container py-6 pb-20 md:pb-6">
        <div className="flex items-center justify-between mb-5">
          <h1 className="font-display text-3xl font-bold">My Account</h1>
          <button
            onClick={async () => { await signOut(); navigate("/"); }}
            className="text-xs font-sans font-semibold border border-border rounded px-3 py-1.5 hover:bg-muted transition-colors"
          >
            Sign out
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Profile */}
          <section className="border border-border rounded overflow-hidden">
            <div className="bg-table-header px-4 py-2">
              <h2 className="font-display text-sm font-bold text-table-header-foreground">Profile</h2>
            </div>
            <div className="bg-card p-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 font-sans">Email</label>
                <div className="text-sm font-mono text-muted-foreground">{user.email}</div>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 font-sans">Display name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={40}
                  className="w-full border border-border rounded px-3 py-2 text-sm bg-background font-sans focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 font-sans">Primary team</label>
                <select
                  value={profile?.favorite_team_id ?? ""}
                  onChange={e => setPrimaryTeam(e.target.value ? Number(e.target.value) : null)}
                  className="w-full border border-border rounded px-3 py-2 text-sm bg-background font-sans"
                >
                  <option value="">None</option>
                  {teams.map(t => <option key={t.TeamID} value={t.TeamID}>{t.FullName}</option>)}
                </select>
                <p className="text-[11px] text-muted-foreground font-sans mt-1">
                  Your primary team is pinned to the front of the latest scores ticker.
                </p>
              </div>
              <button
                onClick={save}
                className="bg-primary text-primary-foreground font-sans font-semibold text-sm px-4 py-2 rounded hover:opacity-90 transition-opacity"
              >
                {saved ? "Saved" : "Save profile"}
              </button>
            </div>
          </section>

          {/* Favorites */}
          <section className="border border-border rounded overflow-hidden">
            <div className="bg-table-header px-4 py-2">
              <h2 className="font-display text-sm font-bold text-table-header-foreground">Favorites</h2>
            </div>
            <div className="bg-card p-4 space-y-5">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 font-sans">Teams</h3>
                {favTeams.length === 0 && <p className="text-sm text-muted-foreground font-sans">No favorite teams yet — hit the star on any team page.</p>}
                <ul className="space-y-1">
                  {favTeams.map(f => (
                    <li key={f.id} className="flex items-center justify-between text-sm font-sans border-b border-border/60 pb-1">
                      <Link to={`/team/${encodeURIComponent(teamMap.get(f.entity_id) || "")}`} className="hover:underline flex items-center gap-1.5">
                        <Star size={13} className="fill-current text-accent" />
                        {teamMap.get(f.entity_id) || `Team #${f.entity_id}`}
                      </Link>
                      <button onClick={() => toggleFavorite("team", f.entity_id)} className="text-muted-foreground hover:text-destructive" aria-label="Remove">
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 font-sans">Players</h3>
                {favPlayers.length === 0 && <p className="text-sm text-muted-foreground font-sans">No favorite players yet.</p>}
                <ul className="space-y-1">
                  {favPlayers.map(f => (
                    <li key={f.id} className="flex items-center justify-between text-sm font-sans border-b border-border/60 pb-1">
                      <Link to={`/player/${f.entity_id}`} className="hover:underline flex items-center gap-1.5">
                        <Star size={13} className="fill-current text-accent" />
                        {playerMap.get(f.entity_id) || `Player #${f.entity_id}`}
                      </Link>
                      <button onClick={() => toggleFavorite("player", f.entity_id)} className="text-muted-foreground hover:text-destructive" aria-label="Remove">
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-6 border border-border rounded bg-card p-4">
          <h2 className="font-display text-sm font-bold mb-1">Fantasy</h2>
          <p className="text-sm text-muted-foreground font-sans mb-3">Create or join a fantasy league and draft your roster.</p>
          <Link to="/fantasy" className="text-sm font-sans font-semibold text-accent hover:underline">Go to fantasy →</Link>
        </div>
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
