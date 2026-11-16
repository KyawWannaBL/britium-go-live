/** Local-only post-replay readiness gate. Hard-coded localhost Supabase DB.
 * Run only in disposable GitHub CI; no remote DB URL, users or secrets.
 */
import {execFileSync} from 'node:child_process';
if(process.env.DO_NOT_CONNECT_REMOTE!=='1')throw Error('Local replay guard missing');
const objects=[
 'be_data_entry_parcel_details','be_waybill_ledger','be_data_entry_financial_v2_runtime_v58',
 'be_parcel_tariffs_v2','be_master_data_rows','be_dispatch_scans_v39',
 'be_branch_offices','be_user_account_registry'
];
const env={...process.env,PGPASSWORD:'postgres',PGSSLMODE:'disable'};
function query(sql){
 return execFileSync('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1',
 '-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-c',sql],
 {encoding:'utf8',env,timeout:15000}).trim();
}
const missing=[],rlsOff=[];
for(const name of objects){
 const sql="select coalesce((select case when relrowsecurity then 'ENABLED' else 'DISABLED' end from pg_class where oid=to_regclass('public."+name+"')),'MISSING');";
 const value=query(sql);
 if(value==='MISSING')missing.push(name);
 else if(value!=='ENABLED')rlsOff.push(name+':'+value);
}
const authCount=Number(query('select count(*) from auth.users;'));
if(missing.length||rlsOff.length||authCount!==0){
 console.error('Local schema gate failed:',JSON.stringify({missing,rlsOff,authCount}));
 process.exit(1);
}
console.log('PASS: eight canonical UAT tables present, RLS enabled, Auth empty.');
