import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import routeHandler from "../api/wayplan-route.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = {
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
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

function request(input = payload) {
  return new Request("https://example.test/api/wayplan-route", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    },
    body: JSON.stringify(input),
  });
}

function googleMatrixResponse() {
  return [
    { condition: "ROUTE_EXISTS" },
    { destinationIndex: 1, condition: "ROUTE_EXISTS", distanceMeters: 7200, duration: "900s" },
    { destinationIndex: 2, condition: "ROUTE_EXISTS", distanceMeters: 7200, duration: "900s" },
    { originIndex: 1, destinationIndex: 2, condition: "ROUTE_EXISTS", duration: "0s" },
    { originIndex: 2, destinationIndex: 1, condition: "ROUTE_NOT_FOUND" },
  ];
}

try {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.MAPBOX_ACCESS_TOKEN = "mapbox-token";
  process.env.GOOGLE_ROUTES_API_KEY = "google-key";
  process.env.WAYPLAN_ROAD_PROVIDER_MODE = "MAPBOX_PREFERRED_BILLING_HOLD";

  let googleCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) return Response.json({ id: "user-1" }, { status: 200 });
    if (url.includes("/rpc/be_mapbox_reserve_v1")) return Response.json({allowed:true});
    if (url.includes("api.mapbox.com")) return Response.json({ code: "Temporary", message: "simulated Mapbox outage" }, { status: 503 });
    if (url.includes("routes.googleapis.com")) {
      googleCalls += 1;
      return Response.json(googleMatrixResponse(), { status: 200 });
    }
    throw new Error("Unexpected URL: " + url);
  };

  const recoveredResponse = await routeHandler.fetch(request());
  const recoveredBody = await recoveredResponse.json();
  assert.equal(recoveredResponse.status, 200, "billing-hold mode must use the local fallback instead of returning 503");
  assert.equal(recoveredBody.ok, true);
  assert.equal(recoveredBody.source, "DEFERRED_PROVIDER");
  assert.equal(googleCalls, 0, "Mapbox outage must not cause unexpected Google fees");

  process.env.WAYPLAN_ROAD_PROVIDER_MODE = "GOOGLE_ONLY";
  const samePin = { ...payload.stops[0], delivery_way_id: "DTEST-002" };
  const google = await (await routeHandler.fetch(request({ ...payload, stops: [...payload.stops, samePin] }))).json();
  assert.equal(google.source, "GOOGLE_ROUTES");
  assert.equal(google.distance_m, 7200);
  assert.deepEqual(google.ordered_stops.map((row) => row.delivery_way_id), ["DTEST-001", "DTEST-002"]);
  const originMatrix = await (await routeHandler.fetch(request({ ...payload, matrix_mode: "ONE_TO_MANY" }))).json();
  assert.equal(originMatrix.source, "GOOGLE_ROUTES");
  assert.deepEqual(originMatrix.distances, [[0]]);
  const health = await (await routeHandler.fetch(new Request("https://example.test/api/wayplan-route?health=1"))).json();
  assert.equal(health.mapbox_fallback_configured, false);
  assert.equal(health.road_routing_available, null);

  process.env.WAYPLAN_ROAD_PROVIDER_MODE = "MAPBOX_PREFERRED_BILLING_HOLD";
  process.env.GOOGLE_ROUTES_API_KEY = "";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) return Response.json({ id: "user-1" }, { status: 200 });
    if (url.includes("/rpc/be_mapbox_reserve_v1")) return Response.json({allowed:true});
    if (url.includes("api.mapbox.com")) return Response.json({ code: "Temporary", message: "simulated Mapbox outage" }, { status: 503 });
    if (url.includes("routes.googleapis.com")) throw new Error("Google must not be called without a configured key");
    throw new Error("Unexpected URL: " + url);
  };

  const deferredResponse = await routeHandler.fetch(request());
  const deferredBody = await deferredResponse.json();
  assert.equal(deferredResponse.status, 200, "provider outage must degrade to an assignment-ready response instead of HTTP 503");
  assert.equal(deferredBody.ok, true);
  assert.equal(deferredBody.source, "DEFERRED_PROVIDER");
  assert.equal(deferredBody.route_mode, "LOCAL_HAVERSINE_ESTIMATE");
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
