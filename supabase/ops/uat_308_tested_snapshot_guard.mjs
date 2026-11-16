import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
const target = process.argv[2];
if (!target) { console.error('Usage: node verify_snapshot.mjs <snapshot.sql>'); process.exit(2); }
const content = readFileSync(resolve(target), 'utf8');
const occurrences = (pattern) => [...content.matchAll(pattern)].length;
const facts = {
  bytes: statSync(target).size,
  enum_creates: occurrences(/\bcreate\s+type\s+(?:"?public"?\.)?"?\w+"?\s+as\s+enum/gi),
  table_creates: occurrences(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?\w+"?\s*\(/gi),
  drops_pg_net: /\bdrop\s+extension\s+if\s+exists\s+"?pg_net"?/i.test(content),
  creates_app_role: /\bcreate\s+type\s+(?:"?public"?\.)?"?app_role"?\s+as\s+enum/i.test(content)
};
const classification = facts.bytes < 100000 ? 'INVALID_EMPTY_OR_TRUNCATED' : facts.drops_pg_net || facts.creates_app_role ? 'HISTORICAL_BASELINE_NOT_INCREMENTAL' : 'REQUIRES_MANUAL_REVIEW';
console.log(JSON.stringify({...facts,classification},null,2));
process.exit(classification === 'REQUIRES_MANUAL_REVIEW' ? 0 : 1);
