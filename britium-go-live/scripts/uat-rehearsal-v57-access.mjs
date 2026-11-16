/** Local-only diagnostic overlay for V57 Data Entry actor permissions.
 * Production pg_catalog columns/constraints and exact function definition.
 * No hosted writes, no users, no grants to client roles.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const target=fileURLToPath(new URL('../supabase/migrations/20260906213642_location_review_permission_identity_v29.sql',import.meta.url));
const source=fileURLToPath(new URL('../sql/candidates/uat_v57_actor_access_historical_rehearsal_only.sql',import.meta.url));
const sql=fs.readFileSync(target,'utf8'),fn=fs.readFileSync(source,'utf8');
if(!sql.includes('be_data_entry_actor_access_v57')||!fn.includes('v_uid uuid := auth.uid()')||!fn.includes('SECURITY DEFINER'))throw Error('Unexpected source');
const ledger=[
 '-- CI only. V57 access grant registry, fail closed.',
 'CREATE TABLE IF NOT EXISTS public.be_data_entry_access_grants_v57 (',
 ' grant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),',
 ' auth_user_id uuid NOT NULL,',
 ' registry_user_id text,',
 ' email_snapshot text NOT NULL,',
 ' branch_code text,',
 " grant_status text NOT NULL CHECK (grant_status IN ('PENDING','APPROVED','DENIED','REVOKED')),",
 " allowed_actions text[] NOT NULL DEFAULT ARRAY['view','create','update','upload','export'],",
 " waybill_allowed_actions text[] NOT NULL DEFAULT ARRAY['view','create','update','upload','export'],",
 ' effective_from timestamptz NOT NULL DEFAULT now(),',
 ' effective_to timestamptz,',
 ' approved_by uuid,',
 ' approval_reason text NOT NULL,',
 ' request_id text,',
 ' created_at timestamptz NOT NULL DEFAULT now(),',
 ' updated_at timestamptz NOT NULL DEFAULT now(),',
 ' CONSTRAINT be_data_entry_access_grants_v57_check CHECK (effective_to IS NULL OR effective_to > effective_from)',
 ');',
 'ALTER TABLE public.be_data_entry_access_grants_v57 ENABLE ROW LEVEL SECURITY;',
 ''
].join('\n');
fs.writeFileSync(target,ledger+'\n'+fn+'\nREVOKE ALL ON FUNCTION public.be_data_entry_actor_access_v57(text,boolean) FROM PUBLIC,anon;\n'+sql);
console.log('CI-only: V57 access ledger and auth-checked function installed before V29.');
