-- Read-only reconciliation snapshot for current third-party ways.
-- Inventory is a reference feed only: no automatic amount edits, completion or settlement.
create or replace function public.be_cs_thirdparty_reconcile_preview_v1(p_way_ids text[])
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_role text; v_rows jsonb;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTH_REQUIRED'); end if;
 v_role := lower(replace(coalesce(public.be_current_role(),''),'-','_'));
 if v_role not in ('customer_service','cs','support','superadmin','super_admin','admin','operation_manager','finance','finance_manager','accountant')
 then return jsonb_build_object('ok',false,'error','CS_OR_FINANCE_ROLE_REQUIRED'); end if;
 if coalesce(array_length(p_way_ids,1),0) > 300 then return jsonb_build_object('ok',false,'error','TOO_MANY_WAYS'); end if;
 with requested as (select distinct unnest(p_way_ids) as way_id),
 inv as (
  select w.way_id,count(*)::integer inventory_row_count,
    min(w.cod_amount) inventory_cod_min,max(w.cod_amount) inventory_cod_max,
    max(nullif(w.township,'')) inventory_township
  from public.be_warehouse_inventory_rows w
  join requested q on q.way_id=w.way_id
  group by w.way_id
 ), parcel as (
  select p.delivery_way_id,p.township,p.city,p.region_state,p.delivery_route_mode,
   p.handoff_station_name,p.handoff_station_code,p.cod_amount,p.delivery_charges,p.saved_at,
   (select count(*) from public.be_data_entry_parcel_details z where z.delivery_way_id=p.delivery_way_id)::integer parcel_master_row_count
  from public.be_data_entry_parcel_details p
  join requested q on q.way_id=p.delivery_way_id
  where private.be_current_operational_way_v1(p.delivery_way_id)
   and (p.delivery_route_mode='ROYAL_EXPRESS' or exists (
    select 1 from private.be_thirdparty_schedule_way_rows_v1 s
    where s.delivery_way_id=p.delivery_way_id and s.scheduled_on >= (public.be_golive_live_cutoff_v1() at time zone 'Asia/Yangon')::date
   ))
 ) select coalesce(jsonb_agg(jsonb_build_object(
    'delivery_way_id',p.delivery_way_id,'township',p.township,'city',p.city,
    'region_state',p.region_state,'delivery_route_mode',p.delivery_route_mode,
    'handoff_station_name',p.handoff_station_name,'handoff_station_code',p.handoff_station_code,
    'system_cod_amount',p.cod_amount,'delivery_charges',p.delivery_charges,
    'inventory_row_count',coalesce(i.inventory_row_count,0),
    'inventory_cod_min',i.inventory_cod_min,'inventory_cod_max',i.inventory_cod_max,
    'inventory_township',i.inventory_township,
    'parcel_master_row_count',p.parcel_master_row_count,
    'inventory_amount_conflict',(i.inventory_row_count>0 and (i.inventory_cod_min is distinct from p.cod_amount or i.inventory_cod_max is distinct from p.cod_amount)),
    'duplicate_inventory_way',(i.inventory_row_count>1),
    'route_review_required',(
      (p.township ~ '(လယ်ဝေး|တပ်ကုန်း|Lewe|Tatkon)' and p.delivery_route_mode='ROYAL_EXPRESS')
      or (p.region_state ilike '%Yangon%' and p.delivery_route_mode='ROYAL_EXPRESS')
      or (p.region_state ilike '%Mandalay%' and p.delivery_route_mode='ROYAL_EXPRESS')
    ),
    'inventory_source','be_warehouse_inventory_rows (reference only; check source date)'
  ) order by p.delivery_way_id),'[]'::jsonb) into v_rows
 from parcel p left join inv i on i.way_id=p.delivery_way_id;
 return jsonb_build_object('ok',true,'rows',v_rows,'read_only',true);
end $$;
revoke all on function public.be_cs_thirdparty_reconcile_preview_v1(text[]) from public,anon;
grant execute on function public.be_cs_thirdparty_reconcile_preview_v1(text[]) to authenticated;
