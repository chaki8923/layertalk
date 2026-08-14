// 自動生成ファイル — 手で編集しないこと。
// 再生成: Supabase MCP の generate_typescript_types (project_id: xnqduwlagmfaxzsaaicj) の出力で置き換える。

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      comment_likes: {
        Row: {
          client_id: string;
          comment_id: string;
          created_at: string;
        };
        Insert: {
          client_id: string;
          comment_id: string;
          created_at?: string;
        };
        Update: {
          client_id?: string;
          comment_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          is_question: boolean;
          likes_count: number;
          room_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          is_question?: boolean;
          likes_count?: number;
          room_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          is_question?: boolean;
          likes_count?: number;
          room_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      room_stamps: {
        Row: {
          client_id: string;
          created_at: string;
          id: string;
          path: string;
          room_id: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          id?: string;
          path: string;
          room_id: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          id?: string;
          path?: string;
          room_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "room_stamps_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      rooms: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          language: string;
          title: string | null;
        };
        Insert: {
          code?: string;
          created_at?: string;
          id?: string;
          language?: string;
          title?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          language?: string;
          title?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      gen_room_code: { Args: never; Returns: string };
      liked_comment_ids: {
        Args: { p_client_id: string; p_room_id: string };
        Returns: string[];
      };
      set_room_language: {
        Args: { p_language: string; p_room_id: string };
        Returns: string;
      };
      toggle_comment_like: {
        Args: { p_client_id: string; p_comment_id: string };
        Returns: number;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DefaultSchema = Database["public"];

export type Tables<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Row"];

export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Update"];
