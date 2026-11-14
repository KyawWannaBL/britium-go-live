-- Delivered -> Finance/Accounting/Wallet automatic pipeline v189.
-- Runs after existing delivery staging/commission triggers so a completed delivery
-- is promoted immediately into Finance V48, accounting COD events and party wallets.

create or replace function public.be_sync_delivered_financial_pipeline_v189()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_status text := upper(coalesce(new.stop_status,new.rider_status,new.dispatch_status,''));
  v_business_date date := coalesce(new.delivered_at,new.updated_at,now())::date;
  v_finance jsonb;
  v_accounting jsonb;
  v_wallets jsonb;
begin
  if v_status not in ('DELIVERED','COMPLETED') then
    return new;
  end if;

  v_finance := public.be_finance_cod_sync_v48(new.wayplan_id);
  v_accounting := public.be_accounting_sync_cod_v1(v_business_date,v_business_date);
  v_wallets := public.be_refresh_party_wallets_v1();

  update public.be_wayplan_dispatch_stops
  set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
        'financial_pipeline_synced',true,
        'financial_pipeline_synced_at',now(),
        'financial_pipeline_build','DELIVERED_FINANCIAL_PIPELINE_V189',
        'finance_sync',v_finance,
        'accounting_sync',v_accounting,
        'wallet_sync',v_wallets
      )
  where id=new.id
    and coalesce((metadata->>'financial_pipeline_synced')::boolean,false)=false;

  return new;
exception
  when others then
    update public.be_wayplan_dispatch_stops
    set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'financial_pipeline_synced',false,
          'financial_pipeline_error',sqlerrm,
          'financial_pipeline_failed_at',now(),
          'financial_pipeline_build','DELIVERED_FINANCIAL_PIPELINE_V189'
        )
    where id=new.id;
    return new;
end;
$function$;

drop trigger if exists zz_trg_be_sync_delivered_financial_pipeline_v189
  on public.be_wayplan_dispatch_stops;

create trigger zz_trg_be_sync_delivered_financial_pipeline_v189
after insert or update of stop_status,rider_status,dispatch_status,cod_collected,proof_url,rider_proof_url,receiver_name,receiver_phone,delivered_at
on public.be_wayplan_dispatch_stops
for each row
execute function public.be_sync_delivered_financial_pipeline_v189();

revoke execute on function public.be_sync_delivered_financial_pipeline_v189() from public;
revoke execute on function public.be_sync_delivered_financial_pipeline_v189() from anon;
revoke execute on function public.be_sync_delivered_financial_pipeline_v189() from authenticated;
