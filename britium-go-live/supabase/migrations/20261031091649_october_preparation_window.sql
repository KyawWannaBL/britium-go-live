-- Separate new-data provenance and preparation from the November delivery opening.
create or replace function private.be_preparation_row_allowed_v1(p_table text,p_row jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
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
    and nullif(btrim(v),'')is not null then return false;end if;
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
end $$;
revoke all on function private.be_preparation_row_allowed_v1(text,jsonb) from public,anon,authenticated,service_role;

create or replace function private.be_oct2026_write_guard()returns trigger
language plpgsql security definer set search_path='' as $$
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
end $$;
revoke all on function private.be_oct2026_write_guard() from public,anon,authenticated,service_role;


-- Row visibility uses the immutable new-data floor, including after business opening.
create or replace function public.be_golive_live_cutoff_v1()returns timestamptz
language sql stable security definer set search_path='' as $$
 select coalesce((select case when epoch='2026-11-01'and coalesce((report->>'preparation_enabled')::boolean,false)
 then coalesce((report->>'record_floor_at')::timestamptz,cutoff_at)else cutoff_at end
 from private.be_oct2026_epoch where singleton and is_active),
 (select cutoff_at from private.be_golive_readiness_cutovers_v1 where cutover_code='PRE_GOLIVE_UAT_20260901')) $$;

-- Restore only the exact archived runtime singleton; retain all transaction archives.
do $$
declare e private.be_oct2026_epoch;v_batch uuid;t record;actual jsonb;expected jsonb;
begin
 select * into e from private.be_oct2026_epoch where singleton for update;
 if e.epoch<>'2026-11-01'or not e.is_active then return;end if;
 v_batch:=(e.report->>'archive_batch_id')::uuid;
 if v_batch is null or not exists(select 1 from private.be_cutover_batches_v3 where id=v_batch and status='ACTIVE')then return;end if;
 select payload into expected from private.be_cutover_rows_v3 where batch_id=v_batch and table_name='be_data_entry_financial_v2_runtime_v58';
 if expected is null or expected->>'mutation_mode'<>'ACTIVE'then raise exception 'ARCHIVED_RUNTIME_CONFIGURATION_REQUIRED';end if;
 expected:=to_jsonb(jsonb_populate_record(null::public.be_data_entry_financial_v2_runtime_v58,expected));
 lock table public.be_data_entry_financial_v2_runtime_v58 in access exclusive mode;
 select to_jsonb(x)into actual from public.be_data_entry_financial_v2_runtime_v58 x where singleton;
 if actual is not null and actual is distinct from expected then raise exception 'RUNTIME_CONFIGURATION_DRIFT';end if;
 for t in select tgname from pg_trigger where tgrelid='public.be_data_entry_financial_v2_runtime_v58'::regclass
 and tgfoid='private.be_oct2026_write_guard()'::regprocedure and not tgisinternal loop
 execute format('drop trigger %I on public.be_data_entry_financial_v2_runtime_v58',t.tgname);end loop;
 if actual is null then insert into public.be_data_entry_financial_v2_runtime_v58
 select (jsonb_populate_record(null::public.be_data_entry_financial_v2_runtime_v58,expected)).*;end if;
 select to_jsonb(x)into actual from public.be_data_entry_financial_v2_runtime_v58 x where singleton;
 if actual is distinct from expected then raise exception 'RUNTIME_RESTORE_MISMATCH';end if;
 delete from private.be_cutover_scope_v3 where table_name='be_data_entry_financial_v2_runtime_v58';
 delete from private.be_oct2026_scope where table_name='be_data_entry_financial_v2_runtime_v58';
 update private.be_oct2026_epoch set report=report||jsonb_build_object(
 'preparation_enabled',true,'record_floor_at',activated_at,'preparation_open_at',clock_timestamp(),
 'business_open_at',cutoff_at,'preparation_policy','DATA_ENTRY_PICKUP_VERIFICATION_CREATED_WAYPLAN_ONLY',
 'configuration_correction','Exact archived Financial V2 runtime restored; configuration excluded from future transaction scope',
 'rows_removed',case when report?'configuration_correction'then(report->>'rows_removed')::bigint else coalesce((report->>'rows_removed')::bigint,0)-1 end,
 'current_transaction_scope_tables',(select count(*)from private.be_cutover_scope_v3),
 'recovery_note','Original archive remains intact. Policy/configuration change and new preparation require reconciliation rather than blind full restore.')where singleton;
 update private.be_cutover_batches_v3 set evidence=evidence||jsonb_build_object(
 'preparation_authorization','Owner requires 31 October data entry and planning for 1 November delivery operations',
 'configuration_correction','Restored exact ACTIVE runtime singleton; all archived financial claims unchanged',
 'automatic_restore','REQUIRES_RECONCILIATION_AFTER_PREPARATION_POLICY_CHANGE')where id=v_batch;
end $$;

CREATE OR REPLACE FUNCTION public.be_go_live_cutover_status_v3()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b private.be_cutover_batches_v3;e private.be_oct2026_epoch;
begin
 if auth.uid()is null or not exists(select 1 from public.be_user_account_registry r where r.auth_user_id=auth.uid()and upper(r.role)in('SUPERADMIN','SUPER_ADMIN')and coalesce(r.active,true)and coalesce(r.is_active,true))then raise exception 'Active Superadmin status permission required'using errcode='42501';end if;
 select * into b from private.be_cutover_batches_v3 order by (status='ACTIVE')desc,created_at desc limit 1;
 select * into e from private.be_oct2026_epoch where singleton;
 return jsonb_build_object('ok',true,'current_isolation',e.report,'plan',case when b.id is null then null else b.manifest||jsonb_build_object('status',b.status,'expires_at',b.expires_at,'technical_evidence',b.evidence,'activation_authorized',b.activation_authorized)end,
 'current_wallet_exposure',private.be_cutover_finance_v3(),'archived_financial_exposure',case when b.status='ACTIVE'then private.be_cutover_finance_archive_v3(b.id)else null end,
 'execution_enabled',false,'acceptance',jsonb_build_array(jsonb_build_object('name','Data entry, pickup verification and CREATED Wayplan preparation','status',case when coalesce((e.report->>'preparation_enabled')::boolean,false) then 'OPEN' else 'CLOSED' end),jsonb_build_object('name','Delivery dispatch, COD settlement and payouts','status',case when clock_timestamp()>=e.cutoff_at then 'OPEN' else 'OPENS 1 November 2026 00:00 Myanmar time' end),jsonb_build_object('name','Finance business acceptance','status','PENDING'),jsonb_build_object('name','Android phone/tablet acceptance','status','PENDING')));
end $function$;

revoke all on function public.be_go_live_cutover_status_v3()from public,anon;
grant execute on function public.be_go_live_cutover_status_v3()to authenticated;
