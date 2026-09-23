import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { classifyMapboxFeature, acceptedMapboxRoutingSource } from "../src/lib/mapboxLocationPolicy.ts";
import mapboxHandler from "../api/mapbox-geocode.mjs";

assert.deepEqual(classifyMapboxFeature({ properties: { feature_type: "address" } }), { matchLevel: "ADDRESS_EXACT", confidence: 0.96 });
assert.deepEqual(classifyMapboxFeature({ properties: { feature_type: "poi" } }), { matchLevel: "POI_EXACT", confidence: 0.90 });
assert.deepEqual(classifyMapboxFeature({ properties: { feature_type: "street" } }), { matchLevel: "STREET_APPROXIMATE", confidence: 0.78 });
assert.deepEqual(classifyMapboxFeature({ properties: { feature_type: "neighborhood" } }), { matchLevel: "WARD_APPROXIMATE", confidence: 0.67 });
assert.equal(classifyMapboxFeature({ properties: { feature_type: "region" } }), null);

assert.equal(acceptedMapboxRoutingSource("MAPBOX_POSTAL_VALIDATED_ADDRESS_EXACT", "ADDRESS_EXACT", "ACCEPTED"), true);
assert.equal(acceptedMapboxRoutingSource("MAPBOX_TOWNSHIP_EXACT_VALIDATED_POI_EXACT", "POI_EXACT", "ACCEPTED"), true);
assert.equal(acceptedMapboxRoutingSource("MAPBOX_POSTAL_VALIDATED_STREET_APPROXIMATE", "STREET_APPROXIMATE", "ACCEPTED"), false);
assert.equal(acceptedMapboxRoutingSource("MAPBOX_POSTAL_VALIDATED_ADDRESS_EXACT", "ADDRESS_EXACT", "MANUAL_REVIEW"), false);

const originalFetch = globalThis.fetch;
const originalEnv = {
  MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
};

try {
  process.env.MAPBOX_ACCESS_TOKEN = "mapbox-test-token";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";

  let mapboxUrl = "";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) return Response.json({ id: "user-1" }, { status: 200 });
    if (url.includes("api.mapbox.com")) {
      mapboxUrl = url;
      return Response.json({
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: { coordinates: [96.15, 16.82] }, properties: { feature_type: "address", full_address: "Yangon" } }],
      }, { status: 200 });
    }
    throw new Error("Unexpected URL: " + url);
  };

  const request = new Request("https://example.test/api/mapbox-geocode?q=No.%201,%20Yangon", {
    headers: { Authorization: "Bearer user-token" },
  });
  const response = await mapboxHandler.fetch(request);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.features.length, 1);
  assert.match(mapboxUrl, /search\/geocode\/v6\/forward/);
  assert.match(mapboxUrl, /country=MM/);
  assert.match(mapboxUrl, /permanent=true/);
  assert.ok(!mapboxUrl.includes("user-token"));

  const unauth = await mapboxHandler.fetch(new Request("https://example.test/api/mapbox-geocode?q=Yangon"));
  assert.equal(unauth.status, 401);

  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const resolver = fs.readFileSync(path.join(root, "src/lib/deliveryLocationService.ts"), "utf8");
  assert.match(resolver, /\/api\/mapbox-geocode/);
  assert.match(resolver, /provider:\s*"MAPBOX"/);
  assert.match(resolver, /Promise\.allSettled\(queries\.map/);

  const migrationFiles = fs.readdirSync(path.join(root, "supabase/migrations")).filter((name) => name.includes("mapbox_location_recovery_v130"));
  assert.equal(migrationFiles.length, 1, "V130 Mapbox location migration must be committed.");
  const migration = fs.readFileSync(path.join(root, "supabase/migrations", migrationFiles[0]), "utf8");
  assert.match(migration, /MAPBOX_\(\?:POSTAL_VALIDATED\|TOWNSHIP_EXACT_VALIDATED\)/);
  assert.match(migration, /ADDRESS_EXACT.*POI_EXACT/s);

  console.log("mapbox location v130: PASS");
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
