
-- Helper: is a given (season, league, week) matchday in the past?
CREATE OR REPLACE FUNCTION public.match_week_is_past(_season int, _league int, _week int)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matchdays m
    WHERE m."SeasonID" = _season
      AND m."LeagueID" = _league
      AND m."MatchdayWeek" = _week
      AND m."Matchday" <= CURRENT_DATE
  )
$$;

-- ===== RLS on matchdays: hide future matchdays =====
DROP POLICY IF EXISTS "Public read access" ON public.matchdays;
CREATE POLICY "Public read past matchdays" ON public.matchdays
  FOR SELECT TO public
  USING ("Matchday" <= CURRENT_DATE);

-- ===== RLS on results: hide rows whose matchday is in the future =====
DROP POLICY IF EXISTS "Public read access" ON public.results;
CREATE POLICY "Public read past results" ON public.results
  FOR SELECT TO public
  USING (public.match_week_is_past("SeasonID", "LeagueID", "WeekID"));

-- ===== RLS on elo_history: hide future-dated elo rows =====
ALTER TABLE public.elo_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.elo_history TO anon, authenticated;
GRANT ALL ON public.elo_history TO service_role;
DROP POLICY IF EXISTS "Public read past elo" ON public.elo_history;
CREATE POLICY "Public read past elo" ON public.elo_history
  FOR SELECT TO public
  USING ("Matchday" <= CURRENT_DATE);

-- ===== Update refresh_elo_history to skip future matches =====
CREATE OR REPLACE FUNCTION public.refresh_elo_history()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    rec           RECORD;
    home_pre      double precision;
    away_pre      double precision;
    expected_home double precision;
    expected_away double precision;
    actual_home   double precision;
    actual_away   double precision;
    margin_mult   double precision;
    k             double precision;
    delta_home    double precision;
    delta_away    double precision;
BEGIN
    TRUNCATE public.elo_history;

    FOR rec IN
        SELECT DISTINCT ON (res."MatchID")
            res."MatchID",
            res."HomeTeamID",
            res."AwayTeamID",
            res."HomeTeamScore",
            res."AwayTeamScore",
            res."LeagueID",
            res."SeasonID",
            m."Matchday"::date AS "Matchday",
            CASE
                WHEN l."LeagueTier" = 0 THEN 60.0
                WHEN l."LeagueTier" = 1 THEN 40.0
                WHEN l."LeagueTier" = 2 THEN 20.0
                ELSE 30.0
            END AS k_base
        FROM results res
        JOIN matchdays m
            ON  res."WeekID"   = m."MatchdayWeek"
            AND res."SeasonID" = m."SeasonID"
            AND res."LeagueID" = m."LeagueID"
        JOIN leagues l
            ON  l."LeagueID"   = res."LeagueID"
            AND l."ValidToDt"  = '9999-12-31'::date
        WHERE m."Matchday" <= CURRENT_DATE
        ORDER BY res."MatchID", res."SeasonID", m."Matchday"
    LOOP
        SELECT COALESCE(
            (SELECT eh."PostElo" FROM public.elo_history eh
             WHERE  eh."TeamID" = rec."HomeTeamID"
             ORDER BY eh."MatchID" DESC LIMIT 1),
            5000.0
        ) INTO home_pre;

        SELECT COALESCE(
            (SELECT eh."PostElo" FROM public.elo_history eh
             WHERE  eh."TeamID" = rec."AwayTeamID"
             ORDER BY eh."MatchID" DESC LIMIT 1),
            5000.0
        ) INTO away_pre;

        expected_home := 1.0 / (1.0 + power(10.0, (away_pre - home_pre) / 400.0));
        expected_away := 1.0 - expected_home;

        IF rec."HomeTeamScore" > rec."AwayTeamScore" THEN
            actual_home := 1.0;  actual_away := 0.0;
        ELSIF rec."HomeTeamScore" = rec."AwayTeamScore" THEN
            actual_home := 0.5;  actual_away := 0.5;
        ELSE
            actual_home := 0.0;  actual_away := 1.0;
        END IF;

        margin_mult := CASE
            WHEN abs(rec."HomeTeamScore" - rec."AwayTeamScore") > 150 THEN 2.5
            WHEN abs(rec."HomeTeamScore" - rec."AwayTeamScore") > 100 THEN 1.5
            WHEN abs(rec."HomeTeamScore" - rec."AwayTeamScore") > 50  THEN 1.25
            WHEN abs(rec."HomeTeamScore" - rec."AwayTeamScore") > 25  THEN 1.1
            ELSE 1.0
        END;

        k := rec.k_base * margin_mult;
        delta_home := k * (actual_home - expected_home);
        delta_away := k * (actual_away - expected_away);

        INSERT INTO public.elo_history
            ("MatchID", "TeamID", "SeasonID", "Matchday",
             "PreElo", "ELoDelta", "PostElo")
        VALUES
            (rec."MatchID", rec."HomeTeamID", rec."SeasonID", rec."Matchday",
             home_pre, delta_home, home_pre + delta_home),
            (rec."MatchID", rec."AwayTeamID", rec."SeasonID", rec."Matchday",
             away_pre, delta_away, away_pre + delta_away);

    END LOOP;
END;
$function$;

-- Purge any elo_history rows already computed for future matches
DELETE FROM public.elo_history WHERE "Matchday" > CURRENT_DATE;
