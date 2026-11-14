-- Finance COD performance: preserve settlement guards and downstream sync,
-- remove redundant second global wallet refresh.
-- Source: live public.be_sync_finance_cod_settled_downstream_v192() on 2026-11-05.
-- Does not update financial balances or settle any way ID during installation.
BEGIN;
CREATE OR REPLACE FUNCTION public.be_sync_finance_cod_settled_downstream_v192()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_way text := upper(btrim(coalesce(new.delivery_way_id,'')));
  v_merchant text;
  v_merchant_name text;
  v_amount numeric := 0;
  v_provider text;
  v_wallet_id uuid;
  v_result jsonb;
begin
  if upper(coalesce(new.settlement_status,'')) <> 'SETTLED' then
    return new;
  end if;

  -- Reconciliation updates unchanged settled rows; do not recursively re-run downstream sync.
  if TG_OP='UPDATE' and OLD.settlement_status is not distinct from NEW.settlement_status
    and OLD.settled_amount is not distinct from NEW.settled_amount
    and OLD.expected_cod is not distinct from NEW.expected_cod
    and OLD.reported_collected is not distinct from NEW.reported_collected
    and OLD.settlement_reference is not distinct from NEW.settlement_reference
    and OLD.settled_at is not distinct from NEW.settled_at then return NEW; end if;
  -- Keep live Data Entry record aligned with authoritative Finance V48 settlement.
  update public.be_data_entry_parcel_details d
  set finance_status='COD_SETTLED',updated_at=now()
  where upper(d.delivery_way_id)=v_way and upper(d.parcel_status) in ('DELIVERED','COMPLETED')
    and d.finance_status is distinct from 'COD_SETTLED';

  -- Refresh wallet account masters/provider positions first.
  v_result := public.be_refresh_party_wallets_v1();

  select
    d.merchant_id,
    coalesce(p.merchant_name,d.merchant_id),
    coalesce(d.merchant_final_settlement_amount,0)::numeric,
    nullif(d.financial_quote->>'service_provider_code','')
  into
    v_merchant,v_merchant_name,v_amount,v_provider
  from public.be_data_entry_parcel_details d
  left join public.be_portal_pickup_requests p on p.pickup_id=d.pickup_id
  where upper(d.delivery_way_id)=v_way
  order by d.updated_at desc nulls last,d.saved_at desc nulls last
  limit 1;

  -- The canonical queue/batch ledger owns merchant balances; retire the duplicate legacy entry.
  update public.be_party_wallet_ledger set amount=0,status='VOID',updated_at=now()
  where source_type='MERCHANT_SETTLEMENT_LIVE' and upper(source_key)=v_way;

  -- Provider payable also becomes ready for payout, never auto-paid.
  update public.be_party_wallet_ledger l
  set status='READY_FOR_PAYOUT',
      metadata=coalesce(l.metadata,'{}'::jsonb)||jsonb_build_object(
        'cod_finance_settled',true,
        'cod_settlement_reference',new.settlement_reference,
        'cod_settled_at',new.settled_at,
        'policy_version','FINANCE_DOWNSTREAM_V192'
      ),
      updated_at=now()
  where l.source_type='SERVICE_PROVIDER_PAYABLE'
    and upper(l.source_key)=v_way;

  -- Keep reporting/notifications/CS synchronized after Finance confirmation.
  perform public.be_accounting_sync_cod_v1(
    coalesce(new.settled_at,new.updated_at,now())::date,
    coalesce(new.settled_at,new.updated_at,now())::date
  );
  -- Finance settlement synchronizes only the settled Way ID.
  -- Broad wayplan updates re-enter the historical write guard for unrelated
  -- records and have timed out, rolling back otherwise valid COD confirmation.
  perform public.be_cs_closure_sync_one_v1(new.delivery_way_id);

  -- Wallets were refreshed above before the scoped READY_FOR_PAYOUT update.
  -- Avoid the duplicate full-wallet rebuild: it resets the provider status
  -- to PENDING and causes a redundant second update.

  update public.be_app_notifications
  set status='RESOLVED',
      is_read=true,
      read_at=coalesce(read_at,now()),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'finance_cod_settled',true,
        'finance_cod_settlement_reference',new.settlement_reference,
        'resolved_at',now()
      )
  where upper(coalesce(metadata->>'delivery_way_id',entity_id,source_key,''))=v_way
    and upper(coalesce(notification_type,event_type,'')) in ('COD_HANDOVER','COD_SETTLEMENT_REQUIRED');

  return new;
exception
  when others then
    update public.be_finance_cod_settlements_v48
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'downstream_sync_ok',false,
      'downstream_sync_error',sqlerrm,
      'downstream_sync_failed_at',now(),
      'downstream_sync_build','FINANCE_DOWNSTREAM_V192'
    )
    where delivery_way_id=new.delivery_way_id;
    return new;
end;
$function$
;
COMMIT;
