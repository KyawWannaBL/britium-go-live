import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";

// These are public browser connection values, not the Supabase service-role
// secret. Vercel Production normally overrides them through VITE_* variables;
// the defaults keep Git-triggered builds operational if that environment scope
// is accidentally omitted. Production traffic still uses the same-origin
// /supabase rewrite from vercel.json.
const DEFAULT_SUPABASE_URL = "https://dltavabvjwocknkyvwgz.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsdGF2YWJ2andvY2tua3l2d2d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTMxOTQsImV4cCI6MjA4NjY4OTE5NH0.7-9BK6L9dpCYIB-pp1WOeQxCI1DVxnSykoTRXNUHYIo";

const isUatWebHost = typeof window !== "undefined" &&
  window.location.hostname === "britium-uat-mdy-insein.vercel.app";
const uatSupabaseUrl = "https://hgijdyfwmvskchsruknp.supabase.co";
const configuredSupabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
// UAT must never inherit the production Supabase URL or production anon key.
const directSupabaseUrl = isUatWebHost
  ? (configuredSupabaseUrl || uatSupabaseUrl)
  : (configuredSupabaseUrl || DEFAULT_SUPABASE_URL);
const isNativeApp = Capacitor.isNativePlatform();
// The native WebView's origin is capacitor://localhost, so it cannot use a
// relative /supabase URL. Route native API calls through the public Britium
// HTTPS domain rather than contacting supabase.co directly. This keeps Auth,
// REST, Realtime and Storage on the same network path as the working web app.
// The canonical origin is not a secret; VITE_NATIVE_SUPABASE_PROXY_URL allows
// a controlled future migration without rewriting app code.
const nativeProxyUrl = String(
  import.meta.env.VITE_NATIVE_SUPABASE_PROXY_URL || "https://www.britiumexpress.com/supabase"
).trim().replace(/\/+$/, "");
const shouldUseWebProxy = import.meta.env.PROD && typeof window !== "undefined" &&
  !isNativeApp && !isUatWebHost;
const supabaseUrl = isNativeApp
  ? nativeProxyUrl
  : shouldUseWebProxy
    ? `${window.location.origin}/supabase`
    : directSupabaseUrl;
const suppliedAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const supabaseAnonKey = isUatWebHost ? suppliedAnonKey : (suppliedAnonKey || DEFAULT_SUPABASE_ANON_KEY);

// The same-origin /supabase rewrite intentionally points to production.
// UAT uses its own Supabase endpoint directly; never allow an accidental
// production fallback or mismatched JWT key at the UAT hostname.
if (isUatWebHost) {
  if (directSupabaseUrl !== uatSupabaseUrl || !suppliedAnonKey) {
    throw new Error("UAT_SUPABASE_CONFIG_REQUIRED: set VITE_SUPABASE_URL to the isolated UAT project and VITE_SUPABASE_ANON_KEY to its publishable/anon key.");
  }
  if (suppliedAnonKey.startsWith("eyJ")) {
    try {
      const payloadPart = suppliedAnonKey.split(".")[1];
      const payload = JSON.parse(atob(payloadPart.replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.ref !== "hgijdyfwmvskchsruknp" || payload.role !== "anon") {
        throw new Error("JWT project/role does not match UAT");
      }
    } catch {
      throw new Error("UAT_SUPABASE_KEY_MISMATCH: replace the browser key with the isolated project's anon key.");
    }
  } else if (!suppliedAnonKey.startsWith("sb_publishable_")) {
    throw new Error("UAT_SUPABASE_KEY_INVALID: use a valid Supabase publishable or anon key.");
  }
}

if (isNativeApp) {
  console.info("[Britium Supabase] Native app using Britium HTTPS API gateway.");
}

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
    global: { headers: { "x-britium-data-epoch": "2026-11-01" } },
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
