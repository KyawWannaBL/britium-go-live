// Britium Express password recovery. Public anon/publishable key only; never use service-role keys.
const UAT_REF = "hgijdyfwmvskchsruknp";
const UAT_URL = `https://${UAT_REF}.supabase.co`;
const UAT_HOST = /^britium-uat-mdy-insein(?:-[a-z0-9-]+)?\.vercel\.app$/i;

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
function isUatBrowserKey(key) {
  if (key.startsWith("sb_publishable_")) return true;
  if (!key.startsWith("eyJ")) return false;
  try {
    const segment = key.split(".")[1];
    const payload = JSON.parse(atob(segment.replace(/-/g, "+").replace(/_/g, "/")));
    return payload.ref === UAT_REF && payload.role === "anon";
  } catch { return false; }
}

export default {
  async fetch(req) {
    let host;
    try { host = new URL(req.url).hostname.toLowerCase(); }
    catch { return json({ ok: false, error: "bad_request" }, 400); }
    const isUat = UAT_HOST.test(host);
    // Prefer Vite's browser project pair on UAT; the older server-side
    // SUPABASE_* pair can belong to the live production project.
    const url = String(
      isUat
        ? (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "")
        : (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "")
    ).trim().replace(/\/+$/, "");
    const key = String(
      isUat
        ? (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "")
        : (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "")
    ).trim();
    if (!url || !key) return json({ ok: false, error: "missing_supabase_env" }, 503);
    // FAIL CLOSED: never request a recovery email or accept a recovery-token
    // password update against production when the request is for UAT.
    if (isUat && (url !== UAT_URL || !isUatBrowserKey(key))) {
      return json({ ok: false, error: "uat_auth_config_mismatch" }, 503);
    }
    if (req.method === "GET" && isUat && new URL(req.url).searchParams.get("public_config") === "1") {
      // This is intentionally a PUBLIC browser key, not an admin secret.
      return json({ ok: true, supabaseUrl: UAT_URL, anonKey: key });
    }
    if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    try {
      const body = await req.json();
      const email = String(body?.email || "").trim().toLowerCase();
      const mode = body?.mode === "rider" ? "rider" : "portal";
      if (!email || !email.includes("@")) return json({ ok: false, error: "invalid_email" }, 400);
      const next = mode === "rider" ? "/rider-dashboard" : "/dashboard";
      const recoveryOrigin = isUat ? `https://${host}` : "https://www.britiumexpress.com";
      const redirectTo = `${recoveryOrigin}/auth-recovery.html?mode=${encodeURIComponent(mode)}&next=${encodeURIComponent(next)}`;
      const response = await fetch(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        console.error("[Britium recovery] Upstream status:", response.status);
        return json({ ok: false, error: response.status === 429 ? "rate_limited" : "recovery_unavailable" }, response.status === 429 ? 429 : 502);
      }
      return json({ ok: true });
    } catch (error) {
      console.error("[Britium recovery] Request could not be completed:", error instanceof Error ? error.name : "unknown");
      return json({ ok: false, error: "recovery_unavailable" }, 500);
    }
  },
};
