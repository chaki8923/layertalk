// Supabase schema mirror. Regenerate with generate_typescript_types after the
// monetization migration is applied to the hosted project.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.15" };
  public: {
    Tables: {
      rooms: Table<{
        id: string; code: string; title: string | null; language: string; owner_id: string;
        created_at: string; updated_at: string;
      }, {
        id?: string; code?: string; title?: string | null; language?: string; owner_id: string;
        created_at?: string; updated_at?: string;
      }>;
      comments: Table<{
        id: string; room_id: string; content: string; is_question: boolean; likes_count: number;
        status: "approved" | "pending" | "hidden"; question_status: "open" | "answered" | null;
        presentation_session_id: string | null; moderated_by: string | null;
        moderated_at: string | null; created_at: string;
      }, {
        id?: string; room_id: string; content: string; is_question?: boolean; likes_count?: number;
        status?: "approved" | "pending" | "hidden"; question_status?: "open" | "answered" | null;
        presentation_session_id?: string | null; moderated_by?: string | null;
        moderated_at?: string | null; created_at?: string;
      }>;
      comment_likes: Table<{
        comment_id: string; client_id: string; created_at: string;
      }, { comment_id: string; client_id: string; created_at?: string }>;
      room_stamps: Table<{
        id: string; room_id: string; path: string; client_id: string;
        owner_user_id: string | null; created_at: string;
      }, {
        id?: string; room_id: string; path: string; client_id: string;
        owner_user_id?: string | null; created_at?: string;
      }>;
      presenter_profiles: Table<{
        id: string; stripe_customer_id: string | null; created_at: string; updated_at: string;
      }>;
      room_members: Table<{
        room_id: string; user_id: string; role: "owner" | "moderator"; created_at: string;
      }>;
      audience_room_access: Table<{
        room_id: string; user_id: string; expires_at: string; created_at: string;
      }>;
      entitlements: Table<{
        id: string; owner_id: string; room_id: string; kind: "event_pass" | "beta";
        source: "stripe" | "manual" | "promotion"; status: "active" | "revoked";
        starts_at: string; expires_at: string; history_expires_at: string;
        stripe_checkout_session_id: string | null; stripe_payment_intent_id: string | null;
        stripe_price_id: string | null; amount_total: number | null; currency: string | null;
        revoked_at: string | null; revoked_reason: string | null; created_at: string; updated_at: string;
      }>;
      checkout_attempts: Table<{
        id: string; owner_id: string; room_id: string; stripe_checkout_session_id: string | null;
        checkout_url: string | null; status: "creating" | "open" | "paid" | "expired" | "failed";
        expires_at: string | null; created_at: string; updated_at: string;
      }, {
        id: string; owner_id: string; room_id: string; stripe_checkout_session_id?: string | null;
        checkout_url?: string | null; status?: "creating" | "open" | "paid" | "expired" | "failed";
        expires_at?: string | null; created_at?: string; updated_at?: string;
      }>;
      billing_events: Table<{
        stripe_event_id: string; event_type: string; object_id: string | null; livemode: boolean;
        api_version: string | null; status: "processed" | "ignored" | "failed";
        error_message: string | null; received_at: string; processed_at: string | null;
      }>;
      presentation_sessions: Table<{
        id: string; room_id: string; owner_id: string; entitlement_id: string | null;
        entitlement_snapshot: Json; started_at: string; ended_at: string | null; created_at: string;
      }>;
      moderation_rules: Table<{
        room_id: string; comments_paused: boolean; reactions_paused: boolean; question_only: boolean;
        approval_mode: boolean; display_delay_seconds: number; custom_stamps_enabled: boolean;
        entry_passcode_hash: string | null; updated_at: string;
      }>;
      moderation_terms: Table<{
        id: string; room_id: string; term: string; match_mode: "exact" | "contains"; created_at: string;
      }, {
        id?: string; room_id: string; term: string; match_mode: "exact" | "contains"; created_at?: string;
      }>;
      moderation_actions: Table<{
        id: number; room_id: string; comment_id: string | null; actor_id: string;
        action: "approve" | "hide" | "restore" | "mark_answered" | "mark_open"; created_at: string;
      }>;
      room_branding: Table<{
        room_id: string; hide_layertalk_branding: boolean; brand_color: string;
        logo_path: string | null; updated_at: string;
      }>;
      display_presets: Table<{
        id: string; owner_id: string; name: string; display_mode: "flow" | "bubble";
        show_join_qr: boolean; allow_custom_stamps: boolean; hide_layertalk_branding: boolean;
        brand_color: string; logo_path: string | null; created_at: string; updated_at: string;
      }>;
      stamp_events: Table<{
        id: number; room_id: string; presentation_session_id: string | null; sender_id: string;
        stamp_key: string; count: number; created_at: string;
      }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      gen_room_code: { Args: never; Returns: string };
      find_public_room_by_code: {
        Args: { p_code: string };
        Returns: Array<{ id: string; code: string; title: string | null; language: string; requires_passcode: boolean }>;
      };
      create_room: {
        Args: { p_title?: string | null; p_language?: string };
        Returns: Database["public"]["Tables"]["rooms"]["Row"];
      };
      resume_room: {
        Args: { p_code: string };
        Returns: Database["public"]["Tables"]["rooms"]["Row"];
      };
      join_room: {
        Args: { p_code: string; p_passcode?: string | null };
        Returns: Array<{ id: string; code: string; title: string | null; language: string }>;
      };
      set_room_language: { Args: { p_room_id: string; p_language: string }; Returns: string };
      set_room_passcode: { Args: { p_room_id: string; p_passcode?: string | null }; Returns: undefined };
      post_comment: {
        Args: { p_id: string; p_room_id: string; p_content: string; p_is_question?: boolean };
        Returns: Database["public"]["Tables"]["comments"]["Row"];
      };
      moderate_comment: {
        Args: { p_comment_id: string; p_action: string };
        Returns: Database["public"]["Tables"]["comments"]["Row"];
      };
      toggle_comment_like: { Args: { p_comment_id: string; p_client_id: string }; Returns: number };
      liked_comment_ids: { Args: { p_room_id: string; p_client_id: string }; Returns: string[] };
      start_presentation: {
        Args: { p_room_id: string };
        Returns: Database["public"]["Tables"]["presentation_sessions"]["Row"];
      };
      end_presentation: {
        Args: { p_session_id: string };
        Returns: Database["public"]["Tables"]["presentation_sessions"]["Row"];
      };
      reserve_room_stamp: {
        Args: { p_room_id: string; p_client_id: string };
        Returns: Database["public"]["Tables"]["room_stamps"]["Row"];
      };
      delete_room_stamp: { Args: { p_stamp_id: string }; Returns: string };
      send_stamp: {
        Args: { p_room_id: string; p_stamp_key: string; p_count: number };
        Returns: Json;
      };
      fulfill_event_pass: { Args: Record<string, unknown>; Returns: Database["public"]["Tables"]["entitlements"]["Row"] };
      revoke_event_pass: { Args: Record<string, unknown>; Returns: number };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type DefaultSchema = Database["public"];
export type Tables<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Update"];
