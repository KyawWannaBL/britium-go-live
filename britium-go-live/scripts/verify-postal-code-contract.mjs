import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
});

try {
  const [{ resolvePostalCode }, { convertMyanmarAddressToEnglish }, postalData] = await Promise.all([
    server.ssrLoadModule("/src/lib/postalCodeResolver.ts"),
    server.ssrLoadModule("/src/lib/myanmarAddressConverter.ts"),
    server.ssrLoadModule("/src/lib/postalCodeData.ts"),
  ]);
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
