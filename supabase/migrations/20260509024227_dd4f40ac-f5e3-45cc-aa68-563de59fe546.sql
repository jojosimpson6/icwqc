
-- Helper: latest team record per TeamID (replaces the broken ValidToDt='9999-12-31' filter)
DROP MATERIALIZED VIEW IF EXISTS public.player_season_minutes;
DROP MATERIALIZED VIEW IF EXISTS public.player_season_stats;

CREATE MATERIALIZED VIEW public.player_season_stats AS
WITH slot_rows AS (
  SELECT r."MatchID", r."SeasonID", r."LeagueID", r."HomeTeamID", r."AwayTeamID", r."SnitchCaughtBy",
         s."PlayerID", s."TeamID", s."Position", s."Goals", s."PassAtt", s."PassComp",
         s."ShotAtt", s."ShotScored", s."ChaserMinPlayed",
         s."KeeperShotsSaved", s."KeeperShotsSaved_Legacy", s."KeeperShotsParried", s."KeeperShotsConceded",
         s."KeeperShotsFaced", s."KeeperShotsFaced_Legacy", s."KeeperPassAtt", s."KeeperPassComp", s."KeeperMinPlayed",
         s."SeekerMinPlayed", s."SnitchSpotted", s."CatchAttempts", s."IsHomeSide",
         s."BludgersHit", s."TurnoversForced", s."TeammatesProtected", s."BeaterMinPlayed", s."BludgerShotsFaced"
  FROM results r
  CROSS JOIN LATERAL (VALUES
    (r."HomeChaser1ID",r."HomeTeamID",'Chaser'::text,r."HomeChaser1Goals",r."HomeChaser1PassAtt",r."HomeChaser1PassComp",r."HomeChaser1ShotAtt",r."HomeChaser1ShotScored",r."HomeChaser1MinPlayed",0,0,0,0,0,0,0,0,0,0,0,0,true,0,0,0,0,0),
    (r."HomeChaser2ID",r."HomeTeamID",'Chaser'::text,r."HomeChaser2Goals",r."HomeChaser2PassAtt",r."HomeChaser2PassComp",r."HomeChaser2ShotAtt",r."HomeChaser2ShotScored",r."HomeChaser2MinPlayed",0,0,0,0,0,0,0,0,0,0,0,0,true,0,0,0,0,0),
    (r."HomeChaser3ID",r."HomeTeamID",'Chaser'::text,r."HomeChaser3Goals",r."HomeChaser3PassAtt",r."HomeChaser3PassComp",r."HomeChaser3ShotAtt",r."HomeChaser3ShotScored",r."HomeChaser3MinPlayed",0,0,0,0,0,0,0,0,0,0,0,0,true,0,0,0,0,0),
    (r."AwayChaser1ID",r."AwayTeamID",'Chaser'::text,r."AwayChaser1Goals",r."AwayChaser1PassAtt",r."AwayChaser1PassComp",r."AwayChaser1ShotAtt",r."AwayChaser1ShotScored",r."AwayChaser1MinPlayed",0,0,0,0,0,0,0,0,0,0,0,0,false,0,0,0,0,0),
    (r."AwayChaser2ID",r."AwayTeamID",'Chaser'::text,r."AwayChaser2Goals",r."AwayChaser2PassAtt",r."AwayChaser2PassComp",r."AwayChaser2ShotAtt",r."AwayChaser2ShotScored",r."AwayChaser2MinPlayed",0,0,0,0,0,0,0,0,0,0,0,0,false,0,0,0,0,0),
    (r."AwayChaser3ID",r."AwayTeamID",'Chaser'::text,r."AwayChaser3Goals",r."AwayChaser3PassAtt",r."AwayChaser3PassComp",r."AwayChaser3ShotAtt",r."AwayChaser3ShotScored",r."AwayChaser3MinPlayed",0,0,0,0,0,0,0,0,0,0,0,0,false,0,0,0,0,0),
    (r."HomeKeeperID",r."HomeTeamID",'Keeper'::text,0,0,0,0,0,0,r."HomeKeeperShotsSaved",r."HomeKeeperSaves",r."HomeKeeperShotsParried",r."HomeKeeperShotsConceded",r."HomeKeeperShotsFaced2",r."HomeKeeperShotsFaced",r."HomeKeeperPassAtt",r."HomeKeeperPassComp",r."HomeKeeperMinPlayed",0,0,0,true,0,0,0,0,0),
    (r."AwayKeeperID",r."AwayTeamID",'Keeper'::text,0,0,0,0,0,0,r."AwayKeeperShotsSaved",r."AwayKeeperSaves",r."AwayKeeperShotsParried",r."AwayKeeperShotsConceded",r."AwayKeeperShotsFaced2",r."AwayKeeperShotsFaced",r."AwayKeeperPassAtt",r."AwayKeeperPassComp",r."AwayKeeperMinPlayed",0,0,0,false,0,0,0,0,0),
    (r."HomeSeekerID",r."HomeTeamID",'Seeker'::text,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,r."HomeSeekerMinPlayed",r."HomeSeekerSnitchSpotted",r."HomeSeekerCatchAttempts",true,0,0,0,0,0),
    (r."AwaySeekerID",r."AwayTeamID",'Seeker'::text,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,r."AwaySeekerMinPlayed",r."AwaySeekerSnitchSpotted",r."AwaySeekerCatchAttempts",false,0,0,0,0,0),
    (r."HomeBeater1ID",r."HomeTeamID",'Beater'::text,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,true,r."HomeBeater1BludgersHit",r."HomeBeater1TurnoversForced",r."HomeBeater1TeammatesProtected",r."HomeBeater1MinPlayed",r."HomeBeater1BludgerShotsFaced"),
    (r."HomeBeater2ID",r."HomeTeamID",'Beater'::text,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,true,r."HomeBeater2BludgersHit",r."HomeBeater2TurnoversForced",r."HomeBeater2TeammatesProtected",r."HomeBeater2MinPlayed",r."HomeBeater2BludgerShotsFaced"),
    (r."AwayBeater1ID",r."AwayTeamID",'Beater'::text,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,false,r."AwayBeater1BludgersHit",r."AwayBeater1TurnoversForced",r."AwayBeater1TeammatesProtected",r."AwayBeater1MinPlayed",r."AwayBeater1BludgerShotsFaced"),
    (r."AwayBeater2ID",r."AwayTeamID",'Beater'::text,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,false,r."AwayBeater2BludgersHit",r."AwayBeater2TurnoversForced",r."AwayBeater2TeammatesProtected",r."AwayBeater2MinPlayed",r."AwayBeater2BludgerShotsFaced")
  ) s("PlayerID","TeamID","Position","Goals","PassAtt","PassComp","ShotAtt","ShotScored","ChaserMinPlayed","KeeperShotsSaved","KeeperShotsSaved_Legacy","KeeperShotsParried","KeeperShotsConceded","KeeperShotsFaced","KeeperShotsFaced_Legacy","KeeperPassAtt","KeeperPassComp","KeeperMinPlayed","SeekerMinPlayed","SnitchSpotted","CatchAttempts","IsHomeSide","BludgersHit","TurnoversForced","TeammatesProtected","BeaterMinPlayed","BludgerShotsFaced")
  WHERE s."PlayerID" IS NOT NULL AND s."PlayerID" <> 0
), aggregated AS (
  SELECT sr."PlayerID", sr."TeamID", sr."SeasonID", sr."LeagueID", sr."Position",
    count(*)::integer AS "GamesPlayed",
    sum(CASE sr."Position" WHEN 'Chaser' THEN sr."ChaserMinPlayed" WHEN 'Keeper' THEN sr."KeeperMinPlayed" WHEN 'Seeker' THEN sr."SeekerMinPlayed" WHEN 'Beater' THEN sr."BeaterMinPlayed" ELSE 0 END)::integer AS "MinPlayed",
    sum(sr."Goals")::integer AS "Goals",
    sum(sr."ShotAtt")::integer AS "ShotAtt",
    sum(sr."ShotScored")::integer AS "ShotScored",
    sum(sr."PassAtt")::integer AS "PassAtt",
    sum(sr."PassComp")::integer AS "PassComp",
    sum(sr."KeeperShotsSaved") AS ks_saved,
    sum(sr."KeeperShotsSaved_Legacy") AS ks_saved_legacy,
    sum(sr."KeeperShotsParried")::integer AS "KeeperShotsParried",
    sum(sr."KeeperShotsConceded")::integer AS "KeeperShotsConceded",
    sum(sr."KeeperShotsFaced") AS ks_faced,
    sum(sr."KeeperShotsFaced_Legacy") AS ks_faced_legacy,
    sum(sr."KeeperPassAtt")::integer AS "KeeperPassAtt",
    sum(sr."KeeperPassComp")::integer AS "KeeperPassComp",
    sum(sr."SnitchSpotted")::integer AS "SnitchSpotted",
    sum(sr."CatchAttempts")::integer AS "CatchAttempts",
    sum(CASE WHEN sr."Position"='Seeker' AND sr."IsHomeSide"=true  AND sr."SnitchCaughtBy"=sr."HomeTeamID" THEN 1
             WHEN sr."Position"='Seeker' AND sr."IsHomeSide"=false AND sr."SnitchCaughtBy"=sr."AwayTeamID" THEN 1
             ELSE 0 END)::integer AS "GoldenSnitchCatches",
    sum(sr."BludgersHit")::integer AS "BludgersHit",
    sum(sr."TurnoversForced")::integer AS "TurnoversForced",
    sum(sr."TeammatesProtected")::integer AS "TeammatesProtected",
    sum(sr."BludgerShotsFaced")::integer AS "BludgerShotsFaced"
  FROM slot_rows sr
  GROUP BY sr."PlayerID", sr."TeamID", sr."SeasonID", sr."LeagueID", sr."Position"
), latest_team AS (
  SELECT DISTINCT ON ("TeamID") "TeamID", "FullName"
  FROM teams
  ORDER BY "TeamID", "ValidFromDt" DESC, "ValidToDt" DESC
), latest_nation AS (
  SELECT DISTINCT ON ("NationID") "NationID", "Nation"
  FROM nations
  ORDER BY "NationID", "ValidFromDt" DESC, "ValidToDt" DESC
)
SELECT a."PlayerID", p."PlayerName", a."Position", n."Nation",
  t."FullName" AS "TeamFullName", a."TeamID", a."SeasonID", a."LeagueID", l."LeagueName",
  a."GamesPlayed", a."MinPlayed", a."Goals", a."ShotAtt", a."ShotScored", a."PassAtt", a."PassComp",
  CASE WHEN a."PassAtt">0 THEN round(a."PassComp"::numeric/a."PassAtt"::numeric*100,1) END AS "PassCompPct",
  CASE WHEN a."ShotAtt">0 THEN round(a."ShotScored"::numeric/a."ShotAtt"::numeric*100,1) END AS "ShotAccPct",
  (CASE WHEN a.ks_saved=0 AND a.ks_saved_legacy>0 THEN a.ks_saved_legacy ELSE a.ks_saved END)::integer AS "KeeperSaves",
  a."KeeperShotsParried", a."KeeperShotsConceded",
  (CASE WHEN a.ks_faced=0 AND a.ks_faced_legacy>0 THEN a.ks_faced_legacy ELSE a.ks_faced END)::integer AS "KeeperShotsFaced",
  CASE WHEN GREATEST(a.ks_faced,a.ks_faced_legacy)>0 THEN round(COALESCE(NULLIF(a.ks_saved,0),a.ks_saved_legacy)::numeric/GREATEST(a.ks_faced,a.ks_faced_legacy)::numeric*100,1) END AS "SavePct",
  a."KeeperPassAtt", a."KeeperPassComp",
  CASE WHEN a."KeeperPassAtt">0 THEN round(a."KeeperPassComp"::numeric/a."KeeperPassAtt"::numeric*100,1) END AS "KeeperPassCompPct",
  a."GoldenSnitchCatches", a."SnitchSpotted", a."CatchAttempts",
  CASE WHEN a."GamesPlayed">0 THEN round(a."GoldenSnitchCatches"::numeric/a."GamesPlayed"::numeric*100,1) END AS "CatchRatePct",
  a."BludgersHit", a."TurnoversForced", a."TeammatesProtected", a."BludgerShotsFaced"
FROM aggregated a
LEFT JOIN players p     ON a."PlayerID" = p."PlayerID"
LEFT JOIN latest_nation n ON p."NationalityID" = n."NationID"
LEFT JOIN latest_team t   ON a."TeamID" = t."TeamID"
LEFT JOIN leagues l       ON a."LeagueID" = l."LeagueID" AND l."ValidToDt"='9999-12-31'::date;

CREATE INDEX player_season_stats_player_idx     ON public.player_season_stats ("PlayerID");
CREATE INDEX player_season_stats_season_idx     ON public.player_season_stats ("SeasonID");
CREATE INDEX player_season_stats_team_idx       ON public.player_season_stats ("TeamID");
CREATE INDEX player_season_stats_league_idx     ON public.player_season_stats ("LeagueID");
CREATE INDEX player_season_stats_leaguename_idx ON public.player_season_stats ("LeagueName");
CREATE INDEX player_season_stats_playername_idx ON public.player_season_stats ("PlayerName");
CREATE INDEX player_season_stats_season_pos_idx ON public.player_season_stats ("SeasonID","Position");

CREATE MATERIALIZED VIEW public.player_season_minutes AS
WITH appearance_rows AS (
  SELECT r."SeasonID", r."LeagueID", r."SnitchCaughtTime", s.player_id, s.team_id
  FROM results r
  CROSS JOIN LATERAL (VALUES
    (r."HomeChaser1ID",r."HomeTeamID"),(r."HomeChaser2ID",r."HomeTeamID"),(r."HomeChaser3ID",r."HomeTeamID"),
    (r."HomeKeeperID",r."HomeTeamID"),(r."HomeSeekerID",r."HomeTeamID"),
    (r."HomeBeater1ID",r."HomeTeamID"),(r."HomeBeater2ID",r."HomeTeamID"),
    (r."AwayChaser1ID",r."AwayTeamID"),(r."AwayChaser2ID",r."AwayTeamID"),(r."AwayChaser3ID",r."AwayTeamID"),
    (r."AwayKeeperID",r."AwayTeamID"),(r."AwaySeekerID",r."AwayTeamID"),
    (r."AwayBeater1ID",r."AwayTeamID"),(r."AwayBeater2ID",r."AwayTeamID")
  ) s(player_id, team_id)
  WHERE s.player_id IS NOT NULL AND s.player_id <> 0
), aggregated AS (
  SELECT ar.player_id, ar.team_id, ar."SeasonID", ar."LeagueID",
         COALESCE(sum(ar."SnitchCaughtTime"),0::bigint)::integer AS "MinutesPlayed"
  FROM appearance_rows ar
  GROUP BY ar.player_id, ar.team_id, ar."SeasonID", ar."LeagueID"
), latest_team AS (
  SELECT DISTINCT ON ("TeamID") "TeamID", "FullName"
  FROM teams ORDER BY "TeamID", "ValidFromDt" DESC, "ValidToDt" DESC
)
SELECT p."PlayerName", t."FullName", a."SeasonID", l."LeagueName", a."MinutesPlayed",
       a.player_id AS "PlayerID", a.team_id AS "TeamID", a."LeagueID"
FROM aggregated a
JOIN players p ON a.player_id = p."PlayerID"
LEFT JOIN latest_team t ON a.team_id = t."TeamID"
LEFT JOIN leagues l     ON a."LeagueID" = l."LeagueID" AND l."ValidToDt"='9999-12-31'::date;

CREATE UNIQUE INDEX player_season_minutes_uk          ON public.player_season_minutes ("PlayerID","TeamID","SeasonID","LeagueID");
CREATE INDEX player_season_minutes_season_idx         ON public.player_season_minutes ("SeasonID");
CREATE INDEX player_season_minutes_player_idx         ON public.player_season_minutes ("PlayerID");
CREATE INDEX player_season_minutes_playername_idx     ON public.player_season_minutes ("PlayerName");

GRANT SELECT ON public.player_season_stats   TO anon, authenticated;
GRANT SELECT ON public.player_season_minutes TO anon, authenticated;
