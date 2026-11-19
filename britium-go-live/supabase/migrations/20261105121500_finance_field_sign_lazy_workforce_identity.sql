-- Finance field settlement sign: avoid requiring mobile-workforce mapping for Finance.
-- Strictly preserve active worker identity, role and assignment checks for
-- rider, driver and helper. No privilege changes, no settlement row updates.
CREATE OR REPLACE FUNCTION public.be_finance_field_settlement_sign_v1(p_work_date date, p_wayplan_id text, p_signed_name text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_role text := public.be_current_role();
  v_identity jsonb := '{}'::jsonb;
  v_code text := '';
  v_key text;
  v_row public.be_field_finance_settlements_v1%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  if nullif(btrim(coalesce(p_signed_name,'')),'') is null then
    return jsonb_build_object('ok',false,'code','SIGNED_NAME_REQUIRED');
  end if;
  -- Finance/accountant/superadmin is not a field-worker; only field signatures
  -- require a linked active mobile workforce identity.
  if v_role in ('rider','driver','helper') then
    v_identity := public.be_current_field_team_identity();
    v_code := upper(coalesce(v_identity->>'worker_code',''));
    if coalesce(v_identity->>'role','') is distinct from v_role then
      return jsonb_build_object('ok',false,'code','WORKFORCE_ROLE_MISMATCH');
    end if;
  elsif v_role not in ('finance','accountant','superadmin','super_admin') then
    return jsonb_build_object('ok',false,'code','SETTLEMENT_SIGNER_ROLE_REQUIRED');
  end if;

  perform public.be_finance_field_settlement_center_v1(p_work_date);

  select * into v_row
  from public.be_field_finance_settlements_v1
  where work_date=p_work_date and wayplan_id=p_wayplan_id
  for update;

  if not found then return jsonb_build_object('ok',false,'code','SETTLEMENT_NOT_FOUND'); end if;
  if v_row.status='CLEARED' then return jsonb_build_object('ok',true,'status','CLEARED','already_applied',true); end if;

  if v_role in ('finance','accountant','superadmin','super_admin') then
    v_key := 'finance';
  elsif v_role='rider' and v_code=upper(coalesce(v_row.rider_code,'')) then
    v_key := 'rider';
  elsif v_role='driver' and v_code=upper(coalesce(v_row.driver_code,'')) then
    v_key := 'driver';
  elsif v_role='helper' and v_code=upper(coalesce(v_row.helper_code,'')) then
    v_key := 'helper';
  else
    return jsonb_build_object('ok',false,'code','SIGNER_NOT_ASSIGNED_TO_SETTLEMENT');
  end if;

  update public.be_field_finance_settlements_v1
  set party_signatures = coalesce(party_signatures,'{}'::jsonb) ||
      jsonb_build_object(v_key,jsonb_build_object(
        'signed_name',btrim(p_signed_name),
        'auth_user_id',auth.uid(),
        'role',v_role,
        'worker_code',nullif(v_code,''),
        'email',lower(coalesce(auth.jwt()->>'email','')),
        'signed_at',now(),
        'note',nullif(btrim(coalesce(p_note,'')),'')
      )),
      updated_at=now()
  where id=v_row.id;

  return jsonb_build_object('ok',true,'status','SIGNED','signer',v_key,'wayplan_id',p_wayplan_id);
end;
$function$;

-- Only the existing authenticated application RPC may sign; preserve grants.
