import assert from 'node:assert/strict';
import route from '../api/wayplan-route.mjs';
import geocode from '../api/mapbox-geocode.mjs';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
process.env.MAPBOX_ACCESS_TOKEN = 'test-token';
process.env.GOOGLE_ROUTES_API_KEY = 'google';
process.env.WAYPLAN_ROAD_PROVIDER_MODE = 'MAPBOX_PREFERRED_BILLING_HOLD';
const origin = {latitude:16.84,longitude:96.17};
const stops = Array.from({length:3},(_,i)=>({delivery_way_id:`DTEST-${i}`,latitude:16.85+i*.01,longitude:96.18+i*.01}));
const request = (extra={}) => new Request('https://test/api/wayplan-route',{method:'POST',headers:{Authorization:'Bearer user','Content-Type':'application/json'},body:JSON.stringify({origin,stops,...extra})});
let calls=[], allow=false, cached=null,badCell=false;
globalThis.fetch = async (input, init) => {
  const url = String(input); calls.push({url,body:init?.body});
  if(url.includes('/auth/v1/user')) return Response.json({id:'user'});
  if(url.includes('/rpc/be_mapbox_reserve_v1')) return Response.json({allowed:allow,reason:allow?'RESERVED':'MONTHLY_LIMIT'});
  if(url.includes('/rpc/be_mapbox_claim_geocode_v1')) return Response.json(cached?{cached:true,payload:cached}:{allowed:allow,reason:'MONTHLY_LIMIT',lease_id:'lease'});
  if(url.includes('/rpc/be_mapbox_complete_geocode_v1')) return Response.json({stored:true});
  if(url.includes('directions-matrix')) {
    const u=new URL(url),ns=u.searchParams.get('sources').split(';').length,nd=u.searchParams.get('destinations').split(';').length;
    return Response.json({code:'Ok',durations:Array.from({length:ns},()=>Array(nd).fill(badCell?null:60)),distances:Array.from({length:ns},()=>Array(nd).fill(badCell?null:500))});
  }
  if(url.includes('search/geocode')) return Response.json({features:[]});
  if(url.includes('googleapis')) throw new Error('Budget fallback must not incur Google fees');
  throw new Error('Unexpected network request');
};
let result=await (await route.fetch(request())).json();
assert.equal(calls.filter(x=>x.url.includes('api.mapbox.com')).length,0,'No Mapbox call after reservation denial');
assert.equal(result.route_mode,'LOCAL_HAVERSINE_ESTIMATE');
assert.ok(result.distance_m>0 && result.duration_s>0);
assert.equal(result.estimated,true);

allow=true; calls=[];
result=await (await route.fetch(request({matrix_mode:'ONE_TO_MANY'}))).json();
const outbound=calls.find(x=>x.url.includes('directions-matrix'));
assert.equal(new URL(outbound.url).searchParams.get('sources'),'0');
assert.equal(new URL(outbound.url).searchParams.get('destinations'),'1;2;3');
assert.equal(JSON.parse(calls.find(x=>x.url.includes('be_mapbox_reserve_v1')).body).p_units,3);
assert.deepEqual(result.durations,[[60,60,60]]);
assert.ok(calls.findIndex(x=>x.url.includes('be_mapbox_reserve_v1')) < calls.findIndex(x=>x.url.includes('directions-matrix')));

calls=[]; result=await (await route.fetch(request({stops:stops.slice(0,1),matrix_mode:'ONE_TO_MANY'}))).json();
assert.equal(JSON.parse(calls.find(x=>x.url.includes('be_mapbox_reserve_v1')).body).p_units,2,'Single destination padding counts toward usage');
assert.equal(result.durations[0].length,1);

calls=[]; cached={features:[{type:'Feature',geometry:{type:'Point',coordinates:[96.17,16.84]}}]};
result=await (await geocode.fetch(new Request('https://test/api/mapbox-geocode?q=Yangon',{headers:{Authorization:'Bearer user'}}))).json();
assert.deepEqual(result.features,cached.features);
assert.equal(calls.filter(x=>x.url.includes('api.mapbox.com')).length,0,'Permanent cache hit uses no Mapbox requests');

cached=null; allow=false; calls=[];
const denied=await geocode.fetch(new Request('https://test/api/mapbox-geocode?q=Yangon',{headers:{Authorization:'Bearer user'}}));
assert.equal(denied.status,503); assert.equal(calls.filter(x=>x.url.includes('api.mapbox.com')).length,0);

allow=true; calls=[];
await geocode.fetch(new Request('https://test/api/mapbox-geocode?q=Yangon',{headers:{Authorization:'Bearer user'}}));
assert.equal(new URL(calls.find(x=>x.url.includes('search/geocode')).url).searchParams.get('permanent'),'true');
assert.ok(calls.findIndex(x=>x.url.includes('be_mapbox_claim_geocode_v1')) < calls.findIndex(x=>x.url.includes('search/geocode')));
assert.ok(calls.some(x=>x.url.includes('be_mapbox_complete_geocode_v1')));
badCell=true;calls=[];
result=await (await route.fetch(request({matrix_mode:'ONE_TO_MANY'}))).json();
assert.equal(result.estimated,true,'Unreachable cells use an explicit estimate, never a zero travel time');
assert.ok(result.durations[0].every(x=>x>0));
console.log('PASS: budget denial, no paid failover, reservation order, 1×N indices, padded element accounting, permanent cache and geocoding guard');
