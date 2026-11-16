/** Diagnostic ONLY: add verified existing workforce-login resolver to local replay.
 * No remote endpoints, production secrets, or hosted DB interactions.
 * The fixture retains the original auth.users mapping checks.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const target=fileURLToPath(new URL('../supabase/migrations/20260901192437_production_public_surface_lockdown_v1.sql',import.meta.url));
const fixture=fileURLToPath(new URL('../sql/candidates/uat_login_identity_dependency_rehearsal_only.sql',import.meta.url));
const original=fs.readFileSync(target,'utf8');
const fn=fs.readFileSync(fixture,'utf8');
if(!original.includes('grant execute on function public.be_field_team_resolve_login(text) to anon'))
  throw Error('Expected historical anonymous resolver grant missing');
for(const marker of ['SECURITY DEFINER','from auth.users u','workforce_login_not_mapped','v_row.auth_user_id'])
  if(!fn.includes(marker))throw Error('Security invariant missing: '+marker);
fs.writeFileSync(target,fn+'\n'+original);
console.log('CI-only: preserved authenticated workforce mapping resolver ahead of historical lockdown.');
