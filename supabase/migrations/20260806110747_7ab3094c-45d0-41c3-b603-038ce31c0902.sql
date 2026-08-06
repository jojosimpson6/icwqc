-- ============ 1. DELAYED SCORE REPORTING ============

CREATE OR REPLACE FUNCTION public.match_release_date(_matchday date, _snitch integer)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT _matchday + 1 + floor(COALESCE(_snitch, 0) / 720.0)::int
$$;

CREATE OR REPLACE FUNCTION public.match_result_released(_season integer, _league integer, _week integer, _snitch integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR EXISTS (
    SELECT 1 FROM public.matchdays m
    WHERE m."SeasonID" = _season
      AND m."LeagueID" = _league
      AND m."MatchdayWeek" = _week
      AND public.match_release_date(m."Matchday", _snitch) <= CURRENT_DATE
  )
$$;

CREATE OR REPLACE FUNCTION public.match_is_released(_matchid integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR EXISTS (
    SELECT 1
    FROM public.results r
    JOIN public.matchdays m
      ON m."SeasonID" = r."SeasonID"
     AND m."LeagueID" = r."LeagueID"
     AND m."MatchdayWeek" = r."WeekID"
    WHERE r."MatchID" = _matchid
      AND public.match_release_date(m."Matchday", r."SnitchCaughtTime") <= CURRENT_DATE
  )
$$;

DROP POLICY IF EXISTS "Public read past results" ON public.results;
CREATE POLICY "Public read released results"
ON public.results FOR SELECT
USING (public.match_result_released("SeasonID", "LeagueID", "WeekID", "SnitchCaughtTime"));

DROP POLICY IF EXISTS "Public read past elo" ON public.elo_history;
CREATE POLICY "Public read released elo"
ON public.elo_history FOR SELECT
USING (
  "Matchday" <= CURRENT_DATE
  AND (
    "Matchday" <= CURRENT_DATE - 30
    OR public.match_is_released("MatchID")
  )
);

-- Surface not-yet-released matches as "in progress" fixtures
CREATE OR REPLACE VIEW public.scheduled_matches AS
WITH knockout AS (
  SELECT l."LeagueID",
    CASE
      WHEN l."LeagueID" = 19 THEN 7
      WHEN l."LeagueID" = ANY (ARRAY[11, 15, 16, 17, 18, 20]) THEN 2
      ELSE NULL::integer
    END AS knockout_start
  FROM leagues l
  WHERE l."ValidToDt" = '9999-12-31'::date
), base AS (
  SELECT r."MatchID",
    r."SeasonID",
    r."LeagueID",
    r."WeekID",
    r."HomeTeamID",
    r."AwayTeamID",
    r."IsNeutralSite",
    m."Matchday",
    public.match_release_date(m."Matchday", r."SnitchCaughtTime") AS release_date,
    k.knockout_start IS NULL OR r."WeekID" < k.knockout_start OR NOT (EXISTS (
      SELECT 1 FROM matchdays m2
      WHERE m2."SeasonID" = r."SeasonID" AND m2."LeagueID" = r."LeagueID"
        AND m2."MatchdayWeek" < r."WeekID" AND m2."Matchday" > CURRENT_DATE)) AS teams_determined
  FROM results r
    JOIN matchdays m ON m."SeasonID" = r."SeasonID" AND m."LeagueID" = r."LeagueID" AND m."MatchdayWeek" = r."WeekID"
    LEFT JOIN knockout k ON k."LeagueID" = r."LeagueID"
  WHERE public.match_release_date(m."Matchday", r."SnitchCaughtTime") > CURRENT_DATE
)
SELECT "MatchID",
  "SeasonID",
  "LeagueID",
  "WeekID",
  CASE WHEN teams_determined THEN "HomeTeamID" ELSE NULL::integer END AS "HomeTeamID",
  CASE WHEN teams_determined THEN "AwayTeamID" ELSE NULL::integer END AS "AwayTeamID",
  "IsNeutralSite",
  "Matchday",
  teams_determined AS "TeamsDetermined",
  CASE WHEN "Matchday" > CURRENT_DATE THEN 'scheduled' ELSE 'in_progress' END AS "Status",
  release_date AS "ReleaseDate"
FROM base;

GRANT SELECT ON public.scheduled_matches TO anon, authenticated;
GRANT ALL ON public.scheduled_matches TO service_role;

-- ============ 2. END-USER ACCOUNTS ============

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  favorite_team_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are publicly readable" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.user_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('team', 'player')),
  entity_id integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, entity_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_favorites TO authenticated;
GRANT ALL ON public.user_favorites TO service_role;
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own favorites" ON public.user_favorites FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ 3. FANTASY FRAMEWORK ============

CREATE TABLE IF NOT EXISTS public.fantasy_leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season_id integer,
  source_league_id integer,
  is_public boolean NOT NULL DEFAULT false,
  invite_code text NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
  max_teams integer NOT NULL DEFAULT 10,
  roster_size integer NOT NULL DEFAULT 7,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invite_code)
);

CREATE TABLE IF NOT EXISTS public.fantasy_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_league_id uuid NOT NULL REFERENCES public.fantasy_leagues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fantasy_league_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.fantasy_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_team_id uuid NOT NULL REFERENCES public.fantasy_teams(id) ON DELETE CASCADE,
  player_id integer NOT NULL,
  slot text NOT NULL DEFAULT 'bench',
  is_starter boolean NOT NULL DEFAULT false,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fantasy_team_id, player_id)
);

CREATE TABLE IF NOT EXISTS public.fantasy_scoring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_league_id uuid NOT NULL REFERENCES public.fantasy_leagues(id) ON DELETE CASCADE,
  stat_key text NOT NULL,
  points numeric NOT NULL DEFAULT 0,
  UNIQUE (fantasy_league_id, stat_key)
);

CREATE OR REPLACE FUNCTION public.is_fantasy_member(_league uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fantasy_leagues fl
    WHERE fl.id = _league AND (fl.owner_id = _user OR fl.is_public)
  ) OR EXISTS (
    SELECT 1 FROM public.fantasy_teams ft
    WHERE ft.fantasy_league_id = _league AND ft.user_id = _user
  )
$$;

CREATE OR REPLACE FUNCTION public.fantasy_team_owner(_team uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT user_id FROM public.fantasy_teams WHERE id = _team
$$;

CREATE OR REPLACE FUNCTION public.fantasy_team_league(_team uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT fantasy_league_id FROM public.fantasy_teams WHERE id = _team
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_leagues TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_rosters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_scoring_rules TO authenticated;
GRANT ALL ON public.fantasy_leagues, public.fantasy_teams, public.fantasy_rosters, public.fantasy_scoring_rules TO service_role;

ALTER TABLE public.fantasy_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_scoring_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read fantasy leagues" ON public.fantasy_leagues FOR SELECT TO authenticated
  USING (is_public OR owner_id = auth.uid() OR public.is_fantasy_member(id, auth.uid()));
CREATE POLICY "Users create fantasy leagues" ON public.fantasy_leagues FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners update fantasy leagues" ON public.fantasy_leagues FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners delete fantasy leagues" ON public.fantasy_leagues FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Members read fantasy teams" ON public.fantasy_teams FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_fantasy_member(fantasy_league_id, auth.uid()));
CREATE POLICY "Users create their fantasy team" ON public.fantasy_teams FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_fantasy_member(fantasy_league_id, auth.uid()));
CREATE POLICY "Users update their fantasy team" ON public.fantasy_teams FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete their fantasy team" ON public.fantasy_teams FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Members read rosters" ON public.fantasy_rosters FOR SELECT TO authenticated
  USING (public.fantasy_team_owner(fantasy_team_id) = auth.uid()
         OR public.is_fantasy_member(public.fantasy_team_league(fantasy_team_id), auth.uid()));
CREATE POLICY "Owners manage their roster" ON public.fantasy_rosters FOR INSERT TO authenticated
  WITH CHECK (public.fantasy_team_owner(fantasy_team_id) = auth.uid());
CREATE POLICY "Owners update their roster" ON public.fantasy_rosters FOR UPDATE TO authenticated
  USING (public.fantasy_team_owner(fantasy_team_id) = auth.uid())
  WITH CHECK (public.fantasy_team_owner(fantasy_team_id) = auth.uid());
CREATE POLICY "Owners delete from their roster" ON public.fantasy_rosters FOR DELETE TO authenticated
  USING (public.fantasy_team_owner(fantasy_team_id) = auth.uid());

CREATE POLICY "Members read scoring rules" ON public.fantasy_scoring_rules FOR SELECT TO authenticated
  USING (public.is_fantasy_member(fantasy_league_id, auth.uid()));
CREATE POLICY "Owners manage scoring rules" ON public.fantasy_scoring_rules FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fantasy_leagues fl WHERE fl.id = fantasy_league_id AND fl.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fantasy_leagues fl WHERE fl.id = fantasy_league_id AND fl.owner_id = auth.uid()));

CREATE TRIGGER update_fantasy_leagues_updated_at BEFORE UPDATE ON public.fantasy_leagues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_fantasy_teams_updated_at BEFORE UPDATE ON public.fantasy_teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();