-- Legacy HQ-only read/administration endpoints must not bypass the new branch views.
-- Keep their existing implementation and grants; add an early branch-manager denial.
do $legacy_guards$
declare f record; d text; body text;
begin
 for f in select p.oid,p.proname,l.lanname from pg_proc p join pg_language l on l.oid=p.prolang where p.pronamespace='public'::regnamespace
  and p.proname in('be_cs_ticket_history','be_cs_ticket_detail','be_customer_service_snapshot','be_cs_parcel_support_queue','be_hr_dashboard','be_admin_hr_snapshot','be_hr_document_snapshot_v1','be_master_data_page_snapshot','be_master_data_snapshot','be_master_data_upsert_record','be_master_data_delete_record','be_master_data_bulk_upsert_records')
  and p.prorettype='jsonb'::regtype
 loop
  d:=pg_get_functiondef(f.oid);if strpos(d,'BRANCH_DEPARTMENT_LEGACY_GUARD_V1')>0 then continue;end if;
  if f.lanname='plpgsql' then
   d:=regexp_replace(d,'\m(begin)\M',E'begin\n -- BRANCH_DEPARTMENT_LEGACY_GUARD_V1\n if replace(public.be_current_role(),''-'',''_'') in (''branch_manager'',''branch_office_manager'') then raise exception ''USE_BRANCH_DEPARTMENT_WORKSPACE'' using errcode=''42501'';end if;','i');
  elsif f.lanname='sql' then
   select prosrc into body from pg_proc where oid=f.oid;
   d:=replace(d,'LANGUAGE sql','LANGUAGE plpgsql');
   d:=replace(d,body,E'begin\n -- BRANCH_DEPARTMENT_LEGACY_GUARD_V1\n if replace(public.be_current_role(),''-'',''_'') in (''branch_manager'',''branch_office_manager'') then raise exception ''USE_BRANCH_DEPARTMENT_WORKSPACE'' using errcode=''42501'';end if;\n return ('||regexp_replace(body,';[[:space:]]*$','')||E');\nend;');
  else continue;end if;
  execute d;
 end loop;
end $legacy_guards$;
