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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      demographics: {
        Row: {
          age: string
          created_at: string
          ethnicity: Json
          gender: string
          id: string
          native_english: string
          prolific_id: string
          session_token: string
        }
        Insert: {
          age: string
          created_at?: string
          ethnicity: Json
          gender: string
          id?: string
          native_english: string
          prolific_id: string
          session_token: string
        }
        Update: {
          age?: string
          created_at?: string
          ethnicity?: Json
          gender?: string
          id?: string
          native_english?: string
          prolific_id?: string
          session_token?: string
        }
        Relationships: []
      }
      feedback_responses: {
        Row: {
          call_id: string
          created_at: string
          experiment_feedback: string
          formality: number
          id: string
          prolific_id: string
          voice_assistant_feedback: string
        }
        Insert: {
          call_id: string
          created_at?: string
          experiment_feedback: string
          formality: number
          id?: string
          prolific_id: string
          voice_assistant_feedback: string
        }
        Update: {
          call_id?: string
          created_at?: string
          experiment_feedback?: string
          formality?: number
          id?: string
          prolific_id?: string
          voice_assistant_feedback?: string
        }
        Relationships: []
      }
      participant_calls: {
        Row: {
          call_id: string
          created_at: string
          expires_at: string
          id: string
          prolific_id: string
          session_token: string
          token_used: boolean
        }
        Insert: {
          call_id: string
          created_at?: string
          expires_at: string
          id?: string
          prolific_id: string
          session_token?: string
          token_used?: boolean
        }
        Update: {
          call_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          prolific_id?: string
          session_token?: string
          token_used?: boolean
        }
        Relationships: []
      }
      pets_responses: {
        Row: {
          attention_check_1: number | null
          attention_check_1_expected: number | null
          call_id: string
          created_at: string
          e1: number
          e2: number
          e3: number
          e4: number
          e5: number
          e6: number
          id: string
          pets_er: number
          pets_total: number
          pets_ut: number
          prolific_id: string
          tias_1: number | null
          tias_10: number | null
          tias_11: number | null
          tias_12: number | null
          tias_2: number | null
          tias_3: number | null
          tias_4: number | null
          tias_5: number | null
          tias_6: number | null
          tias_7: number | null
          tias_8: number | null
          tias_9: number | null
          tias_attention_check_1: number | null
          tias_attention_check_1_expected: number | null
          tias_total: number | null
          u1: number
          u2: number
          u3: number
          u4: number
        }
        Insert: {
          attention_check_1?: number | null
          attention_check_1_expected?: number | null
          call_id: string
          created_at?: string
          e1: number
          e2: number
          e3: number
          e4: number
          e5: number
          e6: number
          id?: string
          pets_er: number
          pets_total: number
          pets_ut: number
          prolific_id: string
          tias_1?: number | null
          tias_10?: number | null
          tias_11?: number | null
          tias_12?: number | null
          tias_2?: number | null
          tias_3?: number | null
          tias_4?: number | null
          tias_5?: number | null
          tias_6?: number | null
          tias_7?: number | null
          tias_8?: number | null
          tias_9?: number | null
          tias_attention_check_1?: number | null
          tias_attention_check_1_expected?: number | null
          tias_total?: number | null
          u1: number
          u2: number
          u3: number
          u4: number
        }
        Update: {
          attention_check_1?: number | null
          attention_check_1_expected?: number | null
          call_id?: string
          created_at?: string
          e1?: number
          e2?: number
          e3?: number
          e4?: number
          e5?: number
          e6?: number
          id?: string
          pets_er?: number
          pets_total?: number
          pets_ut?: number
          prolific_id?: string
          tias_1?: number | null
          tias_10?: number | null
          tias_11?: number | null
          tias_12?: number | null
          tias_2?: number | null
          tias_3?: number | null
          tias_4?: number | null
          tias_5?: number | null
          tias_6?: number | null
          tias_7?: number | null
          tias_8?: number | null
          tias_9?: number | null
          tias_attention_check_1?: number | null
          tias_attention_check_1_expected?: number | null
          tias_total?: number | null
          u1?: number
          u2?: number
          u3?: number
          u4?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
