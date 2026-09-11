import fs from 'node:fs';
import path from 'node:path';

const BUILD = 'PORTAL_FINANCIAL_V2_V60_SOURCE_VERIFY_2026_08_02';
const root = path.resolve(process.argv[2] || '.');

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));
const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass: Boolean(pass), detail });

const canonicalHeaders = [
  'id','way_id','customer_id','merchant_id','status','recipient_name','recipient_phone','township','delivery_address','item_price','delivery_charges','cod_amount','weight_kg','created_at','updated_at','environment','customer_tier','monthly_ways','amount_entry_type','merchant_stated_total_amount','additional_customer_charge','cbm_surcharge','other_surcharge','merchant_payable_charges','other_merchant_credits','remarks','entered_by','authorized_by','tariff_zone','tariff_zone_code','base_tariff','included_kg','extra_per_kg','commitment_min_ways','commitment_refund_per_way','chargeable_weight_kg','extra_kg','weight_surcharge','gross_system_delivery_charge','commitment_refund','net_system_delivery_charge','effective_declared_delivery_charge','delivery_difference','settlement_direction','merchant_settlement_adjustment','merchant_final_settlement_amount','validation_status','validation_message','calculation_version','calculated_at'
];

try {
  check('package_json', exists('package.json'));
  const app = read('src/App.tsx');
  const main = read('src/main.tsx');
  const page = read('src/pages/DataEntryFinancialV2Page.tsx');
  const api = read('src/lib/dataEntryFinancialV2Api.ts');
  const badge = read('src/components/system/EnvironmentBadge.tsx');
  const login = read('src/pages/Login.tsx');
  const templateCenter = read('src/pages/GoLiveTemplateCenterPage.tsx');
  const templateSchema = read('src/lib/britiumGoLiveTemplateSchemas.ts');

  check('active_data_entry_route', app.includes("import('@/pages/DataEntryFinancialV2Page')"));
  check('retired_uat_routes_removed', !app.includes('/data-entry-uat') && !app.includes('/warehouse-uat'));
  check('financial_v2_build_marker', page.includes('PORTAL_DATA_ENTRY_FINANCIAL_V2_V60_2026_08_02'));
  check('schema_driven_field_contract', page.includes('schema.fields') && page.includes('field_count !== 50'));
  check('canonical_rpc_schema', api.includes("'be_data_entry_financial_v2_schema'"));
  check('canonical_rpc_snapshot', api.includes("'be_data_entry_financial_v2_snapshot'"));
  check('canonical_rpc_calculate', api.includes("'be_data_entry_financial_v2_calculate'"));
  check('canonical_rpc_save', api.includes("'be_data_entry_financial_v2_save'"));
  check('canonical_rpc_import', api.includes("'be_data_entry_financial_v2_import'"));
  check('canonical_rpc_waybill', api.includes("'be_data_entry_financial_v2_create_waybill'"));
  check('no_legacy_financial_rpc', !page.includes('be_calculate_parcel_sheet_amounts') && !page.includes('be_save_data_entry_parcel_sheet') && !page.includes('be_save_data_entry_parcel'));
  check('no_direct_financial_upsert', !page.includes(".from('be_data_entry_parcel_details')") && !page.includes('.upsert('));
  check('no_local_tariff_authority', !page.includes('Yangon: 4000') && !page.includes('Mandalay: 6000') && !page.includes('Naypyitaw: 6000'));
  check('legacy_data_entry_bootstraps_removed', !main.includes('dataEntryTariffAutocomplete') && !main.includes('dataEntryGoLiveHardWire') && !main.includes('dataEntryRuntimeGuard'));
  check('uat_watermark_bootstrap_removed', !main.includes('enterpriseFinalTouchBootstrap'));
  check('central_environment_resolver', badge.includes('VITE_APP_ENVIRONMENT') && badge.includes("if (production) return null"));
  check('production_login_branding', !login.includes('Britium Go-Live UAT') && login.includes('Britium Production'));
  check('production_template_center', !templateCenter.includes('UAT Ready') && templateCenter.includes('Production Contract'));
  check('production_template_urls', !templateSchema.includes('_UAT_') && templateSchema.includes('Britium_Data_Entry_Production_Template.xlsx'));

  const csvPath = path.join(root, 'public/templates/Britium_Data_Entry_Production_Template.csv');
  const csvHeaders = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0].split(',').map((item) => item.trim());
  check('canonical_csv_field_count', csvHeaders.length === 50, `count=${csvHeaders.length}`);
  check('canonical_csv_exact_order', JSON.stringify(csvHeaders) === JSON.stringify(canonicalHeaders));
  check('canonical_xlsx_present', exists('public/templates/parcel.xlsx') && exists('public/templates/Britium_Data_Entry_Production_Template.xlsx'));
  check('merchant_template_present', exists('public/templates/Britium_Merchant_Customer_Production_Template.xlsx'));
  check('warehouse_template_present', exists('public/templates/Britium_Warehouse_Scan_Production_Template.xlsx'));

  const retired = [
    'public/uat.html',
    'public/uat-build-check.txt',
    'public/templates/uat_accounts.csv',
    'public/templates/Britium_Data_Entry_UAT_GoLive_Template.csv',
    'public/templates/Britium_Data_Entry_UAT_GoLive_Template.xlsx',
    'public/templates/Britium_Merchant_Customer_Upload_UAT_Template.csv',
    'public/templates/Britium_Merchant_Customer_Upload_UAT_Template.xlsx',
    'public/templates/Britium_Warehouse_Scan_UAT_GoLive_Template.csv',
    'public/templates/Britium_Warehouse_Scan_UAT_GoLive_Template.xlsx',
  ];
  check('retired_public_uat_assets_removed', retired.every((rel) => !exists(rel)), retired.filter(exists).join(','));

  const failed = checks.filter((item) => !item.pass);
  console.log(JSON.stringify({
    ok: failed.length === 0,
    build: BUILD,
    root,
    checks_passed: checks.length - failed.length,
    checks_total: checks.length,
    failed,
    financial_writes_enabled_by_patch: false,
    build_performed: false,
    deploy_performed: false,
  }, null, 2));
  process.exit(failed.length ? 1 : 0);
} catch (error) {
  console.error(JSON.stringify({ ok: false, build: BUILD, root, error: error?.message || String(error), deploy_performed: false }, null, 2));
  process.exit(1);
}
