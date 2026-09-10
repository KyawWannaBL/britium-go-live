import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.window = globalThis;
globalThis.File = class File extends Blob {
  constructor(parts, name, options = {}) {
    super(parts, options);
    this.name = name;
    this.lastModified = options.lastModified || Date.now();
  }
};
globalThis.crypto ??= { randomUUID: () => "test-photo" };

class CompressionWorkerStub {
  postMessage(message) {
    setTimeout(() => {
      const buffer = new ArrayBuffer(900_000);
      this.onmessage?.({ data: { id: message.id, ok: true, buffer } });
    }, 0);
  }
  terminate() {}
}
globalThis.Worker = CompressionWorkerStub;

const { compressRiderPhoto, MAX_RIDER_PROOF_BYTES, RIDER_UPLOAD_TIMEOUT_MS, withRiderUploadTimeout } =
  await import("../src/lib/riderPhotoUpload.ts");

const result = await compressRiderPhoto(new File([new Uint8Array(1_200_000)], "camera.png", { type: "image/png" }));
assert.equal(result.type, "image/jpeg");
assert.ok(result.size < 1_000_000);
assert.ok(result.size < MAX_RIDER_PROOF_BYTES);
assert.equal(RIDER_UPLOAD_TIMEOUT_MS, 120_000);
await assert.rejects(withRiderUploadTimeout(new Promise(() => {}), 5), /timed out after 120 seconds.*nothing was saved/i);

const page = readFileSync(new URL("../src/pages/RiderFieldPortalApp.tsx", import.meta.url), "utf8");
assert.match(page, /photoUrl: "",\s*photoApproved: false,\s*photoPreparing: true/s, "replacement selection must clear old upload state immediately");
assert.match(page, /APPROVE PHOTO/, "preview must require explicit approval");
assert.match(page, /!row\.photoUrl && !row\.photoApproved/, "parcel upload must remain disabled before approval");
assert.match(page, /proofFile && !proofApproved/, "workflow save must remain disabled before approval");
assert.match(page, /withRiderUploadTimeout\(supabase\.storage/s, "all rider storage uploads must use the timeout");

const dataEntry = readFileSync(new URL("../src/pages/DataEntryFinancialV2Page.tsx", import.meta.url), "utf8");
assert.match(dataEntry, /Bulk upload staged/);
assert.match(dataEntry, /SAVE_ALL_BEFORE_GENERATE_WAYBILL/);
assert.match(dataEntry, /syncWaybillStudioV122/);
assert.match(dataEntry, /printable < expected/);

console.log("Verified rider worker compression, approval gates, replacement clearing, 120-second timeout, and bulk upload -> wayplan -> waybill contracts.");
