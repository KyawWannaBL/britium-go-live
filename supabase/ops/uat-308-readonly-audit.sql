-- Read-only SQL for UAT project hgijdyfwmvskchsruknp only.
-- Never execute in production. Does not mutate migrations, roles, tables, or RLS.
select version,name
from supabase_migrations.schema_migrations
order by version desc limit 35;

select n.nspname as schema_name,t.typname,t.typtype
from pg_type t join pg_namespace n on n.oid=t.typnamespace
where n.nspname='public' and t.typname in ('app_role','delivery_status','employee_role')
order by t.typname;

select tablename,policyname,cmd,roles,qual,with_check
from pg_policies
where schemaname='public' and tablename in ('user_profiles','approval_requests','branches')
order by tablename,policyname;

select code,id,city,is_active
from public.branches where code in ('MDY_UAT','INSEIN_UAT')
order by code;

select
  has_column_privilege('authenticated','public.user_profiles','role','UPDATE') as can_change_role,
  has_column_privilege('authenticated','public.user_profiles','branch_id','UPDATE') as can_change_branch,
  has_column_privilege('authenticated','public.user_profiles','phone','UPDATE') as can_change_phone;
