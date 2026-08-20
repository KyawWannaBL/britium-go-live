import fs from "node:fs";

const file = "src/pages/FinanceMerchantSettlementPage.tsx";
if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const source = fs.readFileSync(file, "utf8");
const checks = [
  ["snapshot RPC", "be_finance_settlement_snapshot_v3"],
  ["create-batch RPC", "be_finance_create_settlement_batch_v3"],
  ["payment RPC", "be_finance_record_payment_v3"],
  ["dispute RPC", "be_finance_raise_dispute_v3"],
  ["finance tabs", '"EXCEPTIONS", "DISPUTES", "AUDIT"'],
  ["merchant tabs", '"SUMMARY", "STATEMENTS", "PAYMENTS", "PARCELS", "DISPUTES"'],
  ["negative MMK format", "amount < 0 ? `(${body})`"],
];
let failed = false;
for (const [label, marker] of checks) {
  const ok = source.includes(marker);
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
console.log("Financial Settlement V3 frontend verification passed.");
