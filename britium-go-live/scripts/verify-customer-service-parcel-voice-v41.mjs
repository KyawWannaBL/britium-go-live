import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationDir = path.join(root, 'supabase', 'migrations');
const pagePath = path.join(root, 'src', 'pages', 'CustomerServicePortalPage.tsx');
const typesPath = path.join(root, 'src', 'customerService', 'customerVoiceTypes.ts');
const routingPath = path.join(root, 'src', 'customerService', 'customerVoiceRouting.ts');
const apiPath = path.join(root, 'src', 'customerService', 'customerVoiceApi.ts');
const migrationPattern = /customer_service_parcel_voice_v41\.sql$/;

const migrationChecks = [
  'be_customer_voices', 'delivery_way_id text not null', 'customer_voice_text text not null',
  'auto_routed_department text not null', 'current_department text not null', 'workflow_status text not null',
  'idempotency_key text', 'be_customer_voice_actions', 'customer_voice_id uuid not null',
  'be_customer_voice_escalations', 'be_customer_voice_notifications', 'be_cs_can_access_delivery_way',
  'be_cs_parcel_support_queue', 'open_voice_count', 'current_owner_department', 'latest_customer_voice',
  'latest_internal_action', 'escalation_flag', 'sla_due_at',
  'be_cs_route_department', 'be_cs_create_customer_voice',
  'REDELIVERY', 'RIDER_ISSUE', 'ADDRESS_CORRECTION', 'LOCATION_CORRECTION', 'PARCEL_MISSING',
  'WAREHOUSE_ISSUE', 'COD_ISSUE', 'PAYMENT_ISSUE', 'PICKUP_ISSUE', 'OTHER',
  "'operations'", "'data_entry'", "'warehouse'", "'finance'", "'pickup_supervisor'",
  'be_cs_acknowledge_customer_voice', 'be_cs_resolve_customer_voice', 'be_cs_escalate_customer_voice',
  'be_cs_superadmin_override_route', 'SUPERADMIN_OVERRIDE_REQUIRED',
];

const typesChecks = [
  'CustomerVoiceIssueType', 'CustomerVoiceWorkflowStatus', 'CustomerVoiceDepartment',
  'CustomerVoiceSourceChannel', 'CustomerVoicePriority', 'CustomerServiceParcelSupportRow',
  'CreateCustomerVoiceInput',
];
const routingChecks = ['customerVoiceDepartmentLabel', 'customerVoiceDepartmentIcon'];
const apiChecks = [
  'loadCustomerServiceParcels', 'createCustomerVoice', 'acknowledgeCustomerVoice',
  'updateCustomerVoiceAction', 'resolveCustomerVoice', 'confirmCustomerVoice',
  'closeCustomerVoice', 'escalateCustomerVoice', 'reopenCustomerVoice',
  'superadminOverrideCustomerVoiceRoute',
];
const pageChecks = ['Open Voices', 'Customer Voices', 'Status Timeline', 'Escalate', 'Superadmin Override'];

const missing = [];
const migrationFiles = fs.existsSync(migrationDir)
  ? fs.readdirSync(migrationDir).filter((name) => migrationPattern.test(name)).sort()
  : [];
const migrationSource = migrationFiles.map((name) => fs.readFileSync(path.join(migrationDir, name), 'utf8')).join('\n');
const read = (filePath) => fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
const typesSource = read(typesPath);
const routingSource = read(routingPath);
const apiSource = read(apiPath);
const pageSource = read(pagePath);

if (migrationFiles.length === 0) missing.push('migration:file:customer_service_parcel_voice_v41.sql');
for (const marker of migrationChecks) if (!migrationSource.includes(marker)) missing.push(`migration:${marker}`);
for (const marker of typesChecks) if (!typesSource.includes(marker)) missing.push(`types:${marker}`);
for (const marker of routingChecks) if (!routingSource.includes(marker)) missing.push(`routing:${marker}`);
for (const marker of apiChecks) if (!apiSource.includes(marker)) missing.push(`api:${marker}`);
for (const marker of pageChecks) if (!pageSource.includes(marker)) missing.push(`page:${marker}`);

if (missing.length > 0) {
  console.error('V41 Customer Service parcel voice contract: FAIL');
  for (const item of missing) console.error(`- missing ${item}`);
  process.exit(1);
}
console.log('V41 Customer Service parcel voice contract: PASS');
