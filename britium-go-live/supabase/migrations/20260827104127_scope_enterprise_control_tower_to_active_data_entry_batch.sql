do $$
begin
  if to_regprocedure('public.be_enterprise_control_tower_unfiltered_20260827(integer)') is null then
    alter function public.be_enterprise_control_tower(integer)
      rename to be_enterprise_control_tower_unfiltered_20260827;
  end if;
end $$;

revoke all on function public.be_enterprise_control_tower_unfiltered_20260827(integer) from public, anon, authenticated;

create or replace function public.be_enterprise_control_tower(p_limit integer default 300)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_legacy jsonb;
  v_rows jsonb;
  v_summary jsonb;
begin
  v_legacy := public.be_enterprise_control_tower_unfiltered_20260827(p_limit);

  select coalesce(jsonb_agg(r.obj order by r.obj->>'last_activity_at' desc nulls last), '[]'::jsonb)
  into v_rows
  from (
    select e.value as obj
    from jsonb_array_elements(coalesce(v_legacy->'rows','[]'::jsonb)) e(value)
    where exists (
      select 1
      from public.delivery_waybills dw
      join public.be_bulk_upload_batches b
        on b.batch_id::text = dw.raw_row->>'source_bulk_batch_id'
      where b.module_code = 'DATA_ENTRY'
        and b.status = 'ACTIVE'
        and coalesce(dw.delivery_way_id, dw.deliver_way_id) = e.value->>'delivery_way_id'
    )
  ) r;

  select jsonb_build_object(
    'total_records', count(*),
    'loaded_to_vehicle', count(*) filter (where x->>'enterprise_status'='LOADED_TO_VEHICLE'),
    'handed_to_rider', count(*) filter (where x->>'enterprise_status'='HANDED_TO_RIDER'),
    'dispatched', count(*) filter (where x->>'enterprise_status'='DISPATCHED'),
    'delivered_pending_finance', count(*) filter (where x->>'enterprise_status'='DELIVERED_PENDING_FINANCE'),
    'finance_settled', count(*) filter (where x->>'enterprise_status'='FINANCE_SETTLED'),
    'failed_or_returned', count(*) filter (where x->>'enterprise_status' in ('FAILED_DELIVERY','RETURN_TO_WAREHOUSE')),
    'total_cod_collected', coalesce(sum(nullif(x->>'cod_collected','')::numeric),0)
  )
  into v_summary
  from jsonb_array_elements(v_rows) x;

  return jsonb_build_object(
    'ok', true,
    'source', 'be_enterprise_control_tower',
    'active_scope', 'CURRENT_DATA_ENTRY_BATCH_ONLY',
    'count', jsonb_array_length(v_rows),
    'summary', v_summary,
    'rows', v_rows
  );
end;
$function$;

grant execute on function public.be_enterprise_control_tower(integer) to authenticated;;
