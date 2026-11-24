import { supabase } from "@/integrations/supabase/client";

type MasterTownship={township_name?:string|null;township_mm?:string|null;township_name_en?:string|null;township_name_mm?:string|null;city?:string|null;region?:string|null};
export type TerritoryLookup=Map<string,string>;
export type TerritoryProvider={code:string;region:string;matched:boolean;reason:string;needsReview:boolean};
export const DEFAULT_PROVIDER_CODES=["BRITIUM","NPT BRANCH","MDY BRANCH","DK DELIVERY","ROYAL EXPRESS","H.TERMINAL DROP-OFF"] as const;
export const normalizeTownship=(value:unknown)=>String(value??"").normalize("NFKC").toLowerCase().replace(/[\s\u200b\u200c\u200d.,()\-_]+/g,"").trim();
let cache:Promise<TerritoryLookup>|null=null;
const canonicalRegion=(raw:unknown)=>{
 const key=normalizeTownship(raw);
 if(["yangon","ရန်ကုန်","ရန်ကုန်တိုင်းဒေသကြီး"].some(x=>key.includes(normalizeTownship(x))))return "Yangon";
 if(["mandalay","မန္တလေး","မန္တလေးတိုင်းဒေသကြီး"].some(x=>key.includes(normalizeTownship(x))))return "Mandalay";
 if(["naypyitaw","naypyidaw","နေပြည်တော်","နေပည်တော်"].some(x=>key.includes(normalizeTownship(x))))return "Naypyitaw";
 return "";
};
export function territoryProvider(township:unknown,region:unknown,lookup:TerritoryLookup):TerritoryProvider{
 const key=normalizeTownship(township);
 const label=String(township||"");
 // Preserve explicitly registered service channels. These are parcel
 // classification hints, not a change to underlying tariffs or custody.
 if(key.includes("ဂိတ်ချ")||key.includes("highwayterminal")||key.includes("gatedropoff"))
   return {code:"H.TERMINAL DROP-OFF",region:"Highway terminal",matched:true,needsReview:false,reason:"EXPLICIT_GATE_DROPOFF"};
 if(/royal/i.test(label))
   return {code:"ROYAL EXPRESS",region:"Royal service",matched:true,needsReview:false,reason:"EXPLICIT_ROYAL_SERVICE_LABEL"};
 if(/^mdy[-\s]/i.test(label))
   return {code:"MDY BRANCH",region:"Mandalay",matched:true,needsReview:false,reason:"MANDALAY_EXPLICIT_AREA_CODE"};
 const resolved=canonicalRegion(region)||lookup.get(key)||canonicalRegion(township)
    ||(key.includes("လှိုင်သာယာ")?"Yangon":"");
 if(resolved==="Yangon")return {code:"BRITIUM",region:resolved,matched:true,needsReview:false,reason:"YANGON_DIRECT"};
 if(resolved==="Mandalay")return {code:"MDY BRANCH",region:resolved,matched:true,needsReview:false,reason:"MANDALAY_BRANCH_DEFAULT_DK_OPTIONAL"};
 if(resolved==="Naypyitaw")return {code:"NPT BRANCH",region:resolved,matched:true,needsReview:false,reason:"NPT_BRANCH_ALL_TOWNSHIPS"};
 // Outside the three core territories, Royal Express is the operational
 // default. If a township is unrecognized, flag only that exceptional row.
 return {code:"ROYAL EXPRESS",region:resolved||"Outside core/unknown",matched:Boolean(resolved),needsReview:!resolved,reason:resolved?"OUTSIDE_CORE_ROYAL":"UNMATCHED_TOWNSHIP_ROYAL_FALLBACK"};
}
export async function loadTerritoryLookup():Promise<TerritoryLookup>{
 if(!cache)cache=(async()=>{
  // The township master is intentionally RLS-protected. Fetch only the
  // reference names/regions via the authenticated read-only RPC.
  const {data,error}=await (supabase as any).rpc("be_provider_township_territories_v1");
  if(error||data?.ok!==true)throw error||new Error("Township reference unavailable");
  const map=new Map<string,string>();
  for(const t of (data.rows||[]) as MasterTownship[]){
   const region=canonicalRegion(t.region)||canonicalRegion(t.city)||String(t.region||"Other");
   for(const field of [t.township_name,t.township_mm,t.township_name_en,t.township_name_mm]){
    const k=normalizeTownship(field);if(k&&!map.has(k))map.set(k,region);
   }
  }
  return map;
 })().catch(e=>{cache=null;throw e;});
 return cache;
}
