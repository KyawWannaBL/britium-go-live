create or replace function public.be_sync_delivery_commission_events_v94()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_status text := upper(coalesce(new.stop_status,new.rider_status,new.dispatch_status,''));
  v_work_date date := coalesce(new.delivered_at,new.updated_at,now())::date;
  v_member public.be_wayplan_membership_v40%rowtype;
  v_role text;
  v_code text;
  v_name text;
  v_email text;
  v_rate numeric;
begin
  if v_status not in ('DELIVERED','COMPLETED') then
    return new;
  end if;

  select * into v_member
  from public.be_wayplan_membership_v40
  where wayplan_id=new.wayplan_id and delivery_way_id=new.delivery_way_id
  order by updated_at desc nulls last
  limit 1;

  if not found then
    return new;
  end if;

  foreach v_role in array array['RIDER','DRIVER','HELPER'] loop
    v_code := case v_role
      when 'RIDER' then v_member.rider_code
      when 'DRIVER' then v_member.driver_code
      when 'HELPER' then v_member.helper_code
    end;
    v_name := case v_role
      when 'RIDER' then v_member.rider_name
      when 'DRIVER' then v_member.driver_name
      when 'HELPER' then v_member.helper_name
    end;

    v_email := null;
    if v_role='RIDER' and upper(coalesce(v_code,'')) ~ '^RID[0-9]+$' then
      v_email := 'rider_ygn_'||lpad(regexp_replace(upper(v_code),'[^0-9]','','g'),3,'0')||'@britiumventures.com';
    elsif v_role='DRIVER' and upper(coalesce(v_code,'')) ~ '^DRV[0-9]+$' then
      v_email := 'driver_ygn_'||lpad(regexp_replace(upper(v_code),'[^0-9]','','g'),3,'0')||'@britiumventures.com';
    elsif v_role='HELPER' and upper(coalesce(v_code,'')) ~ '^HLP[0-9]+$' then
      v_email := 'helper_ygn_'||lpad(regexp_replace(upper(v_code),'[^0-9]','','g'),3,'0')||'@britiumventures.com';
    end if;

    if v_email is not null then
      v_rate := public.be_commission_get_rate('DELIVERY',v_role,'PARCEL',v_work_date);

      insert into public.be_commission_events(
        source_type,source_key,work_date,operation_type,unit_type,unit_count,
        role_code,assignee_email,assignee_name,
        tracking_no,pickup_id,waybill_no,wayplan_code,
        rate_mmk,commission_mmk,event_status,actor_email,metadata
      ) values (
        'AUTO',new.delivery_way_id,v_work_date,'DELIVERY','PARCEL',1,
        v_role,v_email,v_name,
        new.delivery_way_id,new.pickup_id,new.waybill_no,new.wayplan_id,
        v_rate,v_rate,'READY',null,
        jsonb_build_object(
          'source_adapter','WAYPLAN_DELIVERED_TRIGGER_V94',
          'worker_code',v_code,
          'delivery_way_id',new.delivery_way_id,
          'wayplan_id',new.wayplan_id
        )
      )
      on conflict do nothing;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_be_sync_delivery_commission_events_v94 on public.be_wayplan_dispatch_stops;
create trigger trg_be_sync_delivery_commission_events_v94
after insert or update of stop_status,rider_status,dispatch_status,delivered_at
on public.be_wayplan_dispatch_stops
for each row execute function public.be_sync_delivery_commission_events_v94();
