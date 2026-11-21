-- BRITIUM HOSTED UAT ONLY: restore 16 original identity-link maps and EMPTY identity ledgers.
-- Historical/retired IDs are not imported, and epoch remains INACTIVE; not production-equivalent yet.
BEGIN;
SET LOCAL statement_timeout='45s';
DO $guard$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_user_account_registry)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Not hosted UAT'; END IF;
IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' OR (SELECT is_active FROM private.be_oct2026_epoch WHERE singleton) OR (SELECT count(*) FROM private.be_oct2026_identity_links)<>0 OR (SELECT count(*) FROM private.be_oct2026_retired_keys)<>0 THEN RAISE EXCEPTION 'Epoch not inactive or expected state changed'; END IF;
IF (SELECT count(*) FROM public.be_portal_pickup_requests)<>2 OR (SELECT count(*) FROM public.be_waybill_ledger)<>0 THEN RAISE EXCEPTION 'UAT QA data drift'; END IF;
IF to_regclass('private.be_oct2026_identity_96dab5452d2b588a') IS NOT NULL THEN RAISE EXCEPTION 'Identity table already exists: be_oct2026_identity_96dab5452d2b588a'; END IF;
IF to_regclass('private.be_oct2026_identity_e063bb483a5c0fab') IS NOT NULL THEN RAISE EXCEPTION 'Identity table already exists: be_oct2026_identity_e063bb483a5c0fab'; END IF;
IF to_regclass('private.be_oct2026_identity_1126df7dc5feaad8') IS NOT NULL THEN RAISE EXCEPTION 'Identity table already exists: be_oct2026_identity_1126df7dc5feaad8'; END IF;
IF to_regclass('private.be_oct2026_identity_d7f58a39b897bb54') IS NOT NULL THEN RAISE EXCEPTION 'Identity table already exists: be_oct2026_identity_d7f58a39b897bb54'; END IF;
IF to_regclass('private.be_oct2026_identity_655b00c24f7804df') IS NOT NULL THEN RAISE EXCEPTION 'Identity table already exists: be_oct2026_identity_655b00c24f7804df'; END IF;
IF to_regclass('private.be_oct2026_identity_7686fe66af52e156') IS NOT NULL THEN RAISE EXCEPTION 'Identity table already exists: be_oct2026_identity_7686fe66af52e156'; END IF;
IF to_regclass('private.be_oct2026_identity_33668b4886cb9f65') IS NOT NULL THEN RAISE EXCEPTION 'Identity table already exists: be_oct2026_identity_33668b4886cb9f65'; END IF;
IF to_regclass('private.be_oct2026_identity_83d1056157bcaad8') IS NOT NULL THEN RAISE EXCEPTION 'Identity table already exists: be_oct2026_identity_83d1056157bcaad8'; END IF;
IF to_regclass('private.be_oct2026_identity_d639ec901a3c5db4') IS NOT NULL THEN RAISE EXCEPTION 'Identity table already exists: be_oct2026_identity_d639ec901a3c5db4'; END IF;
IF to_regclass('private.be_oct2026_identity_78d3e90154aad5a4') IS NOT NULL THEN RAISE EXCEPTION 'Identity table already exists: be_oct2026_identity_78d3e90154aad5a4'; END IF;
IF to_regclass('private.be_oct2026_identity_7d251eea60e0ae46') IS NOT NULL THEN RAISE EXCEPTION 'Identity table already exists: be_oct2026_identity_7d251eea60e0ae46'; END IF;
IF to_regclass('private.be_oct2026_identity_1d45e282619664de') IS NOT NULL THEN RAISE EXCEPTION 'Identity table already exists: be_oct2026_identity_1d45e282619664de'; END IF;
IF to_regclass('private.be_oct2026_identity_8e3d29ef3d841693') IS NOT NULL THEN RAISE EXCEPTION 'Identity table already exists: be_oct2026_identity_8e3d29ef3d841693'; END IF;
IF to_regclass('private.be_oct2026_identity_f52ebf20d9059884') IS NOT NULL THEN RAISE EXCEPTION 'Identity table already exists: be_oct2026_identity_f52ebf20d9059884'; END IF;
IF to_regclass('private.be_oct2026_identity_2567eb7309f782f3') IS NOT NULL THEN RAISE EXCEPTION 'Identity table already exists: be_oct2026_identity_2567eb7309f782f3'; END IF;
IF to_regclass('private.be_oct2026_identity_00228602ff0591c6') IS NOT NULL THEN RAISE EXCEPTION 'Identity table already exists: be_oct2026_identity_00228602ff0591c6'; END IF;
END $guard$;
CREATE TABLE private.be_oct2026_identity_96dab5452d2b588a (id uuid PRIMARY KEY);
ALTER TABLE private.be_oct2026_identity_96dab5452d2b588a ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct2026_identity_96dab5452d2b588a FROM PUBLIC,anon,authenticated;
CREATE TABLE private.be_oct2026_identity_e063bb483a5c0fab (id uuid PRIMARY KEY);
ALTER TABLE private.be_oct2026_identity_e063bb483a5c0fab ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct2026_identity_e063bb483a5c0fab FROM PUBLIC,anon,authenticated;
CREATE TABLE private.be_oct2026_identity_1126df7dc5feaad8 (id uuid PRIMARY KEY);
ALTER TABLE private.be_oct2026_identity_1126df7dc5feaad8 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct2026_identity_1126df7dc5feaad8 FROM PUBLIC,anon,authenticated;
CREATE TABLE private.be_oct2026_identity_d7f58a39b897bb54 (id uuid PRIMARY KEY);
ALTER TABLE private.be_oct2026_identity_d7f58a39b897bb54 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct2026_identity_d7f58a39b897bb54 FROM PUBLIC,anon,authenticated;
CREATE TABLE private.be_oct2026_identity_655b00c24f7804df (id uuid PRIMARY KEY);
ALTER TABLE private.be_oct2026_identity_655b00c24f7804df ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct2026_identity_655b00c24f7804df FROM PUBLIC,anon,authenticated;
CREATE TABLE private.be_oct2026_identity_7686fe66af52e156 (id uuid PRIMARY KEY);
ALTER TABLE private.be_oct2026_identity_7686fe66af52e156 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct2026_identity_7686fe66af52e156 FROM PUBLIC,anon,authenticated;
CREATE TABLE private.be_oct2026_identity_33668b4886cb9f65 (id uuid PRIMARY KEY);
ALTER TABLE private.be_oct2026_identity_33668b4886cb9f65 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct2026_identity_33668b4886cb9f65 FROM PUBLIC,anon,authenticated;
CREATE TABLE private.be_oct2026_identity_83d1056157bcaad8 (id integer PRIMARY KEY);
ALTER TABLE private.be_oct2026_identity_83d1056157bcaad8 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct2026_identity_83d1056157bcaad8 FROM PUBLIC,anon,authenticated;
CREATE TABLE private.be_oct2026_identity_d639ec901a3c5db4 (id uuid PRIMARY KEY);
ALTER TABLE private.be_oct2026_identity_d639ec901a3c5db4 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct2026_identity_d639ec901a3c5db4 FROM PUBLIC,anon,authenticated;
CREATE TABLE private.be_oct2026_identity_78d3e90154aad5a4 (id uuid PRIMARY KEY);
ALTER TABLE private.be_oct2026_identity_78d3e90154aad5a4 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct2026_identity_78d3e90154aad5a4 FROM PUBLIC,anon,authenticated;
CREATE TABLE private.be_oct2026_identity_7d251eea60e0ae46 (id uuid PRIMARY KEY);
ALTER TABLE private.be_oct2026_identity_7d251eea60e0ae46 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct2026_identity_7d251eea60e0ae46 FROM PUBLIC,anon,authenticated;
CREATE TABLE private.be_oct2026_identity_1d45e282619664de (id uuid PRIMARY KEY);
ALTER TABLE private.be_oct2026_identity_1d45e282619664de ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct2026_identity_1d45e282619664de FROM PUBLIC,anon,authenticated;
CREATE TABLE private.be_oct2026_identity_8e3d29ef3d841693 (id uuid PRIMARY KEY);
ALTER TABLE private.be_oct2026_identity_8e3d29ef3d841693 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct2026_identity_8e3d29ef3d841693 FROM PUBLIC,anon,authenticated;
CREATE TABLE private.be_oct2026_identity_f52ebf20d9059884 (id uuid PRIMARY KEY);
ALTER TABLE private.be_oct2026_identity_f52ebf20d9059884 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct2026_identity_f52ebf20d9059884 FROM PUBLIC,anon,authenticated;
CREATE TABLE private.be_oct2026_identity_2567eb7309f782f3 (id uuid PRIMARY KEY);
ALTER TABLE private.be_oct2026_identity_2567eb7309f782f3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct2026_identity_2567eb7309f782f3 FROM PUBLIC,anon,authenticated;
CREATE TABLE private.be_oct2026_identity_00228602ff0591c6 (id uuid PRIMARY KEY);
ALTER TABLE private.be_oct2026_identity_00228602ff0591c6 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct2026_identity_00228602ff0591c6 FROM PUBLIC,anon,authenticated;
INSERT INTO private.be_oct2026_identity_links(parent_table,parent_column,identity_table,parent_type) VALUES
('be_commission_events','id','be_oct2026_identity_96dab5452d2b588a','uuid'),
('be_finance_settlement_batches_v3','id','be_oct2026_identity_e063bb483a5c0fab','uuid'),
('be_journal_entries','id','be_oct2026_identity_1126df7dc5feaad8','uuid'),
('be_waybill_reprint_requests_v23','id','be_oct2026_identity_d7f58a39b897bb54','uuid'),
('be_waybill_reprint_requests_v25','id','be_oct2026_identity_655b00c24f7804df','uuid'),
('deliveries','id','be_oct2026_identity_7686fe66af52e156','uuid'),
('inventory_2026_02_19_13_00','id','be_oct2026_identity_33668b4886cb9f65','uuid'),
('manifests','id','be_oct2026_identity_83d1056157bcaad8','integer'),
('parcels','id','be_oct2026_identity_d639ec901a3c5db4','uuid'),
('pickup_batches','id','be_oct2026_identity_78d3e90154aad5a4','uuid'),
('qr_codes_2026_02_18_17_00','id','be_oct2026_identity_7d251eea60e0ae46','uuid'),
('route_plans_2026_02_18_17_00','id','be_oct2026_identity_1d45e282619664de','uuid'),
('shipments','id','be_oct2026_identity_8e3d29ef3d841693','uuid'),
('shipments_2026_02_11_14_10','id','be_oct2026_identity_f52ebf20d9059884','uuid'),
('shipments_2026_02_17_18_40','id','be_oct2026_identity_2567eb7309f782f3','uuid'),
('shipments_2026_02_28_20_06','id','be_oct2026_identity_00228602ff0591c6','uuid');
UPDATE private.be_oct2026_epoch SET report=coalesce(report,'{}'::jsonb)||'{"identity_links_verified":true,"historical_retired_keys_imported":false,"epoch_activation_authorized":false}'::jsonb WHERE singleton AND NOT is_active;
DO $post$ BEGIN
IF (SELECT count(*) FROM private.be_oct2026_identity_links)<>16
  OR (SELECT is_active FROM private.be_oct2026_epoch WHERE singleton)
  OR (SELECT count(*) FROM private.be_oct2026_retired_keys)<>0
THEN RAISE EXCEPTION 'Identity map installation mismatch'; END IF;
END $post$;
COMMIT;
