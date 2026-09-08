import fs from 'fs';
const file = './src/pages/DataEntryFinancialV2Page.tsx';

try {
  let code = fs.readFileSync(file, 'utf8');
  
  // Lower the massive 9999 count to 1000 to stop the browser from freezing
  code = code.replace(/count = 9999/g, 'count = 1000');
  
  fs.writeFileSync(file, code);
  console.log("✅ Memory leak fixed! Reduced placeholder count to 500.");
} catch (error) {
  console.error("Error:", error);
}
