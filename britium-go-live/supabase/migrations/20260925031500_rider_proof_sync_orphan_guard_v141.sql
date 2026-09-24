-- V141: prevent orphan legacy proof rows from aborting the global Rider proof sync.
-- Production reproduction before this patch:
-- be_sync_rider_proofs_to_data_entry() attempted to import a legacy proof for
-- P0728-BBG-005; the canonical pickup no longer existed, and the verification
-- sequence trigger raised PICKUP_NOT_FOUND. That unrelated orphan row aborted
-- verification/release for valid current pickups.

do $$
declare
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='be_sync_rider_proofs_to_data_entry'
  limit 1;

  if v_oid is null then
    raise exception 'be_sync_rider_proofs_to_data_entry() not found';
  end if;

  v_old := $old$
      if v_pickup_id is null or v_proof_url is null then
        continue;
      end if;
$old$;

  v_new := $new$
      if v_pickup_id is null or v_proof_url is null then
        continue;
      end if;

      -- Legacy photo/proof tables can outlive their canonical pickup after
      -- test-data cleanup or hard-delete. Never let one orphan proof abort
      -- synchronization for every valid pickup.
      if not exists (
        select 1
        from public.be_portal_pickup_requests canonical_pickup
        where canonical_pickup.pickup_id = v_pickup_id
           or canonical_pickup.pickup_way_id = v_pickup_id
           or canonical_pickup.canonical_pickup_id = v_pickup_id
      ) then
        continue;
      end if;
$new$;

  if position(v_old in v_def)=0 then
    raise exception 'Expected Rider proof sync guard insertion point not found';
  end if;

  execute replace(v_def,v_old,v_new);
end
$$;

comment on function public.be_sync_rider_proofs_to_data_entry() is
'V141: skips orphan legacy proof rows whose canonical pickup no longer exists, preventing PICKUP_NOT_FOUND from aborting current Rider/Driver verification and Data Entry release.';
