-- Workforce commission independent Finance review and payout authorization V210.
-- Migrates no existing paid/approved amounts and grants no automatic approval.
begin;

create table if not exists public.be_workforce_commission_finance_reviews_v210 (
  commission_event_id uuid primary key references public.be_commission_events(id) on delete restrict,
  decision text not null check (decision in ('APPROVED','HELD')),
  reviewed_amount_mmk numeric(18,2) not null check (reviewed_amount_mmk >= 0),
  reviewed_assignee_email text not null,
  reviewed_by_uid uuid not null,
  reviewed_by_email text not null,
  review_note text not null,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists be_workforce_commission_finance_reviews_v210_status_idx
on public.be_workforce_commission_finance_reviews_v210(decision,reviewed_at desc);

alter table public.be_workforce_commission_finance_reviews_v210 enable row level security;
revoke all on public.be_workforce_commission_finance_reviews_v210 from public,anon,authenticated;
grant all on public.be_workforce_commission_finance_reviews_v210 to service_role;

create or replace function public.be_workforce_commission_review_queue_v210(
  p_from date default current_date-60,
  p_to date default current_date
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','auth','pg_temp'
as $$
declare v_rows jsonb;
declare v_total numeric;
declare v_count integer;
declare v_holds integer;
declare v_shortfall integer;
begin
  if auth.uid() is null or not (
    public.be_accounting_can_v1('financial_reports')
    or public.be_accounting_can_v1('finance_review')
  ) then
    raise exception 'Finance report authority required' using errcode='42501';
  end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>365 then
    raise exception 'Select a valid report period of at most 366 days';
  end if;
  with detail as (
    select e.id as commission_event_id,
      e.source_key,e.pickup_id,e.work_date,e.operation_type,e.role_code,
      e.assignee_email,e.assignee_name,e.unit_count,e.rate_mmk,e.commission_mmk,
      e.event_status,coalesce(r.decision,'NOT_REVIEWED') as finance_decision,
      r.reviewed_at,r.reviewed_by_email,r.review_note,
      coalesce(pv.photos,0) as pickup_photo_count,
      coalesce(pv.verifications,0) as pickup_verification_count,
      coalesce(pv.unreviewed,0) as pickup_photo_reviews_pending,
      coalesce(ds.delivered_proof_rows,0) as delivered_proof_count,
      coalesce(p.pickup_status,'') as pickup_status,
      coalesce(wl.matched,0) as wallet_match_count,
      coalesce(wl.sum_mmk,0) as wallet_amount,
      case
        when e.event_status not in ('READY','PENDING') then 'EVENT_NOT_READY'
        when wl.matched<>1 or wl.sum_mmk<>e.commission_mmk then 'WALLET_MISMATCH'
        when e.operation_type='PICKUP' and
          (p.pickup_id is null or p.pickup_collected_at is null or
            upper(coalesce(p.pickup_status,'')) not in
              ('PICKUP_COLLECTED','DELIVERED_TO_WAREHOUSE','PICKUP_COMPLETED','COLLECTED','COMPLETED'))
          then 'PICKUP_NOT_COLLECTED'
        when e.operation_type='PICKUP' and coalesce(pv.photos,0)<e.unit_count then 'PICKUP_EVIDENCE_SHORTFALL'
        when e.operation_type='DELIVERY' and coalesce(ds.delivered_proof_rows,0)=0 then 'DELIVERY_PROOF_MISSING'
        else 'READY_FOR_FINANCE_REVIEW'
      end as evidence_status
    from public.be_commission_events e
    left join public.be_workforce_commission_finance_reviews_v210 r
      on r.commission_event_id=e.id
    left join public.be_portal_pickup_requests p
      on p.pickup_id=e.source_key and e.operation_type='PICKUP'
    left join lateral (
      select count(*) as verifications,
        count(*) filter (where coalesce(nullif(proof_photo_url,''),nullif(proof_photo_path,''),nullif(proof_photo_data,'')) is not null) as photos,
        count(*) filter (where upper(coalesce(status,'')) in ('PENDING','IN_REVIEW')) as unreviewed
      from public.be_pickup_parcel_verifications v
      where e.operation_type='PICKUP' and v.pickup_id=e.source_key
    ) pv on true
    left join lateral (
      select count(*) filter (where
        s.delivered_at is not null
        and upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')
        and coalesce(nullif(s.proof_url,''),nullif(s.rider_proof_url,''),nullif(s.receiver_signature_url,'')) is not null
      ) delivered_proof_rows
      from public.be_wayplan_dispatch_stops s
      where e.operation_type='DELIVERY' and s.delivery_way_id=e.source_key
    ) ds on true
    left join lateral (
      select count(*) matched,coalesce(sum(l.amount),0) sum_mmk
      from public.be_party_wallet_ledger l
      join public.be_party_wallet_accounts a on a.id=l.wallet_id
      where l.source_type='COMMISSION' and l.source_key=e.id::text
        and l.status='PENDING' and l.direction='BRITIUM_OWES_PARTY'
        and a.party_type=e.role_code and a.party_key=lower(e.assignee_email)
    ) wl on true
    where e.work_date between p_from and p_to
      and e.operation_type in ('PICKUP','DELIVERY')
  )
  select coalesce(jsonb_agg(to_jsonb(d) order by d.work_date desc,d.source_key,d.role_code),'[]'::jsonb),
    coalesce(sum(d.commission_mmk),0)::numeric,
    count(*)::integer,
    count(*) filter(where d.finance_decision='HELD')::integer,
    count(*) filter(where d.evidence_status<>'READY_FOR_FINANCE_REVIEW')::integer
    into v_rows,v_total,v_count,v_holds,v_shortfall from detail d;

  return jsonb_build_object(
    'ok',true,'build','WORKFORCE_FINANCE_REVIEW_V210',
    'from_date',p_from,'to_date',p_to,
    'summary',jsonb_build_object('record_count',v_count,'amount_mmk',v_total,
                                 'on_hold',v_holds,'evidence_blockers',v_shortfall),
    'rows',v_rows
  );
end;
$$;

create or replace function public.be_workforce_commission_review_decide_v210(
  p_event_ids uuid[],p_decision text,p_note text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $$
declare
  v_decision text:=upper(trim(coalesce(p_decision,'')));
  v_note text:=btrim(coalesce(p_note,''));
  v_event public.be_commission_events%rowtype;
  v_uid uuid:=auth.uid();
  v_email text:=nullif(lower(auth.jwt()->>'email'),'');
  v_verified integer;
  v_photos integer;
  v_n integer:=0;
  v_ledger_amount numeric;
  v_wallet_matches integer;
  v_pickup public.be_portal_pickup_requests%rowtype;
begin
  if v_uid is null or not public.be_accounting_can_v1('finance_review') then
    raise exception 'Finance reviewer authority required' using errcode='42501';
  end if;
  if v_email is null then raise exception 'Verified reviewer email is required'; end if;
  if v_decision not in ('APPROVE','HOLD') then raise exception 'Decision must be APPROVE or HOLD'; end if;
  if char_length(v_note)<12 then raise exception 'Provide a review note of at least 12 characters'; end if;
  if coalesce(array_length(p_event_ids,1),0) not between 1 and 50 then
    raise exception 'Select between 1 and 50 commission records';
  end if;
  if (select count(distinct x) from unnest(p_event_ids) x)
       <> array_length(p_event_ids,1) then
    raise exception 'Duplicate commission event IDs are not allowed';
  end if;
  foreach v_uid in array p_event_ids loop
    -- v_uid is reloaded immediately below from authenticated caller.
    select * into v_event from public.be_commission_events
    where id=v_uid for update;
    if not found then raise exception 'Commission record not found: %',v_uid; end if;
    if v_event.operation_type not in ('PICKUP','DELIVERY')
       or v_event.event_status not in ('PENDING','READY')
    then raise exception 'Commission % is not available for review',v_event.id; end if;

    if v_decision='APPROVE' then
      if lower(v_event.assignee_email)=v_email then
        raise exception 'A worker may not approve their own commission';
      end if;
      if v_event.commission_mmk<=0 or v_event.assignee_email is null then
        raise exception 'Commission % has invalid payee or amount',v_event.id;
      end if;

      if not exists (
        select 1 from public.be_mobile_workforce_accounts w
        where lower(w.email)=lower(v_event.assignee_email)
          and coalesce(w.active,w.is_active,true)
      ) then raise exception 'Commission % has no active workforce account',v_event.id; end if;

      select count(*),coalesce(sum(l.amount),0)
        into v_wallet_matches,v_ledger_amount
      from public.be_party_wallet_ledger l
      join public.be_party_wallet_accounts a on a.id=l.wallet_id
      where l.source_type='COMMISSION' and l.source_key=v_event.id::text
        and l.status='PENDING' and l.direction='BRITIUM_OWES_PARTY'
        and a.party_type=v_event.role_code
        and a.party_key=lower(v_event.assignee_email);
      if v_wallet_matches<>1 or v_ledger_amount<>v_event.commission_mmk then
        raise exception 'Commission % has no matching unpaid wallet liability',v_event.id;
      end if;

      if v_event.operation_type='PICKUP' then
        select * into v_pickup from public.be_portal_pickup_requests
          where pickup_id=v_event.source_key limit 1;
        if not found or v_pickup.pickup_collected_at is null or
          upper(coalesce(v_pickup.pickup_status,'')) not in
           ('PICKUP_COLLECTED','DELIVERED_TO_WAREHOUSE','PICKUP_COMPLETED','COLLECTED','COMPLETED')
        then raise exception 'Pickup % is not collected',v_event.source_key; end if;
        if lower(coalesce(case v_event.role_code
             when 'RIDER' then v_pickup.assigned_rider_email
             when 'DRIVER' then v_pickup.assigned_driver_email
             when 'HELPER' then v_pickup.assigned_helper_email end,''))<>lower(v_event.assignee_email)
        then raise exception 'Pickup % payee assignment mismatch',v_event.source_key; end if;

        select count(*) into v_photos
        from public.be_pickup_parcel_verifications pv
        where pv.pickup_id=v_event.source_key
          and coalesce(nullif(pv.proof_photo_url,''),nullif(pv.proof_photo_path,''),nullif(pv.proof_photo_data,'')) is not null;
        if v_photos<v_event.unit_count then
          raise exception 'Pickup % missing parcel photos (% vs %)',v_event.source_key,v_photos,v_event.unit_count;
        end if;
      else
        select count(*) into v_verified
        from public.be_wayplan_dispatch_stops s
        where s.delivery_way_id=v_event.source_key
          and s.delivered_at is not null
          and upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')
          and coalesce(nullif(s.proof_url,''),nullif(s.rider_proof_url,''),nullif(s.receiver_signature_url,'')) is not null;
        if v_verified=0 then raise exception 'Delivery % lacks delivery proof',v_event.source_key; end if;
      end if;
    end if;

    insert into public.be_workforce_commission_finance_reviews_v210(
      commission_event_id,decision,reviewed_amount_mmk,reviewed_assignee_email,
      reviewed_by_uid,reviewed_by_email,review_note,evidence_snapshot,reviewed_at,updated_at
    ) values (
      v_event.id,case when v_decision='APPROVE' then 'APPROVED' else 'HELD' end,
      v_event.commission_mmk,lower(v_event.assignee_email),
      auth.uid(),v_email,v_note,
      jsonb_build_object('operation_type',v_event.operation_type,
        'source_key',v_event.source_key,'work_date',v_event.work_date,
        'rate_mmk',v_event.rate_mmk,'unit_count',v_event.unit_count,
        'photo_count',v_photos,'delivery_proof_count',v_verified,
        'policy','WORKFORCE_FINANCE_REVIEW_V210'),
      now(),now()
    )
    on conflict (commission_event_id) do update set
      decision=excluded.decision,
      reviewed_amount_mmk=excluded.reviewed_amount_mmk,
      reviewed_assignee_email=excluded.reviewed_assignee_email,
      reviewed_by_uid=excluded.reviewed_by_uid,
      reviewed_by_email=excluded.reviewed_by_email,
      review_note=excluded.review_note,
      evidence_snapshot=excluded.evidence_snapshot,
      reviewed_at=now(),updated_at=now();
    v_n:=v_n+1;
    v_photos:=null;
    v_verified:=null;
  end loop;
  return jsonb_build_object('ok',true,'decision',v_decision,'reviewed_records',v_n,
                            'payouts_initiated',0);
end;
$$;

-- Payouts must be independently reviewed: a finance poster cannot approve
-- their own payout records, even by invoking the legacy confirm-payout RPC.
create or replace function public.be_workforce_payout_review_guard_v210()
returns trigger
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $$
declare
  v_ledger record;
  v_approval record;
  v_event public.be_commission_events%rowtype;
begin
  if upper(coalesce(new.party_type,'')) not in ('RIDER','DRIVER','HELPER') then
    return new;
  end if;
  for v_ledger in
    select l.id,l.source_key,l.source_type,l.amount,l.status
    from public.be_party_wallet_ledger l
    where l.id=any(new.ledger_ids)
  loop
    if v_ledger.source_type<>'COMMISSION' then continue; end if;
    select * into v_event
      from public.be_commission_events e where e.id::text=v_ledger.source_key;
    if not found then raise exception 'Commission payout references an absent event'; end if;
    select * into v_approval
      from public.be_workforce_commission_finance_reviews_v210 r
      where r.commission_event_id=v_event.id;
    if not found or v_approval.decision<>'APPROVED'
       or v_approval.reviewed_amount_mmk<>v_event.commission_mmk
       or v_approval.reviewed_amount_mmk<>v_ledger.amount
       or v_approval.reviewed_assignee_email<>lower(v_event.assignee_email)
       or (new.paid_by is not null and v_approval.reviewed_by_uid=new.paid_by)
    then
      raise exception 'Independent Finance approval is required before commission payout for %',v_event.source_key;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_be_workforce_payout_review_guard_v210 on public.be_party_wallet_payouts_v193;
create trigger trg_be_workforce_payout_review_guard_v210
before insert on public.be_party_wallet_payouts_v193
for each row execute function public.be_workforce_payout_review_guard_v210();

revoke all on function public.be_workforce_commission_review_queue_v210(date,date) from public,anon;
revoke all on function public.be_workforce_commission_review_decide_v210(uuid[],text,text) from public,anon;
revoke all on function public.be_workforce_payout_review_guard_v210() from public,anon,authenticated;
grant execute on function public.be_workforce_commission_review_queue_v210(date,date) to authenticated,service_role;
grant execute on function public.be_workforce_commission_review_decide_v210(uuid[],text,text) to authenticated,service_role;

commit;
