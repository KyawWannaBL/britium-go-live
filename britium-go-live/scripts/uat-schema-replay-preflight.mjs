#!/usr/bin/env node
/**
 * MDY/Insein UAT migration preflight, source-only and non-mutating.
 * PR evidence run: compare full sequence with snapshot-first without remote writes.
 * Usage: node scripts/uat-schema-replay-preflight.mjs [existing-table-list.json]
 * The optional JSON file is a read-only export of [{table_name:"..."}]
 * from information_schema.tables in the isolated UAT project.
 * This does NOT replay SQL or authorize account provisioning.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = path.join(root,'supabase/migrations/20260721093501_remote_schema.sql');
const source = fs.readFileSync(snapshot,'utf8');
const names = (pattern) => [...source.matchAll(pattern)].map(m=>m[1]);
const tables = [...new Set(names(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"public"\.|public\.)"?([a-z0-9_]+)"?/gi))];
const enums = [...new Set(names(/create\s+type\s+"public"\."([^"]+)"\s+as\s+enum/gi))];
const functions = [...new Set(names(/create\s+(?:or\s+replace\s+)?function\s+(?:"public"\.|public\.)"?([a-z0-9_]+)"?\s*\(/gi))];
const newCore = ['be_user_account_registry','be_branch_offices','be_role_authority_matrix'];
const laterCore = ['be_branch_intake_parcels_v1','be_login_access_profile'];
const extra = process.argv[2];
let existing = [];
if(extra){
  const json=JSON.parse(fs.readFileSync(extra,'utf8'));
  if(!Array.isArray(json)) throw new Error('Expected a JSON array of {table_name} rows');
  existing=[...new Set(json.map(row=>row?.table_name).filter(x=>typeof x==='string'))];
}
const set=new Set(existing);
const result = {
  kind:'static_preflight_not_a_database_replay',
  snapshot:path.relative(root,snapshot),
  uniqueTableDeclarations:tables.length,
  uniqueEnumDeclarations:enums.length,
  uniqueFunctionNames:functions.length,
  baselineOverlap:extra?tables.filter(t=>set.has(t)).length:null,
  missingSnapshotTables:extra?tables.filter(t=>!set.has(t)).length:null,
  snapshotContains:Object.fromEntries(newCore.map(x=>[x,tables.includes(x)])),
  laterMigrationsRequired:laterCore,
  warning:'Never replay snapshot after baseline or mark it applied without complete dependency reconciliation, isolated SQL replay, and RLS review.'
};
console.log(JSON.stringify(result,null,2));
if(!newCore.every(x=>tables.includes(x))) process.exitCode=2;
if(laterCore.some(x=>tables.includes(x)||functions.includes(x))) process.exitCode=3;
