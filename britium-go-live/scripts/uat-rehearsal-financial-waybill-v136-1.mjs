/** Disposable CI only: restore the missing Financial V2 wrapper before V136.1.
 * Never bypass or modify the safety-stop migration itself.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
if(process.env.DO_NOT_CONNECT_REMOTE!=='1')throw Error('Local replay guard missing');
const target=fileURLToPath(new URL('../supabase/migrations/20260925210905_field_team_waybill_gate_financial_v2_v136_1.sql',import.meta.url));
const fixture=fileURLToPath(new URL('../sql/candidates/uat_financial_waybill_v136_1_predecessor_rehearsal_only.sql',import.meta.url));
const sql=fs.readFileSync(target,'utf8'),ddl=fs.readFileSync(fixture,'utf8');
const old=sql.match(/v_old text := \$old\$([\s\S]*?)\$old\$;/)?.[1];
if(!old||!sql.includes('V136.1 safety stop: be_data_entry_financial_v2_create_waybill(jsonb) is missing.'))throw Error('Unexpected V136.1 migration');
if(sql.includes('CREATE OR REPLACE FUNCTION public.be_data_entry_financial_v2_create_waybill'))throw Error('Refusing duplicate fixture staging');
for(const marker of [old,'SECURITY DEFINER',"be_data_entry_require_access_v57('update', true)",'MUTATION_NOT_ACTIVE','SEGREGATION_OF_DUTIES','WAYBILL_READINESS_FAILED','PICKUP_PROOF_REQUIRED','IDEMPOTENCY_CONFLICT','pg_advisory_xact_lock','financial_locked_at','be_audit_events','FROM PUBLIC,anon,authenticated'])
 if(!ddl.includes(marker))throw Error('Financial waybill fixture incomplete: '+marker);
fs.writeFileSync(target,ddl+'\n'+sql);
console.log('CI ONLY: Financial V2 predecessor staged; unchanged V136.1 safety checks follow.');
