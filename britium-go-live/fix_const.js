import fs from 'fs';
const file = './src/pages/DataEntryFinancialV2Page.tsx';

try {
  let code = fs.readFileSync(file, 'utf8');
  
  // Change 'const count' to 'let count' so we can legally inject our 9999 override
  code = code.replace(/const\s+count\s*=\s*authorizedParcelCount/g, 'let count = authorizedParcelCount');
  
  fs.writeFileSync(file, code);
  console.log("✅ Syntax fixed! Changed const to let.");
} catch (error) {
  console.error("Error:", error);
}
