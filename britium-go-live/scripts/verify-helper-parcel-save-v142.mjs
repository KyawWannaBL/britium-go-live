import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const riderPath = path.join(root, "src/pages/RiderFieldPortalApp.tsx");
const rider = fs.readFileSync(riderPath, "utf8");

const start = rider.indexOf("async function verifyParcelRow(");
const end = rider.indexOf("async function uploadAllParcelPhotos()", start);
assert.ok(start >= 0 && end > start, "verifyParcelRow must exist");
const fn = rider.slice(start, end);

assert.match(
  fn,
  /const operationId\s*=\s*row\.photoOperationId\s*\|\|\s*null;/,
  "Parcel save must capture photoOperationId in function scope before storage/RPC work"
);
assert.ok(
  fn.indexOf("const operationId = row.photoOperationId || null;") <
    fn.indexOf('supabase.rpc("be_rider_save_parcel_proof"'),
  "operationId must be declared before the parcel-save RPC"
);
assert.doesNotMatch(
  fn,
  /if \(row\.photoFile\) \{\s*const operationId = row\.photoOperationId;/,
  "operationId must not be block-scoped only inside the photo-upload branch"
);
assert.equal(
  (fn.match(/idempotency_key: operationId/g) || []).length,
  2,
  "Both parcel-save and review-queue RPCs must reuse the same scoped operationId"
);
assert.match(
  fn,
  /if \(row\.photoFile\) \{[\s\S]*?if \(!operationId\) throw new Error/,
  "Fresh file uploads must still require an approved photo operation"
);

console.log("Helper parcel save V142 contract PASS");
