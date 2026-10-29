-- Branch vault paths are isolated from HQ and other branch document folders.
create or replace function public.be_branch_department_storage_branch_v1(p_write boolean default false)
returns text language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
 if auth.uid() is null or replace(public.be_current_role(),'-','_') not in('branch_manager','branch_office_manager') then return null;end if;
 return public.be_branch_department_scope_v1(null,p_write);
end $$;
revoke all on function public.be_branch_department_storage_branch_v1(boolean) from public,anon;
grant execute on function public.be_branch_department_storage_branch_v1(boolean) to authenticated;
create or replace function public.be_branch_hr_orphan_v1(p_path text)
returns boolean language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare b text:=public.be_branch_department_storage_branch_v1(true);
begin
 return b is not null and p_path like b||'/'||auth.uid()::text||'/%' and not exists(select 1 from public.be_hr_document_register_v1 d where d.storage_path=p_path);
end $$;
revoke all on function public.be_branch_hr_orphan_v1(text) from public,anon;
grant execute on function public.be_branch_hr_orphan_v1(text) to authenticated;
drop policy if exists branch_hr_vault_insert on storage.objects;
create policy branch_hr_vault_insert on storage.objects for insert to authenticated with check(
 bucket_id='hr-documents' and split_part(name,'/',1)=public.be_branch_department_storage_branch_v1(true)
 and split_part(name,'/',2)=auth.uid()::text and strpos(name,'..')=0
);
drop policy if exists branch_hr_vault_read on storage.objects;
create policy branch_hr_vault_read on storage.objects for select to authenticated using(
 bucket_id='hr-documents' and split_part(name,'/',1)=public.be_branch_department_storage_branch_v1(false)
);
drop policy if exists branch_hr_vault_orphan_cleanup on storage.objects;
create policy branch_hr_vault_orphan_cleanup on storage.objects for delete to authenticated using(
 bucket_id='hr-documents' and split_part(name,'/',1)=public.be_branch_department_storage_branch_v1(true)
 and split_part(name,'/',2)=auth.uid()::text and public.be_branch_hr_orphan_v1(name)
);

-- Existing HQ search can locate new branch-attributed CRM records by branch code.
do $hq_search$
declare f record; d text;
begin
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname in('be_marketing_lead_snapshot_v1','be_bd_pipeline_snapshot_v1') loop
  d:=pg_get_functiondef(f.oid);
  if strpos(d,'BRANCH_CRM_SEARCH_V1')>0 then continue;end if;
  if strpos(d,'coalesce(stage,'''')) like')=0 then raise exception 'Review HQ CRM search before changing branch search';end if;
  d:=replace(d,'coalesce(stage,'''')) like','coalesce(stage,'''')||'' ''||coalesce(branch_code,'''')) like');
  d:=regexp_replace(d,'\m(begin)\M',E'begin\n -- BRANCH_CRM_SEARCH_V1','i');execute d;
 end loop;
end $hq_search$;
