
-- Optimize player_season_minutes: convert from regular view to materialized view, drop ORDER BY
DROP VIEW IF EXISTS public.player_season_minutes;

CREATE MATERIALIZED VIEW public.player_season_minutes AS
WITH appearance_rows AS (
  SELECT r."SeasonID", r."LeagueID", r."SnitchCaughtTime", s.player_id, s.team_id
  FROM results r
  CROSS JOIN LATERAL (VALUES
    (r."HomeChaser1ID", r."HomeTeamID"), (r."HomeChaser2ID", r."HomeTeamID"),
    (r."HomeChaser3ID", r."HomeTeamID"), (r."HomeKeeperID", r."HomeTeamID"),
    (r."HomeSeekerID",  r."HomeTeamID"), (r."HomeBeater1ID", r."HomeTeamID"),
    (r."HomeBeater2ID", r."HomeTeamID"), (r."AwayChaser1ID", r."AwayTeamID"),
    (r."AwayChaser2ID", r."AwayTeamID"), (r."AwayChaser3ID", r."AwayTeamID"),
    (r."AwayKeeperID",  r."AwayTeamID"), (r."AwaySeekerID",  r."AwayTeamID"),
    (r."AwayBeater1ID", r."AwayTeamID"), (r."AwayBeater2ID", r."AwayTeamID")
  ) s(player_id, team_id)
  WHERE s.player_id IS NOT NULL AND s.player_id <> 0
), aggregated AS (
  SELECT ar.player_id, ar.team_id, ar."SeasonID", ar."LeagueID",
         COALESCE(sum(ar."SnitchCaughtTime"), 0::bigint)::integer AS "MinutesPlayed"
  FROM appearance_rows ar
  GROUP BY ar.player_id, ar.team_id, ar."SeasonID", ar."LeagueID"
)
SELECT p."PlayerName", t."FullName", a."SeasonID", l."LeagueName", a."MinutesPlayed",
       a.player_id AS "PlayerID", a.team_id AS "TeamID", a."LeagueID"
FROM aggregated a
JOIN players p ON a.player_id = p."PlayerID"
LEFT JOIN teams   t ON a.team_id   = t."TeamID"   AND t."ValidToDt" = '9999-12-31'::date
LEFT JOIN leagues l ON a."LeagueID"= l."LeagueID" AND l."ValidToDt" = '9999-12-31'::date;

-- Indexes for player_season_minutes
CREATE UNIQUE INDEX player_season_minutes_uk
  ON public.player_season_minutes ("PlayerID", "TeamID", "SeasonID", "LeagueID");
CREATE INDEX player_season_minutes_season_idx
  ON public.player_season_minutes ("SeasonID");
CREATE INDEX player_season_minutes_player_idx
  ON public.player_season_minutes ("PlayerID");
CREATE INDEX player_season_minutes_playername_idx
  ON public.player_season_minutes ("PlayerName");

-- Indexes for player_season_stats (existing materialized view)
CREATE INDEX IF NOT EXISTS player_season_stats_player_idx
  ON public.player_season_stats ("PlayerID");
CREATE INDEX IF NOT EXISTS player_season_stats_season_idx
  ON public.player_season_stats ("SeasonID");
CREATE INDEX IF NOT EXISTS player_season_stats_team_idx
  ON public.player_season_stats ("TeamID");
CREATE INDEX IF NOT EXISTS player_season_stats_league_idx
  ON public.player_season_stats ("LeagueID");
CREATE INDEX IF NOT EXISTS player_season_stats_leaguename_idx
  ON public.player_season_stats ("LeagueName");
CREATE INDEX IF NOT EXISTS player_season_stats_playername_idx
  ON public.player_season_stats ("PlayerName");
CREATE INDEX IF NOT EXISTS player_season_stats_season_pos_idx
  ON public.player_season_stats ("SeasonID", "Position");

-- Helper to refresh both materialized views concurrently (requires unique indexes)
CREATE OR REPLACE FUNCTION public.refresh_player_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.player_season_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.player_season_minutes;
END;
$$;

-- Grant read access
GRANT SELECT ON public.player_season_minutes TO anon, authenticated;
