import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server=await createServer({appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true},server:{middlewareMode:true}});
try {
 const {resolveDataEntryServiceProvider}=await server.ssrLoadModule('/src/lib/dataEntryServiceProviderRouting.ts');
 const options=[7000,8000].map((rate,i)=>({destination_key:`MDY-M01-A${i+1}`,destination_name:`MDY-M01-A${i+1} · ရေတံခွန်တောင် · ${rate} MMK`,provider_code:'DK DELIVERY',standard_rate_mmk:rate,special_rate_mmk:rate}));
 for(const option of options) for(const input of [option.destination_name,option.destination_key,option.destination_key.toLowerCase(),option.destination_key.replaceAll('-','')]) {
  const route=resolveDataEntryServiceProvider(input,'Mandalay receiver address',options,{itemPrice:10000});
  assert.equal(route.providerCode,'DK DELIVERY','explicit approved area rate stays with the Mandalay provider');
  assert.equal(route.routeRegion,'MANDALAY');
  assert.equal(route.deliveryMode,'DOORSTEP_MAP');
  assert.equal(route.mapRequired,true);
  assert.equal(route.option.destination_key,option.destination_key,'the selected slash-price entry must be retained');
 }
 const unspecified=resolveDataEntryServiceProvider('ရေတံခွန်တောင်','Mandalay',options,{itemPrice:10000});
 assert.equal(unspecified.option,null,'a place name alone must not choose one of the paired rates');
 assert.notEqual(resolveDataEntryServiceProvider(options[0].destination_name,'',[],{itemPrice:10000}).providerCode,'DK DELIVERY','unconfigured typed codes do not gain a Mandalay route');
 console.log('PASS Mandalay explicit area rates: provider, map workflow, selected price and no guessed sub-area');
} finally {await server.close();}
