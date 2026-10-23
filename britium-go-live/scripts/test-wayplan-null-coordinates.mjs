import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {recoverWayplanLocations} from '../src/lib/wayplanLocationRecovery.ts';
const source=fs.readFileSync('src/components/MultiVanPlanner.tsx','utf8');
const body=source.match(/function coord\(row: any\) \{([\s\S]*?)\n\}/)?.[1];
assert.ok(body,'exercise the real planner coordinate gate');
const coord=vm.compileFunction(body,['row']);
for(const [latitude,longitude] of [[null,null],[null,96],[16,null],['',''],[' ',96],[91,96],[16,181],[Infinity,96],['bad',96]]) {
 assert.equal(coord({latitude,longitude}),'',`invalid pair ${latitude}/${longitude} must defer assignment routing`);
}
assert.equal(coord({latitude:'16.8',longitude:'96.2'}),'16.8,96.2');
assert.equal(coord({latitude:0,longitude:96}),'0,96','valid equatorial latitude is not missing');
let resolved=0,persisted=0;
const rows=[{delivery_way_id:'NULL',latitude:null,longitude:null},{delivery_way_id:'VALID',latitude:16.8,longitude:96.2}];
const recovery=await recoverWayplanLocations(rows,{resolve:async()=>{resolved++;return null;},persist:async()=>{persisted++;}});
assert.equal(resolved,1,'null coordinates must reach recovery instead of being interpreted as zero');
assert.equal(recovery.unresolved,1);assert.equal(persisted,0);assert.equal(recovery.rows[0].latitude,null);
const rejected=await recoverWayplanLocations([rows[0]],{resolve:async()=>({deliveryWayId:'NULL',latitude:null,longitude:null,reviewStatus:'ACCEPTED',coordinateSource:'GOOGLE_GEOCODE'}),persist:async()=>{persisted++;}});
assert.equal(rejected.recovered,0,'accepted provider result still needs actual valid coordinates');assert.equal(persisted,0);
console.log('PASS Wayplan null coordinates: deferred routing gate, recovery and invalid provider result rejection');
