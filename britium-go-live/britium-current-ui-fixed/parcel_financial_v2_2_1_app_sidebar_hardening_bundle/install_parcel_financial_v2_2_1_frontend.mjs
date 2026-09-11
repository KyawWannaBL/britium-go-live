import fs from "node:fs";
import path from "node:path";

const files = [
  ["App.tsx", "src/App.tsx"],
  ["Sidebar.tsx", "src/components/layout/Sidebar.tsx"],
  ["FinanceMerchantSettlementPage.V2_2_1.tsx", "src/pages/FinanceMerchantSettlementPage.tsx"],
  ["ParcelFinancialV2Editor.V2_2_1.tsx", "src/components/data-entry/ParcelFinancialV2Editor.tsx"],
];

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
for (const [source, target] of files) {
  if (!fs.existsSync(source)) throw new Error(`Missing package file: ${source}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) fs.copyFileSync(target, `${target}.before-parcel-financial-v2-2-1-${stamp}`);
  fs.copyFileSync(source, target);
  console.log(`Installed ${target}`);
}
console.log("PARCEL FINANCIAL V2.2.1 FRONTEND FILES INSTALLED");
console.log("Next: rm -rf dist node_modules/.vite && npm run build");
