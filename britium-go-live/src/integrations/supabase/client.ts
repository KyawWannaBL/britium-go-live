import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";

// These are public browser connection values, not the Supabase service-role
// secret. Vercel Production normally overrides them through VITE_* variables;
// the defaults keep Git-triggered builds operational if that environment scope
// is accidentally omitted. Production traffic still uses the same-origin
// /supabase rewrite from vercel.json.
const DEFAULT_SUPABASE_URL = "https://dltavabvjwocknkyvwgz.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsdGF2YWJ2andvY2tua3l2d2d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTMxOTQsImV4cCI6MjA4NjY4OTE5NH0.7-9BK6L9dpCYIB-pp1WOeQxCI1DVxnSykoTRXNUHYIo";

// Production continues using the existing same-origin proxy. UAT must instead
// use its OWN Vercel VITE_SUPABASE_URL and matching publishable/anon key.
// The former UAT build used a production /supabase rewrite regardless of its
// configured project, causing the visible "Invalid API key" error.
const isNativeApp = Capacitor.isNativePlatform();
const browserHost = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
const isUatBuild = !isNativeApp && (
  import.meta.env.VITE_UAT_MODE === "true" ||
  /^britium-uat(?:[-.]|$)/.test(browserHost)
);
const configuredUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const configuredAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const isValidUatUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(configuredUrl);
const isProductionProject = configuredUrl === DEFAULT_SUPABASE_URL;
const isUatConfigured = isValidUatUrl && !isProductionProject && Boolean(configuredAnonKey);
const directSupabaseUrl = isUatBuild
  ? (isUatConfigured ? configuredUrl : "")
  : (configuredUrl || DEFAULT_SUPABASE_URL);

// Native WebViews cannot use a relative proxy. Leave the existing native
// production gateway unchanged.
const nativeProxyUrl = String(
  import.meta.env.VITE_NATIVE_SUPABASE_PROXY_URL || "https://www.britiumexpress.com/supabase"
).trim().replace(/\/+$/, "");
const shouldUseWebProxy = import.meta.env.PROD && typeof window !== "undefined" && !isNativeApp && !isUatBuild;
const supabaseUrl = isNativeApp
  ? nativeProxyUrl
  : shouldUseWebProxy
    ? `${window.location.origin}/supabase`
    : directSupabaseUrl;
const supabaseAnonKey = isUatBuild
  ? (isUatConfigured ? configuredAnonKey : "")
  : (configuredAnonKey || DEFAULT_SUPABASE_ANON_KEY);

if (isUatBuild && !isUatConfigured) {
  console.error(
    "[Britium UAT] Isolated VITE_SUPABASE_URL and matching VITE_SUPABASE_ANON_KEY are required. Production Supabase fallback is disabled."
  );
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
export const isSupabaseConfigured = isUatBuild ? isUatConfigured : Boolean(directSupabaseUrl && supabaseAnonKey);
