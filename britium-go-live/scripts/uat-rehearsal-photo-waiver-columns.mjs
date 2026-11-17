/** Verified production-catalog photo review columns for disposable CI rehearsal only. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
assert.equal(process.env.DO_NOT_CONNECT_REMOTE,'1','Remote guard required');
assert.equal(process.env.GITHUB_ACTIONS,'true','CI-only fixture');
const file=path.resolve('supabase/migrations/20261020102950_reason_only_photo_skip.sql');
const original=fs.readFileSync(file,'utf8');
assert.ok(original.includes('v.proof_check_status')&&original.includes('v.raw_payload'),'Photo migration unexpected');
assert.ok(!original.includes('CI_ONLY_PHOTO_WAIVER_COLUMNS'),'Repeated overlay refused');
const predecessor=[
  '-- CI_ONLY_PHOTO_WAIVER_COLUMNS: catalog-verified structural columns; no data copied.',
  'ALTER TABLE public.be_pickup_parcel_verifications',
  " ADD COLUMN IF NOT EXISTS proof_check_status text DEFAULT 'PENDING_REVIEW'::text,",
  " ADD COLUMN IF NOT EXISTS raw_payload jsonb DEFAULT '{}'::jsonb,",
  ' ADD COLUMN IF NOT EXISTS reviewed_by text,',
  ' ADD COLUMN IF NOT EXISTS reviewed_by_email text,',
  ' ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,',
  ' ADD COLUMN IF NOT EXISTS review_note text;',
  ''
].join('\n');
fs.writeFileSync(file,predecessor+'\n'+original);
assert.ok(fs.readFileSync(file,'utf8').endsWith(original),'Original photo migration must remain unchanged');
console.log('CI only: 6 catalog-verified photo review columns staged; original SQL preserved.');
