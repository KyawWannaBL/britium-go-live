-- BE_GoLive_Rider_Full_Wireup.sql
create extension if not exists pgcrypto;

alter table public.be_portal_cargo_events
  add column if not exists temporary_qr text,
  add column if not exists weight_kg numeric,
  add column if not exists volume_length_cm numeric,
  add column if not exists volume_width_cm numeric,
  add column if not exists volume_height_cm numeric,
  add column if not exists volume_weight_kg numeric,
  add column if not exists chargeable_weight_kg numeric,
  add column if not exists signature_data text,
  add column if not exists acknowledgement_note text,
  add column if not exists photo_url text,
  add column if not exists financial_status text,
  add column if not exists warehouse_status text,
  add column if not exists parcel_status text,
  add column if not exists cod_amount numeric,
  add column if not exists collected_amount numeric,
  add column if not exists payload jsonb default '{}'::jsonb;

create or replace function public.be_rider_pickup_key(p_payload jsonb)
returns text language sql immutable as $$
  select nullif(coalesce(p_payload->>'assignment_key',p_payload->>'pickup_way_id',p_payload->>'pickup_id',p_payload->>'delivery_way_id'),'');
$$;

create or replace function public.be_rider_enterprise_finance_snapshot(p_identity jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer as $$
declare v_base jsonb; v_assignments jsonb; v_cod jsonb; v_settlements jsonb; v_wh jsonb; v_timeline jsonb;
begin
  v_base := public.be_rider_enterprise_snapshot(p_identity);
  v_assignments := coalesce(v_base->'assigned_pickups','[]'::jsonb);

  select coalesce(jsonb_agg(row_to_json(c)::jsonb order by c.updated_at desc),'[]'::jsonb) into v_cod
  from public.be_cod_ledger c where exists (
    select 1 from jsonb_array_elements(v_assignments) a
    where c.assignment_key in (a->>'assignment_key',a->>'pickup_way_id',a->>'pickup_id',a->>'delivery_way_id')
       or c.pickup_way_id in (a->>'assignment_key',a->>'pickup_way_id',a->>'pickup_id',a->>'delivery_way_id')
  );

  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.updated_at desc),'[]'::jsonb) into v_settlements
  from public.be_financial_settlements s where exists (
    select 1 from jsonb_array_elements(v_assignments) a
    where s.assignment_key in (a->>'assignment_key',a->>'pickup_way_id',a->>'pickup_id',a->>'delivery_way_id')
       or s.pickup_way_id in (a->>'assignment_key',a->>'pickup_way_id',a->>'pickup_id',a->>'delivery_way_id')
  );

  select coalesce(jsonb_agg(row_to_json(w)::jsonb order by w.updated_at desc),'[]'::jsonb) into v_wh
  from public.be_warehouse_parcel_status w where exists (
    select 1 from jsonb_array_elements(v_assignments) a
    where w.assignment_key in (a->>'assignment_key',a->>'pickup_way_id',a->>'pickup_id',a->>'delivery_way_id')
       or w.pickup_way_id in (a->>'assignment_key',a->>'pickup_way_id',a->>'pickup_id',a->>'delivery_way_id')
  );

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc),'[]'::jsonb) into v_timeline
  from (select * from public.be_parcel_status_timeline t order by created_at desc limit 300) t;

  return v_base || jsonb_build_object('cod_rows',v_cod,'financial_settlements',v_settlements,'warehouse_rows',v_wh,'parcel_timeline',v_timeline);
end;
$$;

create or replace function public.be_rider_cod_finance_action(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare v_key text := public.be_rider_pickup_key(p_payload); v_amount numeric := coalesce(nullif(regexp_replace(coalesce(p_payload->>'amount','0'),'[^0-9.]','','g'),'')::numeric,0); v_row public.be_supervisor_job_assignments; v_status text := case lower(coalesce(p_payload->>'action','collect_cod')) when 'handover_cod' then 'handed_over_to_finance' when 'finance_received' then 'finance_received' else 'collected' end;
begin
  select * into v_row from public.be_supervisor_job_assignments where assignment_key=v_key or pickup_way_id=v_key or pickup_id=v_key or delivery_way_id=v_key order by updated_at desc limit 1;
  if v_row.id is null then raise exception 'Assignment not found for %', v_key; end if;

  insert into public.be_cod_ledger(assignment_key,pickup_id,pickup_way_id,delivery_way_id,rider_id,rider_name,branch_code,cod_amount,collected_amount,handover_amount,cod_status,payload,updated_at)
  values(coalesce(v_row.assignment_key,v_key),v_row.pickup_id,v_row.pickup_way_id,v_row.delivery_way_id,coalesce(p_payload->>'actor_id',v_row.rider_id),coalesce(p_payload->>'actor_name',v_row.rider_name),v_row.branch_code,v_amount,v_amount,case when v_status='handed_over_to_finance' then v_amount else 0 end,v_status,p_payload,now());

  insert into public.be_financial_settlements(settlement_no,assignment_key,pickup_id,pickup_way_id,delivery_way_id,rider_id,rider_name,merchant_code,merchant_name,branch_code,cod_amount,collected_amount,settlement_status,finance_status,payload,updated_at)
  values('SET-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(md5(v_key),1,6)),coalesce(v_row.assignment_key,v_key),v_row.pickup_id,v_row.pickup_way_id,v_row.delivery_way_id,coalesce(p_payload->>'actor_id',v_row.rider_id),coalesce(p_payload->>'actor_name',v_row.rider_name),v_row.merchant_code,v_row.merchant_name,v_row.branch_code,v_amount,v_amount,v_status,case when v_status='handed_over_to_finance' then 'pending_finance_receive' else 'rider_collected' end,p_payload,now())
  on conflict (assignment_key) do update set collected_amount=excluded.collected_amount,settlement_status=excluded.settlement_status,finance_status=excluded.finance_status,payload=public.be_financial_settlements.payload||excluded.payload,updated_at=now();

  insert into public.be_parcel_status_timeline(assignment_key,pickup_id,pickup_way_id,delivery_way_id,status_code,status_label,actor_id,actor_name,actor_role,source_module,branch_code,metadata)
  values(coalesce(v_row.assignment_key,v_key),v_row.pickup_id,v_row.pickup_way_id,v_row.delivery_way_id,'finance_'||v_status,replace('finance_'||v_status,'_',' '),p_payload->>'actor_id',p_payload->>'actor_name',coalesce(p_payload->>'actor_role','rider'),'rider_app_finance',v_row.branch_code,p_payload);

  return jsonb_build_object('ok',true,'status',v_status);
end;
$$;

create or replace function public.be_rider_parcel_status_action(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare v_key text := public.be_rider_pickup_key(p_payload); v_action text := lower(coalesce(p_payload->>'action','picked_from_merchant')); v_row public.be_supervisor_job_assignments;
begin
  select * into v_row from public.be_supervisor_job_assignments where assignment_key=v_key or pickup_way_id=v_key or pickup_id=v_key or delivery_way_id=v_key order by updated_at desc limit 1;
  if v_row.id is null then raise exception 'Assignment not found for %', v_key; end if;

  insert into public.be_warehouse_parcel_status(assignment_key,pickup_id,pickup_way_id,delivery_way_id,parcel_status,warehouse_status,branch_code,location_note,updated_by,updated_by_name,payload,updated_at)
  values(coalesce(v_row.assignment_key,v_key),v_row.pickup_id,v_row.pickup_way_id,v_row.delivery_way_id,v_action,
         case v_action when 'warehouse_received' then 'received_at_warehouse' when 'out_for_delivery' then 'released_to_delivery' when 'delivered' then 'completed' else v_action end,
         v_row.branch_code,p_payload->>'location_note',p_payload->>'actor_id',p_payload->>'actor_name',p_payload,now())
  on conflict (assignment_key) do update set parcel_status=excluded.parcel_status,warehouse_status=excluded.warehouse_status,payload=public.be_warehouse_parcel_status.payload||excluded.payload,updated_at=now();

  insert into public.be_parcel_status_timeline(assignment_key,pickup_id,pickup_way_id,delivery_way_id,status_code,status_label,actor_id,actor_name,actor_role,source_module,branch_code,notes,metadata)
  values(coalesce(v_row.assignment_key,v_key),v_row.pickup_id,v_row.pickup_way_id,v_row.delivery_way_id,v_action,replace(v_action,'_',' '),p_payload->>'actor_id',p_payload->>'actor_name',coalesce(p_payload->>'actor_role','rider'),'rider_app_warehouse',v_row.branch_code,p_payload->>'location_note',p_payload);

  update public.be_supervisor_job_assignments set parcel_status=v_action, updated_at=now() where id=v_row.id;

  return jsonb_build_object('ok',true,'parcel_status',v_action);
end;
$$;

create or replace function public.be_delivery_app_snapshot(p_workforce_code text default null, p_phone text default null, p_role text default null, p_limit integer default 200)
returns jsonb language sql security definer as $$
  select public.be_rider_enterprise_snapshot(jsonb_build_object('workforce_code',p_workforce_code,'phone',p_phone,'role',p_role));
$$;

grant execute on all functions in schema public to anon, authenticated;
notify pgrst, 'reload schema';
