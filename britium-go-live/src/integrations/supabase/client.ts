import { createClient } from "@supabase/supabase-js";

// These are public browser connection values, not the Supabase service-role
// secret. Vercel Production normally overrides them through VITE_* variables;
// the defaults keep Git-triggered builds operational if that environment scope
// is accidentally omitted. Production traffic still uses the same-origin
// /supabase rewrite from vercel.json.
const DEFAULT_SUPABASE_URL = "https://dltavabvjwocknkyvwgz.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsdGF2YWJ2andvY2tua3l2d2d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTMxOTQsImV4cCI6MjA4NjY4OTE5NH0.7-9BK6L9dpCYIB-pp1WOeQxCI1DVxnSykoTRXNUHYIo";

const directSupabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
const supabaseUrl = import.meta.env.PROD && typeof window !== "undefined" ? `${window.location.origin}/supabase` : directSupabaseUrl;
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY).trim();

const authStorageKey = (() => {
  try {
    const projectRef = new URL(directSupabaseUrl).hostname.split(".")[0];
    if (projectRef) return `sb-${projectRef}-auth-token`;
  } catch {
    // The missing configuration warning below handles invalid URLs.
  }

  return "sb-britium-auth-token";
})();

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
      storageKey: authStorageKey,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export default supabase;

// Resolves Vite build error for connection status checks

// Resolves Vite build error for connection status checks
export const isSupabaseConfigured = Boolean(directSupabaseUrl && supabaseAnonKey);
