import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sourcePath = path.join(root, "src/pages/DataEntryFinancialV2Page.tsx");
let source = fs.readFileSync(sourcePath, "utf8");

if (source.includes("DATA_ENTRY_INPUT_LATENCY_V42")) {
  console.log("Data Entry Input Latency V42 already applied");
  process.exit(0);
}

function replaceOnce(label, before, after) {
  if (!source.includes(before)) throw new Error(`V42 patch anchor not found: ${label}`);
  source = source.replace(before, after);
}

replaceOnce(
  "build marker",
  'export const DATA_ENTRY_PROVIDER_ROUTING_BUILD = "DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903";\n',
  'export const DATA_ENTRY_PROVIDER_ROUTING_BUILD = "DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903";\nexport const DATA_ENTRY_INPUT_LATENCY_V42 = "DATA_ENTRY_INPUT_LATENCY_V42";\n'
);

replaceOnce(
  "highway terminal inputs",
  `          <Field label="Highway terminal name / အဝေးပြေးဂိတ်အမည်">\n            <input className={inputClass} value={row.handoffStationName} onChange={(event)=>updateRow(index,{handoffStationCode:"OTHER",handoffStationName:event.target.value,calculation:{}})} placeholder="Type the terminal / gate name"/>\n          </Field>\n          <Field label="Delivery charges (MMK) / ပို့ဆောင်ခ">\n            <input className={inputClass} type="number" min="0" step="1" value={row.delivery_charges} onChange={(event)=>updateRow(index,{delivery_charges:event.target.value===""?"":Number(event.target.value),calculation:{}})} placeholder="Enter delivery charges"/>\n          </Field>`,
  `          <Field label="Highway terminal name / အဝေးပြေးဂိတ်အမည်">\n            <BufferedDataEntryInput className={inputClass} value={row.handoffStationName} onCommit={(value)=>updateRow(index,{handoffStationCode:"OTHER",handoffStationName:value,calculation:{}})} placeholder="Type the terminal / gate name"/>\n          </Field>\n          <Field label="Delivery charges (MMK) / ပို့ဆောင်ခ">\n            <BufferedDataEntryInput className={inputClass} type="number" min="0" step="1" value={row.delivery_charges} onCommit={(value)=>updateRow(index,{delivery_charges:value===""?"":Number(value),calculation:{}})} placeholder="Enter delivery charges"/>\n          </Field>`
);

replaceOnce(
  "financial parcel inputs",
  `          {!isExact(type) && type!=="DELIVERY_CHARGE_ONLY" ? <Field label="ပစ္စည်းတန်ဖိုး"><input type="number" className={inputClass} value={row.item_price} onChange={(e)=>{\n            const item_price=e.target.value===""?"":Number(e.target.value);\n            const nextRow={...row,item_price};\n            const nextRoute=routeForRow(nextRow,tariffOptions);\n            updateRow(index,{item_price,...routingPatch(nextRoute,nextRow),message:providerRoutingMessage(nextRoute)});\n          }}/></Field>:null}\n          {!isExact(type) ? <Field label="ကုန်သည်သတ်မှတ် ပို့ဆောင်ခ"><input type="number" className={inputClass} value={row.delivery_charges} onChange={(e)=>updateRow(index,{delivery_charges:e.target.value===""?"":Number(e.target.value)})}/></Field>:null}\n          {isExact(type) ? <Field label="အတိအကျ / COD စုစုပေါင်းကောက်ခံငွေ"><input type="number" className={inputClass} value={row.merchant_stated_total_amount} onChange={(e)=>updateRow(index,{merchant_stated_total_amount:e.target.value===""?"":Number(e.target.value)})}/></Field>:null}\n          <Field label="CBM ထပ်ဆောင်းခ"><input type="number" className={inputClass} value={row.cbm_surcharge} onChange={(e)=>updateRow(index,{cbm_surcharge:e.target.value===""?"":Number(e.target.value)})}/></Field>\n          <Field label="အခြားထပ်ဆောင်းခ"><input type="number" className={inputClass} value={row.other_surcharge} onChange={(e)=>updateRow(index,{other_surcharge:e.target.value===""?"":Number(e.target.value)})}/></Field>`,
  `          {!isExact(type) && type!=="DELIVERY_CHARGE_ONLY" ? <Field label="ပစ္စည်းတန်ဖိုး"><BufferedDataEntryInput type="number" className={inputClass} value={row.item_price} onCommit={(value)=>{\n            const item_price=value===""?"":Number(value);\n            const nextRow={...row,item_price};\n            const nextRoute=routeForRow(nextRow,tariffOptions);\n            updateRow(index,{item_price,...routingPatch(nextRoute,nextRow),message:providerRoutingMessage(nextRoute)});\n          }}/></Field>:null}\n          {!isExact(type) ? <Field label="ကုန်သည်သတ်မှတ် ပို့ဆောင်ခ"><BufferedDataEntryInput type="number" className={inputClass} value={row.delivery_charges} onCommit={(value)=>updateRow(index,{delivery_charges:value===""?"":Number(value)})}/></Field>:null}\n          {isExact(type) ? <Field label="အတိအကျ / COD စုစုပေါင်းကောက်ခံငွေ"><BufferedDataEntryInput type="number" className={inputClass} value={row.merchant_stated_total_amount} onCommit={(value)=>updateRow(index,{merchant_stated_total_amount:value===""?"":Number(value)})}/></Field>:null}\n          <Field label="CBM ထပ်ဆောင်းခ"><BufferedDataEntryInput type="number" className={inputClass} value={row.cbm_surcharge} onCommit={(value)=>updateRow(index,{cbm_surcharge:value===""?"":Number(value)})}/></Field>\n          <Field label="အခြားထပ်ဆောင်းခ"><BufferedDataEntryInput type="number" className={inputClass} value={row.other_surcharge} onCommit={(value)=>updateRow(index,{other_surcharge:value===""?"":Number(value)})}/></Field>`
);

fs.writeFileSync(sourcePath, source);
console.log("Applied Data Entry Input Latency V42 build patch");
