create or replace function public.be_guard_independent_finance_reconciliation_v1()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_state text;
begin
 select metadata->>'reconciliation_review_state' into v_state
 from public.be_wayplan_cod_settlements
 where delivery_way_id=new.delivery_way_id
 and metadata->>'reconciliation_review_state' in ('REVIEW_HOLD','FINANCE_REVIEW_QUEUE') limit 1;
 if v_state is not null and (
   upper(coalesce(new.settlement_status,'')) in ('SETTLED','CLOSED','PAID','COMPLETED','CONFIRMED')
   or new.closed_at is not null
 ) then
 raise exception 'RECONCILIATION_REVIEW_REQUIRED: independent settlement blocked for % (%)',new.delivery_way_id,v_state using errcode='23514';
 end if;
 return new;
end $$;
drop trigger if exists be_guard_independent_finance_reconciliation_v1 on public.be_financial_settlements;
create trigger be_guard_independent_finance_reconciliation_v1 before insert or update on public.be_financial_settlements
for each row execute function public.be_guard_independent_finance_reconciliation_v1();