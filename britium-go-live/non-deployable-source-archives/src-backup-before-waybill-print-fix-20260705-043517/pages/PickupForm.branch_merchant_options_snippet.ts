// Optional Pickup Form merchant-source patch
// Use this when PickupFormPage loads merchant dropdown options.
// It merges old merchant_masters with branch-approved merchants.

const [{ data: legacyMerchants }, { data: branchMerchants }] = await Promise.all([
  supabase.from("merchant_masters").select("*"),
  supabase.from("be_v_branch_merchant_options").select("*"),
]);

const normalizeMerchant = (m: any) => ({
  merchant_code: m.merchant_code,
  merchant_name: m.merchant_name || m.business_name,
  business_name: m.business_name || m.merchant_name,
  default_pickup_address: m.default_pickup_address || m.pickup_address || m.address,
  township: m.township,
  city: m.city,
  phone: m.phone_primary || m.phone || m.contact_phone,
  email: m.email,
  branch_code: m.branch_code,
});

const merchantOptions = [
  ...(legacyMerchants || []).map(normalizeMerchant),
  ...(branchMerchants || []).map(normalizeMerchant),
].filter((m, idx, arr) =>
  m.merchant_code && arr.findIndex(x => x.merchant_code === m.merchant_code) === idx
);
