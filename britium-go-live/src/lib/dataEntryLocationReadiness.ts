export type LocationReadiness = "skipped" | "synced" | "notRequired" | "resolving" | "review" | "interrupted";
export function locationReadiness(row:{skipped?:boolean;locationStatus:string;message?:string},route:{providerCode:string;mapRequired:boolean}):LocationReadiness {
  if(row.skipped) return "skipped";
  if(!route.providerCode) return "review";
  if(!route.mapRequired) return "notRequired";
  if(row.locationStatus==="SYNCED") return "synced";
  if(row.locationStatus==="REVIEW_REQUIRED") return /timed out|validation failed|could not be loaded|unavailable|no reliable google location/i.test(row.message||"") ? "interrupted" : "review";
  return "resolving";
}
