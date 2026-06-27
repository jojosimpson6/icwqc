
CREATE OR REPLACE VIEW public.scheduled_matches
WITH (security_invoker = false) AS
WITH knockout AS (
  SELECT
    l."LeagueID",
    CASE
      WHEN l."LeagueID" = 19 THEN 7
      WHEN l."LeagueID" IN (11, 15, 16, 17, 18, 20) THEN 2
      ELSE NULL
    END AS knockout_start
  FROM public.leagues l
  WHERE l."ValidToDt" = '9999-12-31'::date
)
SELECT
  r."MatchID",
  r."SeasonID",
  r."LeagueID",
  r."WeekID",
  r."HomeTeamID",
  r."AwayTeamID",
  r."IsNeutralSite",
  m."Matchday"
FROM public.results r
JOIN public.matchdays m
  ON m."SeasonID" = r."SeasonID"
 AND m."LeagueID" = r."LeagueID"
 AND m."MatchdayWeek" = r."WeekID"
LEFT JOIN knockout k ON k."LeagueID" = r."LeagueID"
WHERE m."Matchday" > CURRENT_DATE
  AND (
    k.knockout_start IS NULL
    OR r."WeekID" < k.knockout_start
    OR NOT EXISTS (
      SELECT 1
      FROM public.matchdays m2
      WHERE m2."SeasonID" = r."SeasonID"
        AND m2."LeagueID" = r."LeagueID"
        AND m2."MatchdayWeek" < r."WeekID"
        AND m2."Matchday" > CURRENT_DATE
    )
  );

GRANT SELECT ON public.scheduled_matches TO anon, authenticated;
