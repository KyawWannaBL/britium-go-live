-- Permit registration request completion during October 31 preparation.
-- Keep the business opening, provenance floor, archive and financial gates unchanged.
CREATE OR REPLACE FUNCTION private.be_preparation_row_allowed_v1(p_table text, p_row jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare k text;v text;
begin
 if p_table<>all(array[
 'be_pickup_requests','be_portal_pickup_requests','be_portal_pickup_request_items','be_portal_cargo_events',
 'be_pickup_count_change_requests_v1','be_pickup_parcel_verifications','be_rider_parcel_verifications',
 'be_data_entry_parcel_details','be_data_entry_parcels','be_data_entry_register_rows','be_data_entry_register_batches',
 'be_data_entry_pending_drafts','be_data_entry_financial_v2_requests_v58','be_parcel_financial_audit_v2',
 'parcels','shipments','be_v32_parcels','be_large_shipment_rows',
 'be_delivery_way_id_registry','be_delivery_way_id_aliases_v33','be_way_id_reconciliation_archive_v33',
 'be_delivery_location_registry','be_delivery_address_history','be_waybill_ledger',
 'be_finance_calculation_projection_v4','be_finance_predispatch_reviews_v1',
 'be_enterprise_workflow_events',
 'be_warehouse_inventory','be_warehouse_inventory_rows','be_warehouse_wayplan_handoffs_v150',
 'be_wayplan_dispatches','be_wayplan_dispatch_stops','be_wayplan_membership_v40','be_wayplan_review_v43',
 'be_wayplan_review_events_v43','be_wayplan_events_v40','be_wayplan_routes','be_wayplans','be_wayplan_items','be_wayplan_stops',
 'be_wayplan_route_versions_v1','be_wayplan_route_version_stops_v1','be_wayplan_warehouse_loading_snapshots_v1',
 'be_dispatch_job_assignments','be_app_notifications','be_commission_events','be_document_print_approval_requests'
 ])then return false;end if;
 if p_table='be_commission_events' then
  -- Genuine advance pickup earns an unapproved commission; no credit/payment/settlement is allowed.
  if upper(coalesce(p_row->>'operation_type',''))<>'PICKUP'
   or upper(coalesce(p_row->>'event_status',''))not in('READY','PENDING','CANCELLED','VOID')then return false;end if;
 end if;
 if p_table='be_wayplan_dispatches'and upper(coalesce(p_row->>'wayplan_status','CREATED'))not in('CREATED','DRAFT','CANCELLED')then return false;end if;
 for k,v in select key,value from jsonb_each_text(p_row)loop
  if k in('dispatched_at','completed_at','delivered_at','delivery_completed_at','financial_settled_at',
    'cod_received_at','cod_collected_at','cod_settled_at','collected_at','handed_over_at','closed_at','paid_at','settled_at','loaded_to_vehicle_at','handed_over_to_rider_at')
    and nullif(btrim(v),'')is not null
    -- This timestamp completes an idempotent registration request, not a delivery.
    and not(p_table='be_data_entry_financial_v2_requests_v58'and k='completed_at'
      and p_row->>'status'='COMPLETE'
      and p_row->>'operation'in('SAVE','IMPORT','CREATE_WAYBILL','ADD_REGISTRATIONS','SAVE_ALL','SAVE_BATCH_V22'))
    then return false;end if;
  if k in('cod_collected','cod_collected_amount','collected_amount','cash_collected','total_cod_collected','paid_amount','settled_amount','cod_settled_amount','cod_handed_over','handover_amount')
    and coalesce(nullif(v,''),'0')::numeric<>0 then return false;end if;
  if k in('settlement_status','finance_status','cod_status','invoice_status','collection_status','payment_status')
   and upper(coalesce(v,''))in('COLLECTED','PAID','SETTLED','FINANCE_SETTLED','HANDED_OVER_TO_FINANCE','PAYMENT_COMPLETED')then return false;end if;
  if k in('status','wayplan_status','stop_status','dispatch_status','delivery_status','rider_status','warehouse_status','overall_status','operation_status','parcel_status','item_status','membership_status','route_status','pickup_status','workflow_stage','rider_app_stage','driver_status','helper_status')
   and not(p_table='be_data_entry_financial_v2_requests_v58'and k='status'and upper(coalesce(v,''))='COMPLETED')
   and not(p_table in('be_portal_pickup_requests','be_pickup_requests')and k in('status','rider_status','driver_status','helper_status','pickup_status','workflow_stage','rider_app_stage')and upper(coalesce(v,''))in('COMPLETED','COLLECTED'))
   and upper(coalesce(v,''))in('DISPATCHED','OUT_FOR_DELIVERY','IN_TRANSIT','DELIVERED','COMPLETED','DELIVERY_COMPLETED','DELIVERY_STARTED','ARRIVED_AT_CUSTOMER','PARTIALLY_DELIVERED','FAILED_DELIVERY','COLLECTED','RETURNED','RETURN_TO_ORIGIN','RTO','PAID','SETTLED')then return false;end if;
 end loop;
 return true;
end $function$
;
revoke all on function private.be_preparation_row_allowed_v1(text,jsonb) from public,anon,authenticated,service_role;

