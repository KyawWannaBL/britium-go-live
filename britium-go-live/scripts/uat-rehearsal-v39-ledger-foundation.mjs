/** CI ONLY: import exactly the historical V39 ledger table definitions.
 * Extracts unchanged source CREATE TABLE statements from the archived V39 module.
 * This provides migration-replay evidence, not a production or UAT deployment.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const src=fileURLToPath(new URL('../britium-current-ui-fixed/warehouse_dispatch_rto_alert_v39.sql',import.meta.url));
const canonical=fileURLToPath(new URL('../supabase/migrations/20260831000000_original_v39_dispatch_delivery_ledger.sql',import.meta.url));
if(fs.existsSync(canonical)){
 const ddl=fs.readFileSync(canonical,'utf8');
 if(!ddl.includes('be_dispatch_scans_v39')||((ddl.match(/enable row level security/gi)||[]).length!==5)) throw Error('Versioned V39 security migration invalid');
 console.log('Canonical V39 ledger predecessor present; no diagnostic duplicate.');
 process.exit(0);
}
const dest=fileURLToPath(new URL('../supabase/migrations/20260831000000_CI_ONLY_V39_ledger_foundation.sql',import.meta.url));
const names=[
 'be_dispatch_scans_v39','be_dispatch_scan_events_v39','be_delivery_attempt_state_v39',
 'be_delivery_attempt_events_v39','be_operational_alerts_v39'
];
const sql=fs.readFileSync(src,'utf8');
if(fs.existsSync(dest)) throw Error('Existing migration would be overwritten');
const parts=names.map(name=>{
 const needle='create table if not exists public.'+name+' (';
 const first=sql.indexOf(needle);
 if(first<0 || sql.indexOf(needle,first+needle.length)>=0) throw Error('Missing/duplicate historical definition '+name);
 const end=sql.indexOf('\n);',first);
 if(end<0 || end-first>9000)throw Error('Invalid CREATE TABLE boundary for '+name);
 const ddl=sql.slice(first,end+3);
 if(!ddl.trimEnd().endsWith(');')) throw Error('Malformed historical table '+name);
 return ddl;
});
const safeRlS=names.map(name=>'ALTER TABLE public.'+name+' ENABLE ROW LEVEL SECURITY;').join('\n');
fs.writeFileSync(dest,'-- CI ONLY: exact original V39 table definitions; RLS enabled fail-closed.\n'+parts.join('\n\n')+'\n\n'+safeRlS+'\n');
console.log('CI only: staged '+names.length+' original V39 ledger tables with fail-closed RLS.');
