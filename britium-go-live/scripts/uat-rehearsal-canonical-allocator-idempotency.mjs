/** Disposable CI-only idempotency overlay for October 23 canonical allocator replay.
 * Leaves the committed October migration unchanged; unexpected definitions still fail.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

assert.equal(process.env.DO_NOT_CONNECT_REMOTE, '1', 'Remote connection guard required');
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Disposable GitHub Actions only');
const first=path.resolve('supabase/migrations/20261023043151_registration_save_canonical_allocator.sql');
const following=path.resolve('supabase/migrations/20261023043905_registration_save_preserve_canonical_location.sql');
const source=fs.readFileSync(first,'utf8');
const next=fs.readFileSync(following,'utf8');
const check="IF position(old_assignment in f)=0 THEN RAISE EXCEPTION 'Unexpected function definition: %',fn; END IF;";
const idempotent="IF position(new_assignment in f)>0 THEN CONTINUE; END IF;";
assert.equal(source.split(check).length,2,'Original canonical allocator fail-closed check unexpected');
assert.equal(next.split(idempotent).length,2,'Later committed migration must explicitly authorize idempotency');
assert.ok(source.includes("v_way_id := public.be_allocate_delivery_way_id(v_pickup_id,v_sequence);"),'Canonical Way ID allocator required');
assert.ok(!source.includes(idempotent),'Already patched; fail closed');
const edited=source.replace(check,idempotent+'\n    '+check);
assert.ok(edited.includes(check),'Unexpected definitions still rejected');
fs.writeFileSync(first,edited);
console.log('CI only: canonical Way ID allocator replay now tolerates already-canonical function definitions; unexpected definitions remain denied.');
