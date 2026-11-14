begin;

update public.be_finance_predispatch_reviews_v1 r
set
  cod_requested=coalesce((public.be_finance_cod_policy_v2(
    coalesce(nullif(r.payment_type,''),'COD'),
    greatest(coalesce(r.declared_item_value,0),0),1
  )->>'cod_requested')::boolean,false),
  cod_policy_status=coalesce(public.be_finance_cod_policy_v2(
    coalesce(nullif(r.payment_type,''),'COD'),
    greatest(coalesce(r.declared_item_value,0),0),1
  )->>'cod_policy_status','NOT_EVALUATED'),
  cod_service_fee_rate=coalesce((public.be_finance_cod_policy_v2(
    coalesce(nullif(r.payment_type,''),'COD'),
    greatest(coalesce(r.declared_item_value,0),0),1
  )->>'fee_rate')::numeric,0),
  cod_service_fee_amount=coalesce((public.be_finance_cod_policy_v2(
    coalesce(nullif(r.payment_type,''),'COD'),
    greatest(coalesce(r.declared_item_value,0),0),1
  )->>'fee_amount')::numeric,0),
  finance_required=coalesce((public.be_finance_cod_policy_v2(
    coalesce(nullif(r.payment_type,''),'COD'),
    greatest(coalesce(r.declared_item_value,0),0),1
  )->>'finance_required')::boolean,false),
  finance_status=case
    when r.finance_status in ('APPROVED','REJECTED','HELD') then r.finance_status
    else coalesce(public.be_finance_cod_policy_v2(
      coalesce(nullif(r.payment_type,''),'COD'),
      greatest(coalesce(r.declared_item_value,0),0),1
    )->>'finance_status','NOT_REQUIRED')
  end,
  source_snapshot=coalesce(r.source_snapshot,'{}'::jsonb)
    || jsonb_build_object(
      'policy_version','COD_FEE_2026_09_30',
      'legacy_source_without_registered_parcel',true
    ),
  updated_at=now()
where r.cod_policy_status in (
  'HIGH_VALUE_COD_2_PERCENT',
  'STANDARD_COD_YANGON',
  'COD_NOT_AVAILABLE_OUTSIDE_YANGON'
);

commit;
