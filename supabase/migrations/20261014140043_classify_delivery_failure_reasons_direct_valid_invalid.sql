alter table public.be_delivery_failure_reasons add column if not exists failure_category text not null default 'INVALID_REASON';
alter table public.be_delivery_failure_reasons drop constraint if exists be_delivery_failure_reasons_failure_category_check;
alter table public.be_delivery_failure_reasons add constraint be_delivery_failure_reasons_failure_category_check check (failure_category in ('DIRECT_RTO','VALID_REASON','INVALID_REASON'));
update public.be_delivery_failure_reasons set failure_category=case
 when reason_code in ('CUSTOMER_REFUSED','CUSTOMER_REJECTED','WRONG_ITEM') then 'DIRECT_RTO'
 when reason_code in ('PHONE_OFF','PHONE_OUT_OF_COVERAGE','NO_ANSWER','ADDRESS_NOT_FOUND','WRONG_PHONE') then 'VALID_REASON'
 else 'INVALID_REASON' end;
comment on column public.be_delivery_failure_reasons.failure_category is 'Reason grouping only. Direct RTO requires proof and server-side approval workflow; INVALID_REASON must not increment valid count.';