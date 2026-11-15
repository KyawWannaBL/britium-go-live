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
  if (!url || !anon || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url) ||
      url.includes("dltavabvjwocknkyvwgz") || url.includes("www.britiumexpress.com")) {
    throw new Error("UAT Rider backend is missing, invalid, or points at Production. Rider connection refused.");
  }

  riderClient = createClient(url, anon, {
    global: { headers: { "x-britium-data-epoch": "2026-11-01" } },
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
