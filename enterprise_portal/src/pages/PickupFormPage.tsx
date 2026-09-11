import React, { useState, useCallback } from 'react'
import { Package, CheckCircle, AlertCircle } from 'lucide-react'

// --- GO-LIVE IMPORTS (Commented out for sandbox preview compilation) ---
// import { supabase } from '@/integrations/supabase/client'
// import { useMasterDropdowns } from '@/hooks/useMasterDropdowns'
// import { ZONE_LIST } from '@/lib/constants'
// -----------------------------------------------------------------------


type Language = 'EN' | 'MM'

// --- PREVIEW ENVIRONMENT STUBS ---
// These stubs allow the UI to render and function in this isolated environment 
// without throwing compilation errors for missing external files.
type SupabaseRpcResult = { data: null; error: Error | null }

const supabase = {
  rpc: async (_functionName: string, _params: Record<string, unknown>): Promise<SupabaseRpcResult> => {
    await new Promise(resolve => setTimeout(resolve, 800))
    return { data: null, error: null }
  }
}
const ZONE_LIST = [
  'Ahlone', 'Bahan', 'Botataung', 'Dagon', 'Hlaing', 'Hlaingthaya', 
  'Insein', 'Kamayut', 'Kyauktada', 'Kyimyindaing', 'Lanmadaw', 
  'Latha', 'Mayangone', 'Mingaladon', 'North Dagon', 'North Okkalapa', 
  'Pabedan', 'Pazundaung', 'Sanchaung', 'South Dagon', 'South Okkalapa', 
  'Tamwe', 'Thaketa', 'Thingangyun', 'Yankin'
]
interface MerchantOption {
  label: string
  value: string
}

interface MasterDropdowns {
  merchants: MerchantOption[]
  loading: boolean
}

const useMasterDropdowns = (_lang: Lowercase<Language>): MasterDropdowns => ({
  merchants: [
    { label: 'MERCH-001 - Britium Ventures', value: 'MERCH-001' },
    { label: 'MERCH-002 - Mega Store Yangon', value: 'MERCH-002' },
    { label: 'MERCH-003 - Fashion Hub', value: 'MERCH-003' },
    { label: 'MERCH-004 - Tech Haven Electronics', value: 'MERCH-004' },
    { label: 'MERCH-005 - Local Goods Co.', value: 'MERCH-005' },
  ],
  loading: false
})
// ---------------------------------

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

type PaymentMethod = 'COD' | 'Prepaid' | 'Monthly'
type ServiceType = 'Standard' | 'Express' | 'Overnight'
type Priority = 'Normal' | 'High' | 'Urgent'
type Tier = 'Standard' | 'Royal'

interface FormState {
  merchantId: string
  merchantName: string
  merchantCode: string
  senderPhone: string
  pickupAddress: string
  pickupTownship: string
  pickupCity: string
  pickupDate: string
  pickupTime: string
  parcelCount: number
  recipientName: string
  recipientPhone: string
  deliveryTownship: string
  deliveryAddress: string
  paymentMethod: PaymentMethod
  codAmount: number
  serviceType: ServiceType
  priority: Priority
  tier: Tier
  weightKg: number
  baseFee: number
  isHighway: boolean
  remarks: string
}

function calcTariff(tier: Tier, weightKg: number, baseFee: number, isHighway: boolean) {
  const ceilWt = Math.ceil(weightKg)
  const allow = tier === 'Royal' ? 5 : 3
  const extra = Math.max(0, ceilWt - allow)
  const surcharge = extra * 500
  const hwFee = isHighway ? 3000 : 0
  return { ceilWt, allow, extra, surcharge, hwFee, total: baseFee + surcharge + hwFee }
}

function pickupId(date: string, code: string, count: number): string {
  if (!date || !code) return 'P----'
  const d = new Date(date)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const codeStr = code.toUpperCase().slice(0, 3).padEnd(3, 'X')
  const countStr = String(count).padStart(3, '0')
  return 'P' + mm + dd + '-' + codeStr + '-' + countStr
}

function deliverId(date: string, code: string, count: number): string {
  if (!date || !code) return 'D----'
  const d = new Date(date)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const codeStr = code.toUpperCase().slice(0, 3).padEnd(3, 'X')
  const seqStr = String(count + 1).padStart(3, '0')
  return 'D' + mm + dd + '-' + codeStr + '-' + seqStr
}

function invoiceNo(date: string, code: string): string {
  if (!date || !code) return 'INV-—'
  const d = new Date(date)
  const yyyymmdd = d.toISOString().slice(0, 10).replace(/-/g, '')
  return 'INV-' + yyyymmdd + '-' + code.toUpperCase().slice(0, 3).padEnd(3, 'X')
}

function waybillNo(pickId: string): string {
  if (!pickId || pickId === 'P----') return 'WB-—'
  return 'WB-' + pickId.replace(/^P/, '')
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ borderBottom: '1px solid ' + C.border, paddingBottom: 12, marginBottom: 16 }}>
      <h2 style={{ fontFamily: FF.sub, fontSize: 18, fontWeight: 600, color: C.text2, margin: '0 0 4px' }}>{title}</h2>
      {sub ? <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>{sub}</p> : null}
    </div>
  )
}

function Label({ children }: { children?: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 6 }}>{children}</label>
}

const today = new Date().toISOString().slice(0, 10)
const defaultForm: FormState = {
  merchantId: '',
  merchantName: '',
  merchantCode: '',
  senderPhone: '',
  pickupAddress: '',
  pickupTownship: '',
  pickupCity: '',
  pickupDate: today,
  pickupTime: '09:00',
  parcelCount: 1,
  recipientName: '',
  recipientPhone: '',
  deliveryTownship: '',
  deliveryAddress: '',
  paymentMethod: 'COD',
  codAmount: 0,
  serviceType: 'Standard',
  priority: 'Normal',
  tier: 'Standard',
  weightKg: 1,
  baseFee: 4000,
  isHighway: false,
  remarks: '',
}

const TRANSLATIONS = {
  EN: {
    title: 'Pickup Request Form',
    subtitle: 'Register a new pickup with auto-generated IDs and real-time tariff preview.',
    sysIdsTitle: 'System Generated IDs',
    pickupId: 'Pickup ID',
    deliverId: 'Deliver ID',
    invoiceNo: 'Invoice No',
    waybillNo: 'Waybill No',

    sec1Title: '1. Merchant / Sender',
    sec1Sub: 'Select merchant to auto-fill name and code',
    merchId: 'Merchant ID',
    selMerch: '— Select Merchant —',
    loading: 'Loading…',
    merchName: 'Merchant Name',
    merchNamePh: 'Auto-filled from ID',
    merchCode: 'Merchant Code (3-letter)',
    senderPhone: 'Sender Phone',

    sec2Title: '2. Pickup Details',
    sec2Sub: 'Where and when the rider should collect the parcel(s)',
    pickupAddr: 'Pickup Address',
    pickupAddrPh: 'Full pickup address',
    pickupTsp: 'Pickup Township',
    selTsp: '— Select Township —',
    pickupCity: 'Pickup City',
    parcelCount: 'Parcel Count',
    pickupDate: 'Pickup Date',
    pickupTime: 'Pickup Time',

    sec3Title: '3. Recipient Details',
    sec3Sub: 'Delivery destination and contact',
    recipName: 'Recipient Name',
    recipNamePh: 'Recipient full name',
    recipPhone: 'Recipient Phone',
    delivTsp: 'Delivery Township',
    delivAddr: 'Delivery Address',
    delivAddrPh: 'Full delivery address',

    sec4Title: '4. Commercial Terms',
    sec4Sub: 'Payment method, COD amount, service and priority tier',
    payMethod: 'Payment Method',
    codAmt: 'COD Amount (MMK)',
    svcType: 'Service Type',
    priority: 'Priority',
    pmCod: 'COD', pmPrepaid: 'Prepaid', pmMonthly: 'Monthly',
    svStandard: 'Standard', svExpress: 'Express', svOvernight: 'Overnight',
    prNormal: 'Normal', prHigh: 'High', prUrgent: 'Urgent',

    sec5Title: '5. Tariff Preview',
    sec5Sub: 'Real-time tariff calculation based on weight and tier',
    tier: 'Tier',
    tierStd: 'Standard (3 kg allowance)',
    tierRoyal: 'Royal (5 kg allowance)',
    weightKg: 'Weight (kg)',
    baseFee: 'Base Fee (MMK)',
    highwayDrop: 'Highway Drop-off',
    ceilWeight: 'Ceil Weight',
    allowance: 'Allowance',
    extraWeight: 'Extra',
    weightSurcharge: 'Weight Surcharge',
    hwFee: 'Highway Fee',
    totalTariff: 'Total Tariff',

    sec6Title: '6. System-Generated Fields',
    sec6Sub: 'Read-only — auto-populated based on form data',

    sec7Title: '7. Special Instructions / Remarks',
    remarksPh: 'Any special instructions for pickup or delivery…',

    errFillReq: 'Please fill in Merchant, Pickup Address, and Recipient Name.',
    errSubmitFail: 'Submission failed. Please try again.',
    btnSubmit: 'Submit Pickup Request',
    btnSubmitting: 'Submitting Pickup Request…',
    
    successMsg: 'Pickup Request Submitted',
    successDesc: 'Your pickup request has been registered. The rider will be assigned shortly.',
    btnNewReq: 'New Pickup Request',
  },
  MM: {
    title: 'ပစ္စည်းလာယူရန် တောင်းဆိုမှု ပုံစံ',
    subtitle: 'အလိုအလျောက်ထုတ်ပေးသော ID များနှင့် နှုန်းထားကြိုတင်တွက်ချက်မှုပါဝင်သော ပစ္စည်းလာယူမှုအသစ်ကို မှတ်ပုံတင်ပါ။',
    sysIdsTitle: 'စနစ်မှ အလိုအလျောက်ထုတ်ပေးသော ID များ',
    pickupId: 'လာယူမည့် ID',
    deliverId: 'ပို့ဆောင်မည့် ID',
    invoiceNo: 'ပြေစာ အမှတ်',
    waybillNo: 'လမ်းညွှန် အမှတ်',

    sec1Title: '၁။ ကုန်သည် / ပေးပို့သူ',
    sec1Sub: 'အမည်နှင့် ကုဒ်ကို အလိုအလျောက်ဖြည့်သွင်းရန် ကုန်သည်ကို ရွေးချယ်ပါ',
    merchId: 'ကုန်သည် ID',
    selMerch: '— ကုန်သည်ကို ရွေးချယ်ပါ —',
    loading: 'ဆွဲယူနေပါသည်…',
    merchName: 'ကုန်သည် အမည်',
    merchNamePh: 'ID မှ အလိုအလျောက် ဖြည့်သွင်းသည်',
    merchCode: 'ကုန်သည် ကုဒ် (အက္ခရာ ၃ လုံး)',
    senderPhone: 'ပေးပို့သူ ဖုန်းနံပါတ်',

    sec2Title: '၂။ လာယူမည့် အချက်အလက်များ',
    sec2Sub: 'ပို့ဆောင်ရေးသမားမှ ပါဆယ်ထုပ်(များ)ကို လာရောက်ယူဆောင်ရမည့် နေရာနှင့် အချိန်',
    pickupAddr: 'လာယူမည့် လိပ်စာ',
    pickupAddrPh: 'လာယူမည့် လိပ်စာ အပြည့်အစုံ',
    pickupTsp: 'လာယူမည့် မြို့နယ်',
    selTsp: '— မြို့နယ်ကို ရွေးချယ်ပါ —',
    pickupCity: 'လာယူမည့် မြို့',
    parcelCount: 'ပါဆယ်ထုပ် အရေအတွက်',
    pickupDate: 'လာယူမည့် နေ့စွဲ',
    pickupTime: 'လာယူမည့် အချိန်',

    sec3Title: '၃။ လက်ခံမည့်သူ၏ အချက်အလက်များ',
    sec3Sub: 'ပို့ဆောင်ရမည့် နေရာနှင့် ဆက်သွယ်ရန်',
    recipName: 'လက်ခံမည့်သူ၏ အမည်',
    recipNamePh: 'လက်ခံမည့်သူ၏ အမည် အပြည့်အစုံ',
    recipPhone: 'လက်ခံမည့်သူ၏ ဖုန်းနံပါတ်',
    delivTsp: 'ပို့ဆောင်မည့် မြို့နယ်',
    delivAddr: 'ပို့ဆောင်မည့် လိပ်စာ',
    delivAddrPh: 'ပို့ဆောင်မည့် လိပ်စာ အပြည့်အစုံ',

    sec4Title: '၄။ လုပ်ငန်းဆိုင်ရာ စည်းကမ်းချက်များ',
    sec4Sub: 'ငွေပေးချေမှုစနစ်၊ ကောက်ခံမည့်ငွေ(COD)၊ ဝန်ဆောင်မှုနှင့် ဦးစားပေးအဆင့်',
    payMethod: 'ငွေပေးချေမှု စနစ်',
    codAmt: 'ကောက်ခံမည့်ငွေ (ကျပ်)',
    svcType: 'ဝန်ဆောင်မှု အမျိုးအစား',
    priority: 'ဦးစားပေးအဆင့်',
    pmCod: 'ပစ္စည်းရောက်ငွေချေ (COD)', pmPrepaid: 'ကြိုတင်ငွေချေ', pmMonthly: 'လစဉ်ရှင်း',
    svStandard: 'ပုံမှန်', svExpress: 'အမြန်', svOvernight: 'ညတွင်းချင်း',
    prNormal: 'ပုံမှန်', prHigh: 'အမြင့်', prUrgent: 'အရေးပေါ်',

    sec5Title: '၅။ နှုန်းထား ကြိုတင်တွက်ချက်မှု',
    sec5Sub: 'အလေးချိန်နှင့် အဆင့်ပေါ်မူတည်၍ အချိန်နှင့်တစ်ပြေးညီ နှုန်းထားတွက်ချက်မှု',
    tier: 'အဆင့်',
    tierStd: 'ပုံမှန် (၃ ကီလိုဂရမ် ခွင့်ပြုသည်)',
    tierRoyal: 'အထူး (၅ ကီလိုဂရမ် ခွင့်ပြုသည်)',
    weightKg: 'အလေးချိန် (ကီလိုဂရမ်)',
    baseFee: 'အခြေခံ အခကြေးငွေ (ကျပ်)',
    highwayDrop: 'အဝေးပြေးဂိတ် ချပေးမှု',
    ceilWeight: 'အလေးချိန် (ကိန်းပြည့်)',
    allowance: 'ခွင့်ပြုအလေးချိန်',
    extraWeight: 'ပိုလွန်အလေးချိန်',
    weightSurcharge: 'အလေးချိန် ပိုလွန်ကြေး',
    hwFee: 'အဝေးပြေးဂိတ် ပို့ဆောင်ကြေး',
    totalTariff: 'စုစုပေါင်း နှုန်းထား',

    sec6Title: '၆။ စနစ်မှ ထုတ်ပေးသော အချက်အလက်များ',
    sec6Sub: 'ပြင်ဆင်၍မရပါ — ဖြည့်စွက်ထားသော အချက်အလက်များပေါ်မူတည်၍ အလိုအလျောက် ဖြည့်သွင်းသည်',

    sec7Title: '၇။ အထူး ညွှန်ကြားချက်များ / မှတ်ချက်များ',
    remarksPh: 'လာယူရန် သို့မဟုတ် ပို့ဆောင်ရန်အတွက် အထူးညွှန်ကြားချက်များ...',

    errFillReq: 'ကျေးဇူးပြု၍ ကုန်သည်၊ လာယူမည့် လိပ်စာနှင့် လက်ခံမည့်သူ၏ အမည်တို့ကို ဖြည့်စွက်ပါ။',
    errSubmitFail: 'တင်သွင်းမှု မအောင်မြင်ပါ။ ကျေးဇူးပြု၍ ထပ်မံကြိုးစားပါ။',
    btnSubmit: 'လာယူရန် တောင်းဆိုမှုကို တင်သွင်းမည်',
    btnSubmitting: 'တောင်းဆိုမှုကို တင်သွင်းနေပါသည်...',

    successMsg: 'တောင်းဆိုမှု တင်သွင်းပြီးပါပြီ',
    successDesc: 'သင့်တောင်းဆိုမှုကို မှတ်ပုံတင်ပြီးပါပြီ။ ပို့ဆောင်ရေးသမားကို မကြာမီ တာဝန်ချထားပေးပါမည်။',
    btnNewReq: 'နောက်ထပ် တောင်းဆိုမှု အသစ်',
  }
}

export default function PickupFormPage() {
  const [lang, setLang] = useState<Language>('EN')
  const [form, setForm] = useState<FormState>(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successId, setSuccessId] = useState<string | null>(null)

  const t = TRANSLATIONS[lang]
  const { merchants: merchantOptions, loading: loadingMaster } = useMasterDropdowns(lang.toLowerCase() as Lowercase<Language>)

  const handleMerchantSelect = useCallback((merchantCode: string) => {
    const m = merchantOptions.find(x => x.value === merchantCode)
    const namePart = m ? (m.label.includes(' - ') ? m.label.split(' - ').slice(1).join(' - ') : m.label) : ''
    setForm(prev => ({
      ...prev,
      merchantId: merchantCode,
      merchantCode: merchantCode.slice(0, 3).toUpperCase(),
      merchantName: namePart,
    }))
  }, [merchantOptions])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const pickId = pickupId(form.pickupDate, form.merchantCode, form.parcelCount)
  const delId = deliverId(form.pickupDate, form.merchantCode, form.parcelCount)
  const invNo = invoiceNo(form.pickupDate, form.merchantCode)
  const wbNo = waybillNo(pickId)
  const tariff = calcTariff(form.tier, form.weightKg, form.baseFee, form.isHighway)

  const handleSubmit = async () => {
    if (!form.merchantId || !form.pickupAddress || !form.recipientName) {
      setSubmitError(t.errFillReq)
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const { error } = await supabase.rpc('submit_pickup_request', {
        p_merchant_id: form.merchantId,
        p_merchant_name: form.merchantName,
        p_merchant_code: form.merchantCode,
        p_sender_phone: form.senderPhone,
        p_pickup_address: form.pickupAddress,
        p_pickup_township: form.pickupTownship,
        p_pickup_city: form.pickupCity,
        p_pickup_date: form.pickupDate,
        p_pickup_time: form.pickupTime,
        p_parcel_count: form.parcelCount,
        p_recipient_name: form.recipientName,
        p_recipient_phone: form.recipientPhone,
        p_delivery_township: form.deliveryTownship,
        p_delivery_address: form.deliveryAddress,
        p_payment_method: form.paymentMethod,
        p_cod_amount: form.paymentMethod === 'COD' ? form.codAmount : 0,
        p_service_type: form.serviceType,
        p_priority: form.priority,
        p_tier: form.tier,
        p_weight_kg: form.weightKg,
        p_base_fee: form.baseFee,
        p_is_highway: form.isHighway,
        p_total_tariff: tariff.total,
        p_pickup_id: pickId,
        p_deliver_id: delId,
        p_invoice_no: invNo,
        p_waybill_no: wbNo,
        p_remarks: form.remarks,
      })

      if (error) {
        throw error
      }

      setSuccessId(pickId)
      setForm(defaultForm)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : t.errSubmitFail)
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', background: C.panel2, border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 14, fontFamily: FF.body, fontWeight: 400, outline: 'none' }
  const readOnlyStyle: React.CSSProperties = { ...inputStyle, color: C.muted, background: '#071827' }

  if (successId) {
    return (
      <div style={{ background: C.bg, padding: 24, minHeight: '100%', fontFamily: FF.body, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
          input:focus,select:focus,textarea:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important}
          input::placeholder,textarea::placeholder{color:#4d7a9b}
          ::-webkit-scrollbar{width:5px;height:5px}
          ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}
          tr:hover td{background:#0f2a42!important}
        `}</style>
        <div style={{ width: '100%', maxWidth: 520, background: C.panel, border: '1px solid ' + C.border, borderRadius: 16, padding: 36, textAlign: 'center' }}>
          <CheckCircle size={52} color={C.success} style={{ margin: '0 auto 16px' }} />
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.success, marginBottom: 8 }}>{t.successMsg}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.gold, marginBottom: 8, fontFamily: 'monospace' }}>{successId}</div>
          <p style={{ fontSize: 14, color: C.text2, marginTop: 0, marginBottom: 24 }}>{t.successDesc}</p>
          <button onClick={() => setSuccessId(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: C.gold, color: '#1a0a00', border: 'none', borderRadius: 8, fontSize: 13, fontFamily: FF.body, fontWeight: 700, cursor: 'pointer' }}>{t.btnNewReq}</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: C.bg, padding: 24, minHeight: '100%', fontFamily: FF.body }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        input:focus,select:focus,textarea:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important}
        input::placeholder,textarea::placeholder{color:#4d7a9b}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}
        tr:hover td{background:#0f2a42!important}
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: FF.body, fontSize: 20, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.gold, margin: 0, lineHeight: 1.2 }}>{t.title}</h1>
          <p style={{ fontFamily: FF.body, fontSize: 14, color: C.muted, marginTop: 4, marginBottom: 0 }}>{t.subtitle}</p>
        </div>
        
        {/* Language Toggle */}
        <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: '1px solid ' + C.border, height: 'fit-content' }}>
          <button
            onClick={() => setLang('EN')}
            style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'EN' ? C.panelHover : 'transparent', color: lang === 'EN' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.2s' }}
          >
            EN
          </button>
          <button
            onClick={() => setLang('MM')}
            style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'MM' ? C.panelHover : 'transparent', color: lang === 'MM' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.2s' }}
          >
            မြန်မာ
          </button>
        </div>
      </div>

      <div style={{ background: C.panel, border: '1px solid ' + C.border, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Package size={16} color={C.gold} />
          <h2 style={{ fontFamily: FF.sub, fontSize: 18, fontWeight: 600, color: C.text2, margin: 0 }}>{t.sysIdsTitle}</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
          {[
            { label: t.pickupId, value: pickId },
            { label: t.deliverId, value: delId },
            { label: t.invoiceNo, value: invNo },
            { label: t.waybillNo, value: wbNo },
          ].map(item => (
            <div key={item.label} style={{ background: C.panel2, border: '1px solid ' + C.border, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 16, color: C.gold, fontWeight: 700, fontFamily: 'monospace' }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: C.panel, border: '1px solid ' + C.border, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <SectionHeader title={t.sec1Title} sub={t.sec1Sub} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
          <div>
            <Label>{t.merchId}</Label>
            <select value={form.merchantId} onChange={e => handleMerchantSelect(e.target.value)} style={inputStyle}>
              <option value="">{loadingMaster ? t.loading : t.selMerch}</option>
              {(merchantOptions ?? []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <Label>{t.merchName}</Label>
            <input value={form.merchantName} onChange={e => set('merchantName', e.target.value)} placeholder={t.merchNamePh} style={inputStyle} />
          </div>
          <div>
            <Label>{t.merchCode}</Label>
            <input value={form.merchantCode} maxLength={3} onChange={e => set('merchantCode', e.target.value.toUpperCase().slice(0, 3))} placeholder="e.g. BBK" style={inputStyle} />
          </div>
          <div>
            <Label>{t.senderPhone}</Label>
            <input value={form.senderPhone} onChange={e => set('senderPhone', e.target.value)} placeholder="+95 9 XXX XXXX" style={inputStyle} />
          </div>
        </div>
      </div>

      <div style={{ background: C.panel, border: '1px solid ' + C.border, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <SectionHeader title={t.sec2Title} sub={t.sec2Sub} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <Label>{t.pickupAddr}</Label>
            <input value={form.pickupAddress} onChange={e => set('pickupAddress', e.target.value)} placeholder={t.pickupAddrPh} style={inputStyle} />
          </div>
          <div>
            <Label>{t.pickupTsp}</Label>
            <select value={form.pickupTownship} onChange={e => set('pickupTownship', e.target.value)} style={inputStyle}>
              <option value="">{t.selTsp}</option>
              {ZONE_LIST.map(tw => <option key={tw} value={tw}>{tw}</option>)}
            </select>
          </div>
          <div>
            <Label>{t.pickupCity}</Label>
            <input value={form.pickupCity} onChange={e => set('pickupCity', e.target.value)} placeholder="e.g. Yangon" style={inputStyle} />
          </div>
          <div>
            <Label>{t.parcelCount}</Label>
            <input type="number" min={1} max={999} value={form.parcelCount} onChange={e => set('parcelCount', parseInt(e.target.value) || 1)} style={inputStyle} />
          </div>
          <div>
            <Label>{t.pickupDate}</Label>
            <input type="date" value={form.pickupDate} onChange={e => set('pickupDate', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <Label>{t.pickupTime}</Label>
            <input type="time" value={form.pickupTime} onChange={e => set('pickupTime', e.target.value)} style={inputStyle} />
          </div>
        </div>
      </div>

      <div style={{ background: C.panel, border: '1px solid ' + C.border, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <SectionHeader title={t.sec3Title} sub={t.sec3Sub} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
          <div>
            <Label>{t.recipName}</Label>
            <input value={form.recipientName} onChange={e => set('recipientName', e.target.value)} placeholder={t.recipNamePh} style={inputStyle} />
          </div>
          <div>
            <Label>{t.recipPhone}</Label>
            <input value={form.recipientPhone} onChange={e => set('recipientPhone', e.target.value)} placeholder="+95 9 XXX XXXX" style={inputStyle} />
          </div>
          <div>
            <Label>{t.delivTsp}</Label>
            <select value={form.deliveryTownship} onChange={e => set('deliveryTownship', e.target.value)} style={inputStyle}>
              <option value="">{t.selTsp}</option>
              {ZONE_LIST.map(tw => <option key={tw} value={tw}>{tw}</option>)}
            </select>
          </div>
          <div>
            <Label>{t.delivAddr}</Label>
            <input value={form.deliveryAddress} onChange={e => set('deliveryAddress', e.target.value)} placeholder={t.delivAddrPh} style={inputStyle} />
          </div>
        </div>
      </div>

      <div style={{ background: C.panel, border: '1px solid ' + C.border, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <SectionHeader title={t.sec4Title} sub={t.sec4Sub} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
          <div>
            <Label>{t.payMethod}</Label>
            <select value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value as PaymentMethod)} style={inputStyle}>
              <option value="COD">{t.pmCod}</option>
              <option value="Prepaid">{t.pmPrepaid}</option>
              <option value="Monthly">{t.pmMonthly}</option>
            </select>
          </div>
          {form.paymentMethod === 'COD' ? (
            <div>
              <Label>{t.codAmt}</Label>
              <input type="number" min={0} step={100} value={form.codAmount} onChange={e => set('codAmount', parseFloat(e.target.value) || 0)} style={inputStyle} />
            </div>
          ) : null}
          <div>
            <Label>{t.svcType}</Label>
            <select value={form.serviceType} onChange={e => set('serviceType', e.target.value as ServiceType)} style={inputStyle}>
              <option value="Standard">{t.svStandard}</option>
              <option value="Express">{t.svExpress}</option>
              <option value="Overnight">{t.svOvernight}</option>
            </select>
          </div>
          <div>
            <Label>{t.priority}</Label>
            <select value={form.priority} onChange={e => set('priority', e.target.value as Priority)} style={inputStyle}>
              <option value="Normal">{t.prNormal}</option>
              <option value="High">{t.prHigh}</option>
              <option value="Urgent">{t.prUrgent}</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ background: C.panel, border: '1px solid ' + C.border, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <SectionHeader title={t.sec5Title} sub={t.sec5Sub} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginBottom: 16 }}>
          <div>
            <Label>{t.tier}</Label>
            <select value={form.tier} onChange={e => set('tier', e.target.value as Tier)} style={inputStyle}>
              <option value="Standard">{t.tierStd}</option>
              <option value="Royal">{t.tierRoyal}</option>
            </select>
          </div>
          <div>
            <Label>{t.weightKg}</Label>
            <input type="number" min={0} step={0.1} value={form.weightKg} onChange={e => set('weightKg', parseFloat(e.target.value) || 0)} style={inputStyle} />
          </div>
          <div>
            <Label>{t.baseFee}</Label>
            <input type="number" min={0} step={100} value={form.baseFee} onChange={e => set('baseFee', parseFloat(e.target.value) || 0)} style={inputStyle} />
          </div>
          <div>
            <Label>{t.highwayDrop}</Label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 42, padding: '0 4px', color: C.text2, fontSize: 14 }}>
              <input type="checkbox" checked={form.isHighway} onChange={e => set('isHighway', e.target.checked)} style={{ width: 16, height: 16 }} />
              +3,000 MMK
            </label>
          </div>
        </div>
        <div style={{ background: C.panel2, border: '1px solid ' + C.border, borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginBottom: 16 }}>
            {[
              { label: t.baseFee, value: form.baseFee.toLocaleString() + ' MMK' },
              { label: t.ceilWeight, value: tariff.ceilWt + ' kg' },
              { label: t.allowance, value: tariff.allow + ' kg' },
              { label: t.extraWeight, value: tariff.extra + ' kg' },
              { label: t.weightSurcharge, value: tariff.surcharge.toLocaleString() + ' MMK' },
              { label: t.hwFee, value: tariff.hwFee.toLocaleString() + ' MMK' },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 13.5, color: C.text2 }}>{item.value}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid ' + C.border, paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted }}>{t.totalTariff}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.gold }}>{tariff.total.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 500 }}>MMK</span></div>
          </div>
        </div>
      </div>

      <div style={{ background: C.panel, border: '1px solid ' + C.border, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <SectionHeader title={t.sec6Title} sub={t.sec6Sub} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
          {[
            { label: t.pickupId, value: pickId },
            { label: t.deliverId, value: delId },
            { label: t.invoiceNo, value: invNo },
            { label: t.waybillNo, value: wbNo },
          ].map(item => (
            <div key={item.label}>
              <Label>{item.label}</Label>
              <input readOnly value={item.value} style={{ ...readOnlyStyle, fontFamily: 'monospace', fontSize: 12 }} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: C.panel, border: '1px solid ' + C.border, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <SectionHeader title={t.sec7Title} />
        <textarea value={form.remarks} onChange={e => set('remarks', e.target.value)} rows={4} placeholder={t.remarksPh} style={{ ...inputStyle, resize: 'vertical', minHeight: 110 }} />
      </div>

      {submitError ? (
        <div style={{ background: '#4a0521', border: '1px solid #831843', borderRadius: 10, padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={15} color={C.error} />
          <p style={{ color: C.error, fontSize: 13, margin: 0 }}>{submitError}</p>
        </div>
      ) : null}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 18px', background: submitting ? '#a16207' : C.gold, color: '#1a0a00', border: 'none', borderRadius: 10, fontSize: 13, fontFamily: FF.body, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer' }}
      >
        {submitting ? t.btnSubmitting : t.btnSubmit}
      </button>
    </div>
  )
}