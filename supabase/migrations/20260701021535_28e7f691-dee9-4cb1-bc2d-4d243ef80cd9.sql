CREATE OR REPLACE FUNCTION public.season_is_complete(_league int, _season int)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matchdays
    WHERE "LeagueID" = _league AND "SeasonID" = _season
  ) AND NOT EXISTS (
    SELECT 1 FROM public.matchdays
    WHERE "LeagueID" = _league AND "SeasonID" = _season AND "Matchday" > CURRENT_DATE
  )
$$;

DROP POLICY IF EXISTS "Public read access" ON public.awards;
CREATE POLICY "Public read access" ON public.awards
FOR SELECT USING (public.season_is_complete(leagueid, seasonid));