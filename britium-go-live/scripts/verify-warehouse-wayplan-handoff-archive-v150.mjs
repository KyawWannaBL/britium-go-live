import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),"..");
const warehouse=fs.readFileSync(path.join(root,"src/pages/WarehousePage.tsx"),"utf8");
const wayplan=fs.readFileSync(path.join(root,"src/pages/WayplanCommandCenterPage.tsx"),"utf8");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20260927230000_warehouse_wayplan_handoff_archive_v150.sql"),"utf8");

assert.match(warehouse,/be_warehouse_mark_delivery_ready_v150/);
assert.match(warehouse,/be_wayplan_handoff_ids_v150/);
assert.match(warehouse,/window\.location\.hash="\/wayplan-command"/);
assert.match(warehouse,/Ready to Create Wayplan/);
assert.match(warehouse,/Recent Wayplan Handoffs — 7 days/);
assert.match(warehouse,/handoffArchiveExpanded/);
assert.match(wayplan,/be_warehouse_ack_wayplan_handoff_v150/);
assert.match(wayplan,/handoffSelection/);
assert.match(wayplan,/Warehouse handoff way\(s\) are preselected/);
assert.match(migration,/interval '7 days'/);
assert.match(migration,/visible_in_wayplan_at/);
assert.match(migration,/be_warehouse_wayplan_handoffs_v150/);
assert.match(migration,/delivery_way_id text primary key/);

console.log("Warehouse -> Wayplan handoff archive V150 contract PASS");
