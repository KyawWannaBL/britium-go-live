begin;

create or replace function public.be_accounting_close_period_v1(
  p_period_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_period public.be_accounting_periods%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_blockers integer;
  v_unbalanced integer;
  v_snapshot jsonb;
begin
  if not public.be_accounting_can_v1('ledger_admin') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    return jsonb_build_object('ok',false,'code','REASON_REQUIRED');
  end if;

  select *
  into v_period
  from public.be_accounting_periods
  where id=p_period_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok',false,
      'code','PERIOD_NOT_FOUND',
      'period_id',p_period_id
    );
  end if;

  if v_period.status='CLOSED' then
    select jsonb_build_object(
      'ok',true,
      'code','ALREADY_CLOSED',
      'period_id',v_period.id,
      'period_code',v_period.period_code,
      'snapshot_id',s.id,
      'content_hash',s.content_hash
    )
    into v_snapshot
    from public.be_financial_report_snapshots s
    where s.accounting_period_id=v_period.id
      and s.report_type='MONTHLY_STATEMENTS'
      and s.report_version='V1'
    limit 1;

    return coalesce(
      v_snapshot,
      jsonb_build_object(
        'ok',true,
        'code','ALREADY_CLOSED',
        'period_id',v_period.id,
        'period_code',v_period.period_code
      )
    );
  end if;

  select count(*)::integer
  into v_blockers
  from public.be_accounting_events
  where event_date between v_period.period_start and v_period.period_end
    and review_status in (
      'DRAFT',
      'REVIEW_PENDING',
      'APPROVED',
      'NEEDS_REVIEW',
      'HELD',
      'SYNC_FAILED'
    );

  select count(*)::integer
  into v_unbalanced
  from (
    select j.id
    from public.be_journal_entries j
    left join public.be_journal_lines l on l.journal_id=j.id
    where j.accounting_period_id=v_period.id
      and j.status='POSTED'
    group by j.id
    having coalesce(sum(l.debit_amount),0)<=0
       or coalesce(sum(l.credit_amount),0)<=0
       or coalesce(sum(l.debit_amount),0)<>coalesce(sum(l.credit_amount),0)
  ) q;

  if v_blockers>0 or v_unbalanced>0 then
    return jsonb_build_object(
      'ok',false,
      'code','CLOSE_BLOCKED',
      'period_id',v_period.id,
      'unresolved_event_count',v_blockers,
      'unbalanced_journal_count',v_unbalanced
    );
  end if;

  v_before := to_jsonb(v_period);

  update public.be_accounting_periods
  set status='CLOSED',
      closed_by=auth.uid(),
      closed_at=now(),
      close_reason=btrim(p_reason),
      updated_at=now()
  where id=v_period.id;

  select to_jsonb(p)
  into v_after
  from public.be_accounting_periods p
  where id=v_period.id;

  perform public.be_accounting_write_audit_v1(
    'be_accounting_periods',
    v_period.id,
    'CLOSE_PERIOD',
    v_before,
    v_after,
    btrim(p_reason),
    null,
    jsonb_build_object('function','be_accounting_close_period_v1')
  );

  v_snapshot := public.be_accounting_period_snapshot_v1(v_period.id);

  if not coalesce((v_snapshot->>'ok')::boolean,false) then
    raise exception using
      errcode='P0001',
      message='PERIOD_SNAPSHOT_FAILED',
      detail=v_snapshot::text;
  end if;

  return jsonb_build_object(
    'ok',true,
    'code','CLOSED',
    'period_id',v_period.id,
    'period_code',v_period.period_code,
    'closed_at',v_after->>'closed_at',
    'snapshot_id',v_snapshot->>'snapshot_id',
    'content_hash',v_snapshot->>'content_hash'
  );
end;
$$;

revoke all on function public.be_accounting_close_period_v1(uuid,text)
from public,anon;
grant execute on function public.be_accounting_close_period_v1(uuid,text)
to authenticated,service_role;

comment on function public.be_accounting_close_period_v1(uuid,text) is
  'Closes a reconciled accounting period and atomically creates its immutable financial statement snapshot.';

commit;
