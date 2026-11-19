-- Disposable UAT-308 CI fixture: exact production catalog definitions, 2026-11-20.
-- No user, merchant, settlement or finance records are copied.
-- Never apply to hosted UAT or production outside reviewed migration process.
CREATE OR REPLACE FUNCTION private.be_current_operational_way_v1(p_way text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.be_data_entry_parcel_details p
 where p.delivery_way_id=p_way and p.created_at>=public.be_golive_live_cutoff_v1())
 and not exists(select 1 from private.be_oct2026_retired_keys k
 where k.key_family='delivery'and k.key_value=lower(btrim(p_way))) $function$
;
REVOKE ALL ON FUNCTION private.be_current_operational_way_v1(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW private.be_oct2026_external_settlement_review_v1 AS
 SELECT source_sha256,
    delivery_way_id,
    sheet_date,
    source_sheet,
    source_row,
    final_cod_mmk,
    cash_mmk,
    kpay_mmk,
    source_check,
    parcel_status,
    way_management_status,
    financial_validation_status,
    system_cod_amount,
    system_actual_collect,
    review_state,
    delivery_stop_count,
    return_stop_count,
    delivered_stop_count,
    system_amount_delta_mmk,
    payment_split_delta_mmk,
    finance_record_count,
    settled_finance_record_count
   FROM ( SELECT m.source_sha256,
            m.delivery_way_id,
            m.sheet_date,
            m.source_sheet,
            m.source_row,
            m.final_cod_mmk,
            m.cash_mmk,
            m.kpay_mmk,
            m.source_check,
            p.parcel_status,
            p.way_management_status,
            p.financial_validation_status,
            p.cod_amount AS system_cod_amount,
            p.actual_collect AS system_actual_collect,
                CASE
                    WHEN p.delivery_way_id IS NULL THEN 'MISSING_PRODUCTION_PARCEL'::text
                    WHEN COALESCE(st.return_stop_count, 0::bigint) > 0 OR upper(COALESCE(p.parcel_status, ''::text)) = 'RETURN_SCANNED'::text THEN 'RETURN_HISTORY_CONFLICT'::text
                    WHEN m.source_check <> 'MATCHED'::text THEN 'PAYMENT_SPLIT_EXCEPTION'::text
                    WHEN abs(COALESCE(m.final_cod_mmk, 0::numeric) - COALESCE(p.cod_amount, 0::numeric)) > 0.01 THEN 'COD_AMOUNT_MISMATCH'::text
                    WHEN upper(COALESCE(p.parcel_status, ''::text)) <> 'DELIVERED'::text THEN 'DELIVERY_RECONCILIATION_REQUIRED'::text
                    ELSE 'FINANCE_RECEIPT_REVIEW'::text
                END AS review_state,
            COALESCE(st.total_stops, 0::bigint)::integer AS delivery_stop_count,
            COALESCE(st.return_stop_count, 0::bigint)::integer AS return_stop_count,
            COALESCE(st.delivered_stop_count, 0::bigint)::integer AS delivered_stop_count,
            COALESCE(m.final_cod_mmk, 0::numeric) - COALESCE(p.cod_amount, 0::numeric) AS system_amount_delta_mmk,
            COALESCE(m.cash_mmk, 0::numeric) + COALESCE(m.kpay_mmk, 0::numeric) - COALESCE(m.final_cod_mmk, 0::numeric) AS payment_split_delta_mmk,
            COALESCE(fin.finance_record_count, 0::bigint)::integer AS finance_record_count,
            COALESCE(fin.settled_record_count, 0::bigint)::integer AS settled_finance_record_count
           FROM private.be_oct2026_external_settlement_manifest m
             LEFT JOIN be_data_entry_parcel_details p ON p.delivery_way_id = m.delivery_way_id
             LEFT JOIN LATERAL ( SELECT count(*) AS total_stops,
                    count(*) FILTER (WHERE upper(COALESCE(s.stop_status, ''::text)) = ANY (ARRAY['RETURN_TO_WAREHOUSE'::text, 'RTO'::text, 'FAILED_DELIVERY'::text, 'CANCELLED'::text])) AS return_stop_count,
                    count(*) FILTER (WHERE upper(COALESCE(s.stop_status, ''::text)) = 'DELIVERED'::text) AS delivered_stop_count
                   FROM be_wayplan_dispatch_stops s
                  WHERE s.delivery_way_id = m.delivery_way_id) st ON true
             LEFT JOIN LATERAL ( SELECT count(*) AS finance_record_count,
                    count(*) FILTER (WHERE upper(COALESCE(f.settlement_status, ''::text)) = 'SETTLED'::text) AS settled_record_count
                   FROM be_finance_cod_settlements_v48 f
                  WHERE f.delivery_way_id = m.delivery_way_id) fin ON true) current_source
  WHERE private.be_current_operational_way_v1(delivery_way_id);
;
REVOKE ALL ON TABLE private.be_oct2026_external_settlement_review_v1 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE VIEW private.be_oct20_22_dispatch_evidence_worklist_v1 AS
 SELECT sheet_date,
    source_sheet,
    source_row,
    delivery_way_id,
    scan_status,
    scanned_at,
    scanned_by,
    scan_review,
    parcel_status,
    financial_review_state,
    stop_evidence,
    delivery_review
   FROM ( SELECT m.sheet_date,
            m.source_sheet,
            m.source_row,
            m.delivery_way_id,
            s.scan_status,
            s.scanned_at,
            s.scanned_by,
                CASE
                    WHEN s.delivery_way_id IS NULL THEN 'MISSING_SCAN_EVIDENCE'::text
                    WHEN s.scanned_by = 'postgres'::text THEN 'SYSTEM_ATTRIBUTED_SCAN_REVIEW'::text
                    ELSE 'RECORDED_STAFF_SCAN'::text
                END AS scan_review,
            p.parcel_status,
            x.review_state AS financial_review_state,
            COALESCE(( SELECT jsonb_agg(jsonb_build_object('status', t.stop_status, 'reason', t.failed_reason, 'wayplan_id', t.wayplan_id)) AS jsonb_agg
                   FROM be_wayplan_dispatch_stops t
                  WHERE t.delivery_way_id = m.delivery_way_id), '[]'::jsonb) AS stop_evidence,
                CASE
                    WHEN (EXISTS ( SELECT 1
                       FROM be_wayplan_dispatch_stops t
                      WHERE t.delivery_way_id = m.delivery_way_id AND t.stop_status = 'RETURN_TO_WAREHOUSE'::text)) THEN 'RETURN_HISTORY_REVIEW'::text
                    WHEN (EXISTS ( SELECT 1
                       FROM be_wayplan_dispatch_stops t
                      WHERE t.delivery_way_id = m.delivery_way_id AND t.stop_status = 'DELIVERED'::text)) THEN 'DELIVERED_STOP_REVIEW'::text
                    ELSE 'NO_TERMINAL_STOP_EVIDENCE'::text
                END AS delivery_review
           FROM private.be_oct2026_external_settlement_manifest m
             LEFT JOIN be_dispatch_scans_v39 s ON s.delivery_way_id = m.delivery_way_id
             LEFT JOIN be_data_entry_parcel_details p ON p.delivery_way_id = m.delivery_way_id
             LEFT JOIN private.be_oct2026_external_settlement_review_v1 x ON x.delivery_way_id = m.delivery_way_id AND x.source_sha256 = m.source_sha256) current_source
  WHERE private.be_current_operational_way_v1(delivery_way_id);
;
REVOKE ALL ON TABLE private.be_oct20_22_dispatch_evidence_worklist_v1 FROM PUBLIC,anon,authenticated;
