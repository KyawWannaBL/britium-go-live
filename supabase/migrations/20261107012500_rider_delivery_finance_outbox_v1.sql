-- Rider delivery timeout isolation (2026-11-07).
-- The rider's committed delivery must not be rolled back by global Finance
-- reconciliation. Queue the existing downstream Finance, Accounting and
-- wallet operations for a bounded, auditable pg_cron worker.
-- No existing cash receipts, COD amounts or settlements are rewritten here.

create table if not exists public.be_delivery_finance_outbox_v1 (
  delivery_way_id text primary key,
  wayplan_id text not null,
  business_date date not null,
  status text not null default 'PENDING'
    check (status in ('PENDING','COMPLETE','FAILED')),
  attempts integer not null default 0,
  queued_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
alter table public.be_delivery_finance_outbox_v1 enable row level security;
revoke all on public.be_delivery_finance_outbox_v1 from public, anon, authenticated;
create index if not exists be_delivery_finance_outbox_v1_pending_idx
  on public.be_delivery_finance_outbox_v1(next_attempt_at, queued_at)
  where status = 'PENDING';

create or replace function public.be_delivery_finance_outbox_enqueue_v1(
  p_way_id text, p_wayplan_id text, p_delivered_at timestamptz
) returns void language plpgsql security definer
set search_path to 'public','pg_temp' as $enqueue$
declare
  v_way text := upper(btrim(coalesce(p_way_id,'')));
  v_plan text := btrim(coalesce(p_wayplan_id,''));
begin
  if v_way='' or v_plan='' then return; end if;
  insert into public.be_delivery_finance_outbox_v1
    (delivery_way_id,wayplan_id,business_date,status,queued_at,updated_at)
  values
    (v_way,v_plan,coalesce(p_delivered_at,now())::date,'PENDING',now(),now())
  on conflict(delivery_way_id) do update
  set wayplan_id=excluded.wayplan_id,
      business_date=excluded.business_date,
      queued_at=now(),next_attempt_at=now(),status='PENDING',
      attempts=0,last_error=null,processed_at=null,updated_at=now()
  where public.be_delivery_finance_outbox_v1.status <> 'PENDING'
     or public.be_delivery_finance_outbox_v1.wayplan_id is distinct from excluded.wayplan_id
     or public.be_delivery_finance_outbox_v1.business_date is distinct from excluded.business_date;
end;
$enqueue$;
revoke all on function public.be_delivery_finance_outbox_enqueue_v1(text,text,timestamptz)
 from public, anon, authenticated;

-- Existing route-stop trigger: only enqueue. Previously performed synchronous
-- wayplan Finance UPSERT, which cancelled the rider confirmation at 19:01 UTC.
create or replace function public.be_finance_cod_stop_sync_trigger_v48()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp' as $stop$
begin
  if upper(coalesce(new.stop_status,''))='DELIVERED'
     and (
       tg_op='INSERT'
       or old.stop_status is distinct from new.stop_status
       or old.result_payload is distinct from new.result_payload
     )
  then
    perform public.be_delivery_finance_outbox_enqueue_v1(
      new.delivery_way_id,new.wayplan_id,coalesce(new.result_at,new.updated_at,now())
    );
  end if;
  return new;
end;
$stop$;

-- Dispatch-stop trigger: preserve a durable reconciliation request instead
-- of executing all-wayplan COD + day-wide Accounting + full Wallet refresh
-- before returning to the Rider App.
create or replace function public.be_sync_delivered_financial_pipeline_v189()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp' as $dispatch$
declare
  v_status text := upper(coalesce(new.stop_status,new.rider_status,new.dispatch_status,''));
  v_old_status text := case when tg_op='UPDATE'
    then upper(coalesce(old.stop_status,old.rider_status,old.dispatch_status,'')) else '' end;
begin
  if v_status not in ('DELIVERED','COMPLETED') then return new; end if;
  if tg_op='INSERT' or v_old_status not in ('DELIVERED','COMPLETED')
     or old.cod_collected is distinct from new.cod_collected
     or old.proof_url is distinct from new.proof_url
     or old.rider_proof_url is distinct from new.rider_proof_url
  then
    perform public.be_delivery_finance_outbox_enqueue_v1(
      new.delivery_way_id,new.wayplan_id,coalesce(new.delivered_at,new.updated_at,now())
    );
  end if;
  return new;
end;
$dispatch$;

-- Worker runs only from a trusted database scheduler/session. Avoid granting
-- authenticated riders any ability to invoke full-wallet reconciliation.
create or replace function public.be_delivery_finance_outbox_process_v1()
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp'
set statement_timeout to '90s'
set lock_timeout to '3s'
as $worker$
declare
  v_job record;
  v_done integer := 0;
  v_failed integer := 0;
  v_error text;
begin
  if auth.uid() is not null or session_user <> 'postgres' then
    raise exception 'DATABASE_SCHEDULER_ONLY' using errcode='42501';
  end if;
  for v_job in
    select delivery_way_id,wayplan_id,business_date,attempts
    from public.be_delivery_finance_outbox_v1
    where status='PENDING' and next_attempt_at<=now()
    order by next_attempt_at,queued_at
    for update skip locked limit 1
  loop
    begin
      perform public.be_finance_cod_sync_v48(v_job.wayplan_id);
      perform public.be_accounting_sync_cod_v1(v_job.business_date,v_job.business_date);
      perform public.be_refresh_party_wallets_v1();
      update public.be_delivery_finance_outbox_v1
      set status='COMPLETE',attempts=attempts+1,processed_at=now(),
          last_error=null,updated_at=now()
      where delivery_way_id=v_job.delivery_way_id;
      v_done:=v_done+1;
    exception
      when others then
        v_error:=left(sqlerrm,900);
        update public.be_delivery_finance_outbox_v1
        set attempts=attempts+1,
            status=case when attempts+1>=3 then 'FAILED' else 'PENDING' end,
            next_attempt_at=now()+make_interval(mins=>case attempts when 0 then 2 when 1 then 10 else 30 end),
            last_error=v_error,updated_at=now()
        where delivery_way_id=v_job.delivery_way_id;
        v_failed:=v_failed+1;
    end;
  end loop;
  return jsonb_build_object('processed',v_done,'failed_attempts',v_failed);
end;
$worker$;
revoke all on function public.be_delivery_finance_outbox_process_v1()
 from public,anon,authenticated;

-- pg_cron exists in Production. Schedule one isolated job per minute,
-- preventing the previous global reconciliation from blocking field staff.
select cron.schedule(
  'be-delivery-finance-outbox-v1',
  '* * * * *',
  'select public.be_delivery_finance_outbox_process_v1();'
);
