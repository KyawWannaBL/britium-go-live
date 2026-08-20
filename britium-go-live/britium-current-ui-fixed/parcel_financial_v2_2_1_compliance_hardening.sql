-- PARCEL_FINANCIAL_V2_2_1_COMPLIANCE_HARDENING_2026-07-31
--
-- Corrects two compliance risks:
--   1. Data Entry must not pre-fill actual_collect with the expected COD amount.
--      actual_collect is an execution/finance outcome and must remain separate.
--   2. Sensitive financial RPCs must not retain default PUBLIC/anon execution.
--
-- Also ensures the canonical parcel table has the three fields that are absent
-- from the pasted template header but required by the specification.
--
-- This patch does not delete rows and does not recalculate historical parcels.

begin;

alter table public.parcels
  add column if not exists merchant_settlement_adjustment bigint,
  add column if not exists calculation_version text not null default 'PARCEL_FINANCIAL_V2',
  add column if not exists calculated_at timestamptz;

do $patch$
declare
  v_oid oid;
  v_definition text;
  v_old text := $old$    actual_collect = (v_quote->>'cod_amount')::bigint,
$old$;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'be_data_entry_save_financial_row_v2'
    and pg_get_function_identity_arguments(p.oid) = 'p_pickup_id text, p_parcel_sequence integer, p_delivery_way_id text, p_merchant_id text, p_payload jsonb'
  limit 1;

  if v_oid is null then
    raise exception 'be_data_entry_save_financial_row_v2(text,integer,text,text,jsonb) is missing';
  end if;

  v_definition := pg_get_functiondef(v_oid);

  if position(v_old in v_definition) > 0 then
    v_definition := replace(v_definition, v_old, '');
    execute v_definition;
  elsif position('actual_collect = (v_quote->>''cod_amount'')::bigint' in v_definition) > 0 then
    raise exception 'Unexpected actual_collect assignment formatting. Inspect the installed function before patching.';
  end if;
end
$patch$;

revoke all on function public.be_data_entry_financial_quote_v2(
  text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric
) from public;

revoke all on function public.be_data_entry_save_financial_row_v2(
  text,integer,text,text,jsonb
) from public;

revoke all on function public.be_data_entry_apply_financial_to_parcel_v2(
  text,uuid,text
) from public;

revoke all on function public.be_finance_settle_batch_v2(
  text[],uuid,uuid
) from public;

revoke all on function public.be_finance_settlement_dashboard_v2()
from public;

do $roles$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.be_data_entry_financial_quote_v2(text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric) from anon';
    execute 'revoke all on function public.be_data_entry_save_financial_row_v2(text,integer,text,text,jsonb) from anon';
    execute 'revoke all on function public.be_data_entry_apply_financial_to_parcel_v2(text,uuid,text) from anon';
    execute 'revoke all on function public.be_finance_settle_batch_v2(text[],uuid,uuid) from anon';
    execute 'revoke all on function public.be_finance_settlement_dashboard_v2() from anon';
  end if;
end
$roles$;

grant execute on function public.be_data_entry_financial_quote_v2(
  text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric
) to authenticated;

grant execute on function public.be_data_entry_save_financial_row_v2(
  text,integer,text,text,jsonb
) to authenticated;

grant execute on function public.be_data_entry_apply_financial_to_parcel_v2(
  text,uuid,text
) to authenticated;

grant execute on function public.be_finance_settle_batch_v2(
  text[],uuid,uuid
) to authenticated;

grant execute on function public.be_finance_settlement_dashboard_v2()
to authenticated;

commit;

with required_columns(column_name) as (
  values
    ('delivery_charges'),
    ('cod_amount'),
    ('customer_tier'),
    ('monthly_ways'),
    ('amount_entry_type'),
    ('merchant_stated_total_amount'),
    ('additional_customer_charge'),
    ('cbm_surcharge'),
    ('other_surcharge'),
    ('merchant_payable_charges'),
    ('other_merchant_credits'),
    ('tariff_zone'),
    ('tariff_zone_code'),
    ('base_tariff'),
    ('included_kg'),
    ('extra_per_kg'),
    ('commitment_min_ways'),
    ('commitment_refund_per_way'),
    ('chargeable_weight_kg'),
    ('extra_kg'),
    ('weight_surcharge'),
    ('gross_system_delivery_charge'),
    ('commitment_refund'),
    ('net_system_delivery_charge'),
    ('effective_declared_delivery_charge'),
    ('delivery_difference'),
    ('settlement_direction'),
    ('merchant_settlement_adjustment'),
    ('merchant_final_settlement_amount'),
    ('validation_status'),
    ('validation_message'),
    ('calculation_version'),
    ('calculated_at')
),
column_audit as (
  select
    r.column_name,
    (c.column_name is not null) as present
  from required_columns r
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = 'parcels'
   and c.column_name = r.column_name
),
function_acl as (
  select
    p.proname,
    has_function_privilege('public', p.oid, 'EXECUTE') as public_can_execute,
    case
      when exists (select 1 from pg_roles where rolname = 'anon')
      then has_function_privilege('anon', p.oid, 'EXECUTE')
      else false
    end as anon_can_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'be_data_entry_financial_quote_v2',
      'be_data_entry_save_financial_row_v2',
      'be_data_entry_apply_financial_to_parcel_v2',
      'be_finance_settle_batch_v2',
      'be_finance_settlement_dashboard_v2'
    )
)
select jsonb_build_object(
  'build', 'PARCEL_FINANCIAL_V2_2_1_COMPLIANCE_HARDENING_2026-07-31',
  'required_parcel_columns', (select count(*) from column_audit),
  'missing_parcel_columns',
    coalesce((select jsonb_agg(column_name order by column_name)
              from column_audit where not present), '[]'::jsonb),
  'tariff_rows', (select count(*) from public.be_parcel_tariffs_v2),
  'public_execute_findings',
    coalesce((select jsonb_agg(proname order by proname)
              from function_acl where public_can_execute), '[]'::jsonb),
  'anon_execute_findings',
    coalesce((select jsonb_agg(proname order by proname)
              from function_acl where anon_can_execute), '[]'::jsonb),
  'data_entry_actual_collect_is_not_prefilled',
    position(
      'actual_collect = (v_quote->>''cod_amount'')::bigint'
      in pg_get_functiondef(
        'public.be_data_entry_save_financial_row_v2(text,integer,text,text,jsonb)'::regprocedure
      )
    ) = 0,
  'deletes_rows', false
) as parcel_financial_v2_2_1_compliance;
