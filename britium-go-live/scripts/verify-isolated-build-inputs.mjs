import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'portal-build-inputs-'));
try {
 const app=path.join(tmp,'portal');fs.mkdirSync(app);
 fs.cpSync('scripts',path.join(app,'scripts'),{recursive:true});
 fs.cpSync('supabase/migrations',path.join(app,'supabase/migrations'),{recursive:true});
 fs.writeFileSync(path.join(app,'package.json'),'{"type":"module"}');
 fs.symlinkSync(fs.realpathSync('node_modules'),path.join(app,'node_modules'),'dir');
 for(const script of ['verify-wayplan-revision-policy.mjs','verify-wayplan-revision-transaction.mjs','verify-go-live-preview.mjs']){
  const result=spawnSync(process.execPath,[`scripts/${script}`],{cwd:app,encoding:'utf8'});
  assert.equal(result.status,0,`${script} must pass without parent repository files:\n${result.stdout}${result.stderr}`);
 }
 const canonicalDir=path.join(tmp,'supabase/migrations');fs.mkdirSync(canonicalDir,{recursive:true});
 const filename='20261012144059_wayplan_revision_policy_v201.sql';
 const bundled=fs.readFileSync(path.join(app,'scripts/fixtures/migrations',filename),'utf8');
 fs.writeFileSync(path.join(canonicalDir,filename),bundled+'\n-- deliberate drift for regression\n');
 const drift=spawnSync(process.execPath,['scripts/verify-wayplan-revision-policy.mjs'],{cwd:app,encoding:'utf8'});
 assert.notEqual(drift.status,0);assert.match(drift.stderr,/Migration fixture differs from canonical SQL/);
 console.log('PASS: isolated SQL checks execute without parent files and reject canonical fixture drift');
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
