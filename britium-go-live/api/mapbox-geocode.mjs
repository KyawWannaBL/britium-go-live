const json = (response, status, payload) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
};

export default async function handler(request, response) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });

  const fetchSite = String(request.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite && !["same-origin", "same-site"].includes(fetchSite)) {
    return json(response, 403, { error: "Cross-site location requests are not allowed." });
  }

  const query = String(request.query?.q || "").trim();
  if (query.length < 3 || query.length > 500) {
    return json(response, 400, { error: "A valid delivery-location query is required." });
  }

  const token = String(
    process.env.MAPBOX_ACCESS_TOKEN ||
    process.env.VITE_MAPBOX_ACCESS_TOKEN ||
    process.env.VITE_MAPBOX_TOKEN ||
    "",
  ).trim();
  if (!token) {
    return json(response, 503, {
      error: "Mapbox is not configured on the server. Add MAPBOX_ACCESS_TOKEN in Vercel Production environment variables and redeploy.",
    });
  }

  const parameters = new URLSearchParams({
    q: query,
    country: "MM",
    limit: "8",
    language: "en,my",
    proximity: "96.199675,16.889554",
    access_token: token,
  });

  try {
    const upstream = await fetch(
      `https://api.mapbox.com/search/geocode/v6/forward?${parameters.toString()}`,
      {
        headers: { Accept: "application/json", "User-Agent": "Britium-Location-Service/11.2" },
        signal: AbortSignal.timeout(12000),
      },
    );
    const body = await upstream.text();
    if (!upstream.ok) {
      let upstreamMessage = "";
      try { upstreamMessage = String(JSON.parse(body)?.message || ""); } catch {}
      return json(response, upstream.status, {
        error: upstreamMessage || `Mapbox rejected the location request (${upstream.status}).`,
      });
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(body);
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return json(response, 502, {
      error: timedOut
        ? "Mapbox did not respond within 12 seconds. Please try again."
        : "The server could not connect to Mapbox. Check Vercel runtime networking and the Mapbox token.",
    });
  }
}


