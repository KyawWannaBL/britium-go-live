import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath = new URL('../supabase/migrations/20260915050000_relax_selected_waybill_readiness_v39.sql', import.meta.url);
const sql = fs.readFileSync(migrationPath, 'utf8');

const oldBlockStart = sql.indexOf('v_old text := $old$');
const newBlockStart = sql.indexOf('v_new text := $new$');
const newBlockEnd = sql.indexOf('$new$;', newBlockStart);
assert.ok(oldBlockStart >= 0 && newBlockStart > oldBlockStart && newBlockEnd > newBlockStart, 'migration must contain old and new readiness blocks');

const oldBlock = sql.slice(oldBlockStart, newBlockStart);
const newBlock = sql.slice(newBlockStart, newBlockEnd);

assert.equal(oldBlock.includes('d.saved_at is null'), true, 'legacy gate must include saved_at');
assert.equal(oldBlock.includes('v_bad_financial<>0'), true, 'legacy gate must include financial validation');
assert.equal(oldBlock.includes("review_status='ACCEPTED'"), true, 'legacy gate must include approved location');
assert.equal(newBlock.includes('d.saved_at is null'), false, 'relaxed gate must not require saved_at');
assert.equal(newBlock.includes('v_bad_financial<>0'), false, 'relaxed gate must not require financial OK');
assert.equal(newBlock.includes("review_status='ACCEPTED'"), false, 'relaxed gate must not require accepted delivery location');
assert.equal(newBlock.includes('v_bad_way_ids<>0'), true, 'canonical Way ID guard must remain');
assert.equal(newBlock.includes('v_missing_parcels<>0'), true, 'parcel existence guard must remain');
assert.equal(sql.includes('Selected parcels must exist with canonical Way IDs and required recipient, phone, township, and address details.'), true, 'replacement readiness message must be present');

console.log('V39 readiness migration contract verified.');
