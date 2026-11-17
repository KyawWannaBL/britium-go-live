/** CI-only authentic pre-V141 rider proof sync function.
 * V141 then applies its own orphan canonical pickup guard in its original
 * CRLF-sensitive historical migration. No hosted connections or data.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const dest=fileURLToPath(new URL('../supabase/migrations/20260924200148_rider_proof_sync_orphan_guard_v141.sql',import.meta.url));
const src=fileURLToPath(new URL('../sql/candidates/uat_v141_proof_sync_predecessor_rehearsal_only.sql',import.meta.url));
const migration=fs.readFileSync(dest,'utf8');
const ddl=fs.readFileSync(src,'utf8');
const old="      if v_pickup_id is null or v_proof_url is null then\r\n        continue;\r\n      end if;\r\n";
if(!migration.includes("be_sync_rider_proofs_to_data_entry() not found"))throw Error('Unexpected V141 migration');
if(!ddl.includes('SECURITY DEFINER') || !ddl.includes('public.be_portal_pickup_requests') ||
   !ddl.includes(old) || ddl.includes('Legacy photo/proof tables can outlive'))throw Error('Unexpected historical preimage');
fs.writeFileSync(dest,ddl+'\n'+migration);
console.log('CI-only: staged guarded V141 predecessor with exact CRLF insertion point.');
