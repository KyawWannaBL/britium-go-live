-- Save + Sync must update the operational assignment picker in the same transaction.
-- This changes physical workforce availability only; account provisioning remains separate.
do $migration$
declare
  v_definition text := pg_get_functiondef('public.be_supervisor_workforce_master_upsert_v1(jsonb)'::regprocedure);
  v_anchor text := '  -- Synchronize only existing, explicitly linked accounts; never infer identity from phone.';
  v_sync text := $sync$  -- WORKFORCE_ASSIGNMENT_ROSTER_SYNC_V1: use role + code, never a shared phone.
  insert into public.be_wayplan_roster_allowlist_v68
    (role_code,workforce_code,display_name,phone,branch_code,employment_type,active,source_file,updated_at)
  values
    (v_type,v_code,v_name,nullif(p_payload->>'phone',''),
     coalesce(nullif(btrim(p_payload->>'branch_code'),''),'YGN'),
     case when v_type in ('RIDER','HELPER') then coalesce(nullif(p_payload->>'employment_type',''),'FULL_TIME') else null end,
     v_status='ACTIVE','WORKFORCE_MASTER_SCREEN',now())
  on conflict (role_code,workforce_code) do update set
    display_name=excluded.display_name,phone=excluded.phone,branch_code=excluded.branch_code,
    employment_type=excluded.employment_type,active=excluded.active,updated_at=now();

$sync$;
begin
  if position('WORKFORCE_ASSIGNMENT_ROSTER_SYNC_V1' in v_definition)>0 then return; end if;
  if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1
    or position('if auth.uid() is null' in v_definition)=0
    or position('pg_advisory_xact_lock' in v_definition)=0 then
    raise exception 'WORKFORCE_MASTER_FUNCTION_SHAPE_CHANGED';
  end if;
  execute replace(v_definition,v_anchor,v_sync||v_anchor);
end
$migration$;
