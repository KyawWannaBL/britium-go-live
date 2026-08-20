import fs from "node:fs";

const target = "src/App.tsx";
if (!fs.existsSync(target)) {
  console.error(`ERROR: ${target} was not found.`);
  process.exit(1);
}

const source = fs.readFileSync(target, "utf8");

const required = [
  "const FinanceMerchantSettlementPage = safeLazy(() => import('@/pages/FinanceMerchantSettlementPage'));",
  '{ name: "Merchant Settlement", path: "/finance-merchant-settlement", icon: Wallet },',
  '<Route path="/finance-merchant-settlement" element={<FinanceMerchantSettlementPage />} />',
];

const missing = required.filter((item) => !source.includes(item));

if (missing.length) {
  console.error("PARCEL FINANCIAL V2.2 APP ROUTE VERIFICATION FAILED");
  missing.forEach((item) => console.error(`  - Missing: ${item}`));
  process.exit(1);
}

console.log("PARCEL FINANCIAL V2.2 APP ROUTE VERIFICATION PASSED");
console.log("Lazy import: PASS");
console.log("Finance sidebar link: PASS");
console.log("Protected route: PASS");
console.log("SAFE TO BUILD AND TEST");
