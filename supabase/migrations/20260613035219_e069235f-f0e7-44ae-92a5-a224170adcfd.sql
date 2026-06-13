
CREATE OR REPLACE FUNCTION public.match_week_is_past(_season int, _league int, _week int)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matchdays m
    WHERE m."SeasonID" = _season
      AND m."LeagueID" = _league
      AND m."MatchdayWeek" = _week
  )
$$;
