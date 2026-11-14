create or replace function public.be_guard_reconciliation_settlement_v1()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_review text;
begin
  v_review := coalesce(new.metadata->>'reconciliation_review_state',old.metadata->>'reconciliation_review_state','');
  if v_review in ('REVIEW_HOLD','FINANCE_REVIEW_QUEUE') then
    if (upper(coalesce(new.settlement_status,'')) = 'SETTLED' and upper(coalesce(old.settlement_status,'')) is distinct from 'SETTLED')
       or (new.settled_at is not null and old.settled_at is null) then
      raise exception 'RECONCILIATION_REVIEW_REQUIRED: % (%). Verify and clear review through an authorized audited workflow before settlement.',new.delivery_way_id,v_review using errcode='23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists be_guard_reconciliation_settlement_v1 on public.be_wayplan_cod_settlements;
create trigger be_guard_reconciliation_settlement_v1
before update on public.be_wayplan_cod_settlements
for each row execute function public.be_guard_reconciliation_settlement_v1();