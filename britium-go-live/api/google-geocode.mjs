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
  const longitudeText = String(request.query?.longitude || "").trim();
  const latitudeText = String(request.query?.latitude || "").trim();
  const reverseRequested = Boolean(longitudeText || latitudeText);
  const longitude = Number(longitudeText);
  const latitude = Number(latitudeText);

  if (reverseRequested && (!Number.isFinite(longitude) || !Number.isFinite(latitude)
    || longitude < 92 || longitude > 102 || latitude < 9 || latitude > 29)) {
    return json(response, 400, { error: "Valid Myanmar longitude and latitude values are required." });
  }
  if (!reverseRequested && (query.length < 3 || query.length > 500)) {
    return json(response, 400, { error: "A valid delivery-location query is required." });
  }

  const key = String(
    process.env.GOOGLE_MAPS_SERVER_API_KEY
    || process.env.GOOGLE_MAPS_API_KEY
    || process.env.VITE_GOOGLE_MAPS_API_KEY
    || "",
  ).trim();
  if (!key) {
    return json(response, 503, {
      error: "Google Maps is not configured on the server. Add GOOGLE_MAPS_SERVER_API_KEY in Vercel and redeploy.",
    });
  }

  const parameters = new URLSearchParams(reverseRequested ? {
    latlng: `${latitude},${longitude}`,
    language: "en",
    region: "mm",
    key,
  } : {
    address: query,
    language: "en",
    region: "mm",
    components: "country:MM",
    bounds: "9,92|29,102",
    key,
  });

  try {
    const upstream = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${parameters.toString()}`,
      {
        headers: { Accept: "application/json", "User-Agent": "Britium-Location-Service/14" },
        signal: AbortSignal.timeout(12000),
      },
    );
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok || !body) {
      return json(response, upstream.status || 502, {
        error: body?.error_message || `Google Maps rejected the location request (${upstream.status}).`,
      });
    }
    if (!['OK', 'ZERO_RESULTS'].includes(String(body.status))) {
      return json(response, 502, {
        error: body.error_message || `Google Geocoding failed (${body.status || 'UNKNOWN_ERROR'}).`,
      });
    }
    return json(response, 200, body);
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return json(response, 502, {
      error: timedOut
        ? "Google Maps did not respond within 12 seconds. Please try again."
        : "The server could not connect to Google Maps.",
    });
  }
}
