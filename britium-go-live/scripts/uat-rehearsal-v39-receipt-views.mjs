/** CI ONLY: import original V39 receipt view and its settings foundation.
 * Verified source: warehouse_dispatch_rto_alert_v39.sql.
 * Never promote this diagnostic migration to hosted UAT or production.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const src=fileURLToPath(new URL('../britium-current-ui-fixed/warehouse_dispatch_rto_alert_v39.sql',import.meta.url));
const target=fileURLToPath(new URL('../supabase/migrations/20260831000001_CI_ONLY_V39_receipt_view.sql',import.meta.url));
const sql=fs.readFileSync(src,'utf8');
const extract=(start)=>{
 const a=sql.indexOf(start);
 if(a<0||sql.indexOf(start,a+start.length)>=0)throw Error('Missing/ambiguous original source '+start);
 const b=sql.indexOf(';\n',a);
 if(b<0||b-a>12000)throw Error('Unbounded DDL '+start);
 return sql.slice(a,b+1);
};
if(fs.existsSync(target)) throw Error('Refusing override of existing migration');
const settings=extract('create table if not exists public.be_operational_settings_v39 (');
const receipt=extract('create or replace view public.be_v_warehouse_receipt_v39 as');
const lifecycle=extract('create or replace view public.be_v_warehouse_lifecycle_v39 as');
fs.writeFileSync(target,[
  '-- DIAGNOSTIC LOCAL REPLAY ONLY, not canonical historical migration.',
  settings,
  "ALTER TABLE public.be_operational_settings_v39 ENABLE ROW LEVEL SECURITY;",
  receipt,
  lifecycle,
  ''
].join('\n\n'));
console.log('CI only: staged original V39 settings and receipt/lifecycle view definitions.');
