-- V41 phase 4: secure parcel-linked Customer Voice history for the CS detail panel.

create or replace function public.be_cs_customer_voice_history(p_delivery_way_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_way text := btrim(coalesce(p_delivery_way_id, ''));
  v_parcel jsonb;
  v_branch text;
  v_township text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if v_way = '' then raise exception 'DELIVERY_WAY_ID_REQUIRED' using errcode='22023'; end if;

  select to_jsonb(d) into v_parcel
  from public.be_data_entry_parcel_details d
  where d.delivery_way_id = v_way or nullif(to_jsonb(d)->>'waybill_no','') = v_way
  order by d.updated_at desc nulls last, d.created_at desc nulls last
  limit 1;

  if v_parcel is null then raise exception 'PARCEL_NOT_FOUND' using errcode='P0002'; end if;
  v_branch := nullif(v_parcel->>'branch_code','');
  v_township := coalesce(nullif(v_parcel->>'township',''),nullif(v_parcel->>'delivery_township',''),nullif(v_parcel->>'recipient_township',''));

  if not (
    public.be_employee_can_access_territory(null,v_branch,v_township,'read')
    or public.be_customer_service_can_manage_pickup_request(v_branch,v_township,'read')
  ) then
    raise exception 'PARCEL_ACCESS_DENIED' using errcode='42501';
  end if;

  select jsonb_build_object(
    'ok', true,
    'delivery_way_id', v_way,
    'voices', coalesce(jsonb_agg(
      to_jsonb(v) || jsonb_build_object(
        'actions', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.be_customer_voice_actions a where a.customer_voice_id=v.id),'[]'::jsonb),
        'escalations', coalesce((select jsonb_agg(to_jsonb(e) order by e.raised_at) from public.be_customer_voice_escalations e where e.customer_voice_id=v.id),'[]'::jsonb),
        'notifications', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.be_customer_voice_notifications n where n.customer_voice_id=v.id),'[]'::jsonb)
      ) order by v.created_at desc
    ), '[]'::jsonb)
  ) into v_result
  from public.be_customer_voices v
  where v.delivery_way_id=v_way;

  return coalesce(v_result,jsonb_build_object('ok',true,'delivery_way_id',v_way,'voices','[]'::jsonb));
end
$$;

revoke all on function public.be_cs_customer_voice_history(text) from public,anon;
grant execute on function public.be_cs_customer_voice_history(text) to authenticated;
