import fs from "node:fs";

const appPath = "src/App.tsx";
const pagePath = "src/pages/FinanceMerchantSettlementPage.tsx";

const sidebarCandidates = [
  "src/components/Sidebar.tsx",
  "src/components/layout/Sidebar.tsx",
];

const failures = [];

function readRequired(file) {
  if (!fs.existsSync(file)) {
    failures.push(`Missing file: ${file}`);
    return "";
  }

  return fs.readFileSync(file, "utf8");
}

const app = readRequired(appPath);

const sidebarPath = sidebarCandidates.find((file) => fs.existsSync(file));

if (!sidebarPath) {
  failures.push(
    `Missing sidebar component. Checked: ${sidebarCandidates.join(", ")}`
  );
}

const sidebar = sidebarPath
  ? fs.readFileSync(sidebarPath, "utf8")
  : "";

if (!fs.existsSync(pagePath)) {
  failures.push(`Missing page component: ${pagePath}`);
}

const lazyImportPattern =
  /const\s+FinanceMerchantSettlementPage\s*=\s*safeLazy\(\s*\(\)\s*=>\s*import\(\s*["']@\/pages\/FinanceMerchantSettlementPage["']\s*\)\s*\)\s*;?/;

if (!lazyImportPattern.test(app)) {
  failures.push(
    "Missing FinanceMerchantSettlementPage lazy import in src/App.tsx"
  );
}

const routePattern =
  /<Route\s+path=["']\/finance-merchant-settlement["'][^>]*element=\{<FinanceMerchantSettlementPage\s*\/>\}[^>]*\/>/;

if (!routePattern.test(app)) {
  failures.push(
    'Missing route: <Route path="/finance-merchant-settlement" ... />'
  );
}

if (
  sidebarPath &&
  !/["']\/finance-merchant-settlement["']/.test(sidebar)
) {
  failures.push(
    `Missing /finance-merchant-settlement navigation link in ${sidebarPath}`
  );
}

if (failures.length > 0) {
  console.error("PARCEL FINANCIAL V2.2 APP ROUTE VERIFICATION FAILED");

  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }

  process.exit(1);
}

console.log("PARCEL FINANCIAL V2.2 APP ROUTE VERIFICATION PASSED");
console.log(`  App: ${appPath}`);
console.log(`  Sidebar: ${sidebarPath}`);
console.log(`  Page: ${pagePath}`);
console.log("  Route: /finance-merchant-settlement");
