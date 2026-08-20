-- Branch Office Portal verification

select public.be_branch_office_portal_snapshot('YGN-MAIN', 'testbranch_office_manager@britiumexpress.com');

select
  (select count(*) from public.be_branch_offices) as branch_offices,
  (select count(*) from public.be_branch_service_areas where branch_code='YGN-MAIN') as ygn_service_areas,
  (select count(*) from public.be_branch_tariffs where branch_code='YGN-MAIN') as ygn_tariffs,
  (select count(*) from public.be_branch_merchant_onboarding_requests) as merchant_requests,
  (select count(*) from public.be_branch_merchant_registry) as approved_merchants;

-- Test single merchant request
select public.be_branch_submit_merchant_registration(
  jsonb_build_object(
    'branch_code','YGN-MAIN',
    'merchant_name','UAT Branch Merchant',
    'business_name','UAT Branch Merchant Shop',
    'contact_person','Daw Test',
    'phone_primary','09777777777',
    'default_pickup_address','East Dagon, Yangon',
    'township','East Dagon',
    'city','Yangon',
    'payment_type','COD',
    'cod_enabled','YES'
  ),
  'testbranch_office_manager@britiumexpress.com'
);

-- Approve the latest pending test request
select public.be_branch_review_merchant_registration(
  (select id from public.be_branch_merchant_onboarding_requests
   where merchant_name='UAT Branch Merchant'
   order by created_at desc limit 1),
  'APPROVED',
  'Approved for UAT',
  'testadmin@britiumexpress.com'
);

select merchant_code, merchant_name, branch_code, township
from public.be_v_branch_merchant_options
where merchant_name = 'UAT Branch Merchant';
