/** CI-only bilingual alias correction for V122, based on Production read-only key mapping.
 * Preserves historical 20260911 function body, adds exactly two aliases mapping
 * to validated township MMR013031. This does NOT modify the rate table or
 * any hosted branch / Production function.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const historical=fileURLToPath(new URL('../supabase/migrations/20260911000203_align_approved_standard_tariffs_and_exact_destination_keys.sql',import.meta.url));
const target=fileURLToPath(new URL('../supabase/migrations/20260923010245_missing_yangon_tariffs_v122.sql',import.meta.url));
const src=fs.readFileSync(historical,'utf8');
const start='create or replace function public.be_approved_tariff_lookup_key(p_value text)';
const begin=src.indexOf(start),end=src.indexOf('$key$;',begin);
if(begin!==0||end<0)throw Error('Unexpected canonical September function source');
let ddl=src.slice(begin,end+'$key$;'.length);
const old="select coalesce((select 'APPROVED:'||min(key) from aliases,input where alias=k),public.be_financial_v2_township_key_v61_4_1(p_value));";
const replacement="select coalesce((select 'MMR013031' from input where k in ('seikgyikanaungto','ဆိပ်ကြီးခနောင်တို')),(select 'APPROVED:'||min(key) from aliases,input where alias=k),public.be_financial_v2_township_key_v61_4_1(p_value));";
if(ddl.split(old).length!==2)throw Error('Historical tariff lookup SQL changed; refuse patch');
ddl=ddl.replace(old,replacement);
const v122=fs.readFileSync(target,'utf8');
if(!v122.includes("('ဆိပ်ကြီးခနောင်တို')")||!v122.includes('V122 verification failed'))throw Error('Unexpected V122 expected labels');
fs.writeFileSync(target,'-- CI-only mapping for Production verified Myanmar / Latin township key MMR013031.\n'+ddl+'\n'+v122);
console.log('CI-only: bilingual Seikgyikanaungto mapped to MMR013031 in V122 local replay.');
