import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");

const highContrastBlock = css.match(/GLOBAL HIGH-CONTRAST BUTTON SYSTEM[\s\S]*?\/\* =====================================================/)?.[0] || "";

const checks = [
  ["global buttons do not animate all visual properties", !/transition-all/.test(highContrastBlock)],
  ["disabled buttons do not force a gray background", !/button:disabled[\s\S]{0,220}!bg-gray-800/.test(highContrastBlock)],
  ["disabled buttons do not force gray text", !/button:disabled[\s\S]{0,220}!text-gray-400/.test(highContrastBlock)],
  ["disabled buttons do not force gray borders", !/button:disabled[\s\S]{0,220}!border-gray-600/.test(highContrastBlock)],
  ["disabled buttons still clearly communicate disabled state", /button:disabled[\s\S]{0,220}!opacity-50/.test(highContrastBlock) && /!cursor-not-allowed/.test(highContrastBlock)],
  ["hover movement remains short and transform-only", /transition-transform\s+duration-150/.test(highContrastBlock)],
];

const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);

if (failures.length) {
  console.error("Stable button states V109 contract FAILED:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}

console.log("Stable button states V109 contract PASS");
