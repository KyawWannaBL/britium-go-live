import fs from 'fs';
const file = './src/pages/DataEntryFinancialV2Page.tsx';

try {
  let code = fs.readFileSync(file, 'utf8');

  // Remove the hardcoded dummy ID and dynamically extract the real Pickup ID from the Way ID
  code = code.replace(
    /"Matched pickup":\s*row\["Matched pickup"\]\s*\|\|\s*"__BULK_UPLOAD__"/g,
    '"Matched pickup": row["Matched pickup"] || (String(row["Way ID"] || row["Tracking Number"] || "").includes("-") ? String(row["Way ID"] || row["Tracking Number"] || "").split("-").slice(0, -1).join("-") : "") || ""'
  );

  fs.writeFileSync(file, code);
  console.log("✅ Widget routing fixed! Real merchants will now queue properly.");
} catch (error) {
  console.error("Error:", error);
}
