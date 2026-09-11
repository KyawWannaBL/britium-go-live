import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const results = [];
const failures = [];
const warnings = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}
function check(name, condition, detail = '') {
  const row = { name, status: condition ? 'PASS' : 'FAIL', detail };
  results.push(row);
  if (!condition) failures.push(row);
}
function warn(name, detail) {
  const row = { name, status: 'WARNING', detail };
  results.push(row);
  warnings.push(row);
}
function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}
function csvRows(rel) {
  const lines = read(rel).trim().split(/\r?\n/);
  return { header: lines[0]?.split(',') ?? [], rows: lines.slice(1) };
}

const requiredFiles = [
  'src/lib/integratedMasterSpec.ts',
  'src/pages/DataEntryFinancialV2Page.tsx',
  'src/pages/NetworkFulfillmentPage.tsx',
  'src/pages/branch/BranchOfficeSettlementPage.tsx',
  'src/pages/FinanceMerchantSettlementPage.tsx',
  'src/pages/WorkforceCommissionPage.tsx',
  'migrations/20260731190000_integrated_master_v4_1.sql',
  'config/highway_station_dropoff_rates_v41.csv',
  'config/dk_delivery_rate_bands.csv',
  'config/royal_express_rate_card_q019_2026.csv',
  'docs/integrated-master-v4.1/Britium_Integrated_Master_Specification_V4_1.md',
];
for (const rel of requiredFiles) check(`Required file: ${rel}`, exists(rel));

const app = read('src/App.tsx');
check('Financial V2 is the active /data-entry route', app.includes("import('@/pages/DataEntryFinancialV2Page')") && app.includes('path="/data-entry"'));
check('Legacy data entry is isolated', app.includes('path="/data-entry-legacy"'));
check('Network fulfillment route exists', app.includes('path="/network-fulfillment"'));
check('Partner settlement route exists', app.includes('path="/partner-settlement"'));
check('Naypyitaw branch settlement route exists', app.includes('path="/branch-settlement"'));
check('Production App has no UAT route', !/path="\/[^"]*uat/i.test(app));

const sidebar = read('src/components/Sidebar.tsx');
check('Sidebar exposes Network Fulfillment', sidebar.includes('/network-fulfillment'));
check('Sidebar exposes Partner Settlement', sidebar.includes('/partner-settlement'));
check('Sidebar exposes NPT Branch Settlement', sidebar.includes('/branch-settlement'));
check('Sidebar has no Mobile Sandbox label', !sidebar.includes('Mobile Sandbox'));

const login = read('src/pages/Login.tsx');
const bootstrap = read('src/enterpriseFinalTouchBootstrap.ts');
check('Login displays production status', login.includes('BRITIUM PRODUCTION') && !/Go-Live UAT/i.test(login));
check('Global watermark displays production status', bootstrap.includes('BRITIUM PRODUCTION') && !/Go-Live UAT/i.test(bootstrap));

const master = read('src/lib/integratedMasterSpec.ts');
check('All five highway stations are defined', includesAll(master, [
  'HW_DOWNTOWN', 'HW_BAYINTNAUNG', 'HW_DAGON_THIRI', 'HW_AUNG_MINGALAR', 'HW_PARAMI',
]));
check('Highway rates include 4,000 and 3,000 MMK bands', (master.match(/baseRateMmk: 4000/g) ?? []).length === 3 && (master.match(/baseRateMmk: 3000/g) ?? []).length === 2);
check('Tier allowances are 3/5/5 kg', includesAll(master, ['STANDARD: 3', 'ROYAL: 5', 'COMMITMENT: 5']));
check('Default extra kg rate is 500 MMK', master.includes('DEFAULT_EXTRA_KG_RATE_MMK = 500'));
check('Routing precedence covers YGN/NPT/MDY/Royal', includesAll(master, ['BRITIUM_DIRECT', 'BRITIUM_NPT_BRANCH', 'DK_DELIVERY', 'ROYAL_EXPRESS']));
check('NPT 55/45 and 10% management formulas exist', master.includes('revenue * 0.55') && master.includes('nptGrossMmk * 0.1'));
check('DK cost stack exists', includesAll(master, ['highwayTransportCostMmk', 'dkBaseChargeMmk', 'fulfillmentMarginMmk']));
check('Royal COD fee and rebate tiers exist', includesAll(master, ['amount <= 300000 ? 195', 'amount * 0.002', 'ways >= 3000', 'ways >= 2000', 'ways >= 1000']));

const dataEntry = read('src/pages/DataEntryFinancialV2Page.tsx');
check('Data Entry supports all five amount-entry types', includesAll(dataEntry, [
  'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
  'TOTAL_AMOUNT_INCLUDING_DELIVERY',
  'DELIVERY_CHARGE_ONLY',
  'EXACT_COLLECTION_AMOUNT',
  'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT',
]));
check('Data Entry supports highway-station drop-off', dataEntry.includes('HIGHWAY_STATION_DROP_OFF'));
check('Data Entry calls backend calculate/save/waybill RPCs', includesAll(dataEntry, [
  'be_data_entry_financial_v2_calculate',
  'be_data_entry_financial_v2_save',
  'be_data_entry_financial_v2_create_waybill',
]));

const network = read('src/pages/NetworkFulfillmentPage.tsx');
check('Network screen uses V55 snapshot RPC', network.includes('be_network_fulfillment_snapshot_v55'));
check('Network screen exposes required operational tabs', includesAll(network, [
  'Routing Queue', 'Branch Handovers', 'Partner Handovers', 'COD Handover', 'Partner Settlements', 'Branch Reconciliation', 'SLA Performance', 'Coverage & Contracts', 'Audit Log',
]));

const branch = read('src/pages/branch/BranchOfficeSettlementPage.tsx');
check('Branch settlement is fixed to NPT Phase 1', branch.includes('NPT') && branch.includes('be_branch_settlement_snapshot_v1'));
check('Branch settlement includes COD, prepaid, penalties and audit', includesAll(branch, ['COD Remittance', 'Prepaid Revenue', 'Penalties', 'Audit Log']));

const merchantSettlement = read('src/pages/FinanceMerchantSettlementPage.tsx');
check('Merchant settlement handles credit and deduction directions', merchantSettlement.includes('CREDIT_TO_MERCHANT') && merchantSettlement.includes('Deduct from Merchants'));

const commission = read('src/pages/WorkforceCommissionPage.tsx');
check('Merchant referral commission is represented in UI', commission.includes('MERCHANT_REFERRAL'));

const sql = read('migrations/20260731190000_integrated_master_v4_1.sql');
const requiredSqlTokens = [
  'be_data_entry_financial_v2_calculate',
  'be_data_entry_financial_v2_save',
  'be_data_entry_financial_v2_create_waybill',
  'be_fulfillment_route_resolve_v55',
  'be_network_fulfillment_snapshot_v55',
  'be_partner_settlement_snapshot_v55',
  'be_branch_settlement_snapshot_v1',
  'be_merchant_referral_commission_rebuild_v41',
  'HIGHWAY_STATION_DROP_OFF',
  'DK_DELIVERY',
  'ROYAL_EXPRESS',
];
check('Integrated SQL contains all required modules/RPCs', includesAll(sql, requiredSqlTokens));
check('Integrated SQL is explicitly version stamped', sql.includes('BRITIUM_INTEGRATED_MASTER_V4_1_2026_07_31'));

const highway = csvRows('config/highway_station_dropoff_rates_v41.csv');
check('Highway station rate card contains exactly five rows', highway.rows.length === 5, `rows=${highway.rows.length}`);
check('Highway rate card has 3x4000 and 2x3000', highway.rows.filter((r) => r.includes(',4000,')).length === 3 && highway.rows.filter((r) => r.includes(',3000,')).length === 2);

const dk = csvRows('config/dk_delivery_rate_bands.csv');
check('DK rate card contains 2,000/2,500/3,000 bands', ['2000', '2500', '3000'].every((rate) => dk.rows.some((r) => r.includes(`,${rate},`))));
check('DK unclear surcharge condition is not silently finalized', dk.rows.some((r) => /PENDING_CONFIRMATION/i.test(r)));

const royal = csvRows('config/royal_express_rate_card_q019_2026.csv');
check('Royal rate card contains 227 routes', royal.rows.length === 227, `rows=${royal.rows.length}`);
check('Royal YGN/MDY/NPW routes are excluded from routing precedence', royal.rows.filter((r) => /^(YGN|MDY|NPW),/.test(r)).every((r) => /,false(?:,|$)/i.test(r)));

const forbiddenActive = [
  ['src/App.tsx', /BRITIUM GO-LIVE UAT|Mobile Sandbox/i],
  ['src/components/Sidebar.tsx', /BRITIUM GO-LIVE UAT|Mobile Sandbox/i],
];
for (const [rel, regex] of forbiddenActive) check(`No UAT/sandbox label in ${rel}`, !regex.test(read(rel)));

warn('Staging database deployment required', 'The migration is packaged but has not been executed against the live Supabase project.');
warn('Live provider contracts require Finance confirmation', 'DK 500/1,000 surcharge split, Royal rebate base, Royal COD fee owner, and final NPT management-fee interpretation remain explicit configurable confirmations.');
warn('Full production build requires a Linux dependency install', 'The uploaded archive contained Windows-native node modules, and the available package mirror did not contain zustand@5.0.14. Targeted strict TypeScript and syntax checks are used for this package.');

const report = {
  build: 'BRITIUM_INTEGRATED_MASTER_V4_1_2026_07_31',
  generated_at: new Date().toISOString(),
  summary: {
    passed: results.filter((r) => r.status === 'PASS').length,
    failed: failures.length,
    warnings: warnings.length,
  },
  results,
};

fs.mkdirSync(path.join(root, 'verification'), { recursive: true });
fs.writeFileSync(path.join(root, 'verification/integrated_master_v4_1_verification.json'), JSON.stringify(report, null, 2));
const md = [
  '# Integrated Master V4.1 Verification',
  '',
  `- Build: \`${report.build}\``,
  `- Generated: ${report.generated_at}`,
  `- Passed: ${report.summary.passed}`,
  `- Failed: ${report.summary.failed}`,
  `- Warnings: ${report.summary.warnings}`,
  '',
  '| Status | Check | Detail |',
  '|---|---|---|',
  ...results.map((r) => `| ${r.status} | ${r.name.replace(/\|/g, '\\|')} | ${(r.detail || '').replace(/\|/g, '\\|')} |`),
  '',
].join('\n');
fs.writeFileSync(path.join(root, 'verification/integrated_master_v4_1_verification.md'), md);

console.log(JSON.stringify(report.summary));
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure.name}${failure.detail ? ` - ${failure.detail}` : ''}`);
  process.exit(1);
}
