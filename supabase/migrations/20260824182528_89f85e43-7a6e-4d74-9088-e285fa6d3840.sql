-- 1. Profiles: remove public (anonymous) readability
DROP POLICY IF EXISTS "Profiles are publicly readable" ON public.profiles;
CREATE POLICY "Authenticated users can read profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.profiles FROM anon;

-- 2. Move materialized views out of the API-exposed schema
CREATE SCHEMA IF NOT EXISTS internal;
REVOKE ALL ON SCHEMA internal FROM anon, authenticated;
GRANT USAGE ON SCHEMA internal TO anon, authenticated, service_role;

ALTER MATERIALIZED VIEW public.player_season_stats SET SCHEMA internal;
ALTER MATERIALIZED VIEW public.player_season_minutes SET SCHEMA internal;

GRANT SELECT ON internal.player_season_stats TO anon, authenticated, service_role;
GRANT SELECT ON internal.player_season_minutes TO anon, authenticated, service_role;

CREATE VIEW public.player_season_stats WITH (security_invoker = true) AS
  SELECT * FROM internal.player_season_stats;
CREATE VIEW public.player_season_minutes WITH (security_invoker = true) AS
  SELECT * FROM internal.player_season_minutes;

GRANT SELECT ON public.player_season_stats TO anon, authenticated, service_role;
GRANT SELECT ON public.player_season_minutes TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refresh_player_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY internal.player_season_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY internal.player_season_minutes;
END;
$$;

-- 3. Standings view: enforce the querying user's RLS (score-release gating)
ALTER VIEW public.standings SET (security_invoker = true);

-- 4. Restrict internal / maintenance functions from API roles
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_refresh_player_and_elo_views() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_player_views() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_elo_history() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_complete_schema() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.match_release_date(date, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.match_week_is_past(integer, integer, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fantasy_team_owner(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fantasy_team_league(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_fantasy_member(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.match_is_released(integer) FROM anon, authenticated;

-- 5. Storage: lock down objects in the private buckets to admins
CREATE POLICY "Admins read private media"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('logo_url', 'headshot_url') AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins upload private media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('logo_url', 'headshot_url') AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update private media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('logo_url', 'headshot_url') AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id IN ('logo_url', 'headshot_url') AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete private media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('logo_url', 'headshot_url') AND public.has_role(auth.uid(), 'admin'));

-- 6. Server-side length validation for admin-authored content
ALTER TABLE public.news_items
  ADD CONSTRAINT news_items_title_length CHECK (char_length(title) BETWEEN 1 AND 200),
  ADD CONSTRAINT news_items_body_length CHECK (char_length(body) BETWEEN 1 AND 20000),
  ADD CONSTRAINT news_items_author_length CHECK (author IS NULL OR char_length(author) <= 100);

ALTER TABLE public.site_content
  ADD CONSTRAINT site_content_title_length CHECK (title IS NULL OR char_length(title) <= 200),
  ADD CONSTRAINT site_content_content_length CHECK (char_length(content) <= 200000);