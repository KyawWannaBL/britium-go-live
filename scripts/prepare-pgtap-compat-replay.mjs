#!/usr/bin/env node
// Issue #299: generate a reviewed candidate for the April snapshot on a local copy.
// This script does NOT access Supabase, change migration history, or deploy.
import fs from 'node:fs';
import path from 'node:path';

const input=process.argv[2];
if(!input||!fs.existsSync(input)){
 console.error('Usage: node scripts/prepare-pgtap-compat-replay.mjs <fetched-April-snapshot.sql>');
 process.exit(2);
}
const original=fs.readFileSync(input,'utf8');
const declared=new Set([...original.matchAll(/CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+"public"\\."([^"]+)"/gi)].map(m=>m[1]));
const names=new Set();
let wrapped=0;
const grantRe=/GRANT\\s+ALL\\s+ON\\s+FUNCTION\\s+"public"\\."([^"]+)"\\([^;]*?\\)\\s+TO\\s+(?:"[^"]+"|[a-z_]+)\\s*;/gi;
const candidate=original.replace(grantRe,(statement,name)=>{
 if(declared.has(name))return statement;
 names.add(name);wrapped++;
 const quoted=statement.slice(0,-1).trim().replace(/'/g,"''");
 return `DO $pgtap_guard$ BEGIN EXECUTE '${quoted}'; EXCEPTION WHEN undefined_function OR undefined_object THEN NULL; END $pgtap_guard$;`;
});
console.log(JSON.stringify({input:path.resolve(input),declaredFunctionNames:declared.size,guardedStatements:wrapped,guardedNames:names.size},null,2));
if(wrapped===0 || names.size===0){
 console.error('No historical public extension grants detected; refusing to write a candidate.');
 process.exit(1);
}
if(!process.argv.includes('--write')){
 console.log('DRY RUN ONLY. Re-run with --write to generate a separate review file.');
 process.exit(0);
}
const out=input.replace(/\\.sql$/i,'')+'.pgtap-compat-CANDIDATE.sql';
if(out===input)throw new Error('Refusing to overwrite source');
fs.writeFileSync(out,candidate);
console.log('Candidate saved:',out);
console.log('WARNING: Requires approval, full local replay, SQL diff, and new-branch validation before any remote migration history change.');
