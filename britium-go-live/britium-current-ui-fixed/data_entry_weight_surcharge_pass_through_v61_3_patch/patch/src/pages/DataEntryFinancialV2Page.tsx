import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Download,
  FileCheck2,
  FileSpreadsheet,
  Image as ImageIcon,
  Languages,
  Loader2,
  MapPin,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  financialV2Calculate,
  financialV2CreateWaybill,
  financialV2Save,
  financialV2Schema,
  financialV2Snapshot,
  type FinancialV2Envelope,
  type FinancialV2Field,
  type FinancialV2SchemaData,
} from '@/lib/dataEntryFinancialV2Api';
import {
  TOWNSHIP_DIRECTORY_BUILD,
  findTownshipTariff,
  searchTownshipTariffs,
  townshipDisplayName,
  type TownshipTariffRecord,
  type UiLanguage,
} from '@/data/townshipTariffDirectory';

export const DATA_ENTRY_FINANCIAL_V2_BUILD = 'PORTAL_DATA_ENTRY_FINANCIAL_V2_WEIGHT_SURCHARGE_PASS_THROUGH_V61_3_2026_08_02';

const CLIENT_WRITES_ENABLED = String(import.meta.env.VITE_FINANCIAL_V2_WRITES_ENABLED || 'false').toLowerCase() === 'true';
const PICKUP_RPC = 'be_data_entry_pickup_list_web_v16';
const SECTION_ORDER = [
  'Parcel Identity',
  'Recipient & Address',
  'Collection Instructions',
  'Weight & Tariff',
  'Merchant Settlement',
  'Validation',
  'Photo Evidence',
  'Audit Information',
];
const AMOUNT_TYPES = [
  'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
  'TOTAL_AMOUNT_INCLUDING_DELIVERY',
  'DELIVERY_CHARGE_ONLY',
  'EXACT_COLLECTION_AMOUNT',
  'OPAQUE_COD_COLLECTION',
  'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT',
];
const STATUS_OPTIONS = ['registered', 'ready_for_waybill', 'needs_fix'];
const NUMERIC_TYPES = new Set(['bigint', 'integer', 'numeric', 'decimal', 'number']);
const TEXTAREA_FIELDS = new Set(['delivery_address', 'remarks', 'validation_message']);
const INPUT_CLASS = 'mt-1 w-full rounded-lg border border-[#1a3a5c] bg-[#061524] px-3 py-2 text-[12px] text-[#eef8ff] outline-none focus:border-[#f6b84b] disabled:cursor-not-allowed disabled:text-[#7898af]';
const SERVER_CLASS = 'mt-1 min-h-[38px] w-full rounded-lg border border-[#1a3a5c] bg-[#0b2236] px-3 py-2 text-[12px] text-[#8fd3ff]';

const GUIDED_EDITABLE_FIELDS = new Set([
  'merchant_stated_total_amount',
  'additional_customer_charge',
  'merchant_payable_charges',
  'other_merchant_credits',
]);

const AUTO_RECALCULATE_FIELDS = new Set([
  'township',
  'item_price',
  'delivery_charges',
  'weight_kg',
  'amount_entry_type',
  'merchant_stated_total_amount',
  'additional_customer_charge',
  'cbm_surcharge',
  'other_surcharge',
  'merchant_payable_charges',
  'other_merchant_credits',
]);

const BACKEND_GUIDED_FIELD_KEYS: Record<string, string[]> = {
  merchant_stated_total_amount: ['suggested_merchant_stated_total_amount', 'merchant_stated_total_amount'],
  additional_customer_charge: ['suggested_additional_customer_charge', 'additional_customer_charge'],
  merchant_payable_charges: ['suggested_merchant_payable_charges', 'merchant_payable_charges'],
  other_merchant_credits: ['suggested_other_merchant_credits', 'other_merchant_credits'],
};

const CALCULATED_OUTPUT_FIELDS = new Set([
  'cod_amount',
  'tariff_zone',
  'tariff_zone_code',
  'base_tariff',
  'included_kg',
  'extra_per_kg',
  'commitment_min_ways',
  'commitment_refund_per_way',
  'chargeable_weight_kg',
  'extra_kg',
  'weight_surcharge',
  'gross_system_delivery_charge',
  'commitment_refund',
  'net_system_delivery_charge',
  'effective_declared_delivery_charge',
  'delivery_difference',
  'settlement_direction',
  'merchant_settlement_adjustment',
  'merchant_final_settlement_amount',
  'validation_status',
  'validation_message',
  'calculation_version',
  'calculated_at',
]);

const UI = {
  en: {
    loading: 'Loading backend Financial V2 contract…',
    production: 'Production Financial V2',
    pageTitle: 'Backend-Authoritative Data Entry',
    pageSubtitle: 'The backend schema controls fields, editability, calculations, validation and canonical identifiers. Township suggestions use the approved reference file for display, while the backend remains the final tariff authority.',
    downloadTemplate: 'Download 50-field template',
    validateWorkbook: 'Validate workbook',
    schema: 'Schema',
    unavailable: 'Unavailable',
    fieldContract: 'Field Contract',
    fields: 'fields',
    environment: 'Environment',
    mutationGate: 'Mutation Gate',
    writeGateEnabled: 'Client write gate enabled',
    shadowDryRun: 'Shadow / dry-run only',
    pickupRegistration: 'Pickup Registration',
    backendRows: 'Backend Financial Rows',
    canonicalPickup: 'Canonical pickup',
    selectPickup: 'Select a production pickup',
    merchantPending: 'Merchant pending',
    expectedParcels: 'Expected Parcels',
    riderStatus: 'Rider Status',
    pickupStatus: 'Pickup Status',
    historicalExtras: 'Historical Extras',
    calculateAll: 'Calculate all',
    saveAll: 'Save all',
    validateAllSaves: 'Validate all saves',
    createWaybill: 'Create waybill',
    checkWaybill: 'Check waybill readiness',
    refreshEvidence: 'Refresh evidence',
    selectPickupEmpty: 'Select a pickup with an authoritative parcel count.',
    searchPlaceholder: 'Search Way ID, merchant, recipient or phone',
    refresh: 'Refresh',
    noRows: 'No Financial V2 rows returned.',
    parcel: 'Parcel',
    wayAssigned: 'Way ID assigned by backend',
    pickup: 'Pickup',
    sequence: 'Sequence',
    calculate: 'Calculate',
    save: 'Save',
    validateSave: 'Validate save',
    noProof: 'No Rider proof path was returned by the read-only evidence view.',
    proofReviewed: 'Photo evidence reviewed',
    photoUnavailable: 'Image unavailable; acknowledge recorded proof reference for review',
    proofRequirement: 'One acknowledgement is required before save validation. The backend still decides whether proof is sufficient for waybill readiness.',
    calculationCompleted: 'Calculation completed',
    calculationFailed: 'Calculation failed',
    backendResponse: 'Backend response received.',
    saved: 'Saved.',
    dryRunPassed: 'Save dry-run passed.',
    saveValidationFailed: 'Save validation failed.',
    mode: 'Mode',
    persisted: 'Persisted',
    selectAmountType: 'Select amount-entry type',
    systemSuggestedEditable: 'System suggestion — editable',
    guidedAmountHelp: 'Selecting an amount-entry type applies safe editable suggestions and immediately requests backend calculation.',
    additionalChargeRule: 'Additional customer charge is separate from delivery difference. It defaults to 0 and must be entered only when explicitly approved.',
    backendChargeCreditRule: 'Merchant charges and credits use backend-returned approved suggestions when available; otherwise they default to 0 and remain editable.',
    positiveDeliveryDifferenceRule: 'A positive delivery difference is the merchant delivery margin after Britium’s net entitlement. It is credited automatically and must not be entered again as another customer charge or merchant credit.',
    negativeDeliveryDifferenceRule: 'A negative delivery difference is recovered from the merchant through the backend settlement adjustment. It must never be added to the receiver collection.',
    merchantDeliveryCredit: 'Merchant credit from delivery difference',
    merchantDeliveryDebit: 'Merchant debit from delivery difference',
    merchantFinalSettlementLabel: 'Backend final merchant settlement',
    merchantCreditPending: 'Awaiting backend settlement calculation',
    receiverCollection: 'Receiver collection',
    merchantDeclaredSubtotal: 'Merchant-stated subtotal',
    customerSystemSurcharges: 'Customer-payable system surcharges',
    britiumEntitlement: 'Britium delivery entitlement',
    merchantReceivable: 'Merchant settlement',
    collectionFormula: 'Receiver collection = item price + merchant-declared delivery + customer-payable weight/CBM/other delivery surcharges + approved additional customer charge.',
    settlementFormula: 'Merchant settlement = item price + (customer delivery component - Britium net delivery entitlement) + other merchant credits - merchant-payable charges.',
    weightPassThroughRule: 'Customer-paid weight/CBM/other delivery surcharges are retained by Britium and must not be deducted from the merchant a second time.',
    pendingBusinessConfirmation: 'PENDING_BUSINESS_CONFIRMATION',
    townshipSearch: 'Type or select a township in English or Myanmar',
    noTownshipMatches: 'No matching township found.',
    tariffReference: 'Township tariff reference',
    sourceFee: 'Attached-data fee',
    provider: 'Service / provider',
    backendTariff: 'Backend base tariff',
    sourceFeeMissing: 'Not stated in the attached data',
    zeroNotFree: '0 in source means partner/outsource route; it is not a free-delivery decision',
    backendAuthority: 'Reference data appears immediately after township selection. The final tariff and settlement values are always returned by the backend calculation RPC.',
    cityRegion: 'City / Region',
    selectedTownship: 'Selected township',
    english: 'English',
    myanmar: 'မြန်မာ',
    referenceOnly: 'Reference only',
    sourceCode: 'Township code',
    serviceStatus: 'Service status',
    activeService: 'Active / selectable',
    inactiveService: 'Inactive / unavailable',
    selectTownshipFromList: 'Select a township from the suggestion list before calculation or save.',
    zeroReferenceWarning: '0 is a source reference value. Check the service/provider status; it never authorizes free delivery.',
    tariffPending: 'Awaiting backend calculation',
    rows: 'Rows',
    headers: 'Headers',
    missing: 'Missing',
    unexpected: 'Unexpected',
    yes: 'Yes',
    no: 'No',
    wayId: 'Way ID',
    merchant: 'Merchant',
    recipient: 'Recipient',
    township: 'Township',
    amountType: 'Amount Type',
    cod: 'COD',
    netSystemCharge: 'Net System Charge',
    merchantSettlement: 'Merchant Settlement',
    validation: 'Validation',
    version: 'Version',
    updated: 'Updated',
  },
  my: {
    loading: 'ဗဟိုထိန်းချုပ်မှုစနစ်၏ ဘဏ္ဍာရေးစာချုပ်အား တင်ဆက်နေပါသည်...',
    production: 'လုပ်ငန်းလည်ပတ်မှုအဆင့် ဘဏ္ဍာရေးစနစ် (Production Financial V2)',
    pageTitle: 'ဗဟိုထိန်းချုပ်မှုစနစ်မှ အတည်ပြုသော အချက်အလက်စာရင်းသွင်းခြင်း',
    pageSubtitle: 'အချက်အလက်ကွက်လပ်များ၊ ပြင်ဆင်ခွင့်၊ တွက်ချက်မှု၊ မှန်ကန်မှုစစ်ဆေးခြင်းနှင့် စနစ်အမှတ်အသားများကို ဗဟိုထိန်းချုပ်မှုစနစ်က ကြီးကြပ်ပါသည်။ မြို့နယ်ရွေးချယ်မှုအတွက် တရားဝင်အတည်ပြုထားသော အညွှန်းဖိုင်ကိုသာ အသုံးပြုပြီး၊ နောက်ဆုံးပို့ဆောင်ခနှုန်းထားကို ဗဟိုစနစ်မှသာ အတည်ပြုသတ်မှတ်ပါသည်။',
    downloadTemplate: 'အချက်အလက် (၅၀) ခုပါဝင်သော ပုံစံအား ရယူရန်',
    validateWorkbook: 'အချက်အလက်စာရင်း မှန်ကန်မှုစစ်ဆေးရန်',
    schema: 'အချက်အလက်ပုံစံ (Schema)',
    unavailable: 'မရရှိနိုင်ပါ',
    fieldContract: 'အချက်အလက် သတ်မှတ်ချက်',
    fields: 'ခု',
    environment: 'လုပ်ငန်းလည်ပတ်မှုပတ်ဝန်းကျင်',
    mutationGate: 'အချက်အလက်ပြင်ဆင်ခွင့် အခြေအနေ',
    writeGateEnabled: 'ပြင်ဆင်ခွင့်ပြုထားပါသည်',
    shadowDryRun: 'ကနဦးစမ်းသပ်လည်ပတ်မှုသာ (Shadow/Dry-run)',
    pickupRegistration: 'ကုန်ပစ္စည်းလက်ခံယူမှု မှတ်ပုံတင်ခြင်း',
    backendRows: 'ဗဟိုစနစ်ရှိ ဘဏ္ဍာရေးမှတ်တမ်းများ',
    canonicalPickup: 'အတည်ပြုပြီးသော ကုန်ပစ္စည်းလက်ခံယူမှု',
    selectPickup: 'လုပ်ငန်းလည်ပတ်မှုအဆင့် ကုန်ပစ္စည်းလက်ခံယူမှုကို ရွေးချယ်ပါ',
    merchantPending: 'လုပ်ငန်းရှင်အချက်အလက် စောင့်ဆိုင်းနေဆဲဖြစ်ပါသည်',
    expectedParcels: 'မျှော်မှန်းကုန်စည်အရေအတွက်',
    riderStatus: 'ပို့ဆောင်ရေးကိုယ်စားလှယ် အခြေအနေ',
    pickupStatus: 'ကုန်ပစ္စည်းလက်ခံယူမှု အခြေအနေ',
    historicalExtras: 'ယခင်ပိုလျှံနေသော မှတ်တမ်းများ',
    calculateAll: 'အားလုံးကို တွက်ချက်ရန်',
    saveAll: 'အားလုံးကို မှတ်တမ်းတင်သိမ်းဆည်းရန်',
    validateAllSaves: 'မှတ်တမ်းများအားလုံးကို မသိမ်းဆည်းမီ စစ်ဆေးရန်',
    createWaybill: 'ကုန်တင်လွှာ (Waybill) ဖန်တီးရန်',
    checkWaybill: 'ကုန်တင်လွှာ အဆင်သင့်ဖြစ်မှု အခြေအနေကို စစ်ဆေးရန်',
    refreshEvidence: 'အထောက်အထားများ ပြန်လည်မွမ်းမံရန်',
    selectPickupEmpty: 'အတည်ပြုထားသော ကုန်စည်အရေအတွက်ပါရှိသည့် ကုန်ပစ္စည်းလက်ခံယူမှု (Pickup) ကို ရွေးချယ်ပါ။',
    searchPlaceholder: 'Way ID၊ လုပ်ငန်းရှင်၊ လက်ခံမည့်သူ သို့မဟုတ် ဖုန်းနံပါတ်ဖြင့် ရှာဖွေပါ',
    refresh: 'ပြန်လည်မွမ်းမံရန်',
    noRows: 'ဘဏ္ဍာရေးမှတ်တမ်းများ မတွေ့ရှိပါ။',
    parcel: 'ကုန်စည်',
    wayAssigned: 'Way ID ကို ဗဟိုစနစ်မှ သတ်မှတ်ပေးမည်ဖြစ်ပါသည်',
    pickup: 'ကုန်ပစ္စည်းလက်ခံယူမှု',
    sequence: 'အစဉ်',
    calculate: 'တွက်ချက်ရန်',
    save: 'မှတ်တမ်းတင်သိမ်းဆည်းရန်',
    validateSave: 'မသိမ်းဆည်းမီ မှန်ကန်မှုစစ်ဆေးရန်',
    noProof: 'ဓာတ်ပုံအထောက်အထား လမ်းကြောင်း မရရှိပါ။',
    proofReviewed: 'ဓာတ်ပုံအထောက်အထားအား စစ်ဆေးပြီးဖြစ်ပါသည်',
    photoUnavailable: 'ဓာတ်ပုံမရရှိနိုင်ပါ။ မှတ်တမ်းတင်ထားသော အထောက်အထားအား ပြန်လည်စစ်ဆေးရန် လက်ခံသဘောတူပါသည်။',
    proofRequirement: 'မှတ်တမ်းမသိမ်းဆည်းမီ အနည်းဆုံး အတည်ပြုချက်တစ်ခု လိုအပ်ပါသည်။ ကုန်တင်လွှာအတွက် အထောက်အထား ခိုင်လုံမှုကို ဗဟိုစနစ်မှသာ ဆုံးဖြတ်မည်ဖြစ်ပါသည်။',
    calculationCompleted: 'တွက်ချက်မှု အောင်မြင်စွာ ပြီးစီးပါသည်',
    calculationFailed: 'တွက်ချက်မှု မအောင်မြင်ပါ',
    backendResponse: 'ဗဟိုစနစ်မှ အကြောင်းပြန်ချက် ရရှိပါသည်။',
    saved: 'မှတ်တမ်းတင်သိမ်းဆည်းပြီးဖြစ်ပါသည်။',
    dryRunPassed: 'စမ်းသပ်မှတ်တမ်းတင်မှု (Dry-run) အောင်မြင်ပါသည်။',
    saveValidationFailed: 'မှတ်တမ်းတင်ရန် စစ်ဆေးမှု မအောင်မြင်ပါ။',
    mode: 'စနစ်အခြေအနေ',
    persisted: 'အမှန်တကယ်သိမ်းဆည်းမှု',
    selectAmountType: 'ငွေပမာဏထည့်သွင်းမှု အမျိုးအစားကို ရွေးချယ်ပါ',
    systemSuggestedEditable: 'စနစ်အကြံပြုတန်ဖိုး — ပြင်ဆင်နိုင်ပါသည်',
    guidedAmountHelp: 'ငွေထည့်သွင်းမှုအမျိုးအစားကို ရွေးချယ်သည်နှင့် လုံခြုံသော အကြံပြုတန်ဖိုးများကို ပြင်ဆင်နိုင်သည့်အကွက်များတွင် ဖြည့်ပေးပြီး ဗဟိုစနစ်တွက်ချက်မှုကို ချက်ချင်းတောင်းဆိုမည်ဖြစ်ပါသည်။',
    additionalChargeRule: 'ဖောက်သည်ထံမှ ထပ်ဆောင်းကောက်ခံငွေသည် ပို့ဆောင်ခကွာဟချက်နှင့် သီးခြားဖြစ်ပါသည်။ မူလတန်ဖိုးကို ၀ သတ်မှတ်ထားပြီး တရားဝင်အတည်ပြုထားသော ထပ်ဆောင်းငွေရှိမှသာ ပြင်ဆင်ထည့်သွင်းရမည်ဖြစ်ပါသည်။',
    backendChargeCreditRule: 'လုပ်ငန်းရှင်ပေးချေရမည့် အခကြေးငွေနှင့် အခြားရရန်ငွေများကို ဗဟိုစနစ်မှ အတည်ပြုအကြံပြုတန်ဖိုး ပြန်ပေးပါက အလိုအလျောက်ဖြည့်မည်ဖြစ်ပြီး မရှိပါက ၀ သတ်မှတ်ထားကာ ပြင်ဆင်နိုင်ပါသည်။',
    positiveDeliveryDifferenceRule: 'အပေါင်းတန်ဖိုးဖြစ်သော ပို့ဆောင်ခကွာဟချက်သည် Britium အသားတင်ပို့ဆောင်ခရရန်ငွေ နုတ်ပြီးနောက် လုပ်ငန်းရှင်ရရှိမည့် ပို့ဆောင်ခအမြတ်ဖြစ်ပါသည်။ စနစ်က အလိုအလျောက်ထည့်သွင်းမည်ဖြစ်ပြီး ထပ်ဆောင်းကောက်ခံငွေ သို့မဟုတ် အခြားရရန်ငွေအဖြစ် ထပ်မထည့်ရပါ။',
    negativeDeliveryDifferenceRule: 'အနုတ်တန်ဖိုးဖြစ်သော ပို့ဆောင်ခကွာဟချက်ကို ဗဟိုစနစ်က လုပ်ငန်းရှင်ရှင်းတမ်းမှ နုတ်ယူမည်ဖြစ်ပြီး လက်ခံသူထံ ကောက်ခံငွေထဲ ထပ်မပေါင်းရပါ။',
    merchantDeliveryCredit: 'ပို့ဆောင်ခကွာဟချက်အရ လုပ်ငန်းရှင်ရရန်ငွေ',
    merchantDeliveryDebit: 'ပို့ဆောင်ခကွာဟချက်အရ လုပ်ငန်းရှင်မှပေးရန်ငွေ',
    merchantFinalSettlementLabel: 'ဗဟိုစနစ်တွက် လုပ်ငန်းရှင်နောက်ဆုံးရှင်းလင်းငွေ',
    merchantCreditPending: 'ဗဟိုစနစ် ရှင်းတမ်းတွက်ချက်မှုကို စောင့်ဆိုင်းနေပါသည်',
    receiverCollection: 'လက်ခံသူထံမှ ကောက်ခံရမည့် စုစုပေါင်းငွေ',
    merchantDeclaredSubtotal: 'လုပ်ငန်းရှင်သတ်မှတ် မူလစုစုပေါင်း',
    customerSystemSurcharges: 'ဖောက်သည်ပေးချေရမည့် စနစ်တွက် ထပ်ဆောင်းပို့ဆောင်ခများ',
    britiumEntitlement: 'Britium Express ရရန် စုစုပေါင်းပို့ဆောင်ခ',
    merchantReceivable: 'လုပ်ငန်းရှင်သို့ နောက်ဆုံးရှင်းလင်းငွေ',
    collectionFormula: 'လက်ခံသူထံမှ ကောက်ခံငွေ = ကုန်ပစ္စည်းတန်ဖိုး + လုပ်ငန်းရှင်ဖော်ပြပို့ဆောင်ခ + ဖောက်သည်ပေးရန် အပိုအလေးချိန်/CBM/အခြားပို့ဆောင်ခ + အတည်ပြုထားသော ထပ်ဆောင်းကောက်ခံငွေ ဖြစ်ပါသည်။',
    settlementFormula: 'လုပ်ငန်းရှင်ရှင်းတမ်း = ကုန်ပစ္စည်းတန်ဖိုး + (ဖောက်သည်ထံမှ ကောက်ခံသော ပို့ဆောင်ခစုစုပေါင်း - Britium အသားတင်ပို့ဆောင်ခရရန်ငွေ) + အခြားရရန်ငွေ - လုပ်ငန်းရှင်ပေးရန်အခကြေးငွေ ဖြစ်ပါသည်။',
    weightPassThroughRule: 'ဖောက်သည်ထံမှ ကောက်ခံထားသော အပိုအလေးချိန်/CBM/အခြားပို့ဆောင်ခများကို Britium က ရယူမည်ဖြစ်ပြီး လုပ်ငန်းရှင်ရှင်းတမ်းမှ ထပ်မံနုတ်ယူခြင်း မပြုရပါ။',
    pendingBusinessConfirmation: 'လုပ်ငန်းစည်းမျဉ်း အတည်ပြုချက် စောင့်ဆိုင်းနေသည်',
    townshipSearch: 'မြို့နယ်ကို အင်္ဂလိပ် သို့မဟုတ် မြန်မာဘာသာဖြင့် ရိုက်နှိပ်ရှာဖွေပါ',
    noTownshipMatches: 'ကိုက်ညီသော မြို့နယ် မတွေ့ရှိပါ။',
    tariffReference: 'မြို့နယ်အလိုက် ပို့ဆောင်ခနှုန်းထား အညွှန်း',
    sourceFee: 'မူလပါရှိသော ပို့ဆောင်ခ',
    provider: 'ဝန်ဆောင်မှုပေးသူ',
    backendTariff: 'ဗဟိုစနစ်၏ အခြေခံပို့ဆောင်ခ',
    sourceFeeMissing: 'မူလအချက်အလက်များတွင် နှုန်းထားဖော်ပြထားခြင်း မရှိပါ',
    zeroNotFree: 'သုည (0) ဟုပြသခြင်းသည် မိတ်ဖက်လုပ်ငန်း/ပြင်ပချိတ်ဆက်မှုဖြစ်ပြီး၊ အခမဲ့ပို့ဆောင်ခြင်းဟု မဆိုလိုပါ',
    backendAuthority: 'မြို့နယ်ရွေးချယ်ပြီးသည်နှင့် အညွှန်းကို ချက်ချင်းပြသမည်ဖြစ်ပါသည်။ အပြီးသတ်ပို့ဆောင်ခနှင့် ရှင်းတမ်းတန်ဖိုးများကို ဗဟိုစနစ်မှသာ အတည်ပြုထုတ်ပေးမည်ဖြစ်ပါသည်။',
    cityRegion: 'မြို့ / တိုင်းဒေသကြီး (သို့) ပြည်နယ်',
    selectedTownship: 'ရွေးချယ်ထားသော မြို့နယ်',
    english: 'English',
    myanmar: 'မြန်မာ',
    referenceOnly: 'အညွှန်းအဖြစ်သာ',
    sourceCode: 'မြို့နယ် သင်္ကေတ',
    serviceStatus: 'ဝန်ဆောင်မှု အခြေအနေ',
    activeService: 'အသုံးပြုနိုင်ပါသည်',
    inactiveService: 'အသုံးပြု၍မရပါ',
    selectTownshipFromList: 'တွက်ချက်ခြင်း သို့မဟုတ် မှတ်တမ်းစစ်ဆေးခြင်းမပြုမီ အကြံပြုစာရင်းမှ မြို့နယ်တစ်ခုကို ရွေးချယ်ပါ။',
    zeroReferenceWarning: 'သုည (0) သည် မူလအညွှန်းတန်ဖိုးသာဖြစ်ပါသည်။ ဝန်ဆောင်မှု/ပို့ဆောင်သူ အခြေအနေကို စစ်ဆေးရမည်ဖြစ်ပြီး အခမဲ့ပို့ဆောင်ခွင့် မဟုတ်ပါ။',
    tariffPending: 'ဗဟိုစနစ် တွက်ချက်မှုကို စောင့်ဆိုင်းနေပါသည်',
    rows: 'အတန်းများ',
    headers: 'ခေါင်းစဉ်များ',
    missing: 'လိုအပ်နေသည်',
    unexpected: 'ပိုမိုနေသော အချက်အလက်',
    yes: 'ဟုတ်ကဲ့',
    no: 'မဟုတ်ပါ',
    wayId: 'Way ID',
    merchant: 'လုပ်ငန်းရှင်',
    recipient: 'လက်ခံမည့်သူ',
    township: 'မြို့နယ်',
    amountType: 'ငွေပမာဏ အမျိုးအစား',
    cod: 'ပစ္စည်းရောက်ငွေချေ (COD)',
    netSystemCharge: 'စနစ်တွက် အသားတင်ပို့ဆောင်ခ',
    merchantSettlement: 'လုပ်ငန်းရှင်သို့ ရှင်းတမ်း',
    validation: 'မှန်ကန်မှုစစ်ဆေးခြင်း',
    version: 'ဗားရှင်း',
    updated: 'နောက်ဆုံးပြင်ဆင်ချိန်',
  },
} as const;

type UiKey = keyof typeof UI.en;

const SECTION_MY: Record<string, string> = {
  'Parcel Identity': 'ကုန်စည် အမှတ်အသား',
  'Recipient & Address': 'လက်ခံမည့်သူနှင့် လိပ်စာ',
  'Collection Instructions': 'ငွေကောက်ခံရန် ညွှန်ကြားချက်များ',
  'Weight & Tariff': 'အလေးချိန်နှင့် ပို့ဆောင်ခနှုန်းထား',
  'Merchant Settlement': 'လုပ်ငန်းရှင်သို့ ငွေစာရင်းရှင်းလင်းခြင်း',
  Validation: 'မှန်ကန်မှုစစ်ဆေးအတည်ပြုခြင်း',
  'Photo Evidence': 'ဓာတ်ပုံ အထောက်အထား',
  'Audit Information': 'စာရင်းစစ်ဆေးမှုဆိုင်ရာ အချက်အလက်များ',
};

const FIELD_MY: Record<string, string> = {
  id: 'စနစ်အမှတ်အသား', way_id: 'ကုန်တင်လွှာ Way ID', customer_id: 'ဖောက်သည် မှတ်ပုံတင်အမှတ်', merchant_id: 'လုပ်ငန်းရှင် မှတ်ပုံတင်အမှတ်', status: 'လုပ်ငန်းစဉ်အခြေအနေ',
  recipient_name: 'လက်ခံမည့်သူ အမည်', recipient_phone: 'လက်ခံမည့်သူ ဖုန်းနံပါတ်', township: 'မြို့နယ်', delivery_address: 'ပို့ဆောင်ရမည့် လိပ်စာ',
  item_price: 'ကုန်ပစ္စည်းတန်ဖိုး', delivery_charges: 'ကုန်သည်မှဖော်ပြသော ပို့ဆောင်ခ', cod_amount: 'ပစ္စည်းရောက်ငွေချေ (COD) ပမာဏ', weight_kg: 'အလေးချိန် (ကီလိုဂရမ်)',
  created_at: 'စတင်မှတ်တမ်းတင်သည့်အချိန်', updated_at: 'နောက်ဆုံးမွမ်းမံသည့်အချိန်', environment: 'လုပ်ငန်းလည်ပတ်မှုပတ်ဝန်းကျင်', customer_tier: 'ဖောက်သည် အဆင့်အတန်း',
  monthly_ways: 'လစဉ် ကုန်တင်လွှာအရေအတွက်', amount_entry_type: 'ငွေပမာဏ ထည့်သွင်းမှုအမျိုးအစား', merchant_stated_total_amount: 'လုပ်ငန်းရှင်မှသတ်မှတ်သော စုစုပေါင်းတန်ဖိုး',
  additional_customer_charge: 'ဖောက်သည်ထံမှ ထပ်ဆောင်းကောက်ခံငွေ', cbm_surcharge: 'ထုထည် (CBM) ထပ်ဆောင်းခ', other_surcharge: 'အခြား ထပ်ဆောင်းခများ',
  merchant_payable_charges: 'လုပ်ငန်းရှင်မှပေးချေရမည့် အခကြေးငွေများ', other_merchant_credits: 'လုပ်ငန်းရှင်ရရန်ရှိ အခြားငွေများ', remarks: 'မှတ်ချက်များ',
  entered_by: 'စာရင်းသွင်းသူ', authorized_by: 'အတည်ပြုသူ', tariff_zone: 'ပို့ဆောင်ခနှုန်းထား သတ်မှတ်ဇုန်', tariff_zone_code: 'ပို့ဆောင်ခနှုန်းထား ဇုန်သင်္ကေတ',
  base_tariff: 'အခြေခံပို့ဆောင်ခ', included_kg: 'ကနဦးပါဝင်ခွင့်ပြု အလေးချိန်', extra_per_kg: 'အပိုအလေးချိန် တစ်ကီလိုနှုန်းထား',
  commitment_min_ways: 'သဘောတူညီထားသော အနည်းဆုံးကုန်တင်လွှာ', commitment_refund_per_way: 'ကုန်တင်လွှာတစ်ခုချင်းစီအတွက် ပြန်အမ်းငွေ', chargeable_weight_kg: 'အခကြေးငွေ တွက်ချက်မည့် အလေးချိန်',
  extra_kg: 'အပိုအလေးချိန်', weight_surcharge: 'ဖောက်သည်ပေးရန် အပိုအလေးချိန်ခ', gross_system_delivery_charge: 'Britium စုစုပေါင်းပို့ဆောင်ခရရန်ငွေ',
  commitment_refund: 'သဘောတူညီချက်အရ ပြန်အမ်းငွေ', net_system_delivery_charge: 'Britium အသားတင်ပို့ဆောင်ခရရန်ငွေ',
  effective_declared_delivery_charge: 'ဖောက်သည်ထံမှ ကောက်ခံမည့် စုစုပေါင်းပို့ဆောင်ခ', delivery_difference: 'လုပ်ငန်းရှင်ရရန်/ပေးရန် ပို့ဆောင်ခကွာဟချက်',
  settlement_direction: 'ငွေစာရင်းရှင်းလင်းမှု ဦးတည်ချက်', merchant_settlement_adjustment: 'လုပ်ငန်းရှင် ငွေစာရင်း ညှိနှိုင်းပြင်ဆင်မှု',
  merchant_final_settlement_amount: 'လုပ်ငန်းရှင်သို့ နောက်ဆုံးရှင်းလင်းမည့်ငွေ', validation_status: 'မှန်ကန်မှုစစ်ဆေးခြင်း အခြေအနေ',
  validation_message: 'မှန်ကန်မှုစစ်ဆေးခြင်း အကြောင်းကြားစာ', calculation_version: 'တွက်ချက်မှု ဗားရှင်း', calculated_at: 'တွက်ချက်သည့်အချိန်',
};

const AMOUNT_TYPE_MY: Record<string, string> = {
  ITEM_PRICE_PLUS_DECLARED_DELIVERY: 'ကုန်ပစ္စည်းတန်ဖိုး + ဖော်ပြထားသော ပို့ဆောင်ခ',
  TOTAL_AMOUNT_INCLUDING_DELIVERY: 'ပို့ဆောင်ခအပါအဝင် စုစုပေါင်းငွေပမာဏ',
  DELIVERY_CHARGE_ONLY: 'ပို့ဆောင်ခ သီးသန့်',
  EXACT_COLLECTION_AMOUNT: 'တိကျစွာ ကောက်ခံရမည့် ငွေပမာဏ',
  OPAQUE_COD_COLLECTION: 'ခွဲခြမ်းစိတ်ဖြာထားခြင်းမရှိသော COD ငွေပမာဏ',
  ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT: 'ကုန်ပစ္စည်းတန်ဖိုး သီးသန့် — ပို့ဆောင်ခကို လုပ်ငန်းရှင်မှ ပေးချေမည်',
};

const STATUS_MY: Record<string, string> = {
  registered: 'စာရင်းသွင်းပြီးဖြစ်ပါသည်', ready_for_waybill: 'ကုန်တင်လွှာ (Waybill) ထုတ်ရန် အသင့်ဖြစ်ပါသည်', needs_fix: 'ပြင်ဆင်ရန် လိုအပ်ပါသည်',
  NOT_CALCULATED: 'တွက်ချက်ထားခြင်း မရှိသေးပါ', OK: 'မှန်ကန်ပါသည်', PASS: 'အောင်မြင်ပါသည်', REVIEW: 'ပြန်လည်စစ်ဆေးရန် လိုအပ်ပါသည်', ERROR: 'ချို့ယွင်းချက်ရှိပါသည်', FAIL: 'မအောင်မြင်ပါ', UNKNOWN: 'အခြေအနေ အတည်ပြုနိုင်ခြင်း မရှိပါ',
};

interface PickupRow {
  pickup_id: string;
  merchant_id: string;
  merchant_name: string;
  township: string;
  city: string;
  expected_parcels: number;
  verified_parcels: number;
  rider_status: string;
  pickup_status: string;
  pickup_date: string;
  [key: string]: unknown;
}

interface EditorRow {
  key: string;
  pickup_id: string;
  parcel_sequence: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  proof: Record<string, unknown>;
  calculation?: FinancialV2Envelope<Record<string, unknown>>;
  saveCheck?: FinancialV2Envelope<Record<string, unknown>>;
  calculating: boolean;
  checkingSave: boolean;
  error: string;
  photoReviewed: boolean;
  photoUnavailableAcknowledged: boolean;
  selectedTownshipCode?: string;
  calculationRequestId?: string;
  saveRequestId?: string;
  operatorTouched: Record<string, boolean>;
  assistedFields: Record<string, boolean>;
  amountGuidance: string;
}


interface WorkbookCheck {
  fileName: string;
  valid: boolean;
  rowCount: number;
  headerCount: number;
  missing: string[];
  unexpected: string[];
  message: string;
}

function tr(language: UiLanguage, key: UiKey): string {
  return UI[language][key];
}

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

function numberValue(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function asPositiveInteger(value: unknown): number {
  const result = Math.trunc(numberValue(value));
  return result > 0 ? result : 0;
}

function title(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fieldLabel(name: string, language: UiLanguage): string {
  return language === 'my' ? FIELD_MY[name] || title(name) : title(name);
}

function sectionLabel(name: string, language: UiLanguage): string {
  return language === 'my' ? SECTION_MY[name] || name : name;
}

function statusLabel(value: string, language: UiLanguage): string {
  return language === 'my' ? STATUS_MY[value] || STATUS_MY[value.toLowerCase()] || STATUS_MY[value.toUpperCase()] || title(value) : title(value);
}

function amountTypeLabel(value: string, language: UiLanguage): string {
  return language === 'my' ? AMOUNT_TYPE_MY[value] || title(value) : title(value);
}

function requestId(prefix: string): string {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${id}`;
}

function extractArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  if (!value || typeof value !== 'object') return [];
  const object = value as Record<string, unknown>;
  for (const key of ['rows', 'items', 'pickups', 'data', 'result']) {
    const nested = extractArray(object[key]);
    if (nested.length) return nested;
  }
  return [];
}

function normalizePickup(value: Record<string, unknown>): PickupRow | null {
  const pickupId = text(value.pickup_id || value.pickupId || value.pickup_code).trim();
  if (!pickupId) return null;
  return {
    ...value,
    pickup_id: pickupId,
    merchant_id: text(value.merchant_id || value.merchant_code || value.os).trim().toUpperCase(),
    merchant_name: text(value.merchant_name || value.online_shop_name || value.os_name).trim(),
    township: text(value.township || value.pickup_township).trim(),
    city: text(value.city || value.pickup_city || value.destination).trim(),
    expected_parcels: asPositiveInteger(value.expected_parcels || value.expected_parcel_count || value.parcel_count),
    verified_parcels: asPositiveInteger(value.verified_parcels),
    rider_status: text(value.rider_status).trim(),
    pickup_status: text(value.pickup_status || value.workflow_stage).trim(),
    pickup_date: text(value.pickup_date || value.created_at).trim(),
  };
}

function expectedPickupCount(pickup?: PickupRow | null): number {
  if (!pickup) return 0;
  return pickup.expected_parcels || pickup.verified_parcels || 0;
}

function proofSequence(value: Record<string, unknown>): number {
  return asPositiveInteger(value.parcel_sequence || value.item_no || value.sequence_no);
}

function proofPhoto(value: Record<string, unknown>): string {
  return text(value.photo_url || value.proof_photo_url || value.proof_photo_path || value.image_url || value.image_path).trim();
}

function initialInput(pickup: PickupRow, proof: Record<string, unknown>, sequence: number): Record<string, unknown> {
  return {
    customer_id: text(proof.customer_id),
    merchant_id: text(proof.merchant_id || proof.merchant_code || pickup.merchant_id).trim().toUpperCase(),
    status: text(proof.status || proof.parcel_status || 'registered'),
    recipient_name: text(proof.recipient_name),
    recipient_phone: text(proof.recipient_phone || proof.contact_no_1),
    township: text(proof.township || pickup.township),
    delivery_address: text(proof.delivery_address || proof.recipient_address),
    item_price: proof.item_price ?? '',
    delivery_charges: proof.delivery_charges ?? proof.delivery_fee ?? '',
    weight_kg: proof.weight_kg ?? proof.parcel_weight_kg ?? proof.actual_weight_kg ?? '',
    amount_entry_type: text(proof.amount_entry_type),
    merchant_stated_total_amount: proof.merchant_stated_total_amount ?? '',
    additional_customer_charge: proof.additional_customer_charge ?? '',
    cbm_surcharge: proof.cbm_surcharge ?? '',
    other_surcharge: proof.other_surcharge ?? '',
    merchant_payable_charges: proof.merchant_payable_charges ?? '',
    other_merchant_credits: proof.other_merchant_credits ?? '',
    remarks: text(proof.remarks || proof.remark),
    pickup_id: pickup.pickup_id,
    parcel_sequence: sequence,
  };
}

function isBlankValue(value: unknown): boolean {
  return value === '' || value === null || value === undefined;
}

function optionalNumber(value: unknown): number | null {
  if (isBlankValue(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function initialOperatorTouched(input: Record<string, unknown>): Record<string, boolean> {
  const touched: Record<string, boolean> = {};
  for (const field of GUIDED_EDITABLE_FIELDS) {
    if (!isBlankValue(input[field])) touched[field] = true;
  }
  return touched;
}

function amountTypeGuidance(amountType: string, language: UiLanguage): string {
  const my = language === 'my';
  switch (amountType) {
    case 'ITEM_PRICE_PLUS_DECLARED_DELIVERY':
      return my
        ? 'စနစ်အကြံပြုချက် — လုပ်ငန်းရှင်သတ်မှတ် မူလစုစုပေါင်း = ကုန်ပစ္စည်းတန်ဖိုး + လုပ်ငန်းရှင်ဖော်ပြပို့ဆောင်ခ။ လက်ခံသူထံမှ အမှန်တကယ်ကောက်ခံမည့် COD တွင် ဗဟိုစနစ်တွက် အပိုအလေးချိန်/CBM/အခြားပို့ဆောင်ခများကို ထပ်ပေါင်းမည်ဖြစ်ပြီး၊ ယင်းထပ်ဆောင်းခများကို Britium က ရယူမည်ဖြစ်ပါသည်။'
        : 'System suggestion: merchant-stated subtotal = item price + merchant-declared delivery. The receiver COD then adds backend-calculated weight/CBM/other delivery surcharges, which are retained by Britium.';
    case 'DELIVERY_CHARGE_ONLY':
      return my
        ? 'စနစ်အကြံပြုချက် — လုပ်ငန်းရှင်သတ်မှတ်စုစုပေါင်း = လုပ်ငန်းရှင်ဖော်ပြပို့ဆောင်ခ။ ထပ်ဆောင်းကောက်ခံငွေရှိပါက သီးခြားထည့်သွင်းရမည်ဖြစ်ပါသည်။'
        : 'System suggestion: merchant-stated subtotal = merchant-declared delivery. Any approved customer addition remains separate.';
    case 'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT':
      return my
        ? 'စနစ်အကြံပြုချက် — လုပ်ငန်းရှင်သတ်မှတ်စုစုပေါင်း = ကုန်ပစ္စည်းတန်ဖိုး။ ပို့ဆောင်ခကို လုပ်ငန်းရှင်ဘက် ရှင်းတမ်းတွင် ဗဟိုစနစ်က သီးခြားတွက်ချက်မည်ဖြစ်ပါသည်။'
        : 'System suggestion: merchant-stated subtotal = item price. Merchant-paid delivery is handled separately by backend settlement.';
    case 'TOTAL_AMOUNT_INCLUDING_DELIVERY':
      return my
        ? 'ပို့ဆောင်ခအပါအဝင် စုစုပေါင်းတန်ဖိုးကို လုပ်ငန်းရှင်အတည်ပြုချက်အတိုင်း ထည့်သွင်းရမည်ဖြစ်ပြီး စနစ်က မခန့်မှန်းပါ။ ထည့်သွင်းပြီးနောက် ဗဟိုစနစ်က ပါဝင်သောပို့ဆောင်ခကို တွက်ချက်မည်ဖြစ်ပါသည်။'
        : 'Enter the merchant-confirmed total including delivery. The UI does not guess it; the backend derives the delivery component after entry.';
    case 'EXACT_COLLECTION_AMOUNT':
      return my
        ? 'တိကျစွာကောက်ခံရမည့် စုစုပေါင်းကို လုပ်ငန်းရှင်အတည်ပြုချက်နှင့်အညီ ထည့်သွင်းရမည်ဖြစ်ပါသည်။ ခွဲခြမ်းချက်မပြည့်စုံပါက ဗဟိုစနစ်က ပြန်လည်စစ်ဆေးရန် သတ်မှတ်မည်ဖြစ်ပါသည်။'
        : 'Enter the confirmed exact collection total. The backend will require an accepted breakdown before normal settlement.';
    case 'OPAQUE_COD_COLLECTION':
      return my
        ? 'စာချုပ်ချုပ်ဆိုထားသော Opaque COD စုစုပေါင်းကိုသာ ထည့်သွင်းရမည်ဖြစ်ပါသည်။ ဝန်ဆောင်ခ၊ အခကြေးငွေနှင့် ရရန်ငွေများကို အတည်ပြုစာချုပ်စည်းမျဉ်းမှသာ ဗဟိုစနစ်က ဖြည့်ပေးနိုင်ပါသည်။'
        : 'Enter only the contracted opaque-COD total. Fees, merchant charges and credits may be suggested only from approved backend contract rules.';
    default:
      return tr(language, 'guidedAmountHelp');
  }
}

type GuidedSuggestionResult = {
  input: Record<string, unknown>;
  assistedFields: Record<string, boolean>;
  amountGuidance: string;
};

function applyLocalGuidedSuggestions(
  sourceInput: Record<string, unknown>,
  operatorTouched: Record<string, boolean>,
  sourceAssistedFields: Record<string, boolean>,
  language: UiLanguage,
): GuidedSuggestionResult {
  const input = { ...sourceInput };
  const assistedFields = { ...sourceAssistedFields };
  const amountType = text(input.amount_entry_type).trim();

  function suggest(field: string, value: number | null) {
    if (value === null || operatorTouched[field]) return;
    if (isBlankValue(input[field]) || assistedFields[field]) {
      input[field] = value;
      assistedFields[field] = true;
    }
  }

  const itemPrice = optionalNumber(input.item_price);
  const declaredDelivery = optionalNumber(input.delivery_charges);

  if (amountType === 'ITEM_PRICE_PLUS_DECLARED_DELIVERY' && itemPrice !== null && declaredDelivery !== null) {
    suggest('merchant_stated_total_amount', itemPrice + declaredDelivery);
  } else if (amountType === 'DELIVERY_CHARGE_ONLY' && declaredDelivery !== null) {
    suggest('merchant_stated_total_amount', declaredDelivery);
  } else if (amountType === 'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT' && itemPrice !== null) {
    suggest('merchant_stated_total_amount', itemPrice);
  }

  // These remain editable operational inputs. Zero is a safe starting value, not a financial decision.
  suggest('additional_customer_charge', 0);
  suggest('merchant_payable_charges', 0);
  suggest('other_merchant_credits', 0);

  return { input, assistedFields, amountGuidance: amountTypeGuidance(amountType, language) };
}

function mergeBackendGuidedSuggestions(
  sourceInput: Record<string, unknown>,
  operatorTouched: Record<string, boolean>,
  sourceAssistedFields: Record<string, boolean>,
  data: Record<string, unknown>,
): { input: Record<string, unknown>; assistedFields: Record<string, boolean> } {
  const input = { ...sourceInput };
  const assistedFields = { ...sourceAssistedFields };
  for (const [field, keys] of Object.entries(BACKEND_GUIDED_FIELD_KEYS)) {
    if (operatorTouched[field]) continue;
    const key = keys.find((candidate) => !isBlankValue(data[candidate]));
    if (!key) continue;
    input[field] = data[key];
    assistedFields[field] = true;
  }
  return { input, assistedFields };
}

function cleanPayload(row: EditorRow, schema: FinancialV2SchemaData): Record<string, unknown> {
  const payload: Record<string, unknown> = { pickup_id: row.pickup_id, parcel_sequence: row.parcel_sequence };
  for (const field of schema.fields) {
    if (!field.editable || field.ownership !== 'INPUT') continue;
    const raw = row.input[field.name];
    if (raw === '' || raw === undefined) payload[field.name] = null;
    else if (NUMERIC_TYPES.has(field.data_type)) payload[field.name] = Number(raw);
    else payload[field.name] = raw;
  }
  return payload;
}

function clearCalculatedOutput(output: Record<string, unknown>): Record<string, unknown> {
  const next = { ...output };
  for (const field of CALCULATED_OUTPUT_FIELDS) delete next[field];
  return next;
}

function envelopeMessage(value?: FinancialV2Envelope<Record<string, unknown>>): string {
  if (!value) return '';
  const errors = Array.isArray(value.errors) ? value.errors.map((item) => item.message).filter(Boolean) : [];
  const warnings = Array.isArray(value.warnings) ? value.warnings.map((item) => item.message).filter(Boolean) : [];
  if (errors.length) return errors.join(' ');
  if (warnings.length) return warnings.join(' ');
  return text(value.data?.validation_message || value.message);
}

function formatValue(value: unknown, field: FinancialV2Field | undefined, language: UiLanguage): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field && NUMERIC_TYPES.has(field.data_type) && /amount|charge|tariff|refund|surcharge|settlement|price|credit|difference/i.test(field.name)) {
    return `${numberValue(value).toLocaleString('en-US')} MMK`;
  }
  if (typeof value === 'boolean') return value ? tr(language, 'yes') : tr(language, 'no');
  return String(value);
}

export default function DataEntryFinancialV2Page() {
  const [schemaEnvelope, setSchemaEnvelope] = useState<FinancialV2Envelope<FinancialV2SchemaData> | null>(null);
  const [pickups, setPickups] = useState<PickupRow[]>([]);
  const [selectedPickupId, setSelectedPickupId] = useState('');
  const [language, setLanguage] = useState<UiLanguage>(() => {
    try {
      return localStorage.getItem('britium-data-entry-language') === 'en' ? 'en' : 'my';
    } catch {
      return 'my';
    }
  });
  const [rows, setRows] = useState<EditorRow[]>([]);
  const [extraProofRows, setExtraProofRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'register' | 'snapshot'>('register');
  const [snapshotQuery, setSnapshotQuery] = useState('');
  const [snapshotRows, setSnapshotRows] = useState<Array<Record<string, unknown>>>([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [workbookCheck, setWorkbookCheck] = useState<WorkbookCheck | null>(null);
  const [waybillResult, setWaybillResult] = useState<FinancialV2Envelope<Record<string, unknown>> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const rowsRef = useRef<EditorRow[]>([]);
  const autoCalculateTimersRef = useRef<Map<string, number>>(new Map());

  function commitRows(updater: (current: EditorRow[]) => EditorRow[]) {
    setRows((current) => {
      const next = updater(current);
      rowsRef.current = next;
      return next;
    });
  }

  const schema = schemaEnvelope?.data || null;
  const selectedPickup = pickups.find((item) => item.pickup_id === selectedPickupId) || null;
  const expectedCount = expectedPickupCount(selectedPickup);
  const fieldsBySection = useMemo(() => {
    const result = new Map<string, FinancialV2Field[]>();
    for (const field of schema?.fields || []) {
      const list = result.get(field.section) || [];
      list.push(field);
      result.set(field.section, list);
    }
    return result;
  }, [schema?.fields]);

  useEffect(() => {
    try { localStorage.setItem('britium-data-entry-language', language); } catch { /* browser storage may be unavailable */ }
  }, [language]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => () => {
    for (const timer of autoCalculateTimersRef.current.values()) window.clearTimeout(timer);
    autoCalculateTimersRef.current.clear();
  }, []);

  async function loadSchemaAndPickups() {
    setLoading(true);
    setMessage('');
    try {
      const schemaResult = await financialV2Schema();
      if (!schemaResult.ok || !schemaResult.data) throw new Error(envelopeMessage(schemaResult) || (language === 'my' ? 'Financial V2 ပုံစံအား ဗဟိုစနစ်မှ ရယူနိုင်ခြင်းမရှိပါ။' : 'Financial V2 schema is unavailable.'));
      if (schemaResult.data.field_count !== 50) throw new Error(`Backend Financial V2 schema returned ${schemaResult.data.field_count} fields; expected 50.`);
      setSchemaEnvelope(schemaResult);

      let pickupResponse = await supabase.rpc(PICKUP_RPC, { p_limit: 200 });
      if (pickupResponse.error) pickupResponse = await supabase.rpc('be_data_entry_pickup_list_any', { p_limit: 200 });
      if (pickupResponse.error) throw pickupResponse.error;
      const queue = extractArray(pickupResponse.data).map(normalizePickup).filter((item): item is PickupRow => Boolean(item));
      setPickups(queue);
      setSelectedPickupId((current) => current && queue.some((item) => item.pickup_id === current) ? current : queue[0]?.pickup_id || '');
    } catch (error: any) {
      setMessage(error?.message || (language === 'my' ? 'Financial V2 စနစ် စတင်လည်ပတ်ခြင်း မအောင်မြင်ပါ။' : 'Financial V2 startup failed.'));
    } finally {
      setLoading(false);
    }
  }

  async function loadRowsForPickup(pickup: PickupRow) {
    setLoadingRows(true);
    setMessage('');
    setWaybillResult(null);
    try {
      const sources = ['be_v_data_entry_parcel_rows', 'be_v_data_entry_parcel_template', 'be_v_data_entry_parcel_proofs'];
      let proofs: Array<Record<string, unknown>> = [];
      const sourceErrors: string[] = [];
      for (const source of sources) {
        const response = await supabase.from(source).select('*').eq('pickup_id', pickup.pickup_id).order('parcel_sequence', { ascending: true });
        if (response.error) {
          sourceErrors.push(`${source}: ${response.error.message}`);
          continue;
        }
        proofs = (response.data || []) as Array<Record<string, unknown>>;
        if (proofs.length) break;
      }

      const authoritativeCount = expectedPickupCount(pickup);
      if (!authoritativeCount) throw new Error(language === 'my' ? 'ယခု ကုန်ပစ္စည်းလက်ခံယူမှု (Pickup) တွင် တရားဝင်အတည်ပြုထားသော မျှော်မှန်းကုန်စည်အရေအတွက် မပါရှိပါ။ စာရင်းသွင်းခြင်း လုပ်ငန်းစဉ်ကို ရပ်ဆိုင်းထားပါသည်။' : 'The pickup has no authoritative expected parcel count. Registration is blocked.');
      const extras = proofs.filter((proof) => proofSequence(proof) > authoritativeCount);
      setExtraProofRows(extras);

      commitRows(() => Array.from({ length: authoritativeCount }, (_, offset) => {
        const sequence = offset + 1;
        const proof = proofs.find((item) => proofSequence(item) === sequence) || {};
        const sourceInput = initialInput(pickup, proof, sequence);
        const operatorTouched = initialOperatorTouched(sourceInput);
        const guided = applyLocalGuidedSuggestions(sourceInput, operatorTouched, {}, language);
        return {
          key: `${pickup.pickup_id}:${sequence}`,
          pickup_id: pickup.pickup_id,
          parcel_sequence: sequence,
          input: guided.input,
          output: { ...proof, environment: 'PRODUCTION' },
          proof,
          calculating: false,
          checkingSave: false,
          error: '',
          photoReviewed: false,
          photoUnavailableAcknowledged: false,
          selectedTownshipCode: findTownshipTariff(text(proof.township || pickup.township))?.township_code,
          operatorTouched,
          assistedFields: guided.assistedFields,
          amountGuidance: guided.amountGuidance,
        };
      }));
      if (!proofs.length && sourceErrors.length === sources.length) setMessage(sourceErrors.join(' | '));
    } catch (error: any) {
      commitRows(() => []);
      setExtraProofRows([]);
      setMessage(error?.message || (language === 'my' ? 'ကုန်စည်အထောက်အထား မှတ်တမ်းများကို ရယူနိုင်ခြင်းမရှိပါ။' : 'Could not load pickup parcel evidence.'));
    } finally {
      setLoadingRows(false);
    }
  }

  async function loadSnapshot() {
    setSnapshotLoading(true);
    setMessage('');
    try {
      const response = await financialV2Snapshot(snapshotQuery.trim() ? { query: snapshotQuery.trim() } : {}, 200);
      if (!response.ok || !response.data) throw new Error(envelopeMessage(response) || (language === 'my' ? 'Financial V2 မှတ်တမ်းအကျဉ်းချုပ် ရယူခြင်း မအောင်မြင်ပါ။' : 'Financial V2 snapshot failed.'));
      setSnapshotRows(response.data.rows || []);
    } catch (error: any) {
      setSnapshotRows([]);
      setMessage(error?.message || (language === 'my' ? 'Financial V2 မှတ်တမ်းအကျဉ်းချုပ်အား ရယူနိုင်ခြင်းမရှိပါ။' : 'Could not load the Financial V2 snapshot.'));
    } finally {
      setSnapshotLoading(false);
    }
  }

  useEffect(() => {
    void loadSchemaAndPickups();
    void loadSnapshot();
  }, []);

  useEffect(() => {
    if (selectedPickup && schema) void loadRowsForPickup(selectedPickup);
    else if (!selectedPickupId) commitRows(() => []);
  }, [selectedPickupId, schema?.schema_version]);

  function scheduleGuidedCalculation(
    index: number,
    rowKey: string,
    inputOverride: Record<string, unknown>,
    townshipCode?: string,
  ) {
    if (!text(inputOverride.amount_entry_type).trim() || !townshipCode) return;
    const previous = autoCalculateTimersRef.current.get(rowKey);
    if (previous) window.clearTimeout(previous);
    const timer = window.setTimeout(() => {
      autoCalculateTimersRef.current.delete(rowKey);
      const latest = rowsRef.current[index];
      if (!latest || latest.key !== rowKey) return;
      void calculateRow(index, inputOverride, true, townshipCode);
    }, 350);
    autoCalculateTimersRef.current.set(rowKey, timer);
  }

  function updateInput(index: number, field: string, value: unknown) {
    const current = rowsRef.current[index];
    if (!current) return;

    const operatorTouched = { ...current.operatorTouched };
    const assistedFields = { ...current.assistedFields };
    if (GUIDED_EDITABLE_FIELDS.has(field)) {
      operatorTouched[field] = true;
      delete assistedFields[field];
    }

    const selectedTownshipCode = field === 'township' ? undefined : current.selectedTownshipCode;
    const guided = applyLocalGuidedSuggestions(
      { ...current.input, [field]: value },
      operatorTouched,
      assistedFields,
      language,
    );
    const nextRow: EditorRow = {
      ...current,
      input: guided.input,
      output: clearCalculatedOutput(current.output),
      calculation: undefined,
      saveCheck: undefined,
      error: '',
      selectedTownshipCode,
      operatorTouched,
      assistedFields: guided.assistedFields,
      amountGuidance: guided.amountGuidance,
      calculationRequestId: requestId('FINANCIAL_V2_INPUT_CHANGED'),
      saveRequestId: requestId('FINANCIAL_V2_INPUT_CHANGED'),
    };
    commitRows((items) => items.map((row, rowIndex) => rowIndex === index ? nextRow : row));

    if (AUTO_RECALCULATE_FIELDS.has(field)) {
      scheduleGuidedCalculation(index, nextRow.key, guided.input, selectedTownshipCode);
    }
  }

  function clearTownship(index: number) {
    updateInput(index, 'township', '');
  }

  async function calculateRow(
    index: number,
    inputOverride: Record<string, unknown> = {},
    silent = false,
    townshipCodeOverride?: string,
  ) {
    if (!schema) return;
    const current = rowsRef.current[index];
    if (!current) return;

    const selectedTownshipCode = townshipCodeOverride
      || current.selectedTownshipCode
      || findTownshipTariff(text(inputOverride.township ?? current.input.township))?.township_code;
    if (!selectedTownshipCode) {
      commitRows((items) => items.map((row, rowIndex) => rowIndex === index ? {
        ...row,
        error: tr(language, 'selectTownshipFromList'),
      } : row));
      return;
    }

    const calculationRequestId = requestId('FINANCIAL_V2_CALCULATE');
    const calculationRow: EditorRow = {
      ...current,
      input: { ...current.input, ...inputOverride },
      output: clearCalculatedOutput(current.output),
      calculation: undefined,
      saveCheck: undefined,
      calculating: true,
      error: silent ? current.error : '',
      selectedTownshipCode,
      calculationRequestId,
    };

    commitRows((items) => items.map((row, rowIndex) => rowIndex === index ? calculationRow : row));

    try {
      const response = await financialV2Calculate(cleanPayload(calculationRow, schema));
      commitRows((items) => items.map((row, rowIndex) => {
        if (rowIndex !== index || row.calculationRequestId !== calculationRequestId) return row;
        const backendGuided = mergeBackendGuidedSuggestions(
          row.input,
          row.operatorTouched,
          row.assistedFields,
          (response.data || {}) as Record<string, unknown>,
        );
        return {
          ...row,
          input: backendGuided.input,
          assistedFields: backendGuided.assistedFields,
          calculating: false,
          calculation: response,
          output: { ...row.output, ...(response.data || {}) },
          error: response.ok || silent ? '' : envelopeMessage(response),
        };
      }));
    } catch (error: any) {
      commitRows((items) => items.map((row, rowIndex) => rowIndex === index && row.calculationRequestId === calculationRequestId ? {
        ...row,
        calculating: false,
        error: silent ? '' : error?.message || (language === 'my' ? 'ဗဟိုစနစ် တွက်ချက်မှု မအောင်မြင်ပါ။' : 'Backend calculation failed.'),
      } : row));
    }
  }

  function selectTownship(index: number, township: TownshipTariffRecord) {
    if (!township.source_active) return;
    void calculateRow(index, { township: township.township_name }, true, township.township_code);
  }

  async function calculateAll() {
    for (let index = 0; index < rows.length; index += 1) await calculateRow(index);
  }

  async function checkSave(index: number) {
    if (!schema) return;
    const current = rowsRef.current[index];
    if (!current) return;
    if (!current.selectedTownshipCode && !findTownshipTariff(text(current.input.township))) {
      commitRows((items) => items.map((row, rowIndex) => rowIndex === index ? {
        ...row,
        error: tr(language, 'selectTownshipFromList'),
      } : row));
      return;
    }
    if (CLIENT_WRITES_ENABLED && !window.confirm(language === 'my' ? 'ဗဟိုစနစ်မှ တွက်ချက်ထားသော Financial V2 အချက်အလက်များကို လုပ်ငန်းလည်ပတ်မှုအဆင့် (Production) တွင် အပြီးသတ် မှတ်တမ်းတင်သိမ်းဆည်းမည်ဖြစ်ပါသည်။ ဆက်လက်လုပ်ဆောင်မည်လား။' : 'This will persist the backend-calculated Financial V2 row in production. Continue?')) return;
    const saveRequestId = requestId('FINANCIAL_V2_SAVE_CHECK');
    commitRows((items) => items.map((row, rowIndex) => rowIndex === index ? { ...row, checkingSave: true, error: '', saveRequestId } : row));
    try {
      const response = await financialV2Save({
        ...cleanPayload(current, schema),
        request_id: requestId('FINANCIAL_V2_SAVE'),
        dry_run: !CLIENT_WRITES_ENABLED,
        source_file_name: 'PORTAL_FINANCIAL_V2',
        reason: CLIENT_WRITES_ENABLED ? 'PORTAL_FINANCIAL_V2_SAVE' : 'PORTAL_FINANCIAL_V2_SAVE_DRY_RUN',
        destination: selectedPickup?.city || null,
      });
      commitRows((items) => items.map((row, rowIndex) => rowIndex === index && row.saveRequestId === saveRequestId ? {
        ...row,
        checkingSave: false,
        saveCheck: response,
        output: { ...row.output, ...(response.data || {}) },
        error: response.ok ? '' : envelopeMessage(response),
      } : row));
      if (CLIENT_WRITES_ENABLED && response.ok) await loadSnapshot();
    } catch (error: any) {
      commitRows((items) => items.map((row, rowIndex) => rowIndex === index && row.saveRequestId === saveRequestId ? { ...row, checkingSave: false, error: error?.message || (language === 'my' ? 'မှတ်တမ်းတင်ရန် စစ်ဆေးမှု မအောင်မြင်ပါ။' : 'Save validation failed.') } : row));
    }
  }

  async function checkAllSaves() {
    for (let index = 0; index < rows.length; index += 1) await checkSave(index);
  }

  async function checkWaybill() {
    if (!selectedPickupId) return;
    setMessage('');
    try {
      if (CLIENT_WRITES_ENABLED && !window.confirm(language === 'my' ? 'ဗဟိုစနစ်မှ လိုအပ်ချက်များ ပြည့်စုံမှုရှိမရှိ စစ်ဆေးပြီးနောက် လုပ်ငန်းလည်ပတ်မှုအဆင့် ကုန်တင်လွှာ (Production Waybill) ကို ဖန်တီးမည်ဖြစ်ပါသည်။ ဆက်လက်လုပ်ဆောင်မည်လား။' : 'This will create a production waybill after backend readiness checks. Continue?')) return;
      const response = await financialV2CreateWaybill({ pickup_id: selectedPickupId, request_id: requestId('FINANCIAL_V2_WAYBILL'), dry_run: !CLIENT_WRITES_ENABLED });
      setWaybillResult(response);
      if (!response.ok) setMessage(envelopeMessage(response));
    } catch (error: any) {
      setWaybillResult(null);
      setMessage(error?.message || (language === 'my' ? 'ကုန်တင်လွှာ အဆင်သင့်ဖြစ်မှု စစ်ဆေးခြင်း မအောင်မြင်ပါ။' : 'Waybill readiness check failed.'));
    }
  }

  async function validateWorkbook(file: File) {
    if (!schema) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      const headers = (matrix[0] || []).map((value) => text(value).trim()).filter(Boolean);
      const expected = schema.fields.map((field) => field.name);
      const missing = expected.filter((field) => !headers.includes(field));
      const unexpected = headers.filter((field) => !expected.includes(field));
      const valid = missing.length === 0 && unexpected.length === 0 && headers.length === expected.length;
      setWorkbookCheck({
        fileName: file.name,
        valid,
        rowCount: Math.max(0, matrix.length - 1),
        headerCount: headers.length,
        missing,
        unexpected,
        message: valid
          ? (language === 'my' ? 'ယခု မှတ်တမ်းဖိုင် (Workbook) သည် လက်ရှိသတ်မှတ်ထားသော အချက်အလက် ၅၀ ပါ Financial V2 ပုံစံနှင့် ကိုက်ညီမှုရှိပါသည်။ ဗဟိုစနစ်၏ မှတ်တမ်းတင်ခြင်းအခြေအနေမှာ ကနဦးစမ်းသပ်မှု (Shadow) သာဖြစ်သောကြောင့် အချက်အလက်ပေးပို့ခြင်းကို ပိတ်ထားပါသည်။' : 'The workbook matches the active 50-field Financial V2 schema. Posting remains disabled while the backend mutation mode is shadow.')
          : (language === 'my' ? 'ယခု မှတ်တမ်းဖိုင် (Workbook) သည် လက်ရှိဗဟိုစနစ်၏ ပုံစံနှင့် ကိုက်ညီမှုမရှိသောကြောင့် အချက်အလက်ပေးပို့ခြင်း လုပ်ဆောင်၍မရနိုင်ပါ။' : 'The workbook does not match the active backend schema and cannot be posted.'),
      });
    } catch (error: any) {
      setWorkbookCheck({ fileName: file.name, valid: false, rowCount: 0, headerCount: 0, missing: [], unexpected: [], message: error?.message || (language === 'my' ? 'မှတ်တမ်းဖိုင် မှန်ကန်မှုစစ်ဆေးခြင်း မအောင်မြင်ပါ။' : 'Workbook validation failed.') });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-[#8fd3ff]"><Loader2 className="mr-2 animate-spin" /> {tr(language, 'loading')}</div>;
  }

  return (
    <main className="space-y-5" data-build={DATA_ENTRY_FINANCIAL_V2_BUILD} data-township-directory-build={TOWNSHIP_DIRECTORY_BUILD} data-guided-amount-assistance="V61.3" data-merchant-delivery-difference-credit="true" data-weight-surcharge-pass-through="true" lang={language === 'my' ? 'my' : 'en'}>
      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#f6b84b]"><ShieldCheck size={15} /> {tr(language, 'production')}</div>
            <h1 className="mt-2 text-3xl font-black text-[#eef8ff]">{tr(language, 'pageTitle')}</h1>
            <p className="mt-2 max-w-5xl text-[13px] leading-6 text-[#8fb4d0]">{tr(language, 'pageSubtitle')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setLanguage((current) => current === 'my' ? 'en' : 'my')} className="inline-flex items-center gap-2 rounded-xl border border-[#f6b84b]/60 bg-[#f6b84b]/10 px-4 py-2.5 text-[12px] font-black text-[#f6d58f]"><Languages size={15} /> {language === 'my' ? tr(language, 'english') : tr(language, 'myanmar')}</button>
            <a href="/templates/parcel.xlsx" download className="inline-flex items-center gap-2 rounded-xl border border-[#38bdf8]/50 bg-[#38bdf8]/10 px-4 py-2.5 text-[12px] font-black text-[#8fd3ff]"><Download size={15} /> {tr(language, 'downloadTemplate')}</a>
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-[#1a3a5c] px-4 py-2.5 text-[12px] font-black text-[#eef8ff]"><FileSpreadsheet size={15} /> {tr(language, 'validateWorkbook')}</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void validateWorkbook(file); }} />
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Metric label={tr(language, 'schema')} value={schema?.schema_version || tr(language, 'unavailable')} />
          <Metric label={tr(language, 'fieldContract')} value={`${schema?.field_count || 0} ${tr(language, 'fields')}`} good={schema?.field_count === 50} />
          <Metric label={tr(language, 'environment')} value={schema?.environment || 'PRODUCTION'} good />
          <Metric label={tr(language, 'mutationGate')} value={CLIENT_WRITES_ENABLED ? tr(language, 'writeGateEnabled') : tr(language, 'shadowDryRun')} warning={!CLIENT_WRITES_ENABLED} />
        </div>
        {message ? <Notice tone="error" message={message} /> : null}
        {workbookCheck ? <Notice tone={workbookCheck.valid ? 'success' : 'error'} message={`${workbookCheck.fileName}: ${workbookCheck.message} ${tr(language, 'rows')}: ${workbookCheck.rowCount}. ${tr(language, 'headers')}: ${workbookCheck.headerCount}.${workbookCheck.missing.length ? ` ${tr(language, 'missing')}: ${workbookCheck.missing.join(', ')}.` : ''}${workbookCheck.unexpected.length ? ` ${tr(language, 'unexpected')}: ${workbookCheck.unexpected.join(', ')}.` : ''}`} /> : null}
      </section>

      <section className="flex flex-wrap gap-2">
        <Tab active={activeTab === 'register'} onClick={() => setActiveTab('register')}>{tr(language, 'pickupRegistration')}</Tab>
        <Tab active={activeTab === 'snapshot'} onClick={() => setActiveTab('snapshot')}>{tr(language, 'backendRows')}</Tab>
      </section>

      {activeTab === 'register' ? (
        <>
          <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(320px,1fr)_repeat(4,minmax(150px,0.45fr))]">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#6f98b8]">{tr(language, 'canonicalPickup')}
                <select value={selectedPickupId} onChange={(event) => setSelectedPickupId(event.target.value)} className={INPUT_CLASS}>
                  <option value="">{tr(language, 'selectPickup')}</option>
                  {pickups.map((pickup) => <option key={pickup.pickup_id} value={pickup.pickup_id}>{pickup.pickup_id} — {pickup.merchant_id || pickup.merchant_name || tr(language, 'merchantPending')}</option>)}
                </select>
              </label>
              <Metric label={tr(language, 'expectedParcels')} value={expectedCount || '—'} good={expectedCount > 0} />
              <Metric label={tr(language, 'riderStatus')} value={selectedPickup?.rider_status || '—'} />
              <Metric label={tr(language, 'pickupStatus')} value={selectedPickup?.pickup_status || '—'} />
              <Metric label={tr(language, 'historicalExtras')} value={extraProofRows.length} warning={extraProofRows.length > 0} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={!rows.length || loadingRows} onClick={() => void calculateAll()} className="inline-flex items-center gap-2 rounded-xl bg-[#38bdf8] px-4 py-2.5 text-[12px] font-black text-[#061524] disabled:opacity-50"><Calculator size={15} /> {tr(language, 'calculateAll')}</button>
              <button type="button" disabled={!rows.length || loadingRows || extraProofRows.length > 0} onClick={() => void checkAllSaves()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-[12px] font-black text-[#061524] disabled:opacity-50"><Save size={15} /> {CLIENT_WRITES_ENABLED ? tr(language, 'saveAll') : tr(language, 'validateAllSaves')}</button>
              <button type="button" disabled={!selectedPickupId || extraProofRows.length > 0} onClick={() => void checkWaybill()} className="inline-flex items-center gap-2 rounded-xl bg-[#f6b84b] px-4 py-2.5 text-[12px] font-black text-[#061524] disabled:opacity-50"><FileCheck2 size={15} /> {CLIENT_WRITES_ENABLED ? tr(language, 'createWaybill') : tr(language, 'checkWaybill')}</button>
              <button type="button" onClick={() => selectedPickup && void loadRowsForPickup(selectedPickup)} disabled={!selectedPickup || loadingRows} className="inline-flex items-center gap-2 rounded-xl border border-[#1a3a5c] px-4 py-2.5 text-[12px] font-black text-[#eef8ff] disabled:opacity-50"><RefreshCw size={15} className={loadingRows ? 'animate-spin' : ''} /> {tr(language, 'refreshEvidence')}</button>
            </div>
            {extraProofRows.length > 0 ? <Notice tone="error" message={language === 'my' ? `လုပ်ငန်းစဉ် ထိန်းချုပ်မှု (Integrity hold) - စစ်ဆေးမှုပြုလုပ်သော အတန်း (Row) ${extraProofRows.length} ခုသည် ကုန်ပစ္စည်းလက်ခံယူမှု၏ မူလအရေအတွက် ${expectedCount} ထက် ကျော်လွန်နေပါသည်။ ယခင်ပိုလျှံနေသော မှတ်တမ်းများကို သီးသန့်စစ်ဆေးခြင်း (Quarantine) မပြီးမြောက်မချင်း မှတ်တမ်းသိမ်းဆည်းခြင်းနှင့် ကုန်တင်လွှာဖန်တီးခြင်းကို ပိတ်ထားမည်ဖြစ်ပါသည်။` : `Integrity hold: ${extraProofRows.length} verification row(s) exceed the pickup master count of ${expectedCount}. Saving and waybill creation are blocked until controlled historical quarantine is completed.`} /> : null}
            {waybillResult ? <Notice tone={waybillResult.ok ? 'success' : 'error'} message={`${waybillResult.ok ? (language === 'my' ? 'ကုန်တင်လွှာ အဆင်သင့်ဖြစ်မှု စစ်ဆေးချက် အောင်မြင်ပါသည်။' : 'Waybill readiness check passed.') : (language === 'my' ? 'ကုန်တင်လွှာ အဆင်သင့်ဖြစ်မှု စစ်ဆေးချက် မအောင်မြင်ပါ။' : 'Waybill readiness check failed.')} ${envelopeMessage(waybillResult)}`} /> : null}
          </section>

          <div className="space-y-5">
            {rows.map((row, index) => (
              <FinancialRowCard
                key={row.key}
                row={row}
                index={index}
                fieldsBySection={fieldsBySection}
                schema={schema!}
                language={language}
                blocked={extraProofRows.length > 0}
                onInput={updateInput}
                onTownshipSelect={(township) => selectTownship(index, township)}
                onTownshipClear={() => clearTownship(index)}
                onCalculate={() => void calculateRow(index)}
                onSaveCheck={() => void checkSave(index)}
                onPhotoReviewed={(value) => commitRows((items) => items.map((item, rowIndex) => rowIndex === index ? { ...item, photoReviewed: value } : item))}
                onPhotoUnavailable={(value) => commitRows((items) => items.map((item, rowIndex) => rowIndex === index ? { ...item, photoUnavailableAcknowledged: value } : item))}
              />
            ))}
            {!rows.length && !loadingRows ? <div className="rounded-3xl border border-dashed border-[#1a3a5c] p-10 text-center text-[#6f98b8]">{tr(language, 'selectPickupEmpty')}</div> : null}
          </div>
        </>
      ) : (
        <section className="overflow-hidden rounded-3xl border border-[#1a3a5c] bg-[#0b2236]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#1a3a5c] p-4">
            <div className="relative min-w-[280px] flex-1"><Search size={15} className="absolute left-3 top-3 text-[#6f98b8]" /><input value={snapshotQuery} onChange={(event) => setSnapshotQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void loadSnapshot(); }} className={`${INPUT_CLASS} mt-0 pl-9`} placeholder={tr(language, 'searchPlaceholder')} /></div>
            <button type="button" onClick={() => void loadSnapshot()} disabled={snapshotLoading} className="inline-flex items-center gap-2 rounded-xl bg-[#38bdf8] px-4 py-2.5 text-[12px] font-black text-[#061524] disabled:opacity-50">{snapshotLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} {tr(language, 'refresh')}</button>
          </div>
          <div className="overflow-auto">
            <table className="min-w-[1300px] w-full text-left text-[11px] text-[#b8d3e5]">
              <thead className="bg-[#061524] uppercase tracking-wider text-[#6f98b8]"><tr><th className="px-3 py-3">{tr(language, 'wayId')}</th><th className="px-3 py-3">{tr(language, 'merchant')}</th><th className="px-3 py-3">{tr(language, 'recipient')}</th><th className="px-3 py-3">{tr(language, 'township')}</th><th className="px-3 py-3">{tr(language, 'amountType')}</th><th className="px-3 py-3">{tr(language, 'cod')}</th><th className="px-3 py-3">{tr(language, 'netSystemCharge')}</th><th className="px-3 py-3">{tr(language, 'merchantSettlement')}</th><th className="px-3 py-3">{tr(language, 'validation')}</th><th className="px-3 py-3">{tr(language, 'version')}</th><th className="px-3 py-3">{tr(language, 'updated')}</th></tr></thead>
              <tbody>{snapshotRows.map((snapshotRow, index) => <tr key={`${text(snapshotRow.id || snapshotRow.way_id)}:${index}`} className="border-t border-[#1a3a5c]"><td className="px-3 py-3 font-black text-[#f6b84b]">{text(snapshotRow.way_id) || '—'}</td><td className="px-3 py-3">{text(snapshotRow.merchant_id) || '—'}</td><td className="px-3 py-3">{text(snapshotRow.recipient_name) || '—'}</td><td className="px-3 py-3">{text(snapshotRow.township) || '—'}</td><td className="px-3 py-3">{amountTypeLabel(text(snapshotRow.amount_entry_type), language) || '—'}</td><td className="px-3 py-3">{numberValue(snapshotRow.cod_amount).toLocaleString('en-US')}</td><td className="px-3 py-3">{numberValue(snapshotRow.net_system_delivery_charge).toLocaleString('en-US')}</td><td className="px-3 py-3">{numberValue(snapshotRow.merchant_final_settlement_amount).toLocaleString('en-US')}</td><td className="px-3 py-3"><StatusBadge value={text(snapshotRow.validation_status) || 'UNKNOWN'} language={language} /></td><td className="px-3 py-3">{text(snapshotRow.calculation_version) || '—'}</td><td className="px-3 py-3">{text(snapshotRow.updated_at) || '—'}</td></tr>)}</tbody>
            </table>
          </div>
          {!snapshotRows.length && !snapshotLoading ? <div className="p-8 text-center text-[#6f98b8]">{tr(language, 'noRows')}</div> : null}
        </section>
      )}
    </main>
  );
}

function FinancialRowCard({ row, index, fieldsBySection, schema, language, blocked, onInput, onTownshipSelect, onTownshipClear, onCalculate, onSaveCheck, onPhotoReviewed, onPhotoUnavailable }: {
  row: EditorRow;
  index: number;
  fieldsBySection: Map<string, FinancialV2Field[]>;
  schema: FinancialV2SchemaData;
  language: UiLanguage;
  blocked: boolean;
  onInput: (index: number, field: string, value: unknown) => void;
  onTownshipSelect: (township: TownshipTariffRecord) => void;
  onTownshipClear: () => void;
  onCalculate: () => void;
  onSaveCheck: () => void;
  onPhotoReviewed: (value: boolean) => void;
  onPhotoUnavailable: (value: boolean) => void;
}) {
  const validationStatus = text(row.output.validation_status || row.calculation?.data?.validation_status);
  const saveMode = text(row.saveCheck?.mutation_mode || (CLIENT_WRITES_ENABLED ? 'ACTIVE REQUIRED' : 'MUTATION_SHADOW'));
  const photo = proofPhoto(row.proof);
  const photoIsUrl = /^https?:\/\//i.test(photo) || /^data:image\//i.test(photo);
  const townshipSelected = Boolean(row.selectedTownshipCode || findTownshipTariff(text(row.input.township)));

  return (
    <article className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1a3a5c] pb-4">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#6f98b8]">{tr(language, 'parcel')} {row.parcel_sequence}</div>
          <div className="mt-1 text-xl font-black text-[#f6b84b]">{text(row.output.way_id || row.proof.delivery_way_id || row.proof.way_id) || tr(language, 'wayAssigned')}</div>
          <div className="mt-1 text-[11px] text-[#8fb4d0]">{tr(language, 'pickup')} {row.pickup_id} · {tr(language, 'sequence')} {row.parcel_sequence} · {schema.schema_version}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={validationStatus || 'NOT_CALCULATED'} language={language} />
          <button type="button" onClick={onCalculate} disabled={row.calculating || !townshipSelected} className="inline-flex items-center gap-2 rounded-xl bg-[#38bdf8] px-4 py-2.5 text-[12px] font-black text-[#061524] disabled:opacity-50">{row.calculating ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />} {tr(language, 'calculate')}</button>
          <button type="button" onClick={onSaveCheck} disabled={row.checkingSave || blocked || !townshipSelected || (!row.photoReviewed && !row.photoUnavailableAcknowledged)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-[12px] font-black text-[#061524] disabled:opacity-50">{row.checkingSave ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {CLIENT_WRITES_ENABLED ? tr(language, 'save') : tr(language, 'validateSave')}</button>
        </div>
      </div>

      {row.amountGuidance ? <Notice tone="warning" message={row.amountGuidance} /> : null}
      <FinancialFlowSummary row={row} language={language} />

      <div className="mt-4 space-y-4">
        {SECTION_ORDER.map((section) => {
          if (section === 'Photo Evidence') {
            return <section key={section} className="rounded-2xl border border-[#1a3a5c] bg-[#081b2e] p-4"><SectionTitle>{sectionLabel(section, language)}</SectionTitle><div className="mt-3 grid gap-4 lg:grid-cols-[220px_1fr]">{photoIsUrl ? <img src={photo} alt={`${tr(language, 'pickup')} ${row.parcel_sequence}`} className="h-44 w-full rounded-xl border border-[#1a3a5c] bg-black/20 object-contain" /> : <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-[#1a3a5c] bg-[#061524] text-[#6f98b8]"><ImageIcon size={28} /></div>}<div className="space-y-3"><div className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-[11px] text-[#8fb4d0]">{photo || tr(language, 'noProof')}</div><label className="flex items-center gap-2 text-[12px] text-[#d8eaf5]"><input type="checkbox" checked={row.photoReviewed} onChange={(event) => onPhotoReviewed(event.target.checked)} /> {tr(language, 'proofReviewed')}</label><label className="flex items-center gap-2 text-[12px] text-[#d8eaf5]"><input type="checkbox" checked={row.photoUnavailableAcknowledged} onChange={(event) => onPhotoUnavailable(event.target.checked)} /> {tr(language, 'photoUnavailable')}</label><div className="text-[10px] text-[#6f98b8]">{tr(language, 'proofRequirement')}</div></div></div></section>;
          }
          const fields = fieldsBySection.get(section) || [];
          if (!fields.length) return null;
          return <section key={section} className="rounded-2xl border border-[#1a3a5c] bg-[#081b2e] p-4"><SectionTitle>{sectionLabel(section, language)}</SectionTitle><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{fields.map((field) => <FieldControl key={field.name} field={field} row={row} index={index} language={language} onInput={onInput} onTownshipSelect={onTownshipSelect} onTownshipClear={onTownshipClear} />)}</div></section>;
        })}
      </div>

      {row.error ? <Notice tone="error" message={row.error} /> : null}
      {row.calculation ? <Notice tone={row.calculation.ok ? (validationStatus === 'REVIEW' ? 'warning' : 'success') : 'error'} message={`${row.calculation.ok ? tr(language, 'calculationCompleted') : tr(language, 'calculationFailed')}: ${envelopeMessage(row.calculation) || statusLabel(validationStatus, language) || tr(language, 'backendResponse')}`} /> : null}
      {row.saveCheck ? <Notice tone={row.saveCheck.ok ? 'success' : 'error'} message={`${row.saveCheck.ok ? (CLIENT_WRITES_ENABLED ? tr(language, 'saved') : tr(language, 'dryRunPassed')) : tr(language, 'saveValidationFailed')} ${tr(language, 'mode')}: ${saveMode}. ${tr(language, 'persisted')}: ${String(Boolean(row.saveCheck.persisted))}. ${envelopeMessage(row.saveCheck)}`} /> : null}
    </article>
  );
}

function FinancialFlowSummary({ row, language }: { row: EditorRow; language: UiLanguage }) {
  if (!row.calculation?.ok) return null;
  const data = { ...row.input, ...row.output, ...(row.calculation.data || {}) };
  const amountType = text(data.amount_entry_type).trim().toUpperCase();
  const itemPrice = numberValue(data.item_price);
  const declaredDelivery = numberValue(data.delivery_charges);
  const weightSurcharge = numberValue(data.weight_surcharge);
  const cbmSurcharge = numberValue(data.cbm_surcharge);
  const otherSurcharge = numberValue(data.other_surcharge);
  const additionalCustomerCharge = numberValue(data.additional_customer_charge);
  const systemSurcharges = weightSurcharge + cbmSurcharge + otherSurcharge;
  const merchantSubtotal = numberValue(data.merchant_stated_total_amount || (itemPrice + declaredDelivery));
  const codAmount = numberValue(data.cod_amount);
  const baseTariff = numberValue(data.base_tariff);
  const commitmentRefund = numberValue(data.commitment_refund);
  const netEntitlement = numberValue(data.net_system_delivery_charge);
  const deliveryDifference = numberValue(data.delivery_difference);
  const merchantCredits = numberValue(data.other_merchant_credits);
  const merchantCharges = numberValue(data.merchant_payable_charges);
  const finalSettlement = numberValue(data.merchant_final_settlement_amount);
  const direction = text(data.settlement_direction).trim().toUpperCase();
  const passThroughType = amountType === 'ITEM_PRICE_PLUS_DECLARED_DELIVERY' || amountType === 'DELIVERY_CHARGE_ONLY';

  const money = (value: number) => `${value.toLocaleString('en-US')} MMK`;
  const collectionParts = amountType === 'DELIVERY_CHARGE_ONLY'
    ? [declaredDelivery, weightSurcharge, cbmSurcharge, otherSurcharge, additionalCustomerCharge]
    : [itemPrice, declaredDelivery, weightSurcharge, cbmSurcharge, otherSurcharge, additionalCustomerCharge];
  const collectionEquation = `${collectionParts.map((value) => value.toLocaleString('en-US')).join(' + ')} = ${codAmount.toLocaleString('en-US')} MMK`;
  const entitlementEquation = `${baseTariff.toLocaleString('en-US')} + ${weightSurcharge.toLocaleString('en-US')} + ${cbmSurcharge.toLocaleString('en-US')} + ${otherSurcharge.toLocaleString('en-US')} - ${commitmentRefund.toLocaleString('en-US')} = ${netEntitlement.toLocaleString('en-US')} MMK`;
  const settlementEquation = `${itemPrice.toLocaleString('en-US')} + ${deliveryDifference.toLocaleString('en-US')} + ${merchantCredits.toLocaleString('en-US')} - ${merchantCharges.toLocaleString('en-US')} = ${finalSettlement.toLocaleString('en-US')} MMK`;

  return (
    <section className="mt-4 rounded-2xl border border-emerald-500/35 bg-emerald-950/15 p-4" data-financial-flow-summary="backend-authoritative">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-300">{tr(language, 'receiverCollection')}</div>
        <StatusBadge value={text(data.validation_status) || 'UNKNOWN'} language={language} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <ReferenceItem label={tr(language, 'merchantDeclaredSubtotal')} value={money(merchantSubtotal)} />
        <ReferenceItem label={tr(language, 'customerSystemSurcharges')} value={money(systemSurcharges)} good={systemSurcharges > 0} />
        <ReferenceItem label={tr(language, 'receiverCollection')} value={money(codAmount)} good />
        <ReferenceItem label={tr(language, 'britiumEntitlement')} value={money(netEntitlement)} />
        <ReferenceItem label={tr(language, 'merchantReceivable')} value={money(finalSettlement)} good={finalSettlement >= 0} />
      </div>
      {passThroughType ? (
        <div className="mt-3 space-y-1 rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-[10px] leading-5 text-[#b8d3e5]">
          <div><span className="font-black text-[#8fd3ff]">{tr(language, 'receiverCollection')}:</span> {collectionEquation}</div>
          <div><span className="font-black text-[#8fd3ff]">{tr(language, 'britiumEntitlement')}:</span> {entitlementEquation}</div>
          <div><span className="font-black text-[#8fd3ff]">{tr(language, 'merchantReceivable')}:</span> {settlementEquation}</div>
          <div className="text-amber-200">{tr(language, 'weightPassThroughRule')}</div>
        </div>
      ) : null}
      <div className="mt-2 text-[10px] leading-5 text-[#8fb4d0]">{tr(language, 'collectionFormula')} {tr(language, 'settlementFormula')}</div>
      {direction === 'CREDIT_TO_MERCHANT' && deliveryDifference > 0 ? <Notice tone="success" message={`${tr(language, 'merchantDeliveryCredit')}: ${money(deliveryDifference)}. ${tr(language, 'positiveDeliveryDifferenceRule')}`} /> : null}
      {direction === 'DEDUCT_FROM_MERCHANT' && deliveryDifference < 0 ? <Notice tone="warning" message={`${tr(language, 'merchantDeliveryDebit')}: ${money(Math.abs(deliveryDifference))}. ${tr(language, 'negativeDeliveryDifferenceRule')}`} /> : null}
    </section>
  );
}

function FieldControl({ field, row, index, language, onInput, onTownshipSelect, onTownshipClear }: {
  field: FinancialV2Field;
  row: EditorRow;
  index: number;
  language: UiLanguage;
  onInput: (index: number, field: string, value: unknown) => void;
  onTownshipSelect: (township: TownshipTariffRecord) => void;
  onTownshipClear: () => void;
}) {
  const editable = field.editable && field.ownership === 'INPUT';
  const value = editable ? row.input[field.name] ?? '' : row.output[field.name] ?? row.input[field.name] ?? '';
  const label = fieldLabel(field.name, language);
  const assisted = Boolean(row.assistedFields[field.name]);
  const editableLabel = <span className="flex flex-wrap items-center gap-1.5"><span>{label}{field.required ? ' *' : ''}</span>{assisted ? <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-black normal-case tracking-normal text-emerald-300">{tr(language, 'systemSuggestedEditable')}</span> : null}</span>;
  const fieldHelp = field.name === 'additional_customer_charge'
    ? tr(language, 'additionalChargeRule')
    : field.name === 'merchant_payable_charges' || field.name === 'other_merchant_credits'
      ? `${tr(language, 'pendingBusinessConfirmation')} — ${tr(language, 'backendChargeCreditRule')} ${tr(language, 'positiveDeliveryDifferenceRule')}`
      : '';
  if (!editable) return <label className="text-[10px] font-black uppercase tracking-wider text-[#6f98b8]">{label}{field.required ? ' *' : ''}<div className={SERVER_CLASS} title={field.source}>{formatValue(value, field, language)}</div></label>;
  if (field.name === 'township') return <TownshipCombobox value={text(value)} selectedCode={row.selectedTownshipCode} field={field} row={row} language={language} onSelect={onTownshipSelect} onClear={onTownshipClear} />;
  if (field.name === 'amount_entry_type') return <label className="text-[10px] font-black uppercase tracking-wider text-[#9cc2d9]">{editableLabel}<select className={INPUT_CLASS} value={text(value)} onChange={(event) => onInput(index, field.name, event.target.value)}><option value="">{tr(language, 'selectAmountType')}</option>{AMOUNT_TYPES.map((item) => <option key={item} value={item}>{amountTypeLabel(item, language)}</option>)}</select><div className="mt-1 text-[9px] font-medium normal-case leading-4 tracking-normal text-[#6f98b8]">{tr(language, 'guidedAmountHelp')}</div></label>;
  if (field.name === 'status') return <label className="text-[10px] font-black uppercase tracking-wider text-[#9cc2d9]">{editableLabel}<select className={INPUT_CLASS} value={text(value)} onChange={(event) => onInput(index, field.name, event.target.value)}>{STATUS_OPTIONS.map((item) => <option key={item} value={item}>{statusLabel(item, language)}</option>)}</select></label>;
  if (TEXTAREA_FIELDS.has(field.name)) return <label className="md:col-span-2 text-[10px] font-black uppercase tracking-wider text-[#9cc2d9]">{editableLabel}<textarea className={`${INPUT_CLASS} min-h-20`} value={text(value)} onChange={(event) => onInput(index, field.name, event.target.value)} /></label>;
  const type = NUMERIC_TYPES.has(field.data_type) ? 'number' : 'text';
  return <label className="text-[10px] font-black uppercase tracking-wider text-[#9cc2d9]">{editableLabel}<input className={INPUT_CLASS} type={type} min={type === 'number' ? 0 : undefined} step={field.data_type === 'numeric' ? '0.01' : undefined} value={text(value)} onChange={(event) => onInput(index, field.name, event.target.value)} title={field.source} />{fieldHelp ? <div className="mt-1 text-[9px] font-medium normal-case leading-4 tracking-normal text-[#6f98b8]">{fieldHelp}</div> : null}</label>;
}

function TownshipCombobox({ value, selectedCode, field, row, language, onSelect, onClear }: {
  value: string;
  selectedCode?: string;
  field: FinancialV2Field;
  row: EditorRow;
  language: UiLanguage;
  onSelect: (township: TownshipTariffRecord) => void;
  onClear: () => void;
}) {
  const selected = findTownshipTariff(selectedCode || value);
  const [query, setQuery] = useState(selected ? townshipDisplayName(selected, language, true) : value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const editingRef = useRef(false);
  const listId = `township-options-${row.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const results = useMemo(() => searchTownshipTariffs(query, 40), [query]);

  useEffect(() => {
    if (editingRef.current && !selectedCode && !value) return;
    const match = findTownshipTariff(selectedCode || value);
    setQuery(match ? townshipDisplayName(match, language, true) : value);
  }, [value, selectedCode, language]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function choose(township: TownshipTariffRecord) {
    if (!township.source_active) return;
    editingRef.current = false;
    setQuery(townshipDisplayName(township, language, true));
    setOpen(false);
    onSelect(township);
  }

  const sourceFee = selected?.delivery_fee_mmk;
  const sourceFeeText = !selected
    ? '—'
    : !selected.source_active
      ? `${sourceFee == null ? '—' : `${sourceFee.toLocaleString('en-US')} MMK`} — ${tr(language, 'inactiveService')}`
      : sourceFee == null
        ? tr(language, 'sourceFeeMissing')
        : sourceFee === 0
          ? `0 MMK — ${tr(language, 'zeroReferenceWarning')}`
          : `${sourceFee.toLocaleString('en-US')} MMK`;
  const backendTariff = row.output.base_tariff ?? row.calculation?.data?.base_tariff;
  const selectionRequired = Boolean(query.trim()) && !selected;

  return (
    <div className="relative z-20 md:col-span-2 xl:col-span-2">
      <label className="text-[10px] font-black uppercase tracking-wider text-[#9cc2d9]" htmlFor={`${listId}-input`}>{fieldLabel(field.name, language)}{field.required ? ' *' : ''}</label>
      <div className="relative">
        <MapPin size={15} className="absolute left-3 top-4 z-10 text-[#6f98b8]" />
        <input
          id={`${listId}-input`}
          className={`${INPUT_CLASS} pl-9 pr-9 ${selectionRequired ? 'border-amber-500' : ''}`}
          value={query}
          placeholder={tr(language, 'townshipSearch')}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && results[activeIndex] ? `${listId}-${results[activeIndex].township_code}` : undefined}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 160)}
          onChange={(event) => {
            const next = event.target.value;
            editingRef.current = true;
            setQuery(next);
            setOpen(true);
            if (selected || value) onClear();
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              if (!results.length) return;
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => Math.min(results.length - 1, current + 1));
            } else if (event.key === 'ArrowUp') {
              if (!results.length) return;
              event.preventDefault();
              setActiveIndex((current) => Math.max(0, current - 1));
            } else if (event.key === 'Enter') {
              const candidate = results[activeIndex];
              if (open && candidate?.source_active) {
                event.preventDefault();
                choose(candidate);
              }
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
          title={field.source}
        />
        <ChevronDown size={15} className="pointer-events-none absolute right-3 top-4 text-[#6f98b8]" />
        {open ? (
          <div id={listId} role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-xl border border-[#315473] bg-[#061524] shadow-2xl">
            {results.map((township, resultIndex) => (
              <button
                type="button"
                role="option"
                aria-selected={selected?.township_code === township.township_code}
                id={`${listId}-${township.township_code}`}
                key={township.township_code}
                disabled={!township.source_active}
                className={`block w-full border-b border-[#102d46] px-3 py-2.5 text-left ${resultIndex === activeIndex ? 'bg-[#0b2a43]' : ''} ${township.source_active ? 'hover:bg-[#0b2a43]' : 'cursor-not-allowed opacity-55'}`}
                onMouseEnter={() => setActiveIndex(resultIndex)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(township)}
              >
                <div className="text-[12px] font-black text-[#eef8ff]">{townshipDisplayName(township, language, true)}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#8fb4d0]">
                  <span>{township.city} · {township.region_mm || township.region}</span>
                  <span>{township.delivery_fee_mmk == null ? tr(language, 'sourceFeeMissing') : `${township.delivery_fee_mmk.toLocaleString('en-US')} MMK`}</span>
                  <span>{township.service_provider}</span>
                  <span className={township.source_active ? 'text-emerald-300' : 'text-rose-300'}>{township.source_active ? tr(language, 'activeService') : tr(language, 'inactiveService')}</span>
                </div>
              </button>
            ))}
            {!results.length ? <div className="p-4 text-center text-[11px] text-[#6f98b8]">{tr(language, 'noTownshipMatches')}</div> : null}
          </div>
        ) : null}
      </div>

      {selectionRequired ? <div className="mt-1 text-[10px] font-bold text-amber-300">{tr(language, 'selectTownshipFromList')}</div> : null}

      {selected ? (
        <div className={`mt-2 rounded-xl border p-3 normal-case tracking-normal ${selected.source_active ? 'border-[#f6b84b]/35 bg-[#f6b84b]/5' : 'border-rose-500/45 bg-rose-950/20'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-black text-[#f6d58f]">{tr(language, 'tariffReference')}</div>
            <span className="rounded-full border border-[#f6b84b]/35 px-2 py-0.5 text-[9px] font-black text-[#f6d58f]">{tr(language, 'referenceOnly')}</span>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <ReferenceItem label={tr(language, 'selectedTownship')} value={townshipDisplayName(selected, language, true)} />
            <ReferenceItem label={tr(language, 'sourceFee')} value={sourceFeeText} warning={sourceFee == null || sourceFee === 0 || !selected.source_active} />
            <ReferenceItem label={tr(language, 'provider')} value={selected.service_provider} warning={!selected.source_active} />
            <ReferenceItem label={tr(language, 'serviceStatus')} value={selected.source_active ? tr(language, 'activeService') : tr(language, 'inactiveService')} good={selected.source_active} warning={!selected.source_active} />
            <ReferenceItem label={tr(language, 'backendTariff')} value={backendTariff == null || backendTariff === '' ? tr(language, 'tariffPending') : `${numberValue(backendTariff).toLocaleString('en-US')} MMK`} good={backendTariff != null && backendTariff !== ''} />
            <ReferenceItem label={tr(language, 'cityRegion')} value={`${selected.city} · ${selected.region_mm || selected.region}`} />
            <ReferenceItem label={tr(language, 'sourceCode')} value={selected.township_code} />
          </div>
          <div className="mt-2 text-[10px] leading-5 text-[#8fb4d0]">{tr(language, 'backendAuthority')}</div>
        </div>
      ) : null}
    </div>
  );
}

function ReferenceItem({ label, value, warning = false, good = false }: { label: string; value: string; warning?: boolean; good?: boolean }) {
  const tone = good ? 'text-emerald-300' : warning ? 'text-amber-300' : 'text-[#d8eaf5]';
  return <div className="rounded-lg border border-[#1a3a5c] bg-[#071a2b] p-2"><div className="text-[8px] font-black uppercase tracking-wider text-[#6f98b8]">{label}</div><div className={`mt-1 text-[10px] font-bold leading-4 ${tone}`}>{value}</div></div>;
}

function SectionTitle({ children }: { children: string }) {
  return <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#f6b84b]">{children}</div>;
}

function Metric({ label, value, good = false, warning = false }: { label: string; value: unknown; good?: boolean; warning?: boolean }) {
  const tone = good ? 'text-emerald-300' : warning ? 'text-amber-300' : 'text-[#eef8ff]';
  return <div className="rounded-2xl border border-[#1a3a5c] bg-[#081b2e] p-4"><div className="text-[9px] font-black uppercase tracking-widest text-[#6f98b8]">{label}</div><div className={`mt-2 break-words text-[14px] font-black ${tone}`}>{String(value)}</div></div>;
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return <button type="button" onClick={onClick} className={`rounded-xl border px-4 py-2.5 text-[12px] font-black ${active ? 'border-[#f6b84b] bg-[#f6b84b] text-[#061524]' : 'border-[#1a3a5c] bg-[#0b2236] text-[#8fb4d0]'}`}>{children}</button>;
}

function Notice({ tone, message }: { tone: 'success' | 'warning' | 'error'; message: string }) {
  const styles = tone === 'success' ? 'border-emerald-600/40 bg-emerald-900/20 text-emerald-200' : tone === 'warning' ? 'border-amber-600/40 bg-amber-900/20 text-amber-200' : 'border-rose-600/40 bg-rose-900/20 text-rose-200';
  return <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-[12px] leading-5 ${styles}`}>{tone === 'success' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}<span>{message}</span></div>;
}

function StatusBadge({ value, language }: { value: string; language: UiLanguage }) {
  const normalized = value.toUpperCase();
  const styles = normalized === 'OK' || normalized === 'PASS' ? 'border-emerald-600/40 bg-emerald-900/20 text-emerald-300' : normalized === 'REVIEW' ? 'border-amber-600/40 bg-amber-900/20 text-amber-300' : normalized === 'ERROR' || normalized === 'FAIL' ? 'border-rose-600/40 bg-rose-900/20 text-rose-300' : 'border-slate-600/40 bg-slate-900/20 text-slate-300';
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-black ${styles}`}>{statusLabel(normalized || 'NOT_CALCULATED', language)}</span>;
}
