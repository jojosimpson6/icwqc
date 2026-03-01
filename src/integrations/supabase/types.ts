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
    PostgrestVersion: "14.1"
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
          ValidFromDt: string
          ValidToDt: string
        }
        Insert: {
          Nation?: string | null
          NationID: number
          ValidFromDt: string
          ValidToDt: string
        }
        Update: {
          Nation?: string | null
          NationID?: number
          ValidFromDt?: string
          ValidToDt?: string
        }
        Relationships: []
      }
      news_items: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          published_date: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_date?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
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
      results: {
        Row: {
          AwayBeater1ID: number | null
          AwayBeater2ID: number | null
          AwayChaser1Goals: number | null
          AwayChaser1ID: number | null
          AwayChaser2Goals: number | null
          AwayChaser2ID: number | null
          AwayChaser3Goals: number | null
          AwayChaser3ID: number | null
          AwayKeeperID: number | null
          AwayKeeperSaves: number | null
          AwayKeeperShotsFaced: number | null
          AwaySeekerID: number | null
          AwayTeamID: number | null
          AwayTeamScore: number | null
          HomeBeater1ID: number | null
          HomeBeater2ID: number | null
          HomeChaser1Goals: number | null
          HomeChaser1ID: number | null
          HomeChaser2Goals: number | null
          HomeChaser2ID: number | null
          HomeChaser3Goals: number | null
          HomeChaser3ID: number | null
          HomeKeeperID: number | null
          HomeKeeperSaves: number | null
          HomeKeeperShotsFaced: number | null
          HomeSeekerID: number | null
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
          AwayBeater1ID?: number | null
          AwayBeater2ID?: number | null
          AwayChaser1Goals?: number | null
          AwayChaser1ID?: number | null
          AwayChaser2Goals?: number | null
          AwayChaser2ID?: number | null
          AwayChaser3Goals?: number | null
          AwayChaser3ID?: number | null
          AwayKeeperID?: number | null
          AwayKeeperSaves?: number | null
          AwayKeeperShotsFaced?: number | null
          AwaySeekerID?: number | null
          AwayTeamID?: number | null
          AwayTeamScore?: number | null
          HomeBeater1ID?: number | null
          HomeBeater2ID?: number | null
          HomeChaser1Goals?: number | null
          HomeChaser1ID?: number | null
          HomeChaser2Goals?: number | null
          HomeChaser2ID?: number | null
          HomeChaser3Goals?: number | null
          HomeChaser3ID?: number | null
          HomeKeeperID?: number | null
          HomeKeeperSaves?: number | null
          HomeKeeperShotsFaced?: number | null
          HomeSeekerID?: number | null
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
          AwayBeater1ID?: number | null
          AwayBeater2ID?: number | null
          AwayChaser1Goals?: number | null
          AwayChaser1ID?: number | null
          AwayChaser2Goals?: number | null
          AwayChaser2ID?: number | null
          AwayChaser3Goals?: number | null
          AwayChaser3ID?: number | null
          AwayKeeperID?: number | null
          AwayKeeperSaves?: number | null
          AwayKeeperShotsFaced?: number | null
          AwaySeekerID?: number | null
          AwayTeamID?: number | null
          AwayTeamScore?: number | null
          HomeBeater1ID?: number | null
          HomeBeater2ID?: number | null
          HomeChaser1Goals?: number | null
          HomeChaser1ID?: number | null
          HomeChaser2Goals?: number | null
          HomeChaser2ID?: number | null
          HomeChaser3Goals?: number | null
          HomeChaser3ID?: number | null
          HomeKeeperID?: number | null
          HomeKeeperSaves?: number | null
          HomeKeeperShotsFaced?: number | null
          HomeSeekerID?: number | null
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
      teams: {
        Row: {
          City: string | null
          Country: string | null
          FullName: string
          LeagueID: number
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
      elo: {
        Row: {
          current_game_number: number | null
          MatchID: number | null
          new_elo: number | null
          player_name: string | null
          previous_elo: number | null
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
          PlayerName: string | null
          Position: string | null
          SeasonID: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_complete_schema: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
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
