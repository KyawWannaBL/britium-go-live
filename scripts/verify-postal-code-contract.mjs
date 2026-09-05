import assert from "node:assert/strict";
import { createServer } from "vite";

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
  const {
    buildDeliveryAddressQueries,
    coordinateMatchesTownship,
    googleMapsAddressOpenUrl,
    googleMapsAddressUrl,
    resolveDeliveryLocation,
    townshipEvidenceMatches,
    validateDeliveryCandidate,
    hasIndependentLocationAgreement,
  } = locationService;
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
  assert.match(converted, /Pinlon Road/, "Pinlon Road must translate completely for Google");
  assert.doesNotMatch(converted, /ပင်လုံ/, "The Google query must not retain the Myanmar Pinlon road name");
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
  assert.ok(queries.some((query) => /အမှတ် ၇၇/.test(query)), "Google Places must receive the original Myanmar spelling");
  assert.ok(queries.every((query) => !query.includes(northDagonPostal.postalCode)), "Internal postal identifiers must not distort Google Places searches");
  assert.ok(queries.every((query) => !/မြောက်Dagon|ဒဂုံမြို့သစ်/.test(query)), "Geocoder query must not mix Myanmar and partial English township names");
  assert.ok(queries.every((query) => (query.match(/\bYangon\b/g) || []).length <= 1), "Geocoder query must not duplicate Yangon");
  assert.ok(queries.every((query) => (query.match(/\bMyanmar\b/g) || []).length <= 1), "Geocoder query must not duplicate Myanmar");
  assert.ok(queries.every((query) => (query.match(/North Dagon Township/g) || []).length <= 1), "Geocoder query must not duplicate North Dagon");
  const addressPreviewUrl = googleMapsAddressUrl(
    "အမှတ် ၇၇၊ ပင်လုံလမ်း၊ အမှတ် (၃၂) ရပ်ကွက်",
    "မြောက်ဒဂုံ",
  );
  assert.match(decodeURIComponent(addressPreviewUrl), /Pinlon Road/);
  assert.match(decodeURIComponent(addressPreviewUrl), /North Dagon Township/);
  assert.match(addressPreviewUrl, /^https:\/\/www\.google\.com\/maps\?q=/);
  assert.doesNotMatch(addressPreviewUrl, /key=/i, "The read-only address preview must not require a Google API key");
  assert.match(googleMapsAddressOpenUrl("No. 77, Pinlon Road", "North Dagon"), /\/maps\/search\/\?api=1&query=/);

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
    provider: "GOOGLE",
  }, {
    address: "No. 77, Ward 32, North Dagon Township, Yangon",
    township: "မြောက်ဒဂုံ",
  }, northDagonPostal, false);
  assert.equal(wrongTownshipCandidate.areaMatch, false, "The real North Dagon polygon must reject the old North Okkalapa pin");
  assert.equal(wrongTownshipCandidate.townshipMatch, false);
  assert.equal(wrongTownshipCandidate.reviewReason, "OUTSIDE_TOWNSHIP_AREA");

  const correctTownshipCandidate = validateDeliveryCandidate({
    text: "Ward 32, North Dagon Township, Yangon",
    latitude: 16.9,
    longitude: 96.19,
    matchLevel: "WARD_APPROXIMATE",
    confidence: 0.67,
    provider: "GOOGLE",
  }, {
    address: "No. 77, Ward 32, North Dagon Township, Yangon",
    township: "မြောက်ဒဂုံ",
  }, northDagonPostal, false);
  assert.equal(correctTownshipCandidate.townshipMatch, true);
  assert.equal(correctTownshipCandidate.postalValidated, true);
  assert.equal(correctTownshipCandidate.reviewStatus, "MANUAL_REVIEW");

  const approximateStreetCandidate = validateDeliveryCandidate({
    text: "Pinlon Road, Ward 32, North Dagon Township, Yangon",
    latitude: 16.9,
    longitude: 96.19,
    matchLevel: "STREET_APPROXIMATE",
    confidence: 0.99,
    provider: "GOOGLE_PLACES",
    providerRank: 0,
  }, {
    address: "No. 77, Pinlon Road, Ward 32, North Dagon Township, Yangon",
    township: "မြောက်ဒဂုံ",
  }, northDagonPostal, false);
  assert.equal(approximateStreetCandidate.reviewStatus, "MANUAL_REVIEW", "A street/ward centroid must never auto-save");

  const agreedStreetCandidate = validateDeliveryCandidate({
    text: "Pinlon Road, Ward 32, North Dagon Township, Yangon",
    latitude: 16.9,
    longitude: 96.19,
    matchLevel: "STREET_APPROXIMATE",
    confidence: 0.84,
    provider: "GOOGLE_PLACES",
    providerRank: 0,
  }, {
    address: "No. 77, Pinlon Road, Ward 32, North Dagon Township, Yangon",
    township: "မြောက်ဒဂုံ",
  }, northDagonPostal, true);
  assert.equal(agreedStreetCandidate.reviewStatus, "ACCEPTED", "An independently corroborated township-valid street result should auto-save");
  assert.equal(hasIndependentLocationAgreement(agreedStreetCandidate, [agreedStreetCandidate, {
    ...agreedStreetCandidate,
    provider: "GOOGLE_GEOCODING",
    latitude: 16.9005,
    longitude: 96.1905,
    areaMatch: true,
    townshipMatch: true,
  }]), true, "Places and Geocoding points within 200 metres should independently agree");
  assert.equal(hasIndependentLocationAgreement(agreedStreetCandidate, [agreedStreetCandidate, {
    ...agreedStreetCandidate,
    provider: "GOOGLE_GEOCODING",
    latitude: 16.91,
    longitude: 96.2,
    areaMatch: true,
    townshipMatch: true,
  }]), false, "Distant provider points must not be treated as agreement");

  const originalFetch = globalThis.fetch;
  const originalGoogle = globalThis.google;
  let reverseTownshipEvidence = "North Dagon Township";
  const searchRequests = [];
  try {
    globalThis.fetch = async () => {
      throw new Error("Location resolution must not call a Vercel geocoding proxy.");
    };
    globalThis.google = {
      maps: {
        importLibrary: async (name) => {
          assert.equal(name, "places");
          return {
            Place: {
              searchByText: async (request) => {
                searchRequests.push(request);
                return { places: [{
              id: "places/north-dagon-contract",
              displayName: "No. 77, Pinlon Road",
              formattedAddress: "Ward 32, North Dagon Township, Yangon",
              location: { lat: () => 16.9, lng: () => 96.19 },
              types: ["point_of_interest", "establishment"],
              addressComponents: [{ longText: "North Dagon Township", shortText: "North Dagon" }],
                }] };
              },
            },
          };
        },
        Geocoder: class {
          async geocode(request) {
            if (request?.address) return { results: [] };
            assert.ok(request?.location, "The candidate must be independently reverse-geocoded");
            return {
              results: [{
                formatted_address: `Ward 32, ${reverseTownshipEvidence}, Yangon`,
                address_components: [{ long_name: reverseTownshipEvidence, short_name: reverseTownshipEvidence }],
              }],
            };
          }
        },
      },
    };

    reverseTownshipEvidence = "North Okkalapa Township";
    assert.equal(
      await coordinateMatchesTownship("မြောက်ဒဂုံ", 16.917583, 96.16738),
      false,
      "The audited polygon must reject the old North Okkalapa coordinate before provider evidence",
    );
    assert.equal(
      await coordinateMatchesTownship("မြောက်ဒဂုံ", 16.9, 96.19),
      false,
      "Conflicting Google reverse evidence must reject an otherwise in-boundary North Dagon point",
    );
    assert.equal(
      await resolveDeliveryLocation({
        deliveryWayId: "POSTAL-CONTRACT-001",
        address: "No. 77, Pinlon Road, Ward 32, North Dagon Township, Yangon",
        township: "မြောက်ဒဂုံ",
      }),
      null,
      "A forward North Dagon label must not bypass conflicting reverse-geocoded township evidence",
    );

    reverseTownshipEvidence = "Dagon Myothit (North) Township";
    const reverseValidated = await resolveDeliveryLocation({
      deliveryWayId: "POSTAL-CONTRACT-002",
      address: "No. 77, Pinlon Road, Ward 32, North Dagon Township, Yangon",
      township: "မြောက်ဒဂုံ",
    });
    assert.ok(reverseValidated, "Matching Google forward and reverse township evidence must produce a candidate");
    assert.equal(reverseValidated.coordinateSource, "GOOGLE_PLACES_POSTAL_VALIDATED_POI_EXACT");
    assert.ok(searchRequests.length > 0, "Google Places browser search must be used");
    assert.ok(searchRequests.some((request) => /No\. 77/.test(request.textQuery)), "The typed address must reach Google Places");
    assert.ok(searchRequests.every((request) => request.region === "MM" && request.language === "en"));
    assert.ok(searchRequests.every((request) => request.fields.includes("location") && request.fields.includes("addressComponents")));

    const townshipExactValidated = await resolveDeliveryLocation({
      deliveryWayId: "POSTAL-CONTRACT-002-B",
      address: "No. 77, Pinlon Road, North Dagon Township, Yangon",
      township: "မြောက်ဒဂုံ",
    });
    assert.ok(townshipExactValidated, "An exact Google result may resolve when the address has township-only postal detail");
    assert.equal(townshipExactValidated.postalMatchLevel, "TOWNSHIP_ONLY");
    assert.equal(townshipExactValidated.reviewStatus, "ACCEPTED");
    assert.equal(
      townshipExactValidated.coordinateSource,
      "GOOGLE_PLACES_TOWNSHIP_EXACT_VALIDATED_POI_EXACT",
      "Exact non-postal Google results must carry the explicit V18 township contract lineage",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalGoogle == null) delete globalThis.google;
    else globalThis.google = originalGoogle;
  }

  const googleBeforeFailure = globalThis.google;
  try {
    globalThis.google = {
      maps: {
        importLibrary: async () => {
          throw new Error("REQUEST_DENIED: API key has an IP address restriction");
        },
        Geocoder: class {
          async geocode() {
            throw new Error("REQUEST_DENIED: API key has an IP address restriction");
          }
        },
      },
    };
    assert.equal(
      await coordinateMatchesTownship("မြောက်ဒဂုံ", 16.9, 96.19),
      true,
      "A point inside the audited polygon remains manually applicable if reverse geocoding is unavailable",
    );
    await assert.rejects(
      resolveDeliveryLocation({
        deliveryWayId: "POSTAL-CONTRACT-003",
        address: "No. 77, Pinlon Road, Ward 32, North Dagon Township, Yangon",
        township: "မြောက်ဒဂုံ",
      }),
      /Application restriction to Websites.*www\.britiumexpress\.com.*No coordinates were saved/,
      "Google browser-key failures must be shown to the operator instead of becoming an empty map",
    );
  } finally {
    if (googleBeforeFailure == null) delete globalThis.google;
    else globalThis.google = googleBeforeFailure;
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
