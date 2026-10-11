import { budgetRpc } from '../server/mapbox-budget.mjs';
const MAPBOX_FORWARD = "https://api.mapbox.com/search/geocode/v6/forward";

function env(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

async function verifySupabaseUser(request) {
  const authorization = String(request.headers.get("authorization") || "");
  if (!/^Bearer\s+\S+/i.test(authorization)) return false;
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/+$/, "");
  const key = env("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
  if (!url || !key) return false;
  try {
    const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: authorization } });
    return response.ok;
  } catch {
    return false;
  }
}

export default {
  async fetch(request) {
    try {
      if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: "GET" });
      if (!(await verifySupabaseUser(request))) return json({ ok: false, error: "authenticated_location_session_required" }, 401);

      const url = new URL(request.url);
      const query = String(url.searchParams.get("q") || "").trim();
      if (query.length < 3 || query.length > 256) return json({ ok: false, error: "invalid_query" }, 400);

      const token = env("MAPBOX_ACCESS_TOKEN", "VITE_MAPBOX_ACCESS_TOKEN", "VITE_MAPBOX_TOKEN");
      if (!token) return json({ ok: false, error: "mapbox_token_missing" }, 503);

      // Results feed saved delivery addresses, so temporary geocoding cannot
      // be used here. Claim the permanent cache entry and reserve cost atomically.
      const canonical = `v6|MM|en|8|${query.toLowerCase().replace(/\s+/g, ' ')}`;
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
      const cacheKey=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      let claim;
      try { claim=await budgetRpc('be_mapbox_claim_geocode_v1',{p_cache_key:cacheKey}); }
      catch { return json({ok:false,error:'mapbox_budget_store_unavailable'},503); }
      if(claim?.cached===true) return json({ok:true,features:claim.payload?.features||[],cached:true});
      if(claim?.allowed!==true) return json({ok:false,error:'mapbox_budget_blocked',reason:claim?.reason||'DENIED'},503);

      const params = new URLSearchParams({
        q: query,
        country: "MM",
        language: "en",
        limit: "8",
        autocomplete: "false",
        permanent: "true",
        access_token: token,
      });
      const response = await fetch(`${MAPBOX_FORWARD}?${params.toString()}`, { headers: { Accept: "application/json" }, signal:AbortSignal.timeout(5500) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return json({
          ok: false,
          error: "mapbox_geocode_failed",
          message: String(payload?.message || payload?.error || `Mapbox ${response.status}`),
        }, 502);
      }

      if(!Array.isArray(payload?.features)) return json({ok:false,error:'invalid_mapbox_geocode_response'},502);
      try { await budgetRpc('be_mapbox_complete_geocode_v1',{p_cache_key:cacheKey,p_lease_id:claim.lease_id,p_payload:payload}); } catch { /* Keep reservation charged; never retry Mapbox here. */ }
      return json({ ok: true, features: payload.features });
    } catch (error) {
      return json({ ok: false, error: "mapbox_geocode_proxy_failed", message: String(error?.message || error) }, 502);
    }
  },
};
