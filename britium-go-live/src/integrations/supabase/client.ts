import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";

// These are public browser connection values, not the Supabase service-role
// secret. Vercel Production normally overrides them through VITE_* variables;
// the defaults keep Git-triggered builds operational if that environment scope
// is accidentally omitted. Production traffic still uses the same-origin
// /supabase rewrite from vercel.json.
const DEFAULT_SUPABASE_URL = "https://uat-not-configured.invalid";
const DEFAULT_SUPABASE_ANON_KEY = "";

// UAT-only release branch: never contact the Production Supabase backend.
const directSupabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
const expectedUatUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(directSupabaseUrl);
const forbiddenProduction = directSupabaseUrl.includes("dltavabvjwocknkyvwgz") || directSupabaseUrl.includes("www.britiumexpress.com");
if (!expectedUatUrl || forbiddenProduction) {
  throw new Error("UAT backend not configured or Production backend detected. Refusing to start application.");
}
const isNativeApp = Capacitor.isNativePlatform();
// The native WebView's origin is capacitor://localhost, so it cannot use a
// relative /supabase URL. Route native API calls through the public Britium
// HTTPS domain rather than contacting supabase.co directly. This keeps Auth,
// REST, Realtime and Storage on the same network path as the working web app.
// The canonical origin is not a secret; VITE_NATIVE_SUPABASE_PROXY_URL allows
// a controlled future migration without rewriting app code.
const nativeProxyUrl = String(
  import.meta.env.VITE_SUPABASE_URL || "https://uat-not-configured.invalid"
).trim().replace(/\/+$/, "");
const shouldUseWebProxy = false; // UAT must use its dedicated Supabase URL, never /supabase proxy.
const supabaseUrl = isNativeApp
  ? nativeProxyUrl
  : shouldUseWebProxy
    ? `${window.location.origin}/supabase`
    : directSupabaseUrl;
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY).trim();

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
