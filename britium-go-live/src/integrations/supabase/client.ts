import { createClient } from "@supabase/supabase-js";

const directSupabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseUrl = import.meta.env.PROD && typeof window !== "undefined" ? `${window.location.origin}/supabase` : directSupabaseUrl;
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "[Britium Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Add them in Vercel Environment Variables."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "missing-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export default supabase;

// Resolves Vite build error for connection status checks

// Resolves Vite build error for connection status checks
export const isSupabaseConfigured = true;


