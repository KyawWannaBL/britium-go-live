import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
const temp=mkdtempSync(join(tmpdir(),'pickup-reconciliation-'));
try {
  const source=readFileSync(new URL('../src/lib/pickupReconciliation.ts',import.meta.url),'utf8');
  writeFileSync(join(temp,'reconciliation.mjs'),stripTypeScriptTypes(source));
  const {buildPickupReconciliation,buildUnresolvedExportRows,parseCorrectedWorkbookRows}=await import(pathToFileURL(join(temp,'reconciliation.mjs')));

  const rows=[
    {pickup_id:'P0915-BLK-381',parcel_sequence:1,delivery_way_id:'P0915-BLK-381-001',saved:true,recipient_name:'A',recipient_phone:'091',delivery_address:'Addr 1',township:'Dagon',item_price:1000,delivery_charges:4000,message:''},
    {pickup_id:'P0915-BLK-381',parcel_sequence:2,delivery_way_id:'P0915-BLK-381-002',saved:false,recipient_name:'B',recipient_phone:'092',delivery_address:'Addr 2',township:'North Dagon',item_price:2000,delivery_charges:4000,message:'Location needs synchronization or review'},
    {pickup_id:'P0915-BLK-381',parcel_sequence:3,delivery_way_id:'P0915-BLK-381-003',saved:false,recipient_name:'C',recipient_phone:'093',delivery_address:'Addr 3',township:'Hlaing',item_price:3000,delivery_charges:4000,message:'No active tariff'}
  ];
  const reconciliation=buildPickupReconciliation({pickupId:'P0915-BLK-381',expected:381,warehouseReceived:59,registered:53,rows});
  assert.deepEqual(reconciliation,{pickupId:'P0915-BLK-381',expected:381,warehouseReceived:59,registered:53,dataEntryUnresolved:328,warehouseOutstanding:322,warehouseTrackingGap:6,balanced:false});

  const exported=buildUnresolvedExportRows(rows);
  assert.equal(exported.length,2);
  assert.equal(exported[0]['Pickup ID'],'P0915-BLK-381');
  assert.equal(exported[0]['Parcel Sequence'],2);
  assert.equal(exported[0]['Current Error'],'Location needs synchronization or review');

  const parsed=parseCorrectedWorkbookRows([
    {'Pickup ID':'P0915-BLK-381','Parcel Sequence':2,'Delivery Way ID':'P0915-BLK-381-002','Recipient Name':'Bee','Recipient Phone':'0999','Address':'Fixed','Township':'Dagon Myothit (North)','Item Price':2500,'Delivery Charge':4500,'Resolution':'CORRECTED','Remarks':'ok'},
    {'Pickup ID':'OTHER','Parcel Sequence':3,'Delivery Way ID':'P0915-BLK-381-003','Recipient Name':'Wrong batch'}
  ],'P0915-BLK-381',new Set([2,3]));
  assert.equal(parsed.updates.length,1);
  assert.equal(parsed.errors.length,1);
  assert.equal(parsed.updates[0].parcel_sequence,2);
  assert.equal(parsed.updates[0].patch.recipient_name,'Bee');
  assert.equal(parsed.updates[0].patch.item_price,2500);
  assert.match(parsed.errors[0],/belongs to OTHER/);

  const dup=parseCorrectedWorkbookRows([
    {'Pickup ID':'P0915-BLK-381','Parcel Sequence':2},
    {'Pickup ID':'P0915-BLK-381','Parcel Sequence':2}
  ],'P0915-BLK-381',new Set([2,3]));
  assert.equal(dup.updates.length,1);
  assert.equal(dup.errors.length,1);
  assert.match(dup.errors[0],/Duplicate parcel sequence 2/);

  console.log('PASS: pickup reconciliation counts, unresolved Excel rows, safe corrected-row import, batch isolation, and duplicate protection.');
} finally {rmSync(temp,{recursive:true,force:true});}
