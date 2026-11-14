-- Protect merchant payment records if their settlement batch contains a parcel awaiting reconciliation.
create or replace function public.be_guard_batch_payment_reconciliation_v1()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if exists (
   select 1 from public.be_finance_settlement_batch_items_v3 i
   join public.be_wayplan_cod_settlements w on w.delivery_way_id=i.delivery_way_id
   where i.batch_id=new.batch_id
     and coalesce(i.active,true)
     and w.metadata->>'reconciliation_review_state' in ('REVIEW_HOLD','FINANCE_REVIEW_QUEUE')
 ) then
   raise exception 'RECONCILIATION_REVIEW_REQUIRED: payment batch contains a parcel awaiting reconciliation'
     using errcode='23514';
 end if;
 return new;
end $$;
drop trigger if exists be_guard_batch_payment_reconciliation_v1 on public.be_finance_settlement_payments_v3;
create trigger be_guard_batch_payment_reconciliation_v1
before insert or update on public.be_finance_settlement_payments_v3
for each row execute function public.be_guard_batch_payment_reconciliation_v1();
