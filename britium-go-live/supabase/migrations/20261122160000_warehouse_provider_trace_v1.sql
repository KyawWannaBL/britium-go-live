-- Reconcile provider responsibility and workflow evidence by Way ID. Read-only, management/finance only.
-- Provider route indication MUST NOT be treated as confirmed physical custody.
create or replace function public.be_warehouse_provider_trace_v1(p_way_ids text[])
returns jsonb language plpgsql stable security definer
set search_path=public,pg_temp
as $f$
declare v_role text := lower(replace(coalesce(public.be_current_role(),''),'-','_'));
v_payload jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
 if v_role not in ('superadmin','admin','finance') then
  raise exception 'WAREHOUSE_PROVIDER_TRACE_ROLE_REQUIRED' using errcode='42501'; end if;
 if p_way_ids is null or cardinality(p_way_ids)>150 then
  raise exception 'INVALID_WAY_IDS' using errcode='22023'; end if;
 with requested as (
  select distinct upper(btrim(way)) way_id from unnest(p_way_ids) way
  where length(btrim(way)) between 5 and 80
 ),
 entry as (
  select distinct on(upper(btrim(d.delivery_way_id))) upper(btrim(d.delivery_way_id)) way_id,
    coalesce(d.delivery_route_mode,'') route_mode,
    coalesce(d.delivery_region,'') region,
    coalesce(d.handoff_station_code,'') station_code,
    coalesce(d.handoff_station_name,'') station_name,
    coalesce(d.warehouse_status,'') registration_warehouse_status
  from public.be_data_entry_parcel_details d join requested r on upper(btrim(d.delivery_way_id))=r.way_id
  order by upper(btrim(d.delivery_way_id)),d.updated_at desc nulls last
 ),
 overrides as (
  select distinct on (upper(btrim(o.delivery_way_id)))
    upper(btrim(o.delivery_way_id)) way_id,o.override_provider_code,
    o.automatic_provider_code,o.changed_at,o.revision
  from public.be_parcel_provider_overrides_v1 o join requested r on upper(btrim(o.delivery_way_id))=r.way_id
  order by upper(btrim(o.delivery_way_id)),o.revision desc,o.changed_at desc
 ),
 tp as (
  select distinct on (upper(btrim(t.delivery_way_id))) upper(btrim(t.delivery_way_id)) way_id,
    t.provider_code,t.finance_review_status,t.actual_settlement_posted,t.cs_outcome
  from public.be_thirdparty_finance_review_queue_v1 t join requested r on upper(btrim(t.delivery_way_id))=r.way_id
  order by upper(btrim(t.delivery_way_id)),t.updated_at desc nulls last
 ),
 custody as (
  select distinct on (upper(btrim(c.delivery_way_id))) upper(btrim(c.delivery_way_id)) way_id,
    c.provider_code,c.handover_manifest_ref,c.provider_receipt_ref,
    c.provider_receiver_name,c.physically_handed_over_at,c.proof_reference
  from public.be_provider_transfer_custody_v1 c join requested r on upper(btrim(c.delivery_way_id))=r.way_id
  order by upper(btrim(c.delivery_way_id)),c.physically_handed_over_at desc nulls last,c.created_at desc
 ),
 wayplan as (
  select distinct on (upper(btrim(s.delivery_way_id))) upper(btrim(s.delivery_way_id)) way_id,
    s.wayplan_id,s.branch_code,s.stop_status,s.rider_status,s.delivered_at,
    s.proof_url,s.rider_proof_url,s.dispatch_status,s.finance_status
  from public.be_wayplan_dispatch_stops s join requested r on upper(btrim(s.delivery_way_id))=r.way_id
  order by upper(btrim(s.delivery_way_id)),s.updated_at desc nulls last
 ),
 cod as (
  select distinct on (upper(btrim(c.delivery_way_id))) upper(btrim(c.delivery_way_id)) way_id,
    c.settlement_status,c.settlement_reference,c.cod_expected,c.cod_collected
  from public.be_wayplan_cod_settlements c join requested r on upper(btrim(c.delivery_way_id))=r.way_id
  order by upper(btrim(c.delivery_way_id)),c.updated_at desc nulls last
 ),
 merchant as (
  select distinct on (upper(btrim(m.delivery_way_id))) upper(btrim(m.delivery_way_id)) way_id,
   m.settlement_state
  from public.be_v_finance_merchant_settlement_queue_v2 m join requested r on upper(btrim(m.delivery_way_id))=r.way_id
  order by upper(btrim(m.delivery_way_id))
 ),
 tracking as (
  select r.way_id,e.route_mode,e.region,e.station_code,e.station_name,
   o.override_provider_code,t.provider_code tp_provider,c.provider_code custody_provider,
   p.wayplan_id,p.branch_code,p.stop_status,p.rider_status,p.dispatch_status,p.delivered_at,
   (nullif(p.proof_url,'') is not null or nullif(p.rider_proof_url,'') is not null) delivery_proof_recorded,
   c.handover_manifest_ref,c.provider_receiver_name,c.physically_handed_over_at,
   c.provider_receipt_ref,c.proof_reference,
   co.settlement_status cod_status,co.settlement_reference cod_reference,
   co.cod_expected,co.cod_collected,
   t.finance_review_status provider_finance_status,t.actual_settlement_posted,
   m.settlement_state merchant_settlement_status,
   case
     when nullif(btrim(coalesce(c.provider_code,'')),'') is not null then c.provider_code
     when nullif(btrim(coalesce(o.override_provider_code,'')),'') is not null then o.override_provider_code
     when nullif(btrim(coalesce(t.provider_code,'')),'') is not null then t.provider_code
     when upper(coalesce(e.route_mode,''))='HIGHWAY_BUS_STATION' then 'ဂိတ်ချ'
     when upper(coalesce(e.route_mode,''))='ROYAL_EXPRESS' then 'Royal Express'
     when p.wayplan_id is not null then 'Britium Express'
     else 'UNASSIGNED / VERIFY'
   end provider_label,
   case
     when c.physically_handed_over_at is not null and nullif(btrim(coalesce(c.provider_receipt_ref,'')),'') is not null then 'HANDOVER_RECEIPT_CONFIRMED'
     when c.provider_code is not null then 'HANDOVER_RECORD_UNVERIFIED'
     when o.override_provider_code is not null then 'PROVIDER_OVERRIDE_NO_CUSTODY_PROOF'
     when t.provider_code is not null then 'THIRD_PARTY_FINANCE_NO_CUSTODY_PROOF'
     when e.route_mode in ('ROYAL_EXPRESS','HIGHWAY_BUS_STATION') then 'ROUTE_INDICATION_ONLY'
     when p.wayplan_id is not null then 'WAYPLAN_ASSIGNED_NOT_PROVIDER_CONFIRMED'
     else 'UNASSIGNED'
   end provider_evidence,
   case when c.physically_handed_over_at is not null and nullif(btrim(coalesce(c.provider_receipt_ref,'')),'') is not null
     then 'RECEIPT_CONFIRMED'
    when nullif(btrim(coalesce(c.handover_manifest_ref,'')),'') is not null then 'MANIFEST_ONLY'
    else 'NOT_RECORDED' end custody_stage
  from requested r
  left join entry e using(way_id)
  left join overrides o using(way_id)
  left join tp t using(way_id)
  left join custody c using(way_id)
  left join wayplan p using(way_id)
  left join cod co using(way_id)
  left join merchant m using(way_id)
 )
 select coalesce(jsonb_agg(to_jsonb(tracking) order by way_id),'[]'::jsonb)
 into v_payload from tracking;
 return jsonb_build_object('rows',v_payload,'as_of',now(),'read_only',true,
  'warning','Routing selection or wayplan does not establish physical provider receipt.');
end;$f$;
revoke all on function public.be_warehouse_provider_trace_v1(text[]) from public,anon;
grant execute on function public.be_warehouse_provider_trace_v1(text[]) to authenticated;
