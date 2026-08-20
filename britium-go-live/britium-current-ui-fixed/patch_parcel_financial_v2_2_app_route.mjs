import fs from "node:fs";

const target = "src/App.tsx";

if (!fs.existsSync(target)) {
  console.error(`ERROR: ${target} was not found. Run this installer from the Enterprise Portal repository root.`);
  process.exit(1);
}

let source = fs.readFileSync(target, "utf8");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${target}.before-parcel-financial-v2-2-route-${stamp}`;
fs.copyFileSync(target, backup);

function insertAfter(label, anchor, addition) {
  if (source.includes(addition.trim())) {
    console.log(`Already present: ${label}`);
    return;
  }
  const first = source.indexOf(anchor);
  if (first < 0) {
    console.error(`ERROR: Could not find ${label} anchor. No changes were written.`);
    process.exit(1);
  }
  if (source.indexOf(anchor, first + anchor.length) >= 0) {
    console.error(`ERROR: ${label} anchor occurs more than once. Refusing an ambiguous edit.`);
    process.exit(1);
  }
  source = source.replace(anchor, () => anchor + addition);
}

insertAfter(
  "Finance Merchant Settlement lazy import",
  "const FinancePortalPage = safeLazy(() => import('@/pages/FinancePortalPage'));\n",
  "const FinanceMerchantSettlementPage = safeLazy(() => import('@/pages/FinanceMerchantSettlementPage'));\n",
);


insertAfter(
  "Finance Merchant Settlement route",
  '            <Route path="/finance" element={<FinancePortalPage />} />\n',
  '            <Route path="/finance-merchant-settlement" element={<FinanceMerchantSettlementPage />} />\n',
);

fs.writeFileSync(target, source, "utf8");

console.log("Installed Parcel Financial V2.2 App/sidebar route integration.");
console.log(`Target: ${target}`);
console.log(`Backup: ${backup}`);
console.log("Route: /finance-merchant-settlement");
console.log("Sidebar: Finance & Accounts -> Merchant Settlement");
console.log("Next: npm run build");
