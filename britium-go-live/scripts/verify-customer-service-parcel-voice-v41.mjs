import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationDir = path.join(root, 'supabase', 'migrations');
const pagePath = path.join(root, 'src', 'pages', 'CustomerServicePortalPage.tsx');
const migrationPattern = /customer_service_parcel_voice_v41\.sql$/;

const migrationChecks = [
  'be_customer_voices',
  'be_customer_voice_actions',
  'be_customer_voice_escalations',
  'be_customer_voice_notifications',
  'be_cs_parcel_support_queue',
  'be_cs_create_customer_voice',
  'be_cs_acknowledge_customer_voice',
  'be_cs_resolve_customer_voice',
  'be_cs_escalate_customer_voice',
  'be_cs_superadmin_override_route',
  'SUPERADMIN_OVERRIDE_REQUIRED',
];

const pageChecks = [
  'Open Voices',
  'Customer Voices',
  'Status Timeline',
  'Escalate',
  'Superadmin Override',
];

const missing = [];
const migrationFiles = fs.existsSync(migrationDir)
  ? fs.readdirSync(migrationDir).filter((name) => migrationPattern.test(name)).sort()
  : [];
const migrationSource = migrationFiles
  .map((name) => fs.readFileSync(path.join(migrationDir, name), 'utf8'))
  .join('\n');
const pageSource = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, 'utf8') : '';

if (migrationFiles.length === 0) missing.push('migration:file:customer_service_parcel_voice_v41.sql');
for (const marker of migrationChecks) {
  if (!migrationSource.includes(marker)) missing.push(`migration:${marker}`);
}
for (const marker of pageChecks) {
  if (!pageSource.includes(marker)) missing.push(`page:${marker}`);
}

if (missing.length > 0) {
  console.error('V41 Customer Service parcel voice contract: FAIL');
  for (const item of missing) console.error(`- missing ${item}`);
  process.exit(1);
}

console.log('V41 Customer Service parcel voice contract: PASS');
