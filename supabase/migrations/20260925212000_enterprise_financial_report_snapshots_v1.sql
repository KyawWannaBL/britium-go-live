begin;

create or replace function public.be_guard_financial_snapshot_immutable_v1()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  raise exception using
    errcode='P0001',
    message='FINANCIAL_REPORT_SNAPSHOT_IMMUTABLE',
    detail='Closed-period financial report snapshots cannot be updated or deleted.';
end;
$$;

drop trigger if exists be_financial_report_snapshots_immutable
on public.be_financial_report_snapshots;

create trigger be_financial_report_snapshots_immutable
before update or delete on public.be_financial_report_snapshots
for each row execute function public.be_guard_financial_snapshot_immutable_v1();

create or replace function public.be_accounting_period_snapshot_v1(
  p_period_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,extensions,pg_temp
as $$
declare
  v_period public.be_accounting_periods%rowtype;
  v_existing public.be_financial_report_snapshots%rowtype;
  v_tb jsonb;
  v_pl jsonb;
  v_bs jsonb;
  v_recon jsonb;
  v_payload jsonb;
  v_hash text;
  v_snapshot_id uuid := gen_random_uuid();
begin
  if not (
    public.be_accounting_can_v1('finance_review')
    or public.be_accounting_can_v1('ledger_admin')
  ) then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  select *
  into v_period
  from public.be_accounting_periods
  where id=p_period_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'code','PERIOD_NOT_FOUND','period_id',p_period_id);
  end if;

  if v_period.status<>'CLOSED' then
    return jsonb_build_object(
      'ok',false,
      'code','PERIOD_NOT_CLOSED',
      'period_id',v_period.id,
      'period_code',v_period.period_code,
      'status',v_period.status
    );
  end if;

  select *
  into v_existing
  from public.be_financial_report_snapshots
  where accounting_period_id=v_period.id
    and report_type='MONTHLY_STATEMENTS'
    and report_version='V1'
  limit 1;

  if found then
    return jsonb_build_object(
      'ok',true,
      'code','SNAPSHOT_EXISTS',
      'snapshot_id',v_existing.id,
      'period_id',v_period.id,
      'period_code',v_period.period_code,
      'content_hash',v_existing.content_hash,
      'report_data',v_existing.report_data,
      'created_at',v_existing.created_at
    );
  end if;

  v_tb := public.be_accounting_trial_balance_v1(v_period.period_start,v_period.period_end);
  v_pl := public.be_accounting_profit_loss_v1(v_period.period_start,v_period.period_end);
  v_bs := public.be_accounting_balance_sheet_v1(v_period.period_end);
  v_recon := public.be_accounting_reconciliation_v1(v_period.period_end);

  if not coalesce((v_tb->>'ok')::boolean,false)
     or not coalesce((v_pl->>'ok')::boolean,false)
     or not coalesce((v_bs->>'ok')::boolean,false)
     or not coalesce((v_recon->>'ok')::boolean,false) then
    return jsonb_build_object(
      'ok',false,
      'code','REPORT_GENERATION_FAILED',
      'trial_balance',v_tb,
      'profit_loss',v_pl,
      'balance_sheet',v_bs,
      'reconciliation',v_recon
    );
  end if;

  if abs(coalesce((v_tb->>'difference')::numeric,0))>=0.005
     or abs(coalesce((v_bs->>'balance_difference')::numeric,0))>=0.005 then
    return jsonb_build_object(
      'ok',false,
      'code','REPORT_NOT_BALANCED',
      'trial_balance_difference',v_tb->>'difference',
      'balance_sheet_difference',v_bs->>'balance_difference'
    );
  end if;

  v_payload := jsonb_build_object(
    'company','Britium Express',
    'currency','MMK',
    'period_id',v_period.id,
    'period_code',v_period.period_code,
    'period_start',v_period.period_start,
    'period_end',v_period.period_end,
    'ledger_cutoff_at',coalesce(v_period.closed_at,now()),
    'trial_balance',v_tb,
    'profit_loss',v_pl,
    'balance_sheet',v_bs,
    'reconciliation',v_recon
  );

  v_hash := encode(
    extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),
    'hex'
  );

  insert into public.be_financial_report_snapshots(
    id,
    accounting_period_id,
    report_type,
    report_version,
    ledger_cutoff_at,
    report_data,
    content_hash,
    approved_by,
    approved_at
  ) values (
    v_snapshot_id,
    v_period.id,
    'MONTHLY_STATEMENTS',
    'V1',
    coalesce(v_period.closed_at,now()),
    v_payload,
    v_hash,
    auth.uid(),
    now()
  );

  perform public.be_accounting_write_audit_v1(
    'be_financial_report_snapshots',
    v_snapshot_id,
    'INSERT',
    null,
    jsonb_build_object(
      'accounting_period_id',v_period.id,
      'period_code',v_period.period_code,
      'content_hash',v_hash,
      'report_version','V1'
    ),
    'Closed-period financial statement snapshot created',
    null,
    jsonb_build_object('function','be_accounting_period_snapshot_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'code','SNAPSHOT_CREATED',
    'snapshot_id',v_snapshot_id,
    'period_id',v_period.id,
    'period_code',v_period.period_code,
    'content_hash',v_hash,
    'report_data',v_payload
  );
end;
$$;

revoke all on function public.be_accounting_period_snapshot_v1(uuid)
from public,anon;
grant execute on function public.be_accounting_period_snapshot_v1(uuid)
to authenticated,service_role;

comment on function public.be_accounting_period_snapshot_v1(uuid) is
  'Creates or returns the immutable V1 financial statement snapshot for a CLOSED accounting period.';

commit;
