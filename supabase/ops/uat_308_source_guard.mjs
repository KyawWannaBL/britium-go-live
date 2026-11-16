import { readFileSync, statSync } from 'node:fs';
const filename = process.argv[2];
if (!filename) { console.error('Usage: node uat_308_source_guard.mjs <20260721093501_remote_schema.sql>'); process.exit(2); }
const content = readFileSync(filename,'utf8');
const types = [...content.matchAll(/\bcreate\s+type\s+(?:"?public"?\.)?"?([A-Za-z_][A-Za-z_0-9]*)"?\s+as\s+enum/gi)].map(m=>m[1]);
const tables = [...content.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([A-Za-z_][A-Za-z_0-9]*)"?\s*\(/gi)].map(m=>m[1]);
const hasSnapshot = content.trim().length > 100_000;
const destroysPgNet = /drop\s+extension\s+if\s+exists\s+"?pg_net"?/i.test(content);
const createsAppRole = types.includes('app_role');
const outcome = {file:filename,bytes:statSync(filename).size,enum_creates:types.length,table_creates:tables.length,has_historical_snapshot:hasSnapshot,has_unconditional_app_role_create:createsAppRole,has_pg_net_drop:destroysPgNet,classification: !hasSnapshot ? 'MISSING_HISTORICAL_SNAPSHOT' : (createsAppRole || destroysPgNet) ? 'FULL_SNAPSHOT_NOT_INCREMENTAL_MIGRATION' : 'REVIEW_REQUIRED'};
console.log(JSON.stringify(outcome,null,2));
if (!hasSnapshot || destroysPgNet || createsAppRole) {console.error('BLOCK: do not replay this file as an incremental migration. Reconcile the baseline and test in a disposable database.');process.exit(1)}
