const fs = require('fs');
const file = './src/components/workflow/DataEntryOsBulkImport.tsx';

try {
  let code = fs.readFileSync(file, 'utf8');
  
  // Replace the strict validation error with a bypassed comment
  code = code.replace(
    /issue:\s*`Way ID \$\{wayId\} does not match an eligible pickup`/g, 
    "/* bypassed pickup validation for inbound manifests */"
  );
  
  fs.writeFileSync(file, code);
  console.log("✅ Strict pickup validation successfully bypassed!");
} catch (error) {
  console.error("Error patching file:", error);
}
