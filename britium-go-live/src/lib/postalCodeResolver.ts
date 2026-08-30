import { normalizeMyanmarAddress } from "@/lib/myanmarAddressConverter";
import { POSTAL_CODE_ROWS } from "@/lib/postalCodeData";

export type PostalMatch = { postalCode: string; township: string; quarter: string; matchLevel: "EXACT_QUARTER" | "TOWNSHIP_ONLY" | "UNRESOLVED" };
const aliases: Array<[RegExp, string]> = [[/dagonmyothit(?:east)|eastdagon/g,"dagonmyothiteast"],[/dagonmyothit(?:north)|northdagon/g,"dagonmyothitnorth"],[/dagonmyothit(?:south)|southdagon/g,"dagonmyothitsouth"],[/dagonmyothit(?:seikkan)|dagonseikkan/g,"dagonmyothitseikkan"],[/hlaingtharyar|hlaingthayar|hlaingthaya/g,"hlaingtharyar"],[/shwepyithar|shwepyitha/g,"shwepyitha"],[/mayangone|mayangon/g,"mayangone"],[/botahtaung|botataung/g,"botahtaung"]];
function key(value: unknown) { let result=normalizeMyanmarAddress(value).toLowerCase().replace(/township|quarter|village|tract|ward|section|ရပ်ကွက်|ကျေးရွာအုပ်စု|မြို့နယ်/g,"").replace(/no\.?/g,"").replace(/[^a-z0-9\u1000-\u109f]+/g,""); for(const [pattern,replacement] of aliases) result=result.replace(pattern,replacement); return result; }
const rows=POSTAL_CODE_ROWS.map(([township,quarter,postalCode,townshipMm,quarterMm,division])=>({township,quarter,postalCode,division,townshipKeys:[key(township),key(townshipMm)].filter(Boolean),quarterKeys:[key(quarter),key(quarterMm)].filter(Boolean)}));
export function resolvePostalCode(address: unknown, township: unknown): PostalMatch {
  const addressKey=key(address), townshipKey=key(township);
  const directTownshipRows=rows.filter((row)=>row.townshipKeys.some((candidate)=>candidate&&(candidate===townshipKey||(townshipKey.length>3&&candidate.includes(townshipKey)))));
  const townshipRows=directTownshipRows.length?directTownshipRows:rows.filter((row)=>row.townshipKeys.some((candidate)=>candidate.length>3&&addressKey.includes(candidate)));
  const exact=townshipRows.filter((row)=>row.quarterKeys.some((candidate)=>candidate.length>=1&&addressKey.includes(candidate))).sort((a,b)=>Math.max(...b.quarterKeys.map((x)=>x.length))-Math.max(...a.quarterKeys.map((x)=>x.length)))[0];
  if(exact) return {postalCode:exact.postalCode,township:exact.township,quarter:exact.quarter,matchLevel:"EXACT_QUARTER"};
  if(townshipRows.length) return {postalCode:"",township:townshipRows[0].township,quarter:"",matchLevel:"TOWNSHIP_ONLY"};
  return {postalCode:"",township:String(township||""),quarter:"",matchLevel:"UNRESOLVED"};
}
