#!/usr/bin/env node
// Issue #299: read-only baseline source gate; not a substitute for SQL replay.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASELINE_EXPECTATIONS = Object.freeze([
  { version: '20260412000000', filename: '20260412000000_emergency_restore.sql',
    recordedStatements: 7480, minBytes: 100_000,
    mustContain: [/\bCREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+"?pgtap"?/i] },
  { version: '20260721093501', filename: '20260721093501_remote_schema.sql',
    recordedStatements: 26003, minBytes: 1_000_000,
    mustContain: [/\bCREATE\s+TABLE\b/i, /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/i] }
]);

export function inspectBaseline(migrationsDir, expectations = BASELINE_EXPECTATIONS) {
  const rows = [];
  for (const expectation of expectations) {
    const file = path.join(migrationsDir, expectation.filename);
    if (!existsSync(file)) {
      rows.push({ file: expectation.filename, recordedStatements: expectation.recordedStatements,
        bytes: 0, ok: false, failures: ['missing file'] });
      continue;
    }
    const bytes = statSync(file).size;
    const sql = readFileSync(file, 'utf8');
    const failures = [];
    if (bytes < expectation.minBytes) {
      failures.push(`only ${bytes} bytes; recorded migration has ${expectation.recordedStatements} statements (minimum size screening ${expectation.minBytes} bytes)`);
    }
    for (const pattern of expectation.mustContain ?? []) {
      if (!pattern.test(sql)) failures.push(`missing essential historical statement marker: ${pattern}`);
    }
    rows.push({ file: expectation.filename, recordedStatements: expectation.recordedStatements,
      bytes, ok: failures.length === 0, failures });
  }
  return { ok: rows.every(row => row.ok), rows,
    caveat: 'Size/marker heuristics only; not SQL equivalence, clean replay, schema parity, or Production approval.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const report = inspectBaseline(path.join(repoRoot, 'supabase', 'migrations'));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    console.error('BLOCKED: historical source migrations are incomplete. Do not mark fresh replay or Production deploy as verified.');
    process.exitCode = 1;
  } else {
    console.log('Source-content screening passed; full isolated fresh migration replay is STILL required.');
  }
}
