import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
const temp=mkdtempSync(join(tmpdir(),'draft-recovery-'));
try {
  const source=readFileSync(new URL('../src/lib/persistDataEntryDrafts.ts',import.meta.url),'utf8');
  writeFileSync(join(temp,'persist.mjs'),stripTypeScriptTypes(source));
  const {persistDataEntryDrafts}=await import(pathToFileURL(join(temp,'persist.mjs')));
  const stored=new Map();let calls=0;let failSecond=true;
  const client={auth:{getUser:async()=>({data:{user:{id:'test-actor'}}})},from:()=>({upsert:async(rows)=>{
    calls++;if(calls===2&&failSecond)return {error:{message:'test interruption'}};
    for(const row of rows)stored.set(`${row.owner_id}:${row.pickup_id}:${row.parcel_sequence}`,row);
    return {};
  }})};
  const rows=Array.from({length:121},(_,i)=>({pickup_id:'TEST',parcel_sequence:i+1,importedFromOs:true,sourceFileName:'inventory.xlsx',recipient_name:`Recipient ${i}`,item_price:i===0?'':5000,delivery_charges:'',skipped:i===2,locationStatus:'SYNCED',saved:i===120}));
  await assert.rejects(persistDataEntryDrafts(client,rows),/50\/120 import drafts preserved/);
  assert.equal(stored.size,50);
  failSecond=false;
  assert.equal(await persistDataEntryDrafts(client,rows),120);
  assert.equal(stored.size,120,'retry overwrites same draft identities without duplication');
  assert.equal(stored.get('test-actor:TEST:1').snapshot.item_price,'','prepaid blank is retained');
  assert.equal(stored.get('test-actor:TEST:2').snapshot.item_price,5000);
  assert.equal(stored.get('test-actor:TEST:2').snapshot.recipient_name,'Recipient 1');
  assert.equal(stored.get('test-actor:TEST:3').skipped,true,'manual skip preserved');
  assert.equal(stored.get('test-actor:TEST:2').skipped,false,'ordinary draft not silently skipped');
  assert.equal(stored.get('test-actor:TEST:2').snapshot.locationStatus,'SYNCED');
  assert(!stored.has('test-actor:TEST:121'),'saved parcels excluded');
  console.log('PASS: complete import persistence, interruption/retry, prepaid amounts, saved-row exclusion, and explicit skips.');
} finally {rmSync(temp,{recursive:true,force:true});}
