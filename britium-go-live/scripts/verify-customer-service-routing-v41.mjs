import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const files = fs.readdirSync(migrationsDir).filter((name) => /customer_service_parcel_voice_v41.*\.sql$/i.test(name)).sort();
const sql = files.map((name) => fs.readFileSync(path.join(migrationsDir, name), 'utf8')).join('\n');
const failures = [];

const routing = [
  ["REDELIVERY", "operations"],
  ["RIDER_ISSUE", "operations"],
  ["ADDRESS_CORRECTION", "data_entry"],
  ["LOCATION_CORRECTION", "data_entry"],
  ["PARCEL_MISSING", "warehouse"],
  ["WAREHOUSE_ISSUE", "warehouse"],
  ["COD_ISSUE", "finance"],
  ["PAYMENT_ISSUE", "finance"],
  ["PICKUP_ISSUE", "pickup_supervisor"],
  ["OTHER", "operations"],
];

for (const [issue, department] of routing) {
  const pattern = new RegExp(`when\\s+'${issue}'\\s+then\\s+return\\s+'${department}'`, 'i');
  if (!pattern.test(sql)) failures.push(`routing ${issue} -> ${department}`);
}

if (!/r\s+not\s+in\s*\(\s*'super_admin'\s*,\s*'superadmin'\s*\)/i.test(sql)) failures.push('override restricted to super_admin/superadmin');
if (!sql.includes('SUPERADMIN_OVERRIDE_REQUIRED')) failures.push('SUPERADMIN_OVERRIDE_REQUIRED error');
if (!sql.includes('OVERRIDE_REASON_REQUIRED')) failures.push('mandatory override reason');
if (!sql.includes("jsonb_build_object('original_department',oldd,'new_department',nd,'override_reason',p_reason)")) failures.push('override audit preserves original/new department and reason');

const escalation = sql.match(/create or replace function public\.be_cs_escalate_customer_voice[\s\S]*?end \$\$;/i)?.[0] || '';
if (!escalation) failures.push('escalation function');
if (/set\s+current_department\s*=/i.test(escalation)) failures.push('escalation must not change current_department');
if (!escalation.includes("'ownership_unchanged',true")) failures.push('escalation ownership_unchanged audit marker');

const override = sql.match(/create or replace function public\.be_cs_superadmin_override_route[\s\S]*?end \$\$;/i)?.[0] || '';
if (!/set\s+current_department=nd/i.test(override)) failures.push('Superadmin override changes current_department');
if (!/insert into public\.be_customer_voice_notifications/i.test(override)) failures.push('Superadmin override creates new destination notification');

if (failures.length) {
  console.error('Customer Service V41 routing/authority contract FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('Customer Service V41 routing/authority contract PASS');
