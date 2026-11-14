create table if not exists public.be_operational_isolation_archive (
  archive_id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_key text not null,
  isolated_at timestamptz not null default now(),
  isolation_reason text not null,
  active_replacement_batch_id uuid,
  row_snapshot jsonb not null,
  unique(source_table,source_key)
);
alter table public.be_operational_isolation_archive enable row level security;
revoke all on table public.be_operational_isolation_archive from anon,authenticated;

do $$
begin
  if to_regprocedure('public.be_warehouse_scan_lifecycle_snapshot_unfiltered_20260827()') is null then
    alter function public.be_warehouse_scan_lifecycle_snapshot()
      rename to be_warehouse_scan_lifecycle_snapshot_unfiltered_20260827;
  end if;
  if to_regprocedure('public.be_enterprise_dispatch_snapshot_unfiltered_20260827()') is null then
    alter function public.be_enterprise_dispatch_snapshot()
      rename to be_enterprise_dispatch_snapshot_unfiltered_20260827;
  end if;
end $$;

create or replace function public.be_warehouse_scan_lifecycle_snapshot()
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp'
as $$
declare v_raw jsonb; v_rows jsonb; v_stats jsonb;
begin
  v_raw:=public.be_warehouse_scan_lifecycle_snapshot_unfiltered_20260827();
  select coalesce(jsonb_agg(e),'[]'::jsonb) into v_rows
  from jsonb_array_elements(coalesce(v_raw->'rows','[]'::jsonb)) e
  where exists (
    select 1 from public.delivery_waybills d
    join public.be_bulk_upload_batches b
      on b.batch_id=(d.raw_row->>'source_bulk_batch_id')::uuid
    where d.delivery_way_id=e->>'delivery_way_id'
      and d.overall_status='registered'
      and b.module_code='DATA_ENTRY' and b.status='ACTIVE'
  );
  select jsonb_build_object(
    'rows',count(*),
    'received',count(*) filter(where nullif(e->>'inbound_scan_at','') is not null),
    'dispatch_scanned',count(*) filter(where nullif(e->>'dispatch_scan_at','') is not null),
    'returns',count(*) filter(where coalesce((e->>'return_attempt_count')::int,0)>0),
    'priority',count(*) filter(where coalesce((e->>'next_attempt_priority')::boolean,false)),
    'rto',count(*) filter(where nullif(e->>'rto_at','') is not null or upper(coalesce(e->>'delivery_status',''))='RTO')
  ) into v_stats from jsonb_array_elements(v_rows) e;
  return v_raw||jsonb_build_object('rows',v_rows,'stats',v_stats,
    'active_scope','CURRENT_DATA_ENTRY_BATCH_ONLY');
end $$;

create or replace function public.be_enterprise_dispatch_snapshot()
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp'
as $$
declare v_raw jsonb; v_jobs jsonb; v_wayplans jsonb; v_stats jsonb;
begin
  v_raw:=public.be_enterprise_dispatch_snapshot_unfiltered_20260827();
  select coalesce(jsonb_agg(e),'[]'::jsonb) into v_jobs
  from jsonb_array_elements(coalesce(v_raw->'jobs','[]'::jsonb)) e
  where exists (
    select 1 from public.delivery_waybills d
    join public.be_bulk_upload_batches b
      on b.batch_id=(d.raw_row->>'source_bulk_batch_id')::uuid
    where d.delivery_way_id=coalesce(e->>'delivery_way_id',e->>'tracking_no')
      and d.overall_status='registered'
      and b.module_code='DATA_ENTRY' and b.status='ACTIVE'
  );
  select coalesce(jsonb_agg(w),'[]'::jsonb) into v_wayplans
  from jsonb_array_elements(coalesce(v_raw->'wayplans','[]'::jsonb)) w
  where exists(select 1 from jsonb_array_elements(v_jobs) j
    where coalesce(j->>'wayplan_code',j->>'wayplan_no')=
          coalesce(w->>'wayplan_code',w->>'wayplan_no'));
  select jsonb_build_object(
    'wayplans',count(distinct nullif(coalesce(e->>'wayplan_code',e->>'wayplan_no'),'')),
    'jobs',count(*),
    'pending',count(*) filter(where upper(coalesce(e->>'delivery_status','PENDING')) in ('PENDING','WAITING','READY')),
    'out_for_delivery',count(*) filter(where upper(coalesce(e->>'dispatch_status',''))='OUT_FOR_DELIVERY'),
    'delivered',count(*) filter(where upper(coalesce(e->>'delivery_status','')) in ('DELIVERED','COMPLETED','DROP_OFF')),
    'failed',count(*) filter(where upper(coalesce(e->>'delivery_status','')) in ('ATTEMPTED_FAILED','DELIVERY_FAILED','FAILED')),
    'rto',count(*) filter(where upper(coalesce(e->>'delivery_status',''))='RTO'),
    'cod',coalesce(sum(coalesce((e->>'cod_amount')::numeric,0)),0)
  ) into v_stats from jsonb_array_elements(v_jobs) e;
  return v_raw||jsonb_build_object('jobs',v_jobs,'wayplans',v_wayplans,'stats',v_stats,
    'active_scope','CURRENT_DATA_ENTRY_BATCH_ONLY');
end $$;

revoke execute on function public.be_warehouse_scan_lifecycle_snapshot_unfiltered_20260827() from anon,authenticated;
revoke execute on function public.be_enterprise_dispatch_snapshot_unfiltered_20260827() from anon,authenticated;
grant execute on function public.be_warehouse_scan_lifecycle_snapshot() to authenticated;
grant execute on function public.be_enterprise_dispatch_snapshot() to authenticated;;
