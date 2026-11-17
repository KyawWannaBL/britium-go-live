/** CI ONLY: original V43 Supervisor review tables, no approvals seeded,
 * no public grants; never deploy to hosted UAT until full security review.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const src=fileURLToPath(new URL('../britium-current-ui-fixed/wayplan_supervisor_approval_v43.sql',import.meta.url));
const dst=fileURLToPath(new URL('../supabase/migrations/20260915010000_CI_ONLY_V43_wayplan_reviews.sql',import.meta.url));
if(fs.existsSync(dst))throw Error('Existing migration; refusing replacement');
const s=fs.readFileSync(src,'utf8');
const names=['be_wayplan_review_v43','be_wayplan_review_events_v43'];
const sql=names.map(name=>{
 const pattern='create table if not exists public.'+name+' (';
 const i=s.indexOf(pattern),j=s.indexOf('\n);',i);
 if(i<0||j<0||j-i>5000||s.indexOf(pattern,i+1)!==-1)throw Error('Missing V43 source '+name);
 return s.slice(i,j+3);
}).join('\n\n');
fs.writeFileSync(dst,'-- CI ONLY, original V43 tables, no live records.\n'+sql+'\n'+names.map(name=>'ALTER TABLE public.'+name+' ENABLE ROW LEVEL SECURITY;').join('\n')+'\n'+names.map(name=>'REVOKE ALL ON public.'+name+' FROM PUBLIC, anon, authenticated;').join('\n')+'\n');
console.log('CI: staged two historical V43 review tables, fail closed.');
