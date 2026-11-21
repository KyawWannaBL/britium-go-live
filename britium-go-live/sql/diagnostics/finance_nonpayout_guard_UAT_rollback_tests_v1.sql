-- UAT test for finance_nonpayout_approval_guard_v1_UAT_ONLY.sql
-- Prerequisite: install guard candidate on isolated UAT, never on production without approval.
-- Test data and all changes in this script are rolled back.
begin;
do $tests$
declare
  v_neg uuid;
  v_pos uuid;
  v_zero uuid;
  v_rejected integer := 0;
  v_allowed integer := 0;
begin
  insert into public.be_finance_settlement_batches_v3
    (batch_number,merchant_id,status,batch_net_payable,outstanding_amount)
  values ('UAT-NONPAYOUT-NEG','UAT-TEST','UNDER_REVIEW',-4000,-4000)
  returning id into v_neg;

  begin
    update public.be_finance_settlement_batches_v3
    set status = 'PENDING_APPROVAL' where id = v_neg;
    raise exception 'Negative amount advanced to approval';
  exception when sqlstate '23514' then v_rejected := v_rejected + 1; end;

  begin
    update public.be_finance_settlement_batches_v3
    set paid_amount = 100 where id = v_neg;
    raise exception 'Negative amount accepted a payment';
  exception when sqlstate '23514' then v_rejected := v_rejected + 1; end;

  update public.be_finance_settlement_batches_v3 set status = 'REJECTED' where id = v_neg;
  v_allowed := v_allowed + 1;

  insert into public.be_finance_settlement_batches_v3
    (batch_number,merchant_id,status,batch_net_payable,outstanding_amount)
  values ('UAT-NONPAYOUT-POS','UAT-TEST','UNDER_REVIEW',10000,10000)
  returning id into v_pos;

  update public.be_finance_settlement_batches_v3
  set status='PENDING_APPROVAL' where id=v_pos;
  v_allowed := v_allowed + 1;

  update public.be_finance_settlement_batches_v3
  set status='APPROVED' where id=v_pos;
  v_allowed := v_allowed + 1;

  update public.be_finance_settlement_batches_v3
  set status='PAID',payment_status='PAID',paid_amount=10000,outstanding_amount=0
  where id=v_pos;
  v_allowed := v_allowed + 1;

  insert into public.be_finance_settlement_batches_v3
    (batch_number,merchant_id,status,batch_net_payable,outstanding_amount)
  values ('UAT-NONPAYOUT-ZERO','UAT-TEST','UNDER_REVIEW',0,0)
  returning id into v_zero;

  begin
    update public.be_finance_settlement_batches_v3
    set status='PENDING_APPROVAL' where id=v_zero;
    raise exception 'Zero amount advanced to approval';
  exception when sqlstate '23514' then v_rejected := v_rejected + 1; end;

  if v_rejected <> 3 or v_allowed <> 4 then
    raise exception 'Guard regression: blocked %, allowed %',v_rejected,v_allowed;
  end if;
  raise notice 'PASS: 3 blocked money actions, 4 allowed valid/rejection transitions';
end;
$tests$;
rollback;
-- Run a separate SELECT after rollback to verify no rows persist:
-- select count(*) from public.be_finance_settlement_batches_v3 where batch_number like 'UAT-NONPAYOUT-%';
