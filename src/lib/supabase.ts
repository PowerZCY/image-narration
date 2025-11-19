import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL is required');
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: process.env.SUPABASE_SCHEMA || 'public',
    },
  }
);

export const supabaseAnon = process.env.SUPABASE_ANON_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      db: {
        schema: process.env.SUPABASE_SCHEMA || 'public',
      },
    })
  : null;

export type Database = {
  public: {
    Tables: {
      user_credits: {
        Row: {
          user_id: number;
          clerk_user_id: string;
          email: string;
          display_name: string | null;
          balance: number;
          expires_at: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id?: number;
          clerk_user_id: string;
          email: string;
          display_name?: string | null;
          balance?: number;
          expires_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: number;
          clerk_user_id?: string;
          email?: string;
          display_name?: string | null;
          balance?: number;
          expires_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      credit_logs: {
        Row: {
          id: number;
          user_id: number | null;
          clerk_user_id: string | null;
          anon_id: string | null;
          type: 'recharge' | 'consume' | 'expire';
          status: 'pending' | 'confirmed' | 'refunded';
          credits: number;
          ref_id: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id?: number | null;
          clerk_user_id?: string | null;
          anon_id?: string | null;
          type: 'recharge' | 'consume' | 'expire';
          status?: 'pending' | 'confirmed' | 'refunded';
          credits: number;
          ref_id?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: number | null;
          clerk_user_id?: string | null;
          anon_id?: string | null;
          type?: 'recharge' | 'consume' | 'expire';
          status?: 'pending' | 'confirmed' | 'refunded';
          credits?: number;
          ref_id?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      orders: {
        Row: {
          order_id: number;
          session_id: string;
          user_id: number | null;
          clerk_user_id: string | null;
          user_email: string | null;
          price_id: string;
          price_tier: string | null;
          credits: number;
          amount: number;
          currency: string;
          state: 'pending' | 'paid' | 'failed' | 'disputed';
          extra: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          order_id?: number;
          session_id: string;
          user_id?: number | null;
          clerk_user_id?: string | null;
          user_email?: string | null;
          price_id: string;
          price_tier?: string | null;
          credits: number;
          amount: number;
          currency: string;
          state?: 'pending' | 'paid' | 'failed' | 'disputed';
          extra?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          order_id?: number;
          session_id?: string;
          user_id?: number | null;
          clerk_user_id?: string | null;
          user_email?: string | null;
          price_id?: string;
          price_tier?: string | null;
          credits?: number;
          amount?: number;
          currency?: string;
          state?: 'pending' | 'paid' | 'failed' | 'disputed';
          extra?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      anon_usage: {
        Row: {
          anon_id: string;
          usage_count: number;
          last_used_at: string | null;
          ip_hash: string | null;
          ip_subnet_hash: string | null;
          user_agent: string | null;
          fingerprint_source: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          anon_id: string;
          usage_count?: number;
          last_used_at?: string | null;
          ip_hash?: string | null;
          ip_subnet_hash?: string | null;
          user_agent?: string | null;
          fingerprint_source?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          anon_id?: string;
          usage_count?: number;
          last_used_at?: string | null;
          ip_hash?: string | null;
          ip_subnet_hash?: string | null;
          user_agent?: string | null;
          fingerprint_source?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      stripe_events: {
        Row: {
          id: number;
          event_id: string;
          event_name: string;
          event_data: Record<string, unknown>;
          event_created_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          event_id: string;
          event_name: string;
          event_data: Record<string, unknown>;
          event_created_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          event_id?: string;
          event_name?: string;
          event_data?: Record<string, unknown>;
          event_created_at?: string | null;
          created_at?: string;
        };
      };
      user_usage_history: {
        Row: {
          id: number;
          user_id: number | null;
          clerk_user_id: string | null;
          anon_id: string | null;
          image_url: string;
          user_prompt: string | null;
          ai_narration: string;
          request_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id?: number | null;
          clerk_user_id?: string | null;
          anon_id?: string | null;
          image_url: string;
          user_prompt?: string | null;
          ai_narration: string;
          request_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: number | null;
          clerk_user_id?: string | null;
          anon_id?: string | null;
          image_url?: string;
          user_prompt?: string | null;
          ai_narration?: string;
          request_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      user_credits_overview: {
        Row: {
          user_id: number;
          clerk_user_id: string;
          email: string;
          display_name: string | null;
          balance: number | null;
          expires_at: string | null;
          balance_updated_at: string | null;
          created_at: string;
          deleted_at: string | null;
          paid_orders_count: number | null;
          total_paid_amount: number | null;
        };
      };
    };
  };
};