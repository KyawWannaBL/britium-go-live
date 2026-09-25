import { existsSync, readFileSync } from "node:fs";

const exportFile = "src/lib/accountingExports.ts";
const reportsFile = "src/components/accounting/FinancialReports.tsx";

if (!existsSync(exportFile)) {
  throw new Error("Missing accounting export module: " + exportFile);
}
if (!existsSync(reportsFile)) {
  throw new Error("Missing FinancialReports component");
}

const exportsSource = readFileSync(exportFile, "utf8");
const reportsSource = readFileSync(reportsFile, "utf8");

for (const symbol of [
  "buildFinancialWorkbook",
  "downloadFinancialWorkbook",
  "printFinancialStatement",
]) {
  if (!exportsSource.includes(`export function ${symbol}`) &&
      !exportsSource.includes(`export async function ${symbol}`)) {
    throw new Error(`Missing accounting export symbol: ${symbol}`);
  }
}

for (const required of [
  "Executive Summary",
  "Profit & Loss",
  "Balance Sheet",
  "Trial Balance",
]) {
  if (!exportsSource.includes(required)) {
    throw new Error(`Accounting workbook is missing required section: ${required}`);
  }
}

if (!exportsSource.includes("PROVISIONAL") || !exportsSource.includes("CLOSED")) {
  throw new Error("Accounting exports must distinguish PROVISIONAL from CLOSED statements");
}

if (!reportsSource.includes("Export Excel") || !reportsSource.includes("Print / Save PDF")) {
  throw new Error("Financial Reports UI is missing Excel/PDF export controls");
}

console.log("Accounting exports contract PASS");
