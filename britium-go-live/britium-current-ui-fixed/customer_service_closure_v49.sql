-- Britium Express Customer Service Closure V49
-- Rider V46 final delivery outcome + Finance COD V48 clearance
-- -> customer communication -> close or escalate -> auditable handoff.

begin;

create extension if not exists pgcrypto;

create table if not exists public.be_cs_closure_v49 (
  delivery_way_id text primary key,
  wayplan_id text not null,
  pickup_id text,
  recipient_name text,
  recipient_phone text,
  township text,
  delivery_status text not null,
  delivered_at timestamptz,
  expected_cod numeric not null default 0,
  finance_status text not null default 'NOT_SYNCED',
  proof_status text not null default 'MISSING',
  workflow_status text not null default 'READY_TO_CONTACT',
  contact_channel text,
  contact_summary text,
  customer_response text,
  outcome_message text,
  next_disposition text,
  operational_resolution_reference text,
  contacted_by text,
  contacted_at timestamptz,
  closure_note text,
  closed_by text,
  closed_at timestamptz,
  escalation_reason text,
  escalation_owner text,
  escalated_by text,
  escalated_at timestamptz,
  last_operation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint be_cs_closure_v49_delivery_status_check check (
    delivery_status in ('DELIVERED','FAILED','RTO','CANCELLED')
  ),
  constraint be_cs_closure_v49_workflow_status_check check (
    workflow_status in (
      'WAITING_FINANCE','FINANCE_HOLD','READY_TO_CONTACT',
      'CONTACTED','CLOSED','ESCALATED'
    )
  )
);

create table if not exists public.be_cs_closure_events_v49 (
  id bigint generated always as identity primary key,
  delivery_way_id text not null,
  wayplan_id text,
  event_type text not null,
  operation_id text,
  actor text,
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create unique index if not exists be_cs_closure_events_v49_operation_uidx
  on public.be_cs_closure_events_v49(operation_id)
  where operation_id is not null;
create index if not exists be_cs_closure_v49_status_idx
  on public.be_cs_closure_v49(workflow_status, updated_at desc);
create index if not exists be_cs_closure_v49_wayplan_idx
  on public.be_cs_closure_v49(wayplan_id, delivery_status);

alter table public.be_cs_closure_v49 enable row level security;
alter table public.be_cs_closure_events_v49 enable row level security;
revoke all on public.be_cs_closure_v49 from public, anon, authenticated;
revoke all on public.be_cs_closure_events_v49 from public, anon, authenticated;

create or replace function public.be_cs_actor_v49(p_actor text default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(btrim(p_actor), ''),
    nullif(auth.jwt() ->> 'email', ''),
    auth.uid()::text,
    'customer-service@britiumexpress.com'
  );
$$;

create or replace function public.be_cs_operation_v49(p_operation_id text default null)
returns text
language sql
volatile
as $$
  select coalesce(nullif(btrim(p_operation_id), ''), gen_random_uuid()::text);
$$;

create or replace function public.be_cs_default_outcome_message_v49(p_status text)
returns text
language sql
immutable
as $$
  select case upper(coalesce(p_status, ''))
    when 'DELIVERED' then 'Your parcel has been delivered successfully.'
    when 'FAILED' then 'The delivery attempt was not completed. Our team will confirm the next arrangement.'
    when 'RTO' then 'The parcel has been marked for return to sender after unsuccessful delivery attempts.'
    when 'CANCELLED' then 'The delivery has been cancelled.'
    else 'Your parcel status has been updated.'
  end;
$$;

create or replace function public.be_cs_closure_sync_v49(p_wayplan_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_count integer := 0;
begin
  if to_regprocedure('public.be_finance_cod_sync_v48(text)') is not null then
    perform public.be_finance_cod_sync_v48(v_wayplan);
  end if;

  with source as (
    select
      s.delivery_way_id,
      s.wayplan_id,
      m.pickup_id,
      coalesce(f.recipient_name, s.recipient_name) as recipient_name,
      coalesce(f.recipient_phone, s.recipient_phone) as recipient_phone,
      coalesce(f.township, s.township) as township,
      s.stop_status as delivery_status,
      s.result_at as delivered_at,
      coalesce(f.expected_cod, 0)::numeric as expected_cod,
      coalesce(f.settlement_status,
        case when s.stop_status = 'DELIVERED' then 'NOT_SYNCED' else 'NOT_REQUIRED' end
      ) as finance_status,
      coalesce(f.proof_status,
        case
          when coalesce(s.result_payload ? 'signature', false)
            or coalesce(s.result_payload ? 'photo', false)
            or coalesce(s.result_payload ? 'otp', false)
            or nullif(s.result_payload ->> 'proof_reference', '') is not null
            or nullif(s.result_payload ->> 'proof_url', '') is not null
          then 'AVAILABLE'
          else 'MISSING'
        end
      ) as proof_status,
      s.result_payload
    from public.be_rider_route_stop_state_v46 s
    join public.be_wayplan_membership_v40 m
      on m.wayplan_id = s.wayplan_id
     and m.delivery_way_id = s.delivery_way_id
    left join public.be_finance_cod_settlements_v48 f
      on f.delivery_way_id = s.delivery_way_id
    where s.stop_status in ('DELIVERED','FAILED','RTO','CANCELLED')
      and (v_wayplan is null or s.wayplan_id = v_wayplan)
  )
  insert into public.be_cs_closure_v49 (
    delivery_way_id, wayplan_id, pickup_id,
    recipient_name, recipient_phone, township,
    delivery_status, delivered_at, expected_cod,
    finance_status, proof_status, workflow_status,
    outcome_message, metadata, updated_at
  )
  select
    delivery_way_id, wayplan_id, pickup_id,
    recipient_name, recipient_phone, township,
    delivery_status, delivered_at, expected_cod,
    finance_status, proof_status,
    case
      when delivery_status <> 'DELIVERED' then 'READY_TO_CONTACT'
      when expected_cod <= 0 or finance_status in ('SETTLED','NOT_REQUIRED') then 'READY_TO_CONTACT'
      when finance_status = 'ON_HOLD' then 'FINANCE_HOLD'
      else 'WAITING_FINANCE'
    end,
    public.be_cs_default_outcome_message_v49(delivery_status),
    jsonb_build_object(
      'source', 'RIDER_V46_FINANCE_V48',
      'rider_result_payload', result_payload,
      'build', 'CUSTOMER_SERVICE_CLOSURE_V49_2026-07-30'
    ),
    now()
  from source
  on conflict (delivery_way_id) do update set
    wayplan_id = excluded.wayplan_id,
    pickup_id = coalesce(excluded.pickup_id, public.be_cs_closure_v49.pickup_id),
    recipient_name = coalesce(excluded.recipient_name, public.be_cs_closure_v49.recipient_name),
    recipient_phone = coalesce(excluded.recipient_phone, public.be_cs_closure_v49.recipient_phone),
    township = coalesce(excluded.township, public.be_cs_closure_v49.township),
    delivery_status = excluded.delivery_status,
    delivered_at = coalesce(excluded.delivered_at, public.be_cs_closure_v49.delivered_at),
    expected_cod = excluded.expected_cod,
    finance_status = excluded.finance_status,
    proof_status = excluded.proof_status,
    workflow_status = case
      when public.be_cs_closure_v49.workflow_status in ('CLOSED','ESCALATED')
        then public.be_cs_closure_v49.workflow_status
      when public.be_cs_closure_v49.contacted_at is not null
       and (
         excluded.delivery_status <> 'DELIVERED'
         or excluded.expected_cod <= 0
         or excluded.finance_status in ('SETTLED','NOT_REQUIRED')
       ) then 'CONTACTED'
      else excluded.workflow_status
    end,
    outcome_message = coalesce(public.be_cs_closure_v49.outcome_message, excluded.outcome_message),
    metadata = coalesce(public.be_cs_closure_v49.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan,
    'synced_rows', v_count,
    'workflow', 'FINAL DELIVERY OUTCOME -> FINANCE CLEARANCE -> CUSTOMER CONTACT -> CLOSE/ESCALATE',
    'build', 'CUSTOMER_SERVICE_CLOSURE_V49_2026-07-30'
  );
end;
$$;

create or replace function public.be_cs_closure_snapshot_v49(
  p_status text default 'OPEN',
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := upper(coalesce(nullif(btrim(p_status), ''), 'OPEN'));
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 2000));
  v_rows jsonb;
  v_summary jsonb;
begin
  perform public.be_cs_closure_sync_v49(null);

  select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc), '[]'::jsonb)
  into v_rows
  from (
    select *
    from public.be_cs_closure_v49 c
    where case v_status
      when 'ALL' then true
      when 'OPEN' then c.workflow_status not in ('CLOSED')
      when 'READY' then c.workflow_status = 'READY_TO_CONTACT'
      when 'CONTACTED' then c.workflow_status = 'CONTACTED'
      when 'HOLD' then c.workflow_status in ('WAITING_FINANCE','FINANCE_HOLD','ESCALATED')
      when 'CLOSED' then c.workflow_status = 'CLOSED'
      else c.workflow_status = v_status
    end
    order by c.updated_at desc
    limit v_limit
  ) q;

  select jsonb_build_object(
    'rows', count(*)::integer,
    'waiting_finance', count(*) filter (where workflow_status = 'WAITING_FINANCE')::integer,
    'finance_hold', count(*) filter (where workflow_status = 'FINANCE_HOLD')::integer,
    'ready_to_contact', count(*) filter (where workflow_status = 'READY_TO_CONTACT')::integer,
    'contacted', count(*) filter (where workflow_status = 'CONTACTED')::integer,
    'closed', count(*) filter (where workflow_status = 'CLOSED')::integer,
    'escalated', count(*) filter (where workflow_status = 'ESCALATED')::integer
  )
  into v_summary
  from public.be_cs_closure_v49;

  return jsonb_build_object(
    'ok', true,
    'rows', v_rows,
    'summary', v_summary,
    'filter', v_status,
    'synced_at', now(),
    'channels', jsonb_build_array('PHONE','SMS','VIBER','MESSENGER','EMAIL','IN_PERSON','OTHER'),
    'dispositions', jsonb_build_array(
      'DELIVERY_CONFIRMED','RESCHEDULED','RETURN_CONFIRMED','CANCELLED','CUSTOMER_UNREACHABLE','RESOLVED','OTHER'
    ),
    'workflow', 'FINAL OUTCOME -> CONTACT -> CLOSE OR ESCALATE',
    'build', 'CUSTOMER_SERVICE_CLOSURE_V49_2026-07-30'
  );
end;
$$;

create or replace function public.be_cs_record_customer_contact_v49(
  p_delivery_way_id text,
  p_channel text,
  p_contact_summary text,
  p_customer_response text,
  p_next_disposition text,
  p_resolution_reference text,
  p_actor text default null,
  p_operation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_way text := btrim(coalesce(p_delivery_way_id, ''));
  v_actor text := public.be_cs_actor_v49(p_actor);
  v_operation text := public.be_cs_operation_v49(p_operation_id);
  v_row public.be_cs_closure_v49;
begin
  if v_way = '' then raise exception 'Delivery Way ID is required'; end if;
  if nullif(btrim(coalesce(p_channel, '')), '') is null then raise exception 'Contact channel is required'; end if;
  if nullif(btrim(coalesce(p_contact_summary, '')), '') is null then raise exception 'Customer communication summary is required'; end if;

  if exists(select 1 from public.be_cs_closure_events_v49 where operation_id = v_operation) then
    select * into v_row from public.be_cs_closure_v49 where delivery_way_id = v_way;
    return jsonb_build_object('ok', true, 'duplicate_operation', true, 'row', to_jsonb(v_row));
  end if;

  perform public.be_cs_closure_sync_v49(null);
  select * into v_row from public.be_cs_closure_v49 where delivery_way_id = v_way for update;
  if not found then raise exception 'Customer closure row % was not found', v_way; end if;
  if v_row.workflow_status = 'CLOSED' then raise exception 'Communication for % is already closed', v_way; end if;

  update public.be_cs_closure_v49
  set contact_channel = upper(btrim(p_channel)),
      contact_summary = btrim(p_contact_summary),
      customer_response = nullif(btrim(coalesce(p_customer_response, '')), ''),
      next_disposition = nullif(upper(btrim(coalesce(p_next_disposition, ''))), ''),
      operational_resolution_reference = nullif(btrim(coalesce(p_resolution_reference, '')), ''),
      contacted_by = v_actor,
      contacted_at = now(),
      last_operation_id = v_operation,
      workflow_status = case
        when delivery_status = 'DELIVERED'
         and expected_cod > 0
         and finance_status not in ('SETTLED','NOT_REQUIRED')
          then case when finance_status = 'ON_HOLD' then 'FINANCE_HOLD' else 'WAITING_FINANCE' end
        else 'CONTACTED'
      end,
      updated_at = now()
  where delivery_way_id = v_way
  returning * into v_row;

  insert into public.be_cs_closure_events_v49(
    delivery_way_id, wayplan_id, event_type, operation_id, actor, payload
  ) values (
    v_way, v_row.wayplan_id, 'CUSTOMER_CONTACT_RECORDED', v_operation, v_actor,
    jsonb_build_object(
      'channel', upper(btrim(p_channel)),
      'contact_summary', btrim(p_contact_summary),
      'customer_response', p_customer_response,
      'next_disposition', p_next_disposition,
      'resolution_reference', p_resolution_reference
    )
  );

  return jsonb_build_object('ok', true, 'row', to_jsonb(v_row), 'operation_id', v_operation);
end;
$$;

create or replace function public.be_cs_close_communication_v49(
  p_delivery_way_id text,
  p_closure_note text,
  p_actor text default null,
  p_operation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_way text := btrim(coalesce(p_delivery_way_id, ''));
  v_actor text := public.be_cs_actor_v49(p_actor);
  v_operation text := public.be_cs_operation_v49(p_operation_id);
  v_row public.be_cs_closure_v49;
begin
  if v_way = '' then raise exception 'Delivery Way ID is required'; end if;
  if nullif(btrim(coalesce(p_closure_note, '')), '') is null then raise exception 'Closure note is required'; end if;

  if exists(select 1 from public.be_cs_closure_events_v49 where operation_id = v_operation) then
    select * into v_row from public.be_cs_closure_v49 where delivery_way_id = v_way;
    return jsonb_build_object('ok', true, 'duplicate_operation', true, 'row', to_jsonb(v_row));
  end if;

  perform public.be_cs_closure_sync_v49(null);
  select * into v_row from public.be_cs_closure_v49 where delivery_way_id = v_way for update;
  if not found then raise exception 'Customer closure row % was not found', v_way; end if;
  if v_row.workflow_status = 'CLOSED' then
    return jsonb_build_object('ok', true, 'already_closed', true, 'row', to_jsonb(v_row));
  end if;
  if v_row.contacted_at is null then raise exception 'Record customer communication before closing %', v_way; end if;
  if v_row.proof_status = 'MISSING' and v_row.delivery_status = 'DELIVERED' then
    raise exception 'Delivery proof is missing for %', v_way;
  end if;
  if v_row.delivery_status = 'DELIVERED'
     and v_row.expected_cod > 0
     and v_row.finance_status <> 'SETTLED' then
    raise exception 'COD settlement for % is %, not SETTLED', v_way, v_row.finance_status;
  end if;
  if v_row.delivery_status in ('FAILED','RTO','CANCELLED')
     and (
       nullif(btrim(coalesce(v_row.next_disposition, '')), '') is null
       or nullif(btrim(coalesce(v_row.operational_resolution_reference, '')), '') is null
     ) then
    raise exception 'Failed/RTO/cancelled outcome % requires next disposition and operational resolution reference', v_way;
  end if;

  update public.be_cs_closure_v49
  set workflow_status = 'CLOSED',
      closure_note = btrim(p_closure_note),
      closed_by = v_actor,
      closed_at = now(),
      last_operation_id = v_operation,
      updated_at = now()
  where delivery_way_id = v_way
  returning * into v_row;

  insert into public.be_cs_closure_events_v49(
    delivery_way_id, wayplan_id, event_type, operation_id, actor, payload
  ) values (
    v_way, v_row.wayplan_id, 'CUSTOMER_COMMUNICATION_CLOSED', v_operation, v_actor,
    jsonb_build_object(
      'closure_note', p_closure_note,
      'delivery_status', v_row.delivery_status,
      'finance_status', v_row.finance_status,
      'next_disposition', v_row.next_disposition
    )
  );

  return jsonb_build_object('ok', true, 'row', to_jsonb(v_row), 'operation_id', v_operation);
end;
$$;

create or replace function public.be_cs_escalate_closure_v49(
  p_delivery_way_id text,
  p_reason text,
  p_owner text,
  p_actor text default null,
  p_operation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_way text := btrim(coalesce(p_delivery_way_id, ''));
  v_actor text := public.be_cs_actor_v49(p_actor);
  v_operation text := public.be_cs_operation_v49(p_operation_id);
  v_row public.be_cs_closure_v49;
begin
  if v_way = '' then raise exception 'Delivery Way ID is required'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'Escalation reason is required'; end if;
  if nullif(btrim(coalesce(p_owner, '')), '') is null then raise exception 'Escalation owner is required'; end if;

  if exists(select 1 from public.be_cs_closure_events_v49 where operation_id = v_operation) then
    select * into v_row from public.be_cs_closure_v49 where delivery_way_id = v_way;
    return jsonb_build_object('ok', true, 'duplicate_operation', true, 'row', to_jsonb(v_row));
  end if;

  perform public.be_cs_closure_sync_v49(null);
  select * into v_row from public.be_cs_closure_v49 where delivery_way_id = v_way for update;
  if not found then raise exception 'Customer closure row % was not found', v_way; end if;
  if v_row.workflow_status = 'CLOSED' then raise exception 'Closed communication % cannot be escalated', v_way; end if;

  update public.be_cs_closure_v49
  set workflow_status = 'ESCALATED',
      escalation_reason = btrim(p_reason),
      escalation_owner = upper(btrim(p_owner)),
      escalated_by = v_actor,
      escalated_at = now(),
      last_operation_id = v_operation,
      updated_at = now()
  where delivery_way_id = v_way
  returning * into v_row;

  insert into public.be_cs_closure_events_v49(
    delivery_way_id, wayplan_id, event_type, operation_id, actor, payload
  ) values (
    v_way, v_row.wayplan_id, 'CUSTOMER_CLOSURE_ESCALATED', v_operation, v_actor,
    jsonb_build_object('reason', p_reason, 'owner', upper(btrim(p_owner)))
  );

  return jsonb_build_object('ok', true, 'row', to_jsonb(v_row), 'operation_id', v_operation);
end;
$$;

create or replace function public.be_cs_closure_status_v49(p_delivery_way_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object(
      'ok', true,
      'row', to_jsonb(c),
      'events', coalesce((
        select jsonb_agg(to_jsonb(e) order by e.event_at desc)
        from public.be_cs_closure_events_v49 e
        where e.delivery_way_id = c.delivery_way_id
      ), '[]'::jsonb)
    ) from public.be_cs_closure_v49 c where c.delivery_way_id = btrim(p_delivery_way_id)),
    jsonb_build_object('ok', false, 'delivery_way_id', p_delivery_way_id, 'status', 'NOT_FOUND')
  );
$$;

create or replace function public.be_cs_closure_stop_sync_trigger_v49()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stop_status in ('DELIVERED','FAILED','RTO','CANCELLED') then
    perform public.be_cs_closure_sync_v49(new.wayplan_id);
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.be_rider_route_stop_state_v46') is not null then
    execute 'drop trigger if exists be_cs_closure_stop_sync_v49 on public.be_rider_route_stop_state_v46';
    execute 'create trigger be_cs_closure_stop_sync_v49 after insert or update of stop_status, result_payload on public.be_rider_route_stop_state_v46 for each row execute function public.be_cs_closure_stop_sync_trigger_v49()';
  end if;
end;
$$;

revoke all on function public.be_cs_actor_v49(text) from public, anon;
revoke all on function public.be_cs_operation_v49(text) from public, anon;
revoke all on function public.be_cs_closure_sync_v49(text) from public, anon;
revoke all on function public.be_cs_closure_snapshot_v49(text,integer) from public, anon;
revoke all on function public.be_cs_record_customer_contact_v49(text,text,text,text,text,text,text,text) from public, anon;
revoke all on function public.be_cs_close_communication_v49(text,text,text,text) from public, anon;
revoke all on function public.be_cs_escalate_closure_v49(text,text,text,text,text) from public, anon;
revoke all on function public.be_cs_closure_status_v49(text) from public, anon;

grant execute on function public.be_cs_closure_sync_v49(text) to authenticated;
grant execute on function public.be_cs_closure_snapshot_v49(text,integer) to authenticated;
grant execute on function public.be_cs_record_customer_contact_v49(text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.be_cs_close_communication_v49(text,text,text,text) to authenticated;
grant execute on function public.be_cs_escalate_closure_v49(text,text,text,text,text) to authenticated;
grant execute on function public.be_cs_closure_status_v49(text) to authenticated;

notify pgrst, 'reload schema';

commit;

select jsonb_build_object(
  'customer_service_closure_v49', jsonb_build_object(
    'snapshot_rpc', to_regprocedure('public.be_cs_closure_snapshot_v49(text,integer)')::text,
    'sync_rpc', to_regprocedure('public.be_cs_closure_sync_v49(text)')::text,
    'record_contact_rpc', to_regprocedure('public.be_cs_record_customer_contact_v49(text,text,text,text,text,text,text,text)')::text,
    'close_rpc', to_regprocedure('public.be_cs_close_communication_v49(text,text,text,text)')::text,
    'escalate_rpc', to_regprocedure('public.be_cs_escalate_closure_v49(text,text,text,text,text)')::text,
    'status_rpc', to_regprocedure('public.be_cs_closure_status_v49(text)')::text,
    'closure_table', to_regclass('public.be_cs_closure_v49')::text,
    'event_table', to_regclass('public.be_cs_closure_events_v49')::text,
    'workflow', 'DELIVERY FINAL -> FINANCE CLEAR -> CUSTOMER CONTACT -> CLOSED / ESCALATED'
  )
) as verification;
