-- 1. Revert standings to its previous (owner-permission) evaluation: the view
-- itself already filters to released results, and per-row RLS made it time out.
ALTER VIEW public.standings SET (security_invoker = false);

-- 2. Schedules (dates/fixtures) are public by design; only scores are delayed.
DROP POLICY IF EXISTS "Public read past matchdays" ON public.matchdays;
CREATE POLICY "Public read matchdays" ON public.matchdays FOR SELECT USING (true);

-- 3. Remove default PUBLIC execute on every public function, then grant back
-- only what RLS policies and the app actually require.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_refresh_player_and_elo_views() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_player_views() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_elo_history() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_complete_schema() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.match_release_date(date, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.match_week_is_past(integer, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_fantasy_member(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fantasy_team_owner(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fantasy_team_league(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.season_is_complete(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.match_is_released(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.match_result_released(integer, integer, integer, integer) FROM PUBLIC;

-- Required by RLS policies evaluated for anonymous readers
GRANT EXECUTE ON FUNCTION public.season_is_complete(integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_is_released(integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_result_released(integer, integer, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_release_date(date, integer) TO anon, authenticated, service_role;

-- Required only for signed-in users (roles, fantasy membership checks)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_fantasy_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fantasy_team_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fantasy_team_league(uuid) TO authenticated, service_role;

-- Maintenance helpers: service_role only
GRANT EXECUTE ON FUNCTION public.refresh_player_views() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_elo_history() TO service_role;