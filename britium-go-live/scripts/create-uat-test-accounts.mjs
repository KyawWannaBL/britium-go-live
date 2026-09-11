import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnvFile(path) {
  if (!fs.existsSync(path)) return;
  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const [k, ...rest] = line.split("=");
    const v = rest.join("=").trim().replace(/^"|"$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

readEnvFile(".env.admin");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.admin");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const DOMAIN = process.env.UAT_TEST_DOMAIN || "britiumexpress.com";
const PASSWORD = "adm!n123";

const accounts = [
  { email: `testadmin@${DOMAIN}`, display_name: "UAT Test Super Admin", role: "superadmin", portal: "admin", branch_code: "HQ", permissions: ["*"] },
  { email: `testmarketing@${DOMAIN}`, display_name: "UAT Test Marketing", role: "marketing", portal: "marketing", branch_code: "HQ", permissions: ["marketing:*", "campaign:view", "customer:view"] },
  { email: `testbusiness_development_manager@${DOMAIN}`, display_name: "UAT Test BD Manager", role: "business_development_manager", portal: "business_development", branch_code: "HQ", permissions: ["business_development:*", "merchant:onboard", "merchant:view", "sales_pipeline:*"] },
  { email: `testbranch_office_manager@${DOMAIN}`, display_name: "UAT Test Branch Manager", role: "branch_office_manager", portal: "branch_office", branch_code: "YGN", permissions: ["branch:*", "pickup:view", "warehouse:view", "staff:view", "dispatch:view"] },
  { email: `teststaff@${DOMAIN}`, display_name: "UAT Test Staff", role: "staff", portal: "staff", branch_code: "YGN", permissions: ["staff:*", "pickup:view", "task:view"] },
  { email: `testcustomer_service@${DOMAIN}`, display_name: "UAT Test CS", role: "customer_service", portal: "cs_portal", branch_code: "HQ", permissions: ["pickup:create", "pickup:view", "customer_service:*"] },
  { email: `testdata_entry@${DOMAIN}`, display_name: "UAT Test Data Entry", role: "data_entry", portal: "data_entry", branch_code: "HQ", permissions: ["data_entry:*", "pickup:view", "proof:view"] },
  { email: `testsupervisor@${DOMAIN}`, display_name: "UAT Test Supervisor", role: "supervisor", portal: "supervisor", branch_code: "HQ", permissions: ["assignment:*", "pickup:view", "proof:view"] },
  { email: `testwarehouse@${DOMAIN}`, display_name: "UAT Test Warehouse", role: "warehouse", portal: "warehouse", branch_code: "YGN-WH", permissions: ["warehouse:*", "proof:create", "proof:view"] },
  { email: `testdispatch@${DOMAIN}`, display_name: "UAT Test Dispatch", role: "dispatch", portal: "dispatch", branch_code: "HQ", permissions: ["dispatch:*", "wayplan:*", "pickup:view"] },
  { email: `testfinance@${DOMAIN}`, display_name: "UAT Test Finance", role: "finance", portal: "finance", branch_code: "HQ", permissions: ["finance:*", "settlement:*", "cod:*"] },
  { email: `testmerchant@${DOMAIN}`, display_name: "UAT Test Merchant", role: "merchant", portal: "merchant_portal", branch_code: "HQ", permissions: ["merchant:*", "pickup:create", "pickup:view"] },
  { email: `testcustomer@${DOMAIN}`, display_name: "UAT Test Customer", role: "customer", portal: "customer_portal", branch_code: "HQ", permissions: ["customer:*", "shipment:track"] },
  { email: `testrider@${DOMAIN}`, display_name: "UAT Test Rider", role: "rider", portal: "rider", branch_code: "YGN", permissions: ["rider:*", "pickup:verify", "delivery:proof"] },
  { email: `testdriver@${DOMAIN}`, display_name: "UAT Test Driver", role: "driver", portal: "rider", branch_code: "YGN", permissions: ["driver:*", "route:view"] },
  { email: `testhelper@${DOMAIN}`, display_name: "UAT Test Helper", role: "helper", portal: "rider", branch_code: "YGN", permissions: ["helper:*", "pickup:assist"] },
];

async function findUserByEmail(email) {
  let page = 1;
  const perPage = 50; // CHANGED FROM 1000 to 50 TO PREVENT DATABASE TIMEOUTS

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("\n[!] listUsers API Error:", error.message || error);
      throw error;
    }

    const found = data.users.find(
      (u) => String(u.email || "").toLowerCase() === email.toLowerCase()
    );

    if (found) return found;
    if (!data.users.length || data.users.length < perPage) return null;

    page += 1;
  }
}

async function upsertAuthUser(account) {
  const existing = await findUserByEmail(account.email);

  const authPayload = {
    email: account.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      display_name: account.display_name,
      role: account.role,
      portal: account.portal,
      branch_code: account.branch_code,
      uat_test_account: true,
    },
    app_metadata: {
      role: account.role,
      portal: account.portal,
      branch_code: account.branch_code,
      uat_test_account: true,
    },
  };

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, authPayload);
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser(authPayload);
  if (error) throw error;
  return data.user;
}

for (const account of accounts) {
  try {
    const user = await upsertAuthUser(account);

    const { error } = await supabase.rpc("be_admin_sync_uat_account", {
      p_payload: {
        auth_user_id: user.id,
        email: account.email,
        display_name: account.display_name,
        role: account.role,
        portal: account.portal,
        branch_code: account.branch_code,
        permissions: account.permissions,
        password_policy: "UAT shared password, rotate after test",
        uat_test_account: true,
      },
    });

    if (error) throw error;

    console.log(`OK ${account.email} -> ${account.role} / ${account.portal}`);
  } catch (err) {
    console.error(`FAILED ${account.email}:`, err.message || err);
    process.exitCode = 1;
  }
}

console.log("\nUAT accounts complete.");
console.log(`Password for all accounts: ${PASSWORD}`);