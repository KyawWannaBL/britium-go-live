/** CI ONLY: fill schema-only dependencies proven missing in the staged replay.
 * Each verified table is staged immediately before its first consumer so its
 * foreign-key targets exist. Never copy rows, policies or direct client grants.
 */
import fs from 'node:fs';
if(process.env.DO_NOT_CONNECT_REMOTE!=='1')throw Error('Local replay guard missing');
const entries=JSON.parse(fs.readFileSync(new URL('./uat-operational-prerequisites.json',import.meta.url),'utf8'));
if(entries.length!==13)throw Error('Unexpected operational prerequisite count');
const groups=new Map();
for(const {name,target,ddl} of entries){
 if(!/^be_[a-z_0-9]+$/.test(name)||!/^\d{14}_[a-z_0-9]+\.sql$/.test(target))throw Error('Invalid prerequisite name/path');
 for(const marker of ['CREATE TABLE public.'+name+' (','ALTER TABLE public.'+name+' ENABLE ROW LEVEL SECURITY;','REVOKE ALL ON public.'+name+' FROM PUBLIC,anon,authenticated;'])
  if(!ddl.includes(marker))throw Error('Incomplete operational prerequisite '+name);
 if(/^\s*(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|GRANT\b|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b)/im.test(ddl.replace(/--[^\n]*/g,'')))throw Error('Unexpected non-schema operation '+name);
 const sql=groups.get(target)||[];sql.push(ddl);groups.set(target,sql);
}
for(const [target,ddls] of groups){
 const path=new URL('../supabase/migrations/'+target,import.meta.url);
 const original=fs.readFileSync(path,'utf8');
 if(original.includes('-- CI_ONLY_VERIFIED_OPERATIONAL_PREREQUISITES'))throw Error('Refusing repeated prerequisite staging');
 fs.writeFileSync(path,'-- CI_ONLY_VERIFIED_OPERATIONAL_PREREQUISITES\n'+ddls.join('\n')+'\n'+original);
}
console.log('CI ONLY: staged 13 empty, closed operational schemas before their first consumers.');
