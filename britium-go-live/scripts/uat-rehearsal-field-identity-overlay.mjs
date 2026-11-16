/** CI-only historical replay overlay: restore full auth-checked field identity.
 * Never call with hosted database credentials or promote to production.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const migration=fileURLToPath(new URL('../supabase/migrations/20260830094500_primary_field_verification_guard_v10_1.sql',import.meta.url));
const fixture=fileURLToPath(new URL('../sql/candidates/uat_field_team_identity_rehearsal_only.sql',import.meta.url));
const original=fs.readFileSync(migration,'utf8');
const definition=fs.readFileSync(fixture,'utf8');
if(!original.includes('create or replace function private.be_field_primary_context_v101()')) throw Error('Unexpected August 30 migration');
if(!definition.includes('IF v_uid IS NULL') || !definition.includes('IF NOT FOUND') || !definition.includes('SECURITY DEFINER')) throw Error('Identity authorization guard mismatch');
fs.writeFileSync(migration,definition+'\n'+original);
console.log('CI only: inserted authenticated field identity before August 30 guard.');
