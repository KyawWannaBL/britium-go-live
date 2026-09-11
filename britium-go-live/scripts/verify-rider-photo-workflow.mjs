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
  static terminated = 0;
  postMessage(message) {
    setTimeout(() => {
      const buffer = new ArrayBuffer(900_000);
      this.onmessage?.({ data: { id: message.id, ok: true, buffer } });
    }, 0);
  }
  terminate() { CompressionWorkerStub.terminated += 1; }
}
globalThis.Worker = CompressionWorkerStub;

const { compressRiderPhoto, confirmRiderStorageUpload, MAX_RIDER_PROOF_BYTES, RIDER_UPLOAD_TIMEOUT_MS, withRiderUploadTimeout } =
  await import("../src/lib/riderPhotoUpload.ts");

const result = await compressRiderPhoto(new File([new Uint8Array(1_200_000)], "camera.png", { type: "image/png" }));
assert.equal(result.type, "image/jpeg");
assert.ok(result.size < 1_000_000);
assert.ok(result.size < MAX_RIDER_PROOF_BYTES);
assert.equal(RIDER_UPLOAD_TIMEOUT_MS, 120_000);
await assert.rejects(withRiderUploadTimeout(new Promise(() => {}), 5), /Upload confirmation timed out.*may have completed.*before retrying/i);

for (const scenario of ["modal close", "job switch", "replacement", "unmount"]) {
  const controller = new AbortController();
  const pendingCompression = compressRiderPhoto(new File([new Uint8Array(1_200_000)], `${scenario}.png`, { type: "image/png" }), controller.signal);
  controller.abort();
  await assert.rejects(pendingCompression, { name: "AbortError" }, scenario);
}
assert.equal(CompressionWorkerStub.terminated, 5, "every completed or cancelled operation must terminate its worker");

const pendingUploads = new Map();
let uploadCalls = 0;
let objectExists = false;
let finishLateUpload;
const lateUpload = new Promise((resolve) => { finishLateUpload = () => { objectExists = true; resolve({ error: null }); }; });
const uploadOptions = {
  path: "proofs/stable-operation.jpg",
  pending: pendingUploads,
  objectExists: async () => objectExists,
  upload: () => { uploadCalls += 1; return lateUpload; },
  timeoutMs: 5,
};
await assert.rejects(confirmRiderStorageUpload(uploadOptions), /Upload confirmation timed out/);
const retry = confirmRiderStorageUpload({ ...uploadOptions, timeoutMs: 100 });
finishLateUpload();
await retry;
assert.equal(uploadCalls, 1, "timeout + late success + retry must reuse one stable-path upload");

let failedCalls = 0;
const failedOptions = {
  path: "proofs/confirmed-failure.jpg",
  pending: new Map(),
  objectExists: async () => false,
  upload: () => { failedCalls += 1; return Promise.resolve({ error: new Error("confirmed failure") }); },
  timeoutMs: 100,
};
await assert.rejects(confirmRiderStorageUpload(failedOptions), /confirmed failure/);
await assert.rejects(confirmRiderStorageUpload(failedOptions), /confirmed failure/);
assert.equal(failedCalls, 2, "a confirmed failure must allow one new attempt without duplicating a successful object");

const page = readFileSync(new URL("../src/pages/RiderFieldPortalApp.tsx", import.meta.url), "utf8");
assert.match(page, /photoUrl: "",\s*photoApproved: false,\s*photoPreparing: true/s, "replacement selection must clear old upload state immediately");
assert.match(page, /APPROVE PHOTO/, "preview must require explicit approval");
assert.match(page, /!row\.photoUrl && !row\.photoApproved/, "parcel upload must remain disabled before approval");
assert.match(page, /proofFile && !proofApproved/, "workflow save must remain disabled before approval");
assert.match(page, /confirmStorageUpload\(storagePath/, "all rider storage uploads must use confirmed stable-path handling");
assert.match(page, /idempotency_key: submittedPhotoOperationId \|\| modalSubmissionId\.current/, "database workflow retries must carry a stable idempotency key");
assert.match(page, /activeOperation\.id !== submittedPhotoOperationId/, "stale upload results must not reach the database RPC");

const dataEntry = readFileSync(new URL("../src/pages/DataEntryFinancialV2Page.tsx", import.meta.url), "utf8");
assert.match(dataEntry, /Bulk upload staged/);
assert.match(dataEntry, /SAVE_ALL_BEFORE_GENERATE_WAYBILL/);
assert.match(dataEntry, /syncWaybillStudioV122/);
assert.match(dataEntry, /printable < expected/);

console.log("Verified rider worker compression, approval gates, replacement clearing, 120-second timeout, and bulk upload -> wayplan -> waybill contracts.");
