begin;

create or replace function public.be_accounting_sync_branch_finance_v1(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_row jsonb;
  v_event_type text;
  v_mapping public.be_accounting_mappings%rowtype;
  v_debit_account uuid;
  v_credit_account uuid;
  v_amount numeric(18,2);
  v_upsert jsonb;
  v_event_id uuid;
  v_fingerprint text;
  v_scanned integer := 0;
  v_synced integer := 0;
  v_needs_review integer := 0;
begin
  if p_from is null or p_to is null or p_to<p_from then
    return jsonb_build_object('ok',false,'code','INVALID_DATE_RANGE');
  end if;

  if to_regclass('public.branch_office_finance_entries') is null then
    return jsonb_build_object(
      'ok',true,'code','SOURCE_NOT_AVAILABLE','source','branch_office_finance_entries',
      'scanned',0,'synced',0,'needs_review',0
    );
  end if;

  for v_row in execute $query$
    select to_jsonb(q)
    from (
      select
        e.id,
        e.branch_office_id,
        coalesce(nullif(to_jsonb(b)->>'branch_code',''),nullif(to_jsonb(b)->>'code',''),e.branch_office_id::text) as branch_code,
        e.entry_type,
        e.amount,
        e.entry_date,
        e.category,
        e.notes,
        e.related_transaction_id,
        e.created_at
      from public.branch_office_finance_entries e
      left join public.branch_offices b on b.id=e.branch_office_id
      where e.entry_date between $1 and $2
        and coalesce(e.amount,0)>0
      order by e.entry_date,e.created_at,e.id
    ) q
  $query$
  using p_from,p_to
  loop
    v_scanned := v_scanned+1;
    v_event_type := case
      when upper(coalesce(v_row->>'entry_type',''))='EXPENSE'
        then 'BRANCH_EXPENSE_'||regexp_replace(upper(coalesce(v_row->>'category','OTHER')),'[^A-Z0-9]+','_','g')
      else 'BRANCH_'||regexp_replace(upper(coalesce(v_row->>'entry_type','ENTRY')),'[^A-Z0-9]+','_','g')
    end;
    v_event_type := trim(both '_' from v_event_type);
    v_amount := round(greatest(coalesce(nullif(v_row->>'amount','')::numeric,0),0),2);

    select *
    into v_mapping
    from public.be_accounting_mappings m
    where m.event_type=v_event_type
      and m.is_active
      and (m.branch_code is null or upper(m.branch_code)=upper(v_row->>'branch_code'))
      and m.effective_from<=coalesce(nullif(v_row->>'entry_date','')::date,current_date)
      and (m.effective_to is null or m.effective_to>=coalesce(nullif(v_row->>'entry_date','')::date,current_date))
    order by
      (m.branch_code is not null) desc,
      m.effective_from desc,
      m.created_at desc
    limit 1;

    if not found then
      v_needs_review := v_needs_review+1;
      continue;
    end if;

    select id into v_debit_account from public.be_chart_of_accounts
    where account_code=v_mapping.debit_account_code and is_active and is_postable;
    select id into v_credit_account from public.be_chart_of_accounts
    where account_code=v_mapping.credit_account_code and is_active and is_postable;

    if v_debit_account is null or v_credit_account is null then
      v_needs_review := v_needs_review+1;
      continue;
    end if;

    v_fingerprint := md5(jsonb_build_object(
      'source_id',v_row->>'id',
      'event_type',v_event_type,
      'amount',v_amount,
      'branch_code',v_row->>'branch_code',
      'category',v_row->>'category',
      'mapping_id',v_mapping.id,
      'mapping_version',v_mapping.mapping_version
    )::text);

    v_upsert := public.be_accounting_upsert_event_v1(
      'BRANCH_FINANCE','branch_office_finance_entries',v_row->>'id',
      v_event_type,v_mapping.mapping_version,
      (v_row->>'entry_date')::date,
      coalesce(v_row->>'notes',v_event_type),'MMK',v_amount,
      coalesce(v_row,'{}'::jsonb)||jsonb_build_object('source_reference',v_row->>'id'),
      v_fingerprint,'REVIEW_PENDING',
      nullif(v_row->>'created_at','')::timestamptz,
      jsonb_build_object(
        'adapter','be_accounting_sync_branch_finance_v1',
        'mapping_id',v_mapping.id
      )
    );

    if coalesce((v_upsert->>'ok')::boolean,false)
       and coalesce(v_upsert->>'code','')<>'SOURCE_CHANGED_AFTER_POSTING' then
      v_event_id := (v_upsert->>'event_id')::uuid;
      delete from public.be_accounting_event_lines where event_id=v_event_id;
      insert into public.be_accounting_event_lines(
        event_id,account_id,sequence_no,debit_amount,credit_amount,
        branch_code,description,metadata
      ) values
        (
          v_event_id,v_debit_account,10,v_amount,0,v_row->>'branch_code',
          coalesce(v_row->>'notes',v_event_type),
          jsonb_build_object('mapping_id',v_mapping.id,'account_code',v_mapping.debit_account_code)
        ),
        (
          v_event_id,v_credit_account,20,0,v_amount,v_row->>'branch_code',
          'Branch finance offset',
          jsonb_build_object('mapping_id',v_mapping.id,'account_code',v_mapping.credit_account_code)
        );
      v_synced := v_synced+1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,'code','BRANCH_FINANCE_SYNC_COMPLETE',
    'scanned',v_scanned,'synced',v_synced,'needs_review',v_needs_review
  );
end;
$$;



revoke all on function public.be_accounting_sync_branch_finance_v1(date,date)
from public,anon,authenticated;
grant execute on function public.be_accounting_sync_branch_finance_v1(date,date) to service_role;

commit;
