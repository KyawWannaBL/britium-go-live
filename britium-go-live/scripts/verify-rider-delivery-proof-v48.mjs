import fs from "node:fs";

const source = fs.readFileSync("src/pages/RiderFieldPortalApp.tsx", "utf8");

const required = [
  "signature",
  "payment_method",
  "transaction_reference",
  "be_rider_wayplan_action",
  "wayplan_id",
  "delivery_way_id",
  "proof_url",
];

const missing = required.filter((item) => !source.includes(item));

if (missing.length) {
  console.error("Rider Delivery Proof V48 contract FAILED");
  for (const item of missing) console.error(` - missing ${item}`);
  process.exit(1);
}

console.log("Rider Delivery Proof V48 contract PASS");
