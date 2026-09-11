const fs = require("fs");
const path = require("path");

const files = [
  "supabase/sql/71-create-delivery-go-live.sql",
  "supabase/sql/99-run-all-clean-enterprise-portal.sql",
];

let patched = 0;

for (const file of files) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) {
    console.log(`Skipping missing file: ${file}`);
    continue;
  }

  let txt = fs.readFileSync(full, "utf8");
  const before = txt;

  txt = txt.replace(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.be_calculate_tariff\s+TO\s+authenticated\s*;/gi,
    "GRANT EXECUTE ON FUNCTION public.be_calculate_tariff(TEXT, NUMERIC, BOOLEAN) TO authenticated;"
  );

  // Defensive cleanup if a previous SQL added the exact grant more than once consecutively.
  txt = txt.replace(
    /(GRANT EXECUTE ON FUNCTION public\.be_calculate_tariff\(TEXT, NUMERIC, BOOLEAN\) TO authenticated;\s*){2,}/gi,
    "GRANT EXECUTE ON FUNCTION public.be_calculate_tariff(TEXT, NUMERIC, BOOLEAN) TO authenticated;\n"
  );

  if (txt !== before) {
    fs.writeFileSync(full, txt, "utf8");
    patched++;
    console.log(`Patched ambiguous tariff GRANT in ${file}`);
  } else {
    console.log(`No ambiguous tariff GRANT found in ${file}`);
  }
}

if (patched === 0) {
  console.log("No files needed patching. The exact tariff GRANT may already be present.");
}

console.log("Britium tariff function ambiguity fix applied.");
