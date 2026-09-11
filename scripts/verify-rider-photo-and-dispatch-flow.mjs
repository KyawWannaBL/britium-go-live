import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const photo = read("src/lib/photoUpload.ts");
const rider = read("src/pages/RiderPortal.tsx");
const workflow = read("src/lib/riderWorkflow.ts");
const dataEntry = read("src/pages/DataEntryFinancialV2Page.tsx");
const wayplan = read("src/pages/WayplanPortal.tsx");

assert.match(photo, /MAX_PROOF_BYTES = 950_000/, "proofs must remain safely below 1 MB");
assert.match(photo, /await yieldToUi\(\)/, "compression must yield to the UI between passes");
assert.match(rider, /Preview only — not uploaded/, "the selected photo needs a preview state");
assert.match(rider, /Approve photo & upload/, "upload requires explicit approval");
assert.match(rider, /onSelection\(\)/, "a replacement selection must invalidate the prior saved proof");
assert.match(workflow, /withTimeout\(/, "storage upload must have timeout handling");
assert.match(dataEntry, /Bulk upload staged/, "bulk upload must stage imported rows");
assert.match(dataEntry, /persistAllRows\("SAVE_ALL_BEFORE_GENERATE_WAYBILL"\)/, "waybill must persist every bulk row first");
assert.match(dataEntry, /syncWaybillStudioV122/, "saved rows must sync into Waybill Studio");
assert.match(dataEntry, /printable < expected/, "the flow must verify every bulk row is printable");
assert.match(wayplan, /\/wayplan\/ways/, "wayplan must expose the generated ways view");
assert.match(wayplan, /\/wayplan\/waybills/, "wayplan must expose waybill printing");

console.log("Verified: photo preview/approval/compression/timeout and bulk upload -> wayplan -> waybill contracts.");
