import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const pagePath = path.join(root, "src", "pages", "CustomerServicePortalPage.tsx");

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
  "be_cs_create_customer_voice",
  "be_cs_acknowledge_customer_voice",
  "be_cs_resolve_customer_voice",
  "be_cs_escalate_customer_voice",
  "be_cs_superadmin_override_route",
  "SUPERADMIN_OVERRIDE_REQUIRED",
];

const pageChecks = [
  "Open Voices",
  "Customer Voices",
  "Status Timeline",
  "Escalate",
  "Superadmin Override",
];

const migrationFile = fs
  .readdirSync(migrationsDir)
  .filter((name) => /customer_service_parcel_voice_v41\.sql$/i.test(name))
  .sort()
  .at(-1);

const migrationSource = migrationFile
  ? fs.readFileSync(path.join(migrationsDir, migrationFile), "utf8")
  : "";
const pageSource = fs.readFileSync(pagePath, "utf8");

const failures = [];

if (!migrationFile) {
  failures.push("migration file matching *customer_service_parcel_voice_v41.sql");
}

for (const marker of migrationChecks) {
  if (!migrationSource.includes(marker)) failures.push(`migration marker: ${marker}`);
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
