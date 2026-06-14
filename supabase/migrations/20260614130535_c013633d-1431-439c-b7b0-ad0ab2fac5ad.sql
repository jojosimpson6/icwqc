
CREATE INDEX IF NOT EXISTS results_home_team_idx ON public.results ("HomeTeamID");
CREATE INDEX IF NOT EXISTS results_away_team_idx ON public.results ("AwayTeamID");
CREATE INDEX IF NOT EXISTS results_snitch_caught_by_idx ON public.results ("SnitchCaughtBy");
CREATE INDEX IF NOT EXISTS results_week_season_league_idx ON public.results ("WeekID","SeasonID","LeagueID");
CREATE INDEX IF NOT EXISTS teams_fullname_idx ON public.teams ("FullName");
