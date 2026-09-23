import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const files = fs.readdirSync(path.join(root, "supabase/migrations")).filter((name) => name.includes("operational_fk_indexes_v133"));
assert.equal(files.length, 1, "V133 operational index migration must exist.");
const migration = fs.readFileSync(path.join(root, "supabase/migrations", files[0]), "utf8");
for (const pattern of [
  /be_data_entry_register_rows\s*\(batch_id\)/,
  /be_data_entry_upload_rows\s*\(batch_id\)/,
  /be_warehouse_inventory_rows\s*\(parcel_id\)/,
  /be_wayplan_batches\s*\(upload_code\)/,
  /be_wayplan_stops\s*\(wayplan_route_id\)/,
]) assert.match(migration, pattern);
console.log("operational FK indexes V133 contract PASS");
