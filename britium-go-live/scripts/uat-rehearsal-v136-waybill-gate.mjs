/** CI-only: restore original Rider-only waybill gate to the historical V136
 * migration so its verified replacement can run unchanged.
 * Keeps all original waybill, proof and financial logic intact.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const migration=fileURLToPath(new URL('../supabase/migrations/20260925210810_field_team_waybill_gate_v136.sql',import.meta.url));
const fixture=fileURLToPath(new URL('../sql/candidates/uat_v136_waybill_gate_predecessor_rehearsal_only.sql',import.meta.url));
const sql=fs.readFileSync(migration,'utf8');
const ddl=fs.readFileSync(fixture,'utf8');
if(!sql.includes("V136 safety stop: be_data_entry_create_waybill_from_rows is missing"))throw Error('Unexpected V136 patch SQL');
for(const flag of ['SECURITY DEFINER','pickup_verified_at is null','pickup_collected_at is null','Rider-verified and COLLECTED'])
 if(!ddl.includes(flag))throw Error('Historical waybill preimage incomplete: '+flag);
if(ddl.includes('field-team verified and COLLECTED'))throw Error('Historical predecessor already patched');
fs.writeFileSync(migration,ddl+'\n'+sql);
console.log('CI ONLY: authentic pre-V136 waybill creation RPC staged before canonical gate patch.');
