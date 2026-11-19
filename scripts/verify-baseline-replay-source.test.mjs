import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectBaseline, BASELINE_EXPECTATIONS } from './verify-baseline-replay-source.mjs';

test('missing migration sources fail closed', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'baseline-absent-'));
  try {
    const report = inspectBaseline(dir);
    assert.equal(report.ok, false);
    assert.equal(report.rows[0].failures[0], 'missing file');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('tiny April guard and empty July fail source gate', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'baseline-short-'));
  try {
    writeFileSync(path.join(dir, BASELINE_EXPECTATIONS[0].filename), 'DO $$ BEGIN END $$;');
    writeFileSync(path.join(dir, BASELINE_EXPECTATIONS[1].filename), '');
    const report = inspectBaseline(dir);
    assert.equal(report.ok, false);
    assert.equal(report.rows.filter(x => !x.ok).length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('full-sized marker-bearing fixtures pass only superficial source gate', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'baseline-fixture-'));
  try {
    writeFileSync(path.join(dir, BASELINE_EXPECTATIONS[0].filename),
      'CREATE EXTENSION IF NOT EXISTS "pgtap";\n' + '-- filler\n'.repeat(20000));
    writeFileSync(path.join(dir, BASELINE_EXPECTATIONS[1].filename),
      'CREATE TABLE example(id int);\nCREATE FUNCTION example_fn() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;\n'
      + '-- filler\n'.repeat(200000));
    const report = inspectBaseline(dir);
    assert.equal(report.ok, true);
    assert.match(report.caveat, /not SQL equivalence/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
