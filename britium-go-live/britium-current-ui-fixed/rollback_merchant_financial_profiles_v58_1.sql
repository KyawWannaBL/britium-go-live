-- BRITIUM DATA ENTRY FINANCIAL V2
-- ROLLBACK MERCHANT FINANCIAL PROFILE CONTROLLED IMPORT V58.1
-- Use only when an actual rollback is approved.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

lock table public.be_merchant_financial_profiles_v2 in share row exclusive mode;

do $v58_1_rollback$
declare
  b record;
begin
  if to_regclass('public.be_merchant_financial_profiles_v2_backup_v58_1') is null then
    raise exception 'V58.1 backup table is missing; rollback cannot proceed';
  end if;

  for b in
    select *
    from public.be_merchant_financial_profiles_v2_backup_v58_1
    where backup_build = 'MERCHANT_FINANCIAL_PROFILES_V58_1_2026_07_31'
    order by merchant_id
  loop
    if not b.row_existed then
      delete from public.be_merchant_financial_profiles_v2
      where merchant_id = b.merchant_id;
    else
      insert into public.be_merchant_financial_profiles_v2 (
        merchant_id,
        customer_tier,
        is_active,
        effective_from,
        effective_to,
        updated_at,
        updated_by,
        merchant_name,
        counterparty_type,
        settlement_method,
        settlement_account,
        settlement_notes
      ) values (
        b.row_data ->> 'merchant_id',
        b.row_data ->> 'customer_tier',
        coalesce((b.row_data ->> 'is_active')::boolean, false),
        (b.row_data ->> 'effective_from')::date,
        nullif(b.row_data ->> 'effective_to', '')::date,
        coalesce((b.row_data ->> 'updated_at')::timestamptz, now()),
        nullif(b.row_data ->> 'updated_by', '')::uuid,
        b.row_data ->> 'merchant_name',
        b.row_data ->> 'counterparty_type',
        b.row_data ->> 'settlement_method',
        b.row_data ->> 'settlement_account',
        b.row_data ->> 'settlement_notes'
      )
      on conflict (merchant_id) do update set
        customer_tier = excluded.customer_tier,
        is_active = excluded.is_active,
        effective_from = excluded.effective_from,
        effective_to = excluded.effective_to,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by,
        merchant_name = excluded.merchant_name,
        counterparty_type = excluded.counterparty_type,
        settlement_method = excluded.settlement_method,
        settlement_account = excluded.settlement_account,
        settlement_notes = excluded.settlement_notes;
    end if;
  end loop;
end
$v58_1_rollback$;

delete from public.be_audit_events
where action_code = 'MERCHANT_PROFILE_APPROVED'
  and entity_type = 'MERCHANT_FINANCIAL_PROFILE'
  and request_id like 'V58_1:MANAGEMENT-APPROVAL-2026-07-31:%';

commit;

select jsonb_pretty(jsonb_build_object(
  'ok', true,
  'build', 'MERCHANT_FINANCIAL_PROFILES_V58_1_ROLLBACK_2026_07_31',
  'message', 'V58.1 merchant profile rows were restored to their recorded pre-import state.'
));
