export type OperationalParcel = {
 delivery_way_id:string;
 warehouse_status?:string|null; wayplan_id?:string|null;
 verified_dispatch_scanned_at?:string|null; physically_handed_over_at?:string|null;
 provider_custody_evidence?:string|null;
 delivered_at?:string|null; rider_proof_present?:boolean|null;
 return_scan_count?:number|null; finance_settlement_status?:string|null;
 attention_category?:string|null; last_evidence_at?:string|null;
};

export const parcelNextAction=(p:OperationalParcel)=>{
 const f=(p.finance_settlement_status||"").toUpperCase();
 const ws=(p.warehouse_status||"").toUpperCase();
 if(f==="SETTLED" && !p.delivered_at)
  return {last:"Finance settlement recorded / ငွေရှင်းမှတ်တမ်းရှိ",next:"Confirm actual delivery/RTO with signed evidence; verify previous payment / ပို့ဆောင်ပြီးစီးမှု သို့မဟုတ် ပြန်အပ်အထောက်အထား အတည်ပြုပါ",step:"EVIDENCE_CONFLICT"};
 if((p.return_scan_count||0)>0 && ws==="READY_FOR_DELIVERY")
  return {last:"Return scan recorded / ပြန်အပ်စကန်မှတ်တမ်းရှိ",next:"Reconcile warehouse status and return custody / ဂိုဒေါင်အခြေအနေနှင့် ပြန်အပ်လက်ခံမှုစစ်ဆေးပါ",step:"RETURN_REVIEW"};
 if(ws==="RETURN_TO_SENDER")
  return {last:"Return to sender recorded / ပြန်အပ်ရန်မှတ်တမ်းရှိ",next:"Obtain merchant signed receipt and verify return fee / ကုန်သည်လက်ခံလက်မှတ်နှင့် ပြန်အပ်ခစစ်ဆေးပါ",step:"RTO_RECEIPT"};
 if(ws==="DELIVERY_FAILED")
  return {last:"Failed delivery recorded / ပို့ဆောင်မအောင်မြင်",next:"Confirm retry date or return decision / ထပ်မံပို့ဆောင်ရက် သို့မဟုတ် ပြန်အပ်ဆုံးဖြတ်ချက်အတည်ပြုပါ",step:"RETRY_REVIEW"};
 if(p.delivered_at && p.rider_proof_present && f!=="SETTLED")
  return {last:"Delivery proof reference recorded / ပို့ဆောင်မှုအထောက်အထားရှိ",next:"Finance to reconcile COD and settlement / ဘဏ္ဍာရေးဌာနမှ COD/ငွေရှင်းအတည်ပြုပါ",step:"FINANCE_REVIEW"};
 if(p.delivered_at && !p.rider_proof_present)
  return {last:"Delivery date recorded without proof / ပို့ရက်ရှိ၊ အထောက်အထားမရှိ",next:"Obtain signed proof of delivery / လက်မှတ်ပါ ပို့ဆောင်အထောက်အထားရယူပါ",step:"POD_REQUIRED"};
 if(p.physically_handed_over_at)
  return {last:"Provider handover recorded / လွှဲပြောင်းလက်ခံမှတ်တမ်းရှိ",next:"Request delivery result or return documentation / ပို့ဆောင်ရလဒ် သို့မဟုတ် ပြန်အပ်အထောက်အထားရယူပါ",step:"PROVIDER_OUTCOME"};
 if(p.verified_dispatch_scanned_at)
  return {last:"Dispatch scan evidenced / ထုတ်ပို့စကန်အထောက်အထားရှိ",next:"Verify signed transfer and responsible custodian / လွှဲပြောင်းလက်ခံလက်မှတ်နှင့် တာဝန်ခံအတည်ပြုပါ",step:"HANDOVER_REQUIRED"};
 if(p.wayplan_id)
  return {last:"Wayplan assigned / Wayplan ချိတ်ဆက်ထား",next:"Verify dispatch scan (planning assumptions are not proof) / ထုတ်ပို့စကန်မှတ်တမ်းအတည်ပြုပါ",step:"DISPATCH_PROOF"};
 return {last:"Warehouse / registration stage / ဂိုဒေါင်/စာရင်းသွင်းအဆင့်",next:"Confirm wayplan, dispatch and last custodian / Wayplan၊ ထုတ်ပို့စကန်နှင့် တာဝန်ခံအတည်ပြုပါ",step:"WAYPLAN_REVIEW"};
};
export const parcelWorkflowStages=[
 "Registration / စာရင်းသွင်း",
 "Wayplan / လမ်းကြောင်း",
 "Dispatch / ထုတ်ပို့",
 "Handover / လွှဲပြောင်း",
 "Delivery or RTO / ပို့ဆောင်/ပြန်အပ်",
 "Finance / ငွေရှင်း"
];
export function evidencedStage(p:OperationalParcel):number{
 if((p.finance_settlement_status||"").toUpperCase()==="SETTLED" && p.delivered_at && p.rider_proof_present)return 5;
 if(p.delivered_at || (p.return_scan_count||0)>0 || ["RETURN_TO_SENDER","DELIVERY_FAILED"].includes((p.warehouse_status||"").toUpperCase()))return 4;
 if(p.physically_handed_over_at)return 3;
 if(p.verified_dispatch_scanned_at)return 2;
 if(p.wayplan_id)return 1;
 return 0;
}
