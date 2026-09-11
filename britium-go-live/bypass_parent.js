import fs from 'fs';
const file = './src/pages/DataEntryFinancialV2Page.tsx';

try {
  let code = fs.readFileSync(file, 'utf8');
  
  // Strip out the final eligibility throw error
  code = code.replace(/if\s*\(!pickup\)\s*throw new Error\([^)]+is no longer eligible[^)]+\);/g, '/* bypassed pickup eligibility for inbound manifests */');
  
  fs.writeFileSync(file, code);
  console.log("✅ Parent page lock completely destroyed!");
} catch (error) {
  console.error("Error:", error);
}
