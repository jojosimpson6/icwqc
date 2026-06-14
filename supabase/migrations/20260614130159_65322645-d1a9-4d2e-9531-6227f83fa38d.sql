
CREATE INDEX IF NOT EXISTS matchdays_lookup_idx
  ON public.matchdays ("SeasonID", "LeagueID", "MatchdayWeek")
  INCLUDE ("Matchday");

CREATE INDEX IF NOT EXISTS matchdays_date_idx
  ON public.matchdays ("Matchday");
