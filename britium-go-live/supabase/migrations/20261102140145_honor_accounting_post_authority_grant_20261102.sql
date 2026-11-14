CREATE OR REPLACE FUNCTION public.be_accounting_manual_journal_post_v1(p_draft_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
 v_role text:=public.be_current_role();v_d public.be_accounting_manual_journal_drafts_v1%rowtype;v_jid uuid;v_line jsonb;v_seq int:=0;v_acc uuid;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
 if v_role not in ('accountant','superadmin','super_admin','admin') and not exists (select 1 from public.be_accounting_user_authority_v2 au where au.auth_user_id=auth.uid() and au.is_active and au.can_post) then raise exception 'JOURNAL_POST_AUTHORITY_REQUIRED' using errcode='42501'; end if;
 select * into v_d from public.be_accounting_manual_journal_drafts_v1 where id=p_draft_id for update;
 if not found then raise exception 'DRAFT_NOT_FOUND'; end if;
 if v_d.status<>'DRAFT' then return jsonb_build_object('ok',true,'status',v_d.status,'journal_id',v_d.posted_journal_id); end if;
 if v_d.created_by=auth.uid() and v_role not in ('superadmin','super_admin') then raise exception 'MAKER_CHECKER_REQUIRED_DIFFERENT_POSTER'; end if;

 insert into public.be_journal_entries(journal_number,accounting_date,description,status,posted_by,posted_at,currency_code,metadata)
 values(v_d.journal_reference,v_d.transaction_date,v_d.description,'POSTED',auth.uid(),now(),'MMK',
  jsonb_build_object('manual_draft_id',v_d.id,'journal_type',v_d.journal_type,'branch_code',v_d.branch_code,'department_code',v_d.department_code,
    'cost_center_code',v_d.cost_center_code,'way_id',v_d.way_id,'waybill_no',v_d.waybill_no,'evidence_id',v_d.evidence_id,'source_module',v_d.source_module))
 returning id into v_jid;

 for v_line in select * from jsonb_array_elements(v_d.lines) loop
   v_seq:=v_seq+1;
   select id into v_acc from public.be_chart_of_accounts where account_code=v_line->>'account_code' and is_active and is_postable;
   if v_acc is null then raise exception 'INVALID_ACCOUNT_%',v_line->>'account_code'; end if;
   insert into public.be_journal_lines(journal_id,account_id,sequence_no,debit_amount,credit_amount,branch_code,merchant_id,rider_or_employee_id,source_reference,cost_center,description,metadata)
   values(v_jid,v_acc,v_seq,coalesce(nullif(v_line->>'debit','')::numeric,0),coalesce(nullif(v_line->>'credit','')::numeric,0),
    v_d.branch_code,v_d.merchant_code,v_d.rider_employee_code,coalesce(v_d.way_id,v_d.waybill_no,v_d.journal_reference),v_d.cost_center_code,
    coalesce(nullif(v_line->>'description',''),v_d.description),jsonb_build_object('journal_type',v_d.journal_type,'department_code',v_d.department_code));
 end loop;

 update public.be_accounting_manual_journal_drafts_v1 set status='POSTED',posted_by=auth.uid(),posted_at=now(),posted_journal_id=v_jid,updated_at=now() where id=v_d.id;
 return jsonb_build_object('ok',true,'status','POSTED','journal_id',v_jid,'journal_reference',v_d.journal_reference);
end $function$
