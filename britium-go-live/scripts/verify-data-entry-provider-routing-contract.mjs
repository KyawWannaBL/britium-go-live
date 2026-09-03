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

  assert.equal(providerFor("တပ်ကုန်း"), "H.TERMINAL DROP-OFF");
  assert.equal(providerFor("Lewe Township", "", { itemPrice: 125000 }), "ROYAL EXPRESS");
  assert.equal(providerFor("Pyinoolwin Township", "", { itemPrice: 125000 }), "ROYAL EXPRESS");
  assert.equal(providerFor("တောင်ကြီး"), "H.TERMINAL DROP-OFF");
  assert.equal(providerFor("Some Unsupported Township"), "");
  assert.equal(providerFor("Some Unsupported Township", "", { fallbackUnknownToRoyal: true }), "H.TERMINAL DROP-OFF");
  assert.equal(providerFor("Some Unsupported Township", "", { fallbackUnknownToRoyal: true, itemPrice: 1 }), "ROYAL EXPRESS");

  assert.equal(providerFor("မြောက်ဒဂုံ"), "BRITIUM", "an exact Britium route must beat its Royal duplicate");
  assert.equal(
    providerFor("North Dagon Township", "No. 77, Ward 32, North Dagon Township, Yangon"),
    "BRITIUM",
  );

  assert.equal(dataEntryProviderHint("NPT Branch"), "NPT BRANCH");
  assert.equal(dataEntryProviderHint("H.Terminal Drop-off"), "H.TERMINAL DROP-OFF");
  assert.equal(stripServiceProviderDecoration("ဇမ္ဗူသီရိ (NPT Branch)"), "ဇမ္ဗူသီရိ");

  const migration = await readFile(
    new URL("../supabase/migrations/20260903155405_data_entry_delivery_routing_wayplan_regions_v19.sql", import.meta.url),
    "utf8",
  );
  const page = await readFile(
    new URL("../src/pages/DataEntryFinancialV2Page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903/);
  assert.match(page, /\["ROYAL EXPRESS","DK DELIVERY","NPT BRANCH","H\.TERMINAL DROP-OFF","GRS"\]/);
  assert.match(page, /fallbackUnknownToRoyal:true/);
  assert.match(page, /resolvedProvider=text\(e\.data\?\.service_provider_code/);
  assert.match(migration, /OUTSIDE_CORE_ROYAL_WITH_ITEM_PRICE/);
  assert.match(migration, /OUTSIDE_CORE_HIGHWAY_STATION/);
  assert.match(migration, /'H\.TERMINAL DROP-OFF'/);
  assert.match(migration, /v_legacy_reason='MANDALAY_DK_SERVICE_AREA'/);
  assert.match(migration, /v_legacy_reason='NAYPYITAW_BRANCH_SERVICE_AREA'/);
  assert.match(migration, /v_legacy_reason='EXACT_BRITIUM_ROUTE'/);
  assert.match(migration, /SERVICE_PROVIDER_AUTO_CORRECTED/);
  assert.match(migration, /revoke all on function public\.be_data_entry_delivery_route_v19\(text,numeric\)[\s\S]*from public, anon, authenticated/);

  console.log("Data Entry provider-routing contract verified.");
} finally {
  await server.close();
}
