-- CI ONLY: exact production V57 access enforcement definition, read 2026-11-16.
CREATE OR REPLACE FUNCTION public.be_data_entry_require_access_v57(p_action text DEFAULT 'view'::text, p_require_waybill boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_access jsonb;
begin
  v_access := public.be_data_entry_actor_access_v57(
    p_action,
    p_require_waybill
  );

  if not coalesce((v_access ->> 'allowed')::boolean, false) then
    raise exception using
      errcode = '42501',
      message = coalesce(
        v_access ->> 'message',
        'Data Entry permission denied: ' || coalesce(v_access ->> 'reason_code', 'UNKNOWN')
      ),
      detail = v_access::text;
  end if;

  return v_access;
end;
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_require_access_v57(text,boolean) FROM PUBLIC,anon,authenticated;

