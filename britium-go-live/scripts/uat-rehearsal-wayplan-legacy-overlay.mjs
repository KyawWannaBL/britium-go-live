/** Diagnostic-only dependency overlay in disposable GitHub Actions checkout.
 * The historical 20260826042244 REVOKE assumes a function that the
 * migration history placeholders did not recreate. Never use on hosted DB.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const migration=fileURLToPath(new URL('../supabase/migrations/20260826042244_lock_down_wayplan_assignment_legacy_20260826.sql',import.meta.url));
const fixture=fileURLToPath(new URL('../sql/candidates/uat_legacy_wayplan_dependency_rehearsal_only.sql',import.meta.url));
const original=fs.readFileSync(migration,'utf8');
const ddl=fs.readFileSync(fixture,'utf8');
const expected='revoke all on function public.be_wayplan_assignment_options_v44_legacy_20260826() from public, anon, authenticated;';
if(!original.toLowerCase().trim().startsWith(expected)) throw new Error('Unexpected migration content. Refusing temporary overlay.');
if(!ddl.includes('CREATE OR REPLACE FUNCTION public.be_wayplan_assignment_options_v44_legacy_20260826()')) throw new Error('Missing historical function fixture');
if(!ddl.includes('SECURITY DEFINER')) throw new Error('Unexpected historical security semantics');
fs.writeFileSync(migration,ddl+'\n'+original);
console.log('CI-only legacy wayplan dependency restored before privilege revocation in disposable checkout.');
