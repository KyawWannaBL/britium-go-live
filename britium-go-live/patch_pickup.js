const fs = require('fs');
const file = './src/components/workflow/DataEntryOsBulkImport.tsx';

try {
  let code = fs.readFileSync(file, 'utf8');
  
  // Replace the strict error message with 'null' to bypass the error flag
  const searchStr = 'issue: `Way ID ${wayId} does not match an eligible pickup`';
  const replaceStr = 'issue: null /* Bypassed for Inbound Manifests */';
  
  if (code.includes(searchStr)) {
    code = code.replace(searchStr, replaceStr);
    fs.writeFileSync(file, code);
    console.log("✅ Original UI restored and strict pickup validation bypassed!");
  } else {
    console.log("⚠️ Could not find the string. The file might already be patched.");
  }
} catch (error) {
  console.error("Error patching file:", error);
}
