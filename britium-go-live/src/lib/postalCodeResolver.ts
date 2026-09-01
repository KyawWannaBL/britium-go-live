import { POSTAL_CODE_REGIONS, POSTAL_CODE_ROWS, POSTAL_CODE_TOWNSHIPS } from "@/lib/postalCodeData";

export type PostalMatch = {
  postalCode: string;
  township: string;
  townshipMm: string;
  quarter: string;
  quarterMm: string;
  region: string;
  regionMm: string;
  matchLevel: "EXACT_QUARTER" | "TOWNSHIP_ONLY" | "UNRESOLVED";
};

const aliases: Array<[RegExp, string]> = [
  [/dagonmyothit(?:east)|eastdagon/g,"dagonmyothiteast"],
  [/dagonmyothit(?:north)|northdagon/g,"dagonmyothitnorth"],
  [/dagonmyothit(?:south)|southdagon/g,"dagonmyothitsouth"],
  [/dagonmyothit(?:seikkan)|dagonseikkan/g,"dagonmyothitseikkan"],
  [/hlaingtharyar|hlaingthayar|hlaingthaya/g,"hlaingtharyar"],
  [/shwepyithar|shwepyitha/g,"shwepyitha"],
  [/mayangone|mayangon/g,"mayangone"],
  [/botahtaung|botataung/g,"botahtaung"],
];
const myanmarDigits: Record<string,string> = {"၀":"0","၁":"1","၂":"2","၃":"3","၄":"4","၅":"5","၆":"6","၇":"7","၈":"8","၉":"9"};

function key(value: unknown) {
  let result=String(value??"").normalize("NFC").toLowerCase()
    .replace(/[၀-၉]/g,(digit)=>myanmarDigits[digit])
    .replace(/township|quarter|village|tract|ward|section|ရပ်ကွက်|ကျေးရွာအုပ်စု|မြို့နယ်/g,"")
    .replace(/no\.?/g,"")
    .replace(/[^a-z0-9\u1000-\u109f]+/g,"");
  for(const [pattern,replacement] of aliases) result=result.replace(pattern,replacement);
  return result;
}

const rows=POSTAL_CODE_ROWS.map(([townshipIndex,quarter,postalCode,quarterMm])=>{
  const [township,townshipMm,regionIndex]=POSTAL_CODE_TOWNSHIPS[townshipIndex];
  const [region,regionMm]=POSTAL_CODE_REGIONS[regionIndex];
  return {township,townshipMm,quarter,quarterMm,postalCode,region,regionMm,townshipKeys:[key(township),key(townshipMm)].filter(Boolean),quarterKeys:[key(quarter),key(quarterMm)].filter(Boolean)};
});

export function resolvePostalCode(address: unknown, township: unknown): PostalMatch {
  const addressKey=key(address),townshipKey=key(township);
  const directTownshipRows=rows.filter((row)=>row.townshipKeys.some((candidate)=>candidate&&(candidate===townshipKey||(townshipKey.length>3&&candidate.includes(townshipKey)))));
  const townshipRows=directTownshipRows.length?directTownshipRows:rows.filter((row)=>row.townshipKeys.some((candidate)=>candidate.length>3&&addressKey.includes(candidate)));
  const exact=townshipRows.filter((row)=>row.quarterKeys.some((candidate)=>candidate.length>=1&&addressKey.includes(candidate))).sort((a,b)=>Math.max(...b.quarterKeys.map((x)=>x.length))-Math.max(...a.quarterKeys.map((x)=>x.length)))[0];
  if(exact)return{postalCode:exact.postalCode,township:exact.township,townshipMm:exact.townshipMm,quarter:exact.quarter,quarterMm:exact.quarterMm,region:exact.region,regionMm:exact.regionMm,matchLevel:"EXACT_QUARTER"};
  if(townshipRows.length){const first=townshipRows[0];return{postalCode:"",township:first.township,townshipMm:first.townshipMm,quarter:"",quarterMm:"",region:first.region,regionMm:first.regionMm,matchLevel:"TOWNSHIP_ONLY"};}
  return{postalCode:"",township:String(township||""),townshipMm:"",quarter:"",quarterMm:"",region:"",regionMm:"",matchLevel:"UNRESOLVED"};
}
