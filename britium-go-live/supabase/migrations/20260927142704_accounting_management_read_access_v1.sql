create or replace function public.be_accounting_current_authority_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := public.be_accounting_current_role_v1();
  v_row public.be_accounting_user_authority_v2%rowtype;
begin
  if v_role in ('service_role','database_admin','superadmin','super_admin','app_owner','sys') then
    return jsonb_build_object(
      'ok',true,'role',v_role,'authority_level',100,
      'can_entry',true,'can_review',true,'can_post',true,
      'can_reports',true,'can_audit',true,'can_admin',true
    );
  end if;

  if v_uid is null then
    return jsonb_build_object(
      'ok',false,'role',v_role,'authority_level',0,
      'can_entry',false,'can_review',false,'can_post',false,
      'can_reports',false,'can_audit',false,'can_admin',false
    );
  end if;

  select * into v_row
  from public.be_accounting_user_authority_v2
  where auth_user_id=v_uid and is_active
  limit 1;

  if found then
    return jsonb_build_object(
      'ok',true,'role',v_role,'authority_level',v_row.authority_level,
      'can_entry',v_row.can_entry,'can_review',v_row.can_review,'can_post',v_row.can_post,
      'can_reports',v_row.can_reports,'can_audit',v_row.can_audit,'can_admin',v_row.can_admin
    );
  end if;

  if v_role in ('finance','finance_user','accountant','finance_admin','finance_manager','finm','bil','ar') then
    return jsonb_build_object(
      'ok',true,'role',v_role,'authority_level',40,
      'can_entry',true,'can_review',true,'can_post',false,
      'can_reports',true,'can_audit',false,'can_admin',false
    );
  end if;

  if v_role in ('management','director') then
    return jsonb_build_object(
      'ok',true,'role',v_role,'authority_level',30,
      'can_entry',false,'can_review',false,'can_post',false,
      'can_reports',true,'can_audit',true,'can_admin',false
    );
  end if;

  return jsonb_build_object(
    'ok',false,'role',v_role,'authority_level',0,
    'can_entry',false,'can_review',false,'can_post',false,
    'can_reports',false,'can_audit',false,'can_admin',false
  );
end;
$function$;

create or replace function public.be_accounting_general_ledger_v1(
  p_from date default null::date,
  p_to date default null::date,
  p_account_code text default null::text,
  p_search text default null::text,
  p_limit integer default 1000
)
returns jsonb
language sql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
  select case when not (
      public.be_accounting_can_v1('finance_review')
      or public.be_accounting_can_v1('financial_reports')
    )
    then jsonb_build_object('ok',false,'code','UNAUTHORIZED')
    else jsonb_build_object(
      'ok',true,
      'rows',coalesce((
        select jsonb_agg(to_jsonb(q) order by q.accounting_date desc,q.journal_number desc,q.sequence_no)
        from (
          select j.id as journal_id,j.journal_number,j.accounting_date,j.description as journal_description,
                 j.source_event_id,j.posted_by,j.posted_at,j.reversal_of_journal_id,j.replacement_for_journal_id,
                 l.sequence_no,a.account_code,a.account_name,a.account_type,a.report_group,
                 l.description,l.debit_amount,l.credit_amount,l.branch_code,l.merchant_id,
                 l.rider_or_employee_id,l.source_reference,l.cost_center
          from public.be_journal_entries j
          join public.be_journal_lines l on l.journal_id=j.id
          join public.be_chart_of_accounts a on a.id=l.account_id
          where j.status='POSTED'
            and (p_from is null or j.accounting_date>=p_from)
            and (p_to is null or j.accounting_date<=p_to)
            and (nullif(btrim(coalesce(p_account_code,'')),'') is null or a.account_code=p_account_code)
            and (
              nullif(btrim(coalesce(p_search,'')),'') is null
              or j.journal_number ilike '%'||p_search||'%'
              or coalesce(l.source_reference,'') ilike '%'||p_search||'%'
              or coalesce(l.description,'') ilike '%'||p_search||'%'
            )
          order by j.accounting_date desc,j.journal_number desc,l.sequence_no
          limit greatest(1,least(coalesce(p_limit,1000),5000))
        ) q
      ),'[]'::jsonb)
    ) end;
$function$;