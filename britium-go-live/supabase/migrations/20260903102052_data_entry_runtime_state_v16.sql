begin;

-- The legacy schema RPC does not expose the live runtime flag.  Keep the
-- mutation gate authoritative in Postgres and expose only its current state to
-- authenticated Data Entry users so the browser cannot fall back to SHADOW.
create or replace function public.be_data_entry_financial_v2_runtime_state()
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $$
declare
  v_access jsonb;
  v_mode text := 'MUTATION_SHADOW';
  v_updated_at timestamptz;
  v_updated_by uuid;
  v_reason text;
begin
  v_access := public.be_data_entry_require_access_v57('create',false);

  select
    coalesce(nullif(upper(btrim(mutation_mode)),''),'MUTATION_SHADOW'),
    updated_at,
    updated_by,
    change_reason
  into v_mode, v_updated_at, v_updated_by, v_reason
  from public.be_data_entry_financial_v2_runtime_v58
  where singleton
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'mutation_mode', v_mode,
    'mutation_rpcs_activated', v_mode = 'ACTIVE',
    'data', jsonb_build_object(
      'mutation_mode', v_mode,
      'mutation_rpcs_activated', v_mode = 'ACTIVE',
      'updated_at', v_updated_at,
      'updated_by', v_updated_by,
      'change_reason', v_reason
    ),
    'access', v_access
  );
end;
$$;

revoke all on function public.be_data_entry_financial_v2_runtime_state() from public, anon;
grant execute on function public.be_data_entry_financial_v2_runtime_state() to authenticated, service_role;

comment on function public.be_data_entry_financial_v2_runtime_state() is
  'Authenticated Data Entry runtime-state contract. The database remains authoritative for mutation gating.';

commit;
