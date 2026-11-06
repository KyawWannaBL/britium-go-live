-- Correct future delivery Finance reconciliation dates to the Myanmar business calendar.
-- Do not rewrite historical, completed settlement rows.
create or replace function public.be_delivery_finance_outbox_enqueue_v1(
  p_way_id text, p_wayplan_id text, p_delivered_at timestamptz
) returns void language plpgsql security definer
set search_path to 'public','pg_temp' as $enqueue$
declare
  v_way text := upper(btrim(coalesce(p_way_id,'')));
  v_plan text := btrim(coalesce(p_wayplan_id,''));
  v_business_date date := (coalesce(p_delivered_at,now()) at time zone 'Asia/Yangon')::date;
begin
  if v_way='' or v_plan='' then return; end if;
  insert into public.be_delivery_finance_outbox_v1
    (delivery_way_id,wayplan_id,business_date,status,queued_at,updated_at)
  values
    (v_way,v_plan,v_business_date,'PENDING',now(),now())
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
from public,anon,authenticated;
