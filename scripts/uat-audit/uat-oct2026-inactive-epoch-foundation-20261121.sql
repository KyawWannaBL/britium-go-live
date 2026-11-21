-- HOSTED UAT ONLY: original October 2026 private write guard core, INACTIVE initial epoch.
-- Historical retired identifiers and identity links NOT imported. No application triggers attached.
BEGIN;
SET LOCAL statement_timeout = '45s';
DO $guard$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_user_account_registry)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Not verified isolated UAT'; END IF;
IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' OR (SELECT count(*) FROM public.be_waybill_ledger)<>0 OR (SELECT count(*) FROM public.be_portal_pickup_requests)<>2 OR (SELECT count(*) FROM public.be_data_entry_parcel_details)<>4 OR (SELECT count(*) FROM public.be_wayplan_dispatches)<>2 THEN RAISE EXCEPTION 'UAT baseline changed'; END IF;
IF to_regclass('private.be_oct2026_epoch') IS NOT NULL THEN RAISE EXCEPTION 'Existing private table be_oct2026_epoch'; END IF;
IF to_regclass('private.be_oct2026_identity_links') IS NOT NULL THEN RAISE EXCEPTION 'Existing private table be_oct2026_identity_links'; END IF;
IF to_regclass('private.be_oct2026_retired_keys') IS NOT NULL THEN RAISE EXCEPTION 'Existing private table be_oct2026_retired_keys'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname='be_oct2026_key_family') THEN RAISE EXCEPTION 'Existing private function be_oct2026_key_family'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname='be_preparation_row_allowed_v1') THEN RAISE EXCEPTION 'Existing private function be_preparation_row_allowed_v1'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname='be_oct2026_write_guard') THEN RAISE EXCEPTION 'Existing private function be_oct2026_write_guard'; END IF;
END $guard$;
CREATE FUNCTION private.be_oct2026_key_family(p_field text, p_table text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$select case when p_field='id' then case
 when p_table in ('be_pickup_requests','be_portal_pickup_requests','be_merchant_portal_pickup_requests','pickup_requests','pickup_request','pickups','pickups_2026_04_24','pickup_intake_requests','britium_pickup_request_master')then 'pickup'
 when p_table in ('be_wayplan_dispatches','be_wayplans','be_wayplans_v25','wayplans','way_plans','be_supervisor_wayplans','be_delivery_wayplans','be_dedicated_wayplans')then 'wayplan'
 when p_table in ('shipments','shipments_2026_02_11_14_10','shipments_2026_02_17_18_40','shipments_2026_02_19_13_00','shipments_2026_02_28_20_06')then 'shipment'
 when p_table in ('parcels','parcels_2026_02_18_17_00','be_data_entry_parcel_details','be_v32_parcels')then 'parcel'
 when p_table in ('routes','routes_2026_02_19_13_00','routes_2026_02_28_20_06','route_plans_2026_02_18_17_00','be_dispatch_routes','be_wayplan_routes','delivery_routes')then 'route'
 when p_table in ('manifests','warehouse_manifests','be_warehouse_manifests')then 'manifest'
 else 'row:'||p_table end else case
 when p_field in ('pickup_id','pickup_way_id','pickup_request_id','pickup_code','pickup_waybill_id','pickup_request_code','pickup_generated_id','pickup_order_no')then 'pickup'
 when p_field in ('delivery_way_id','deliver_way_id','way_id','waybill_no','tracking_no','tracking_number','awb','awb_number','tracking_code','tracking_waybill_no','deliver_id','delivery_id','waybill_id')then 'delivery'
 when p_field in ('wayplan_id','wayplan_code','wayplan_no')then 'wayplan'
 when p_field='shipment_id'then 'shipment' when p_field in('parcel_id','parcel_no')then 'parcel'
 when p_field in('route_id','route_no')then 'route' when p_field in('manifest_id','manifest_no')then 'manifest'
 when p_field in('batch_id','batch_no')then 'batch' else 'field:'||p_field end end$function$
;
REVOKE ALL ON FUNCTION private.be_oct2026_key_family(text,text) FROM PUBLIC,anon,authenticated;
CREATE TABLE private."be_oct2026_epoch" (
  "singleton" boolean DEFAULT true NOT NULL,
  "epoch" text DEFAULT '2026-10-20'::text NOT NULL,
  "cutoff_at" timestamp with time zone DEFAULT '2026-10-19 17:30:00+00'::timestamp with time zone NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "activated_at" timestamp with time zone,
  "report" jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT "be_oct2026_epoch_pkey" PRIMARY KEY (singleton),
  CONSTRAINT "be_oct2026_epoch_singleton_check" CHECK (singleton)
);
ALTER TABLE private."be_oct2026_epoch" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private."be_oct2026_epoch" FROM PUBLIC,anon,authenticated;
CREATE TABLE private."be_oct2026_identity_links" (
  "parent_table" text NOT NULL,
  "parent_column" text NOT NULL,
  "identity_table" text NOT NULL,
  "parent_type" text NOT NULL,
  CONSTRAINT "be_oct2026_identity_links_pkey" PRIMARY KEY (parent_table, parent_column)
);
ALTER TABLE private."be_oct2026_identity_links" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private."be_oct2026_identity_links" FROM PUBLIC,anon,authenticated;
CREATE TABLE private."be_oct2026_retired_keys" (
  "source_table" text NOT NULL,
  "key_field" text NOT NULL,
  "key_value" text NOT NULL,
  "key_family" text GENERATED ALWAYS AS (private.be_oct2026_key_family(key_field, source_table)) STORED,
  CONSTRAINT "be_oct2026_retired_keys_pkey" PRIMARY KEY (source_table, key_field, key_value)
);
ALTER TABLE private."be_oct2026_retired_keys" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private."be_oct2026_retired_keys" FROM PUBLIC,anon,authenticated;
INSERT INTO private.be_oct2026_epoch(singleton,epoch,cutoff_at,is_active,activated_at,report)
VALUES (true,'UAT-2026-11-21',clock_timestamp()+interval '1 day',false,NULL,'{"environment":"UAT","retired_keys_imported":false,"identity_links_verified":false}'::jsonb);
CREATE FUNCTION private.be_preparation_row_allowed_v1(p_table text, p_row jsonb)
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
REVOKE ALL ON FUNCTION private.be_preparation_row_allowed_v1(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.be_oct2026_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e private.be_oct2026_epoch; j jsonb; h jsonb; claims jsonb; k text; v text; link record;
begin
 select * into e from private.be_oct2026_epoch where singleton for share;
 if not e.is_active then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if tg_op='TRUNCATE' then raise exception 'GO_LIVE_TRUNCATE_DISABLED' using errcode='42501';end if;
 if clock_timestamp()<e.cutoff_at and not(
  e.epoch='2026-11-01' and coalesce((e.report->>'preparation_enabled')::boolean,false)
  and clock_timestamp()>=coalesce((e.report->>'record_floor_at')::timestamptz,e.cutoff_at)
  and private.be_preparation_row_allowed_v1(tg_table_name,case when tg_op='DELETE'then to_jsonb(old)else to_jsonb(new)end)
 )then raise exception 'GO_LIVE_NOT_OPEN: preparation only; delivery execution and financial payment/settlement open at the business cutoff' using errcode='55000';end if;
 h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 if session_user not in ('postgres','supabase_admin') and (e.epoch<>'2026-10-20' or coalesce(claims->>'role','')<>'service_role')
   and h->>'x-britium-data-epoch' is distinct from e.epoch then
  raise exception 'OBSOLETE_CLIENT_EPOCH: refresh or upgrade the application before submitting' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old;end if;
 if tg_table_name in ('wallet_accounts','be_party_wallet_accounts')then return new;end if;
 j:=to_jsonb(new);
 if tg_when='BEFORE' and tg_op='INSERT' and j ? 'created_at' and nullif(j->>'created_at','') is null then
  new:=jsonb_populate_record(new,jsonb_build_object('created_at',clock_timestamp()));j:=to_jsonb(new);
 end if;
 if j ? 'created_at' and nullif(j->>'created_at','') is not null and (j->>'created_at')::timestamptz<(case when e.epoch='2026-11-01'and coalesce((e.report->>'preparation_enabled')::boolean,false)then coalesce((e.report->>'record_floor_at')::timestamptz,e.cutoff_at)else e.cutoff_at end) then
  raise exception 'PRE_CUTOFF_TRANSACTION_REJECTED' using errcode='22023';
 end if;
 for k,v in select key,value from jsonb_each_text(j) where key in
 ('id','pickup_id','pickup_way_id','pickup_request_id','pickup_code','delivery_way_id','deliver_way_id','way_id','waybill_no','tracking_no','tracking_number','awb','awb_number','tracking_code','tracking_waybill_no','deliver_id','delivery_id','waybill_id','pickup_waybill_id','pickup_request_code','pickup_generated_id','pickup_order_no','shipment_id','parcel_id','wayplan_id','wayplan_code','wayplan_no','route_id','route_no','manifest_id','manifest_no','batch_id','batch_no','parcel_no') loop
  if nullif(btrim(v),'') is null then continue;end if;
  if exists(select 1 from private.be_oct2026_retired_keys r where r.key_value=lower(btrim(v)) and
    ((k='id' and r.source_table=tg_table_name and r.key_field='id') or (k<>'id' and r.key_family=private.be_oct2026_key_family(k,tg_table_name)))) then
   raise exception 'RETIRED_TRANSACTION_REJECTED: %',k using errcode='22023';
  end if;
 end loop;
 if tg_when='AFTER' then
  for link in select * from private.be_oct2026_identity_links where parent_table=tg_table_name loop
   execute format('insert into private.%I(%I) select ($1->>$2)::%s where nullif($1->>$2,'''') is not null on conflict do nothing',link.identity_table,link.parent_column,link.parent_type) using j,link.parent_column;
  end loop;
 end if;
 return new;
end $function$
;
REVOKE ALL ON FUNCTION private.be_oct2026_write_guard() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
