import fs from "node:fs";
import path from "node:path";

function parseCsv(source) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  const text = source.replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

const appRoot = path.resolve(import.meta.dirname, "..");
const uploadRoot = path.resolve(appRoot, "../../upload");
const english = parseCsv(fs.readFileSync(path.join(uploadRoot, "MMPOSTALCODE_EN.csv"), "utf8"));
const myanmar = parseCsv(fs.readFileSync(path.join(uploadRoot, "MMPOSTALCODE_MM.csv"), "utf8"));

if (english.length !== myanmar.length || english.length < 2) throw new Error("Postal files have different row counts.");
const regions = [];
const regionIndexes = new Map();
const townships = [];
const townshipIndexes = new Map();
const output = [];
for (let index = 1; index < english.length; index += 1) {
  const [regionEn, townshipEn, quarterEn, postalCode] = english[index];
  const [regionMm, townshipMm, quarterMm, postalCodeMm] = myanmar[index];
  if (!postalCode || postalCode !== postalCodeMm) throw new Error(`Postal row mismatch at line ${index + 1}.`);
  const regionKey = `${regionEn}\u0000${regionMm}`;
  if (!regionIndexes.has(regionKey)) {
    regionIndexes.set(regionKey, regions.length);
    regions.push([regionEn, regionMm]);
  }
  const townshipKey = `${townshipEn}\u0000${townshipMm}\u0000${regionKey}`;
  if (!townshipIndexes.has(townshipKey)) {
    townshipIndexes.set(townshipKey, townships.length);
    townships.push([townshipEn, townshipMm, regionIndexes.get(regionKey)]);
  }
  output.push([townshipIndexes.get(townshipKey), quarterEn, postalCode, quarterMm]);
}

const banner = "// Generated from MMPOSTALCODE_EN.csv and MMPOSTALCODE_MM.csv. Postal codes remain strings.\n";
const types = "export type PostalCodeRegion = readonly [regionEn:string,regionMm:string];\nexport type PostalCodeTownship = readonly [townshipEn:string,townshipMm:string,regionIndex:number];\nexport type PostalCodeRow = readonly [townshipIndex:number,quarterEn:string,postalCode:string,quarterMm:string];\n";
fs.writeFileSync(path.join(appRoot, "src/lib/postalCodeData.ts"), `${banner}${types}export const POSTAL_CODE_REGIONS: readonly PostalCodeRegion[] = ${JSON.stringify(regions)} as const;\nexport const POSTAL_CODE_TOWNSHIPS: readonly PostalCodeTownship[] = ${JSON.stringify(townships)} as const;\nexport const POSTAL_CODE_ROWS: readonly PostalCodeRow[] = ${JSON.stringify(output)} as const;\n`);
console.log(`Generated ${output.length} bilingual postal-code rows.`);
