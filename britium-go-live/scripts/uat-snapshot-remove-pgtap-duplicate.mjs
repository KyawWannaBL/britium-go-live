/** CI-only diagnostic. Never mutate hosted Supabase schemas or production history.
 * The July snapshot recreates _time_trial_type after installing extension pgtap.
 * In production, pg_depend proves that this composite type belongs to pgtap.
 * Remove just its duplicate CREATE TYPE statement from the disposable CI copy.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const path=fileURLToPath(new URL('../supabase/migrations/20260721093501_remote_schema.sql',import.meta.url));
let sql=fs.readFileSync(path,'utf8');
const statement='create type "public"."_time_trial_type" as ("a_time" numeric);';
if(sql.split(statement).length !== 2) throw new Error('Unexpected pgtap duplicate count; refusing diagnostic modification');
sql=sql.replace(statement,'-- CI-ONLY: duplicate pgTAP-owned composite type omitted; supplied by extension pgtap');
fs.writeFileSync(path,sql);
console.log('CI diagnostic: omitted one duplicate pgTAP-owned composite CREATE TYPE in disposable checkout.');
