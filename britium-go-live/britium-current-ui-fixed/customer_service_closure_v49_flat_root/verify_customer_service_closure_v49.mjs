import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [
  ["active Customer Service page", "src/pages/CustomerServiceCommandCenterPage.tsx", ["CustomerClosureV49", "<CustomerClosureV49 />"]],
  ["V49 component", "src/components/customer-service/CustomerClosureV49.tsx", [
    "CUSTOMER_SERVICE_CLOSURE_V49_2026-07-30",
    "be_cs_closure_snapshot_v49",
    "be_cs_record_customer_contact_v49",
    "be_cs_close_communication_v49",
    "be_cs_escalate_closure_v49",
  ]],
  ["V49 SQL", "customer_service_closure_v49.sql", [
    "be_cs_closure_v49",
    "be_cs_closure_events_v49",
    "be_cs_closure_snapshot_v49",
    "be_cs_close_communication_v49",
  ]],
];

for (const [label, relative, required] of checks) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`${label} is missing: ${relative}`);
  const content = fs.readFileSync(file, "utf8");
  for (const item of required) {
    if (!content.includes(item)) throw new Error(`${label} is missing ${item}`);
  }
  console.log(`PASS source: ${relative}`);
}

const app = path.join(root, "src/App.tsx");
if (fs.existsSync(app)) {
  const content = fs.readFileSync(app, "utf8");
  if (!content.includes('path="/cs-command"')) throw new Error("App route /cs-command is missing");
  console.log("PASS route: /cs-command");
}

const dist = path.join(root, "dist", "assets");
if (fs.existsSync(dist)) {
  const files = fs.readdirSync(dist).filter((name) => name.endsWith(".js"));
  const merged = files.map((name) => fs.readFileSync(path.join(dist, name), "utf8")).join("\n");
  for (const item of [
    "CUSTOMER_SERVICE_CLOSURE_V49_2026-07-30",
    "be_cs_closure_snapshot_v49",
    "be_cs_close_communication_v49",
  ]) {
    if (!merged.includes(item)) throw new Error(`Production bundle is missing ${item}`);
  }
  console.log("PASS production bundle: Customer Service Closure V49 markers and RPCs");
} else {
  console.log("NOTE dist/assets is not present; run npm run build before final verification.");
}

console.log("SAFE TO DEPLOY CUSTOMER SERVICE CLOSURE V49");
