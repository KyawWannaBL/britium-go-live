import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import routeHandler from "../api/wayplan-route.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN,
  GOOGLE_ROUTES_API_KEY: process.env.GOOGLE_ROUTES_API_KEY,
  WAYPLAN_ROAD_PROVIDER_MODE: process.env.WAYPLAN_ROAD_PROVIDER_MODE,
};

const payload = {
  origin: { latitude: 16.8409, longitude: 96.1735 },
  stops: [
    {
      delivery_way_id: "DTEST-001",
      township: "Kamayut",
      latitude: 16.8171,
      longitude: 96.1342,
    },
  ],
};

function request() {
  return new Request("https://example.test/api/wayplan-route", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    },
    body: JSON.stringify(payload),
  });
}

function googleMatrixResponse() {
  return [
    { originIndex: 0, destinationIndex: 0, condition: "ROUTE_EXISTS", distanceMeters: 0, duration: "0s" },
    { originIndex: 0, destinationIndex: 1, condition: "ROUTE_EXISTS", distanceMeters: 7200, duration: "900s" },
    { originIndex: 1, destinationIndex: 0, condition: "ROUTE_EXISTS", distanceMeters: 7100, duration: "880s" },
    { originIndex: 1, destinationIndex: 1, condition: "ROUTE_EXISTS", distanceMeters: 0, duration: "0s" },
  ];
}

try {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.MAPBOX_ACCESS_TOKEN = "mapbox-token";
  process.env.GOOGLE_ROUTES_API_KEY = "google-key";
  process.env.WAYPLAN_ROAD_PROVIDER_MODE = "MAPBOX_PREFERRED_BILLING_HOLD";

  let googleCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) return Response.json({ id: "user-1" }, { status: 200 });
    if (url.includes("api.mapbox.com")) return Response.json({ code: "Temporary", message: "simulated Mapbox outage" }, { status: 503 });
    if (url.includes("routes.googleapis.com")) {
      googleCalls += 1;
      return Response.json(googleMatrixResponse(), { status: 200 });
    }
    throw new Error("Unexpected URL: " + url);
  };

  const recoveredResponse = await routeHandler.fetch(request());
  const recoveredBody = await recoveredResponse.json();
  assert.equal(recoveredResponse.status, 200, "billing-hold mode must fail over to Google instead of returning 503");
  assert.equal(recoveredBody.ok, true);
  assert.equal(recoveredBody.source, "GOOGLE_ROUTES");
  assert.ok(googleCalls > 0, "Google must be attempted only after Mapbox fails");

  process.env.GOOGLE_ROUTES_API_KEY = "";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) return Response.json({ id: "user-1" }, { status: 200 });
    if (url.includes("api.mapbox.com")) return Response.json({ code: "Temporary", message: "simulated Mapbox outage" }, { status: 503 });
    if (url.includes("routes.googleapis.com")) throw new Error("Google must not be called without a configured key");
    throw new Error("Unexpected URL: " + url);
  };

  const deferredResponse = await routeHandler.fetch(request());
  const deferredBody = await deferredResponse.json();
  assert.equal(deferredResponse.status, 200, "provider outage must degrade to an assignment-ready response instead of HTTP 503");
  assert.equal(deferredBody.ok, true);
  assert.equal(deferredBody.source, "DEFERRED_PROVIDER");
  assert.equal(deferredBody.route_mode, "PROVIDER_OUTAGE_OPERATOR_REVIEW");
  assert.deepEqual(deferredBody.ordered_stops.map((row) => row.delivery_way_id), ["DTEST-001"]);
  assert.match(String(deferredBody.warning || ""), /provider/i);

  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const planner = fs.readFileSync(path.join(root, "src/components/MultiVanPlanner.tsx"), "utf8");
  assert.match(
    planner,
    /\["GOOGLE_ROUTES",\s*"MAPBOX_FALLBACK",\s*"DEFERRED_PROVIDER"\]\.includes\(String\(result\.source/,
    "the planner must accept the server DEFERRED_PROVIDER response without throwing"
  );

  console.log("wayplan provider resilience v129: PASS");
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
