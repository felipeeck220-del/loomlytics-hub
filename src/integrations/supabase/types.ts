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
      accounts_payable: {
        Row: {
          amount: number
          category: string | null
          company_id: string
          created_at: string
          description: string
          due_date: string
          id: string
          notification_error: string | null
          notification_sent: boolean
          notification_status: string
          observations: string | null
          paid_amount: number | null
          paid_at: string | null
          receipt_change_count: number
          receipt_url: string | null
          short_id: string | null
          status: string
          supplier_name: string
          updated_at: string
          whatsapp_number: string
        }
        Insert: {
          amount?: number
          category?: string | null
          company_id: string
          created_at?: string
          description: string
          due_date: string
          id?: string
          notification_error?: string | null
          notification_sent?: boolean
          notification_status?: string
          observations?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          receipt_change_count?: number
          receipt_url?: string | null
          short_id?: string | null
          status?: string
          supplier_name: string
          updated_at?: string
          whatsapp_number: string
        }
        Update: {
          amount?: number
          category?: string | null
          company_id?: string
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          notification_error?: string | null
          notification_sent?: boolean
          notification_status?: string
          observations?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          receipt_change_count?: number
          receipt_url?: string | null
          short_id?: string | null
          status?: string
          supplier_name?: string
          updated_at?: string
          whatsapp_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      article_change_orders: {
        Row: {
          adjustment_by_code: string | null
          adjustment_by_name: string | null
          adjustment_ended_at: string | null
          adjustment_finished_by_code: string | null
          adjustment_finished_by_name: string | null
          adjustment_started_at: string | null
          cancelled_at: string | null
          cancelled_by_code: string | null
          cancelled_by_name: string | null
          company_id: string
          concluded_at: string | null
          concluded_by_code: string | null
          concluded_by_name: string | null
          created_at: string
          created_by_code: string | null
          created_by_id: string | null
          created_by_name: string | null
          current_article_id: string | null
          final_report: string | null
          id: string
          machine_id: string
          monitoring_started_at: string | null
          monitoring_turns: number | null
          next_article_id: string | null
          observations: string | null
          ot_number: number | null
          piece_defects_flaws: number | null
          piece_defects_holes: number | null
          status: Database["public"]["Enums"]["article_change_status"]
          updated_at: string
          yarn_change_by_code: string | null
          yarn_change_by_name: string | null
          yarn_change_ended_at: string | null
          yarn_change_finished_by_code: string | null
          yarn_change_finished_by_name: string | null
          yarn_change_started_at: string | null
        }
        Insert: {
          adjustment_by_code?: string | null
          adjustment_by_name?: string | null
          adjustment_ended_at?: string | null
          adjustment_finished_by_code?: string | null
          adjustment_finished_by_name?: string | null
          adjustment_started_at?: string | null
          cancelled_at?: string | null
          cancelled_by_code?: string | null
          cancelled_by_name?: string | null
          company_id: string
          concluded_at?: string | null
          concluded_by_code?: string | null
          concluded_by_name?: string | null
          created_at?: string
          created_by_code?: string | null
          created_by_id?: string | null
          created_by_name?: string | null
          current_article_id?: string | null
          final_report?: string | null
          id?: string
          machine_id: string
          monitoring_started_at?: string | null
          monitoring_turns?: number | null
          next_article_id?: string | null
          observations?: string | null
          ot_number?: number | null
          piece_defects_flaws?: number | null
          piece_defects_holes?: number | null
          status?: Database["public"]["Enums"]["article_change_status"]
          updated_at?: string
          yarn_change_by_code?: string | null
          yarn_change_by_name?: string | null
          yarn_change_ended_at?: string | null
          yarn_change_finished_by_code?: string | null
          yarn_change_finished_by_name?: string | null
          yarn_change_started_at?: string | null
        }
        Update: {
          adjustment_by_code?: string | null
          adjustment_by_name?: string | null
          adjustment_ended_at?: string | null
          adjustment_finished_by_code?: string | null
          adjustment_finished_by_name?: string | null
          adjustment_started_at?: string | null
          cancelled_at?: string | null
          cancelled_by_code?: string | null
          cancelled_by_name?: string | null
          company_id?: string
          concluded_at?: string | null
          concluded_by_code?: string | null
          concluded_by_name?: string | null
          created_at?: string
          created_by_code?: string | null
          created_by_id?: string | null
          created_by_name?: string | null
          current_article_id?: string | null
          final_report?: string | null
          id?: string
          machine_id?: string
          monitoring_started_at?: string | null
          monitoring_turns?: number | null
          next_article_id?: string | null
          observations?: string | null
          ot_number?: number | null
          piece_defects_flaws?: number | null
          piece_defects_holes?: number | null
          status?: Database["public"]["Enums"]["article_change_status"]
          updated_at?: string
          yarn_change_by_code?: string | null
          yarn_change_by_name?: string | null
          yarn_change_ended_at?: string | null
          yarn_change_finished_by_code?: string | null
          yarn_change_finished_by_name?: string | null
          yarn_change_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "article_change_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_change_orders_current_article_id_fkey"
            columns: ["current_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_change_orders_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_change_orders_next_article_id_fkey"
            columns: ["next_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_change_yarns: {
        Row: {
          company_id: string
          created_at: string
          feeder_position: number
          feeder_type: Database["public"]["Enums"]["article_change_feeder_type"]
          id: string
          lfa: number | null
          observation: string | null
          order_id: string
          stretch: number | null
          yarn_label: string | null
          yarn_type_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          feeder_position: number
          feeder_type: Database["public"]["Enums"]["article_change_feeder_type"]
          id?: string
          lfa?: number | null
          observation?: string | null
          order_id: string
          stretch?: number | null
          yarn_label?: string | null
          yarn_type_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          feeder_position?: number
          feeder_type?: Database["public"]["Enums"]["article_change_feeder_type"]
          id?: string
          lfa?: number | null
          observation?: string | null
          order_id?: string
          stretch?: number | null
          yarn_label?: string | null
          yarn_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "article_change_yarns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_change_yarns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "article_change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_change_yarns_yarn_type_id_fkey"
            columns: ["yarn_type_id"]
            isOneToOne: false
            referencedRelation: "yarn_types"
            referencedColumns: ["id"]
          },
        ]
      }
      article_machine_turns: {
        Row: {
          article_id: string
          company_id: string
          created_at: string
          id: string
          machine_id: string
          observations: string | null
          turns_per_roll: number
        }
        Insert: {
          article_id: string
          company_id: string
          created_at?: string
          id?: string
          machine_id: string
          observations?: string | null
          turns_per_roll: number
        }
        Update: {
          article_id?: string
          company_id?: string
          created_at?: string
          id?: string
          machine_id?: string
          observations?: string | null
          turns_per_roll?: number
        }
        Relationships: [
          {
            foreignKeyName: "article_machine_turns_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_machine_turns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_machine_turns_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          client_id: string | null
          client_name: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          observations: string | null
          target_efficiency: number
          turns_per_roll: number
          value_per_kg: number
          weight_per_roll: number
          yarn_type_id: string | null
        }
        Insert: {
          client_id?: string | null
          client_name?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
          observations?: string | null
          target_efficiency?: number
          turns_per_roll?: number
          value_per_kg?: number
          weight_per_roll?: number
          yarn_type_id?: string | null
        }
        Update: {
          client_id?: string | null
          client_name?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          observations?: string | null
          target_efficiency?: number
          turns_per_roll?: number
          value_per_kg?: number
          weight_per_roll?: number
          yarn_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "articles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_yarn_type_id_fkey"
            columns: ["yarn_type_id"]
            isOneToOne: false
            referencedRelation: "yarn_types"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          company_id: string
          created_at: string
          details: Json | null
          id: string
          user_code: string | null
          user_id: string | null
          user_name: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          details?: Json | null
          id?: string
          user_code?: string | null
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          user_code?: string | null
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      billing_order_pallets: {
        Row: {
          alt_article_id: string | null
          alt_client_id: string | null
          billing_order_id: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          machine_id: string | null
          own_article_id: string | null
          own_stock_movement_id: string | null
          pallet_number: number
          pieces: number
          reserve_movement_id: string | null
          weight_kg: number
        }
        Insert: {
          alt_article_id?: string | null
          alt_client_id?: string | null
          billing_order_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          machine_id?: string | null
          own_article_id?: string | null
          own_stock_movement_id?: string | null
          pallet_number: number
          pieces?: number
          reserve_movement_id?: string | null
          weight_kg?: number
        }
        Update: {
          alt_article_id?: string | null
          alt_client_id?: string | null
          billing_order_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          machine_id?: string | null
          own_article_id?: string | null
          own_stock_movement_id?: string | null
          pallet_number?: number
          pieces?: number
          reserve_movement_id?: string | null
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_order_pallets_alt_article_id_fkey"
            columns: ["alt_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_order_pallets_alt_client_id_fkey"
            columns: ["alt_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_order_pallets_billing_order_id_fkey"
            columns: ["billing_order_id"]
            isOneToOne: false
            referencedRelation: "billing_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_order_pallets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_order_pallets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_order_pallets_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_order_pallets_own_article_id_fkey"
            columns: ["own_article_id"]
            isOneToOne: false
            referencedRelation: "own_stock_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_order_pallets_own_stock_movement_id_fkey"
            columns: ["own_stock_movement_id"]
            isOneToOne: false
            referencedRelation: "own_stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_order_pallets_reserve_movement_id_fkey"
            columns: ["reserve_movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_orders: {
        Row: {
          admin_notes: string | null
          article_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string
          collected_at: string | null
          collected_by: string | null
          company_id: string
          created_at: string
          created_by: string
          delivery_doc_number: string | null
          delivery_doc_set_at: string | null
          delivery_doc_set_by: string | null
          delivery_doc_type:
            | Database["public"]["Enums"]["billing_delivery_doc_type"]
            | null
          dyehouse: string
          edit_note: string | null
          id: string
          last_edited_at: string | null
          last_edited_by: string | null
          link_group_id: string | null
          machine_id: string | null
          of_number: string
          order_type: string
          piece_weight_target: number | null
          pieces_expected: number | null
          pieces_real: number | null
          priority: boolean | null
          priority_at: string | null
          priority_by: string | null
          priority_reason: string | null
          reversal_quality: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          reverted_from: string | null
          separated_by: string | null
          status: Database["public"]["Enums"]["billing_order_status"]
          updated_at: string
          weight_avg: number | null
          weight_expected: number | null
          weight_real: number | null
        }
        Insert: {
          admin_notes?: string | null
          article_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id: string
          collected_at?: string | null
          collected_by?: string | null
          company_id: string
          created_at?: string
          created_by: string
          delivery_doc_number?: string | null
          delivery_doc_set_at?: string | null
          delivery_doc_set_by?: string | null
          delivery_doc_type?:
            | Database["public"]["Enums"]["billing_delivery_doc_type"]
            | null
          dyehouse: string
          edit_note?: string | null
          id?: string
          last_edited_at?: string | null
          last_edited_by?: string | null
          link_group_id?: string | null
          machine_id?: string | null
          of_number: string
          order_type?: string
          piece_weight_target?: number | null
          pieces_expected?: number | null
          pieces_real?: number | null
          priority?: boolean | null
          priority_at?: string | null
          priority_by?: string | null
          priority_reason?: string | null
          reversal_quality?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          reverted_from?: string | null
          separated_by?: string | null
          status?: Database["public"]["Enums"]["billing_order_status"]
          updated_at?: string
          weight_avg?: number | null
          weight_expected?: number | null
          weight_real?: number | null
        }
        Update: {
          admin_notes?: string | null
          article_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string
          collected_at?: string | null
          collected_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          delivery_doc_number?: string | null
          delivery_doc_set_at?: string | null
          delivery_doc_set_by?: string | null
          delivery_doc_type?:
            | Database["public"]["Enums"]["billing_delivery_doc_type"]
            | null
          dyehouse?: string
          edit_note?: string | null
          id?: string
          last_edited_at?: string | null
          last_edited_by?: string | null
          link_group_id?: string | null
          machine_id?: string | null
          of_number?: string
          order_type?: string
          piece_weight_target?: number | null
          pieces_expected?: number | null
          pieces_real?: number | null
          priority?: boolean | null
          priority_at?: string | null
          priority_by?: string | null
          priority_reason?: string | null
          reversal_quality?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          reverted_from?: string | null
          separated_by?: string | null
          status?: Database["public"]["Enums"]["billing_order_status"]
          updated_at?: string
          weight_avg?: number | null
          weight_expected?: number | null
          weight_real?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_orders_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_delivery_doc_set_by_fkey"
            columns: ["delivery_doc_set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_last_edited_by_fkey"
            columns: ["last_edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_priority_by_fkey"
            columns: ["priority_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_separated_by_fkey"
            columns: ["separated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invoice_exit_links: {
        Row: {
          company_id: string
          created_at: string
          deduct_kg: number
          entry_invoice_id: string
          exit_invoice_id: string
          id: string
          yarn_type_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          deduct_kg?: number
          entry_invoice_id: string
          exit_invoice_id: string
          id?: string
          yarn_type_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          deduct_kg?: number
          entry_invoice_id?: string
          exit_invoice_id?: string
          id?: string
          yarn_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_invoice_exit_links_entry_invoice_id_fkey"
            columns: ["entry_invoice_id"]
            isOneToOne: false
            referencedRelation: "client_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invoice_exit_links_exit_invoice_id_fkey"
            columns: ["exit_invoice_id"]
            isOneToOne: false
            referencedRelation: "client_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invoice_items: {
        Row: {
          article_id: string | null
          company_id: string
          created_at: string
          id: string
          invoice_id: string
          weight_kg: number
          yarn_type_id: string | null
        }
        Insert: {
          article_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          invoice_id: string
          weight_kg?: number
          yarn_type_id?: string | null
        }
        Update: {
          article_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          invoice_id?: string
          weight_kg?: number
          yarn_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_invoice_items_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invoice_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "client_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invoice_items_yarn_type_id_fkey"
            columns: ["yarn_type_id"]
            isOneToOne: false
            referencedRelation: "yarn_types"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invoices: {
        Row: {
          client_id: string
          company_id: string
          composition: Json | null
          created_at: string
          created_by_code: string | null
          created_by_name: string | null
          id: string
          invoice_number: string
          issue_date: string
          observations: string | null
          parent_invoice_id: string | null
          supplier_name: string | null
          type: Database["public"]["Enums"]["client_invoice_type"]
          updated_at: string
        }
        Insert: {
          client_id: string
          company_id: string
          composition?: Json | null
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          id?: string
          invoice_number: string
          issue_date: string
          observations?: string | null
          parent_invoice_id?: string | null
          supplier_name?: string | null
          type: Database["public"]["Enums"]["client_invoice_type"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          company_id?: string
          composition?: Json | null
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          observations?: string | null
          parent_invoice_id?: string | null
          supplier_name?: string | null
          type?: Database["public"]["Enums"]["client_invoice_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "client_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          company_id: string
          contact: string | null
          created_at: string
          id: string
          name: string
          observations: string | null
        }
        Insert: {
          company_id: string
          contact?: string | null
          created_at?: string
          id?: string
          name: string
          observations?: string | null
        }
        Update: {
          company_id?: string
          contact?: string | null
          created_at?: string
          id?: string
          name?: string
          observations?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          admin_email: string
          admin_name: string
          created_at: string
          id: string
          logo_url: string | null
          name: string
          slug: string
          whatsapp: string | null
        }
        Insert: {
          admin_email: string
          admin_name: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          whatsapp?: string | null
        }
        Update: {
          admin_email?: string
          admin_name?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      company_backups: {
        Row: {
          backup_date: string
          company_id: string
          created_at: string
          data: Json
          id: string
        }
        Insert: {
          backup_date: string
          company_id: string
          created_at?: string
          data: Json
          id?: string
        }
        Update: {
          backup_date?: string
          company_id?: string
          created_at?: string
          data?: Json
          id?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          company_id: string
          created_at: string
          enabled_nav_items: Json
          grace_period_end: string | null
          id: string
          monthly_plan_value: number
          platform_active: boolean
          shift_manha_end: string
          shift_manha_start: string
          shift_noite_end: string
          shift_noite_start: string
          shift_tarde_end: string
          shift_tarde_start: string
          stock_cutoff_date: string | null
          stripe_customer_id: string | null
          subscription_paid_at: string | null
          subscription_plan: string | null
          subscription_status: string
          trial_end_date: string | null
          tv_code: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          enabled_nav_items?: Json
          grace_period_end?: string | null
          id?: string
          monthly_plan_value?: number
          platform_active?: boolean
          shift_manha_end?: string
          shift_manha_start?: string
          shift_noite_end?: string
          shift_noite_start?: string
          shift_tarde_end?: string
          shift_tarde_start?: string
          stock_cutoff_date?: string | null
          stripe_customer_id?: string | null
          subscription_paid_at?: string | null
          subscription_plan?: string | null
          subscription_status?: string
          trial_end_date?: string | null
          tv_code?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enabled_nav_items?: Json
          grace_period_end?: string | null
          id?: string
          monthly_plan_value?: number
          platform_active?: boolean
          shift_manha_end?: string
          shift_manha_start?: string
          shift_noite_end?: string
          shift_noite_start?: string
          shift_tarde_end?: string
          shift_tarde_start?: string
          stock_cutoff_date?: string | null
          stripe_customer_id?: string | null
          subscription_paid_at?: string | null
          subscription_plan?: string | null
          subscription_status?: string
          trial_end_date?: string | null
          tv_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cylinders: {
        Row: {
          brand: string
          company_id: string
          created_at: string
          diameter: string | null
          feeder_quantity: number | null
          fineness: string | null
          id: string
          machine_id: string | null
          model: string | null
          needle_quantity: number | null
          observations: string | null
          sinker_quantity: number | null
          updated_at: string
        }
        Insert: {
          brand: string
          company_id: string
          created_at?: string
          diameter?: string | null
          feeder_quantity?: number | null
          fineness?: string | null
          id?: string
          machine_id?: string | null
          model?: string | null
          needle_quantity?: number | null
          observations?: string | null
          sinker_quantity?: number | null
          updated_at?: string
        }
        Update: {
          brand?: string
          company_id?: string
          created_at?: string
          diameter?: string | null
          feeder_quantity?: number | null
          fineness?: string | null
          id?: string
          machine_id?: string | null
          model?: string | null
          needle_quantity?: number | null
          observations?: string | null
          sinker_quantity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cylinders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cylinders_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      defect_records: {
        Row: {
          article_id: string | null
          article_name: string | null
          company_id: string
          created_at: string
          created_by_code: string | null
          created_by_name: string | null
          date: string
          id: string
          machine_id: string | null
          machine_name: string | null
          measure_type: string
          measure_value: number
          observations: string | null
          shift: string
          weaver_id: string | null
          weaver_name: string | null
        }
        Insert: {
          article_id?: string | null
          article_name?: string | null
          company_id: string
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          date: string
          id?: string
          machine_id?: string | null
          machine_name?: string | null
          measure_type?: string
          measure_value?: number
          observations?: string | null
          shift: string
          weaver_id?: string | null
          weaver_name?: string | null
        }
        Update: {
          article_id?: string | null
          article_name?: string | null
          company_id?: string
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          date?: string
          id?: string
          machine_id?: string | null
          machine_name?: string | null
          measure_type?: string
          measure_value?: number
          observations?: string | null
          shift?: string
          weaver_id?: string | null
          weaver_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "defect_records_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_records_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_records_weaver_id_fkey"
            columns: ["weaver_id"]
            isOneToOne: false
            referencedRelation: "weavers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_history: {
        Row: {
          changed_by: string | null
          company_id: string
          created_at: string
          id: string
          new_email: string
          old_email: string
        }
        Insert: {
          changed_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          new_email: string
          old_email: string
        }
        Update: {
          changed_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          new_email?: string
          old_email?: string
        }
        Relationships: []
      }
      freight_cost_companies: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          document: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          document?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          document?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      freight_order_items: {
        Row: {
          article_id: string | null
          article_name: string | null
          boxes: number | null
          company_id: string
          created_at: string
          freight_order_id: string
          id: string
          item_type: string
          pieces: number
          weight_kg: number
          yarn_type_id: string | null
          yarn_type_name: string | null
        }
        Insert: {
          article_id?: string | null
          article_name?: string | null
          boxes?: number | null
          company_id: string
          created_at?: string
          freight_order_id: string
          id?: string
          item_type?: string
          pieces?: number
          weight_kg?: number
          yarn_type_id?: string | null
          yarn_type_name?: string | null
        }
        Update: {
          article_id?: string | null
          article_name?: string | null
          boxes?: number | null
          company_id?: string
          created_at?: string
          freight_order_id?: string
          id?: string
          item_type?: string
          pieces?: number
          weight_kg?: number
          yarn_type_id?: string | null
          yarn_type_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "freight_order_items_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_order_items_freight_order_id_fkey"
            columns: ["freight_order_id"]
            isOneToOne: false
            referencedRelation: "freight_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_order_items_yarn_type_id_fkey"
            columns: ["yarn_type_id"]
            isOneToOne: false
            referencedRelation: "yarn_types"
            referencedColumns: ["id"]
          },
        ]
      }
      freight_order_photos: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          freight_order_id: string
          id: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          freight_order_id: string
          id?: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          freight_order_id?: string
          id?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "freight_order_photos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_order_photos_freight_order_id_fkey"
            columns: ["freight_order_id"]
            isOneToOne: false
            referencedRelation: "freight_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      freight_orders: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string
          completed_at: string | null
          completed_by: string | null
          cost_company_id: string | null
          cost_company_name: string | null
          created_at: string
          created_by: string | null
          delivery_doc_number: string | null
          delivery_doc_type: string | null
          delivery_location: string
          delivery_started_at: string | null
          delivery_started_by: string | null
          freight_price_per_kg: number | null
          freight_total: number | null
          freighter_id: string
          id: string
          observations: string | null
          ofr_number: string
          pickup_location: string
          pickup_started_at: string | null
          pickup_started_by: string | null
          status: Database["public"]["Enums"]["freight_order_status"]
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id: string
          completed_at?: string | null
          completed_by?: string | null
          cost_company_id?: string | null
          cost_company_name?: string | null
          created_at?: string
          created_by?: string | null
          delivery_doc_number?: string | null
          delivery_doc_type?: string | null
          delivery_location: string
          delivery_started_at?: string | null
          delivery_started_by?: string | null
          freight_price_per_kg?: number | null
          freight_total?: number | null
          freighter_id: string
          id?: string
          observations?: string | null
          ofr_number: string
          pickup_location: string
          pickup_started_at?: string | null
          pickup_started_by?: string | null
          status?: Database["public"]["Enums"]["freight_order_status"]
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id?: string
          completed_at?: string | null
          completed_by?: string | null
          cost_company_id?: string | null
          cost_company_name?: string | null
          created_at?: string
          created_by?: string | null
          delivery_doc_number?: string | null
          delivery_doc_type?: string | null
          delivery_location?: string
          delivery_started_at?: string | null
          delivery_started_by?: string | null
          freight_price_per_kg?: number | null
          freight_total?: number | null
          freighter_id?: string
          id?: string
          observations?: string | null
          ofr_number?: string
          pickup_location?: string
          pickup_started_at?: string | null
          pickup_started_by?: string | null
          status?: Database["public"]["Enums"]["freight_order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "freight_orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_orders_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_orders_cost_company_id_fkey"
            columns: ["cost_company_id"]
            isOneToOne: false
            referencedRelation: "freight_cost_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_orders_delivery_started_by_fkey"
            columns: ["delivery_started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_orders_freighter_id_fkey"
            columns: ["freighter_id"]
            isOneToOne: false
            referencedRelation: "freighters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_orders_pickup_started_by_fkey"
            columns: ["pickup_started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      freighters: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          name: string
          phone: string | null
          profile_id: string | null
          updated_at: string
          user_id: string | null
          vehicle: string | null
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          profile_id?: string | null
          updated_at?: string
          user_id?: string | null
          vehicle?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          profile_id?: string | null
          updated_at?: string
          user_id?: string | null
          vehicle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "freighters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freighters_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          article_id: string | null
          article_name: string | null
          brand: string | null
          company_id: string
          created_at: string
          id: string
          invoice_id: string
          observations: string | null
          quantity_boxes: number | null
          quantity_rolls: number | null
          subtotal: number | null
          value_per_kg: number | null
          weight_kg: number
          yarn_type_id: string | null
          yarn_type_name: string | null
        }
        Insert: {
          article_id?: string | null
          article_name?: string | null
          brand?: string | null
          company_id: string
          created_at?: string
          id?: string
          invoice_id: string
          observations?: string | null
          quantity_boxes?: number | null
          quantity_rolls?: number | null
          subtotal?: number | null
          value_per_kg?: number | null
          weight_kg?: number
          yarn_type_id?: string | null
          yarn_type_name?: string | null
        }
        Update: {
          article_id?: string | null
          article_name?: string | null
          brand?: string | null
          company_id?: string
          created_at?: string
          id?: string
          invoice_id?: string
          observations?: string | null
          quantity_boxes?: number | null
          quantity_rolls?: number | null
          subtotal?: number | null
          value_per_kg?: number | null
          weight_kg?: number
          yarn_type_id?: string | null
          yarn_type_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_yarn_type_id_fkey"
            columns: ["yarn_type_id"]
            isOneToOne: false
            referencedRelation: "yarn_types"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          access_key: string | null
          buyer_name: string | null
          client_id: string | null
          client_name: string | null
          company_id: string
          created_at: string
          created_by_code: string | null
          created_by_name: string | null
          destination_name: string | null
          id: string
          invoice_number: string
          issue_date: string
          observations: string | null
          status: string
          total_value: number | null
          total_weight_kg: number
          type: string
        }
        Insert: {
          access_key?: string | null
          buyer_name?: string | null
          client_id?: string | null
          client_name?: string | null
          company_id: string
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          destination_name?: string | null
          id?: string
          invoice_number: string
          issue_date: string
          observations?: string | null
          status?: string
          total_value?: number | null
          total_weight_kg?: number
          type?: string
        }
        Update: {
          access_key?: string | null
          buyer_name?: string | null
          client_id?: string | null
          client_name?: string | null
          company_id?: string
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          destination_name?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          observations?: string | null
          status?: string
          total_value?: number | null
          total_weight_kg?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      iot_devices: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          firmware_version: string | null
          id: string
          last_seen_at: string | null
          machine_id: string
          name: string | null
          token: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          firmware_version?: string | null
          id?: string
          last_seen_at?: string | null
          machine_id: string
          name?: string | null
          token: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          firmware_version?: string | null
          id?: string
          last_seen_at?: string | null
          machine_id?: string
          name?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "iot_devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iot_devices_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      iot_downtime_events: {
        Row: {
          company_id: string
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          machine_id: string
          shift: string
          started_at: string
          weaver_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          machine_id: string
          shift: string
          started_at: string
          weaver_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          machine_id?: string
          shift?: string
          started_at?: string
          weaver_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iot_downtime_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iot_downtime_events_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iot_downtime_events_weaver_id_fkey"
            columns: ["weaver_id"]
            isOneToOne: false
            referencedRelation: "weavers"
            referencedColumns: ["id"]
          },
        ]
      }
      iot_machine_assignments: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          machine_id: string
          shift: string
          weaver_id: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          machine_id: string
          shift: string
          weaver_id: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          machine_id?: string
          shift?: string
          weaver_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iot_machine_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iot_machine_assignments_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iot_machine_assignments_weaver_id_fkey"
            columns: ["weaver_id"]
            isOneToOne: false
            referencedRelation: "weavers"
            referencedColumns: ["id"]
          },
        ]
      }
      iot_shift_state: {
        Row: {
          article_id: string | null
          company_id: string
          completed_rolls: number
          current_shift: string
          id: string
          last_rpm: number | null
          machine_id: string
          partial_turns: number
          production_id: string | null
          roll_position: number
          rpm_count: number
          rpm_sum: number
          shift_started_at: string
          total_turns: number
          updated_at: string
          weaver_id: string | null
        }
        Insert: {
          article_id?: string | null
          company_id: string
          completed_rolls?: number
          current_shift: string
          id?: string
          last_rpm?: number | null
          machine_id: string
          partial_turns?: number
          production_id?: string | null
          roll_position?: number
          rpm_count?: number
          rpm_sum?: number
          shift_started_at?: string
          total_turns?: number
          updated_at?: string
          weaver_id?: string | null
        }
        Update: {
          article_id?: string | null
          company_id?: string
          completed_rolls?: number
          current_shift?: string
          id?: string
          last_rpm?: number | null
          machine_id?: string
          partial_turns?: number
          production_id?: string | null
          roll_position?: number
          rpm_count?: number
          rpm_sum?: number
          shift_started_at?: string
          total_turns?: number
          updated_at?: string
          weaver_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iot_shift_state_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iot_shift_state_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iot_shift_state_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: true
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iot_shift_state_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iot_shift_state_weaver_id_fkey"
            columns: ["weaver_id"]
            isOneToOne: false
            referencedRelation: "weavers"
            referencedColumns: ["id"]
          },
        ]
      }
      login_history: {
        Row: {
          browser: string | null
          company_id: string
          created_at: string
          device_type: string | null
          id: string
          ip_address: string | null
          location_city: string | null
          location_country: string | null
          os: string | null
          user_agent: string | null
          user_code: string | null
          user_id: string
          user_name: string | null
          user_role: string | null
        }
        Insert: {
          browser?: string | null
          company_id: string
          created_at?: string
          device_type?: string | null
          id?: string
          ip_address?: string | null
          location_city?: string | null
          location_country?: string | null
          os?: string | null
          user_agent?: string | null
          user_code?: string | null
          user_id: string
          user_name?: string | null
          user_role?: string | null
        }
        Update: {
          browser?: string | null
          company_id?: string
          created_at?: string
          device_type?: string | null
          id?: string
          ip_address?: string | null
          location_city?: string | null
          location_country?: string | null
          os?: string | null
          user_agent?: string | null
          user_code?: string | null
          user_id?: string
          user_name?: string | null
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "login_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_logs: {
        Row: {
          company_id: string | null
          ended_at: string | null
          ended_by_code: string | null
          ended_by_name: string | null
          id: string
          machine_id: string
          started_at: string
          started_by_code: string | null
          started_by_name: string | null
          status: Database["public"]["Enums"]["machine_status"]
        }
        Insert: {
          company_id?: string | null
          ended_at?: string | null
          ended_by_code?: string | null
          ended_by_name?: string | null
          id?: string
          machine_id: string
          started_at?: string
          started_by_code?: string | null
          started_by_name?: string | null
          status: Database["public"]["Enums"]["machine_status"]
        }
        Update: {
          company_id?: string | null
          ended_at?: string | null
          ended_by_code?: string | null
          ended_by_name?: string | null
          id?: string
          machine_id?: string
          started_at?: string
          started_by_code?: string | null
          started_by_name?: string | null
          status?: Database["public"]["Enums"]["machine_status"]
        }
        Relationships: [
          {
            foreignKeyName: "machine_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_maintenance_observations: {
        Row: {
          company_id: string
          created_at: string
          id: string
          machine_id: string
          machine_log_id: string
          observation: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          machine_id: string
          machine_log_id: string
          observation: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          machine_id?: string
          machine_log_id?: string
          observation?: string
        }
        Relationships: []
      }
      machine_needle_refs: {
        Row: {
          company_id: string
          created_at: string
          id: string
          machine_id: string
          needle_id: string
          position: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          machine_id: string
          needle_id: string
          position?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          machine_id?: string
          needle_id?: string
          position?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_needle_refs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_needle_refs_needle_id_fkey"
            columns: ["needle_id"]
            isOneToOne: false
            referencedRelation: "needle_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_readings: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_running: boolean
          machine_id: string
          rpm: number
          total_rotations: number
          uptime_ms: number | null
          wifi_rssi: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_running?: boolean
          machine_id: string
          rpm?: number
          total_rotations: number
          uptime_ms?: number | null
          wifi_rssi?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_running?: boolean
          machine_id?: string
          rpm?: number
          total_rotations?: number
          uptime_ms?: number | null
          wifi_rssi?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "machine_readings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_readings_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_sinker_refs: {
        Row: {
          company_id: string
          created_at: string
          id: string
          machine_id: string
          sinker_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          machine_id: string
          sinker_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          machine_id?: string
          sinker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_sinker_refs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_sinker_refs_sinker_id_fkey"
            columns: ["sinker_id"]
            isOneToOne: false
            referencedRelation: "sinker_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      machines: {
        Row: {
          article_id: string | null
          company_id: string
          created_at: string
          current_needle_id: string | null
          current_sinker_id: string | null
          cylinder_id: string | null
          diameter: string | null
          feeder_quantity: number | null
          fineness: string | null
          id: string
          last_needle_change_at: string | null
          last_sinker_change_at: string | null
          machine_type: string | null
          maintenance_interval_days: number | null
          maintenance_kg_target: number | null
          model: string | null
          name: string
          needle_quantity: number | null
          number: number
          observations: string | null
          production_mode: string
          rpm: number
          serial_number: string | null
          status: Database["public"]["Enums"]["machine_status"]
          year: number | null
        }
        Insert: {
          article_id?: string | null
          company_id: string
          created_at?: string
          current_needle_id?: string | null
          current_sinker_id?: string | null
          cylinder_id?: string | null
          diameter?: string | null
          feeder_quantity?: number | null
          fineness?: string | null
          id?: string
          last_needle_change_at?: string | null
          last_sinker_change_at?: string | null
          machine_type?: string | null
          maintenance_interval_days?: number | null
          maintenance_kg_target?: number | null
          model?: string | null
          name: string
          needle_quantity?: number | null
          number: number
          observations?: string | null
          production_mode?: string
          rpm?: number
          serial_number?: string | null
          status?: Database["public"]["Enums"]["machine_status"]
          year?: number | null
        }
        Update: {
          article_id?: string | null
          company_id?: string
          created_at?: string
          current_needle_id?: string | null
          current_sinker_id?: string | null
          cylinder_id?: string | null
          diameter?: string | null
          feeder_quantity?: number | null
          fineness?: string | null
          id?: string
          last_needle_change_at?: string | null
          last_sinker_change_at?: string | null
          machine_type?: string | null
          maintenance_interval_days?: number | null
          maintenance_kg_target?: number | null
          model?: string | null
          name?: string
          needle_quantity?: number | null
          number?: number
          observations?: string | null
          production_mode?: string
          rpm?: number
          serial_number?: string | null
          status?: Database["public"]["Enums"]["machine_status"]
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "machines_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_current_needle_id_fkey"
            columns: ["current_needle_id"]
            isOneToOne: false
            referencedRelation: "needle_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_current_sinker_id_fkey"
            columns: ["current_sinker_id"]
            isOneToOne: false
            referencedRelation: "sinker_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_cylinder_id_fkey"
            columns: ["cylinder_id"]
            isOneToOne: false
            referencedRelation: "cylinders"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_order_items: {
        Row: {
          company_id: string
          created_at: string
          cylinder_id: string | null
          description: string | null
          id: string
          item_type: string
          needle_id: string | null
          order_id: string
          quantity: number
          sinker_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          cylinder_id?: string | null
          description?: string | null
          id?: string
          item_type: string
          needle_id?: string | null
          order_id: string
          quantity?: number
          sinker_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          cylinder_id?: string | null
          description?: string | null
          id?: string
          item_type?: string
          needle_id?: string | null
          order_id?: string
          quantity?: number
          sinker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_order_items_cylinder_id_fkey"
            columns: ["cylinder_id"]
            isOneToOne: false
            referencedRelation: "cylinders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_order_items_needle_id_fkey"
            columns: ["needle_id"]
            isOneToOne: false
            referencedRelation: "needle_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "maintenance_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_order_items_sinker_id_fkey"
            columns: ["sinker_id"]
            isOneToOne: false
            referencedRelation: "sinker_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_orders: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by_id: string | null
          cancelled_by_name: string | null
          company_id: string
          created_at: string
          created_by_id: string | null
          created_by_name: string | null
          description: string | null
          duration_seconds: number | null
          finish_notes: string | null
          finished_at: string | null
          finished_by_id: string | null
          finished_by_name: string | null
          id: string
          machine_id: string
          machine_log_id: string | null
          oc_number: number | null
          oc_photos: Json
          om_number: number | null
          priority: string
          progress_notes: Json
          started_at: string | null
          started_by_id: string | null
          started_by_name: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_id?: string | null
          cancelled_by_name?: string | null
          company_id: string
          created_at?: string
          created_by_id?: string | null
          created_by_name?: string | null
          description?: string | null
          duration_seconds?: number | null
          finish_notes?: string | null
          finished_at?: string | null
          finished_by_id?: string | null
          finished_by_name?: string | null
          id?: string
          machine_id: string
          machine_log_id?: string | null
          oc_number?: number | null
          oc_photos?: Json
          om_number?: number | null
          priority?: string
          progress_notes?: Json
          started_at?: string | null
          started_by_id?: string | null
          started_by_name?: string | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_id?: string | null
          cancelled_by_name?: string | null
          company_id?: string
          created_at?: string
          created_by_id?: string | null
          created_by_name?: string | null
          description?: string | null
          duration_seconds?: number | null
          finish_notes?: string | null
          finished_at?: string | null
          finished_by_id?: string | null
          finished_by_name?: string | null
          id?: string
          machine_id?: string
          machine_log_id?: string | null
          oc_number?: number | null
          oc_photos?: Json
          om_number?: number | null
          priority?: string
          progress_notes?: Json
          started_at?: string | null
          started_by_id?: string | null
          started_by_name?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_orders_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_orders_machine_log_id_fkey"
            columns: ["machine_log_id"]
            isOneToOne: false
            referencedRelation: "machine_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      material_provider_prices: {
        Row: {
          company_id: string
          created_at: string
          id: string
          needle_id: string | null
          provider_id: string
          sinker_id: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          needle_id?: string | null
          provider_id: string
          sinker_id?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          needle_id?: string | null
          provider_id?: string
          sinker_id?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_provider_prices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_provider_prices_needle_id_fkey"
            columns: ["needle_id"]
            isOneToOne: false
            referencedRelation: "needle_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_provider_prices_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "material_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_provider_prices_sinker_id_fkey"
            columns: ["sinker_id"]
            isOneToOne: false
            referencedRelation: "sinker_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      material_providers: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_providers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      needle_inventory: {
        Row: {
          brand: string
          company_id: string
          created_at: string
          current_quantity: number
          id: string
          provider: string | null
          reference_code: string
          updated_at: string
        }
        Insert: {
          brand: string
          company_id: string
          created_at?: string
          current_quantity?: number
          id?: string
          provider?: string | null
          reference_code: string
          updated_at?: string
        }
        Update: {
          brand?: string
          company_id?: string
          created_at?: string
          current_quantity?: number
          id?: string
          provider?: string | null
          reference_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "needle_inventory_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      needle_provider_prices: {
        Row: {
          company_id: string
          created_at: string
          id: string
          needle_id: string
          provider_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          needle_id: string
          provider_id: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          needle_id?: string
          provider_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "needle_provider_prices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "needle_provider_prices_needle_id_fkey"
            columns: ["needle_id"]
            isOneToOne: false
            referencedRelation: "needle_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "needle_provider_prices_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "needle_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      needle_providers: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "needle_providers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      needle_transactions: {
        Row: {
          company_id: string
          created_at: string
          created_by_id: string | null
          created_by_name: string | null
          date: string
          exit_mode: Database["public"]["Enums"]["needle_exit_mode"] | null
          id: string
          machine_id: string | null
          needle_id: string
          provider_id: string | null
          quantity: number
          type: Database["public"]["Enums"]["needle_transaction_type"]
          unit_price: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by_id?: string | null
          created_by_name?: string | null
          date?: string
          exit_mode?: Database["public"]["Enums"]["needle_exit_mode"] | null
          id?: string
          machine_id?: string | null
          needle_id: string
          provider_id?: string | null
          quantity: number
          type: Database["public"]["Enums"]["needle_transaction_type"]
          unit_price?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by_id?: string | null
          created_by_name?: string | null
          date?: string
          exit_mode?: Database["public"]["Enums"]["needle_exit_mode"] | null
          id?: string
          machine_id?: string | null
          needle_id?: string
          provider_id?: string | null
          quantity?: number
          type?: Database["public"]["Enums"]["needle_transaction_type"]
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "needle_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "needle_transactions_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "needle_transactions_needle_id_fkey"
            columns: ["needle_id"]
            isOneToOne: false
            referencedRelation: "needle_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "needle_transactions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "material_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          company_id: string
          created_at: string
          id: string
          read_at: string | null
          ref_id: string | null
          ref_number: string | null
          source: string
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          company_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          ref_id?: string | null
          ref_number?: string | null
          source: string
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          company_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          ref_id?: string | null
          ref_number?: string | null
          source?: string
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      outsource_companies: {
        Row: {
          company_id: string
          contact: string | null
          created_at: string
          id: string
          name: string
          observations: string | null
        }
        Insert: {
          company_id: string
          contact?: string | null
          created_at?: string
          id?: string
          name: string
          observations?: string | null
        }
        Update: {
          company_id?: string
          contact?: string | null
          created_at?: string
          id?: string
          name?: string
          observations?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outsource_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      outsource_freights: {
        Row: {
          company_id: string
          created_at: string | null
          created_by_code: string | null
          created_by_name: string | null
          date: string
          freight_per_kg: number
          freteiro: string | null
          id: string
          nf_rom: string | null
          observations: string | null
          outsource_company_id: string | null
          total_freight: number
          weight_kg: number
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by_code?: string | null
          created_by_name?: string | null
          date?: string
          freight_per_kg?: number
          freteiro?: string | null
          id?: string
          nf_rom?: string | null
          observations?: string | null
          outsource_company_id?: string | null
          total_freight?: number
          weight_kg?: number
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by_code?: string | null
          created_by_name?: string | null
          date?: string
          freight_per_kg?: number
          freteiro?: string | null
          id?: string
          nf_rom?: string | null
          observations?: string | null
          outsource_company_id?: string | null
          total_freight?: number
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "outsource_freights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsource_freights_outsource_company_id_fkey"
            columns: ["outsource_company_id"]
            isOneToOne: false
            referencedRelation: "outsource_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      outsource_productions: {
        Row: {
          article_id: string
          article_name: string | null
          client_name: string | null
          client_value_per_kg: number
          company_id: string
          created_at: string
          created_by_code: string | null
          created_by_name: string | null
          date: string
          freight_per_kg: number
          id: string
          nf_rom: string | null
          observations: string | null
          outsource_company_id: string
          outsource_company_name: string | null
          outsource_value_per_kg: number
          profit_per_kg: number
          rolls: number
          total_cost: number
          total_profit: number
          total_revenue: number
          weight_kg: number
        }
        Insert: {
          article_id: string
          article_name?: string | null
          client_name?: string | null
          client_value_per_kg?: number
          company_id: string
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          date: string
          freight_per_kg?: number
          id?: string
          nf_rom?: string | null
          observations?: string | null
          outsource_company_id: string
          outsource_company_name?: string | null
          outsource_value_per_kg?: number
          profit_per_kg?: number
          rolls?: number
          total_cost?: number
          total_profit?: number
          total_revenue?: number
          weight_kg?: number
        }
        Update: {
          article_id?: string
          article_name?: string | null
          client_name?: string | null
          client_value_per_kg?: number
          company_id?: string
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          date?: string
          freight_per_kg?: number
          id?: string
          nf_rom?: string | null
          observations?: string | null
          outsource_company_id?: string
          outsource_company_name?: string | null
          outsource_value_per_kg?: number
          profit_per_kg?: number
          rolls?: number
          total_cost?: number
          total_profit?: number
          total_revenue?: number
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "outsource_productions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsource_productions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsource_productions_outsource_company_id_fkey"
            columns: ["outsource_company_id"]
            isOneToOne: false
            referencedRelation: "outsource_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      outsource_yarn_stock: {
        Row: {
          company_id: string
          created_at: string
          id: string
          observations: string | null
          outsource_company_id: string
          quantity_kg: number
          reference_month: string
          updated_at: string
          yarn_type_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          observations?: string | null
          outsource_company_id: string
          quantity_kg?: number
          reference_month: string
          updated_at?: string
          yarn_type_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          observations?: string | null
          outsource_company_id?: string
          quantity_kg?: number
          reference_month?: string
          updated_at?: string
          yarn_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outsource_yarn_stock_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsource_yarn_stock_outsource_company_id_fkey"
            columns: ["outsource_company_id"]
            isOneToOne: false
            referencedRelation: "outsource_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsource_yarn_stock_yarn_type_id_fkey"
            columns: ["yarn_type_id"]
            isOneToOne: false
            referencedRelation: "yarn_types"
            referencedColumns: ["id"]
          },
        ]
      }
      own_stock_articles: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          observations: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          observations?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          observations?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "own_stock_articles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "own_stock_articles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      own_stock_movements: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          of_number: string | null
          outsource_company_id: string | null
          own_article_id: string
          pieces: number
          reason: string | null
          source: string | null
          type: string
          weight_kg: number
          yarn_type: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          of_number?: string | null
          outsource_company_id?: string | null
          own_article_id: string
          pieces?: number
          reason?: string | null
          source?: string | null
          type: string
          weight_kg?: number
          yarn_type?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          of_number?: string | null
          outsource_company_id?: string | null
          own_article_id?: string
          pieces?: number
          reason?: string | null
          source?: string | null
          type?: string
          weight_kg?: number
          yarn_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "own_stock_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "own_stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "own_stock_movements_outsource_company_id_fkey"
            columns: ["outsource_company_id"]
            isOneToOne: false
            referencedRelation: "outsource_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "own_stock_movements_own_article_id_fkey"
            columns: ["own_article_id"]
            isOneToOne: false
            referencedRelation: "own_stock_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_history: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          id: string
          next_billing_date: string | null
          paid_at: string | null
          pix_code: string | null
          plan: string
          status: string
          transaction_id: string | null
        }
        Insert: {
          amount?: number
          company_id: string
          created_at?: string
          id?: string
          next_billing_date?: string | null
          paid_at?: string | null
          pix_code?: string | null
          plan?: string
          status?: string
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          id?: string
          next_billing_date?: string | null
          paid_at?: string | null
          pix_code?: string | null
          plan?: string
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          email: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      productions: {
        Row: {
          article_id: string | null
          article_name: string | null
          company_id: string
          created_at: string
          created_by_code: string | null
          created_by_name: string | null
          date: string
          efficiency: number
          id: string
          machine_id: string | null
          machine_name: string | null
          revenue: number
          rolls_produced: number
          rpm: number
          shift: string
          weaver_id: string | null
          weaver_name: string | null
          weight_kg: number
        }
        Insert: {
          article_id?: string | null
          article_name?: string | null
          company_id: string
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          date: string
          efficiency?: number
          id?: string
          machine_id?: string | null
          machine_name?: string | null
          revenue?: number
          rolls_produced?: number
          rpm?: number
          shift: string
          weaver_id?: string | null
          weaver_name?: string | null
          weight_kg?: number
        }
        Update: {
          article_id?: string | null
          article_name?: string | null
          company_id?: string
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          date?: string
          efficiency?: number
          id?: string
          machine_id?: string | null
          machine_name?: string | null
          revenue?: number
          rolls_produced?: number
          rpm?: number
          shift?: string
          weaver_id?: string | null
          weaver_name?: string | null
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "productions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_weaver_id_fkey"
            columns: ["weaver_id"]
            isOneToOne: false
            referencedRelation: "weavers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          code: string | null
          company_id: string
          created_at: string
          email: string
          id: string
          name: string
          permission_overrides: Json
          role: string
          status: string
          user_id: string
        }
        Insert: {
          code?: string | null
          company_id: string
          created_at?: string
          email: string
          id?: string
          name: string
          permission_overrides?: Json
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          code?: string | null
          company_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          permission_overrides?: Json
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          company_id: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          company_id: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          company_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      residue_client_prices: {
        Row: {
          client_id: string
          company_id: string
          created_at: string
          id: string
          material_id: string
          unit_price: number
        }
        Insert: {
          client_id: string
          company_id: string
          created_at?: string
          id?: string
          material_id: string
          unit_price?: number
        }
        Update: {
          client_id?: string
          company_id?: string
          created_at?: string
          id?: string
          material_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "residue_client_prices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "residue_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "residue_client_prices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "residue_client_prices_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "residue_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      residue_clients: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "residue_clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      residue_materials: {
        Row: {
          company_id: string
          created_at: string
          default_price: number
          id: string
          name: string
          unit: string
        }
        Insert: {
          company_id: string
          created_at?: string
          default_price?: number
          id?: string
          name: string
          unit?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          default_price?: number
          id?: string
          name?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "residue_materials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      residue_sales: {
        Row: {
          client_id: string | null
          client_name: string
          company_id: string
          created_at: string
          created_by_code: string | null
          created_by_name: string | null
          date: string
          id: string
          material_id: string
          material_name: string | null
          observations: string | null
          quantity: number
          romaneio: string | null
          total: number
          unit: string
          unit_price: number
        }
        Insert: {
          client_id?: string | null
          client_name: string
          company_id: string
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          date: string
          id?: string
          material_id: string
          material_name?: string | null
          observations?: string | null
          quantity?: number
          romaneio?: string | null
          total?: number
          unit?: string
          unit_price?: number
        }
        Update: {
          client_id?: string | null
          client_name?: string
          company_id?: string
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          date?: string
          id?: string
          material_id?: string
          material_name?: string | null
          observations?: string | null
          quantity?: number
          romaneio?: string | null
          total?: number
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "residue_sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "residue_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "residue_sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "residue_sales_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "residue_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      sinker_inventory: {
        Row: {
          brand: string
          company_id: string
          created_at: string
          current_quantity: number
          id: string
          provider: string
          reference_code: string
          updated_at: string
        }
        Insert: {
          brand: string
          company_id: string
          created_at?: string
          current_quantity?: number
          id?: string
          provider: string
          reference_code: string
          updated_at?: string
        }
        Update: {
          brand?: string
          company_id?: string
          created_at?: string
          current_quantity?: number
          id?: string
          provider?: string
          reference_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sinker_inventory_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sinker_transactions: {
        Row: {
          company_id: string
          created_at: string
          created_by_id: string | null
          created_by_name: string | null
          date: string
          exit_mode: string | null
          id: string
          machine_id: string | null
          provider_id: string | null
          quantity: number
          sinker_id: string
          type: string
          unit_price: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by_id?: string | null
          created_by_name?: string | null
          date: string
          exit_mode?: string | null
          id?: string
          machine_id?: string | null
          provider_id?: string | null
          quantity: number
          sinker_id: string
          type: string
          unit_price?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by_id?: string | null
          created_by_name?: string | null
          date?: string
          exit_mode?: string | null
          id?: string
          machine_id?: string | null
          provider_id?: string | null
          quantity?: number
          sinker_id?: string
          type?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sinker_transactions_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sinker_transactions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "material_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sinker_transactions_sinker_id_fkey"
            columns: ["sinker_id"]
            isOneToOne: false
            referencedRelation: "sinker_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          article_id: string
          billing_order_id: string | null
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_second_quality: boolean
          machine_id: string | null
          pieces: number
          reason: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
          weight_kg: number
        }
        Insert: {
          article_id: string
          billing_order_id?: string | null
          client_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_second_quality?: boolean
          machine_id?: string | null
          pieces?: number
          reason?: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
          weight_kg?: number
        }
        Update: {
          article_id?: string
          billing_order_id?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_second_quality?: boolean
          machine_id?: string | null
          pieces?: number
          reason?: string | null
          type?: Database["public"]["Enums"]["stock_movement_type"]
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_billing_order_id_fkey"
            columns: ["billing_order_id"]
            isOneToOne: false
            referencedRelation: "billing_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_panels: {
        Row: {
          code: string
          company_id: string
          created_at: string
          enabled_machines: Json
          id: string
          is_connected: boolean
          name: string
          panel_type: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          enabled_machines?: Json
          id?: string
          is_connected?: boolean
          name: string
          panel_type?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          enabled_machines?: Json
          id?: string
          is_connected?: boolean
          name?: string
          panel_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tv_panels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_active_company: {
        Row: {
          company_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_active_company_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      weavers: {
        Row: {
          code: string
          company_id: string
          created_at: string
          end_time: string | null
          fixed_shift: string | null
          id: string
          name: string
          phone: string | null
          shift_type: string
          start_time: string | null
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          end_time?: string | null
          fixed_shift?: string | null
          id?: string
          name: string
          phone?: string | null
          shift_type?: string
          start_time?: string | null
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          end_time?: string | null
          fixed_shift?: string | null
          id?: string
          name?: string
          phone?: string | null
          shift_type?: string
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weavers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      yarn_stock_clients: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      yarn_stock_entries: {
        Row: {
          client_id: string | null
          client_name: string | null
          company_id: string
          created_at: string
          created_by_code: string | null
          created_by_name: string | null
          id: string
          invoice_number: string | null
          notes: string | null
          supplier_name: string | null
          updated_at: string
          yarn_type_name: string
        }
        Insert: {
          client_id?: string | null
          client_name?: string | null
          company_id: string
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          supplier_name?: string | null
          updated_at?: string
          yarn_type_name: string
        }
        Update: {
          client_id?: string | null
          client_name?: string | null
          company_id?: string
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          supplier_name?: string | null
          updated_at?: string
          yarn_type_name?: string
        }
        Relationships: []
      }
      yarn_stock_machine_current: {
        Row: {
          client_id: string | null
          client_name: string | null
          company_id: string
          created_at: string
          id: string
          machine_id: string
          set_by_code: string | null
          set_by_name: string | null
          updated_at: string
          yarn_type_id: string | null
          yarn_type_name: string | null
        }
        Insert: {
          client_id?: string | null
          client_name?: string | null
          company_id: string
          created_at?: string
          id?: string
          machine_id: string
          set_by_code?: string | null
          set_by_name?: string | null
          updated_at?: string
          yarn_type_id?: string | null
          yarn_type_name?: string | null
        }
        Update: {
          client_id?: string | null
          client_name?: string | null
          company_id?: string
          created_at?: string
          id?: string
          machine_id?: string
          set_by_code?: string | null
          set_by_name?: string | null
          updated_at?: string
          yarn_type_id?: string | null
          yarn_type_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yarn_stock_machine_current_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: true
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yarn_stock_machine_current_yarn_type_id_fkey"
            columns: ["yarn_type_id"]
            isOneToOne: false
            referencedRelation: "yarn_stock_types"
            referencedColumns: ["id"]
          },
        ]
      }
      yarn_stock_movements: {
        Row: {
          boxes: number
          company_id: string
          created_at: string
          id: string
          machine_id: string | null
          machine_name: string | null
          notes: string | null
          pallet_id: string
          type: string
          user_code: string | null
          user_id: string | null
          user_name: string | null
          user_role: string | null
        }
        Insert: {
          boxes?: number
          company_id: string
          created_at?: string
          id?: string
          machine_id?: string | null
          machine_name?: string | null
          notes?: string | null
          pallet_id: string
          type: string
          user_code?: string | null
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
        }
        Update: {
          boxes?: number
          company_id?: string
          created_at?: string
          id?: string
          machine_id?: string | null
          machine_name?: string | null
          notes?: string | null
          pallet_id?: string
          type?: string
          user_code?: string | null
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yarn_stock_movements_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yarn_stock_movements_pallet_id_fkey"
            columns: ["pallet_id"]
            isOneToOne: false
            referencedRelation: "yarn_stock_pallets"
            referencedColumns: ["id"]
          },
        ]
      }
      yarn_stock_pallets: {
        Row: {
          client_id: string | null
          client_name: string | null
          code: string
          company_id: string
          created_at: string
          created_by_code: string | null
          created_by_name: string | null
          current_machine_id: string | null
          entry_id: string | null
          id: string
          invoice_number: string | null
          notes: string | null
          remaining_boxes: number
          status: string
          supplier_name: string | null
          total_boxes: number
          updated_at: string
          yarn_type_id: string | null
          yarn_type_name: string | null
        }
        Insert: {
          client_id?: string | null
          client_name?: string | null
          code: string
          company_id: string
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          current_machine_id?: string | null
          entry_id?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          remaining_boxes?: number
          status?: string
          supplier_name?: string | null
          total_boxes?: number
          updated_at?: string
          yarn_type_id?: string | null
          yarn_type_name?: string | null
        }
        Update: {
          client_id?: string | null
          client_name?: string | null
          code?: string
          company_id?: string
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          current_machine_id?: string | null
          entry_id?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          remaining_boxes?: number
          status?: string
          supplier_name?: string | null
          total_boxes?: number
          updated_at?: string
          yarn_type_id?: string | null
          yarn_type_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yarn_stock_pallets_current_machine_id_fkey"
            columns: ["current_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yarn_stock_pallets_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "yarn_stock_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yarn_stock_pallets_yarn_type_id_fkey"
            columns: ["yarn_type_id"]
            isOneToOne: false
            referencedRelation: "yarn_stock_types"
            referencedColumns: ["id"]
          },
        ]
      }
      yarn_stock_types: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      yarn_types: {
        Row: {
          color: string | null
          company_id: string
          composition: string | null
          created_at: string
          id: string
          name: string
          observations: string | null
        }
        Insert: {
          color?: string | null
          company_id: string
          composition?: string | null
          created_at?: string
          id?: string
          name: string
          observations?: string | null
        }
        Update: {
          color?: string | null
          company_id?: string
          composition?: string | null
          created_at?: string
          id?: string
          name?: string
          observations?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yarn_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fetch_productions_page:
        | {
            Args: {
              p_article_id?: string
              p_company_id: string
              p_end_date: string
              p_machine_id?: string
              p_page?: number
              p_page_size?: number
              p_shift?: string
              p_start_date: string
            }
            Returns: {
              article_id: string
              article_name: string
              company_id: string
              created_at: string
              created_by_code: string
              created_by_name: string
              date: string
              efficiency: number
              id: string
              machine_id: string
              machine_name: string
              revenue: number
              rolls_produced: number
              rpm: number
              shift: string
              total_count: number
              weaver_id: string
              weaver_name: string
              weight_kg: number
            }[]
          }
        | {
            Args: {
              p_article_id?: string
              p_company_id: string
              p_end_date: string
              p_machine_id?: string
              p_page?: number
              p_page_size?: number
              p_shift?: string
              p_start_date: string
            }
            Returns: {
              article_id: string
              article_name: string
              company_id: string
              created_at: string
              created_by_code: string
              created_by_name: string
              date: string
              efficiency: number
              id: string
              machine_id: string
              machine_name: string
              revenue: number
              rolls_produced: number
              rpm: number
              shift: string
              total_count: number
              weaver_id: string
              weaver_name: string
              weight_kg: number
            }[]
          }
      get_company_public_by_slug: {
        Args: { _slug: string }
        Returns: {
          id: string
          logo_url: string
          name: string
          slug: string
        }[]
      }
      get_dashboard_metrics: {
        Args: {
          p_company_id: string
          p_end_date?: string
          p_machine_id?: string
          p_shift?: string
          p_start_date?: string
        }
        Returns: Json
      }
      get_defect_stats: {
        Args: {
          p_article_id?: string
          p_company_id: string
          p_end_date: string
          p_machine_id?: string
          p_search_term?: string
          p_shift?: string
          p_start_date: string
          p_weaver_id?: string
        }
        Returns: {
          total_kg: number
          total_metros: number
          total_records: number
        }[]
      }
      get_faturamento_available_months: {
        Args: { p_company_id: string }
        Returns: {
          month_str: string
        }[]
      }
      get_faturamento_total_metrics: {
        Args: {
          p_company_id: string
          p_end_date: string
          p_prev_end_date: string
          p_prev_start_date: string
          p_start_date: string
        }
        Returns: Json
      }
      get_production_filter_articles: {
        Args: { p_company_id: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      get_production_filter_clients: {
        Args: { p_company_id: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      get_production_filter_machines: {
        Args: { p_company_id: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      get_production_filter_months: {
        Args: { p_company_id: string }
        Returns: {
          month_str: string
        }[]
      }
      get_production_machine_stats: {
        Args: {
          p_article_id?: string
          p_company_id: string
          p_end_date: string
          p_limit?: number
          p_start_date: string
        }
        Returns: {
          avg_efficiency: number
          machine_id: string
          machine_name: string
          record_count: number
          total_rolls: number
          total_weight: number
        }[]
      }
      get_production_shift_stats: {
        Args: {
          p_article_id?: string
          p_company_id: string
          p_end_date: string
          p_start_date: string
        }
        Returns: {
          shift: string
          total_revenue: number
          total_rolls: number
          total_weight: number
        }[]
      }
      get_production_stats:
        | {
            Args: {
              p_article_id?: string
              p_company_id: string
              p_end_date: string
              p_machine_id?: string
              p_shift?: string
              p_start_date: string
            }
            Returns: {
              avg_efficiency: number
              record_count: number
              total_revenue: number
              total_rolls: number
              total_weight: number
            }[]
          }
        | {
            Args: {
              p_article_id?: string
              p_company_id: string
              p_end_date: string
              p_machine_id?: string
              p_shift?: string
              p_start_date: string
            }
            Returns: {
              avg_efficiency: number
              record_count: number
              total_revenue: number
              total_rolls: number
              total_weight: number
            }[]
          }
      get_production_trend_stats: {
        Args: {
          p_article_id?: string
          p_company_id: string
          p_end_date: string
          p_shift?: string
          p_start_date: string
        }
        Returns: {
          avg_efficiency: number
          date: string
          total_revenue: number
          total_rolls: number
          total_weight: number
        }[]
      }
      get_report_by_article: {
        Args: {
          p_client_id?: string
          p_company_id: string
          p_date_from?: string
          p_date_to?: string
          p_machine_id?: string
          p_shift?: string
        }
        Returns: {
          article_id: string
          article_name: string
          eficiencia: number
          faturamento: number
          kg: number
          rolos: number
        }[]
      }
      get_report_by_client: {
        Args: {
          p_article_id?: string
          p_company_id: string
          p_date_from?: string
          p_date_to?: string
          p_machine_id?: string
          p_shift?: string
        }
        Returns: {
          client_id: string
          client_name: string
          eficiencia: number
          faturamento: number
          kg: number
          rolos: number
        }[]
      }
      get_report_by_machine: {
        Args: {
          p_article_id?: string
          p_client_id?: string
          p_company_id: string
          p_date_from?: string
          p_date_to?: string
          p_shift?: string
        }
        Returns: {
          eficiencia: number
          faturamento: number
          kg: number
          machine_id: string
          machine_name: string
          rolos: number
        }[]
      }
      get_report_by_shift: {
        Args: {
          p_article_id?: string
          p_client_id?: string
          p_company_id: string
          p_date_from?: string
          p_date_to?: string
          p_machine_id?: string
        }
        Returns: {
          eficiencia: number
          faturamento: number
          kg: number
          rolos: number
          shift: string
        }[]
      }
      get_report_data:
        | {
            Args: {
              p_article_id?: string
              p_client_id?: string
              p_company_id: string
              p_end_date: string
              p_machine_id?: string
              p_shift?: string
              p_start_date: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_article_id?: string
              p_client_id?: string
              p_company_id: string
              p_end_date: string
              p_machine_id?: string
              p_shift?: string
              p_start_date: string
            }
            Returns: Json
          }
      get_report_evolution: {
        Args: {
          p_article_id?: string
          p_client_id?: string
          p_company_id: string
          p_date_from?: string
          p_date_to?: string
          p_machine_id?: string
          p_shift?: string
        }
        Returns: {
          date: string
          faturamento: number
          rolos: number
        }[]
      }
      get_report_kpis: {
        Args: {
          p_article_id?: string
          p_client_id?: string
          p_company_id: string
          p_date_from?: string
          p_date_to?: string
          p_machine_id?: string
          p_shift?: string
        }
        Returns: {
          active_days: number
          avg_efficiency: number
          total_revenue: number
          total_rolls: number
          total_weight: number
        }[]
      }
      get_user_companies: {
        Args: never
        Returns: {
          company_id: string
          company_name: string
          company_slug: string
          role: string
        }[]
      }
      get_user_company_id: { Args: never; Returns: string }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      set_active_company: { Args: { _company_id: string }; Returns: undefined }
    }
    Enums: {
      article_change_feeder_type: "fio" | "elastano"
      article_change_status:
        | "aberto"
        | "troca_fio_em_curso"
        | "aguardando_regulagem"
        | "em_regulagem"
        | "em_acompanhamento"
        | "concluida"
        | "cancelada"
      billing_delivery_doc_type: "nf" | "romaneio"
      billing_order_status:
        | "open"
        | "separating"
        | "ready"
        | "collected"
        | "cancelled"
      client_invoice_type: "entrada" | "saida"
      freight_order_status:
        | "open"
        | "pickup_in_progress"
        | "delivery_in_progress"
        | "completed"
        | "cancelled"
      machine_status:
        | "ativa"
        | "manutencao_preventiva"
        | "manutencao_corretiva"
        | "troca_artigo"
        | "inativa"
        | "troca_agulhas"
      needle_exit_mode: "troca_agulheiro" | "reposicao"
      needle_transaction_type: "entry" | "exit"
      stock_movement_type:
        | "reserve"
        | "release"
        | "out"
        | "in"
        | "adjust_in"
        | "adjust_out"
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
      article_change_feeder_type: ["fio", "elastano"],
      article_change_status: [
        "aberto",
        "troca_fio_em_curso",
        "aguardando_regulagem",
        "em_regulagem",
        "em_acompanhamento",
        "concluida",
        "cancelada",
      ],
      billing_delivery_doc_type: ["nf", "romaneio"],
      billing_order_status: [
        "open",
        "separating",
        "ready",
        "collected",
        "cancelled",
      ],
      client_invoice_type: ["entrada", "saida"],
      freight_order_status: [
        "open",
        "pickup_in_progress",
        "delivery_in_progress",
        "completed",
        "cancelled",
      ],
      machine_status: [
        "ativa",
        "manutencao_preventiva",
        "manutencao_corretiva",
        "troca_artigo",
        "inativa",
        "troca_agulhas",
      ],
      needle_exit_mode: ["troca_agulheiro", "reposicao"],
      needle_transaction_type: ["entry", "exit"],
      stock_movement_type: [
        "reserve",
        "release",
        "out",
        "in",
        "adjust_in",
        "adjust_out",
      ],
    },
  },
} as const
