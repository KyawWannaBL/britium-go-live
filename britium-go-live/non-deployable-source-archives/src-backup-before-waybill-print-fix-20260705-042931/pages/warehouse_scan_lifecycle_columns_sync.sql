-- Britium Warehouse Scan Lifecycle + Exception Board Patch
-- Adds inbound scan, dispatch scan, return scan 1/2/3 with reason columns.
-- End-day close marks OUT_FOR_DELIVERY parcels with no return as DROP_OFF.
-- Return scan attempts 1-2 become priority next-wayplan; attempt 3 becomes RTO.
-- Return reasons are pulled from be_exception_rules and synced to exception board.
-- Merchant exception snapshot is filtered by merchant_code or merchant_email.
-- Safe to rerun after previous dispatch/warehouse scan patches.

begin;

create extension if not exists pgcrypto;
-- Britium Dispatch / Wayplan / Warehouse Scan Production Patch
-- Purpose:
--  1) Add OUT FOR DELIVERY scan/status control for Dispatch Command.
--  2) Add Generate Wayplan by fleet/rider/van zones.
--  3) Add Warehouse inbound scan, dispatch scan, return scan 1/2/3 with reason selection.
--  4) Push return exceptions to shared Exception screen and merchant-filtered exception view.
--  5) Reuse live data only. No demo/mock/hardcoded parcel rows.
create extension if not exists pgcrypto;

-- -------------------------------------------------------------------------
-- 1) Canonical exception rules table from uploaded britiumLogisticsExceptionRules.json
-- -------------------------------------------------------------------------
create table if not exists public.be_exception_rules (
  exception_code text not null,
  process_type text not null,
  exception_name_en text,
  exception_name_mm text,
  mapped_status text,
  severity text,
  require_photo text,
  require_remark text,
  next_action text,
  customer_message_en text,
  customer_message_mm text,
  raw_rule jsonb default '{}'::jsonb,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (process_type, exception_code)
);

with src as (
  select *
  from jsonb_to_recordset('[{"process_type": "WAREHOUSE", "exception_code": "WAYBILL_MISMATCH", "exception_name_en": "Waybill mismatch", "exception_name_mm": "Waybill မကိုက်ညီပါ", "mapped_status": "WAREHOUSE_HOLD", "severity": "High", "require_photo": "YES", "require_remark": "YES", "next_action": "DATA_CORRECTION", "customer_message_en": "Shipment is on hold because the waybill needs correction.", "customer_message_mm": "Waybill ပြင်ဆင်ရန်လိုအပ်သောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။", "raw_rule": {"exception_code": "WAYBILL_MISMATCH", "exception_name_en": "Waybill mismatch", "exception_name_mm": "Waybill မကိုက်ညီပါ", "process_type": "WAREHOUSE", "mapped_status": "WAREHOUSE_HOLD", "hold_required": "YES", "approval_team": "CS / Data Entry", "require_photo": "YES", "require_remark": "YES", "next_action": "DATA_CORRECTION", "customer_message_en": "Shipment is on hold because the waybill needs correction.", "customer_message_mm": "Waybill ပြင်ဆင်ရန်လိုအပ်သောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။", "Notes / Rules": "Physical waybill and system record do not match. Stop movement until corrected."}}, {"process_type": "WAREHOUSE", "exception_code": "WEIGHT_MISMATCH", "exception_name_en": "Weight mismatch", "exception_name_mm": "အလေးချိန် မကိုက်ညီပါ", "mapped_status": "QC_FAILED", "severity": "High", "require_photo": "COND", "require_remark": "YES", "next_action": "RECALCULATE_TARIFF", "customer_message_en": "Shipment is on hold because actual weight differs from declared weight.", "customer_message_mm": "တကယ့်အလေးချိန်နှင့် ကြေညာထားသောအလေးချိန် မကိုက်ညီသောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။", "raw_rule": {"exception_code": "WEIGHT_MISMATCH", "exception_name_en": "Weight mismatch", "exception_name_mm": "အလေးချိန် မကိုက်ညီပါ", "process_type": "WAREHOUSE", "mapped_status": "QC_FAILED", "hold_required": "YES", "approval_team": "Finance", "require_photo": "COND", "require_remark": "YES", "next_action": "RECALCULATE_TARIFF", "customer_message_en": "Shipment is on hold because actual weight differs from declared weight.", "customer_message_mm": "တကယ့်အလေးချိန်နှင့် ကြေညာထားသောအလေးချိန် မကိုက်ညီသောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။", "Notes / Rules": "Actual weight differs from declared weight. Finance may adjust chargeable weight."}}, {"process_type": "WAREHOUSE", "exception_code": "DAMAGED_PARCEL", "exception_name_en": "Damaged parcel", "exception_name_mm": "ပစ္စည်း ပျက်စီးနေသည်", "mapped_status": "DAMAGED", "severity": "High", "require_photo": "YES", "require_remark": "YES", "next_action": "DAMAGE_REVIEW", "customer_message_en": "Shipment is on hold because the parcel condition needs review.", "customer_message_mm": "ပစ္စည်းအခြေအနေ စစ်ဆေးရန်လိုအပ်သောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။", "raw_rule": {"exception_code": "DAMAGED_PARCEL", "exception_name_en": "Damaged parcel", "exception_name_mm": "ပစ္စည်း ပျက်စီးနေသည်", "process_type": "WAREHOUSE", "mapped_status": "DAMAGED", "hold_required": "YES", "approval_team": "Warehouse / CS", "require_photo": "YES", "require_remark": "YES", "next_action": "DAMAGE_REVIEW", "customer_message_en": "Shipment is on hold because the parcel condition needs review.", "customer_message_mm": "ပစ္စည်းအခြေအနေ စစ်ဆေးရန်လိုအပ်သောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။", "Notes / Rules": "Torn, wet, crushed, leaking, opened, or broken parcel. Photo mandatory."}}, {"process_type": "WAREHOUSE", "exception_code": "MISSING_INVOICE", "exception_name_en": "Missing invoice", "exception_name_mm": "Invoice မပါရှိပါ", "mapped_status": "DOCUMENT_REQUIRED", "severity": "High", "require_photo": "No", "require_remark": "YES", "next_action": "REQUEST_DOCUMENT", "customer_message_en": "Shipment is on hold because required invoice/document is missing.", "customer_message_mm": "လိုအပ်သော Invoice/စာရွက်စာတမ်း မပါရှိသောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။", "raw_rule": {"exception_code": "MISSING_INVOICE", "exception_name_en": "Missing invoice", "exception_name_mm": "Invoice မပါရှိပါ", "process_type": "WAREHOUSE", "mapped_status": "DOCUMENT_REQUIRED", "hold_required": "YES", "approval_team": "CS / Merchant", "require_photo": "No", "require_remark": "YES", "next_action": "REQUEST_DOCUMENT", "customer_message_en": "Shipment is on hold because required invoice/document is missing.", "customer_message_mm": "လိုအပ်သော Invoice/စာရွက်စာတမ်း မပါရှိသောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။", "Notes / Rules": "Commercial invoice, COD invoice, tax invoice, item description, or declared value missing."}}, {"process_type": "WAREHOUSE", "exception_code": "UNIDENTIFIED_PARCEL", "exception_name_en": "Unidentified parcel", "exception_name_mm": "မသိရှိနိုင်သော ပစ္စည်း", "mapped_status": "WAREHOUSE_HOLD", "severity": "High", "require_photo": "YES", "require_remark": "YES", "next_action": "MANUAL_INVESTIGATION", "customer_message_en": "Shipment is on hold because the parcel cannot be identified.", "customer_message_mm": "ပစ္စည်းကို မသိရှိနိုင်သောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။", "raw_rule": {"exception_code": "UNIDENTIFIED_PARCEL", "exception_name_en": "Unidentified parcel", "exception_name_mm": "မသိရှိနိုင်သော ပစ္စည်း", "process_type": "WAREHOUSE", "mapped_status": "WAREHOUSE_HOLD", "hold_required": "YES", "approval_team": "Warehouse", "require_photo": "YES", "require_remark": "YES", "next_action": "MANUAL_INVESTIGATION", "customer_message_en": "Shipment is on hold because the parcel cannot be identified.", "customer_message_mm": "ပစ္စည်းကို မသိရှိနိုင်သောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။", "Notes / Rules": "No label, unreadable barcode, detached waybill, or no system entry."}}, {"process_type": "WAREHOUSE", "exception_code": "WRONG_DESTINATION", "exception_name_en": "Wrong destination", "exception_name_mm": "ဦးတည်ရာ မှားယွင်းသည်", "mapped_status": "MISROUTED", "severity": "High", "require_photo": "COND", "require_remark": "YES", "next_action": "REROUTE", "customer_message_en": "Shipment is being rerouted because it was sent to the wrong destination.", "customer_message_mm": "ဦးတည်ရာမှားယွင်းသွားသောကြောင့် Shipment ကို ပြန်လည်လမ်းကြောင်းသတ်မှတ်နေပါသည်။", "raw_rule": {"exception_code": "WRONG_DESTINATION", "exception_name_en": "Wrong destination", "exception_name_mm": "ဦးတည်ရာ မှားယွင်းသည်", "process_type": "WAREHOUSE", "mapped_status": "MISROUTED", "hold_required": "YES", "approval_team": "Warehouse / Dispatch", "require_photo": "COND", "require_remark": "YES", "next_action": "REROUTE", "customer_message_en": "Shipment is being rerouted because it was sent to the wrong destination.", "customer_message_mm": "ဦးတည်ရာမှားယွင်းသွားသောကြောင့် Shipment ကို ပြန်လည်လမ်းကြောင်းသတ်မှတ်နေပါသည်။", "Notes / Rules": "Parcel sorted or sent to wrong branch, hub, city, township, or zone."}}, {"process_type": "WAREHOUSE", "exception_code": "DUPLICATE_SCAN", "exception_name_en": "Duplicate scan", "exception_name_mm": "Scan ထပ်နေသည်", "mapped_status": "SCAN_WARNING", "severity": "Medium", "require_photo": "No", "require_remark": "No", "next_action": "IGNORE_OR_REVIEW", "customer_message_en": "Duplicate scan detected. No customer action required.", "customer_message_mm": "Scan ထပ်နေမှု တွေ့ရှိပါသည်။ Customer ဘက်မှ လုပ်ဆောင်ရန်မလိုပါ။", "raw_rule": {"exception_code": "DUPLICATE_SCAN", "exception_name_en": "Duplicate scan", "exception_name_mm": "Scan ထပ်နေသည်", "process_type": "WAREHOUSE", "mapped_status": "SCAN_WARNING", "hold_required": "No", "approval_team": "System", "require_photo": "No", "require_remark": "No", "next_action": "IGNORE_OR_REVIEW", "customer_message_en": "Duplicate scan detected. No customer action required.", "customer_message_mm": "Scan ထပ်နေမှု တွေ့ရှိပါသည်။ Customer ဘက်မှ လုပ်ဆောင်ရန်မလိုပါ။", "Notes / Rules": "Same parcel scanned in same location/status within short time. Usually warning only."}}, {"process_type": "WAREHOUSE", "exception_code": "RESTRICTED_ITEM", "exception_name_en": "Restricted item", "exception_name_mm": "တားမြစ်ပစ္စည်း", "mapped_status": "WAREHOUSE_HOLD", "severity": "High", "require_photo": "YES", "require_remark": "YES", "next_action": "COMPLIANCE_REVIEW", "customer_message_en": "Shipment is on hold because the item requires compliance review.", "customer_message_mm": "ပစ္စည်းသည် စည်းမျဉ်းအရ စစ်ဆေးရန်လိုအပ်သောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။", "raw_rule": {"exception_code": "RESTRICTED_ITEM", "exception_name_en": "Restricted item", "exception_name_mm": "တားမြစ်ပစ္စည်း", "process_type": "WAREHOUSE", "mapped_status": "WAREHOUSE_HOLD", "hold_required": "YES", "approval_team": "Compliance", "require_photo": "YES", "require_remark": "YES", "next_action": "COMPLIANCE_REVIEW", "customer_message_en": "Shipment is on hold because the item requires compliance review.", "customer_message_mm": "ပစ္စည်းသည် စည်းမျဉ်းအရ စစ်ဆေးရန်လိုအပ်သောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။", "Notes / Rules": "Restricted item found after pickup. Stop movement and escalate."}}, {"process_type": "WAREHOUSE", "exception_code": "HOLD_BY_FINANCE", "exception_name_en": "Hold by finance", "exception_name_mm": "Finance မှ Hold ပြုလုပ်ထားသည်", "mapped_status": "FINANCE_HOLD", "severity": "High", "require_photo": "No", "require_remark": "YES", "next_action": "FINANCE_RELEASE_REQUIRED", "customer_message_en": "Shipment is on finance hold. It will continue after finance release.", "customer_message_mm": "Finance Hold ဖြစ်နေသောကြောင့် Finance မှ Release ပြုလုပ်ပြီးမှ ဆက်လက်လုပ်ဆောင်ပါမည်။", "raw_rule": {"exception_code": "HOLD_BY_FINANCE", "exception_name_en": "Hold by finance", "exception_name_mm": "Finance မှ Hold ပြုလုပ်ထားသည်", "process_type": "WAREHOUSE", "mapped_status": "FINANCE_HOLD", "hold_required": "YES", "approval_team": "Finance", "require_photo": "No", "require_remark": "YES", "next_action": "FINANCE_RELEASE_REQUIRED", "customer_message_en": "Shipment is on finance hold. It will continue after finance release.", "customer_message_mm": "Finance Hold ဖြစ်နေသောကြောင့် Finance မှ Release ပြုလုပ်ပြီးမှ ဆက်လက်လုပ်ဆောင်ပါမည်။", "Notes / Rules": "Billing, COD, settlement, credit limit, tariff, or invoice issue."}}, {"process_type": "WAREHOUSE", "exception_code": "HOLD_BY_CUSTOMER_SERVICE", "exception_name_en": "Hold by customer service", "exception_name_mm": "Customer Service မှ Hold ပြုလုပ်ထားသည်", "mapped_status": "CS_HOLD", "severity": "High", "require_photo": "No", "require_remark": "YES", "next_action": "CS_RELEASE_REQUIRED", "customer_message_en": "Shipment is on customer service hold pending review.", "customer_message_mm": "Customer Service မှ စစ်ဆေးနေသောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။", "raw_rule": {"exception_code": "HOLD_BY_CUSTOMER_SERVICE", "exception_name_en": "Hold by customer service", "exception_name_mm": "Customer Service မှ Hold ပြုလုပ်ထားသည်", "process_type": "WAREHOUSE", "mapped_status": "CS_HOLD", "hold_required": "YES", "approval_team": "Customer Service", "require_photo": "No", "require_remark": "YES", "next_action": "CS_RELEASE_REQUIRED", "customer_message_en": "Shipment is on customer service hold pending review.", "customer_message_mm": "Customer Service မှ စစ်ဆေးနေသောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။", "Notes / Rules": "Customer request, address correction, complaint, cancellation, or return approval pending."}}, {"process_type": "DELIVERY", "exception_code": "CUSTOMER_NOT_AVAILABLE", "exception_name_en": "Customer not available", "exception_name_mm": "Customer မရှိ / မရရှိနိုင်", "mapped_status": "DELIVERY_ATTEMPTED", "severity": "Low", "require_photo": "No", "require_remark": null, "next_action": "RESCHEDULE_DELIVERY", "customer_message_en": "Delivery attempt failed because the receiver was not available.", "customer_message_mm": "လက်ခံသူ မရှိသောကြောင့် Delivery မအောင်မြင်ပါ။", "raw_rule": {"exception_code": "CUSTOMER_NOT_AVAILABLE", "exception_name_en": "Customer not available", "exception_name_mm": "Customer မရှိ / မရရှိနိုင်", "process_type": "DELIVERY", "mapped_status": "DELIVERY_ATTEMPTED", "severity": "Low", "require_photo": "No", "require_call_log": "YES", "require_cod_note": "No", "allow_reschedule": "YES", "max_attempt_impact": "Attempt 3 -> CS Review/RTO", "next_action": "RESCHEDULE_DELIVERY", "customer_message_en": "Delivery attempt failed because the receiver was not available.", "customer_message_mm": "လက်ခံသူ မရှိသောကြောင့် Delivery မအောင်မြင်ပါ။", "Notes / Rules": "Receiver not available at delivery location. Call log and GPS required."}}, {"process_type": "DELIVERY", "exception_code": "CUSTOMER_REFUSED", "exception_name_en": "Customer refused", "exception_name_mm": "Customer မှ လက်မခံပါ", "mapped_status": "CUSTOMER_REFUSED", "severity": "Medium", "require_photo": "COND", "require_remark": null, "next_action": "CS_REVIEW_OR_RTO", "customer_message_en": "Delivery was refused by the receiver.", "customer_message_mm": "လက်ခံသူမှ ပစ္စည်းကို လက်မခံပါ။", "raw_rule": {"exception_code": "CUSTOMER_REFUSED", "exception_name_en": "Customer refused", "exception_name_mm": "Customer မှ လက်မခံပါ", "process_type": "DELIVERY", "mapped_status": "CUSTOMER_REFUSED", "severity": "Medium", "require_photo": "COND", "require_call_log": "YES", "require_cod_note": "COND", "allow_reschedule": "No", "max_attempt_impact": "CS review before RTO", "next_action": "CS_REVIEW_OR_RTO", "customer_message_en": "Delivery was refused by the receiver.", "customer_message_mm": "လက်ခံသူမှ ပစ္စည်းကို လက်မခံပါ။", "Notes / Rules": "Receiver actively rejects parcel. CS should review before RTO if needed."}}, {"process_type": "DELIVERY", "exception_code": "WRONG_ADDRESS", "exception_name_en": "Wrong address", "exception_name_mm": "လိပ်စာ မှားယွင်းသည်", "mapped_status": "ADDRESS_ISSUE", "severity": "Medium", "require_photo": "COND", "require_remark": null, "next_action": "CS_ADDRESS_REVIEW", "customer_message_en": "Delivery is delayed because the address needs correction.", "customer_message_mm": "လိပ်စာ ပြင်ဆင်ရန် လိုအပ်သောကြောင့် Delivery နှောင့်နှေးနေပါသည်။", "raw_rule": {"exception_code": "WRONG_ADDRESS", "exception_name_en": "Wrong address", "exception_name_mm": "လိပ်စာ မှားယွင်းသည်", "process_type": "DELIVERY", "mapped_status": "ADDRESS_ISSUE", "severity": "Medium", "require_photo": "COND", "require_call_log": "YES", "require_cod_note": "No", "allow_reschedule": "COND", "max_attempt_impact": "Block until corrected", "next_action": "CS_ADDRESS_REVIEW", "customer_message_en": "Delivery is delayed because the address needs correction.", "customer_message_mm": "လိပ်စာ ပြင်ဆင်ရန် လိုအပ်သောကြောင့် Delivery နှောင့်နှေးနေပါသည်။", "Notes / Rules": "Do not continue delivery until address is corrected."}}, {"process_type": "DELIVERY", "exception_code": "PHONE_UNREACHABLE", "exception_name_en": "Phone unreachable", "exception_name_mm": "ဖုန်းဆက်မရပါ", "mapped_status": "DELIVERY_ATTEMPTED", "severity": "Low", "require_photo": "No", "require_remark": null, "next_action": "RETRY_OR_CS_FOLLOWUP", "customer_message_en": "We could not reach the receiver by phone during delivery.", "customer_message_mm": "Delivery ပြုလုပ်ချိန်တွင် လက်ခံသူအား ဖုန်းဖြင့် ဆက်သွယ်၍ မရပါ။", "raw_rule": {"exception_code": "PHONE_UNREACHABLE", "exception_name_en": "Phone unreachable", "exception_name_mm": "ဖုန်းဆက်မရပါ", "process_type": "DELIVERY", "mapped_status": "DELIVERY_ATTEMPTED", "severity": "Low", "require_photo": "No", "require_call_log": "YES", "require_cod_note": "No", "allow_reschedule": "YES", "max_attempt_impact": "2 call attempts minimum", "next_action": "RETRY_OR_CS_FOLLOWUP", "customer_message_en": "We could not reach the receiver by phone during delivery.", "customer_message_mm": "Delivery ပြုလုပ်ချိန်တွင် လက်ခံသူအား ဖုန်းဖြင့် ဆက်သွယ်၍ မရပါ။", "Notes / Rules": "Minimum call attempts should be required before selecting this reason."}}, {"process_type": "DELIVERY", "exception_code": "COD_NOT_READY", "exception_name_en": "COD not ready", "exception_name_mm": "COD ငွေ မပြင်ဆင်ရသေးပါ", "mapped_status": "DELIVERY_RESCHEDULED", "severity": "Low", "require_photo": "No", "require_remark": null, "next_action": "RESCHEDULE_DELIVERY", "customer_message_en": "Delivery could not be completed because COD payment was not ready.", "customer_message_mm": "COD ငွေ မပြင်ဆင်ရသေးသောကြောင့် Delivery မပြီးမြောက်ပါ။", "raw_rule": {"exception_code": "COD_NOT_READY", "exception_name_en": "COD not ready", "exception_name_mm": "COD ငွေ မပြင်ဆင်ရသေးပါ", "process_type": "DELIVERY", "mapped_status": "DELIVERY_RESCHEDULED", "severity": "Low", "require_photo": "No", "require_call_log": "YES", "require_cod_note": "YES", "allow_reschedule": "YES", "max_attempt_impact": "Merchant policy applies", "next_action": "RESCHEDULE_DELIVERY", "customer_message_en": "Delivery could not be completed because COD payment was not ready.", "customer_message_mm": "COD ငွေ မပြင်ဆင်ရသေးသောကြောင့် Delivery မပြီးမြောက်ပါ။", "Notes / Rules": "Receiver available but cannot pay COD amount."}}, {"process_type": "DELIVERY", "exception_code": "CUSTOMER_REQUESTED_RESCHEDULE", "exception_name_en": "Customer requested reschedule", "exception_name_mm": "Customer မှ ပြန်ချိန်းဆိုရန် တောင်းဆိုသည်", "mapped_status": "DELIVERY_RESCHEDULED", "severity": "Low", "require_photo": "No", "require_remark": null, "next_action": "SET_NEXT_ATTEMPT_DATE", "customer_message_en": "Delivery has been rescheduled as requested by the receiver.", "customer_message_mm": "လက်ခံသူ တောင်းဆိုချက်အရ Delivery ကို ပြန်လည်ချိန်းဆိုထားပါသည်။", "raw_rule": {"exception_code": "CUSTOMER_REQUESTED_RESCHEDULE", "exception_name_en": "Customer requested reschedule", "exception_name_mm": "Customer မှ ပြန်ချိန်းဆိုရန် တောင်းဆိုသည်", "process_type": "DELIVERY", "mapped_status": "DELIVERY_RESCHEDULED", "severity": "Low", "require_photo": "No", "require_call_log": "COND", "require_cod_note": "No", "allow_reschedule": "YES", "max_attempt_impact": "Next date required", "next_action": "SET_NEXT_ATTEMPT_DATE", "customer_message_en": "Delivery has been rescheduled as requested by the receiver.", "customer_message_mm": "လက်ခံသူ တောင်းဆိုချက်အရ Delivery ကို ပြန်လည်ချိန်းဆိုထားပါသည်။", "Notes / Rules": "Must capture next requested delivery date/time."}}, {"process_type": "DELIVERY", "exception_code": "NO_ACCESS_TO_BUILDING", "exception_name_en": "No access to building", "exception_name_mm": "အဆောက်အဦး/ဝင်းအတွင်း ဝင်ခွင့်မရပါ", "mapped_status": "DELIVERY_ATTEMPTED", "severity": "Medium", "require_photo": "COND", "require_remark": null, "next_action": "CUSTOMER_ACCESS_REQUIRED", "customer_message_en": "Delivery attempt failed because the rider could not access the delivery location.", "customer_message_mm": "Rider သည် Delivery နေရာသို့ ဝင်ရောက်ခွင့်မရသောကြောင့် Delivery မအောင်မြင်ပါ။", "raw_rule": {"exception_code": "NO_ACCESS_TO_BUILDING", "exception_name_en": "No access to building", "exception_name_mm": "အဆောက်အဦး/ဝင်းအတွင်း ဝင်ခွင့်မရပါ", "process_type": "DELIVERY", "mapped_status": "DELIVERY_ATTEMPTED", "severity": "Medium", "require_photo": "COND", "require_call_log": "YES", "require_cod_note": "No", "allow_reschedule": "YES", "max_attempt_impact": "CS follow-up if repeated", "next_action": "CUSTOMER_ACCESS_REQUIRED", "customer_message_en": "Delivery attempt failed because the rider could not access the delivery location.", "customer_message_mm": "Rider သည် Delivery နေရာသို့ ဝင်ရောက်ခွင့်မရသောကြောင့် Delivery မအောင်မြင်ပါ။", "Notes / Rules": "Security gate, office closed, apartment access denied, restricted compound."}}, {"process_type": "DELIVERY", "exception_code": "PARCEL_DAMAGED", "exception_name_en": "Parcel damaged", "exception_name_mm": "ပစ္စည်း ပျက်စီးနေသည်", "mapped_status": "DAMAGED", "severity": "High", "require_photo": "YES", "require_remark": null, "next_action": "DAMAGE_REVIEW", "customer_message_en": "Delivery is on hold because the parcel condition needs review.", "customer_message_mm": "ပစ္စည်းအခြေအနေ စစ်ဆေးရန် လိုအပ်သောကြောင့် Delivery ကို ယာယီရပ်ဆိုင်းထားပါသည်။", "raw_rule": {"exception_code": "PARCEL_DAMAGED", "exception_name_en": "Parcel damaged", "exception_name_mm": "ပစ္စည်း ပျက်စီးနေသည်", "process_type": "DELIVERY", "mapped_status": "DAMAGED", "severity": "High", "require_photo": "YES", "require_call_log": "COND", "require_cod_note": "No", "allow_reschedule": "No", "max_attempt_impact": "Claim review", "next_action": "DAMAGE_REVIEW", "customer_message_en": "Delivery is on hold because the parcel condition needs review.", "customer_message_mm": "ပစ္စည်းအခြေအနေ စစ်ဆေးရန် လိုအပ်သောကြောင့် Delivery ကို ယာယီရပ်ဆိုင်းထားပါသည်။", "Notes / Rules": "Damage found before handover or receiver refuses due to visible damage."}}, {"process_type": "DELIVERY", "exception_code": "WEATHER_TRAFFIC_ISSUE", "exception_name_en": "Weather/traffic issue", "exception_name_mm": "ရာသီဥတု/လမ်းကြောင်း ပြဿနာ", "mapped_status": "DELIVERY_DELAYED", "severity": "Low", "require_photo": "No", "require_remark": null, "next_action": "AUTO_RESCHEDULE", "customer_message_en": "Delivery is delayed due to weather or traffic conditions.", "customer_message_mm": "ရာသီဥတု သို့မဟုတ် လမ်းကြောင်းအခြေအနေကြောင့် Delivery နှောင့်နှေးနေပါသည်။", "raw_rule": {"exception_code": "WEATHER_TRAFFIC_ISSUE", "exception_name_en": "Weather/traffic issue", "exception_name_mm": "ရာသီဥတု/လမ်းကြောင်း ပြဿနာ", "process_type": "DELIVERY", "mapped_status": "DELIVERY_DELAYED", "severity": "Low", "require_photo": "No", "require_call_log": "No", "require_cod_note": "No", "allow_reschedule": "YES", "max_attempt_impact": "Auto-reschedule", "next_action": "AUTO_RESCHEDULE", "customer_message_en": "Delivery is delayed due to weather or traffic conditions.", "customer_message_mm": "ရာသီဥတု သို့မဟုတ် လမ်းကြောင်းအခြေအနေကြောင့် Delivery နှောင့်နှေးနေပါသည်။", "Notes / Rules": "Heavy rain, flood, traffic blockage, road closure, accident delay."}}, {"process_type": "DELIVERY", "exception_code": "RIDER_ISSUE", "exception_name_en": "Rider issue", "exception_name_mm": "Rider ဘက်မှ လုပ်ငန်းဆိုင်ရာ ပြဿနာ", "mapped_status": "REASSIGNMENT_REQUIRED", "severity": "Medium", "require_photo": "No", "require_remark": null, "next_action": "REASSIGN_RIDER", "customer_message_en": "Delivery is delayed due to operational reasons. It will be reassigned.", "customer_message_mm": "လုပ်ငန်းဆိုင်ရာ အကြောင်းပြချက်ကြောင့် Delivery နှောင့်နှေးနေပါသည်။ Rider ပြန်လည်သတ်မှတ်ပါမည်။", "raw_rule": {"exception_code": "RIDER_ISSUE", "exception_name_en": "Rider issue", "exception_name_mm": "Rider ဘက်မှ လုပ်ငန်းဆိုင်ရာ ပြဿနာ", "process_type": "DELIVERY", "mapped_status": "REASSIGNMENT_REQUIRED", "severity": "Medium", "require_photo": "No", "require_call_log": "No", "require_cod_note": "No", "allow_reschedule": "YES", "max_attempt_impact": "Dispatch reassignment", "next_action": "REASSIGN_RIDER", "customer_message_en": "Delivery is delayed due to operational reasons. It will be reassigned.", "customer_message_mm": "လုပ်ငန်းဆိုင်ရာ အကြောင်းပြချက်ကြောင့် Delivery နှောင့်နှေးနေပါသည်။ Rider ပြန်လည်သတ်မှတ်ပါမည်။", "Notes / Rules": "Vehicle breakdown, rider sick, app issue, route overload, parcel not loaded correctly."}}, {"process_type": "PICKUP", "exception_code": "CUSTOMER_NOT_AVAILABLE", "exception_name_en": "Customer not available", "exception_name_mm": "Customer မရှိ / မရရှိနိုင်", "mapped_status": "PICKUP_FAILED", "severity": "Low", "require_photo": "No", "require_remark": "YES", "next_action": "RESCHEDULE_PICKUP", "customer_message_en": "Pickup attempt failed because the sender was not available. Please reschedule pickup.", "customer_message_mm": "ပစ္စည်းယူရန် လာရောက်ချိန်တွင် ပေးပို့သူ မရှိသောကြောင့် Pickup မအောင်မြင်ပါ။ ပြန်လည်ချိန်းဆိုပါ။", "raw_rule": {"exception_code": "CUSTOMER_NOT_AVAILABLE", "exception_name_en": "Customer not available", "exception_name_mm": "Customer မရှိ / မရရှိနိုင်", "process_type": "PICKUP", "mapped_status": "PICKUP_FAILED", "severity": "Low", "require_photo": "No", "require_call_log": "YES", "require_remark": "YES", "allow_reschedule": "YES", "next_action": "RESCHEDULE_PICKUP", "customer_message_en": "Pickup attempt failed because the sender was not available. Please reschedule pickup.", "customer_message_mm": "ပစ္စည်းယူရန် လာရောက်ချိန်တွင် ပေးပို့သူ မရှိသောကြောင့် Pickup မအောင်မြင်ပါ။ ပြန်လည်ချိန်းဆိုပါ။", "Notes / Rules": "Rider arrived but sender/customer was not available. GPS and call log required."}}, {"process_type": "PICKUP", "exception_code": "MERCHANT_CLOSED", "exception_name_en": "Merchant closed", "exception_name_mm": "ဆိုင်ပိတ်ထားသည်", "mapped_status": "PICKUP_FAILED", "severity": "Low", "require_photo": "YES", "require_remark": "YES", "next_action": "RESCHEDULE_PICKUP", "customer_message_en": "Pickup attempt failed because the merchant location was closed.", "customer_message_mm": "ဆိုင်/ရုံး ပိတ်ထားသောကြောင့် Pickup မအောင်မြင်ပါ။", "raw_rule": {"exception_code": "MERCHANT_CLOSED", "exception_name_en": "Merchant closed", "exception_name_mm": "ဆိုင်ပိတ်ထားသည်", "process_type": "PICKUP", "mapped_status": "PICKUP_FAILED", "severity": "Low", "require_photo": "YES", "require_call_log": "YES", "require_remark": "YES", "allow_reschedule": "YES", "next_action": "RESCHEDULE_PICKUP", "customer_message_en": "Pickup attempt failed because the merchant location was closed.", "customer_message_mm": "ဆိုင်/ရုံး ပိတ်ထားသောကြောင့် Pickup မအောင်မြင်ပါ။", "Notes / Rules": "Use for shop/warehouse/office closed. Photo proof should be mandatory."}}, {"process_type": "PICKUP", "exception_code": "PARCEL_NOT_READY", "exception_name_en": "Parcel not ready", "exception_name_mm": "ပစ္စည်းမပြင်ဆင်ရသေးပါ", "mapped_status": "PICKUP_FAILED", "severity": "Low", "require_photo": "No", "require_remark": "YES", "next_action": "RESCHEDULE_PICKUP", "customer_message_en": "Pickup could not be completed because the parcel was not ready.", "customer_message_mm": "ပစ္စည်း မပြင်ဆင်ရသေးသောကြောင့် Pickup မပြီးမြောက်ပါ။", "raw_rule": {"exception_code": "PARCEL_NOT_READY", "exception_name_en": "Parcel not ready", "exception_name_mm": "ပစ္စည်းမပြင်ဆင်ရသေးပါ", "process_type": "PICKUP", "mapped_status": "PICKUP_FAILED", "severity": "Low", "require_photo": "No", "require_call_log": "No", "require_remark": "YES", "allow_reschedule": "YES", "next_action": "RESCHEDULE_PICKUP", "customer_message_en": "Pickup could not be completed because the parcel was not ready.", "customer_message_mm": "ပစ္စည်း မပြင်ဆင်ရသေးသောကြောင့် Pickup မပြီးမြောက်ပါ။", "Notes / Rules": "Parcel not packed, label missing, order not ready, or merchant requested later pickup."}}, {"process_type": "PICKUP", "exception_code": "WRONG_PICKUP_ADDRESS", "exception_name_en": "Wrong pickup address", "exception_name_mm": "Pickup လိပ်စာ မှားယွင်းသည်", "mapped_status": "ADDRESS_CORRECTION_REQUIRED", "severity": "Medium", "require_photo": "COND", "require_remark": "YES", "next_action": "CS_ADDRESS_REVIEW", "customer_message_en": "Pickup could not be completed because the pickup address needs correction.", "customer_message_mm": "Pickup လိပ်စာ ပြင်ဆင်ရန် လိုအပ်သောကြောင့် Pickup မပြီးမြောက်ပါ။", "raw_rule": {"exception_code": "WRONG_PICKUP_ADDRESS", "exception_name_en": "Wrong pickup address", "exception_name_mm": "Pickup လိပ်စာ မှားယွင်းသည်", "process_type": "PICKUP", "mapped_status": "ADDRESS_CORRECTION_REQUIRED", "severity": "Medium", "require_photo": "COND", "require_call_log": "YES", "require_remark": "YES", "allow_reschedule": "COND", "next_action": "CS_ADDRESS_REVIEW", "customer_message_en": "Pickup could not be completed because the pickup address needs correction.", "customer_message_mm": "Pickup လိပ်စာ ပြင်ဆင်ရန် လိုအပ်သောကြောင့် Pickup မပြီးမြောက်ပါ။", "Notes / Rules": "Do not allow next pickup until the address is corrected by CS/Data Entry."}}, {"process_type": "PICKUP", "exception_code": "PAYMENT_ISSUE", "exception_name_en": "Payment issue", "exception_name_mm": "ငွေပေးချေမှု ပြဿနာ", "mapped_status": "PICKUP_ON_HOLD", "severity": "High", "require_photo": "No", "require_remark": "YES", "next_action": "FINANCE_REVIEW", "customer_message_en": "Pickup is on hold due to a payment issue. Please contact support.", "customer_message_mm": "ငွေပေးချေမှု ပြဿနာကြောင့် Pickup ကို ယာယီရပ်ဆိုင်းထားပါသည်။ Support ကို ဆက်သွယ်ပါ။", "raw_rule": {"exception_code": "PAYMENT_ISSUE", "exception_name_en": "Payment issue", "exception_name_mm": "ငွေပေးချေမှု ပြဿနာ", "process_type": "PICKUP", "mapped_status": "PICKUP_ON_HOLD", "severity": "High", "require_photo": "No", "require_call_log": "No", "require_remark": "YES", "allow_reschedule": "COND", "next_action": "FINANCE_REVIEW", "customer_message_en": "Pickup is on hold due to a payment issue. Please contact support.", "customer_message_mm": "ငွေပေးချေမှု ပြဿနာကြောင့် Pickup ကို ယာယီရပ်ဆိုင်းထားပါသည်။ Support ကို ဆက်သွယ်ပါ။", "Notes / Rules": "Use for unpaid balance, prepaid not received, credit limit exceeded, COD settlement issue."}}, {"process_type": "PICKUP", "exception_code": "OVERSIZED_PARCEL", "exception_name_en": "Oversized parcel", "exception_name_mm": "အရွယ်အစား/အလေးချိန် ကျော်လွန်သည်", "mapped_status": "SPECIAL_HANDLING_REQUIRED", "severity": "Medium", "require_photo": "YES", "require_remark": "YES", "next_action": "REASSIGN_VEHICLE", "customer_message_en": "Pickup requires special handling because the parcel is oversized.", "customer_message_mm": "ပစ္စည်းအရွယ်အစား/အလေးချိန်ကြီးသောကြောင့် အထူးစီမံဆောင်ရွက်ရန် လိုအပ်ပါသည်။", "raw_rule": {"exception_code": "OVERSIZED_PARCEL", "exception_name_en": "Oversized parcel", "exception_name_mm": "အရွယ်အစား/အလေးချိန် ကျော်လွန်သည်", "process_type": "PICKUP", "mapped_status": "SPECIAL_HANDLING_REQUIRED", "severity": "Medium", "require_photo": "YES", "require_call_log": "No", "require_remark": "YES", "allow_reschedule": "COND", "next_action": "REASSIGN_VEHICLE", "customer_message_en": "Pickup requires special handling because the parcel is oversized.", "customer_message_mm": "ပစ္စည်းအရွယ်အစား/အလေးချိန်ကြီးသောကြောင့် အထူးစီမံဆောင်ရွက်ရန် လိုအပ်ပါသည်။", "Notes / Rules": "Bike rider cannot collect. Reassign van/truck or reject if not serviceable."}}, {"process_type": "PICKUP", "exception_code": "RESTRICTED_ITEM", "exception_name_en": "Restricted item", "exception_name_mm": "တားမြစ်ပစ္စည်း", "mapped_status": "PICKUP_REJECTED", "severity": "Critical", "require_photo": "YES", "require_remark": "YES", "next_action": "COMPLIANCE_REVIEW", "customer_message_en": "Pickup cannot proceed because the item is restricted under shipping policy.", "customer_message_mm": "ပို့ဆောင်ခွင့်မပြုထားသော ပစ္စည်းဖြစ်သောကြောင့် Pickup ဆက်လက်မလုပ်ဆောင်နိုင်ပါ။", "raw_rule": {"exception_code": "RESTRICTED_ITEM", "exception_name_en": "Restricted item", "exception_name_mm": "တားမြစ်ပစ္စည်း", "process_type": "PICKUP", "mapped_status": "PICKUP_REJECTED", "severity": "Critical", "require_photo": "YES", "require_call_log": "No", "require_remark": "YES", "allow_reschedule": "No", "next_action": "COMPLIANCE_REVIEW", "customer_message_en": "Pickup cannot proceed because the item is restricted under shipping policy.", "customer_message_mm": "ပို့ဆောင်ခွင့်မပြုထားသော ပစ္စည်းဖြစ်သောကြောင့် Pickup ဆက်လက်မလုပ်ဆောင်နိုင်ပါ။", "Notes / Rules": "Hazardous, illegal, flammable, restricted, cash/valuable, unpacked liquid, etc."}}, {"process_type": "PICKUP", "exception_code": "DUPLICATE_REQUEST", "exception_name_en": "Duplicate request", "exception_name_mm": "ထပ်နေသော Pickup Request", "mapped_status": "PICKUP_CANCELLED", "severity": "Low", "require_photo": "No", "require_remark": "YES", "next_action": "CANCEL_DUPLICATE", "customer_message_en": "Duplicate pickup request was cancelled. The active pickup request remains in progress.", "customer_message_mm": "ထပ်နေသော Pickup Request ကို ပယ်ဖျက်ထားပါသည်။ မှန်ကန်သော Request ကို ဆက်လက်လုပ်ဆောင်နေပါသည်။", "raw_rule": {"exception_code": "DUPLICATE_REQUEST", "exception_name_en": "Duplicate request", "exception_name_mm": "ထပ်နေသော Pickup Request", "process_type": "PICKUP", "mapped_status": "PICKUP_CANCELLED", "severity": "Low", "require_photo": "No", "require_call_log": "No", "require_remark": "YES", "allow_reschedule": "No", "next_action": "CANCEL_DUPLICATE", "customer_message_en": "Duplicate pickup request was cancelled. The active pickup request remains in progress.", "customer_message_mm": "ထပ်နေသော Pickup Request ကို ပယ်ဖျက်ထားပါသည်။ မှန်ကန်သော Request ကို ဆက်လက်လုပ်ဆောင်နေပါသည်။", "Notes / Rules": "Same merchant/customer/address/date/order/waybill. Keep valid request and cancel duplicate."}}]'::jsonb) as x(
    process_type text,
    exception_code text,
    exception_name_en text,
    exception_name_mm text,
    mapped_status text,
    severity text,
    require_photo text,
    require_remark text,
    next_action text,
    customer_message_en text,
    customer_message_mm text,
    raw_rule jsonb
  )
)
insert into public.be_exception_rules (
  process_type, exception_code, exception_name_en, exception_name_mm, mapped_status,
  severity, require_photo, require_remark, next_action, customer_message_en, customer_message_mm, raw_rule,
  active, created_at, updated_at
)
select
  process_type, exception_code, exception_name_en, exception_name_mm, mapped_status,
  severity, require_photo, require_remark, next_action, customer_message_en, customer_message_mm, raw_rule,
  true, now(), now()
from src
where nullif(exception_code,'') is not null
on conflict (process_type, exception_code)
do update set
  exception_name_en = excluded.exception_name_en,
  exception_name_mm = excluded.exception_name_mm,
  mapped_status = excluded.mapped_status,
  severity = excluded.severity,
  require_photo = excluded.require_photo,
  require_remark = excluded.require_remark,
  next_action = excluded.next_action,
  customer_message_en = excluded.customer_message_en,
  customer_message_mm = excluded.customer_message_mm,
  raw_rule = excluded.raw_rule,
  active = true,
  updated_at = now();

-- -------------------------------------------------------------------------
-- 2) Scan/return lifecycle compatibility columns
-- -------------------------------------------------------------------------


-- Compatibility fix: some existing be_wayplans tables do not have merchant columns,
-- but the operational views join wayplan header (w) with wayplan items (i).
alter table public.be_wayplans
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists merchant_email text;

alter table public.be_wayplan_items
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists merchant_email text,
  add column if not exists phone_number text,
  add column if not exists remarks text,
  add column if not exists remark text,
  add column if not exists special_instruction text,
  add column if not exists special_instructions text;

alter table public.be_wayplan_items
  add column if not exists inbound_scan_at timestamptz,
  add column if not exists inbound_scan_by text,
  add column if not exists inbound_scan_code text,
  add column if not exists dispatch_scan_at timestamptz,
  add column if not exists dispatch_scan_by text,
  add column if not exists dispatch_scan_code text,
  add column if not exists return_scan_1_at timestamptz,
  add column if not exists return_scan_1_by text,
  add column if not exists return_reason_1 text,
  add column if not exists return_scan_2_at timestamptz,
  add column if not exists return_scan_2_by text,
  add column if not exists return_reason_2 text,
  add column if not exists return_scan_3_at timestamptz,
  add column if not exists return_scan_3_by text,
  add column if not exists return_reason_3 text,
  add column if not exists return_attempt_count integer default 0,
  add column if not exists rto_at timestamptz,
  add column if not exists rto_reason text,
  add column if not exists dropoff_at timestamptz,
  add column if not exists exception_status text,
  add column if not exists next_attempt_priority boolean default false,
  add column if not exists warehouse_scan_status text,
  add column if not exists last_exception_code text,
  add column if not exists last_exception_reason text;

alter table public.be_portal_pickup_request_items
  add column if not exists tracking_no text,
  add column if not exists delivery_way_id text,
  add column if not exists delivery_status text,
  add column if not exists dispatch_status text,
  add column if not exists wayplan_status text,
  add column if not exists warehouse_status text,
  add column if not exists inbound_scan_at timestamptz,
  add column if not exists dispatch_scan_at timestamptz,
  add column if not exists return_attempt_count integer default 0,
  add column if not exists rto_at timestamptz,
  add column if not exists exception_status text,
  add column if not exists next_attempt_priority boolean default false,
  add column if not exists last_exception_code text,
  add column if not exists last_exception_reason text,
  add column if not exists warehouse_scan_status text;

alter table public.be_dispatch_job_assignments
  add column if not exists inbound_scan_at timestamptz,
  add column if not exists dispatch_scan_at timestamptz,
  add column if not exists return_attempt_count integer default 0,
  add column if not exists rto_at timestamptz,
  add column if not exists exception_status text,
  add column if not exists next_attempt_priority boolean default false,
  add column if not exists last_exception_code text,
  add column if not exists last_exception_reason text;

-- -------------------------------------------------------------------------
-- 3) Exception/event audit table
-- -------------------------------------------------------------------------
create table if not exists public.be_parcel_exception_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  tracking_no text not null,
  delivery_way_id text,
  waybill_no text,
  pickup_id text,
  wayplan_code text,
  merchant_code text,
  merchant_name text,
  merchant_email text,
  recipient_name text,
  recipient_phone text,
  township text,
  process_type text default 'DELIVERY',
  exception_code text not null,
  exception_name_en text,
  exception_name_mm text,
  mapped_status text,
  attempt_no integer default 1,
  remarks text,
  reported_by_email text,
  branch_code text default 'YGN',
  previous_status text,
  new_status text,
  next_action text,
  is_rto boolean default false,
  resolved_at timestamptz,
  resolved_by_email text
);

create index if not exists be_parcel_exception_events_tracking_idx on public.be_parcel_exception_events(tracking_no);
create index if not exists be_parcel_exception_events_merchant_idx on public.be_parcel_exception_events(merchant_code, merchant_email);
create index if not exists be_parcel_exception_events_open_idx on public.be_parcel_exception_events(resolved_at) where resolved_at is null;

-- -------------------------------------------------------------------------
-- 4) Operational scan lifecycle view
-- -------------------------------------------------------------------------
drop view if exists public.be_v_warehouse_scan_lifecycle cascade;

create or replace view public.be_v_warehouse_scan_lifecycle as
select
  j.id,
  j.wayplan_code,
  j.wayplan_no,
  j.wayplan_id,
  j.tracking_no,
  j.waybill_no,
  j.pickup_id,
  j.delivery_way_id,
  j.parcel_sequence,
  j.item_no,
  coalesce(nullif(i.merchant_code,''), nullif(w.merchant_code,'')) as merchant_code,
  coalesce(nullif(i.merchant_name,''), nullif(w.merchant_name,'')) as merchant_name,
  coalesce(nullif(i.merchant_email,''), nullif(w.merchant_email,'')) as merchant_email,
  j.recipient_name,
  j.phone_number,
  j.recipient_phone,
  j.recipient_phone_2,
  j.recipient_address,
  j.delivery_township,
  j.destination_city,
  j.remarks,
  j.weight_kg,
  j.cod_amount,
  j.delivery_charges,
  j.total_collected_amount,
  j.asset_code,
  j.asset_name,
  j.asset_type,
  j.vehicle_plate,
  j.driver_email,
  j.rider_email,
  j.helper_email,
  coalesce(nullif(i.warehouse_status,''), 'RECEIVED') as warehouse_status,
  coalesce(nullif(i.wayplan_status,''), 'ASSIGNED') as wayplan_status,
  coalesce(nullif(j.dispatch_status,''), nullif(i.dispatch_status,''), 'READY_FOR_DISPATCH') as dispatch_status,
  coalesce(nullif(j.delivery_status,''), nullif(i.delivery_status,''), 'PENDING') as delivery_status,
  i.inbound_scan_at,
  i.inbound_scan_by,
  i.inbound_scan_code,
  i.dispatch_scan_at,
  i.dispatch_scan_by,
  i.dispatch_scan_code,
  i.return_scan_1_at,
  i.return_scan_1_by,
  i.return_reason_1,
  r1.exception_name_en as return_reason_1_name,
  i.return_scan_2_at,
  i.return_scan_2_by,
  i.return_reason_2,
  r2.exception_name_en as return_reason_2_name,
  i.return_scan_3_at,
  i.return_scan_3_by,
  i.return_reason_3,
  r3.exception_name_en as return_reason_3_name,
  coalesce(i.return_attempt_count,0) as return_attempt_count,
  i.rto_at,
  i.rto_reason,
  i.dropoff_at,
  coalesce(i.exception_status, j.failed_reason) as exception_status,
  coalesce(i.next_attempt_priority,false) as next_attempt_priority,
  coalesce(nullif(i.warehouse_scan_status,''), case
    when i.rto_at is not null then 'RTO'
    when i.return_attempt_count >= 3 then 'RTO'
    when i.dropoff_at is not null then 'DROP_OFF'
    when i.dispatch_scan_at is not null then 'DISPATCH_SCANNED'
    when i.inbound_scan_at is not null then 'RECEIVED'
    else coalesce(nullif(i.warehouse_status,''), 'RECEIVED')
  end) as warehouse_scan_status,
  i.last_exception_code,
  i.last_exception_reason,
  j.updated_at
from public.be_v_enterprise_dispatch_jobs j
left join public.be_wayplan_items i
  on coalesce(nullif(i.tracking_no,''), nullif(i.delivery_way_id,''), i.id::text) = j.tracking_no
left join public.be_wayplans w
  on coalesce(nullif(w.wayplan_code,''), nullif(w.wayplan_no,''), nullif(w.wayplan_id,'')) = j.wayplan_code
left join public.be_exception_rules r1
  on r1.process_type = 'DELIVERY' and r1.exception_code = i.return_reason_1
left join public.be_exception_rules r2
  on r2.process_type = 'DELIVERY' and r2.exception_code = i.return_reason_2
left join public.be_exception_rules r3
  on r3.process_type = 'DELIVERY' and r3.exception_code = i.return_reason_3;

-- -------------------------------------------------------------------------
-- 5) Exception board views
-- -------------------------------------------------------------------------
drop view if exists public.be_v_exception_board cascade;

create or replace view public.be_v_exception_board as
select
  e.*,
  coalesce(r.exception_name_en, e.exception_name_en) as reason_name_en,
  coalesce(r.exception_name_mm, e.exception_name_mm) as reason_name_mm,
  r.severity,
  r.require_photo,
  r.require_remark,
  coalesce(r.next_action, e.next_action) as rule_next_action,
  r.customer_message_en,
  r.customer_message_mm
from public.be_parcel_exception_events e
left join public.be_exception_rules r
  on r.process_type = e.process_type
 and r.exception_code = e.exception_code;

create or replace view public.be_v_merchant_exception_board as
select *
from public.be_v_exception_board
where
  -- Service role/admin pages can still use be_v_exception_board directly.
  -- Merchant pages should query this view with merchant_code / merchant_email filters.
  true;

drop function if exists public.be_warehouse_dispatch_scan(text, text, text);
drop function if exists public.be_warehouse_inbound_scan(text, text, text);
drop function if exists public.be_warehouse_return_scan(text, text, text, text);
drop function if exists public.be_close_dispatch_day(text, text);
drop function if exists public.be_generate_wayplans_by_fleet(text);
drop function if exists public.be_warehouse_scan_lifecycle_snapshot();
drop function if exists public.be_exception_screen_snapshot(text, text);
drop function if exists public.be_merchant_exception_screen_snapshot(text, text);

-- -------------------------------------------------------------------------
-- 6) Scan RPCs
-- -------------------------------------------------------------------------
create or replace function public.be_warehouse_inbound_scan(
  p_tracking_no text,
  p_actor_email text default null,
  p_warehouse_code text default 'YGN-MAIN'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tracking text := trim(coalesce(p_tracking_no,''));
  v_count integer := 0;
begin
  if v_tracking = '' then raise exception 'tracking_no is required'; end if;

  update public.be_wayplan_items i
  set
    inbound_scan_at = coalesce(i.inbound_scan_at, now()),
    inbound_scan_by = coalesce(p_actor_email, i.inbound_scan_by),
    inbound_scan_code = p_warehouse_code,
    warehouse_status = 'RECEIVED',
    warehouse_scan_status = 'RECEIVED',
    updated_at = now()
  where coalesce(nullif(i.tracking_no,''), nullif(i.delivery_way_id,''), i.id::text) = v_tracking;

  get diagnostics v_count = row_count;

  update public.be_dispatch_job_assignments a
  set inbound_scan_at = coalesce(a.inbound_scan_at, now()), updated_at = now()
  where a.tracking_no = v_tracking;

  update public.be_portal_pickup_request_items p
  set
    inbound_scan_at = coalesce(p.inbound_scan_at, now()),
    warehouse_status = 'RECEIVED',
    warehouse_scan_status = 'RECEIVED',
    updated_at = now()
  where coalesce(nullif(p.tracking_no,''), nullif(p.delivery_way_id,''), p.id::text) = v_tracking
     or p.delivery_way_id = v_tracking;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'reason', 'TRACKING_NOT_FOUND', 'tracking_no', v_tracking);
  end if;

  return jsonb_build_object('ok', true, 'tracking_no', v_tracking, 'warehouse_status', 'RECEIVED');
end;
$$;

create or replace function public.be_warehouse_dispatch_scan(
  p_tracking_no text,
  p_actor_email text default null,
  p_warehouse_code text default 'YGN-MAIN'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tracking text := trim(coalesce(p_tracking_no,''));
  v_wayplan text;
  v_count integer := 0;
begin
  if v_tracking = '' then raise exception 'tracking_no is required'; end if;

  select wayplan_code into v_wayplan
  from public.be_v_enterprise_dispatch_jobs
  where tracking_no = v_tracking
  limit 1;

  update public.be_wayplan_items i
  set
    dispatch_scan_at = coalesce(i.dispatch_scan_at, now()),
    dispatch_scan_by = coalesce(p_actor_email, i.dispatch_scan_by),
    dispatch_scan_code = p_warehouse_code,
    warehouse_scan_status = 'DISPATCH_SCANNED',
    dispatch_status = 'OUT_FOR_DELIVERY',
    delivery_status = 'OUT_FOR_DELIVERY',
    updated_at = now()
  where coalesce(nullif(i.tracking_no,''), nullif(i.delivery_way_id,''), i.id::text) = v_tracking;

  get diagnostics v_count = row_count;

  insert into public.be_dispatch_job_assignments (
    tracking_no, wayplan_code, delivery_status, dispatch_status, published_to_rider,
    dispatch_scan_at, updated_by_email, created_at, updated_at
  )
  values (
    v_tracking, v_wayplan, 'OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY', true,
    now(), p_actor_email, now(), now()
  )
  on conflict (tracking_no) do update set
    delivery_status = 'OUT_FOR_DELIVERY',
    dispatch_status = 'OUT_FOR_DELIVERY',
    published_to_rider = true,
    dispatch_scan_at = coalesce(public.be_dispatch_job_assignments.dispatch_scan_at, excluded.dispatch_scan_at),
    updated_by_email = excluded.updated_by_email,
    updated_at = now();

  update public.be_portal_pickup_request_items p
  set
    dispatch_scan_at = coalesce(p.dispatch_scan_at, now()),
    dispatch_status = 'OUT_FOR_DELIVERY',
    warehouse_scan_status = 'DISPATCH_SCANNED',
    updated_at = now()
  where coalesce(nullif(p.tracking_no,''), nullif(p.delivery_way_id,''), p.id::text) = v_tracking
     or p.delivery_way_id = v_tracking;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'reason', 'TRACKING_NOT_FOUND', 'tracking_no', v_tracking);
  end if;

  return jsonb_build_object('ok', true, 'tracking_no', v_tracking, 'delivery_status', 'OUT_FOR_DELIVERY');
end;
$$;

create or replace function public.be_warehouse_return_scan(
  p_tracking_no text,
  p_reason_code text,
  p_actor_email text default null,
  p_remark text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tracking text := trim(coalesce(p_tracking_no,''));
  v_reason text := upper(trim(coalesce(p_reason_code,'')));
  v_row public.be_v_warehouse_scan_lifecycle%rowtype;
  v_attempt integer;
  v_rule record;
  v_new_status text;
  v_is_rto boolean := false;
begin
  if v_tracking = '' then raise exception 'tracking_no is required'; end if;
  if v_reason = '' then raise exception 'reason_code is required'; end if;

  select * into v_row
  from public.be_v_warehouse_scan_lifecycle
  where tracking_no = v_tracking
  limit 1;

  if v_row.tracking_no is null then
    return jsonb_build_object('ok', false, 'reason', 'TRACKING_NOT_FOUND', 'tracking_no', v_tracking);
  end if;

  select * into v_rule
  from public.be_exception_rules
  where process_type = 'DELIVERY'
    and exception_code = v_reason
  limit 1;

  if v_rule.exception_code is null then
    select * into v_rule
    from public.be_exception_rules
    where process_type = 'WAREHOUSE'
      and exception_code = v_reason
    limit 1;
  end if;

  v_attempt := least(coalesce(v_row.return_attempt_count,0) + 1, 3);
  v_is_rto := v_attempt >= 3;
  v_new_status := case when v_is_rto then 'RTO' else coalesce(v_rule.mapped_status, 'DELIVERY_ATTEMPTED') end;

  update public.be_wayplan_items i
  set
    return_attempt_count = v_attempt,
    return_scan_1_at = case when v_attempt = 1 then now() else i.return_scan_1_at end,
    return_scan_1_by = case when v_attempt = 1 then p_actor_email else i.return_scan_1_by end,
    return_reason_1 = case when v_attempt = 1 then v_reason else i.return_reason_1 end,
    return_scan_2_at = case when v_attempt = 2 then now() else i.return_scan_2_at end,
    return_scan_2_by = case when v_attempt = 2 then p_actor_email else i.return_scan_2_by end,
    return_reason_2 = case when v_attempt = 2 then v_reason else i.return_reason_2 end,
    return_scan_3_at = case when v_attempt = 3 then now() else i.return_scan_3_at end,
    return_scan_3_by = case when v_attempt = 3 then p_actor_email else i.return_scan_3_by end,
    return_reason_3 = case when v_attempt = 3 then v_reason else i.return_reason_3 end,
    rto_at = case when v_is_rto then now() else i.rto_at end,
    rto_reason = case when v_is_rto then v_reason else i.rto_reason end,
    exception_status = v_new_status,
    last_exception_code = v_reason,
    last_exception_reason = coalesce(v_rule.exception_name_en, v_reason),
    next_attempt_priority = not v_is_rto,
    warehouse_scan_status = case when v_is_rto then 'RTO' else 'RETURN_SCANNED' end,
    dispatch_status = case when v_is_rto then 'RTO' else 'RETURNED_FOR_REATTEMPT' end,
    delivery_status = case when v_is_rto then 'RTO' else 'ATTEMPTED_FAILED' end,
    wayplan_status = case when v_is_rto then 'RTO' else 'READY_FOR_WAYPLAN' end,
    failed_attempts = v_attempt,
    failed_reason = coalesce(v_rule.exception_name_en, v_reason),
    updated_at = now()
  where coalesce(nullif(i.tracking_no,''), nullif(i.delivery_way_id,''), i.id::text) = v_tracking;

  insert into public.be_dispatch_job_assignments (
    tracking_no, wayplan_code, delivery_status, dispatch_status, failed_attempts, failed_reason,
    return_attempt_count, rto_at, exception_status, next_attempt_priority, last_exception_code, last_exception_reason,
    updated_by_email, created_at, updated_at
  )
  values (
    v_tracking, v_row.wayplan_code,
    case when v_is_rto then 'RTO' else 'ATTEMPTED_FAILED' end,
    case when v_is_rto then 'RTO' else 'RETURNED_FOR_REATTEMPT' end,
    v_attempt, coalesce(v_rule.exception_name_en, v_reason),
    v_attempt, case when v_is_rto then now() else null end, v_new_status, not v_is_rto, v_reason, coalesce(v_rule.exception_name_en, v_reason),
    p_actor_email, now(), now()
  )
  on conflict (tracking_no) do update set
    delivery_status = excluded.delivery_status,
    dispatch_status = excluded.dispatch_status,
    failed_attempts = excluded.failed_attempts,
    failed_reason = excluded.failed_reason,
    return_attempt_count = excluded.return_attempt_count,
    rto_at = coalesce(excluded.rto_at, public.be_dispatch_job_assignments.rto_at),
    exception_status = excluded.exception_status,
    next_attempt_priority = excluded.next_attempt_priority,
    last_exception_code = excluded.last_exception_code,
    last_exception_reason = excluded.last_exception_reason,
    updated_by_email = excluded.updated_by_email,
    updated_at = now();

  update public.be_portal_pickup_request_items p
  set
    return_attempt_count = v_attempt,
    rto_at = case when v_is_rto then now() else p.rto_at end,
    exception_status = v_new_status,
    next_attempt_priority = not v_is_rto,
    last_exception_code = v_reason,
    last_exception_reason = coalesce(v_rule.exception_name_en, v_reason),
    warehouse_scan_status = case when v_is_rto then 'RTO' else 'RETURN_SCANNED' end,
    delivery_status = case when v_is_rto then 'RTO' else 'ATTEMPTED_FAILED' end,
    wayplan_status = case when v_is_rto then 'RTO' else 'READY_FOR_WAYPLAN' end,
    updated_at = now()
  where coalesce(nullif(p.tracking_no,''), nullif(p.delivery_way_id,''), p.id::text) = v_tracking
     or p.delivery_way_id = v_tracking;

  insert into public.be_parcel_exception_events (
    tracking_no, delivery_way_id, waybill_no, pickup_id, wayplan_code,
    merchant_code, merchant_name, merchant_email, recipient_name, recipient_phone, township,
    process_type, exception_code, exception_name_en, exception_name_mm, mapped_status,
    attempt_no, remarks, reported_by_email, previous_status, new_status, next_action, is_rto
  )
  values (
    v_tracking, v_row.delivery_way_id, v_row.waybill_no, v_row.pickup_id, v_row.wayplan_code,
    v_row.merchant_code, v_row.merchant_name, v_row.merchant_email, v_row.recipient_name, coalesce(v_row.phone_number, v_row.recipient_phone), v_row.delivery_township,
    coalesce(v_rule.process_type, 'DELIVERY'), v_reason, v_rule.exception_name_en, v_rule.exception_name_mm, coalesce(v_rule.mapped_status, v_new_status),
    v_attempt, p_remark, p_actor_email, v_row.delivery_status, v_new_status, v_rule.next_action, v_is_rto
  );

  return jsonb_build_object(
    'ok', true,
    'tracking_no', v_tracking,
    'attempt_no', v_attempt,
    'reason_code', v_reason,
    'new_status', v_new_status,
    'is_rto', v_is_rto,
    'priority_next_wayplan', not v_is_rto
  );
end;
$$;

create or replace function public.be_close_dispatch_day(
  p_wayplan_code text default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update public.be_wayplan_items i
  set
    dropoff_at = coalesce(i.dropoff_at, now()),
    delivery_status = 'DROP_OFF',
    dispatch_status = 'DROP_OFF',
    warehouse_scan_status = 'DROP_OFF',
    updated_at = now()
  where (p_wayplan_code is null or coalesce(nullif(i.wayplan_code,''), nullif(i.wayplan_no,''), nullif(i.wayplan_id,'')) = p_wayplan_code)
    and coalesce(nullif(i.delivery_status,''),'PENDING') = 'OUT_FOR_DELIVERY'
    and coalesce(i.return_attempt_count,0) = 0
    and i.rto_at is null;

  get diagnostics v_count = row_count;

  update public.be_dispatch_job_assignments a
  set
    delivery_status = 'DROP_OFF',
    dispatch_status = 'DROP_OFF',
    updated_by_email = p_actor_email,
    updated_at = now()
  where (p_wayplan_code is null or a.wayplan_code = p_wayplan_code)
    and coalesce(a.delivery_status,'PENDING') = 'OUT_FOR_DELIVERY'
    and coalesce(a.return_attempt_count,0) = 0
    and a.rto_at is null;

  update public.be_portal_pickup_request_items p
  set
    delivery_status = 'DROP_OFF',
    dispatch_status = 'DROP_OFF',
    warehouse_scan_status = 'DROP_OFF',
    updated_at = now()
  where (p_wayplan_code is null or p.wayplan_code = p_wayplan_code)
    and coalesce(p.delivery_status,'PENDING') = 'OUT_FOR_DELIVERY'
    and coalesce(p.return_attempt_count,0) = 0
    and p.rto_at is null;

  return jsonb_build_object('ok', true, 'closed_dropoff_rows', v_count);
end;
$$;

-- 7) Generate wayplan allocation by configured fleet assets/zones
-- -------------------------------------------------------------------------
create or replace function public.be_generate_wayplans_by_fleet(
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  -- Prioritize returned parcels first, then unassigned/ready parcels.
  insert into public.be_dispatch_job_assignments (
    tracking_no, wayplan_code, asset_code, delivery_status, dispatch_status,
    published_to_rider, assigned_by_email, updated_by_email, created_at, updated_at
  )
  select
    j.tracking_no,
    j.wayplan_code,
    coalesce(nullif(j.asset_code,''), public.be_resolve_dispatch_asset(j.delivery_township, 'DELIVERY', coalesce(j.parcel_sequence,1))),
    case
      when coalesce(j.delivery_status,'PENDING') in ('RTO','DELIVERED','DROP_OFF') then j.delivery_status
      else 'PENDING'
    end,
    'READY_FOR_DISPATCH',
    false,
    p_actor_email,
    p_actor_email,
    now(),
    now()
  from public.be_v_enterprise_dispatch_jobs j
  where coalesce(j.delivery_status,'PENDING') not in ('DELIVERED','DROP_OFF','RTO')
  on conflict (tracking_no) do update set
    asset_code = coalesce(nullif(public.be_dispatch_job_assignments.asset_code,''), excluded.asset_code),
    dispatch_status = case
      when public.be_dispatch_job_assignments.dispatch_status in ('OUT_FOR_DELIVERY','DELIVERED','DROP_OFF','RTO') then public.be_dispatch_job_assignments.dispatch_status
      else 'READY_FOR_DISPATCH'
    end,
    delivery_status = case
      when public.be_dispatch_job_assignments.delivery_status in ('DELIVERED','DROP_OFF','RTO') then public.be_dispatch_job_assignments.delivery_status
      else coalesce(nullif(public.be_dispatch_job_assignments.delivery_status,''), excluded.delivery_status)
    end,
    updated_by_email = excluded.updated_by_email,
    updated_at = now();

  get diagnostics v_count = row_count;

  update public.be_wayplan_items i
  set
    vehicle_id = coalesce(
      nullif(i.vehicle_id,''),
      (select a.asset_code from public.be_dispatch_job_assignments a
       where a.tracking_no = coalesce(nullif(i.tracking_no,''), nullif(i.delivery_way_id,''), i.id::text)
       limit 1)
    ),
    vehicle_code = coalesce(
      nullif(i.vehicle_code,''),
      (select a.asset_code from public.be_dispatch_job_assignments a
       where a.tracking_no = coalesce(nullif(i.tracking_no,''), nullif(i.delivery_way_id,''), i.id::text)
       limit 1)
    ),
    dispatch_status = case when coalesce(nullif(i.dispatch_status,''),'') in ('OUT_FOR_DELIVERY','DELIVERED','DROP_OFF','RTO') then i.dispatch_status else 'READY_FOR_DISPATCH' end,
    wayplan_status = case when coalesce(i.next_attempt_priority,false) then 'READY_FOR_WAYPLAN' else coalesce(nullif(i.wayplan_status,''),'ASSIGNED') end,
    updated_at = now()
  where coalesce(nullif(i.wayplan_code,''), nullif(i.wayplan_no,''), nullif(i.wayplan_id,'')) is not null;

  return jsonb_build_object('ok', true, 'generated_assignments', v_count);
end;
$$;

-- -------------------------------------------------------------------------
-- 8) Snapshots for pages
-- -------------------------------------------------------------------------
create or replace function public.be_warehouse_scan_lifecycle_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_reasons jsonb;
  v_stats jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.next_attempt_priority desc, x.return_attempt_count desc, x.parcel_sequence, x.tracking_no), '[]'::jsonb)
  into v_rows
  from public.be_v_warehouse_scan_lifecycle x;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.process_type, r.exception_name_en), '[]'::jsonb)
  into v_reasons
  from public.be_exception_rules r
  where r.active and r.process_type in ('DELIVERY','WAREHOUSE');

  select jsonb_build_object(
    'rows', (select count(*) from public.be_v_warehouse_scan_lifecycle),
    'received', (select count(*) from public.be_v_warehouse_scan_lifecycle where warehouse_scan_status in ('RECEIVED','DISPATCH_SCANNED','DROP_OFF')),
    'dispatch_scanned', (select count(*) from public.be_v_warehouse_scan_lifecycle where dispatch_scan_at is not null),
    'returns', (select count(*) from public.be_v_warehouse_scan_lifecycle where return_attempt_count > 0),
    'rto', (select count(*) from public.be_v_warehouse_scan_lifecycle where rto_at is not null or delivery_status = 'RTO'),
    'priority', (select count(*) from public.be_v_warehouse_scan_lifecycle where next_attempt_priority)
  ) into v_stats;

  return jsonb_build_object('ok', true, 'stats', v_stats, 'rows', v_rows, 'reasons', v_reasons);
end;
$$;

create or replace function public.be_exception_screen_snapshot(
  p_actor_email text default null,
  p_merchant_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_events jsonb;
  v_stats jsonb;
  v_is_merchant boolean := false;
begin
  v_is_merchant := coalesce(p_actor_email,'') ilike '%merchant%';

  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb)
  into v_events
  from public.be_v_exception_board e
  where e.resolved_at is null
    and (
      not v_is_merchant
      or (p_merchant_code is not null and e.merchant_code = p_merchant_code)
      or (p_actor_email is not null and e.merchant_email = p_actor_email)
    );

  select jsonb_build_object(
    'open', jsonb_array_length(coalesce(v_events,'[]'::jsonb)),
    'rto', (select count(*) from public.be_v_exception_board e where e.resolved_at is null and e.is_rto),
    'priority', (select count(*) from public.be_v_warehouse_scan_lifecycle where next_attempt_priority)
  ) into v_stats;

  return jsonb_build_object('ok', true, 'stats', v_stats, 'events', v_events);
end;
$$;

grant execute on function public.be_warehouse_inbound_scan(text,text,text) to authenticated;
grant execute on function public.be_warehouse_dispatch_scan(text,text,text) to authenticated;
grant execute on function public.be_warehouse_return_scan(text,text,text,text) to authenticated;
grant execute on function public.be_close_dispatch_day(text,text) to authenticated;
grant execute on function public.be_generate_wayplans_by_fleet(text) to authenticated;
grant execute on function public.be_warehouse_scan_lifecycle_snapshot() to authenticated;
grant execute on function public.be_exception_screen_snapshot(text,text) to authenticated;

create or replace function public.be_merchant_exception_screen_snapshot(
  p_merchant_code text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_events jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb)
  into v_events
  from public.be_v_exception_board e
  where e.resolved_at is null
    and (
      e.merchant_code = p_merchant_code
      or (p_actor_email is not null and e.merchant_email = p_actor_email)
    );

  return jsonb_build_object(
    'ok', true,
    'stats', jsonb_build_object('open', jsonb_array_length(v_events)),
    'events', v_events
  );
end;
$$;

grant execute on function public.be_merchant_exception_screen_snapshot(text,text) to authenticated;

commit;
notify pgrst, 'reload schema';

-- Optional explicit alias for UI naming. It calls be_close_dispatch_day().
create or replace function public.be_warehouse_end_day_dropoff(
  p_wayplan_code text default null,
  p_actor_email text default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.be_close_dispatch_day(p_wayplan_code, p_actor_email);
$$;

grant execute on function public.be_warehouse_end_day_dropoff(text,text) to authenticated;
notify pgrst, 'reload schema';
