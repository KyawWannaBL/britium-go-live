begin;

-- Central tariff authorization. Preserve the existing access model:
-- admin/operation_manager may read; only administrators may update.
create or replace function public.be_tariff_access_allowed(
  p_write boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $function$
declare
  v_role text := lower(
    coalesce(
      public.be_current_user_role(),
      auth.role(),
      ''
    )
  );
begin
  if auth.role() = 'service_role' then
    return true;
  end if;

  if auth.uid() is null then
    return false;
  end if;

  if p_write then
    return v_role = any (
      array[
        'admin',
        'super_admin',
        'super-admin',
        'superadmin'
      ]
    );
  end if;

  return v_role = any (
    array[
      'admin',
      'super_admin',
      'super-admin',
      'superadmin',
      'operation_manager'
    ]
  );
end;
$function$;

create or replace function public.be_tariff_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '28000',
      message = 'AUTHENTICATION_REQUIRED';
  end if;

  if not public.be_tariff_access_allowed(false) then
    raise exception using
      errcode = '42501',
      message = 'TARIFF_READ_NOT_AUTHORIZED';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(t) order by t.tier_name),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      tier_name,
      free_allowance_kg,
      base_fee_mmk,
      extra_per_kg_mmk,
      highway_fee_mmk,
      is_active,
      updated_at
    from public.be_tariff_master
    order by tier_name
  ) t;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

create or replace function public.be_tariff_update(
  p_tier text,
  p_base_fee integer,
  p_extra_per_kg integer,
  p_free_kg integer,
  p_highway_fee integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_tier text := nullif(btrim(p_tier), '');
  v_old jsonb;
  v_new jsonb;
begin
  if auth.uid() is null
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '28000',
      message = 'AUTHENTICATION_REQUIRED';
  end if;

  if not public.be_tariff_access_allowed(true) then
    raise exception using
      errcode = '42501',
      message = 'TARIFF_WRITE_NOT_AUTHORIZED';
  end if;

  if v_tier is null then
    raise exception using
      errcode = '22023',
      message = 'TARIFF_TIER_REQUIRED';
  end if;

  if p_base_fee is null
     or p_extra_per_kg is null
     or p_free_kg is null
     or p_highway_fee is null
     or p_base_fee < 0
     or p_extra_per_kg < 0
     or p_free_kg < 0
     or p_highway_fee < 0 then
    raise exception using
      errcode = '22023',
      message = 'TARIFF_VALUES_MUST_BE_NON_NEGATIVE_INTEGERS';
  end if;

  select to_jsonb(t)
  into v_old
  from public.be_tariff_master t
  where t.tier_name = v_tier
  for update;

  if v_old is null then
    raise exception using
      errcode = 'P0002',
      message = 'TARIFF_NOT_FOUND';
  end if;

  update public.be_tariff_master as tariff
  set
    base_fee_mmk = p_base_fee,
    extra_per_kg_mmk = p_extra_per_kg,
    free_allowance_kg = p_free_kg,
    highway_fee_mmk = p_highway_fee,
    updated_at = now()
  where tariff.tier_name = v_tier
  returning to_jsonb(tariff.*)
  into v_new;

  insert into public.be_audit_log (
    action,
    table_name,
    record_id,
    old_values,
    new_values,
    performed_by,
    performed_at
  )
  values (
    'UPDATE',
    'be_tariff_master',
    v_tier,
    v_old,
    v_new,
    auth.uid(),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'tariff', v_new
  );
end;
$function$;

-- Direct tariff writes are not allowed from browser roles.
revoke insert, update, delete, truncate, references, trigger
on table public.be_tariff_master
from anon, authenticated;

-- Retire browser access to the legacy functions.
revoke all
on function public.be_settings_get_tariff()
from public, anon, authenticated;

revoke all
on function public.be_settings_update_tariff(
  text,
  integer,
  integer,
  integer,
  integer
)
from public, anon, authenticated;

grant execute
on function public.be_settings_get_tariff()
to service_role;

grant execute
on function public.be_settings_update_tariff(
  text,
  integer,
  integer,
  integer,
  integer
)
to service_role;

-- Lock down helpers and explicitly expose only the new RPCs.
revoke all
on function public.be_tariff_access_allowed(boolean)
from public, anon, authenticated;

revoke all
on function public.be_tariff_list()
from public, anon, authenticated;

revoke all
on function public.be_tariff_update(
  text,
  integer,
  integer,
  integer,
  integer
)
from public, anon, authenticated;

grant execute
on function public.be_tariff_list()
to authenticated, service_role;

grant execute
on function public.be_tariff_update(
  text,
  integer,
  integer,
  integer,
  integer
)
to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
