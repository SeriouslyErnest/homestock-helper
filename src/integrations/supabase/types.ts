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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_directory: {
        Row: {
          display_name: string | null
          email_hash: string
          email_masked: string
          first_seen_at: string
          last_seen_at: string
          user_id: string
        }
        Insert: {
          display_name?: string | null
          email_hash: string
          email_masked: string
          first_seen_at?: string
          last_seen_at?: string
          user_id: string
        }
        Update: {
          display_name?: string | null
          email_hash?: string
          email_masked?: string
          first_seen_at?: string
          last_seen_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action_type: string
          admin_user_id: string
          after_json: Json | null
          before_json: Json | null
          created_at: string
          id: string
          reason: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action_type: string
          admin_user_id: string
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          id?: string
          reason?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action_type?: string
          admin_user_id?: string
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          id?: string
          reason?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          bootstrap: boolean | null
          created_at: string
          note: string | null
          role: string
          user_id: string
        }
        Insert: {
          bootstrap?: boolean | null
          created_at?: string
          note?: string | null
          role?: string
          user_id: string
        }
        Update: {
          bootstrap?: boolean | null
          created_at?: string
          note?: string | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      app_plans: {
        Row: {
          created_at: string
          enforced: boolean
          max_items: number
          max_members: number
          max_owned_households: number
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enforced?: boolean
          max_items?: number
          max_members: number
          max_owned_households: number
          tier: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enforced?: boolean
          max_items?: number
          max_members?: number
          max_owned_households?: number
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      entitlement_grants: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          promo_code: string | null
          reason: string | null
          revoked_at: string | null
          source: string
          starts_at: string
          tier: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          promo_code?: string | null
          reason?: string | null
          revoked_at?: string | null
          source: string
          starts_at?: string
          tier: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          promo_code?: string | null
          reason?: string | null
          revoked_at?: string | null
          source?: string
          starts_at?: string
          tier?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlement_grants_promo_code_fkey"
            columns: ["promo_code"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "entitlement_grants_tier_fkey"
            columns: ["tier"]
            isOneToOne: false
            referencedRelation: "app_plans"
            referencedColumns: ["tier"]
          },
        ]
      }
      household_join_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          display_name: string | null
          email: string | null
          household_id: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          display_name?: string | null
          email?: string | null
          household_id: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          display_name?: string | null
          email?: string | null
          household_id?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_join_requests_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          created_at: string
          display_name: string | null
          household_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          household_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          household_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string
          id: string
          invite_code: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          invite_code?: string
          name?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          invite_code?: string
          name?: string
        }
        Relationships: []
      }
      items: {
        Row: {
          barcode: string | null
          category: string
          created_at: string
          created_by: string | null
          expires_on: string | null
          household_id: string
          id: string
          image_url: string | null
          location: string | null
          min_quantity: number
          name: string
          notes: string | null
          quantity: number
          unit: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          expires_on?: string | null
          household_id: string
          id?: string
          image_url?: string | null
          location?: string | null
          min_quantity?: number
          name: string
          notes?: string | null
          quantity?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          expires_on?: string | null
          household_id?: string
          id?: string
          image_url?: string | null
          location?: string | null
          min_quantity?: number
          name?: string
          notes?: string | null
          quantity?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string
          brand: string | null
          fetched_at: string
          image_url: string | null
          name: string | null
          quantity_label: string | null
          source: string
        }
        Insert: {
          barcode: string
          brand?: string | null
          fetched_at?: string
          image_url?: string | null
          name?: string | null
          quantity_label?: string | null
          source?: string
        }
        Update: {
          barcode?: string
          brand?: string | null
          fetched_at?: string
          image_url?: string | null
          name?: string | null
          quantity_label?: string | null
          source?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          code: string
          created_at: string
          grant_id: string | null
          id: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          grant_id?: string | null
          id?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          grant_id?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "promo_redemptions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "entitlement_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          campaign_name: string
          code: string
          created_at: string
          created_by: string | null
          duration_days: number
          ends_at: string | null
          max_redemptions: number | null
          per_account_limit: number
          starts_at: string
          status: string
          tier: string
          updated_at: string
        }
        Insert: {
          campaign_name: string
          code: string
          created_at?: string
          created_by?: string | null
          duration_days?: number
          ends_at?: string | null
          max_redemptions?: number | null
          per_account_limit?: number
          starts_at?: string
          status?: string
          tier: string
          updated_at?: string
        }
        Update: {
          campaign_name?: string
          code?: string
          created_at?: string
          created_by?: string | null
          duration_days?: number
          ends_at?: string | null
          max_redemptions?: number | null
          per_account_limit?: number
          starts_at?: string
          status?: string
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_tier_fkey"
            columns: ["tier"]
            isOneToOne: false
            referencedRelation: "app_plans"
            referencedColumns: ["tier"]
          },
        ]
      }
      shopping_items: {
        Row: {
          bought_at: string | null
          created_at: string
          household_id: string
          id: string
          item_id: string | null
          name: string
          note: string | null
          quantity: number
          requested_by: string | null
          status: string
          stock_applied: number
          tags: string[]
        }
        Insert: {
          bought_at?: string | null
          created_at?: string
          household_id: string
          id?: string
          item_id?: string | null
          name: string
          note?: string | null
          quantity?: number
          requested_by?: string | null
          status?: string
          stock_applied?: number
          tags?: string[]
        }
        Update: {
          bought_at?: string | null
          created_at?: string
          household_id?: string
          id?: string
          item_id?: string | null
          name?: string
          note?: string | null
          quantity?: number
          requested_by?: string | null
          status?: string
          stock_applied?: number
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "shopping_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email_hash: string
          email_masked: string
          id: string
          invited_by: string | null
          last_sent_at: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email_hash: string
          email_masked: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email_hash?: string
          email_masked?: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_plans: {
        Row: {
          created_at: string
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_plans_tier_fkey"
            columns: ["tier"]
            isOneToOne: false
            referencedRelation: "app_plans"
            referencedColumns: ["tier"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_item_quantity: {
        Args: { _delta: number; _item_id: string }
        Returns: number
      }
      create_household: {
        Args: { _name: string }
        Returns: {
          created_at: string
          created_by: string
          id: string
          invite_code: string
          name: string
        }
        SetofOptions: {
          from: "*"
          to: "households"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decide_join_request: {
        Args: { _decision: string; _request_id: string }
        Returns: string
      }
      effective_tier: { Args: { _user_id: string }; Returns: string }
      join_household_by_code: { Args: { _code: string }; Returns: string }
      my_access: {
        Args: never
        Returns: {
          ends_at: string
          source: string
          tier: string
        }[]
      }
      my_entitlements: { Args: never; Returns: Json }
      my_join_requests: {
        Args: never
        Returns: {
          created_at: string
          household_id: string
          household_name: string
          id: string
          status: string
        }[]
      }
      plan_for_user: {
        Args: { _user_id: string }
        Returns: {
          created_at: string
          enforced: boolean
          max_items: number
          max_members: number
          max_owned_households: number
          tier: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "app_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      redeem_promo: { Args: { _code: string }; Returns: Json }
      request_household_join: { Args: { _code: string }; Returns: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
