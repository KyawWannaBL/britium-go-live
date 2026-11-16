/** CI-only: authentic historical V13.2 calculator before V17 routing wrapper.
 * Never deploy into hosted UAT or Production; preserves original migration RENAME.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('../supabase/migrations/20260903133112_data_entry_service_provider_routing_v17.sql',import.meta.url));
const fixture=fileURLToPath(new URL('../sql/candidates/uat_v13_2_calculator_historical_rehearsal_only.sql',import.meta.url));
const sql=fs.readFileSync(file,'utf8');
const historical=fs.readFileSync(fixture,'utf8');
if(!sql.includes("Data Entry calculator is unavailable; cannot install V17 provider routing")||
 !historical.includes("CREATE OR REPLACE FUNCTION public.be_data_entry_financial_v2_calculate(p_payload jsonb)")||
 !historical.includes("SECURITY DEFINER"))throw Error("Historical calculator fixture mismatch");
fs.writeFileSync(file,historical+'\n'+sql);
console.log('CI-only: installed original V13.2 calculator predecessor before V17 rename.');
