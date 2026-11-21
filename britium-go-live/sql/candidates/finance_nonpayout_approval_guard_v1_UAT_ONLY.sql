-- Britium Express Finance V3: non-payout batch approval guard
-- UAT CANDIDATE ONLY. Do not run on production without an approved change review.
-- Protects direct authenticated RPC calls, as well as frontend actions.
-- No existing batch rows or payment/accounting values are changed by this migration.
create or replace function public.be_finance_nonpayout_status_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $guard$
begin
  if (new.batch_net_payable <= 0 or new.outstanding_amount < 0)
     and (
       upper(coalesce(new.status, '')) in ('PENDING_APPROVAL','APPROVED','PARTIALLY_PAID','PAID')
       or upper(coalesce(new.payment_status, '')) in ('PARTIALLY_PAID','PAID')
       or new.paid_amount > 0
     )
  then
    raise exception using
      errcode = '23514',
      message = 'Non-payout merchant receivable or invalid settlement balance cannot be approved or recorded as paid',
      detail = 'Return the batch for Finance correction or use a separately approved receivable workflow.';
  end if;
  return new;
end;
$guard$;

-- The trigger function is only for the database trigger, not direct API access.
revoke all on function public.be_finance_nonpayout_status_guard_v1()
  from public, anon, authenticated;

create or replace trigger be_finance_nonpayout_status_guard_v1
before insert or update of status, payment_status, batch_net_payable, outstanding_amount, paid_amount
on public.be_finance_settlement_batches_v3
for each row
execute function public.be_finance_nonpayout_status_guard_v1();
