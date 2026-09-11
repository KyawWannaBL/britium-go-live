drop policy if exists rider_proofs_public_insert on storage.objects;
drop policy if exists rider_proofs_public_update on storage.objects;

create or replace function public.be_rider_proof_owned_object_v12_13(p_proof_url text,p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path=public,storage,pg_temp
as $$
  select exists(
    select 1
    from storage.objects o
    where o.bucket_id='rider-proofs'
      and o.owner=p_owner
      and coalesce(p_proof_url,'')<>''
      and (
        p_proof_url=o.name
        or split_part(p_proof_url,'?',1) like '%'||o.name
        or split_part(p_proof_url,'?',1) like '%'||replace(o.name,' ','%20')
      )
  );
$$;

revoke all on function public.be_rider_proof_owned_object_v12_13(text,uuid) from public,anon;
grant execute on function public.be_rider_proof_owned_object_v12_13(text,uuid) to authenticated;

create or replace function public.be_rider_delivery_proof_guard_v12_13()
returns trigger
language plpgsql
security definer
set search_path=public,storage,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_required_cod numeric:=0;
begin
  if upper(coalesce(new.stop_status,''))='DELIVERED'
     and upper(coalesce(old.stop_status,''))<>'DELIVERED'
     and upper(coalesce(new.metadata->>'rider_mobile_action',''))='DELIVERED' then
    if v_uid is null then
      raise exception 'RIDER_DELIVERY_PROOF_AUTH_REQUIRED' using errcode='42501';
    end if;
    if coalesce(nullif(btrim(new.rider_proof_url),''),nullif(btrim(new.proof_url),'')) is null then
      raise exception 'RIDER_DELIVERY_PROOF_REQUIRED' using errcode='22023';
    end if;
    if not public.be_rider_proof_owned_object_v12_13(coalesce(new.rider_proof_url,new.proof_url),v_uid) then
      raise exception 'RIDER_DELIVERY_PROOF_NOT_OWNED_OR_NOT_FOUND' using errcode='42501';
    end if;

    select coalesce(d.actual_collect,d.cod_amount,0)
      into v_required_cod
    from public.be_data_entry_parcel_details d
    where d.delivery_way_id=new.delivery_way_id
    order by d.updated_at desc nulls last,d.saved_at desc nulls last
    limit 1;

    if coalesce(v_required_cod,0)>0 and coalesce(new.cod_collected,0)<v_required_cod then
      raise exception 'RIDER_DELIVERY_COD_SHORTFALL: required %, collected %',v_required_cod,coalesce(new.cod_collected,0) using errcode='22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_be_rider_delivery_proof_guard_v12_13 on public.be_wayplan_dispatch_stops;
create trigger trg_be_rider_delivery_proof_guard_v12_13
before update of stop_status,rider_proof_url,proof_url,cod_collected,metadata on public.be_wayplan_dispatch_stops
for each row execute function public.be_rider_delivery_proof_guard_v12_13();;
