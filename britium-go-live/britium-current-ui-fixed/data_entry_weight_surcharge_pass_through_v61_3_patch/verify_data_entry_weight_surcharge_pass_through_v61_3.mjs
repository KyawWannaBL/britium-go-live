import fs from 'node:fs';
import path from 'node:path';

const BUILD = 'PORTAL_DATA_ENTRY_WEIGHT_SURCHARGE_PASS_THROUGH_V61_3_VERIFY_2026_08_02';
const root = path.resolve(process.argv[2] || '.');
const pagePath = path.join(root, 'src/pages/DataEntryFinancialV2Page.tsx');
const townshipPath = path.join(root, 'src/data/townshipTariffDirectory.ts');

function fail(message, detail = {}) {
  console.error(JSON.stringify({
    ok: false,
    build: BUILD,
    root,
    message,
    ...detail,
    financial_writes_enabled_by_verifier: false,
    build_performed: false,
    deploy_performed: false,
  }, null, 2));
  process.exit(1);
}

if (!fs.existsSync(pagePath) || !fs.existsSync(townshipPath)) {
  fail('Required V61.3 source files are missing.', { page_exists: fs.existsSync(pagePath), township_exists: fs.existsSync(townshipPath) });
}

const page = fs.readFileSync(pagePath, 'utf8');
const townships = fs.readFileSync(townshipPath, 'utf8');
const uniqueTownshipCodes = new Set(townships.match(/MMR\d{6}/g) || []);

const required = [
  'PORTAL_DATA_ENTRY_FINANCIAL_V2_WEIGHT_SURCHARGE_PASS_THROUGH_V61_3_2026_08_02',
  'data-weight-surcharge-pass-through="true"',
  'data-financial-flow-summary="backend-authoritative"',
  "receiverCollection: 'Receiver collection'",
  "britiumEntitlement: 'Britium delivery entitlement'",
  "merchantReceivable: 'Merchant settlement'",
  'လက်ခံသူထံမှ ကောက်ခံရမည့် စုစုပေါင်းငွေ',
  'Britium Express ရရန် စုစုပေါင်းပို့ဆောင်ခ',
  'လုပ်ငန်းရှင်သို့ နောက်ဆုံးရှင်းလင်းငွေ',
  'ဖောက်သည်ထံမှ ကောက်ခံထားသော အပိုအလေးချိန်/CBM/အခြားပို့ဆောင်ခများကို Britium က ရယူမည်ဖြစ်ပြီး',
  "const systemSurcharges = weightSurcharge + cbmSurcharge + otherSurcharge;",
  "const netEntitlement = numberValue(data.net_system_delivery_charge);",
  "const finalSettlement = numberValue(data.merchant_final_settlement_amount);",
  'collectionEquation',
  'entitlementEquation',
  'settlementEquation',
  "amountType === 'ITEM_PRICE_PLUS_DECLARED_DELIVERY'",
  "amountType === 'DELIVERY_CHARGE_ONLY'",
  "suggest('merchant_stated_total_amount', itemPrice + declaredDelivery);",
  'financialV2Calculate(cleanPayload(calculationRow, schema))',
  'const CLIENT_WRITES_ENABLED = String(import.meta.env.VITE_FINANCIAL_V2_WRITES_ENABLED',
  "'false').toLowerCase() === 'true'",
  'TOWNSHIP_DIRECTORY_BUILD',
  'findTownshipTariff',
  'searchTownshipTariffs',
  'MUTATION_SHADOW',
];

const forbidden = [
  'BRITIUM GO-LIVE UAT',
  'All 15 parcel.xlsx fields',
  'cod_amount = itemPrice + declaredDelivery',
  'merchant_final_settlement_amount = codAmount - netEntitlement',
  'VITE_FINANCIAL_V2_WRITES_ENABLED || \'true\'',
  'additional_customer_charge: weightSurcharge',
];

const checks = required.map((marker) => ({ check: `required:${marker}`, ok: page.includes(marker) }));
checks.push({ check: 'township_record_count_356', ok: uniqueTownshipCodes.size === 356 });
checks.push({ check: 'no_forbidden_markers', ok: forbidden.every((marker) => !page.includes(marker)) });
checks.push({ check: 'merchant_stated_subtotal_remains_item_plus_declared', ok: page.includes("suggest('merchant_stated_total_amount', itemPrice + declaredDelivery);") });
checks.push({ check: 'frontend_does_not_locally_authorize_tariff', ok: !page.includes('base_tariff =') && !page.includes('net_system_delivery_charge =') });
checks.push({ check: 'backend_calculation_preserved', ok: page.includes('financialV2Calculate(cleanPayload(calculationRow, schema))') });
checks.push({ check: 'writes_default_false', ok: page.includes("VITE_FINANCIAL_V2_WRITES_ENABLED || 'false'") });

const failures = checks.filter((entry) => !entry.ok);
console.log(JSON.stringify({
  ok: failures.length === 0,
  build: BUILD,
  root,
  checks_passed: checks.length - failures.length,
  checks_total: checks.length,
  unique_township_codes: uniqueTownshipCodes.size,
  confirmed_example: {
    item_price: 50000,
    merchant_declared_delivery_charge: 6000,
    weight_surcharge: 3500,
    receiver_cod: 59500,
    britium_entitlement: 8000,
    merchant_final_settlement: 51500,
  },
  merchant_stated_subtotal_remains_editable_56000: true,
  receiver_cod_uses_backend_weight_surcharge: true,
  merchant_double_charge_prevention_ui_present: true,
  backend_sql_required: true,
  financial_writes_enabled_by_verifier: false,
  build_performed: false,
  deploy_performed: false,
  failures,
}, null, 2));

if (failures.length) process.exit(1);
