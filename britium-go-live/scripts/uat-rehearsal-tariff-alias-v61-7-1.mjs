/** CI ONLY: source-verified tariff location alias mapping table before Sep13 V31.
 * Production schema shape read via information_schema/pg_constraint, no data copied.
 * Fail-closed RLS, no anonymous/client grants. Never deploy to hosted environments.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const src=fileURLToPath(new URL('../supabase/migrations/20260913124919_britium_yangon_township_aliases_v31.sql',import.meta.url));
const sql=fs.readFileSync(src,'utf8');
if(!sql.includes('insert into public.be_tariff_location_alias_v61_7_1'))throw Error('Not expected V31 alias migration');
const table=[
 '-- LOCAL CI ONLY: authentic verified tariff alias column set.',
 'CREATE TABLE IF NOT EXISTS public.be_tariff_location_alias_v61_7_1 (',
 ' normalized_alias text PRIMARY KEY,',
 ' alias_value text NOT NULL,',
 ' location_key text NOT NULL,',
 ' township_code text,',
 " location_kind text NOT NULL CHECK(location_kind IN ('TOWNSHIP','CITY_AGGREGATE','HIGHWAY_STATION','SERVICE_POINT')),",
 ' canonical_label text NOT NULL,',
 ' created_at timestamptz NOT NULL DEFAULT now(),',
 ' updated_at timestamptz NOT NULL DEFAULT now()',
 ');',
 'ALTER TABLE public.be_tariff_location_alias_v61_7_1 ENABLE ROW LEVEL SECURITY;',
 ''
].join('\n');
const historicalPath=fileURLToPath(new URL('../britium-current-ui-fixed/data_entry_tariff_wiring_v61_7_patch/sql/20260803_financial_v2_canonical_tariff_wiring_v61_7.sql',import.meta.url));
const historical=fs.readFileSync(historicalPath,'utf8');
const marker='create or replace function public.be_financial_v2_normalize_township_text_v61_7(';
const ix=historical.indexOf(marker),end=historical.indexOf('$normalize$;',ix);
if(ix<0||end<ix||historical.indexOf(marker,ix+marker.length)>=0)throw Error('Historical V61.7 normalization definition missing');
const normalize=historical.slice(ix,end+'$normalize$;'.length);
if(!normalize.includes('set search_path = pg_catalog')||!normalize.includes('immutable'))throw Error('Unexpected function permissions');

fs.writeFileSync(src,table+'\n'+normalize+'\n'+sql);
console.log('CI only: staged canonical tariff alias metadata before V31 township seed.');
