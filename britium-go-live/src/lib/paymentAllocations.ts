export const codPaymentTypes=[['CASH','Cash'],['KBZ_PAY','KBZ Pay'],['WAVE_PAY','Wave Pay'],['AYA_PAY','AYA Pay'],['CB_PAY','CB Pay'],['BANK_TRANSFER','Bank transfer'],['MOBILE_WALLET','Mobile wallet'],['QR','QR']];
export type PaymentAllocation={method:string;amount:string|number;reference:string};
export function codPaymentTypeLabel(value:unknown){const code=String(value||'').trim().toUpperCase();return code?codPaymentTypes.find(([key])=>key===code)?.[1]||String(value):'Not recorded';}
function cents(value:unknown){const text=String(value??'');if(!/^\d+(?:\.\d{1,2})?$/.test(text))return null;const [whole,fraction='']=text.split('.');const result=Number(whole)*100+Number(fraction.padEnd(2,'0'));return Number.isSafeInteger(result)?result:null;}
export function validatePaymentAllocations(lines:PaymentAllocation[],actual:unknown):string|null{
 if(lines.length>20)return 'Use at most 20 payment lines.';
 const total=cents(actual);if(total===null)return 'Enter a valid non-negative collection amount with at most two decimals.';
 let sum=0;for(const line of lines){if(!codPaymentTypes.some(([method])=>method===line.method))return 'Select a valid payment type.';const amount=cents(line.amount);if(amount===null||amount<=0)return 'Each payment amount must be positive with at most two decimals.';if(line.method!=='CASH'&&!String(line.reference||'').trim())return 'A reference is required for every non-cash payment.';sum+=amount;if(!Number.isSafeInteger(sum))return 'Payment total is too large.';}
 return sum===total?null:'Payment amounts must equal the actual amount collected.';
}
export function reportedPaymentDraft(row:any):{actual:string;allocations:PaymentAllocation[]}{
 const metadata=row?.metadata||{};
 const lines=metadata.payment_allocations??metadata.reported_payment_allocations;
 const allocations=Array.isArray(lines)?lines.map((line:any)=>({method:String(line.method||''),amount:String(line.amount??''),reference:String(line.reference||'')})):[];
 // Only recorded collection amounts are eligible; expected amounts are not receipts.
 const actual=row?.cod_collected??metadata.reported_cod_collected_amount;
 return {actual:actual==null?'':String(actual),allocations};
}
export function paymentAllocationLabel(row:any){const lines=row?.metadata?.payment_allocations??row?.metadata?.reported_payment_allocations;if(Array.isArray(lines)&&lines.length)return lines.map((line:any)=>`${codPaymentTypeLabel(line.method)} ${Number(line.amount).toLocaleString('en-US',{maximumFractionDigits:2})}`).join(' + ');return codPaymentTypeLabel(row?.metadata?.payment_method||row?.metadata?.payment_mode);}
export function allocationPayload(lines:PaymentAllocation[]){return lines.map(line=>({method:line.method,amount:Number(line.amount),reference:line.reference.trim()}));}
