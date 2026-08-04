-- 1. Enable RLS + public read on the three unprotected reference tables
ALTER TABLE public.managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_captains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_managers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.managers;
CREATE POLICY "Public read access" ON public.managers FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public read access" ON public.team_captains;
CREATE POLICY "Public read access" ON public.team_captains FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public read access" ON public.team_managers;
CREATE POLICY "Public read access" ON public.team_managers FOR SELECT USING (true);

-- 2. Remove blanket write privileges from anon/authenticated on read-only data
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['awards','elo_history','leagues','managers','matchdays','nations','players','results','team_captains','team_managers','teams'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['standings','stats','schedule','scheduled_matches','elo_new','elo_ratings','player_season_stats','player_season_minutes'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Editable content: writes gated by admin RLS policies
REVOKE ALL ON public.news_items FROM anon, authenticated;
GRANT SELECT ON public.news_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.news_items TO authenticated;
GRANT ALL ON public.news_items TO service_role;

REVOKE ALL ON public.site_content FROM anon, authenticated;
GRANT SELECT ON public.site_content TO anon;
GRANT SELECT, INSERT, UPDATE ON public.site_content TO authenticated;
GRANT ALL ON public.site_content TO service_role;

REVOKE ALL ON public.user_roles FROM anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- 3. Lock down privileged / schema-introspection functions
REVOKE ALL ON FUNCTION public.get_complete_schema() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_player_views() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_elo_history() FROM PUBLIC, anon, authenticated;

-- 4. Pin search_path on the remaining mutable function
ALTER FUNCTION public.refresh_elo_history() SET search_path = public;