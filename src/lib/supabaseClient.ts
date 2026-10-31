// ─────────────────────────────────────────────────────────────────────────────
// supabaseClient.ts — Supabase client singleton (browser)
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "./config";

if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing Supabase configuration. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file."
  );
}

export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  global: { headers: { "x-britium-data-epoch": "2026-11-01" } },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "britium_session",
  },
});
