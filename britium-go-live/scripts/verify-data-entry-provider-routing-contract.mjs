import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
});

try {
  const routing = await server.ssrLoadModule("/src/lib/dataEntryServiceProviderRouting.ts");
  const {
    dataEntryProviderHint,
    resolveDataEntryServiceProvider,
    stripServiceProviderDecoration,
  } = routing;

  const tariffOptions = [
    { destination_key: "မြောက်ဒဂုံ", destination_name: "မြောက်ဒဂုံ", provider_code: "BRITIUM" },
    { destination_key: "မြောက်ဒဂုံ (royal)", destination_name: "မြောက်ဒဂုံ (Royal)", provider_code: "ROYAL EXPRESS" },
    { destination_key: "ချမ်းအေးသာစံ", destination_name: "ချမ်းအေးသာစံ", provider_code: "DK DELIVERY" },
    { destination_key: "ဇမ္ဗူသီရိ", destination_name: "ဇမ္ဗူသီရိ", provider_code: "NPT BRANCH" },
    { destination_key: "တပ်ကုန်း", destination_name: "တပ်ကုန်း", provider_code: "ROYAL EXPRESS" },
    { destination_key: "တောင်ကြီး (royal)", destination_name: "တောင်ကြီး (Royal)", provider_code: "ROYAL EXPRESS" },
  ];

  const providerFor = (township, address = "", options = {}) =>
    resolveDataEntryServiceProvider(township, address, tariffOptions, options).providerCode;

  for (const township of [
    "မန္တလေး", "Mandalay",
    "အောင်မြေသာစံ", "Aungmyaythazan Township",
    "ချမ်းအေးသာစံ", "Chanayethazan Township",
    "မဟာအောင်မြေ", "Mahaaungmyay Township",
    "ချမ်းမြသာစည်", "Chanmyathazi Township",
    "ပြည်ကြီးတံခွန်", "Pyigyitagon Township",
    "အမရပူရ", "Amarapura Township",
    "ပုသိမ်ကြီး", "Patheingyi Township",
  ]) assert.equal(providerFor(township), "DK DELIVERY", township);

  for (const township of [
    "နေပြည်တော်", "Nay Pyi Taw", "Naypyidaw",
    "ဇမ္ဗူသီရိ", "Za Bu Thi Ri Township",
    "ပျဉ်းမနား", "Pyinmana Township",
    "ဇေယျာသီရိ", "Zay Yar Thi Ri Township",
    "ဒက္ခိဏသီရိ", "Det Khi Na Thi Ri Township",
    "ပုဗ္ဗသီရိ", "Poke Ba Thi Ri Township",
    "ဥတ္တရသီရိ", "Oke Ta Ra Thi Ri Township",
  ]) assert.equal(providerFor(township), "NPT BRANCH", township);

  assert.equal(providerFor("တပ်ကုန်း"), "ROYAL EXPRESS");
  assert.equal(providerFor("Lewe Township"), "ROYAL EXPRESS");
  assert.equal(providerFor("Pyinoolwin Township"), "ROYAL EXPRESS");
  assert.equal(providerFor("တောင်ကြီး"), "ROYAL EXPRESS");
  assert.equal(providerFor("Some Unsupported Township"), "");
  assert.equal(providerFor("Some Unsupported Township", "", { fallbackUnknownToRoyal: true }), "ROYAL EXPRESS");

  assert.equal(providerFor("မြောက်ဒဂုံ"), "BRITIUM", "an exact Britium route must beat its Royal duplicate");
  assert.equal(
    providerFor("North Dagon Township", "No. 77, Ward 32, North Dagon Township, Yangon"),
    "BRITIUM",
  );

  assert.equal(dataEntryProviderHint("NPT Branch"), "NPT BRANCH");
  assert.equal(stripServiceProviderDecoration("ဇမ္ဗူသီရိ (NPT Branch)"), "ဇမ္ဗူသီရိ");

  const migration = await readFile(
    new URL("../supabase/migrations/20260903113144_data_entry_service_provider_routing_v17.sql", import.meta.url),
    "utf8",
  );
  const page = await readFile(
    new URL("../src/pages/DataEntryFinancialV2Page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /DATA_ENTRY_PROVIDER_ROUTING_V17_20260903/);
  assert.match(page, /\["ROYAL EXPRESS","DK DELIVERY","NPT BRANCH","GRS"\]/);
  assert.match(page, /fallbackUnknownToRoyal:true/);
  assert.match(page, /resolvedProvider=text\(e\.data\?\.service_provider_code/);
  assert.match(migration, /'တပ်ကုန်း','ROYAL EXPRESS'/);
  assert.match(migration, /'Lewe Township','ROYAL EXPRESS'/);
  assert.match(migration, /'ချမ်းအေးသာစံ','DK DELIVERY'/);
  assert.match(migration, /'ဇမ္ဗူသီရိ','NPT BRANCH'/);
  assert.match(migration, /rename to be_data_entry_financial_v2_calculate_v13_2_legacy/);
  assert.match(migration, /to_regprocedure\('public\.be_data_entry_financial_v2_calculate_v13_2_legacy\(jsonb\)'\) is null/);
  assert.match(migration, /Data Entry calculator is unavailable; cannot install V17 provider routing/);
  assert.match(migration, /SERVICE_PROVIDER_AUTO_CORRECTED/);
  assert.match(migration, /revoke all on function public\.be_data_entry_service_provider_route_v17\(text\)[\s\S]*from public, anon, authenticated/);

  console.log("Data Entry provider-routing contract verified.");
} finally {
  await server.close();
}
