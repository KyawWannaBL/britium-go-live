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
 const resolved=canonicalRegion(region)||lookup.get(key)||canonicalRegion(township);
 if(resolved==="Yangon")return {code:"BRITIUM",region:resolved,matched:true,needsReview:false,reason:"YANGON_DIRECT"};
 if(resolved==="Mandalay")return {code:"MDY BRANCH",region:resolved,matched:true,needsReview:false,reason:"MANDALAY_BRANCH_DEFAULT_DK_OPTIONAL"};
 if(resolved==="Naypyitaw")return {code:"NPT BRANCH",region:resolved,matched:true,needsReview:false,reason:"NPT_BRANCH_ALL_TOWNSHIPS"};
 // Outside the three core territories, Royal Express is the operational
 // default. If a township is unrecognized, flag only that exceptional row.
 return {code:"ROYAL EXPRESS",region:resolved||"Outside core/unknown",matched:Boolean(resolved),needsReview:!resolved,reason:resolved?"OUTSIDE_CORE_ROYAL":"UNMATCHED_TOWNSHIP_ROYAL_FALLBACK"};
}
export async function loadTerritoryLookup():Promise<TerritoryLookup>{
 if(!cache)cache=(async()=>{
  const {data,error}=await (supabase.from("be_masterdata_townships") as any)
   .select("township_name,township_mm,township_name_en,township_name_mm,city,region")
   .range(0,999);
  if(error)throw error;
  const map=new Map<string,string>();
  for(const t of (data||[]) as MasterTownship[]){
   const region=canonicalRegion(t.region)||canonicalRegion(t.city)||String(t.region||"Other");
   for(const field of [t.township_name,t.township_mm,t.township_name_en,t.township_name_mm]){
    const k=normalizeTownship(field);if(k&&!map.has(k))map.set(k,region);
   }
  }
  return map;
 })().catch(e=>{cache=null;throw e;});
 return cache;
}
