import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const pagePath = path.join(root, "src", "pages", "CustomerServicePortalPage.tsx");
const apiPath = path.join(root, "src", "customerService", "customerVoiceApi.ts");

const migrationChecks = [
  "be_customer_voices",
  "be_customer_voice_actions",
  "be_customer_voice_escalations",
  "be_customer_voice_notifications",
  "delivery_way_id text not null",
  "customer_voice_text text not null",
  "auto_routed_department text not null",
  "current_department text not null",
  "workflow_status text not null default 'OPEN'",
  "idempotency_key text",
  "be_cs_parcel_support_queue",
  "open_voice_count",
  "current_owner_department",
  "latest_customer_voice",
  "latest_internal_action",
  "escalation_flag",
  "sla_due_at",
  "be_cs_route_department",
  "REDELIVERY",
  "ADDRESS_CORRECTION",
  "LOCATION_CORRECTION",
  "PARCEL_MISSING",
  "WAREHOUSE_ISSUE",
  "COD_ISSUE",
  "PAYMENT_ISSUE",
  "PICKUP_ISSUE",
  "be_cs_create_customer_voice",
  "be_cs_mark_customer_voice_seen",
  "be_cs_acknowledge_customer_voice",
  "be_cs_update_customer_voice_action",
  "be_cs_resolve_customer_voice",
  "be_cs_confirm_customer_voice",
  "be_cs_close_customer_voice",
  "be_cs_escalate_customer_voice",
  "be_cs_reopen_customer_voice",
  "be_cs_superadmin_override_route",
  "be_cs_customer_voice_history",
  "SUPERADMIN_OVERRIDE_REQUIRED",
  "be_cs_resolve_parcel_branch",
  "delivery_region",
  "YANGON",
  "MANDALAY",
  "NAYPYITAW",
  "OUTSIDE_CORE",
];

const apiChecks = [
  "loadCustomerServiceParcels",
  "loadCustomerVoiceHistory",
  "createCustomerVoice",
  "markCustomerVoiceSeen",
  "acknowledgeCustomerVoice",
  "updateCustomerVoiceAction",
  "resolveCustomerVoice",
  "confirmCustomerVoice",
  "closeCustomerVoice",
  "escalateCustomerVoice",
  "reopenCustomerVoice",
  "superadminOverrideCustomerVoiceRoute",
];

const pageChecks = [
  "Open Voices",
  "Current Owner",
  "Latest Customer Voice",
  "Customer Voices",
  "Status Timeline",
  "Internal Action History",
  "Add Customer Voice",
  "Escalate",
  "Superadmin Override",
];

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((name) => /customer_service_parcel_voice_v41.*\.sql$/i.test(name))
  .sort();

const migrationSource = migrationFiles
  .map((name) => fs.readFileSync(path.join(migrationsDir, name), "utf8"))
  .join("\n");
const pageSource = fs.readFileSync(pagePath, "utf8");
const apiSource = fs.existsSync(apiPath) ? fs.readFileSync(apiPath, "utf8") : "";

const failures = [];

if (!migrationFiles.length) {
  failures.push("migration file matching *customer_service_parcel_voice_v41*.sql");
}

for (const marker of migrationChecks) {
  if (!migrationSource.includes(marker)) failures.push(`migration marker: ${marker}`);
}

const resolverUseCount = (migrationSource.match(/be_cs_resolve_parcel_branch\s*\(/g) || []).length;
if (resolverUseCount < 3) {
  failures.push("migration contract: be_cs_resolve_parcel_branch must be defined and used by both queue and create RPCs");
}

for (const marker of apiChecks) {
  if (!apiSource.includes(marker)) failures.push(`api marker: ${marker}`);
}

for (const marker of pageChecks) {
  if (!pageSource.includes(marker)) failures.push(`page marker: ${marker}`);
}

if (failures.length > 0) {
  console.error("Customer Service Parcel Voice V41 contract FAILED:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("Customer Service Parcel Voice V41 contract PASS");
