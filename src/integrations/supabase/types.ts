export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      awards: {
        Row: {
          awardid: number | null
          awardname: string | null
          leagueid: number | null
          placement: number | null
          playerid: number | null
          seasonid: number | null
        }
        Insert: {
          awardid?: number | null
          awardname?: string | null
          leagueid?: number | null
          placement?: number | null
          playerid?: number | null
          seasonid?: number | null
        }
        Update: {
          awardid?: number | null
          awardname?: string | null
          leagueid?: number | null
          placement?: number | null
          playerid?: number | null
          seasonid?: number | null
        }
        Relationships: []
      }
      elo_history: {
        Row: {
          ELoDelta: number
          Matchday: string | null
          MatchID: number
          PostElo: number
          PreElo: number
          SeasonID: number
          TeamID: number
        }
        Insert: {
          ELoDelta: number
          Matchday?: string | null
          MatchID: number
          PostElo: number
          PreElo: number
          SeasonID: number
          TeamID: number
        }
        Update: {
          ELoDelta?: number
          Matchday?: string | null
          MatchID?: number
          PostElo?: number
          PreElo?: number
          SeasonID?: number
          TeamID?: number
        }
        Relationships: []
      }
      fantasy_leagues: {
        Row: {
          created_at: string
          id: string
          invite_code: string
          is_public: boolean
          max_teams: number
          name: string
          owner_id: string
          roster_size: number
          season_id: number | null
          settings: Json
          source_league_id: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_code?: string
          is_public?: boolean
          max_teams?: number
          name: string
          owner_id: string
          roster_size?: number
          season_id?: number | null
          settings?: Json
          source_league_id?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_code?: string
          is_public?: boolean
          max_teams?: number
          name?: string
          owner_id?: string
          roster_size?: number
          season_id?: number | null
          settings?: Json
          source_league_id?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      fantasy_rosters: {
        Row: {
          acquired_at: string
          fantasy_team_id: string
          id: string
          is_starter: boolean
          player_id: number
          slot: string
        }
        Insert: {
          acquired_at?: string
          fantasy_team_id: string
          id?: string
          is_starter?: boolean
          player_id: number
          slot?: string
        }
        Update: {
          acquired_at?: string
          fantasy_team_id?: string
          id?: string
          is_starter?: boolean
          player_id?: number
          slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_rosters_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_scoring_rules: {
        Row: {
          fantasy_league_id: string
          id: string
          points: number
          stat_key: string
        }
        Insert: {
          fantasy_league_id: string
          id?: string
          points?: number
          stat_key: string
        }
        Update: {
          fantasy_league_id?: string
          id?: string
          points?: number
          stat_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_scoring_rules_fantasy_league_id_fkey"
            columns: ["fantasy_league_id"]
            isOneToOne: false
            referencedRelation: "fantasy_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_teams: {
        Row: {
          created_at: string
          fantasy_league_id: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fantasy_league_id: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fantasy_league_id?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_teams_fantasy_league_id_fkey"
            columns: ["fantasy_league_id"]
            isOneToOne: false
            referencedRelation: "fantasy_leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          LeagueID: number
          LeagueName: string | null
          LeagueTier: number | null
          ValidFromDt: string
          ValidToDt: string
        }
        Insert: {
          LeagueID: number
          LeagueName?: string | null
          LeagueTier?: number | null
          ValidFromDt: string
          ValidToDt: string
        }
        Update: {
          LeagueID?: number
          LeagueName?: string | null
          LeagueTier?: number | null
          ValidFromDt?: string
          ValidToDt?: string
        }
        Relationships: []
      }
      managers: {
        Row: {
          DOB: string
          FirstName: string
          FormerPlayerFlag: boolean
          FormerPlayerID: number | null
          Gender: string
          LastName: string
          ManagerID: number
          NationalityID: number | null
        }
        Insert: {
          DOB: string
          FirstName: string
          FormerPlayerFlag: boolean
          FormerPlayerID?: number | null
          Gender: string
          LastName: string
          ManagerID: number
          NationalityID?: number | null
        }
        Update: {
          DOB?: string
          FirstName?: string
          FormerPlayerFlag?: boolean
          FormerPlayerID?: number | null
          Gender?: string
          LastName?: string
          ManagerID?: number
          NationalityID?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_managers_player"
            columns: ["FormerPlayerID"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["PlayerID"]
          },
        ]
      }
      matchdays: {
        Row: {
          LeagueID: number | null
          Matchday: string | null
          MatchdayID: number
          MatchdayWeek: number | null
          SeasonID: number | null
        }
        Insert: {
          LeagueID?: number | null
          Matchday?: string | null
          MatchdayID: number
          MatchdayWeek?: number | null
          SeasonID?: number | null
        }
        Update: {
          LeagueID?: number | null
          Matchday?: string | null
          MatchdayID?: number
          MatchdayWeek?: number | null
          SeasonID?: number | null
        }
        Relationships: []
      }
      nations: {
        Row: {
          Nation: string | null
          NationID: number
          Region: string | null
          ValidFromDt: string
          ValidToDt: string
        }
        Insert: {
          Nation?: string | null
          NationID: number
          Region?: string | null
          ValidFromDt: string
          ValidToDt: string
        }
        Update: {
          Nation?: string | null
          NationID?: number
          Region?: string | null
          ValidFromDt?: string
          ValidToDt?: string
        }
        Relationships: []
      }
      news_items: {
        Row: {
          author: string | null
          body: string
          created_at: string
          created_by: string | null
          id: string
          pinned: boolean
          published_date: string
          title: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          pinned?: boolean
          published_date?: string
          title: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          pinned?: boolean
          published_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      players: {
        Row: {
          DOB: string | null
          FirstName: string | null
          Gender: string | null
          Handedness: string | null
          headshot_url: string | null
          Height: number | null
          LastName: string | null
          NationalityID: number | null
          PlayerID: number
          PlayerName: string | null
          Position: string | null
          Weight: number | null
        }
        Insert: {
          DOB?: string | null
          FirstName?: string | null
          Gender?: string | null
          Handedness?: string | null
          headshot_url?: string | null
          Height?: number | null
          LastName?: string | null
          NationalityID?: number | null
          PlayerID: number
          PlayerName?: string | null
          Position?: string | null
          Weight?: number | null
        }
        Update: {
          DOB?: string | null
          FirstName?: string | null
          Gender?: string | null
          Handedness?: string | null
          headshot_url?: string | null
          Height?: number | null
          LastName?: string | null
          NationalityID?: number | null
          PlayerID?: number
          PlayerName?: string | null
          Position?: string | null
          Weight?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          favorite_team_id: number | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          favorite_team_id?: number | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          favorite_team_id?: number | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      results: {
        Row: {
          AwayBeater1BludgersHit: number | null
          AwayBeater1BludgerShotsFaced: number | null
          AwayBeater1ID: number | null
          AwayBeater1MinPlayed: number | null
          AwayBeater1TeammatesProtected: number | null
          AwayBeater1TurnoversForced: number | null
          AwayBeater2BludgersHit: number | null
          AwayBeater2BludgerShotsFaced: number | null
          AwayBeater2ID: number | null
          AwayBeater2MinPlayed: number | null
          AwayBeater2TeammatesProtected: number | null
          AwayBeater2TurnoversForced: number | null
          AwayChaser1Goals: number | null
          AwayChaser1ID: number | null
          AwayChaser1MinPlayed: number | null
          AwayChaser1PassAtt: number | null
          AwayChaser1PassComp: number | null
          AwayChaser1ShotAtt: number | null
          AwayChaser1ShotScored: number | null
          AwayChaser2Goals: number | null
          AwayChaser2ID: number | null
          AwayChaser2MinPlayed: number | null
          AwayChaser2PassAtt: number | null
          AwayChaser2PassComp: number | null
          AwayChaser2ShotAtt: number | null
          AwayChaser2ShotScored: number | null
          AwayChaser3Goals: number | null
          AwayChaser3ID: number | null
          AwayChaser3MinPlayed: number | null
          AwayChaser3PassAtt: number | null
          AwayChaser3PassComp: number | null
          AwayChaser3ShotAtt: number | null
          AwayChaser3ShotScored: number | null
          AwayKeeperID: number | null
          AwayKeeperMinPlayed: number | null
          AwayKeeperPassAtt: number | null
          AwayKeeperPassComp: number | null
          AwayKeeperSaves: number | null
          AwayKeeperShotsConceded: number | null
          AwayKeeperShotsFaced: number | null
          AwayKeeperShotsFaced2: number | null
          AwayKeeperShotsParried: number | null
          AwayKeeperShotsSaved: number | null
          AwaySeekerCatchAttempts: number | null
          AwaySeekerID: number | null
          AwaySeekerMinPlayed: number | null
          AwaySeekerSnitchSpotted: number | null
          AwayTeamID: number | null
          AwayTeamScore: number | null
          HomeBeater1BludgersHit: number | null
          HomeBeater1BludgerShotsFaced: number | null
          HomeBeater1ID: number | null
          HomeBeater1MinPlayed: number | null
          HomeBeater1TeammatesProtected: number | null
          HomeBeater1TurnoversForced: number | null
          HomeBeater2BludgersHit: number | null
          HomeBeater2BludgerShotsFaced: number | null
          HomeBeater2ID: number | null
          HomeBeater2MinPlayed: number | null
          HomeBeater2TeammatesProtected: number | null
          HomeBeater2TurnoversForced: number | null
          HomeChaser1Goals: number | null
          HomeChaser1ID: number | null
          HomeChaser1MinPlayed: number | null
          HomeChaser1PassAtt: number | null
          HomeChaser1PassComp: number | null
          HomeChaser1ShotAtt: number | null
          HomeChaser1ShotScored: number | null
          HomeChaser2Goals: number | null
          HomeChaser2ID: number | null
          HomeChaser2MinPlayed: number | null
          HomeChaser2PassAtt: number | null
          HomeChaser2PassComp: number | null
          HomeChaser2ShotAtt: number | null
          HomeChaser2ShotScored: number | null
          HomeChaser3Goals: number | null
          HomeChaser3ID: number | null
          HomeChaser3MinPlayed: number | null
          HomeChaser3PassAtt: number | null
          HomeChaser3PassComp: number | null
          HomeChaser3ShotAtt: number | null
          HomeChaser3ShotScored: number | null
          HomeKeeperID: number | null
          HomeKeeperMinPlayed: number | null
          HomeKeeperPassAtt: number | null
          HomeKeeperPassComp: number | null
          HomeKeeperSaves: number | null
          HomeKeeperShotsConceded: number | null
          HomeKeeperShotsFaced: number | null
          HomeKeeperShotsFaced2: number | null
          HomeKeeperShotsParried: number | null
          HomeKeeperShotsSaved: number | null
          HomeSeekerCatchAttempts: number | null
          HomeSeekerID: number | null
          HomeSeekerMinPlayed: number | null
          HomeSeekerSnitchSpotted: number | null
          HomeTeamID: number | null
          HomeTeamScore: number | null
          IsNeutralSite: number | null
          LeagueID: number | null
          MatchID: number
          SeasonID: number | null
          SnitchCaughtBy: number | null
          SnitchCaughtTime: number | null
          WeekID: number | null
        }
        Insert: {
          AwayBeater1BludgersHit?: number | null
          AwayBeater1BludgerShotsFaced?: number | null
          AwayBeater1ID?: number | null
          AwayBeater1MinPlayed?: number | null
          AwayBeater1TeammatesProtected?: number | null
          AwayBeater1TurnoversForced?: number | null
          AwayBeater2BludgersHit?: number | null
          AwayBeater2BludgerShotsFaced?: number | null
          AwayBeater2ID?: number | null
          AwayBeater2MinPlayed?: number | null
          AwayBeater2TeammatesProtected?: number | null
          AwayBeater2TurnoversForced?: number | null
          AwayChaser1Goals?: number | null
          AwayChaser1ID?: number | null
          AwayChaser1MinPlayed?: number | null
          AwayChaser1PassAtt?: number | null
          AwayChaser1PassComp?: number | null
          AwayChaser1ShotAtt?: number | null
          AwayChaser1ShotScored?: number | null
          AwayChaser2Goals?: number | null
          AwayChaser2ID?: number | null
          AwayChaser2MinPlayed?: number | null
          AwayChaser2PassAtt?: number | null
          AwayChaser2PassComp?: number | null
          AwayChaser2ShotAtt?: number | null
          AwayChaser2ShotScored?: number | null
          AwayChaser3Goals?: number | null
          AwayChaser3ID?: number | null
          AwayChaser3MinPlayed?: number | null
          AwayChaser3PassAtt?: number | null
          AwayChaser3PassComp?: number | null
          AwayChaser3ShotAtt?: number | null
          AwayChaser3ShotScored?: number | null
          AwayKeeperID?: number | null
          AwayKeeperMinPlayed?: number | null
          AwayKeeperPassAtt?: number | null
          AwayKeeperPassComp?: number | null
          AwayKeeperSaves?: number | null
          AwayKeeperShotsConceded?: number | null
          AwayKeeperShotsFaced?: number | null
          AwayKeeperShotsFaced2?: number | null
          AwayKeeperShotsParried?: number | null
          AwayKeeperShotsSaved?: number | null
          AwaySeekerCatchAttempts?: number | null
          AwaySeekerID?: number | null
          AwaySeekerMinPlayed?: number | null
          AwaySeekerSnitchSpotted?: number | null
          AwayTeamID?: number | null
          AwayTeamScore?: number | null
          HomeBeater1BludgersHit?: number | null
          HomeBeater1BludgerShotsFaced?: number | null
          HomeBeater1ID?: number | null
          HomeBeater1MinPlayed?: number | null
          HomeBeater1TeammatesProtected?: number | null
          HomeBeater1TurnoversForced?: number | null
          HomeBeater2BludgersHit?: number | null
          HomeBeater2BludgerShotsFaced?: number | null
          HomeBeater2ID?: number | null
          HomeBeater2MinPlayed?: number | null
          HomeBeater2TeammatesProtected?: number | null
          HomeBeater2TurnoversForced?: number | null
          HomeChaser1Goals?: number | null
          HomeChaser1ID?: number | null
          HomeChaser1MinPlayed?: number | null
          HomeChaser1PassAtt?: number | null
          HomeChaser1PassComp?: number | null
          HomeChaser1ShotAtt?: number | null
          HomeChaser1ShotScored?: number | null
          HomeChaser2Goals?: number | null
          HomeChaser2ID?: number | null
          HomeChaser2MinPlayed?: number | null
          HomeChaser2PassAtt?: number | null
          HomeChaser2PassComp?: number | null
          HomeChaser2ShotAtt?: number | null
          HomeChaser2ShotScored?: number | null
          HomeChaser3Goals?: number | null
          HomeChaser3ID?: number | null
          HomeChaser3MinPlayed?: number | null
          HomeChaser3PassAtt?: number | null
          HomeChaser3PassComp?: number | null
          HomeChaser3ShotAtt?: number | null
          HomeChaser3ShotScored?: number | null
          HomeKeeperID?: number | null
          HomeKeeperMinPlayed?: number | null
          HomeKeeperPassAtt?: number | null
          HomeKeeperPassComp?: number | null
          HomeKeeperSaves?: number | null
          HomeKeeperShotsConceded?: number | null
          HomeKeeperShotsFaced?: number | null
          HomeKeeperShotsFaced2?: number | null
          HomeKeeperShotsParried?: number | null
          HomeKeeperShotsSaved?: number | null
          HomeSeekerCatchAttempts?: number | null
          HomeSeekerID?: number | null
          HomeSeekerMinPlayed?: number | null
          HomeSeekerSnitchSpotted?: number | null
          HomeTeamID?: number | null
          HomeTeamScore?: number | null
          IsNeutralSite?: number | null
          LeagueID?: number | null
          MatchID: number
          SeasonID?: number | null
          SnitchCaughtBy?: number | null
          SnitchCaughtTime?: number | null
          WeekID?: number | null
        }
        Update: {
          AwayBeater1BludgersHit?: number | null
          AwayBeater1BludgerShotsFaced?: number | null
          AwayBeater1ID?: number | null
          AwayBeater1MinPlayed?: number | null
          AwayBeater1TeammatesProtected?: number | null
          AwayBeater1TurnoversForced?: number | null
          AwayBeater2BludgersHit?: number | null
          AwayBeater2BludgerShotsFaced?: number | null
          AwayBeater2ID?: number | null
          AwayBeater2MinPlayed?: number | null
          AwayBeater2TeammatesProtected?: number | null
          AwayBeater2TurnoversForced?: number | null
          AwayChaser1Goals?: number | null
          AwayChaser1ID?: number | null
          AwayChaser1MinPlayed?: number | null
          AwayChaser1PassAtt?: number | null
          AwayChaser1PassComp?: number | null
          AwayChaser1ShotAtt?: number | null
          AwayChaser1ShotScored?: number | null
          AwayChaser2Goals?: number | null
          AwayChaser2ID?: number | null
          AwayChaser2MinPlayed?: number | null
          AwayChaser2PassAtt?: number | null
          AwayChaser2PassComp?: number | null
          AwayChaser2ShotAtt?: number | null
          AwayChaser2ShotScored?: number | null
          AwayChaser3Goals?: number | null
          AwayChaser3ID?: number | null
          AwayChaser3MinPlayed?: number | null
          AwayChaser3PassAtt?: number | null
          AwayChaser3PassComp?: number | null
          AwayChaser3ShotAtt?: number | null
          AwayChaser3ShotScored?: number | null
          AwayKeeperID?: number | null
          AwayKeeperMinPlayed?: number | null
          AwayKeeperPassAtt?: number | null
          AwayKeeperPassComp?: number | null
          AwayKeeperSaves?: number | null
          AwayKeeperShotsConceded?: number | null
          AwayKeeperShotsFaced?: number | null
          AwayKeeperShotsFaced2?: number | null
          AwayKeeperShotsParried?: number | null
          AwayKeeperShotsSaved?: number | null
          AwaySeekerCatchAttempts?: number | null
          AwaySeekerID?: number | null
          AwaySeekerMinPlayed?: number | null
          AwaySeekerSnitchSpotted?: number | null
          AwayTeamID?: number | null
          AwayTeamScore?: number | null
          HomeBeater1BludgersHit?: number | null
          HomeBeater1BludgerShotsFaced?: number | null
          HomeBeater1ID?: number | null
          HomeBeater1MinPlayed?: number | null
          HomeBeater1TeammatesProtected?: number | null
          HomeBeater1TurnoversForced?: number | null
          HomeBeater2BludgersHit?: number | null
          HomeBeater2BludgerShotsFaced?: number | null
          HomeBeater2ID?: number | null
          HomeBeater2MinPlayed?: number | null
          HomeBeater2TeammatesProtected?: number | null
          HomeBeater2TurnoversForced?: number | null
          HomeChaser1Goals?: number | null
          HomeChaser1ID?: number | null
          HomeChaser1MinPlayed?: number | null
          HomeChaser1PassAtt?: number | null
          HomeChaser1PassComp?: number | null
          HomeChaser1ShotAtt?: number | null
          HomeChaser1ShotScored?: number | null
          HomeChaser2Goals?: number | null
          HomeChaser2ID?: number | null
          HomeChaser2MinPlayed?: number | null
          HomeChaser2PassAtt?: number | null
          HomeChaser2PassComp?: number | null
          HomeChaser2ShotAtt?: number | null
          HomeChaser2ShotScored?: number | null
          HomeChaser3Goals?: number | null
          HomeChaser3ID?: number | null
          HomeChaser3MinPlayed?: number | null
          HomeChaser3PassAtt?: number | null
          HomeChaser3PassComp?: number | null
          HomeChaser3ShotAtt?: number | null
          HomeChaser3ShotScored?: number | null
          HomeKeeperID?: number | null
          HomeKeeperMinPlayed?: number | null
          HomeKeeperPassAtt?: number | null
          HomeKeeperPassComp?: number | null
          HomeKeeperSaves?: number | null
          HomeKeeperShotsConceded?: number | null
          HomeKeeperShotsFaced?: number | null
          HomeKeeperShotsFaced2?: number | null
          HomeKeeperShotsParried?: number | null
          HomeKeeperShotsSaved?: number | null
          HomeSeekerCatchAttempts?: number | null
          HomeSeekerID?: number | null
          HomeSeekerMinPlayed?: number | null
          HomeSeekerSnitchSpotted?: number | null
          HomeTeamID?: number | null
          HomeTeamScore?: number | null
          IsNeutralSite?: number | null
          LeagueID?: number | null
          MatchID?: number
          SeasonID?: number | null
          SnitchCaughtBy?: number | null
          SnitchCaughtTime?: number | null
          WeekID?: number | null
        }
        Relationships: []
      }
      site_content: {
        Row: {
          content: string
          id: string
          key: string
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content: string
          id?: string
          key: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          id?: string
          key?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      team_captains: {
        Row: {
          AppearanceShare: number
          CaptainAppearances: number
          CaptainPlayerID: number
          MatchesPlayed: number
          SeasonID: number
          SelectionMethod: string
          TeamID: number
        }
        Insert: {
          AppearanceShare: number
          CaptainAppearances: number
          CaptainPlayerID: number
          MatchesPlayed: number
          SeasonID: number
          SelectionMethod: string
          TeamID: number
        }
        Update: {
          AppearanceShare?: number
          CaptainAppearances?: number
          CaptainPlayerID?: number
          MatchesPlayed?: number
          SeasonID?: number
          SelectionMethod?: string
          TeamID?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_team_captains_player"
            columns: ["CaptainPlayerID"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["PlayerID"]
          },
          {
            foreignKeyName: "fk_team_captains_team"
            columns: ["TeamID"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["TeamID"]
          },
        ]
      }
      team_managers: {
        Row: {
          ManagerID: number
          SeasonID: number
          TeamID: number
        }
        Insert: {
          ManagerID: number
          SeasonID: number
          TeamID: number
        }
        Update: {
          ManagerID?: number
          SeasonID?: number
          TeamID?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_team_managers_manager"
            columns: ["ManagerID"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["ManagerID"]
          },
          {
            foreignKeyName: "fk_team_managers_team"
            columns: ["TeamID"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["TeamID"]
          },
        ]
      }
      teams: {
        Row: {
          City: string | null
          Country: string | null
          FullName: string
          LeagueID: number
          logo_url: string | null
          nationid: number | null
          Nickname: string | null
          PrimaryColor: string | null
          Rival: string | null
          SecondaryColor: string | null
          State: string | null
          TeamID: number
          ValidFromDt: string
          ValidToDt: string
        }
        Insert: {
          City?: string | null
          Country?: string | null
          FullName: string
          LeagueID: number
          logo_url?: string | null
          nationid?: number | null
          Nickname?: string | null
          PrimaryColor?: string | null
          Rival?: string | null
          SecondaryColor?: string | null
          State?: string | null
          TeamID: number
          ValidFromDt: string
          ValidToDt: string
        }
        Update: {
          City?: string | null
          Country?: string | null
          FullName?: string
          LeagueID?: number
          logo_url?: string | null
          nationid?: number | null
          Nickname?: string | null
          PrimaryColor?: string | null
          Rival?: string | null
          SecondaryColor?: string | null
          State?: string | null
          TeamID?: number
          ValidFromDt?: string
          ValidToDt?: string
        }
        Relationships: []
      }
      user_favorites: {
        Row: {
          created_at: string
          entity_id: number
          entity_type: string
          id: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: number
          entity_type: string
          id?: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: number
          entity_type?: string
          id?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      player_season_minutes: {
        Row: {
          FullName: string | null
          LeagueID: number | null
          LeagueName: string | null
          MinutesPlayed: number | null
          PlayerID: number | null
          PlayerName: string | null
          SeasonID: number | null
          TeamID: number | null
        }
        Relationships: []
      }
      player_season_stats: {
        Row: {
          BludgersHit: number | null
          BludgerShotsFaced: number | null
          CatchAttempts: number | null
          CatchRatePct: number | null
          GamesPlayed: number | null
          Goals: number | null
          GoldenSnitchCatches: number | null
          KeeperPassAtt: number | null
          KeeperPassComp: number | null
          KeeperPassCompPct: number | null
          KeeperSaves: number | null
          KeeperShotsConceded: number | null
          KeeperShotsFaced: number | null
          KeeperShotsParried: number | null
          LeagueID: number | null
          LeagueName: string | null
          MinPlayed: number | null
          Nation: string | null
          PassAtt: number | null
          PassComp: number | null
          PassCompPct: number | null
          PlayerID: number | null
          PlayerName: string | null
          Position: string | null
          SavePct: number | null
          SeasonID: number | null
          ShotAccPct: number | null
          ShotAtt: number | null
          ShotScored: number | null
          SnitchSpotted: number | null
          TeamFullName: string | null
          TeamID: number | null
          TeammatesProtected: number | null
          TurnoversForced: number | null
        }
        Relationships: []
      }
      schedule: {
        Row: {
          away_team: string | null
          home_team: string | null
          LeagueID: number | null
          Matchday: string | null
          MatchID: number | null
          SeasonID: number | null
          site: string | null
        }
        Relationships: []
      }
      scheduled_matches: {
        Row: {
          AwayTeamID: number | null
          HomeTeamID: number | null
          IsNeutralSite: number | null
          LeagueID: number | null
          Matchday: string | null
          MatchID: number | null
          ReleaseDate: string | null
          SeasonID: number | null
          Status: string | null
          TeamsDetermined: boolean | null
          WeekID: number | null
        }
        Relationships: []
      }
      standings: {
        Row: {
          awaygamesplayed: number | null
          awaygoalsagainst: number | null
          awaygoalsfor: number | null
          awaygsc: number | null
          awayminutesplayed: number | null
          awaypoints: number | null
          FullName: string | null
          GoalsAgainst: number | null
          GoalsFor: number | null
          homegamesplayed: number | null
          homegoalsagainst: number | null
          homegoalsfor: number | null
          homegsc: number | null
          homeminutesplayed: number | null
          homepoints: number | null
          LeagueID: number | null
          neutralgamesplayed: number | null
          neutralgoalsagainst: number | null
          neutralgoalsfor: number | null
          neutralgsc: number | null
          neutralminutesplayed: number | null
          neutralpoints: number | null
          SeasonID: number | null
          totalgamesplayed: number | null
          totalgsc: number | null
          totalminutesplayed: number | null
          totalpoints: number | null
        }
        Relationships: []
      }
      stats: {
        Row: {
          FullName: string | null
          GamesPlayed: number | null
          Goals: number | null
          GoldenSnitchCatches: number | null
          KeeperSaves: number | null
          KeeperShotsFaced: number | null
          LeagueName: string | null
          Nation: string | null
          PlayerID: number | null
          PlayerName: string | null
          Position: string | null
          SeasonID: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      fantasy_team_league: { Args: { _team: string }; Returns: string }
      fantasy_team_owner: { Args: { _team: string }; Returns: string }
      get_complete_schema: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_fantasy_member: {
        Args: { _league: string; _user: string }
        Returns: boolean
      }
      match_is_released: { Args: { _matchid: number }; Returns: boolean }
      match_release_date: {
        Args: { _matchday: string; _snitch: number }
        Returns: string
      }
      match_result_released: {
        Args: {
          _league: number
          _season: number
          _snitch: number
          _week: number
        }
        Returns: boolean
      }
      match_week_is_past: {
        Args: { _league: number; _season: number; _week: number }
        Returns: boolean
      }
      refresh_elo_history: { Args: never; Returns: undefined }
      refresh_player_views: { Args: never; Returns: undefined }
      season_is_complete: {
        Args: { _league: number; _season: number }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
