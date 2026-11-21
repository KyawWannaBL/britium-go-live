-- BRITIUM hosted isolated UAT / preserve parcel address/contact change history with original trigger.
-- Address history contains recipient PII, so it has RLS and NO anon/authenticated table grants.
-- Only preexisting synthetic QA parcels, no imported customer history. No financial mutation activation.
BEGIN;
SET LOCAL statement_timeout='45s';
DO $gate$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_user_account_registry)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Not isolated UAT'; END IF;
IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' OR (SELECT count(*) FROM public.be_waybill_ledger)<>0 OR (SELECT count(*) FROM public.be_portal_pickup_requests)<>2 OR (SELECT count(*) FROM public.be_data_entry_parcel_details)<>4 THEN RAISE EXCEPTION 'Unsafe baseline'; END IF;
IF to_regclass('public.be_delivery_address_history') IS NOT NULL OR to_regprocedure('private.be_capture_delivery_address_history()') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.be_data_entry_parcel_details'::regclass AND tgname='parcel_detail_address_history') THEN RAISE EXCEPTION 'Address audit already restored'; END IF;
END $gate$;
CREATE TABLE public.be_delivery_address_history (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "delivery_way_id" text NOT NULL,
  "source_table" text NOT NULL,
  "action" text NOT NULL,
  "actor_id" uuid,
  "actor_email" text,
  "changed_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  "before_values" jsonb NOT NULL,
  "after_values" jsonb NOT NULL,
  CONSTRAINT "be_delivery_address_history_action_check" CHECK (action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text])),
  CONSTRAINT "be_delivery_address_history_pkey" PRIMARY KEY (id)
);
ALTER TABLE public.be_delivery_address_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_delivery_address_history FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.be_capture_delivery_address_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_before jsonb;
  v_after jsonb;
  v_way text;
  v_actor uuid := auth.uid();
  v_email text;
  v_keys text[] := array['recipient_name','contact_no_1','contact_no_2','recipient_address','address_original','address_english','township','city','region_state','postal_code','latitude','longitude'];
begin
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_before from jsonb_each(v_old) where key=any(v_keys);
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_after from jsonb_each(v_new) where key=any(v_keys);
  if v_before is not distinct from v_after then return new; end if;
  v_way := coalesce(nullif(v_new->>'delivery_way_id',''),(v_new->>'pickup_id')||'-'||lpad(v_new->>'parcel_sequence',3,'0'));
  if v_way is null then return new; end if;
  -- Actor identity comes from the authenticated session, never the submitted payload.
  if v_actor is not null then select email into v_email from auth.users where id=v_actor; end if;
  insert into public.be_delivery_address_history(delivery_way_id,source_table,action,actor_id,actor_email,before_values,after_values)
    values(v_way,tg_table_name,tg_op,v_actor,v_email,v_before,v_after);
  return new;
end;
$function$
;
REVOKE ALL ON FUNCTION private.be_capture_delivery_address_history() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER parcel_detail_address_history AFTER INSERT OR UPDATE ON be_data_entry_parcel_details FOR EACH ROW EXECUTE FUNCTION private.be_capture_delivery_address_history();
NOTIFY pgrst,'reload schema';
COMMIT;
