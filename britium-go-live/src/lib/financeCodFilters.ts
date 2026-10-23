export type CodFilters={query?:string;from?:string;to?:string;status?:string;payment?:string;worker?:string;van?:string;merchant?:string;duration?:string};
const normalized=(v:unknown)=>String(v??'').trim().toLowerCase();
export function codServiceDate(row:any):string {
 const source=row.metadata?.source_business_date;
 if(/^\d{4}-\d{2}-\d{2}$/.test(source||''))return source;
 const stamp=Date.parse(row.delivered_at||'');
 return Number.isFinite(stamp)?new Date(stamp+23400000).toISOString().slice(0,10):'';
}
function elapsed(row:any,now:number):number|null {
 const service=codServiceDate(row);
 const start=Date.parse(row.delivered_at||(service?`${service}T00:00:00+06:30`:''));
 const end=row.settled_at?Date.parse(row.settled_at):now;
 return Number.isFinite(start)&&Number.isFinite(end)?Math.max(0,end-start):null;
}
export function codDuration(row:any,now=Date.now()):string {
 const ms=elapsed(row,now);if(ms===null)return 'Not recorded';
 const minutes=Math.floor(ms/60000),days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60);
 return `${days?`${days}d `:''}${hours}h ${minutes%60}m`;
}
export function filterCodRows(rows:any[],filters:CodFilters,now=Date.now()):any[] {
 if(filters.from&&filters.to&&filters.from>filters.to)return [];
 return rows.filter(row=>{
  const metadata=row.metadata||{},date=codServiceDate(row),age=elapsed(row,now);
  if(filters.from&&(!date||date<filters.from)||filters.to&&(!date||date>filters.to))return false;
  if(filters.status&&row.settlement_status!==filters.status)return false;
  const lines=metadata.payment_allocations??metadata.reported_payment_allocations;
  const methods=Array.isArray(lines)&&lines.length?lines.map((x:any)=>x.method):[metadata.payment_method||metadata.payment_mode||'UNKNOWN'];
  if(filters.payment&&!methods.includes(filters.payment))return false;
  const worker=[row.rider_name,row.rider_code,row.driver_name,row.driver_code,row.helper_name,row.helper_code,metadata.driver_name,metadata.driver_code,metadata.helper_name,metadata.helper_code,metadata.collector_name,metadata.collector_code].join(' ');
  const van=[row.vehicle_code,row.vehicle_name,row.vehicle_plate,metadata.vehicle_code,metadata.vehicle_name,metadata.vehicle_plate].join(' ');
  const merchant=[row.merchant_name,row.merchant_code,row.merchant_id,String(row.delivery_way_id||'').split('-')[1],metadata.merchant_name,metadata.merchant_code].join(' ');
  for(const [value,needle] of [[worker,filters.worker],[van,filters.van],[merchant,filters.merchant],[JSON.stringify(row),filters.query]])if(needle&&!normalized(value).includes(normalized(needle)))return false;
  if(filters.duration==='OVER_48H'&&(age===null||age<=172800000))return false;
  if(filters.duration==='24_TO_48H'&&(age===null||age<86400000||age>172800000))return false;
  if(filters.duration==='UNDER_24H'&&(age===null||age>=86400000))return false;
  return true;
 });
}
