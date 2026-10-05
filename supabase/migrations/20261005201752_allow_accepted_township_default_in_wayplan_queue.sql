-- Keep warehouse-ready parcels visible to Wayplan after an explicit location acceptance.
-- Accepted township fallback coordinates are valid for planning; quarantined/default-placeholder coordinates remain blocked.
create or replace view public.be_v_dispatch_ready_queue as
 SELECT COALESCE(NULLIF(w.delivery_way_id, ''::text), NULLIF(d.delivery_way_id, ''::text)) AS delivery_way_id,
    COALESCE(NULLIF(d.financial_quote ->> 'source_waybill_no'::text, ''::text), NULLIF(w.waybill_no, ''::text), NULLIF(d.delivery_way_id, ''::text)) AS waybill_no,
    COALESCE(d.pickup_id, w.pickup_id) AS pickup_id,
    COALESCE(d.pickup_id, w.pickup_way_id, w.pickup_id) AS pickup_way_id,
    COALESCE(w.merchant_name, ''::text) AS merchant_name,
    COALESCE(d.recipient_name, w.recipient_name, w.customer_name, ''::text) AS recipient_name,
    COALESCE(d.contact_no_1, w.recipient_phone, w.contact_no_1, ''::text) AS recipient_phone,
    COALESCE(d.township, w.township, ''::text) AS township,
    COALESCE(d.recipient_address, w.recipient_address, w.delivery_address, ''::text) AS address,
    COALESCE(d.cod_amount, w.cod_amount, 0::numeric) AS cod_amount,
    COALESCE(d.delivery_fee, w.delivery_fee, 0::numeric) AS delivery_fee,
    COALESCE(d.weight_kg, w.weight_kg, w.parcel_weight_kg, w.total_weight_kg, 0::numeric) AS parcel_weight_kg,
    COALESCE(w.dispatch_status, 'READY_FOR_DISPATCH'::text) AS dispatch_status,
    wh.warehouse_status,
    COALESCE(d.way_management_status, w.wayplan_status, 'READY_FOR_WAYPLAN'::text) AS wayplan_status,
    COALESCE(w.created_at, d.saved_at, now()) AS created_at,
    COALESCE(w.updated_at, d.updated_at, now()) AS updated_at,
    jsonb_build_object('source', 'be_v_dispatch_ready_queue_location_quality_v30', 'registered_data_entry', true, 'financial_validation_status', d.financial_validation_status, 'canonical_warehouse_status', wh.warehouse_status, 'discrepancy_code', COALESCE(wh.discrepancy_code, ''::text), 'delivery_attempt_status', COALESCE(wh.delivery_attempt_status, ''::text), 'dispatch_status', w.dispatch_status, 'wayplan_status', COALESCE(d.way_management_status, w.wayplan_status), 'location_required', COALESCE(d.location_required, false), 'location_review_status', loc.review_status, 'location_match_level', loc.match_level, 'location_coordinate_source', loc.coordinate_source) AS metadata
   FROM be_data_entry_parcel_details d
     LEFT JOIN be_waybill_ledger w ON w.delivery_way_id = d.delivery_way_id
     JOIN LATERAL ( SELECT x.warehouse_status,
            x.discrepancy_code,
            x.delivery_attempt_status,
            x.updated_at
           FROM be_v_warehouse_receipt_v39 x
          WHERE x.delivery_way_id = d.delivery_way_id
          ORDER BY x.updated_at DESC NULLS LAST
         LIMIT 1) wh ON true
     LEFT JOIN be_delivery_location_registry loc ON loc.delivery_way_id = d.delivery_way_id
  WHERE (d.delivery_way_id ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$'::text OR d.delivery_way_id ~ '^P[0-9]{4}-[A-Z0-9]+-[0-9]+-[0-9]+$'::text AND d.photo_evidence_mode = 'OS_SOFTCOPY'::text AND d.os_imported_at IS NOT NULL AND NULLIF(d.source_file_name, ''::text) IS NOT NULL) AND (upper(COALESCE(d.financial_validation_status, ''::text)) = ANY (ARRAY['VALID'::text, 'OK'::text])) AND upper(COALESCE(wh.warehouse_status, ''::text)) = 'WAREHOUSE_READY'::text AND COALESCE(wh.discrepancy_code, ''::text) = ''::text AND upper(COALESCE(wh.delivery_attempt_status, ''::text)) <> 'RTO'::text AND (upper(COALESCE(d.parcel_status, ''::text)) <> ALL (ARRAY['DELIVERED'::text, 'RTO'::text, 'CANCELLED'::text, 'CLOSED'::text, 'SETTLED'::text])) AND (upper(COALESCE(w.dispatch_status, 'READY_FOR_DISPATCH'::text)) = ANY (ARRAY['READY_FOR_DISPATCH'::text, 'WAITING_DISPATCH'::text, 'READY'::text, 'WAYBILL_CREATED'::text, 'WAYPLAN_CREATED'::text])) AND (upper(COALESCE(w.wayplan_status, 'READY_FOR_WAYPLAN'::text)) = ANY (ARRAY['NOT_PLANNED'::text, 'READY_FOR_WAYPLAN'::text, 'WAYPLAN_CREATED'::text])) AND (COALESCE(d.location_required, false) = false OR loc.review_status = 'ACCEPTED'::text AND loc.latitude >= 9::numeric AND loc.latitude <= 29::numeric AND loc.longitude >= 92::numeric AND loc.longitude <= 102::numeric AND loc.coordinate_source <> 'QUARANTINED_BULK_COORDINATE_V30'::text AND NOT (round(loc.latitude::numeric, 5) = 16.80000 AND round(loc.longitude::numeric, 5) = 96.15000) AND ((loc.match_level = ANY (ARRAY['ADDRESS_EXACT'::text, 'POI_EXACT'::text])) OR loc.match_level = 'MANUAL'::text AND (loc.coordinate_source = ANY (ARRAY['DATA_ENTRY_MANUAL_PIN_V30'::text, 'DATA_ENTRY_MANUAL_COORDINATE'::text, 'PASTED_TOWNSHIP_VALIDATED_COORDINATE'::text, 'MANAGEMENT_POSTAL_VALIDATED_ADDRESS'::text])) OR loc.match_level = 'TOWNSHIP_DEFAULT'::text AND loc.coordinate_source = 'TOWNSHIP_DEFAULT_V136'::text)) AND NOT (EXISTS ( SELECT 1
           FROM be_wayplan_membership_v40 m
          WHERE m.delivery_way_id = d.delivery_way_id AND (m.membership_status = ANY (ARRAY['PLANNED'::text, 'READY_FOR_DISPATCH'::text, 'DISPATCHED'::text]))));;
