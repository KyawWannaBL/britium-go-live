-- BRITIUM ISOLATED UAT: limited, verified tariff fixtures for UI only.
-- Insein and Mandalay rates copied from verified production catalog; zero historical customer data.
-- Do not enable financial mutations or use these 4 destinations as a complete tariff catalog.
BEGIN;
SET LOCAL statement_timeout='40s';
DO $guard$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_user_account_registry)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Not hosted UAT'; END IF;
IF (SELECT count(*) FROM public.be_wayplan_dispatches)<>2 OR (SELECT count(*) FROM public.be_data_entry_parcel_details)<>4 THEN RAISE EXCEPTION 'UAT fixtures changed'; END IF;
IF to_regclass('public.be_data_entry_service_providers') IS NOT NULL THEN RAISE EXCEPTION 'Existing table be_data_entry_service_providers'; END IF;
IF to_regclass('public.be_data_entry_tariff_catalog') IS NOT NULL THEN RAISE EXCEPTION 'Existing table be_data_entry_tariff_catalog'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_tariff_options') THEN RAISE EXCEPTION 'Existing function be_data_entry_tariff_options'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_service_provider_options_v13') THEN RAISE EXCEPTION 'Existing function be_data_entry_service_provider_options_v13'; END IF;
END $guard$;
CREATE TABLE public."be_data_entry_service_providers" (
  "provider_code" text NOT NULL,
  "display_name" text NOT NULL,
  "provider_type" text DEFAULT 'OUTSOURCE'::text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "be_data_entry_service_providers_pkey" PRIMARY KEY (provider_code)
);
ALTER TABLE public."be_data_entry_service_providers" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_data_entry_service_providers" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."be_data_entry_service_providers" TO authenticated;
CREATE POLICY be_data_entry_service_providers_uat_read_auth ON public."be_data_entry_service_providers" FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL AND is_active);
CREATE TABLE public."be_data_entry_tariff_catalog" (
  "destination_key" text NOT NULL,
  "destination_name" text NOT NULL,
  "original_label" text,
  "standard_rate_mmk" numeric NOT NULL,
  "special_rate_mmk" numeric,
  "rack_code" text,
  "provider_code" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "source_file" text DEFAULT 'updated_tariff.csv'::text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "be_data_entry_tariff_catalog_special_rate_mmk_check" CHECK (special_rate_mmk >= 0::numeric),
  CONSTRAINT "be_data_entry_tariff_catalog_standard_rate_mmk_check" CHECK (standard_rate_mmk >= 0::numeric),
  CONSTRAINT "be_data_entry_tariff_catalog_provider_code_fkey" FOREIGN KEY (provider_code) REFERENCES be_data_entry_service_providers(provider_code),
  CONSTRAINT "be_data_entry_tariff_catalog_pkey" PRIMARY KEY (destination_key)
);
ALTER TABLE public."be_data_entry_tariff_catalog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_data_entry_tariff_catalog" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."be_data_entry_tariff_catalog" TO authenticated;
CREATE POLICY be_data_entry_tariff_catalog_uat_read_auth ON public."be_data_entry_tariff_catalog" FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL AND is_active);
INSERT INTO public.be_data_entry_service_providers(provider_code,display_name,provider_type,is_active)
 VALUES
 ('BRITIUM','Britium Express','INTERNAL',true),
 ('DK DELIVERY','DK Delivery','OUTSOURCE',true),
 ('MDY BRANCH','Britium Mandalay Branch Office','BRANCH',true);
INSERT INTO public.be_data_entry_tariff_catalog(destination_key,destination_name,standard_rate_mmk,special_rate_mmk,rack_code,provider_code,is_active,source_file)
 VALUES
 ('အင်းစိန်','အင်းစိန်',4000,4000,'3A','BRITIUM',true,'UAT_VERIFIED_PRODUCTION_TARIFF_20261121'),
 ('မန္တလေး (royal)','မန္တလေး (Royal)',6000,NULL,'R','DK DELIVERY',true,'UAT_VERIFIED_PRODUCTION_TARIFF_20261121'),
 ('ချမ်းအေးသာစံ','ချမ်းအေးသာစံ',6000,5000,'4D','MDY BRANCH',true,'UAT_VERIFIED_PRODUCTION_TARIFF_20261121'),
 ('မန္တလေး','မန္တလေး',6000,5000,'4D','MDY BRANCH',true,'UAT_VERIFIED_PRODUCTION_TARIFF_20261121');
CREATE FUNCTION public.be_data_entry_tariff_options()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object('destination_key',c.destination_key,'destination_name',c.destination_name,'standard_rate_mmk',c.standard_rate_mmk,'special_rate_mmk',c.special_rate_mmk,'rack_code',c.rack_code,'provider_code',c.provider_code,'provider_name',p.display_name) order by c.destination_name),'[]'::jsonb)
 from public.be_data_entry_tariff_catalog c join public.be_data_entry_service_providers p using(provider_code) where c.is_active and p.is_active and auth.uid() is not null;
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_tariff_options() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.be_data_entry_tariff_options() TO authenticated;
CREATE FUNCTION public.be_data_entry_service_provider_options_v13()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider_code',p.provider_code,
    'display_name',p.display_name,
    'provider_type',p.provider_type,
    'active_tariff_count',coalesce(c.active_tariff_count,0)
  ) order by case p.provider_code
      when 'BRITIUM' then 0
      when 'ROYAL EXPRESS' then 1
      when 'DK DELIVERY' then 2
      when 'NPT BRANCH' then 3
      when 'GRS' then 4
      else 5
    end,p.display_name
  ),'[]'::jsonb)
  from public.be_data_entry_service_providers p
  left join lateral (
    select count(*)::integer as active_tariff_count
    from public.be_data_entry_tariff_catalog t
    where t.provider_code=p.provider_code and t.is_active
  ) c on true
  where p.is_active and auth.uid() is not null;
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_service_provider_options_v13() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.be_data_entry_service_provider_options_v13() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
