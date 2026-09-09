import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";

interface TeamOption { TeamID: number; FullName: string; }
interface NationOption { NationID: number; Nation: string; }
interface PlayerHit { PlayerID: number; PlayerName: string; Position: string | null; }
interface ManagerHit { ManagerID: number; FirstName: string; LastName: string; }

interface TeamCaptainRow {
  TeamID: number; SeasonID: number; CaptainPlayerID: number;
  MatchesPlayed: number | null; CaptainAppearances: number | null;
  AppearanceShare: number | null; SelectionMethod: string | null;
}
interface TeamManagerRow { TeamID: number; SeasonID: number; ManagerID: number; }

const inputClass = "w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary";
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 font-sans";
const btnPrimary = "bg-primary text-primary-foreground font-sans font-semibold text-xs px-3 py-1.5 rounded hover:opacity-90 transition-opacity disabled:opacity-50";
const btnDanger = "bg-destructive text-destructive-foreground font-sans font-semibold text-xs px-3 py-1.5 rounded hover:opacity-90 transition-opacity";
const btnSecondary = "border border-border text-foreground font-sans font-semibold text-xs px-3 py-1.5 rounded hover:bg-secondary transition-colors";

/** Debounced type-ahead search against players or managers. Both tables are
 * far too large (8,700 / 1,761 rows) to load client-side, so this searches
 * server-side on each keystroke (debounced) instead. */
function usePersonSearch<T>(
  table: "players" | "managers",
  buildQuery: (q: string) => Promise<T[]>,
) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const handle = setTimeout(() => {
      buildQuery(query.trim()).then(setResults).finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, table]);

  return { query, setQuery, results, searching };
}

function PlayerPicker({ onPick, placeholder }: { onPick: (p: PlayerHit) => void; placeholder: string }) {
  const { query, setQuery, results, searching } = usePersonSearch<PlayerHit>("players", async (q) => {
    const { data } = await supabase.from("players").select("PlayerID, PlayerName, Position")
      .ilike("PlayerName", `%${q}%`).order("PlayerName").limit(8);
    return (data || []) as PlayerHit[];
  });
  return (
    <div className="relative">
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder} className={inputClass} />
      {query.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full bg-popover border border-border rounded shadow-lg max-h-56 overflow-y-auto">
          {searching && <div className="px-3 py-2 text-xs text-muted-foreground font-sans">Searching…</div>}
          {!searching && results.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground font-sans">No players found.</div>}
          {results.map(p => (
            <button
              key={p.PlayerID}
              onClick={() => { onPick(p); setQuery(""); }}
              className="w-full text-left px-3 py-1.5 text-sm font-sans hover:bg-highlight/30 flex justify-between gap-2"
            >
              <span>{p.PlayerName}</span>
              <span className="text-xs text-muted-foreground">{p.Position} · #{p.PlayerID}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ManagerPicker({ onPick, placeholder }: { onPick: (m: ManagerHit) => void; placeholder: string }) {
  const { query, setQuery, results, searching } = usePersonSearch<ManagerHit>("managers", async (q) => {
    const { data } = await supabase.from("managers").select("ManagerID, FirstName, LastName")
      .or(`FirstName.ilike.%${q}%,LastName.ilike.%${q}%`).order("LastName").limit(8);
    return (data || []) as ManagerHit[];
  });
  return (
    <div className="relative">
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder} className={inputClass} />
      {query.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full bg-popover border border-border rounded shadow-lg max-h-56 overflow-y-auto">
          {searching && <div className="px-3 py-2 text-xs text-muted-foreground font-sans">Searching…</div>}
          {!searching && results.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground font-sans">No managers found.</div>}
          {results.map(m => (
            <button
              key={m.ManagerID}
              onClick={() => { onPick(m); setQuery(""); }}
              className="w-full text-left px-3 py-1.5 text-sm font-sans hover:bg-highlight/30 flex justify-between gap-2"
            >
              <span>{m.FirstName} {m.LastName}</span>
              <span className="text-xs text-muted-foreground">#{m.ManagerID}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RostersAdmin() {
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [nations, setNations] = useState<NationOption[]>([]);
  const [teamId, setTeamId] = useState<number | "">("");
  const [seasonId, setSeasonId] = useState<number>(new Date().getMonth() >= 7 ? new Date().getFullYear() + 1 : new Date().getFullYear());
  const [msg, setMsg] = useState("");

  const [captain, setCaptain] = useState<TeamCaptainRow | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<{ PlayerID: number; PlayerName: string } | null>(null);
  const [captainLoading, setCaptainLoading] = useState(false);

  const [manager, setManager] = useState<TeamManagerRow | null>(null);
  const [selectedManager, setSelectedManager] = useState<{ ManagerID: number; FirstName: string; LastName: string } | null>(null);
  const [managerLoading, setManagerLoading] = useState(false);
  const [showNewManagerForm, setShowNewManagerForm] = useState(false);
  const [newManager, setNewManager] = useState({ FirstName: "", LastName: "", Gender: "M", DOB: "", NationalityID: "" as number | "" });

  useEffect(() => {
    fetchAllRows<TeamOption>("teams", { select: "TeamID, FullName" }).then(data => {
      if (data) setTeams([...data].sort((a, b) => (a.FullName || "").localeCompare(b.FullName || "")));
    });
    fetchAllRows<NationOption>("nations", { select: "NationID, Nation" }).then(data => {
      if (data) setNations([...data].sort((a, b) => a.Nation.localeCompare(b.Nation)));
    });
  }, []);

  const clubTeams = useMemo(() => teams.filter(t => t.TeamID <= 999), [teams]);
  const intlTeams = useMemo(() => teams.filter(t => t.TeamID > 999), [teams]);

  // Load the current captain/manager for the selected team+season
  useEffect(() => {
    if (!teamId || !seasonId) { setCaptain(null); setManager(null); return; }
    setCaptainLoading(true);
    setManagerLoading(true);
    supabase.from("team_captains").select("*").eq("TeamID", teamId).eq("SeasonID", seasonId).maybeSingle()
      .then(async ({ data }) => {
        setCaptain(data as TeamCaptainRow | null);
        if (data) {
          const { data: p } = await supabase.from("players").select("PlayerID, PlayerName").eq("PlayerID", (data as TeamCaptainRow).CaptainPlayerID).maybeSingle();
          setSelectedPlayer(p as any);
        } else setSelectedPlayer(null);
      }).finally(() => setCaptainLoading(false));
    supabase.from("team_managers").select("*").eq("TeamID", teamId).eq("SeasonID", seasonId).maybeSingle()
      .then(async ({ data }) => {
        setManager(data as TeamManagerRow | null);
        if (data) {
          const { data: m } = await supabase.from("managers").select("ManagerID, FirstName, LastName").eq("ManagerID", (data as TeamManagerRow).ManagerID).maybeSingle();
          setSelectedManager(m as any);
        } else setSelectedManager(null);
      }).finally(() => setManagerLoading(false));
  }, [teamId, seasonId]);

  async function saveCaptain() {
    if (!teamId || !selectedPlayer) { setMsg("Pick a team, season, and player first."); return; }
    const { error } = await supabase.from("team_captains").upsert({
      TeamID: teamId, SeasonID: seasonId, CaptainPlayerID: selectedPlayer.PlayerID,
      MatchesPlayed: captain?.MatchesPlayed ?? null,
      CaptainAppearances: captain?.CaptainAppearances ?? null,
      AppearanceShare: captain?.AppearanceShare ?? null,
      SelectionMethod: captain?.SelectionMethod ?? "admin",
    }, { onConflict: "TeamID,SeasonID" });
    if (error) { setMsg("Error: " + error.message); return; }
    setMsg("Captain saved."); setTimeout(() => setMsg(""), 2500);
  }

  async function removeCaptain() {
    if (!teamId || !confirm("Remove this team's captain for this season?")) return;
    await supabase.from("team_captains").delete().eq("TeamID", teamId).eq("SeasonID", seasonId);
    setCaptain(null); setSelectedPlayer(null);
  }

  async function saveManagerAssignment(managerId: number) {
    if (!teamId) return;
    const { error } = await supabase.from("team_managers").upsert(
      { TeamID: teamId, SeasonID: seasonId, ManagerID: managerId },
      { onConflict: "TeamID,SeasonID" },
    );
    if (error) { setMsg("Error: " + error.message); return; }
    setMsg("Manager saved."); setTimeout(() => setMsg(""), 2500);
  }

  async function removeManager() {
    if (!teamId || !confirm("Remove this team's manager for this season?")) return;
    await supabase.from("team_managers").delete().eq("TeamID", teamId).eq("SeasonID", seasonId);
    setManager(null); setSelectedManager(null);
  }

  async function createManagerAndAssign() {
    if (!newManager.FirstName.trim() || !newManager.LastName.trim()) { setMsg("First and last name are required."); return; }
    const { data, error } = await supabase.from("managers").insert({
      FirstName: newManager.FirstName.trim(),
      LastName: newManager.LastName.trim(),
      Gender: newManager.Gender,
      DOB: newManager.DOB || null,
      NationalityID: newManager.NationalityID || null,
      FormerPlayerFlag: false,
    }).select("ManagerID, FirstName, LastName").single();
    if (error) { setMsg("Error: " + error.message); return; }
    setSelectedManager(data as any);
    await saveManagerAssignment((data as any).ManagerID);
    setShowNewManagerForm(false);
    setNewManager({ FirstName: "", LastName: "", Gender: "M", DOB: "", NationalityID: "" });
  }

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
        <div>
          <label className={labelClass}>Team</label>
          <select value={teamId} onChange={e => setTeamId(e.target.value ? Number(e.target.value) : "")} className={inputClass}>
            <option value="">Select a team…</option>
            <optgroup label="Club Teams">
              {clubTeams.map(t => <option key={t.TeamID} value={t.TeamID}>{t.FullName}</option>)}
            </optgroup>
            <optgroup label="International Teams">
              {intlTeams.map(t => <option key={t.TeamID} value={t.TeamID}>{t.FullName}</option>)}
            </optgroup>
          </select>
        </div>
        <div>
          <label className={labelClass}>Season (e.g. 2027 for 2026–27)</label>
          <input type="number" value={seasonId} onChange={e => setSeasonId(Number(e.target.value))} className={inputClass} />
        </div>
      </div>

      {msg && <p className="text-sm font-sans font-medium text-accent">{msg}</p>}

      {!teamId ? (
        <p className="text-sm text-muted-foreground font-sans italic">Pick a team and season to assign a captain or manager.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Captain */}
          <div className="border border-border rounded overflow-hidden">
            <div className="bg-table-header px-3 py-2">
              <h3 className="font-display text-sm font-bold text-table-header-foreground">Team Captain</h3>
            </div>
            <div className="bg-card p-4 space-y-3">
              {captainLoading ? (
                <p className="text-xs text-muted-foreground font-sans">Loading…</p>
              ) : (
                <>
                  <div className="text-sm font-sans">
                    Currently: {selectedPlayer ? <span className="font-semibold">{selectedPlayer.PlayerName}</span> : <span className="text-muted-foreground italic">none assigned</span>}
                  </div>
                  <div>
                    <label className={labelClass}>Search player</label>
                    <PlayerPicker placeholder="Search players by name…" onPick={p => setSelectedPlayer({ PlayerID: p.PlayerID, PlayerName: p.PlayerName })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>Selection method</label>
                      <input
                        value={captain?.SelectionMethod ?? ""}
                        onChange={e => setCaptain(c => ({ ...(c ?? { TeamID: teamId as number, SeasonID: seasonId, CaptainPlayerID: selectedPlayer?.PlayerID ?? 0, MatchesPlayed: null, CaptainAppearances: null, AppearanceShare: null, SelectionMethod: null }), SelectionMethod: e.target.value }))}
                        placeholder="e.g. appointed, vote, admin"
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={saveCaptain} disabled={!selectedPlayer} className={btnPrimary}>Save Captain</button>
                    {captain && <button onClick={removeCaptain} className={btnDanger}>Remove</button>}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Manager */}
          <div className="border border-border rounded overflow-hidden">
            <div className="bg-table-header px-3 py-2">
              <h3 className="font-display text-sm font-bold text-table-header-foreground">Team Manager</h3>
            </div>
            <div className="bg-card p-4 space-y-3">
              {managerLoading ? (
                <p className="text-xs text-muted-foreground font-sans">Loading…</p>
              ) : (
                <>
                  <div className="text-sm font-sans">
                    Currently: {selectedManager ? <span className="font-semibold">{selectedManager.FirstName} {selectedManager.LastName}</span> : <span className="text-muted-foreground italic">none assigned</span>}
                  </div>
                  <div>
                    <label className={labelClass}>Search existing manager</label>
                    <ManagerPicker placeholder="Search managers by name…" onPick={m => { setSelectedManager(m as any); saveManagerAssignment(m.ManagerID); }} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setShowNewManagerForm(v => !v)} className={btnSecondary}>
                      {showNewManagerForm ? "Cancel new manager" : "+ New manager"}
                    </button>
                    {manager && <button onClick={removeManager} className={btnDanger}>Remove</button>}
                  </div>

                  {showNewManagerForm && (
                    <div className="border border-border rounded p-3 space-y-2 bg-secondary/30">
                      <div className="grid grid-cols-2 gap-2">
                        <input placeholder="First name" value={newManager.FirstName} onChange={e => setNewManager(v => ({ ...v, FirstName: e.target.value }))} className={inputClass} />
                        <input placeholder="Last name" value={newManager.LastName} onChange={e => setNewManager(v => ({ ...v, LastName: e.target.value }))} className={inputClass} />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <select value={newManager.Gender} onChange={e => setNewManager(v => ({ ...v, Gender: e.target.value }))} className={inputClass}>
                          <option value="M">M</option>
                          <option value="F">F</option>
                        </select>
                        <input type="date" value={newManager.DOB} onChange={e => setNewManager(v => ({ ...v, DOB: e.target.value }))} className={inputClass} />
                        <select value={newManager.NationalityID} onChange={e => setNewManager(v => ({ ...v, NationalityID: e.target.value ? Number(e.target.value) : "" }))} className={inputClass}>
                          <option value="">Nationality…</option>
                          {nations.map(n => <option key={n.NationID} value={n.NationID}>{n.Nation}</option>)}
                        </select>
                      </div>
                      <button onClick={createManagerAndAssign} className={btnPrimary}>Create & Assign</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
