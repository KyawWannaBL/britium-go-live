import fs from 'fs';
const file = './src/pages/DataEntryFinancialV2Page.tsx';

try {
  let code = fs.readFileSync(file, 'utf8');

  const patch = `async function applyOsImport(importPayload:OsImportApplyPayload){
    const validDbPickup = (selectedPickupId && selectedPickupId !== BULK_UPLOAD_PICKUP_ID) ? selectedPickupId : pickups.find(p => p.pickup_id !== BULK_UPLOAD_PICKUP_ID)?.pickup_id || "";
    
    if (importPayload.batches) {
      importPayload.batches.forEach(b => {
        if (!pickups.some(p => p.pickup_id === b.targetPickupId)) b.targetPickupId = validDbPickup;
      });
    }
    if (importPayload.targetPickupId && !pickups.some(p => p.pickup_id === importPayload.targetPickupId)) {
      importPayload.targetPickupId = validDbPickup;
    }
    
    const batches=importPayload.batches.length`;

  code = code.replace(/async function applyOsImport\(importPayload:OsImportApplyPayload\)\s*\{\s*const batches=importPayload\.batches\.length/g, patch);

  fs.writeFileSync(file, code);
  console.log("✅ Dummy queue trap destroyed! Data will now route to your valid active pickup.");
} catch (error) {
  console.error("Error:", error);
}
