import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const activePage = path.join(root, "src", "pages", "CustomerServiceCommandCenterPage.tsx");
const versionedPage = path.join(root, "src", "pages", "CustomerServiceCommandCenterPage.V49.tsx");
const componentSource = path.join(root, "src", "components", "customer-service", "CustomerClosureV49.tsx");
const packagedPage = path.join(root, "CustomerServiceCommandCenterPage.V49.tsx");

if (!fs.existsSync(activePage)) {
  throw new Error(`Missing active Customer Service page: ${path.relative(root, activePage)}`);
}
if (!fs.existsSync(componentSource)) {
  throw new Error(`Missing V49 component: ${path.relative(root, componentSource)}`);
}

const original = fs.readFileSync(activePage, "utf8");
const backup = `${activePage}.bak-v49-${new Date().toISOString().replace(/[:.]/g, "-")}`;
fs.copyFileSync(activePage, backup);

let next = original;
const importLine = 'import CustomerClosureV49 from "@/components/customer-service/CustomerClosureV49";';
if (!next.includes(importLine)) {
  const anchor = 'import { useLanguage } from "@/contexts/LanguageContext";';
  if (!next.includes(anchor)) throw new Error("Unable to locate Customer Service import anchor.");
  next = next.replace(anchor, `${anchor}\n${importLine}`);
}

const renderLine = "      <CustomerClosureV49 />";
if (!next.includes(renderLine)) {
  const anchor = '      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[1.15fr_0.85fr]">';
  if (!next.includes(anchor)) throw new Error("Unable to locate Customer Service layout anchor.");
  next = next.replace(anchor, `${renderLine}\n\n${anchor}`);
}

fs.writeFileSync(activePage, next);
fs.writeFileSync(versionedPage, next);
if (fs.existsSync(packagedPage)) fs.copyFileSync(packagedPage, versionedPage);

const active = fs.readFileSync(activePage, "utf8");
const component = fs.readFileSync(componentSource, "utf8");
for (const required of [importLine, renderLine]) {
  if (!active.includes(required)) throw new Error(`Active Customer Service page is missing ${required}`);
}
for (const required of [
  "CUSTOMER_SERVICE_CLOSURE_V49_2026-07-30",
  "be_cs_closure_snapshot_v49",
  "be_cs_record_customer_contact_v49",
  "be_cs_close_communication_v49",
  "be_cs_escalate_closure_v49",
]) {
  if (!component.includes(required)) throw new Error(`V49 component is missing ${required}`);
}

console.log(`Installed V49 component into ${path.relative(root, componentSource)}`);
console.log(`Patched active page ${path.relative(root, activePage)}`);
console.log(`Saved backup ${path.relative(root, backup)}`);
console.log("PASS installer CUSTOMER_SERVICE_CLOSURE_V49_2026-07-30");
console.log("Next: run customer_service_closure_v49.sql, clear dist/node_modules/.vite, build, then verify.");
