import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = "P@ssw0rd1";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const accounts = [
  ["Super Admin", "testadmin@britiumexpress.com", "superadmin", "PORTAL"],
  ["Marketing", "testmarketing@britiumexpress.com", "marketing", "PORTAL"],
  ["Bus. Dev. Manager", "testbusiness_development_manager@britiumexpress.com", "business_development_manager", "PORTAL"],
  ["Branch Manager", "testbranch_office_manager@britiumexpress.com", "branch_office_manager", "PORTAL"],
  ["Staff", "teststaff@britiumexpress.com", "staff", "PORTAL"],
  ["Customer Service", "testcustomer_service@britiumexpress.com", "customer_service", "PORTAL"],
  ["Data Entry", "testdata_entry@britiumexpress.com", "data_entry", "PORTAL"],
  ["Supervisor", "testsupervisor@britiumexpress.com", "supervisor", "PORTAL"],
  ["Warehouse", "testwarehouse@britiumexpress.com", "warehouse", "PORTAL"],
  ["Dispatch", "testdispatch@britiumexpress.com", "dispatch", "PORTAL"],
  ["Finance", "testfinance@britiumexpress.com", "finance", "PORTAL"],
  ["Merchant", "testmerchant@britiumexpress.com", "merchant", "EXTERNAL"],
  ["Customer", "testcustomer@britiumexpress.com", "customer", "EXTERNAL"],
  ["Rider", "testrider@britiumexpress.com", "rider", "MOBILE"],
  ["Driver", "testdriver@britiumexpress.com", "driver", "MOBILE"],
  ["Helper", "testhelper@britiumexpress.com", "helper", "MOBILE"],
];

for (const [roleName, email, roleId, userType] of accounts) {
  const metadata = {
    role_id: roleId,
    role_name: roleName,
    user_type: userType,
    must_change_password: false,
    is_uat_account: true,
  };

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: metadata,
    app_metadata: metadata,
  });

  if (error) {
    console.log(`SKIPPED/FAILED ${email}: ${error.message}`);
  } else {
    console.log(`CREATED ${email}: ${data.user?.id}`);
  }
}

console.log("Create-only UAT account seed completed.");