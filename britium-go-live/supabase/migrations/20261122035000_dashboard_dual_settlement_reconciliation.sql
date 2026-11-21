-- Read-only dashboard reconciliation of two different finance lifecycles.
-- Do not infer merchant payment completion from wayplan COD collection settlement.
create or replace function public.be_dashboard_settlement_reconciliation_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text := lower(replace(coalesce(public.be_current_role(), ''), '-', '_'));
  v_cod jsonb;
  v_merchant jsonb;
  v_mismatch integer;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if v_role not in ('superadmin','super_admin','admin','management','director',
    'finance','finance_user','accountant') then
    raise exception 'FINANCE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'settled', count(*) filter (where upper(coalesce(settlement_status,'')) = 'SETTLED'),
    'pending', count(*) filter (where upper(coalesce(settlement_status,'')) = 'PENDING_SETTLEMENT'),
    'other', count(*) filter (where upper(coalesce(settlement_status,'')) not in ('SETTLED','PENDING_SETTLEMENT'))
  ) into v_cod from public.be_wayplan_cod_settlements;

  select jsonb_build_object(
    'total', count(*),
    'waiting_delivery', count(*) filter (where upper(coalesce(settlement_state,'')) = 'WAITING_DELIVERY'),
    'waiting_cod_remittance', count(*) filter (where upper(coalesce(settlement_state,'')) = 'WAITING_COD_REMITTANCE'),
    'ready_to_settle', count(*) filter (where upper(coalesce(settlement_state,'')) = 'READY_TO_SETTLE'),
    'settled', count(*) filter (where upper(coalesce(settlement_state,'')) = 'SETTLED'),
    'other', count(*) filter (where upper(coalesce(settlement_state,'')) not in ('WAITING_DELIVERY','WAITING_COD_REMITTANCE','READY_TO_SETTLE','SETTLED'))
  ) into v_merchant from public.be_v_finance_merchant_settlement_queue_v2;

  select count(distinct upper(btrim(c.delivery_way_id)))
  into v_mismatch
  from public.be_wayplan_cod_settlements c
  join public.be_v_finance_merchant_settlement_queue_v2 m
    on upper(btrim(c.delivery_way_id)) = upper(btrim(m.delivery_way_id))
  where nullif(btrim(c.delivery_way_id),'') is not null
    and upper(coalesce(c.settlement_status,'')) = 'SETTLED'
    and upper(coalesce(m.settlement_state,'')) = 'WAITING_COD_REMITTANCE';

  return jsonb_build_object(
    'ok', true,
    'source_cod', 'be_wayplan_cod_settlements',
    'source_merchant', 'be_v_finance_merchant_settlement_queue_v2',
    'scope', 'enterprise_finance',
    'as_of', now(),
    'cod', v_cod,
    'merchant', v_merchant,
    'cod_settled_waiting_merchant_remittance', v_mismatch
  );
end;
$function$;

revoke all on function public.be_dashboard_settlement_reconciliation_v1() from public, anon;
grant execute on function public.be_dashboard_settlement_reconciliation_v1() to authenticated;
