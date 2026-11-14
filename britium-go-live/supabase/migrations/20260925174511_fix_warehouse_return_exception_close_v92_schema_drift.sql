create or replace function public.be_warehouse_return_exception_close_v92()
returns trigger
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $$
declare
  v_actor text:=coalesce(nullif(new.actor_email,''),auth.jwt()->>'email','warehouse');
begin
  update public.be_warehouse_exceptions
  set exception_status='RETURN_SCANNED',
      resolution_note=concat_ws(' | ',nullif(resolution_note,''),'Warehouse return scan completed.'),
      resolved_by=v_actor,
      resolved_at=coalesce(resolved_at,new.scanned_at,now()),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'return_scan_id',new.id,
        'return_attempt_number',new.attempt_number,
        'return_reason_code',new.reason_code,
        'return_scanned_at',new.scanned_at
      ),
      updated_at=now()
  where upper(delivery_way_id)=upper(new.delivery_way_id)
    and exception_status='AWAITING_RETURN_SCAN';

  update public.be_parcel_exception_events
  set resolved_at=coalesce(resolved_at,new.scanned_at,now()),
      resolved_by_email=v_actor
  where upper(delivery_way_id)=upper(new.delivery_way_id)
    and resolved_at is null;

  update public.be_exception_ledger
  set status='COMPLETED',
      notes=concat_ws(' | ',nullif(notes,''),'Warehouse return scan completed.'),
      payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object(
        'return_scan_id',new.id,
        'return_scan_at',new.scanned_at,
        'return_reason_code',new.reason_code
      ),
      updated_at=now()
  where upper(coalesce(deliver_id,tracking_number,''))=upper(new.delivery_way_id)
    and upper(coalesce(owner_team,''))='WAREHOUSE'
    and upper(coalesce(status,'')) not in ('COMPLETED','CLOSED','RESOLVED');

  update public.be_app_notifications
  set status='CLOSED',
      is_read=true,
      read_at=coalesce(read_at,new.scanned_at,now())
  where upper(coalesce(target_role,''))='WAREHOUSE'
    and entity_id=new.delivery_way_id
    and event_key like 'FIELD_FAILURE:%'
    and upper(coalesce(status,''))='OPEN';

  return new;
end;
$$;

notify pgrst, 'reload schema';