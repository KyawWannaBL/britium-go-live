import assert from "node:assert/strict";
import { createServer } from "vite";
import mapboxGeocodeHandler from "../api/mapbox-geocode.mjs";

const server = await createServer({
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
});

try {
  const [{ resolvePostalCode }, { convertMyanmarAddressToEnglish }, postalData, locationService] = await Promise.all([
    server.ssrLoadModule("/src/lib/postalCodeResolver.ts"),
    server.ssrLoadModule("/src/lib/myanmarAddressConverter.ts"),
    server.ssrLoadModule("/src/lib/postalCodeData.ts"),
    server.ssrLoadModule("/src/lib/deliveryLocationService.ts"),
  ]);
  const { buildDeliveryAddressQueries, townshipEvidenceMatches, validateDeliveryCandidate } = locationService;
  const { POSTAL_CODE_REGIONS, POSTAL_CODE_ROWS, POSTAL_CODE_TOWNSHIPS } = postalData;

  const assertPostal = (address, township, expectedCode, expectedLevel = "EXACT_QUARTER") => {
    const result = resolvePostalCode(address, township);
    assert.equal(result.postalCode, expectedCode, `${address} (${township})`);
    assert.equal(result.matchLevel, expectedLevel, `${address} (${township}) match level`);
  };

  // Screenshot regression: North must remain part of the township name, and the
  // house number must never be interpreted as the ward number.
  assertPostal(
    "အမှတ် ၇၇၊ ပင်လုံလမ်း၊ အမှတ် (၃၂) ရပ်ကွက်၊ မြောက်ဒဂုံမြို့နယ်၊ ရန်ကုန်",
    "မြောက်ဒဂုံ",
    "1142007",
  );
  assertPostal(
    "No. 77, Pinlon Road, Ward 32, North Dagon Township, Yangon",
    "North Dagon",
    "1142007",
  );
  assertPostal(
    "No. 32, Pinlon Road, Ward 31, North Dagon Township, Yangon",
    "North Dagon",
    "1142006",
  );
  assertPostal(
    "No. 32, Pinlon Road, North Dagon Township, Yangon",
    "North Dagon",
    "",
    "TOWNSHIP_ONLY",
  );
  assertPostal("Ward 3, South Okkalapa Township, Yangon", "South Okkalapa", "1109001");
  assertPostal("အမှတ် (၉) ရပ်ကွက်၊ အရှေ့ဒဂုံ", "အရှေ့ဒဂုံ", "1145009");
  assertPostal("အမှတ် (၉) ရပ်ကွက်၊ ဒဂုံမြို့သစ် (အရှေ့ပိုင်း) မြို့နယ်", "ဒဂုံမြို့သစ်အရှေ့ပိုင်း", "1145009");
  assertPostal("အမှတ် (၁၈) ရပ်ကွက်၊ တောင်ဒဂုံ", "တောင်ဒဂုံ", "1143002");
  assertPostal("အမှတ် (၅၈) ရပ်ကွက်၊ ဒဂုံဆိပ်ကမ်း", "ဒဂုံဆိပ်ကမ်း", "1144001");
  assertPostal("Ward 1, Hlaing Tharyar Township, Yangon", "Hlaing Tharyar", "1140001");
  assertPostal("Ward 9, Hlaing Tharyar Township, Yangon", "Hlaing Tharyar", "1141001");
  assertPostal("No (1) Quarter, Myo Hla Town", "Myo Hla Town", "", "TOWNSHIP_ONLY");
  assertPostal("No (1) Quarter, Yangon Region", "-", "", "UNRESOLVED");

  const converted = convertMyanmarAddressToEnglish(
    "အမှတ် ၇၇၊ ပင်လုံလမ်း၊ အမှတ် (၃၂) ရပ်ကွက်၊ မြောက်ဒဂုံမြို့နယ်",
    "မြောက်ဒဂုံ",
  );
  assert.match(converted, /North Dagon Township/, "North Dagon must translate completely");
  assert.doesNotMatch(converted, /မြောက်Dagon/, "North Dagon must not be partially translated");
  assert.equal(
    (converted.match(/North Dagon Township/g) || []).length,
    1,
    "North Dagon must not be duplicated when it appears in both the address and township field",
  );

  const canonicalConverted = convertMyanmarAddressToEnglish(
    "အမှတ် ၇၇၊ အမှတ် (၃၂) ရပ်ကွက်၊ ဒဂုံမြို့သစ် (မြောက်ပိုင်း) မြို့နယ်",
    "မြောက်ဒဂုံ",
  );
  assert.match(canonicalConverted, /North Dagon Township/);
  assert.doesNotMatch(canonicalConverted, /ဒဂုံ|မြောက်ပိုင်း/, "Canonical Myanmar township must translate completely");
  assert.equal((canonicalConverted.match(/North Dagon Township/g) || []).length, 1);

  const eastConverted = convertMyanmarAddressToEnglish(
    "အမှတ် (၉) ရပ်ကွက်၊ ဒဂုံမြို့သစ်အရှေ့ပိုင်းမြို့နယ်",
    "အရှေ့ဒဂုံ",
  );
  assert.match(eastConverted, /East Dagon Township/);
  assert.doesNotMatch(eastConverted, /အရှေ့Dagon|ဒဂုံ/);

  const northDagonPostal = resolvePostalCode(
    "အမှတ် ၇၇၊ ပင်လုံလမ်း၊ အမှတ် (၃၂) ရပ်ကွက်၊ မြောက်ဒဂုံမြို့နယ်",
    "မြောက်ဒဂုံ",
  );
  const queries = buildDeliveryAddressQueries(
    "အမှတ် ၇၇၊ ပင်လုံလမ်း၊ အမှတ် (၃၂) ရပ်ကွက်၊ မြောက်ဒဂုံမြို့နယ်",
    "မြောက်ဒဂုံ",
    northDagonPostal.postalCode,
    northDagonPostal.quarter,
    northDagonPostal.township,
  );
  assert.ok(queries.some((query) => /North Dagon Township/.test(query)), "Geocoder query must use canonical North Dagon");
  assert.ok(queries.every((query) => !/မြောက်Dagon|ဒဂုံမြို့သစ်/.test(query)), "Geocoder query must not mix Myanmar and partial English township names");
  assert.ok(queries.every((query) => (query.match(/\bYangon\b/g) || []).length <= 1), "Geocoder query must not duplicate Yangon");
  assert.ok(queries.every((query) => (query.match(/\bMyanmar\b/g) || []).length <= 1), "Geocoder query must not duplicate Myanmar");
  assert.ok(queries.every((query) => (query.match(/North Dagon Township/g) || []).length <= 1), "Geocoder query must not duplicate North Dagon");

  assert.equal(
    townshipEvidenceMatches("Ward 32, North Dagon Township, Yangon", "မြောက်ဒဂုံ", northDagonPostal.township),
    true,
  );
  assert.equal(
    townshipEvidenceMatches("Ward 32, Dagon Myothit (North) Township, Yangon", "မြောက်ဒဂုံ", northDagonPostal.township),
    true,
  );
  assert.equal(
    townshipEvidenceMatches("Ward 32, North Okkalapa Township, Yangon", "မြောက်ဒဂုံ", northDagonPostal.township),
    false,
    "North Okkalapa must never satisfy North Dagon evidence",
  );
  assert.equal(
    townshipEvidenceMatches("Ward 9, East Dagon Township, Yangon", "မြောက်ဒဂုံ", northDagonPostal.township),
    false,
    "East Dagon must never satisfy North Dagon evidence",
  );

  const wrongTownshipCandidate = validateDeliveryCandidate({
    text: "Ward 32, North Okkalapa Township, Yangon",
    latitude: 16.917583,
    longitude: 96.16738,
    matchLevel: "WARD_APPROXIMATE",
    confidence: 0.67,
    provider: "MAPBOX",
  }, {
    address: "No. 77, Ward 32, North Dagon Township, Yangon",
    township: "မြောက်ဒဂုံ",
  }, northDagonPostal, false);
  assert.equal(wrongTownshipCandidate.areaMatch, true, "Regression coordinate demonstrates why the old rectangle was insufficient");
  assert.equal(wrongTownshipCandidate.townshipMatch, false);
  assert.equal(wrongTownshipCandidate.reviewReason, "TOWNSHIP_MISMATCH");

  const correctTownshipCandidate = validateDeliveryCandidate({
    text: "Ward 32, North Dagon Township, Yangon",
    latitude: 16.95,
    longitude: 96.21,
    matchLevel: "WARD_APPROXIMATE",
    confidence: 0.67,
    provider: "MAPBOX",
  }, {
    address: "No. 77, Ward 32, North Dagon Township, Yangon",
    township: "မြောက်ဒဂုံ",
  }, northDagonPostal, false);
  assert.equal(correctTownshipCandidate.townshipMatch, true);
  assert.equal(correctTownshipCandidate.postalValidated, true);
  assert.equal(correctTownshipCandidate.reviewStatus, "MANUAL_REVIEW");

  const originalFetch = globalThis.fetch;
  const originalMapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
  let requestedMapboxUrl = "";
  try {
    process.env.MAPBOX_ACCESS_TOKEN = "contract-test-token";
    globalThis.fetch = async (url) => {
      requestedMapboxUrl = String(url);
      return new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    let responseBody = "";
    const response = {
      statusCode: 0,
      setHeader() {},
      end(value) { responseBody = String(value ?? ""); },
    };
    await mapboxGeocodeHandler({
      method: "GET",
      headers: { "sec-fetch-site": "same-origin" },
      query: { latitude: "16.917583", longitude: "96.167380" },
    }, response);
    assert.equal(response.statusCode, 200);
    assert.doesNotThrow(() => JSON.parse(responseBody), "Reverse-geocode proxy must always return complete JSON");
    assert.match(requestedMapboxUrl, /\/search\/geocode\/v6\/reverse\?/);
    assert.match(requestedMapboxUrl, /latitude=16\.917583/);
    assert.match(requestedMapboxUrl, /longitude=96\.16738/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalMapboxToken == null) delete process.env.MAPBOX_ACCESS_TOKEN;
    else process.env.MAPBOX_ACCESS_TOKEN = originalMapboxToken;
  }

  const cases = [];
  for (const [townshipIndex, quarterEn, postalCode, quarterMm] of POSTAL_CODE_ROWS) {
    const [townshipEn, townshipMm, regionIndex] = POSTAL_CODE_TOWNSHIPS[townshipIndex];
    const [regionEn, regionMm] = POSTAL_CODE_REGIONS[regionIndex];
    cases.push({
      language: "en",
      region: regionEn,
      township: townshipEn,
      quarter: quarterEn,
      address: `${quarterEn}, ${townshipEn}, ${regionEn}`,
      postalCode,
      placeholderTownship: townshipEn.trim() === "-",
    });
    cases.push({
      language: "mm",
      region: regionMm,
      township: townshipMm,
      quarter: quarterMm,
      address: `${quarterMm}၊ ${townshipMm}၊ ${regionMm}`,
      postalCode,
      placeholderTownship: townshipMm.trim() === "-",
    });
  }

  const groups = new Map();
  for (const testCase of cases) {
    const groupKey = JSON.stringify([
      testCase.language,
      testCase.region,
      testCase.township,
      testCase.quarter,
    ]);
    const group = groups.get(groupKey) || { example: testCase, postalCodes: new Set() };
    group.postalCodes.add(testCase.postalCode);
    groups.set(groupKey, group);
  }

  let exactCases = 0;
  let ambiguousCases = 0;
  let placeholderCases = 0;
  const failures = [];

  for (const { example, postalCodes } of groups.values()) {
    const result = resolvePostalCode(example.address, example.township);
    if (example.placeholderTownship) {
      placeholderCases += 1;
      if (result.postalCode || result.matchLevel !== "UNRESOLVED") {
        failures.push({ kind: "placeholder-guessed", example, actual: result });
      }
    } else if (postalCodes.size > 1) {
      ambiguousCases += 1;
      if (result.postalCode) failures.push({ kind: "ambiguous-guessed", example, actual: result });
    } else {
      exactCases += 1;
      const [expectedCode] = postalCodes;
      if (result.postalCode !== expectedCode || result.matchLevel !== "EXACT_QUARTER") {
        failures.push({ kind: "exact-mismatch", example, expectedCode, actual: result });
      }
    }
  }

  assert.equal(
    failures.length,
    0,
    `Postal-code contract failures:\n${JSON.stringify(failures.slice(0, 12), null, 2)}`,
  );

  console.log(
    `Postal-code contract passed: ${POSTAL_CODE_ROWS.length} source rows, `
      + `${exactCases} exact bilingual cases, ${ambiguousCases} ambiguous cases left unassigned, `
      + `${placeholderCases} incomplete-township cases left unresolved`,
  );
} finally {
  await server.close();
}
