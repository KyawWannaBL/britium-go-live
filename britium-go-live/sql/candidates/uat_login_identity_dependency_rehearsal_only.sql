-- Diagnostic-only local replay fixture; exact read-only Production pg_get_functiondef.
-- Contains existing workforce identity lookup; do not publish or deploy without review.
CREATE OR REPLACE FUNCTION public.be_field_team_resolve_login(p_login text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_login text := lower(btrim(coalesce(p_login, '')));
  v_row public.be_mobile_workforce_accounts%rowtype;
  v_auth_email text;
  v_code text;
  v_role text;
begin
  if v_login = '' then
    return jsonb_build_object('ok', false, 'error', 'login_required');
  end if;

  select w.*
  into v_row
  from public.be_mobile_workforce_accounts w
  where coalesce(w.active, true) = true
    and coalesce(w.is_active, true) = true
    and (
      lower(coalesce(w.workforce_code, '')) = v_login
      or lower(coalesce(w.worker_code, '')) = v_login
      or lower(coalesce(w.account_code, '')) = v_login
      or lower(coalesce(w.rider_code, '')) = v_login
      or lower(coalesce(w.driver_code, '')) = v_login
      or lower(coalesce(w.helper_code, '')) = v_login
      or lower(coalesce(w.email, '')) = v_login
      or lower(coalesce(w.user_email, '')) = v_login
      or lower(coalesce(w.account, '')) = v_login
      or exists (
        select 1
        from jsonb_array_elements_text(coalesce(w.aliases, '[]'::jsonb)) a(value)
        where lower(btrim(a.value)) = v_login
      )
    )
  order by
    case when lower(coalesce(w.workforce_code, '')) = v_login then 0 else 1 end,
    w.updated_at desc nulls last
  limit 1;

  if not found or v_row.auth_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'workforce_login_not_mapped');
  end if;

  select lower(u.email)
  into v_auth_email
  from auth.users u
  where u.id = v_row.auth_user_id
    and u.email is not null
  limit 1;

  if v_auth_email is null then
    return jsonb_build_object('ok', false, 'error', 'auth_user_not_found');
  end if;

  v_code := upper(coalesce(
    nullif(btrim(v_row.workforce_code), ''),
    nullif(btrim(v_row.worker_code), ''),
    nullif(btrim(v_row.account_code), ''),
    nullif(btrim(v_row.rider_code), ''),
    nullif(btrim(v_row.driver_code), ''),
    nullif(btrim(v_row.helper_code), '')
  ));

  v_role := lower(coalesce(
    nullif(btrim(v_row.role), ''),
    nullif(btrim(v_row.workforce_type), ''),
    case
      when v_code like 'DRV%' then 'driver'
      when v_code like 'HLP%' then 'helper'
      else 'rider'
    end
  ));

  if v_code like 'DRV%' then v_role := 'driver';
  elsif v_code like 'HLP%' then v_role := 'helper';
  elsif v_code like 'RID%' then v_role := 'rider';
  end if;

  return jsonb_build_object(
    'ok', true,
    'auth_user_id', v_row.auth_user_id,
    'email', v_auth_email,
    'worker_code', v_code,
    'role', v_role,
    'display_name', coalesce(nullif(btrim(v_row.display_name), ''), nullif(btrim(v_row.name), ''), v_code),
    'branch_code', nullif(btrim(v_row.branch_code), ''),
    'assigned_zone', nullif(btrim(v_row.assigned_zone), '')
  );
end;
$function$;
