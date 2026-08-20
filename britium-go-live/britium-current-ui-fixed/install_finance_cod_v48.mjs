import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = process.cwd();
const marker = "FINANCE_COD_V48_RECONCILIATION_2026-07-30";
const source = join(packageRoot, "src", "pages", "CODSettlementPage.V48.tsx");
const destinations = [
  join(repoRoot, "src", "pages", "CODSettlementPage.tsx"),
  join(repoRoot, "src", "pages", "CODSettlementPage.V48.tsx"),
];

if (!existsSync(join(repoRoot, "package.json")) || !existsSync(join(repoRoot, "src"))) {
  throw new Error("Run this installer from the repository root beside package.json and src.");
}
if (!existsSync(source)) throw new Error(`Package source is missing: ${source}`);
const sourceText = readFileSync(source, "utf8");
if (!sourceText.includes(marker)) throw new Error(`Package source is missing ${marker}`);

const backupRoot = join(repoRoot, ".britium-backups", `finance-cod-v48-${new Date().toISOString().replace(/[:.]/g, "-")}`);
for (const destination of destinations) {
  mkdirSync(dirname(destination), { recursive: true });
  if (existsSync(destination)) {
    const backup = join(backupRoot, relative(repoRoot, destination));
    mkdirSync(dirname(backup), { recursive: true });
    copyFileSync(destination, backup);
  }
  copyFileSync(source, destination);
  const installed = readFileSync(destination, "utf8");
  if (!installed.includes(marker)) throw new Error(`Installed source verification failed: ${relative(repoRoot, destination)}`);
  console.log(`Installed Finance COD V48 into ${relative(repoRoot, destination)}`);
}

console.log(`PASS installer ${marker}`);
console.log("Next: run finance_cod_settlement_v48.sql, clear dist/node_modules/.vite, build, then verify.");
