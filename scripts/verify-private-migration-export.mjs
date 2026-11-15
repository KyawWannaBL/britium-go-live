#!/usr/bin/env node
// Issue #299: verify privately extracted historical migration statements.
// Input: JSON string array, or {statements:[...]}. Does not print or upload SQL.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const EXPECTED = Object.freeze({
  '20260412000000': { count: 7480, fingerprint: 'aca28438bba353287aa1f61c95b7cbcf31540070120b15aadf6da12ef50c2493' },
  '20260721093501': { count: 26003, fingerprint: 'dc6725b13122b0526b59a8801f46090bc22d91e2007aac7f565f41705a04ea03' }
});
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');
export function fingerprintStatements(input) {
  const statements = Array.isArray(input) ? input : input?.statements;
  if (!Array.isArray(statements) || !statements.every(s => typeof s === 'string')) {
    throw new TypeError('Private export must contain an ordered JSON array of SQL statement strings');
  }
  // Matches PostgreSQL SHA256(UTF8(concat(SHA256(UTF8(each statement)) in ordinal order))).
  // Preserve whitespace, case and statement boundaries exactly.
  const hashes = statements.map(sha256).join('');
  return { count: statements.length, fingerprint: sha256(hashes) };
}
export function verifyMigration(version, input, expected = EXPECTED) {
  if (!Object.hasOwn(expected, version)) throw new Error('Unsupported historical version');
  const actual = fingerprintStatements(input);
  return { version,
    matching: actual.count === expected[version].count && actual.fingerprint === expected[version].fingerprint,
    actualCount: actual.count, expectedCount: expected[version].count,
    actualFingerprint: actual.fingerprint, expectedFingerprint: expected[version].fingerprint };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [version, filename] = process.argv.slice(2);
  if (!version || !filename) {
    console.error('Usage: node scripts/verify-private-migration-export.mjs <20260412000000|20260721093501> <private-statements.json>');
    process.exitCode = 2;
  } else {
    try {
      const result = verifyMigration(version, JSON.parse(readFileSync(filename, 'utf8')));
      console.log(JSON.stringify(result, null, 2));
      if (!result.matching) {
        console.error('BLOCKED: private historical SQL export differs from recorded Production history.');
        process.exitCode = 1;
      } else {
        console.log('Historical source fingerprint verified; security review and isolated full replay still required.');
      }
    } catch (e) {
      console.error('Verification failed:', e.message);
      process.exitCode = 1;
    }
  }
}
