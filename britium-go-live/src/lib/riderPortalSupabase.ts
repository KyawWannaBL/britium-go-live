import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let riderClient: SupabaseClient | null = null;

/**
 * Isolated Field / Mobile Sandbox Supabase client.
 *
 * The Enterprise portal and Mobile Sandbox must not share GoTrue storage.
 * Otherwise signing a Rider/Driver/Helper into the sandbox replaces the
 * Enterprise admin session and AuthLayout immediately redirects to login.
 */
export function getRiderSupabase(): SupabaseClient {
  if (riderClient) return riderClient;

  const url = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
  const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anon) throw new Error("Rider Sandbox Supabase configuration is missing.");

  riderClient = createClient(url, anon, {
    auth: {
      storageKey: "britium.field.sandbox.auth.v1",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });
  return riderClient;
}

export function riderSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export default getRiderSupabase;
