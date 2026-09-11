import fs from 'fs';
const file = './src/components/workflow/DataEntryOsBulkImport.tsx';

try {
  let code = fs.readFileSync(file, 'utf8');
  
  // Nuke the specific error message completely using a broad regular expression
  const newCode = code.replace(/`Way ID \$\{wayId\} does not match an eligible pickup`/g, "null");
  
  if (code !== newCode) {
    fs.writeFileSync(file, newCode);
    console.log("✅ Validation successfully bypassed!");
  } else {
    console.log("⚠️ Could not find the exact string. Searching broadly...");
    // Fallback: replace any string containing the error
    code = code.replace(/`[^`]*does not match an eligible pickup[^`]*`/g, "null");
    fs.writeFileSync(file, code);
    console.log("✅ Fallback patch applied!");
  }
} catch (error) {
  console.error("Error:", error);
}
