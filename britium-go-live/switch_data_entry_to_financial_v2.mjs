import fs from "node:fs";

const file = "src/App.tsx";

if (!fs.existsSync(file)) {
  console.error("ERROR: src/App.tsx not found");
  process.exitCode = 1;
} else if (!fs.existsSync("src/pages/DataEntryFinancialV2Page.tsx")) {
  console.error("ERROR: src/pages/DataEntryFinancialV2Page.tsx not found");
  process.exitCode = 1;
} else {
  let s = fs.readFileSync(file, "utf8");
  const backup = `${file}.before-financial-v2-route-${Date.now()}`;
  fs.copyFileSync(file, backup);

  if (!s.includes("DataEntryFinancialV2Page")) {
    const importAnchor = /import\s+DataEntryPage\s+from\s+["'][^"']+["'];?/;

    if (importAnchor.test(s)) {
      s = s.replace(
        importAnchor,
        match =>
          `${match}\nimport DataEntryFinancialV2Page from "@/pages/DataEntryFinancialV2Page";`
      );
    } else {
      const firstImport = s.indexOf("\n");
      s =
        s.slice(0, firstImport + 1) +
        'import DataEntryFinancialV2Page from "@/pages/DataEntryFinancialV2Page";\n' +
        s.slice(firstImport + 1);
    }
  }

  const patterns = [
    /<Route\s+path=["']\/data-entry["']\s+element=\{<DataEntryPage\s*\/>\}\s*\/>/,
    /<Route\s+path=["']\/data-entry["']\s+element=\{<DataEntryRegistrationStablePage\s*\/>\}\s*\/>/
  ];

  let changed = false;

  for (const pattern of patterns) {
    if (pattern.test(s)) {
      s = s.replace(
        pattern,
        '<Route path="/data-entry" element={<DataEntryFinancialV2Page />} />'
      );
      changed = true;
      break;
    }
  }

  if (!changed && !s.includes('path="/data-entry" element={<DataEntryFinancialV2Page')) {
    console.error("ERROR: /data-entry route anchor not found. Original restored.");
    fs.copyFileSync(backup, file);
    process.exitCode = 1;
  } else {
    fs.writeFileSync(file, s);
    console.log("OK: /data-entry now targets DataEntryFinancialV2Page");
    console.log("Backup:", backup);
  }
}
