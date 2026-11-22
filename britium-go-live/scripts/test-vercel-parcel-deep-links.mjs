import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
const vercel=JSON.parse(fs.readFileSync(path.join(root,"vercel.json"),"utf8"));
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const js=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
assert.ok(js,"Found initial deep-link normalizer script");
for(const route of ["/parcel-control","/parcel-follow-up","/admin-hr"]){
 assert.ok(vercel.rewrites.some(x=>x.source===route&&x.destination==="/index.html"),route+" rewrite must reach the SPA");
 for(const pathname of [route,route+"/"]){
  let redirected="";
  const win={location:{pathname,search:"?source=manual",hash:""},history:{replaceState:(_a,_b,url)=>{redirected=url;}}};
  vm.runInNewContext(js,{window:win});
  assert.equal(redirected,"/?source=manual#"+route,route+" must resolve to HashRouter route");
 }
}
for(const pathName of ["/reset-password","/supabase/auth/v1/token","/map-tiles/street/1/2/3.png"]){
 let redirected=null;
 vm.runInNewContext(js,{window:{location:{pathname:pathName,search:"",hash:""},history:{replaceState:(_a,_b,url)=>{redirected=url;}}}});
 assert.equal(redirected,null,"Existing auth/API/map paths must not be altered: "+pathName);
}
let redirected=null;
vm.runInNewContext(js,{window:{location:{pathname:"/parcel-control",search:"",hash:"#/parcel-control"},history:{replaceState:(_a,_b,url)=>{redirected=url;}}}});
assert.equal(redirected,null,"Existing canonical hash navigation is unchanged");
console.log("PASS: Vercel parcel direct routes and HashRouter recovery preserve auth, map, API and canonical URLs");
