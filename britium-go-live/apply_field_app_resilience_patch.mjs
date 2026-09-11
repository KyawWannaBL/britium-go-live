#!/usr/bin/env node
// Britium Express - field app resilience installer
// Run from the project root (the directory containing src/ and package.json):
//   node apply_field_app_resilience_patch.mjs
//
// The script:
//   1) backs up RiderFieldPortalApp.tsx and AssignmentNotificationSound.tsx
//   2) installs the resilient sound component shipped beside this script
//   3) ensures the sound component is mounted in the authenticated app header
//   4) makes DRV/HLP/RID code prefixes win over stale cached role metadata

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = process.cwd();
const riderFile = path.resolve(projectRoot, process.argv[2] || "src/pages/RiderFieldPortalApp.tsx");
const componentTarget = path.resolve(projectRoot, "src/components/AssignmentNotificationSound.tsx");
const componentSource = path.join(scriptDir, "AssignmentNotificationSound.tsx");

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function backup(file) {
  if (!fs.existsSync(file)) return null;
  const out = `${file}.before-field-app-hardfix-${stamp()}`;
  fs.copyFileSync(file, out);
  return out;
}

if (!fs.existsSync(riderFile)) {
  console.error(`ERROR: Rider app file not found: ${riderFile}`);
  process.exit(1);
}
if (!fs.existsSync(componentSource)) {
  console.error(`ERROR: Companion component missing: ${componentSource}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(componentTarget), { recursive: true });
const riderBackup = backup(riderFile);
const componentBackup = backup(componentTarget);
fs.copyFileSync(componentSource, componentTarget);

let source = fs.readFileSync(riderFile, "utf8");
let changes = [];

const importLine = 'import AssignmentNotificationSound from "../components/AssignmentNotificationSound";';
if (!source.includes("AssignmentNotificationSound")) {
  const candidates = [
    'import { supabase } from "../integrations/supabase/client";',
    "import { supabase } from '../integrations/supabase/client';",
  ];
  const anchor = candidates.find((candidate) => source.includes(candidate));
  if (!anchor) {
    console.error("ERROR: Could not find Supabase import anchor in RiderFieldPortalApp.tsx.");
    process.exit(1);
  }
  source = source.replace(anchor, `${anchor}\n${importLine}`);
  changes.push("sound import added");
}

if (!source.includes("<AssignmentNotificationSound")) {
  const syncRegex = /<button\s+onClick=\{\(\)\s*=>\s*void\s+load\(session\)\}[\s\S]{0,320}?<RefreshCw[\s\S]{0,180}?Sync<\/button>/;
  const match = source.match(syncRegex);
  if (!match) {
    console.error("ERROR: Could not find the authenticated header Sync button anchor.");
    process.exit(1);
  }

  const component = `          <AssignmentNotificationSound\n            workerCode={session.worker_code || session.normalizedLogin}\n            email={session.email}\n            role={session.role}\n            onNewNotification={() => void load(session, true)}\n          />\n          `;
  source = source.replace(match[0], `${component}${match[0]}`);
  changes.push("sound component mounted");
}

if (source.includes('role={session.role || "rider"}')) {
  source = source.replaceAll('role={session.role || "rider"}', "role={session.role}");
  changes.push("removed stale rider role fallback");
}
if (source.includes("role={session.role || 'rider'}")) {
  source = source.replaceAll("role={session.role || 'rider'}", "role={session.role}");
  changes.push("removed stale rider role fallback");
}

const roleBlock = /const role = inferWorkforceRole\(session\.role \|\| identity\?\.role \|\| job\.mobile_role \|\| session\.normalizedLogin\);\s*const workerCode = session\.worker_code \|\| session\.normalizedLogin \|\| session\.login;/g;
if (roleBlock.test(source)) {
  roleBlock.lastIndex = 0;
  source = source.replace(
    roleBlock,
    [
      "const workerCode = session.worker_code || session.normalizedLogin || session.login;",
      "    const workerCodeUpper = text(workerCode).toUpperCase();",
      "    const role = workerCodeUpper.startsWith(\"DRV\")",
      "      ? \"driver\"",
      "      : workerCodeUpper.startsWith(\"HLP\")",
      "        ? \"helper\"",
      "        : workerCodeUpper.startsWith(\"RID\")",
      "          ? \"rider\"",
      "          : inferWorkforceRole(session.role || identity?.role || job.mobile_role || session.normalizedLogin);",
    ].join("\n"),
  );
  changes.push("worker-code role precedence installed");
}

fs.writeFileSync(riderFile, source, "utf8");

console.log("OK: Britium field app resilience patch installed.");
console.log(`Rider file: ${riderFile}`);
console.log(`Sound component: ${componentTarget}`);
if (riderBackup) console.log(`Rider backup: ${riderBackup}`);
if (componentBackup) console.log(`Sound backup: ${componentBackup}`);
console.log(`Changes: ${changes.length ? changes.join(", ") : "existing wiring already compatible"}`);
console.log("NEXT: npm run build");
