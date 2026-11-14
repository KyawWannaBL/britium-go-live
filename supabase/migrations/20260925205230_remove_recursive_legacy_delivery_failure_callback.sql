do $$
declare
  v_def text;
  v_start integer;
  v_finish integer;
  v_replacement text := $rep$
  -- The legacy driver-status wrapper now routes back into the canonical V39
  -- status writer. Calling it here would record the same failure twice.
  v_legacy_ok := false;
  v_legacy_message := 'Legacy status callback intentionally bypassed; canonical V39 lifecycle is authoritative';

$rep$;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='be_record_delivery_failure_v39'
    and pg_get_function_identity_arguments(p.oid)='p_way_id text, p_reason text, p_actor_email text, p_operation_id text'
  limit 1;

  if v_def is null then
    raise exception 'be_record_delivery_failure_v39 signature not found';
  end if;

  v_start := position('  if to_regprocedure(''public.be_driver_update_delivery_status(text,text,text,text)'') is not null then' in v_def);
  if v_start=0 then
    raise exception 'Legacy callback start not found';
  end if;

  v_finish := position('  if to_regclass(''public.be_portal_pickup_request_items'') is not null' in substring(v_def from v_start));
  if v_finish=0 then
    raise exception 'Legacy callback end boundary not found';
  end if;
  v_finish := v_start + v_finish - 1;

  v_def := substring(v_def from 1 for v_start-1)
        || v_replacement
        || substring(v_def from v_finish);

  execute v_def;
end;
$$;

revoke all on function public.be_driver_update_delivery_status(text,text,text,text) from anon;
grant execute on function public.be_driver_update_delivery_status(text,text,text,text) to authenticated,service_role;

notify pgrst,'reload schema';