/** Source-verified canonical baseline correction for type already created by local pgTap setup. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
assert.equal(process.env.DO_NOT_CONNECT_REMOTE,'1','No remote database access');
assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable local test only');
const file=path.resolve('supabase/migrations/20260721093501_remote_schema.sql');
const original=fs.readFileSync(file,'utf8');
const ddl='create type "public"."_time_trial_type" as ("a_time" numeric);';
assert.equal(original.split(ddl).length,2,'The exact known duplicate composite must occur once');
assert.ok(original.includes('create extension if not exists "pgtap" with schema "public";'),'The preceding pgtap setup must remain');
const guarded=`-- Canonical baseline: preserve existing numeric composite defined by pgtap initialization; validate shape.
DO $guard$
DECLARE v_shape text;
BEGIN
 SELECT string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod),',' ORDER BY a.attnum) INTO v_shape
 FROM pg_attribute a WHERE a.attrelid=to_regclass('public._time_trial_type') AND a.attnum>0 AND NOT a.attisdropped;
 IF v_shape IS NULL THEN
   EXECUTE 'create type public._time_trial_type as (a_time numeric)';
 ELSIF v_shape <> 'a_time:numeric' THEN
   RAISE EXCEPTION 'CANONICAL_BASELINE_PGTAP_COMPOSITE_CHANGED: %',v_shape;
 END IF;
END $guard$;`;
const revised=original.replace(ddl,guarded);
assert.ok(revised.includes('CANONICAL_BASELINE_PGTAP_COMPOSITE_CHANGED'),'Fail-closed guard required');
assert.equal(revised.split('create type "public"."app_role"').length,2,'Business roles unchanged');
fs.writeFileSync(file,revised);
console.log('Canonical baseline test: one pgtap-compatible composite declaration guarded; all original business types and tables unchanged.');
