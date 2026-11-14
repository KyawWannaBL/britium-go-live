
create or replace function public.be_delivery_tariff_update_v1(
  p_id uuid,
  p_base_fee numeric,
  p_included_kg numeric,
  p_extra_per_kg numeric,
  p_status text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if auth.uid() is null and coalesce(auth.role(),'') <> 'service_role' then
    raise exception using errcode='28000', message='AUTHENTICATION_REQUIRED';
  end if;

  if not public.be_tariff_access_allowed(true) then
    raise exception using errcode='42501', message='TARIFF_WRITE_NOT_AUTHORIZED';
  end if;

  if p_id is null then
    raise exception using errcode='22023', message='TARIFF_ID_REQUIRED';
  end if;

  if p_base_fee is null or p_included_kg is null or p_extra_per_kg is null
     or p_base_fee < 0 or p_included_kg < 0 or p_extra_per_kg < 0 then
    raise exception using errcode='22023', message='TARIFF_VALUES_MUST_BE_NON_NEGATIVE';
  end if;

  select to_jsonb(t) into v_old
  from public.be_delivery_tariff_master_v13 t
  where t.id = p_id
  for update;

  if v_old is null then
    raise exception using errcode='P0002', message='DELIVERY_TARIFF_NOT_FOUND';
  end if;

  update public.be_delivery_tariff_master_v13 t
  set
    base_fee = p_base_fee,
    included_kg = p_included_kg,
    extra_per_kg = p_extra_per_kg,
    status = coalesce(nullif(btrim(p_status),''), t.status),
    note = coalesce(p_note, t.note),
    updated_at = now()
  where t.id = p_id
  returning to_jsonb(t.*) into v_new;

  insert into public.be_audit_log(
    action, table_name, record_id, old_values, new_values, performed_by, performed_at
  ) values (
    'UPDATE',
    'be_delivery_tariff_master_v13',
    p_id::text,
    v_old,
    v_new,
    auth.uid(),
    now()
  );

  return jsonb_build_object('ok',true,'tariff',v_new);
end;
$$;

revoke all on function public.be_delivery_tariff_update_v1(uuid,numeric,numeric,numeric,text,text) from public;
grant execute on function public.be_delivery_tariff_update_v1(uuid,numeric,numeric,numeric,text,text) to authenticated;
