import assert from 'node:assert/strict';
import planner from '../api/wayplan-zone-plan.mjs';
const originalFetch=globalThis.fetch;
process.env.SUPABASE_URL='https://auth-test.invalid';process.env.SUPABASE_ANON_KEY='test';
globalThis.fetch=async()=>new Response('{}',{status:200});
async function plan(townships){return planner.fetch(new Request('https://planner-test.invalid',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify({origin:{latitude:16.8,longitude:96.15},stops:townships.map((township,i)=>({delivery_way_id:`TEST-${i+1}`,township,latitude:16.9,longitude:96.1}))})}));}
try {
 const labels=['ဒဂုံမြို့သစ်အရှေ့ပိုင်း','ဒဂုံမြို့သစ်မြောက်ပိုင်း','ဒဂုံမြို့သစ်တောင်ပိုင်း','ဒဂုံမြို့သစ်ဆိပ်ကမ်း','မြောက်ဥက္ကလာပမြို့နယ်','ရွှေပြည်သာ'];
 const valid=await plan(labels);const body=await valid.json();
 assert.equal(valid.status,200,JSON.stringify(body));
 assert.equal(body.eligible_parcel_count,labels.length);assert.equal(body.routes.length,1);
 const blocked=await plan(['ရွှေပြည်သာ','ဂိတ်ချ','No such township']);const error=await blocked.json();
 assert.equal(blocked.status,422);assert.match(error.message,/TEST-2.*ဂိတ်ချ/);assert.match(error.message,/TEST-3/);
 assert.match(error.message,/highway|handoff/i);assert.deepEqual(error.unmapped.map(x=>x.delivery_way_id),['TEST-2','TEST-3']);
 assert.equal(error.routes,undefined,'Unresolved destinations must not be silently assigned or dropped');
 console.log('Wayplan Myanmar aliases, single-van preservation, explicit highway blocker and unknown destination tests PASS');
} finally {globalThis.fetch=originalFetch;}
