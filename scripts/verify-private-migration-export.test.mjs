import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fingerprintStatements, verifyMigration } from './verify-private-migration-export.mjs';
const sha = v => createHash('sha256').update(v, 'utf8').digest('hex');

test('preserves exact ordering and statement boundaries', () => {
  const first = fingerprintStatements(['SELECT 1;', 'SELECT 2;']);
  const reversed = fingerprintStatements(['SELECT 2;', 'SELECT 1;']);
  const merged = fingerprintStatements(['SELECT 1;SELECT 2;']);
  assert.equal(first.count, 2);
  assert.notEqual(first.fingerprint, reversed.fingerprint);
  assert.notEqual(first.fingerprint, merged.fingerprint);
  assert.equal(first.fingerprint, sha(sha('SELECT 1;') + sha('SELECT 2;')));
});

test('validates structure and preserves whitespace', () => {
  assert.throws(() => fingerprintStatements({ statements: [1] }), /ordered JSON array/);
  assert.notEqual(fingerprintStatements(['SELECT 1']).fingerprint, fingerprintStatements(['SELECT 1 ']).fingerprint);
});

test('reports both positive and negative matches in synthetic fixtures', () => {
  const input = { statements: ['a', 'b'] };
  const actual = fingerprintStatements(input);
  const expected = { '20260412000000': { count: 2, fingerprint: actual.fingerprint } };
  assert.equal(verifyMigration('20260412000000', input, expected).matching, true);
  assert.equal(verifyMigration('20260412000000', ['a', 'c'], expected).matching, false);
  assert.throws(() => verifyMigration('wrong', input, expected), /Unsupported/);
});
