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
      archived_responses: {
        Row: {
          archive_reason: string | null
          archived_at: string
          archived_by: string
          archived_data: Json
          id: string
          original_id: string
          original_table: string
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string
          archived_by: string
          archived_data: Json
          id?: string
          original_id: string
          original_table: string
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string
          archived_by?: string
          archived_data?: Json
          id?: string
          original_id?: string
          original_table?: string
        }
        Relationships: []
      }
      changelog_changes: {
        Row: {
          change_type: string
          created_at: string
          description: string
          display_order: number
          entry_id: string
          id: string
        }
        Insert: {
          change_type: string
          created_at?: string
          description: string
          display_order?: number
          entry_id: string
          id?: string
        }
        Update: {
          change_type?: string
          created_at?: string
          description?: string
          display_order?: number
          entry_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "changelog_changes_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "changelog_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      changelog_entries: {
        Row: {
          created_at: string
          created_by: string
          id: string
          release_date: string
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          release_date: string
          updated_at?: string
          version: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          release_date?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      data_withdrawal_requests: {
        Row: {
          call_id: string
          created_at: string
          id: string
          prolific_id: string
          session_token: string
        }
        Insert: {
          call_id: string
          created_at?: string
          id?: string
          prolific_id: string
          session_token: string
        }
        Update: {
          call_id?: string
          created_at?: string
          id?: string
          prolific_id?: string
          session_token?: string
        }
        Relationships: []
      }
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
          voice_assistant_familiarity: number | null
          voice_assistant_usage_frequency: number | null
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
          voice_assistant_familiarity?: number | null
          voice_assistant_usage_frequency?: number | null
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
          voice_assistant_familiarity?: number | null
          voice_assistant_usage_frequency?: number | null
        }
        Relationships: []
      }
      dictation_recordings: {
        Row: {
          attempt_count: number
          call_id: string | null
          created_at: string
          duration_ms: number | null
          field: string
          file_size_bytes: number
          id: string
          mime_type: string
          page_name: string
          prolific_id: string
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          attempt_count?: number
          call_id?: string | null
          created_at?: string
          duration_ms?: number | null
          field: string
          file_size_bytes?: number
          id?: string
          mime_type: string
          page_name?: string
          prolific_id: string
          storage_bucket?: string
          storage_path: string
        }
        Update: {
          attempt_count?: number
          call_id?: string | null
          created_at?: string
          duration_ms?: number | null
          field?: string
          file_size_bytes?: number
          id?: string
          mime_type?: string
          page_name?: string
          prolific_id?: string
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: []
      }
      experiment_batches: {
        Row: {
          created_at: string
          created_by: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      experiment_responses: {
        Row: {
          ai_formality_calculated_at: string | null
          ai_formality_interpretation: string | null
          ai_formality_score: number | null
          assistant_type: string | null
          attention_check_1: number | null
          attention_check_1_expected: number | null
          attention_check_1_position: number | null
          batch_label: string | null
          call_attempt_number: number
          call_id: string
          communication_style_feedback: string
          created_at: string
          e1: number
          e1_position: number
          e2: number
          e2_position: number
          e3: number
          e3_position: number
          e4: number
          e4_position: number
          e5: number
          e5_position: number
          e6: number
          e6_position: number
          experiment_feedback: string
          formality: number
          godspeed_anthro_1: number | null
          godspeed_anthro_1_position: number | null
          godspeed_anthro_2: number | null
          godspeed_anthro_2_position: number | null
          godspeed_anthro_3: number | null
          godspeed_anthro_3_position: number | null
          godspeed_anthro_4: number | null
          godspeed_anthro_4_position: number | null
          godspeed_anthro_total: number | null
          godspeed_attention_check_1: number | null
          godspeed_attention_check_1_expected: number | null
          godspeed_attention_check_1_position: number | null
          godspeed_intel_1: number | null
          godspeed_intel_1_position: number | null
          godspeed_intel_2: number | null
          godspeed_intel_2_position: number | null
          godspeed_intel_3: number | null
          godspeed_intel_3_position: number | null
          godspeed_intel_4: number | null
          godspeed_intel_4_position: number | null
          godspeed_intel_5: number | null
          godspeed_intel_5_position: number | null
          godspeed_intel_total: number | null
          godspeed_like_1: number | null
          godspeed_like_1_position: number | null
          godspeed_like_2: number | null
          godspeed_like_2_position: number | null
          godspeed_like_3: number | null
          godspeed_like_3_position: number | null
          godspeed_like_4: number | null
          godspeed_like_4_position: number | null
          godspeed_like_5: number | null
          godspeed_like_5_position: number | null
          godspeed_like_total: number | null
          id: string
          intention_1: number
          intention_2: number
          pets_er: number
          pets_total: number
          pets_ut: number
          prolific_id: string
          tias_1: number | null
          tias_1_position: number | null
          tias_10: number | null
          tias_10_position: number | null
          tias_11: number | null
          tias_11_position: number | null
          tias_12: number | null
          tias_12_position: number | null
          tias_2: number | null
          tias_2_position: number | null
          tias_3: number | null
          tias_3_position: number | null
          tias_4: number | null
          tias_4_position: number | null
          tias_5: number | null
          tias_5_position: number | null
          tias_6: number | null
          tias_6_position: number | null
          tias_7: number | null
          tias_7_position: number | null
          tias_8: number | null
          tias_8_position: number | null
          tias_9: number | null
          tias_9_position: number | null
          tias_attention_check_1: number | null
          tias_attention_check_1_expected: number | null
          tias_attention_check_1_position: number | null
          tias_total: number | null
          tipi_1: number | null
          tipi_1_position: number | null
          tipi_10: number | null
          tipi_10_position: number | null
          tipi_2: number | null
          tipi_2_position: number | null
          tipi_3: number | null
          tipi_3_position: number | null
          tipi_4: number | null
          tipi_4_position: number | null
          tipi_5: number | null
          tipi_5_position: number | null
          tipi_6: number | null
          tipi_6_position: number | null
          tipi_7: number | null
          tipi_7_position: number | null
          tipi_8: number | null
          tipi_8_position: number | null
          tipi_9: number | null
          tipi_9_position: number | null
          tipi_agreeableness: number | null
          tipi_attention_check_1: number | null
          tipi_attention_check_1_expected: number | null
          tipi_attention_check_1_position: number | null
          tipi_conscientiousness: number | null
          tipi_emotional_stability: number | null
          tipi_extraversion: number | null
          tipi_openness: number | null
          u1: number
          u1_position: number
          u2: number
          u2_position: number
          u3: number
          u3_position: number
          u4: number
          u4_position: number
          voice_assistant_feedback: string
        }
        Insert: {
          ai_formality_calculated_at?: string | null
          ai_formality_interpretation?: string | null
          ai_formality_score?: number | null
          assistant_type?: string | null
          attention_check_1?: number | null
          attention_check_1_expected?: number | null
          attention_check_1_position?: number | null
          batch_label?: string | null
          call_attempt_number?: number
          call_id: string
          communication_style_feedback?: string
          created_at?: string
          e1: number
          e1_position: number
          e2: number
          e2_position: number
          e3: number
          e3_position: number
          e4: number
          e4_position: number
          e5: number
          e5_position: number
          e6: number
          e6_position: number
          experiment_feedback: string
          formality: number
          godspeed_anthro_1?: number | null
          godspeed_anthro_1_position?: number | null
          godspeed_anthro_2?: number | null
          godspeed_anthro_2_position?: number | null
          godspeed_anthro_3?: number | null
          godspeed_anthro_3_position?: number | null
          godspeed_anthro_4?: number | null
          godspeed_anthro_4_position?: number | null
          godspeed_anthro_total?: number | null
          godspeed_attention_check_1?: number | null
          godspeed_attention_check_1_expected?: number | null
          godspeed_attention_check_1_position?: number | null
          godspeed_intel_1?: number | null
          godspeed_intel_1_position?: number | null
          godspeed_intel_2?: number | null
          godspeed_intel_2_position?: number | null
          godspeed_intel_3?: number | null
          godspeed_intel_3_position?: number | null
          godspeed_intel_4?: number | null
          godspeed_intel_4_position?: number | null
          godspeed_intel_5?: number | null
          godspeed_intel_5_position?: number | null
          godspeed_intel_total?: number | null
          godspeed_like_1?: number | null
          godspeed_like_1_position?: number | null
          godspeed_like_2?: number | null
          godspeed_like_2_position?: number | null
          godspeed_like_3?: number | null
          godspeed_like_3_position?: number | null
          godspeed_like_4?: number | null
          godspeed_like_4_position?: number | null
          godspeed_like_5?: number | null
          godspeed_like_5_position?: number | null
          godspeed_like_total?: number | null
          id?: string
          intention_1: number
          intention_2: number
          pets_er: number
          pets_total: number
          pets_ut: number
          prolific_id: string
          tias_1?: number | null
          tias_1_position?: number | null
          tias_10?: number | null
          tias_10_position?: number | null
          tias_11?: number | null
          tias_11_position?: number | null
          tias_12?: number | null
          tias_12_position?: number | null
          tias_2?: number | null
          tias_2_position?: number | null
          tias_3?: number | null
          tias_3_position?: number | null
          tias_4?: number | null
          tias_4_position?: number | null
          tias_5?: number | null
          tias_5_position?: number | null
          tias_6?: number | null
          tias_6_position?: number | null
          tias_7?: number | null
          tias_7_position?: number | null
          tias_8?: number | null
          tias_8_position?: number | null
          tias_9?: number | null
          tias_9_position?: number | null
          tias_attention_check_1?: number | null
          tias_attention_check_1_expected?: number | null
          tias_attention_check_1_position?: number | null
          tias_total?: number | null
          tipi_1?: number | null
          tipi_1_position?: number | null
          tipi_10?: number | null
          tipi_10_position?: number | null
          tipi_2?: number | null
          tipi_2_position?: number | null
          tipi_3?: number | null
          tipi_3_position?: number | null
          tipi_4?: number | null
          tipi_4_position?: number | null
          tipi_5?: number | null
          tipi_5_position?: number | null
          tipi_6?: number | null
          tipi_6_position?: number | null
          tipi_7?: number | null
          tipi_7_position?: number | null
          tipi_8?: number | null
          tipi_8_position?: number | null
          tipi_9?: number | null
          tipi_9_position?: number | null
          tipi_agreeableness?: number | null
          tipi_attention_check_1?: number | null
          tipi_attention_check_1_expected?: number | null
          tipi_attention_check_1_position?: number | null
          tipi_conscientiousness?: number | null
          tipi_emotional_stability?: number | null
          tipi_extraversion?: number | null
          tipi_openness?: number | null
          u1: number
          u1_position: number
          u2: number
          u2_position: number
          u3: number
          u3_position: number
          u4: number
          u4_position: number
          voice_assistant_feedback: string
        }
        Update: {
          ai_formality_calculated_at?: string | null
          ai_formality_interpretation?: string | null
          ai_formality_score?: number | null
          assistant_type?: string | null
          attention_check_1?: number | null
          attention_check_1_expected?: number | null
          attention_check_1_position?: number | null
          batch_label?: string | null
          call_attempt_number?: number
          call_id?: string
          communication_style_feedback?: string
          created_at?: string
          e1?: number
          e1_position?: number
          e2?: number
          e2_position?: number
          e3?: number
          e3_position?: number
          e4?: number
          e4_position?: number
          e5?: number
          e5_position?: number
          e6?: number
          e6_position?: number
          experiment_feedback?: string
          formality?: number
          godspeed_anthro_1?: number | null
          godspeed_anthro_1_position?: number | null
          godspeed_anthro_2?: number | null
          godspeed_anthro_2_position?: number | null
          godspeed_anthro_3?: number | null
          godspeed_anthro_3_position?: number | null
          godspeed_anthro_4?: number | null
          godspeed_anthro_4_position?: number | null
          godspeed_anthro_total?: number | null
          godspeed_attention_check_1?: number | null
          godspeed_attention_check_1_expected?: number | null
          godspeed_attention_check_1_position?: number | null
          godspeed_intel_1?: number | null
          godspeed_intel_1_position?: number | null
          godspeed_intel_2?: number | null
          godspeed_intel_2_position?: number | null
          godspeed_intel_3?: number | null
          godspeed_intel_3_position?: number | null
          godspeed_intel_4?: number | null
          godspeed_intel_4_position?: number | null
          godspeed_intel_5?: number | null
          godspeed_intel_5_position?: number | null
          godspeed_intel_total?: number | null
          godspeed_like_1?: number | null
          godspeed_like_1_position?: number | null
          godspeed_like_2?: number | null
          godspeed_like_2_position?: number | null
          godspeed_like_3?: number | null
          godspeed_like_3_position?: number | null
          godspeed_like_4?: number | null
          godspeed_like_4_position?: number | null
          godspeed_like_5?: number | null
          godspeed_like_5_position?: number | null
          godspeed_like_total?: number | null
          id?: string
          intention_1?: number
          intention_2?: number
          pets_er?: number
          pets_total?: number
          pets_ut?: number
          prolific_id?: string
          tias_1?: number | null
          tias_1_position?: number | null
          tias_10?: number | null
          tias_10_position?: number | null
          tias_11?: number | null
          tias_11_position?: number | null
          tias_12?: number | null
          tias_12_position?: number | null
          tias_2?: number | null
          tias_2_position?: number | null
          tias_3?: number | null
          tias_3_position?: number | null
          tias_4?: number | null
          tias_4_position?: number | null
          tias_5?: number | null
          tias_5_position?: number | null
          tias_6?: number | null
          tias_6_position?: number | null
          tias_7?: number | null
          tias_7_position?: number | null
          tias_8?: number | null
          tias_8_position?: number | null
          tias_9?: number | null
          tias_9_position?: number | null
          tias_attention_check_1?: number | null
          tias_attention_check_1_expected?: number | null
          tias_attention_check_1_position?: number | null
          tias_total?: number | null
          tipi_1?: number | null
          tipi_1_position?: number | null
          tipi_10?: number | null
          tipi_10_position?: number | null
          tipi_2?: number | null
          tipi_2_position?: number | null
          tipi_3?: number | null
          tipi_3_position?: number | null
          tipi_4?: number | null
          tipi_4_position?: number | null
          tipi_5?: number | null
          tipi_5_position?: number | null
          tipi_6?: number | null
          tipi_6_position?: number | null
          tipi_7?: number | null
          tipi_7_position?: number | null
          tipi_8?: number | null
          tipi_8_position?: number | null
          tipi_9?: number | null
          tipi_9_position?: number | null
          tipi_agreeableness?: number | null
          tipi_attention_check_1?: number | null
          tipi_attention_check_1_expected?: number | null
          tipi_attention_check_1_position?: number | null
          tipi_conscientiousness?: number | null
          tipi_emotional_stability?: number | null
          tipi_extraversion?: number | null
          tipi_openness?: number | null
          u1?: number
          u1_position?: number
          u2?: number
          u2_position?: number
          u3?: number
          u3_position?: number
          u4?: number
          u4_position?: number
          voice_assistant_feedback?: string
        }
        Relationships: []
      }
      experiment_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string | null
          updated_by?: string | null
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
      formality_calculations: {
        Row: {
          ai_only_mode: boolean
          average_turn_score: number | null
          batch_id: string | null
          batch_name: string | null
          category_data: Json
          created_at: string
          created_by: string
          csv_row_index: number | null
          custom_interpretation: string | null
          f_score: number
          formula_breakdown: Json
          id: string
          interpretation: string
          interpretation_label: string
          linked_call_id: string | null
          linked_prolific_id: string | null
          notes: string | null
          original_transcript: string
          per_turn_mode: boolean
          per_turn_results: Json | null
          tokens_data: Json | null
          total_tokens: number
          transcript_source: string
        }
        Insert: {
          ai_only_mode?: boolean
          average_turn_score?: number | null
          batch_id?: string | null
          batch_name?: string | null
          category_data: Json
          created_at?: string
          created_by: string
          csv_row_index?: number | null
          custom_interpretation?: string | null
          f_score: number
          formula_breakdown: Json
          id?: string
          interpretation: string
          interpretation_label: string
          linked_call_id?: string | null
          linked_prolific_id?: string | null
          notes?: string | null
          original_transcript: string
          per_turn_mode?: boolean
          per_turn_results?: Json | null
          tokens_data?: Json | null
          total_tokens: number
          transcript_source?: string
        }
        Update: {
          ai_only_mode?: boolean
          average_turn_score?: number | null
          batch_id?: string | null
          batch_name?: string | null
          category_data?: Json
          created_at?: string
          created_by?: string
          csv_row_index?: number | null
          custom_interpretation?: string | null
          f_score?: number
          formula_breakdown?: Json
          id?: string
          interpretation?: string
          interpretation_label?: string
          linked_call_id?: string | null
          linked_prolific_id?: string | null
          notes?: string | null
          original_transcript?: string
          per_turn_mode?: boolean
          per_turn_results?: Json | null
          tokens_data?: Json | null
          total_tokens?: number
          transcript_source?: string
        }
        Relationships: []
      }
      intention: {
        Row: {
          call_id: string
          created_at: string
          id: string
          intention_1: number
          intention_2: number
          prolific_id: string
        }
        Insert: {
          call_id: string
          created_at?: string
          id?: string
          intention_1: number
          intention_2: number
          prolific_id: string
        }
        Update: {
          call_id?: string
          created_at?: string
          id?: string
          intention_1?: number
          intention_2?: number
          prolific_id?: string
        }
        Relationships: []
      }
      navigation_events: {
        Row: {
          call_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          page_name: string
          prolific_id: string
          time_on_page_seconds: number | null
        }
        Insert: {
          call_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          page_name: string
          prolific_id: string
          time_on_page_seconds?: number | null
        }
        Update: {
          call_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          page_name?: string
          prolific_id?: string
          time_on_page_seconds?: number | null
        }
        Relationships: []
      }
      no_consent_feedback: {
        Row: {
          created_at: string
          feedback: string | null
          id: string
          prolific_id: string | null
        }
        Insert: {
          created_at?: string
          feedback?: string | null
          id?: string
          prolific_id?: string | null
        }
        Update: {
          created_at?: string
          feedback?: string | null
          id?: string
          prolific_id?: string | null
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
          is_completed: boolean
        }
        Insert: {
          call_id: string
          created_at?: string
          expires_at: string
          id?: string
          prolific_id: string
          session_token?: string
          is_completed?: boolean
        }
        Update: {
          call_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          prolific_id?: string
          session_token?: string
          is_completed?: boolean
        }
        Relationships: []
      }
      participant_condition_assignments: {
        Row: {
          assigned_at: string
          assigned_condition: string
          id: string
          prolific_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_condition: string
          id?: string
          prolific_id: string
        }
        Update: {
          assigned_at?: string
          assigned_condition?: string
          id?: string
          prolific_id?: string
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
      researcher_activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          user_email: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          user_email: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      researcher_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["researcher_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["researcher_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["researcher_role"]
          user_id?: string
        }
        Relationships: []
      }
      vapi_prompts: {
        Row: {
          batch_label: string | null
          condition: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          parent_version_id: string | null
          prompt_text: string
          updated_at: string
          vapi_assistant_id: string | null
          vapi_assistant_name: string | null
          version: number
        }
        Insert: {
          batch_label?: string | null
          condition: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          parent_version_id?: string | null
          prompt_text: string
          updated_at?: string
          vapi_assistant_id?: string | null
          vapi_assistant_name?: string | null
          version?: number
        }
        Update: {
          batch_label?: string | null
          condition?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          parent_version_id?: string | null
          prompt_text?: string
          updated_at?: string
          vapi_assistant_id?: string | null
          vapi_assistant_name?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "vapi_prompts_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "vapi_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_next_condition_assignment: {
        Args: { p_prolific_id: string }
        Returns: Json
      }
      get_researcher_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["researcher_role"]
      }
      is_researcher: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      next_researcher_prolific_id: { Args: never; Returns: string }
    }
    Enums: {
      researcher_role: "super_admin" | "viewer"
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
      researcher_role: ["super_admin", "viewer"],
    },
  },
} as const
