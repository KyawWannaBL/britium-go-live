-- V125: smooth Wayplan assignment without weakening route or capacity safety.
-- Restore 1H-6033 to pickup/highway duty and enforce branch-scoped delivery fleets.
-- Rider-assisted sub-50 exemption already exists in the live V84+ function and is preserved.

update public.be_master_data_rows
set payload = jsonb_set(coalesce(payload,'{}'::jsonb), '{operation_type}', '"PICKUP_HIGHWAY"'::jsonb, true),
    updated_at = now()
where dataset_key='fleet_master'
  and record_key='FLT011'
  and payload->>'vehicle_no'='1H-6033';

do $migration$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_generate_multi_van_v43'
  limit 1;

  if v_def is null then
    raise exception 'be_generate_multi_van_v43 was not found';
  end if;

  if position('Selected delivery fleet belongs to another branch.' in v_def)=0 then
    v_new := regexp_replace(
      v_def,
      $pattern$(if v is null then raise exception 'Choose a delivery fleet; pickup/highway fleets are reserved\.'; end if;)([[:space:]]+)(key:=wave_no::text\|\|':'\|\|\(p->>'vehicle_code'\);)$pattern$,
      $replacement$\1\2    if coalesce(v->>'branch_code','') not in ('',branch) then raise exception 'Selected delivery fleet belongs to another branch.'; end if;\2\3$replacement$,
      'n'
    );
    if v_new=v_def then
      raise exception 'V125 branch guard insertion did not change function';
    end if;
    execute v_new;
  end if;
end
$migration$;

comment on function public.be_generate_multi_van_v43(jsonb)
is 'V125: branch-scoped delivery fleets; pickup/highway fleet reservation enforced; existing Rider-assisted sub-50 exemption preserved.';
