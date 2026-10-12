import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true},server:{middlewareMode:true,hmr:false}});
const originalFetch=globalThis.fetch;
let networkCalls=0;
globalThis.fetch=async()=>{networkCalls++;throw new Error('No paid lookup should be needed for a learned address');};
try {
  const {resolveDeliveryLocation}=await server.ssrLoadModule('/src/lib/deliveryLocationService.ts');
  const input={deliveryWayId:'D-ALIAS-TEST',address:'No. 77, Ward 32, North Dagon Township, Yangon',township:'မြောက်ဒဂုံ'};
  const base={latitude:16.88,longitude:96.19,township:'Dagon Myothit (North) Township',provider_label:'Verified pin',match_level:'MANUAL',confidence:1,coordinate_source:'DATA_ENTRY_MANUAL_COORDINATE',postal_code:'1142007',postal_match_level:'EXACT_QUARTER'};
  async function resolve(location,ok=true,error=null){
    const calls=[];
    const client={rpc:async(name,args)=>{calls.push({name,args});return name==='be_location_alias_resolve_v28'?{data:{ok,location},error}:{data:null,error:{code:'PGRST202',message:'Missing function'}};},auth:{getSession:async()=>({data:{session:null}})}};
    return {result:await resolveDeliveryLocation({...input,client}),calls};
  }
  let r=await resolve(base);
  assert.equal(r.result.latitude,base.latitude,'A saved manual pin must be returned before provider lookup');
  assert.equal(r.calls[0].name,'be_location_alias_resolve_v28');
  assert.deepEqual(r.calls[0].args,{p_address:input.address,p_township:base.township});
  assert.equal(r.result.matchLevel,'MANUAL');
  assert.equal(r.result.coordinateSource,base.coordinate_source);
  assert.equal(networkCalls,0);
  r=await resolve({...base,match_level:'POSTAL_DEFAULT',confidence:0.82,coordinate_source:'POSTAL_WARD_DEFAULT_V136'});
  assert.equal(r.result.latitude,base.latitude);
  assert.equal(r.result.matchLevel,'POSTAL_DEFAULT','Cached approximate coordinates must not be promoted to exact address pins');
  assert.equal(r.result.confidence,0.82);
  for(const [location,ok,error] of [[{...base,township:'Insein Township'},true,null],[{...base,latitude:90},true,null],[base,false,null],[base,true,{code:'42501'}]]){
    r=await resolve(location,ok,error);
    assert.notEqual(r.result?.latitude,base.latitude,'Invalid or unauthorized cached pins must not be reused');
  }
  console.log('PASS: deployed alias RPC, canonical township, no network on cache hit, preserved precision, invalid and unauthorized cache rejection');
} finally {globalThis.fetch=originalFetch;await server.close();}
