import fs from "node:fs";
import path from "node:path";

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),"..");
const page=fs.readFileSync(path.join(root,"src/pages/DataEntryFinancialV2Page.tsx"),"utf8");

const checks=[
  ["single-row save no longer hard-blocks Google location",!/must be synchronized in Google Location Details before saving/.test(page)],
  ["canonical pickup workflow state is loaded from portal pickup requests",/async function refreshPickupWorkflowState\(/.test(page)&&/from\("be_portal_pickup_requests"\)/.test(page)],
  ["workflow state tracks rider verification and collection",/dataEntryReady:[\s\S]{0,500}waybillReady:/.test(page)],
  ["normal save is blocked until Rider verification",/saveRow[\s\S]{0,1600}Rider verification must be completed before Data Entry Save/.test(page)],
  ["OS softcopy rows retain their bypass path",/const rowUsesOsEvidence=Boolean\(row\.importedFromOs/.test(page)],
  ["waybill generation checks collection stage before backend request",/createAndGenerateWaybill[\s\S]{0,1800}Pickup collection must be completed before normal waybill generation/.test(page)],
  ["selected pickup shows workflow readiness banner",/data-workflow-readiness-v114="true"/.test(page)],
  ["workflow state refreshes when selected pickup changes",/useEffect\(\(\)=>\{void refreshPickupWorkflowState\(selectedPickupId\);\},\[selectedPickupId\]\)/.test(page)],
];

const failures=checks.filter(([,ok])=>!ok).map(([name])=>name);
if(failures.length){
  console.error("End-to-end workflow gates V114 contract FAILED:");
  for(const failure of failures) console.error(" - "+failure);
  process.exit(1);
}
console.log("End-to-end workflow gates V114 contract PASS");
