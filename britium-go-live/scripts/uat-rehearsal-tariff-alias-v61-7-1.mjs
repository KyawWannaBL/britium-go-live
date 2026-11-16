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
fs.writeFileSync(src,table+sql);
console.log('CI only: staged canonical tariff alias metadata before V31 township seed.');
