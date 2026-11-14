with fleet(record_key, vehicle_no, operation_type, vehicle_type, capacity_kg, zone_code, zone_name, zone_note, assigned_townships) as (
  values
    ('FLT011','1H-6033','DELIVERY','Van',700,'ZONE_1_TRANS_WEST','Zone 1: Trans-River West','Zone 1: Trans-River West','["Hlaingthaya","Shwepyitha"]'::jsonb),
    ('FLT008','2M-7017','PICKUP_HIGHWAY','Van',700,'PICKUP_EAST_HIGHWAY','East Pickup & Aung Mingalar','East Pickup & Aung Mingalar','["Highway Drops","Mandalay","Naypyidaw"]'::jsonb),
    ('FLT003','2Q-6524','DELIVERY','Mini Truck',850,'ZONE_2_DAGONS','Zone 2: The Dagons','Zone 2: The Dagons','["North Dagon","South Dagon","East Dagon","Dagon Seikkan"]'::jsonb),
    ('FLT007','4N-3169','PICKUP_HIGHWAY','Van',700,'PICKUP_WEST_GATES','West Pickup & General Gates','West Pickup & General Gates','["General Gates","Dagon Ayar"]'::jsonb),
    ('FLT002','4S-1626','DELIVERY','Mini Truck',850,'ZONE_3_INNER_WEST','Zone 3: Inner City West','Zone 3: Inner City West','["Hlaing","Kamayut","Sanchaung","Ahlon","Dagon","Kyeemyindaing","Bahan"]'::jsonb),
    ('FLT001','6H-7397','DELIVERY','Van',700,'ZONE_4_NORTHERN','Zone 4: Northern Corridor','Zone 4: Northern Corridor','["Insein","Mingaladon","Mayangone"]'::jsonb),
    ('FLT006','7K-1890','DELIVERY','Box Truck',1500,'ZONE_5_OKKALAPA','Zone 5: Okkalapa & East','Zone 5: Okkalapa & East','["North Okkalapa","South Okkalapa","Thingangyun"]'::jsonb),
    ('FLT004','7R-1473','DELIVERY','Mini Truck',780,'ZONE_6_DOWNTOWN','Zone 6: Downtown & CBD','Zone 6: Downtown & CBD','["Kyauktada","Pabedan","Latha","Lanmadaw","Botahtaung","Pazundaung","Mingala Taungnyunt"]'::jsonb),
    ('FLT005','9R-4431','DELIVERY','Van',300,'ZONE_7_INNER_EAST','Zone 7: Inner East Belt','Zone 7: Inner East Belt','["Tamwe","Yankin","Thaketa","Dawbon"]'::jsonb)
)
update public.be_master_data_rows m
set status='ACTIVE', deleted_at=null,
    payload=coalesce(m.payload,'{}'::jsonb)||jsonb_build_object(
      'vehicle_no',f.vehicle_no,'vehicle_plate',f.vehicle_no,'vehicle_id',f.vehicle_no,
      'vehicle_type',f.vehicle_type,'capacity_kg',f.capacity_kg,'status','ASSIGNED','is_active',true,
      'branch_code','YGN','operation_type',f.operation_type,'zone_code',f.zone_code,
      'zone_name',f.zone_name,'zone_note',f.zone_note,
      'route_payload',jsonb_build_object('assigned_townships',f.assigned_townships)),
    updated_at=now()
from fleet f
where m.dataset_key='fleet_master' and m.record_key=f.record_key;

create or replace function public.be_multi_van_context()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_options jsonb; v_vehicles jsonb; v_busy jsonb; v_role text; v_route_origins jsonb;
begin
 v_role:=lower(public.be_current_user_role());
 if auth.uid() is null or v_role not in ('superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor','operations','operations_admin','operations-admin','management','director') then
   raise exception using errcode='42501',message='Wayplan operator permission is required.';
 end if;
 v_options:=public.be_wayplan_assignment_options_v44();
 select coalesce(jsonb_agg(jsonb_build_object('id',record_key,'name',payload->>'vehicle_no','capacity_kg',payload->'capacity_kg','operation_type',payload->>'operation_type','branch_code',payload->>'branch_code','zone_code',payload->>'zone_code','zone_name',payload->>'zone_name') order by record_key),'[]'::jsonb)
 into v_vehicles from public.be_master_data_rows
 where dataset_key='fleet_master' and deleted_at is null and upper(coalesce(status,'ACTIVE'))='ACTIVE'
   and upper(coalesce(payload->>'status','ACTIVE')) in ('ACTIVE','ASSIGNED')
   and payload->>'operation_type' in ('DELIVERY','PICKUP_HIGHWAY');
 select coalesce(jsonb_agg(jsonb_build_object('vehicle_code',vehicle_code,'driver_code',driver_code,'rider_code',rider_code,'helper_code',helper_code)),'[]'::jsonb)
 into v_busy from public.be_wayplan_dispatches where wayplan_status in ('DISPATCHED','ON_HOLD');
 select coalesce(jsonb_object_agg(case branch_code when 'YGN' then 'YANGON' when 'MDY' then 'MANDALAY' when 'NPT' then 'NAYPYITAW' end,jsonb_build_object('branch_code',branch_code,'label',branch_name,'latitude',lat,'longitude',lng)),'{}'::jsonb)
 into v_route_origins from public.be_branch_offices
 where branch_code in ('YGN','MDY','NPT') and coalesce(active,true)=true and lat is not null and lng is not null;
 return jsonb_build_object('vehicles',v_vehicles,'drivers',v_options->'drivers','riders',v_options->'riders','helpers',v_options->'helpers','busy',v_busy,'route_origins',v_route_origins);
end $$;

create or replace function public.be_multi_trip_dispatch_ready_v43(p_wayplan_id text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_current public.be_wayplan_dispatches%rowtype; v_request text; v_wave integer; v_blocking text;
begin
 select * into v_current from public.be_wayplan_dispatches where wayplan_id=p_wayplan_id;
 if not found then return jsonb_build_object('ok',false,'error','WAYPLAN_NOT_FOUND'); end if;
 v_request:=nullif(v_current.metadata->>'multi_van_request','');
 v_wave:=greatest(1,coalesce(nullif(v_current.metadata->>'wave_no','')::integer,1));
 if v_request is null or v_wave<=1 then return jsonb_build_object('ok',true,'wave_no',v_wave); end if;
 select d.wayplan_id into v_blocking from public.be_wayplan_dispatches d
 where d.vehicle_code=v_current.vehicle_code and d.metadata->>'multi_van_request'=v_request
   and greatest(1,coalesce(nullif(d.metadata->>'wave_no','')::integer,1))<v_wave
   and upper(coalesce(d.wayplan_status,'')) not in ('COMPLETED','CANCELLED','CLOSED')
 order by greatest(1,coalesce(nullif(d.metadata->>'wave_no','')::integer,1)),d.wayplan_id limit 1;
 if v_blocking is not null then return jsonb_build_object('ok',false,'error','PREVIOUS_WAVE_NOT_COMPLETED','wayplan_id',p_wayplan_id,'wave_no',v_wave,'blocking_wayplan_id',v_blocking); end if;
 return jsonb_build_object('ok',true,'wave_no',v_wave);
end $$;
revoke all on function public.be_multi_trip_dispatch_ready_v43(text) from public,anon;
grant execute on function public.be_multi_trip_dispatch_ready_v43(text) to authenticated;