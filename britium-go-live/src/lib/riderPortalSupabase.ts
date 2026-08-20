import { supabase } from "@/integrations/supabase/client";

/**
 * Britium Field Portal Supabase adapter.
 *
 * IMPORTANT:
 * Reuse the enterprise application's canonical Supabase client.
 * Do not create a second GoTrue/Supabase client here, otherwise
 * field authentication, RPC calls and Realtime subscriptions can
 * end up using different sessions.
 */
export function getRiderSupabase() {
  return supabase;
}

export function riderSupabaseConfigured(): boolean {
  return Boolean(supabase);
}

export default supabase;
