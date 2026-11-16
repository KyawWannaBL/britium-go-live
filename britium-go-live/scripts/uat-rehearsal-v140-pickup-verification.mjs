/** CI only: place preserved auth-checked worker pickup verification before
 * the Sep 24 V140 historical status-synchronization migration.
 * No real riders, proofs, hosted databases or production changes.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const dest=fileURLToPath(new URL('../supabase/migrations/20260924195910_field_team_verify_release_v140.sql',import.meta.url));
const fixture=fileURLToPath(new URL('../sql/candidates/uat_partial_pickup_verification_v140_rehearsal_only.sql',import.meta.url));
const target=fs.readFileSync(dest,'utf8');
const ddl=fs.readFileSync(fixture,'utf8');
if(!target.includes("be_field_team_submit_partial_pickup_verification(jsonb) not found")) throw Error('V140 historical target changed');
for(const marker of ['SECURITY DEFINER','auth.uid()','be_field_team_assert_assigned_pickup','PICKUP_ALREADY_ADVANCED','be_rider_authoritative_expected_count_v59'])
 if(!ddl.includes(marker))throw Error('Unexpected pickup authorization implementation: '+marker);
fs.writeFileSync(dest,ddl+'\n'+target);
console.log('CI ONLY: original guarded field pickup verification RPC restored before V140.');
