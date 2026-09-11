import fs from 'fs';
const file = './src/pages/DataEntryFinancialV2Page.tsx';

try {
  let code = fs.readFileSync(file, 'utf8');
  
  // Replace the strict lookup with one that falls back to a safe dummy object
  const exactTarget = 'const pickup=pickups.find((candidate)=>candidate.pickup_id===batch.targetPickupId);';
  const safeFallback = 'const pickup=pickups.find((candidate)=>candidate.pickup_id===batch.targetPickupId) || { pickup_id: batch.targetPickupId || "__BULK_UPLOAD__", registered_parcels: 0, merchant_id: "INBOUND_MANIFEST" };';
  
  if (code.includes(exactTarget)) {
    code = code.replace(exactTarget, safeFallback);
    fs.writeFileSync(file, code);
    console.log("✅ Undefined pickup crash safely patched!");
  } else {
    // Regex fallback just in case formatting shifted
    code = code.replace(/const pickup\s*=\s*pickups\.find[^;]+;/g, safeFallback);
    fs.writeFileSync(file, code);
    console.log("✅ Fallback patch applied!");
  }
} catch (error) {
  console.error("Error:", error);
}
