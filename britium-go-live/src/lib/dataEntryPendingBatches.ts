export function consecutivePendingBatches<T extends {parcel_sequence:number;saved?:boolean;skipped?:boolean}>(rows:T[],limit:number):T[][] {
  if(!Number.isInteger(limit)||limit<1) throw new Error("Invalid batch size");
  const batches:T[][]=[];
  for(const row of rows){
    if(row.saved||row.skipped) continue;
    const previous=batches[batches.length-1];
    if(!previous||previous.length>=limit||row.parcel_sequence!==previous[previous.length-1].parcel_sequence+1) batches.push([row]);
    else previous.push(row);
  }
  return batches;
}
