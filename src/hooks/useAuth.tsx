import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  favorite_team_id: number | null;
}

export type FavoriteType = "team" | "player";

export interface Favorite {
  id: string;
  entity_type: FavoriteType;
  entity_id: number;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  favorites: Favorite[];
  isAdmin: boolean;
  loading: boolean;
  favoriteTeamIds: number[];
  favoritePlayerIds: number[];
  isFavorite: (type: FavoriteType, id: number) => boolean;
  toggleFavorite: (type: FavoriteType, id: number) => Promise<void>;
  updateProfile: (patch: Partial<Omit<Profile, "id">>) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadUserData = useCallback(async (uid: string) => {
    const [{ data: prof }, { data: favs }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, display_name, avatar_url, favorite_team_id").eq("id", uid).maybeSingle(),
      supabase.from("user_favorites").select("id, entity_type, entity_id").eq("user_id", uid),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile((prof as Profile) ?? null);
    setFavorites(((favs || []) as any[]).map(f => ({ id: f.id, entity_type: f.entity_type, entity_id: f.entity_id })));
    setIsAdmin(!!roles?.some((r: any) => r.role === "admin"));
  }, []);

  useEffect(() => {
    // Register the listener BEFORE fetching the existing session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => { loadUserData(s.user.id); }, 0);
      } else {
        setProfile(null);
        setFavorites([]);
        setIsAdmin(false);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) loadUserData(data.session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [loadUserData]);

  const favoriteTeamIds = useMemo(
    () => favorites.filter(f => f.entity_type === "team").map(f => f.entity_id),
    [favorites],
  );
  const favoritePlayerIds = useMemo(
    () => favorites.filter(f => f.entity_type === "player").map(f => f.entity_id),
    [favorites],
  );

  const isFavorite = useCallback(
    (type: FavoriteType, id: number) => favorites.some(f => f.entity_type === type && f.entity_id === id),
    [favorites],
  );

  const toggleFavorite = useCallback(async (type: FavoriteType, id: number) => {
    if (!user) return;
    const existing = favorites.find(f => f.entity_type === type && f.entity_id === id);
    if (existing) {
      setFavorites(prev => prev.filter(f => f.id !== existing.id));
      await supabase.from("user_favorites").delete().eq("id", existing.id);
    } else {
      const { data } = await supabase
        .from("user_favorites")
        .insert({ user_id: user.id, entity_type: type, entity_id: id })
        .select("id, entity_type, entity_id")
        .single();
      if (data) setFavorites(prev => [...prev, data as Favorite]);
    }
  }, [user, favorites]);

  const updateProfile = useCallback(async (patch: Partial<Omit<Profile, "id">>) => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", user.id)
      .select("id, display_name, avatar_url, favorite_team_id")
      .maybeSingle();
    if (data) setProfile(data as Profile);
  }, [user]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setFavorites([]);
    setIsAdmin(false);
  }, []);

  const refresh = useCallback(async () => {
    if (user) await loadUserData(user.id);
  }, [user, loadUserData]);

  const value: AuthContextValue = {
    session, user, profile, favorites, isAdmin, loading,
    favoriteTeamIds, favoritePlayerIds,
    isFavorite, toggleFavorite, updateProfile, signOut, refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
