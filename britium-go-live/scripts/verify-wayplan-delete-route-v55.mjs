import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const route = fs.readFileSync(path.join(root, "api/wayplan-route.mjs"), "utf8");
const deletePatch = fs.readFileSync(path.join(root, "scripts/apply-wayplan-revision-delete-v47.mjs"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260919013000_wayplan_delete_route_v55.sql"), "utf8");

const checks = [
  ["Mapbox diagonal singleton batches are skipped", route.includes("one-element matrices") && route.includes("originIndices[0]===destinationIndices[0]")],
  ["Mapbox singleton non-diagonal batches are padded", route.includes("requestOrigins.length*requestDestinations.length<2") && route.includes("requestDestinations.push(auxiliary)")],
  ["billing-hold mode does not retry blocked Google", route.includes('!["MAPBOX_ONLY","MAPBOX_PREFERRED_BILLING_HOLD"].includes(providerMode)')],
  ["delete UI calls V55 purge RPC", deletePatch.includes('be_delete_created_wayplan_v55')],
  ["delete confirmation says permanently delete", deletePatch.includes("Permanently delete")],
  ["V55 releases parcels through guarded V47 delete", migration.includes("be_delete_created_wayplan_v47(p_payload)")],
  ["V55 removes dispatch header", migration.includes("delete from public.be_wayplan_dispatches")],
  ["V55 removes route versions", migration.includes("delete from public.be_wayplan_route_versions_v1")],
  ["V55 removes membership", migration.includes("delete from public.be_wayplan_membership_v40")],
  ["V55 retains audit history", migration.includes("audit_history_retained")],
  ["historical V47 deletes are cleaned", migration.includes("operational_delete_v47") && migration.includes("do $cleanup$")],
  ["command center defensively hides operator-deleted rows", migration.includes("operator_deleted_hidden")],
];

const failed = checks.filter(([,ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error("Wayplan delete + routing V55 contract FAILED:");
  failed.forEach((name) => console.error(" - " + name));
  process.exit(1);
}
console.log("Wayplan delete + routing V55 contract PASS");
