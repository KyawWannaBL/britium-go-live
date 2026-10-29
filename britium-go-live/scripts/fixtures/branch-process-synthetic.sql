-- Minimal synthetic tables for branch workflow tests; no production schema dump or data.
create table be_user_account_registry(auth_user_id uuid,email text,branch_code text,status text,active boolean,is_active boolean);
create table be_employee_territory_assignments(user_id uuid,branch_code text,scope_type text,active boolean,can_read boolean);
create table be_portal_pickup_requests(pickup_id text,branch_code text);
create table be_v32_parcels(waybill_no text,pickup_id text,created_at timestamptz);
create table be_data_entry_parcel_details(id uuid default gen_random_uuid(),delivery_way_id text,pickup_id text,parcel_sequence integer,recipient_name text,contact_no_1 text,contact_no_2 text,township text,township_key text,city text,region_state text,recipient_address text,customer_tier text,item_price numeric,weight_kg numeric,surcharge numeric,delivery_fee numeric,effective_declared_delivery_charge numeric,delivery_charges numeric,cod_amount numeric,actual_collect numeric,destination text,remark text,saved_at timestamptz,updated_at timestamptz,created_at timestamptz,financial_validation_status text,financial_quote jsonb);
create table be_branch_parcel_transfers_v1(id uuid default gen_random_uuid(),to_branch text);
create table be_branch_parcel_transfer_items_v1(transfer_id uuid,delivery_way_id text,received_at timestamptz);
create table be_document_print_approval_requests(id uuid default gen_random_uuid(),document_type text,document_no text,requested_by text,requested_by_role text,department text,request_reason text,requested_print_count integer,approval_status text default 'PENDING',consumed_at timestamptz,approved_by text,approved_at timestamptz,consumed_by text,consumed_print_log_id uuid,updated_at timestamptz);
create table be_document_print_log(id uuid default gen_random_uuid(),document_type text,document_no text,printed_by text,printed_by_role text,department text,print_count integer,approval_required boolean,approval_status text,approved_by text,approved_at timestamptz,reason text,metadata jsonb,created_at timestamptz default now());
create table be_waybill_print_audit_v38(pickup_id text,document_type text);
create table be_wayplan_roster_allowlist_v68(role_code text,workforce_code text,display_name text,branch_code text,active boolean);
create table be_mobile_workforce_accounts(worker_code text,workforce_code text,account_code text,rider_code text,driver_code text,helper_code text,role text,branch_code text,auth_user_id uuid,active boolean,is_active boolean);
create table be_wayplan_dispatches(wayplan_id text,branch_code text,rider_code text,driver_code text,helper_code text,wayplan_status text);
create table be_commission_events(id uuid default gen_random_uuid(),work_date date,source_key text,operation_type text,role_code text,wayplan_code text,metadata jsonb,assignee_name text,assignee_email text,unit_count numeric,rate_mmk numeric,commission_mmk numeric,event_status text,created_at timestamptz);
create table be_workforce_commission_finance_reviews_v210(commission_event_id uuid,decision text);
