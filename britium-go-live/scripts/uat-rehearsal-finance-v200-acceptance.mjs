/** CI ONLY: restore authentic retained V3 helpers and provide rollback-only
 * synthetic inputs to the unchanged V200 embedded acceptance assertions.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const retained=['be_finance_claim_v3','be_finance_actor_email_v3','be_finance_assert_internal_v3','be_finance_json_number_v3','be_finance_json_date_v3','be_finance_audit_v3','be_finance_transition_batch_v3','be_finance_set_parcel_hold_v3','be_finance_raise_dispute_v3','be_finance_resolve_dispute_v3','be_finance_settlement_statement_v3'];
export function financePrelude(source){
 const found=new Map();
 for(const match of source.matchAll(/create or replace function public\.([a-z_0-9]+)\s*\([\s\S]*?\bas\s+(\$[a-z_0-9]*\$)[\s\S]*?\2\s*;/gi))
  if(retained.includes(match[1])){if(found.has(match[1]))throw Error('Ambiguous Finance helper '+match[1]);found.set(match[1],match[0]);}
 if(found.size!==retained.length)throw Error('Original Finance helper source incomplete');
 const sequence='create sequence if not exists public.be_finance_settlement_batch_no_seq_v3;';
 if(!source.includes(sequence))throw Error('Original Finance sequence absent');
 const permissions=`DO $permissions$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN (${retained.map(n=>"'"+n+"'").join(',')}) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.oid::regprocedure);
 END LOOP; END $permissions$;`;
 const grants=[...source.matchAll(/grant execute on function public\.([a-z_0-9]+)[^;]+;/gi)].filter(m=>retained.includes(m[1])).map(m=>m[0]);
 return '-- CI ONLY: unchanged retained Finance V3 helpers, no account seeds.\n'+sequence+'\n'+[...found.values()].join('\n')+'\n'+permissions+'\n'+grants.join('\n')+'\n';
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.env.DO_NOT_CONNECT_REMOTE!=='1')throw Error('Local replay guard missing');
 const path=new URL('../supabase/migrations/20261007090836_merchant_settlement_live_v200.sql',import.meta.url);
 const original=fs.readFileSync(path,'utf8');
 const source=fs.readFileSync(new URL('../britium-current-ui-fixed/Britium_Integrated_Master_V4_1_Aligned_Source/Britium_Integrated_Master_V4_1_Aligned_Source/src/sql/SQL 0708/20260731_financial_settlement_v3.sql',import.meta.url),'utf8');
 const fixture=fs.readFileSync(new URL('../sql/candidates/uat_v200_rollback_acceptance_fixtures.sql',import.meta.url),'utf8');
 if([...original.matchAll(/^SAVEPOINT acceptance;$/gm)].length!==1||original.split('ROLLBACK TO SAVEPOINT acceptance;').length!==2||!original.includes("raise exception 'Finance acceptance actors missing'"))throw Error('Unexpected V200 acceptance boundaries');
 if(original.includes('-- CI_ONLY_V200_ORIGINAL_MIGRATION'))throw Error('Refusing repeated V200 staging');
 fs.writeFileSync(path,financePrelude(source)+'\n-- CI_ONLY_V200_ORIGINAL_MIGRATION\n'+original.replace('SAVEPOINT acceptance;','SAVEPOINT acceptance;\n'+fixture));
 console.log('CI ONLY: original V200 acceptance assertions retained; synthetic actors/parcels roll back at original savepoint.');
}
