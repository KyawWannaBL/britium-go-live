import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath = new URL('../supabase/migrations/20260915050000_relax_selected_waybill_readiness_v39.sql', import.meta.url);
const sql = fs.readFileSync(migrationPath, 'utf8');

assert.equal(sql.includes("d.saved_at is null or"), true, 'migration must target the legacy saved_at gate');
assert.equal(sql.includes("or v_bad_financial<>0"), true, 'migration must target the legacy financial OK gate');
assert.equal(sql.includes("review_status='ACCEPTED'"), true, 'migration must target the legacy location approval gate');
assert.equal(sql.includes("v_new text := $new$"), true, 'migration must define the relaxed readiness block');
assert.equal(sql.includes("or v_bad_way_ids<>0 or v_missing_parcels<>0 then"), true, 'canonical Way ID and parcel-existence guards must remain');
assert.equal(sql.includes("Selected parcels must exist with canonical Way IDs and required recipient, phone, township, and address details."), true, 'replacement readiness message must be present');

console.log('V39 readiness migration contract verified.');
