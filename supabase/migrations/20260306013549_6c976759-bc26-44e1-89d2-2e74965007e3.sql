
CREATE OR REPLACE VIEW public.player_season_minutes AS
WITH appearances AS (
  SELECT r."SeasonID", r."LeagueID", r."SnitchCaughtTime",
    unnest(ARRAY[r."HomeChaser1ID", r."HomeChaser2ID", r."HomeChaser3ID",
                  r."HomeKeeperID", r."HomeSeekerID", r."HomeBeater1ID", r."HomeBeater2ID"]) AS player_id,
    r."HomeTeamID" AS team_id
  FROM results r
  UNION ALL
  SELECT r."SeasonID", r."LeagueID", r."SnitchCaughtTime",
    unnest(ARRAY[r."AwayChaser1ID", r."AwayChaser2ID", r."AwayChaser3ID",
                  r."AwayKeeperID", r."AwaySeekerID", r."AwayBeater1ID", r."AwayBeater2ID"]) AS player_id,
    r."AwayTeamID" AS team_id
  FROM results r
)
SELECT p."PlayerName", t."FullName", a."SeasonID", l."LeagueName",
  COALESCE(sum(a."SnitchCaughtTime"), 0)::integer AS "MinutesPlayed"
FROM appearances a
JOIN players p ON a.player_id = p."PlayerID"
LEFT JOIN teams t ON a.team_id = t."TeamID" AND t."ValidToDt" = '9999-12-31'::date
LEFT JOIN leagues l ON a."LeagueID" = l."LeagueID" AND l."ValidToDt" = '9999-12-31'::date
WHERE a.player_id IS NOT NULL
GROUP BY p."PlayerName", t."FullName", a."SeasonID", l."LeagueName";
