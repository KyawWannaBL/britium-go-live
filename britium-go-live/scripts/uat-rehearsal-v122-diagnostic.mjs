/** CI-only V122 tariff verification diagnostic.
 * Emits just three hardcoded township keys and counts. No personal/business data
 * and no hosted connections. Remove before any promotion.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const p=fileURLToPath(new URL('../supabase/migrations/20260923010245_missing_yangon_tariffs_v122.sql',import.meta.url));
const sql=fs.readFileSync(p,'utf8');
const anchor='do $verify$';
if(sql.split(anchor).length!==2)throw Error('Unexpected V122 verification block');
const instrumentation=[
'DO $diagnose$',
'DECLARE x record; k text; tariff_count integer;',
'BEGIN',
" FOR x IN SELECT * FROM (VALUES ('Thanlyin'),('Seikgyikanaungto'),('ဆိပ်ကြီးခနောင်တို')) AS labels(label) LOOP",
'  k:=public.be_approved_tariff_lookup_key(x.label);',
'  SELECT count(*) INTO tariff_count FROM public.be_parcel_tariffs_v2 t',
"   WHERE public.be_approved_tariff_lookup_key(t.township)=k AND t.customer_tier='STANDARD'",
"   AND t.status='ACTIVE' AND t.effective_from <= public.be_business_date()",
'   AND (t.effective_to IS NULL OR t.effective_to >= public.be_business_date());',
"  RAISE NOTICE 'V122_MAPPING label=% key=% active_tariff_count=%', x.label, k, tariff_count;",
' END LOOP;',
'END;',
'$diagnose$;',
''
].join('\n');
fs.writeFileSync(p,sql.replace(anchor,instrumentation+anchor));
console.log('CI only: enabled V122 tariff labels diagnostic.');
