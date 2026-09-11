#!/usr/bin/env node
// Britium Express - safe one-time patcher for RiderFieldPortalApp.tsx
// Usage from project root:
//   node apply_rider_notification_sound_patch.mjs
// Optional custom path:
//   node apply_rider_notification_sound_patch.mjs src/pages/RiderFieldPortalApp.tsx

import fs from "node:fs";
import path from "node:path";

const target = process.argv[2] || "src/pages/RiderFieldPortalApp.tsx";
const resolved = path.resolve(target);

if (!fs.existsSync(resolved)) {
  console.error(`ERROR: Rider app file not found: ${resolved}`);
  process.exit(1);
}

let source = fs.readFileSync(resolved, "utf8");

const importLine = 'import AssignmentNotificationSound from "../components/AssignmentNotificationSound";';
const componentMarker = "<AssignmentNotificationSound";

if (source.includes(importLine) && source.includes(componentMarker)) {
  console.log("Notification sound patch is already installed. No changes made.");
  process.exit(0);
}

const backup = `${resolved}.before-notification-sound-${new Date().toISOString().replace(/[:.]/g, "-")}`;
fs.copyFileSync(resolved, backup);

if (!source.includes(importLine)) {
  const anchor = 'import { supabase } from "../integrations/supabase/client";';
  if (!source.includes(anchor)) {
    console.error(`ERROR: Could not find Supabase import anchor. Backup created at ${backup}`);
    process.exit(1);
  }
  source = source.replace(anchor, `${anchor}\n${importLine}`);
}

if (!source.includes(componentMarker)) {
  const buttonAnchor = '<button onClick={() => void load(session)} style={buttonStyle("plain")} disabled={loading || busy}><RefreshCw size={16} className={loading ? "be-spin" : ""} /> Sync</button>';
  if (!source.includes(buttonAnchor)) {
    console.error(`ERROR: Could not find Rider header Sync button anchor. Backup created at ${backup}`);
    process.exit(1);
  }

  const component = `          <AssignmentNotificationSound\n            workerCode={session.worker_code || session.normalizedLogin}\n            email={session.email}\n            role={session.role || "rider"}\n            onNewNotification={() => void load(session, true)}\n          />\n            `;

  source = source.replace(buttonAnchor, `${component}${buttonAnchor}`);
}

fs.writeFileSync(resolved, source, "utf8");
console.log(`OK: Notification sound installed in ${resolved}`);
console.log(`Backup: ${backup}`);
console.log("Next: place AssignmentNotificationSound.tsx in src/components/ and run npm run build.");
