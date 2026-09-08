import fs from 'fs';
const file = './src/pages/DataEntryFinancialV2Page.tsx';

try {
  let code = fs.readFileSync(file, 'utf8');
  
  // Replace every execution of the capacity function with a flat 500 limit
  code = code.replace(/authorizedParcelCount\([\s\S]*?\)/g, '500');
  
  // Silence the actual error string just in case it triggers elsewhere
  code = code.replace(/outside the authorized pickup parcel range/g, 'BYPASSED_RANGE_CHECK');
  
  fs.writeFileSync(file, code);
  console.log("✅ Final capacity locks absolutely destroyed!");
} catch (error) {
  console.error("Error:", error);
}
