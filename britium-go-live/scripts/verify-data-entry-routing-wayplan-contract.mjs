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
  const { resolveDataEntryServiceProvider, DATA_ENTRY_HANDOFF_STATIONS } = routing;
  const tariffs = [
    { destination_key: "မြောက်ဒဂုံ", destination_name: "မြောက်ဒဂုံ", provider_code: "BRITIUM" },
    { destination_key: "ချမ်းအေးသာစံ", destination_name: "ချမ်းအေးသာစံ", provider_code: "DK DELIVERY" },
    { destination_key: "ဇမ္ဗူသီရိ", destination_name: "ဇမ္ဗူသီရိ", provider_code: "NPT BRANCH" },
    { destination_key: "တောင်ကြီး", destination_name: "တောင်ကြီး", provider_code: "ROYAL EXPRESS" },
  ];
  const resolve = (township, itemPrice = "") => resolveDataEntryServiceProvider(
    township,
    "",
    tariffs,
    { fallbackUnknownToRoyal: true, itemPrice },
  );

  assert.deepEqual(
    (({ providerCode, routeRegion, deliveryMode, mapRequired }) => ({ providerCode, routeRegion, deliveryMode, mapRequired }))(resolve("မြောက်ဒဂုံ")),
    { providerCode: "BRITIUM", routeRegion: "YANGON", deliveryMode: "DOORSTEP_MAP", mapRequired: true },
  );
  assert.equal(resolve("ချမ်းအေးသာစံ").providerCode, "DK DELIVERY");
  assert.equal(resolve("ချမ်းအေးသာစံ").routeRegion, "MANDALAY");
  assert.equal(resolve("ဇမ္ဗူသီရိ").providerCode, "NPT BRANCH");
  assert.equal(resolve("ဇမ္ဗူသီရိ").routeRegion, "NAYPYITAW");

  for (const township of ["တပ်ကုန်း", "လယ်ဝေး", "တောင်ကြီး", "Unsupported Township"]) {
    const terminal = resolve(township);
    assert.equal(terminal.providerCode, "H.TERMINAL DROP-OFF", township);
    assert.equal(terminal.routeRegion, "OUTSIDE_CORE", township);
    assert.equal(terminal.deliveryMode, "HIGHWAY_BUS_STATION", township);
    assert.equal(terminal.mapRequired, false, township);
    assert.equal(terminal.stationRequired, true, township);

    const royal = resolve(township, 1);
    assert.equal(royal.providerCode, "ROYAL EXPRESS", township);
    assert.equal(royal.deliveryMode, "ROYAL_EXPRESS", township);
    assert.equal(royal.mapRequired, false, township);
    assert.equal(royal.stationRequired, false, township);
  }
  assert.deepEqual(DATA_ENTRY_HANDOFF_STATIONS.map((station) => station.code), ["AUNG_MINGALAR", "DAGON_AYAR_THIRI", "OTHER"]);

  const [page, editor, wayplan, migration] = await Promise.all([
    readFile(new URL("../src/pages/DataEntryFinancialV2Page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/workflow/DataEntryLocationEditor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/WayplanCommandCenterPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260903155405_data_entry_delivery_routing_wayplan_regions_v19.sql", import.meta.url), "utf8"),
  ]);

  assert.match(page, /data-highway-station-selection-v19/);
  assert.match(page, /delivery_region: row\.deliveryRegion/);
  assert.match(page, /location_required: row\.deliveryMode === "DOORSTEP_MAP"/);
  assert.match(page, /route\.mapRequired\?row\.locationStatus==="SYNCED":row\.locationStatus==="NOT_REQUIRED"/);
  assert.match(editor, /DataEntryLocationResolution = [^;]+"NOT_REQUIRED"/);
  assert.match(editor, /if \(!enabled\)[\s\S]*reportResolution\("NOT_REQUIRED"\)/);

  assert.match(wayplan, /be_wayplan_region_options_v19/);
  assert.match(wayplan, /be_dispatch_ready_queue_v19/);
  assert.match(wayplan, /be_wayplan_region_set_active_v19/);
  assert.match(wayplan, /region_code: selectedRegion/);
  assert.match(wayplan, /Yangon is the current operational focus/);

  assert.match(migration, /alter table public\.be_wayplan_region_runtime_v19 enable row level security/);
  assert.match(migration, /revoke all on table public\.be_wayplan_region_runtime_v19 from public, anon, authenticated/);
  assert.match(migration, /\('YANGON','Yangon','YGN',true,true/);
  assert.match(migration, /\('MANDALAY','Mandalay','MDY',false,true/);
  assert.match(migration, /\('NAYPYITAW','Naypyitaw','NPT',false,true/);
  assert.match(migration, /Every selected parcel must be ready and belong to the same active Wayplan region/);
  assert.match(migration, /CORE_LOCATION_NOT_SYNCED/);
  assert.match(migration, /HIGHWAY_HANDOFF_STATION_REQUIRED/);
  assert.match(migration, /DATA_ENTRY_DELIVERY_ROUTE_ASSIGNED/);
  assert.match(migration, /notify pgrst, 'reload schema'/);

  console.log("Data Entry V19 regional routing and Wayplan contract verified.");
} finally {
  await server.close();
}
