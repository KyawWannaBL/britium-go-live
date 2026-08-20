-- Britium Express V47
-- Canonical Way ID barcode/QR integrity and concatenated scanner-stream handling.
-- Requires the V41 dispatch functions and V40 Wayplan membership table.

begin;

create or replace function public.be_extract_way_ids_v47(p_scan_payload text)
returns text[]
language sql
immutable
set search_path = public
as $$
  with raw_matches as (
    select upper(r.parts[1]) as way_id, r.ordinality::bigint as scan_order
    from regexp_matches(
      coalesce(p_scan_payload, ''),
      '(D[0-9]{4}-[A-Za-z0-9]{2,12}-[0-9]{3,6})',
      'g'
    ) with ordinality as r(parts, ordinality)
  ), first_seen as (
    select way_id, min(scan_order) as first_scan_order
    from raw_matches
    group by way_id
  )
  select coalesce(array_agg(way_id order by first_scan_order), array[]::text[])
  from first_seen;
$$;

create or replace function public.be_dispatch_scan_preview_v47(
  p_wayplan_id text,
  p_scan_payload text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_ids text[] := public.be_extract_way_ids_v47(p_scan_payload);
  v_detected integer := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  if v_wayplan is null then raise exception 'Select a Wayplan before scanning'; end if;

  select count(*)::integer
  into v_detected
  from regexp_matches(
    coalesce(p_scan_payload, ''),
    '(D[0-9]{4}-[A-Za-z0-9]{2,12}-[0-9]{3,6})',
    'g'
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'way_id', ids.way_id,
    'belongs_to_wayplan', m.delivery_way_id is not null,
    'membership_status', m.membership_status,
    'dispatch_scanned', coalesce(s.scan_status = 'SCANNED', false)
  ) order by ids.ordinality), '[]'::jsonb)
  into v_rows
  from unnest(v_ids) with ordinality as ids(way_id, ordinality)
  left join public.be_wayplan_membership_v40 m
    on m.wayplan_id = v_wayplan
   and m.delivery_way_id = ids.way_id
  left join public.be_dispatch_scans_v39 s
    on s.wayplan_code = v_wayplan
   and s.delivery_way_id = ids.way_id;

  return jsonb_build_object(
    'ok', true,
    'build', 'DISPATCH_V47_CANONICAL_WAY_ID_MULTI_SCAN_2026-07-30',
    'wayplan_id', v_wayplan,
    'detected', v_detected,
    'unique', cardinality(v_ids),
    'duplicate_scans', greatest(v_detected - cardinality(v_ids), 0),
    'way_ids', to_jsonb(v_ids),
    'rows', v_rows
  );
end;
$$;

create or replace function public.be_dispatch_scan_payload_v47(
  p_wayplan_id text,
  p_scan_payload text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_actor text := public.be_dispatch_actor_v41(p_actor_email);
  v_ids text[] := public.be_extract_way_ids_v47(p_scan_payload);
  v_way_id text;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_accepted integer := 0;
  v_rejected integer := 0;
  v_detected integer := 0;
begin
  if v_wayplan is null then raise exception 'Select a Wayplan before scanning'; end if;

  select count(*)::integer
  into v_detected
  from regexp_matches(
    coalesce(p_scan_payload, ''),
    '(D[0-9]{4}-[A-Za-z0-9]{2,12}-[0-9]{3,6})',
    'g'
  );

  if cardinality(v_ids) = 0 then
    raise exception 'No valid parcel Way ID was detected. Expected format: D0728-CTM-026';
  end if;

  foreach v_way_id in array v_ids loop
    begin
      v_result := public.be_dispatch_scan_wayplan_parcel_v41(v_wayplan, v_way_id, v_actor);
      v_accepted := v_accepted + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'way_id', v_way_id,
        'ok', true,
        'result', v_result
      ));
    exception when others then
      v_rejected := v_rejected + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'way_id', v_way_id,
        'ok', false,
        'error', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'ok', v_rejected = 0,
    'build', 'DISPATCH_V47_CANONICAL_WAY_ID_MULTI_SCAN_2026-07-30',
    'wayplan_id', v_wayplan,
    'detected', v_detected,
    'unique', cardinality(v_ids),
    'duplicate_scans', greatest(v_detected - cardinality(v_ids), 0),
    'accepted', v_accepted,
    'rejected', v_rejected,
    'results', v_results
  );
end;
$$;

revoke all on function public.be_extract_way_ids_v47(text) from public, anon;
revoke all on function public.be_dispatch_scan_preview_v47(text,text) from public, anon;
revoke all on function public.be_dispatch_scan_payload_v47(text,text,text) from public, anon;

grant execute on function public.be_extract_way_ids_v47(text) to authenticated;
grant execute on function public.be_dispatch_scan_preview_v47(text,text) to authenticated;
grant execute on function public.be_dispatch_scan_payload_v47(text,text,text) to authenticated;

commit;

select
  to_regprocedure('public.be_extract_way_ids_v47(text)')::text as scan_parser_rpc,
  to_regprocedure('public.be_dispatch_scan_preview_v47(text,text)')::text as scan_preview_rpc,
  to_regprocedure('public.be_dispatch_scan_payload_v47(text,text,text)')::text as scan_execution_rpc,
  'Visible Way ID = barcode = QR; concatenated scanner streams are split, deduplicated, and checked against the selected Wayplan' as workflow;
