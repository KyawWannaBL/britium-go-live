// @ts-nocheck
import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

type IndicatorVal = 'YES' | 'NO' | 'COND'

interface PickupException {
  process_type: 'PICKUP'
  exception_code: string
  exception_name_en: string
  exception_name_mm: string
  mapped_status: string
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
  require_photo: IndicatorVal
  require_call_log: IndicatorVal
  allow_reschedule: IndicatorVal
  next_action: string
  customer_message_en: string
}

interface WarehouseException {
  process_type: 'WAREHOUSE'
  exception_code: string
  exception_name_en: string
  exception_name_mm: string
  mapped_status: string
  hold_shipment: IndicatorVal
  approval_required_by: string
  next_action: string
  customer_message_en: string
}

interface DeliveryException {
  process_type: 'DELIVERY'
  exception_code: string
  exception_name_en: string
  exception_name_mm: string
  mapped_status: string
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
  require_photo: IndicatorVal
  require_call_log: IndicatorVal
  allow_reschedule: IndicatorVal
  next_action: string
  customer_message_en: string
}

const PICKUP_EXCEPTIONS: PickupException[] = [
  { process_type: 'PICKUP', exception_code: 'CUSTOMER_NOT_AVAILABLE', exception_name_en: 'Customer not available', exception_name_mm: 'ဖောက်သည်မရှိ', mapped_status: 'PICKUP_FAILED', severity: 'Low', require_photo: 'NO', require_call_log: 'YES', allow_reschedule: 'YES', next_action: 'RESCHEDULE_PICKUP', customer_message_en: 'We attempted to pick up your parcel but could not reach you. Please reschedule.' },
  { process_type: 'PICKUP', exception_code: 'MERCHANT_CLOSED', exception_name_en: 'Merchant closed', exception_name_mm: 'ကုန်သည်ပိတ်ထား', mapped_status: 'PICKUP_FAILED', severity: 'Low', require_photo: 'YES', require_call_log: 'YES', allow_reschedule: 'YES', next_action: 'RESCHEDULE_PICKUP', customer_message_en: 'The pickup location was closed during our visit. A reschedule has been arranged.' },
  { process_type: 'PICKUP', exception_code: 'PARCEL_NOT_READY', exception_name_en: 'Parcel not ready', exception_name_mm: 'ပစ္စည်းအဆင်မပြေ', mapped_status: 'PICKUP_FAILED', severity: 'Low', require_photo: 'NO', require_call_log: 'NO', allow_reschedule: 'YES', next_action: 'RESCHEDULE_PICKUP', customer_message_en: 'Your parcel was not ready for pickup. Please prepare it and we will return.' },
  { process_type: 'PICKUP', exception_code: 'WRONG_PICKUP_ADDRESS', exception_name_en: 'Wrong pickup address', exception_name_mm: 'လိပ်စာမှားနေ', mapped_status: 'ADDRESS_CORRECTION_REQUIRED', severity: 'Medium', require_photo: 'COND', require_call_log: 'YES', allow_reschedule: 'COND', next_action: 'CS_ADDRESS_REVIEW', customer_message_en: 'The pickup address provided appears to be incorrect. Customer Service will contact you.' },
  { process_type: 'PICKUP', exception_code: 'PAYMENT_ISSUE', exception_name_en: 'Payment issue', exception_name_mm: 'ငွေပေးချေမှုပြဿနာ', mapped_status: 'PICKUP_ON_HOLD', severity: 'High', require_photo: 'NO', require_call_log: 'NO', allow_reschedule: 'COND', next_action: 'FINANCE_REVIEW', customer_message_en: 'Your shipment is on hold due to a payment issue. Our finance team will follow up.' },
  { process_type: 'PICKUP', exception_code: 'OVERSIZED_PARCEL', exception_name_en: 'Oversized parcel', exception_name_mm: 'ပစ္စည်းအရွယ်အစားကျော်လွန်', mapped_status: 'SPECIAL_HANDLING_REQUIRED', severity: 'Medium', require_photo: 'YES', require_call_log: 'NO', allow_reschedule: 'COND', next_action: 'REASSIGN_VEHICLE', customer_message_en: 'Your parcel exceeds standard dimensions. We are arranging appropriate transport.' },
  { process_type: 'PICKUP', exception_code: 'RESTRICTED_ITEM', exception_name_en: 'Restricted item', exception_name_mm: 'တားမြစ်ပစ္စည်း', mapped_status: 'PICKUP_REJECTED', severity: 'Critical', require_photo: 'YES', require_call_log: 'NO', allow_reschedule: 'NO', next_action: 'COMPLIANCE_REVIEW', customer_message_en: 'Your shipment contains restricted items and cannot be processed. Compliance team will advise.' },
  { process_type: 'PICKUP', exception_code: 'DUPLICATE_REQUEST', exception_name_en: 'Duplicate request', exception_name_mm: 'တူညီသောတောင်းဆိုချက်', mapped_status: 'PICKUP_CANCELLED', severity: 'Low', require_photo: 'NO', require_call_log: 'NO', allow_reschedule: 'NO', next_action: 'CANCEL_DUPLICATE', customer_message_en: 'A duplicate pickup request was detected and has been cancelled.' },
]

const WAREHOUSE_EXCEPTIONS: WarehouseException[] = [
  { process_type: 'WAREHOUSE', exception_code: 'WAYBILL_MISMATCH', exception_name_en: 'Waybill mismatch', exception_name_mm: 'ဝေဘေလ်မကိုက်ညီ', mapped_status: 'WAREHOUSE_HOLD', hold_shipment: 'YES', approval_required_by: 'CS / Data Entry', next_action: 'DATA_CORRECTION', customer_message_en: 'Your shipment is on hold due to a waybill mismatch. Our team is correcting the data.' },
  { process_type: 'WAREHOUSE', exception_code: 'WEIGHT_MISMATCH', exception_name_en: 'Weight mismatch', exception_name_mm: 'အလေးချိန်မကိုက်ညီ', mapped_status: 'QC_FAILED', hold_shipment: 'YES', approval_required_by: 'Finance', next_action: 'RECALCULATE_TARIFF', customer_message_en: 'A weight discrepancy was found. The tariff will be recalculated and you will be notified.' },
  { process_type: 'WAREHOUSE', exception_code: 'DAMAGED_PARCEL', exception_name_en: 'Damaged parcel', exception_name_mm: 'ပစ္စည်းပျက်စီး', mapped_status: 'DAMAGED', hold_shipment: 'YES', approval_required_by: 'Warehouse / CS', next_action: 'DAMAGE_REVIEW', customer_message_en: 'Your parcel was found damaged at the warehouse. Our team is reviewing the situation.' },
  { process_type: 'WAREHOUSE', exception_code: 'MISSING_INVOICE', exception_name_en: 'Missing invoice', exception_name_mm: 'ငွေတောင်းခံလွှာပျောက်', mapped_status: 'DOCUMENT_REQUIRED', hold_shipment: 'YES', approval_required_by: 'CS / Merchant', next_action: 'REQUEST_DOCUMENT', customer_message_en: 'A required invoice is missing. Please submit the document to proceed.' },
  { process_type: 'WAREHOUSE', exception_code: 'UNIDENTIFIED_PARCEL', exception_name_en: 'Unidentified parcel', exception_name_mm: 'မသိဆေးမဆိုးပစ္စည်း', mapped_status: 'WAREHOUSE_HOLD', hold_shipment: 'YES', approval_required_by: 'Warehouse', next_action: 'MANUAL_INVESTIGATION', customer_message_en: 'Your parcel could not be identified and is under manual investigation.' },
  { process_type: 'WAREHOUSE', exception_code: 'WRONG_DESTINATION', exception_name_en: 'Wrong destination', exception_name_mm: 'လိပ်စာမှားနေ', mapped_status: 'MISROUTED', hold_shipment: 'YES', approval_required_by: 'Warehouse / Dispatch', next_action: 'REROUTE', customer_message_en: 'Your parcel was routed to the wrong destination and is being corrected.' },
  { process_type: 'WAREHOUSE', exception_code: 'DUPLICATE_SCAN', exception_name_en: 'Duplicate scan', exception_name_mm: 'ထပ်တလဲလဲဖတ်မှု', mapped_status: 'SCAN_WARNING', hold_shipment: 'NO', approval_required_by: 'System', next_action: 'IGNORE_OR_REVIEW', customer_message_en: 'A duplicate scan was detected and is being reviewed by the system.' },
  { process_type: 'WAREHOUSE', exception_code: 'RESTRICTED_ITEM', exception_name_en: 'Restricted item', exception_name_mm: 'တားမြစ်ပစ္စည်း', mapped_status: 'WAREHOUSE_HOLD', hold_shipment: 'YES', approval_required_by: 'Compliance', next_action: 'COMPLIANCE_REVIEW', customer_message_en: 'Your shipment contains a restricted item and is under compliance review.' },
  { process_type: 'WAREHOUSE', exception_code: 'HOLD_BY_FINANCE', exception_name_en: 'Hold by finance', exception_name_mm: 'ငွေကြေးဌာနဖြင့်ဆိုင်း', mapped_status: 'FINANCE_HOLD', hold_shipment: 'YES', approval_required_by: 'Finance', next_action: 'FINANCE_RELEASE_REQUIRED', customer_message_en: 'Your shipment is on financial hold. Please contact finance for resolution.' },
  { process_type: 'WAREHOUSE', exception_code: 'HOLD_BY_CUSTOMER_SERVICE', exception_name_en: 'Hold by CS', exception_name_mm: 'ဖောက်သည်ဝန်ဆောင်မှုဆိုင်း', mapped_status: 'CS_HOLD', hold_shipment: 'YES', approval_required_by: 'Customer Service', next_action: 'CS_RELEASE_REQUIRED', customer_message_en: 'Your shipment is on hold by Customer Service. Our team will follow up shortly.' },
]

const DELIVERY_EXCEPTIONS: DeliveryException[] = [
  { process_type: 'DELIVERY', exception_code: 'CUSTOMER_NOT_AVAILABLE', exception_name_en: 'Customer not available', exception_name_mm: 'ဖောက်သည်မရှိ', mapped_status: 'DELIVERY_ATTEMPTED', severity: 'Low', require_photo: 'NO', require_call_log: 'YES', allow_reschedule: 'YES', next_action: 'RESCHEDULE_DELIVERY', customer_message_en: 'We attempted delivery but could not reach you. Please reschedule.' },
  { process_type: 'DELIVERY', exception_code: 'CUSTOMER_REFUSED', exception_name_en: 'Customer refused', exception_name_mm: 'ဖောက်သည်ငြင်းဆန်', mapped_status: 'CUSTOMER_REFUSED', severity: 'Medium', require_photo: 'COND', require_call_log: 'YES', allow_reschedule: 'NO', next_action: 'CS_REVIEW_OR_RTO', customer_message_en: 'You refused delivery of this parcel. Customer Service will contact you.' },
  { process_type: 'DELIVERY', exception_code: 'WRONG_ADDRESS', exception_name_en: 'Wrong address', exception_name_mm: 'လိပ်စာမှားနေ', mapped_status: 'ADDRESS_ISSUE', severity: 'Medium', require_photo: 'COND', require_call_log: 'YES', allow_reschedule: 'COND', next_action: 'CS_ADDRESS_REVIEW', customer_message_en: 'The delivery address appears incorrect. Please contact CS to update.' },
  { process_type: 'DELIVERY', exception_code: 'PHONE_UNREACHABLE', exception_name_en: 'Phone unreachable', exception_name_mm: 'ဖုန်းမကြားရ', mapped_status: 'DELIVERY_ATTEMPTED', severity: 'Low', require_photo: 'NO', require_call_log: 'YES', allow_reschedule: 'YES', next_action: 'RETRY_OR_CS_FOLLOWUP', customer_message_en: 'We could not reach you by phone. Your delivery will be retried.' },
  { process_type: 'DELIVERY', exception_code: 'COD_NOT_READY', exception_name_en: 'COD not ready', exception_name_mm: 'COD ငွေမဆင်သင့်', mapped_status: 'DELIVERY_RESCHEDULED', severity: 'Low', require_photo: 'NO', require_call_log: 'YES', allow_reschedule: 'YES', next_action: 'RESCHEDULE_DELIVERY', customer_message_en: 'COD amount was not available. Please prepare exact change for your rescheduled delivery.' },
  { process_type: 'DELIVERY', exception_code: 'CUSTOMER_REQUESTED_RESCHEDULE', exception_name_en: 'Customer requested reschedule', exception_name_mm: 'ဖောက်သည်နောက်ဆိုင်းပြောင်း', mapped_status: 'DELIVERY_RESCHEDULED', severity: 'Low', require_photo: 'NO', require_call_log: 'NO', allow_reschedule: 'YES', next_action: 'SET_NEXT_ATTEMPT_DATE', customer_message_en: 'Your delivery has been rescheduled as requested.' },
  { process_type: 'DELIVERY', exception_code: 'NO_ACCESS_TO_BUILDING', exception_name_en: 'No access to building', exception_name_mm: 'အဆောက်အဦးဝင်ခွင့်မရ', mapped_status: 'DELIVERY_ATTEMPTED', severity: 'Medium', require_photo: 'COND', require_call_log: 'YES', allow_reschedule: 'YES', next_action: 'CUSTOMER_ACCESS_REQUIRED', customer_message_en: 'Our rider could not access your building. Please arrange access for your next delivery.' },
  { process_type: 'DELIVERY', exception_code: 'PARCEL_DAMAGED', exception_name_en: 'Parcel damaged', exception_name_mm: 'ပစ္စည်းပျက်စီး', mapped_status: 'DAMAGED', severity: 'High', require_photo: 'YES', require_call_log: 'COND', allow_reschedule: 'NO', next_action: 'DAMAGE_REVIEW', customer_message_en: 'Your parcel arrived damaged. Our team will initiate a damage review.' },
  { process_type: 'DELIVERY', exception_code: 'WEATHER_TRAFFIC_ISSUE', exception_name_en: 'Weather / traffic issue', exception_name_mm: 'မိုးလေဝသ/ယာဉ်ကြောပြဿနာ', mapped_status: 'DELIVERY_DELAYED', severity: 'Low', require_photo: 'NO', require_call_log: 'NO', allow_reschedule: 'YES', next_action: 'AUTO_RESCHEDULE', customer_message_en: 'Your delivery was delayed due to weather or traffic. It has been automatically rescheduled.' },
  { process_type: 'DELIVERY', exception_code: 'RIDER_ISSUE', exception_name_en: 'Rider issue', exception_name_mm: 'ဆိုင်ကယ်စီးသူပြဿနာ', mapped_status: 'REASSIGNMENT_REQUIRED', severity: 'Medium', require_photo: 'NO', require_call_log: 'NO', allow_reschedule: 'YES', next_action: 'REASSIGN_RIDER', customer_message_en: 'Your delivery is being reassigned to another rider.' },
]

const AUDIT_FIELDS = [
  { field: 'exception_datetime', required: 'YES', notes: 'Timestamp of exception event' },
  { field: 'reported_by_user_id', required: 'YES', notes: 'Staff/rider who reported' },
  { field: 'branch_id', required: 'YES', notes: 'Originating branch' },
  { field: 'shipment_id', required: 'YES', notes: 'Linked shipment reference' },
  { field: 'previous_status', required: 'YES', notes: 'Status before exception' },
  { field: 'new_status', required: 'YES', notes: 'Status after exception mapped' },
  { field: 'exception_code', required: 'YES', notes: 'Must match master code list' },
  { field: 'remarks', required: 'YES', notes: 'Free-text notes from staff' },
  { field: 'gps_lat', required: 'COND', notes: 'Required when photo/field action taken' },
  { field: 'gps_lng', required: 'COND', notes: 'Required when photo/field action taken' },
  { field: 'photo_url', required: 'COND', notes: 'Required when require_photo = YES' },
  { field: 'call_attempt_count', required: 'COND', notes: 'Required when require_call_log = YES' },
  { field: 'next_action', required: 'YES', notes: 'Action code from master' },
  { field: 'next_attempt_date', required: 'COND', notes: 'When allow_reschedule = YES' },
]

type TabType = 'pickup' | 'warehouse' | 'delivery'

function SeverityBadge({ severity }: { severity: 'Low' | 'Medium' | 'High' | 'Critical' }) {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    Low: { bg: 'rgba(34,197,94,0.12)', color: C.success, border: 'rgba(34,197,94,0.28)' },
    Medium: { bg: 'rgba(245,158,11,0.12)', color: C.warning, border: 'rgba(245,158,11,0.28)' },
    High: { bg: 'rgba(255,138,76,0.12)', color: C.orange, border: 'rgba(255,138,76,0.28)' },
    Critical: { bg: 'rgba(255,79,134,0.12)', color: C.error, border: 'rgba(255,79,134,0.28)' },
  }
  const s = map[severity] ?? map.Low
  return <span style={{ padding: '4px 10px', borderRadius: 999, background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{severity}</span>
}

function IndicatorPill({ val, label }: { val: IndicatorVal; label: string }) {
  const map: Record<IndicatorVal, { bg: string; color: string; border: string }> = {
    YES: { bg: 'rgba(34,197,94,0.12)', color: C.success, border: 'rgba(34,197,94,0.28)' },
    NO: { bg: 'rgba(255,255,255,0.06)', color: C.text2, border: C.border },
    COND: { bg: 'rgba(245,158,11,0.12)', color: C.warning, border: 'rgba(245,158,11,0.28)' },
  }
  const s = map[val]
  return <span style={{ padding: '4px 10px', borderRadius: 999, background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: 11, fontWeight: 700 }}>{label}: {val}</span>
}

function MappedStatusPill({ status }: { status: string }) {
  const isEx = status.includes('FAILED') || status.includes('REJECTED') || status.includes('HOLD') || status.includes('DAMAGED') || status.includes('MISMATCH') || status.includes('CANCELLED') || status.includes('REFUSED') || status.includes('ISSUE') || status.includes('MISROUTED') || status.includes('REQUIRED') || status.includes('QC')
  return (
    <span style={{ padding: '4px 10px', borderRadius: 999, background: isEx ? 'rgba(255,79,134,0.1)' : 'rgba(56,189,248,0.1)', color: isEx ? C.error : C.info, border: `1px solid ${isEx ? 'rgba(255,79,134,0.22)' : 'rgba(56,189,248,0.22)'}`, fontSize: 11, fontWeight: 700 }}>
      {status}
    </span>
  )
}

function HoldPill({ val }: { val: IndicatorVal }) {
  return <span style={{ padding: '4px 10px', borderRadius: 999, background: val === 'YES' ? 'rgba(255,79,134,0.12)' : 'rgba(255,255,255,0.06)', color: val === 'YES' ? C.error : C.text2, border: `1px solid ${val === 'YES' ? 'rgba(255,79,134,0.24)' : C.border}`, fontSize: 11, fontWeight: 700 }}>{val === 'YES' ? 'HOLD' : 'NO HOLD'}</span>
}

function KPICard({ label, value, accent, note }: { label: string; value: string | number; accent: string; note: string }) {
  return (
    <div style={{ background: `linear-gradient(180deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.border}`, borderTop: `2px solid ${accent}`, borderRadius: 18, padding: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: FF.body }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: C.gold, marginTop: 10, fontFamily: FF.body }}>{value}</div>
      <div style={{ fontSize: 12, color: C.text2, marginTop: 8, lineHeight: 1.5 }}>{note}</div>
    </div>
  )
}

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>{eyebrow}</div>
      <h2 style={{ fontFamily: FF.sub, fontSize: 18, fontWeight: 600, color: C.text, marginTop: 8 }}>{title}</h2>
      <p style={{ fontSize: 14, color: C.text2, marginTop: 6, lineHeight: 1.6 }}>{description}</p>
    </div>
  )
}

export default function ExceptionsPage() {
  const [tab, setTab] = useState<TabType>('pickup')
  const [exceptionRecords, setExceptionRecords] = useState<any[]>([])
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [searchCode, setSearchCode] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
  const [showAudit, setShowAudit] = useState(false)

  const loadRecords = async () => {
    setRecordsLoading(true)
    try {
      const { data } = await supabase
        .from('exception_records')
        .select('process_type, exception_code, status')
      setExceptionRecords(data ?? [])
    } catch (_) {
      setExceptionRecords([])
    }
    setRecordsLoading(false)
  }

  useEffect(() => { loadRecords() }, [])

  const countByType = (pt: string) =>
    (exceptionRecords ?? []).filter(r => String(r.process_type ?? '').toUpperCase() === pt).length
  const pickupCount = countByType('PICKUP')
  const warehouseCount = countByType('WAREHOUSE')
  const deliveryCount = countByType('DELIVERY')
  const totalCount = (exceptionRecords ?? []).length

  const getFiltered = () => {
    const q = searchCode.toLowerCase()
    const sev = filterSeverity.toUpperCase()
    if (tab === 'pickup') {
      return PICKUP_EXCEPTIONS.filter(e => {
        const matchQ = !q || e.exception_code.toLowerCase().includes(q) || e.exception_name_en.toLowerCase().includes(q)
        const matchSev = !sev || e.severity.toUpperCase() === sev
        return matchQ && matchSev
      })
    }
    if (tab === 'warehouse') {
      return WAREHOUSE_EXCEPTIONS.filter(e => {
        const matchQ = !q || e.exception_code.toLowerCase().includes(q) || e.exception_name_en.toLowerCase().includes(q)
        return matchQ
      })
    }
    return DELIVERY_EXCEPTIONS.filter(e => {
      const matchQ = !q || e.exception_code.toLowerCase().includes(q) || e.exception_name_en.toLowerCase().includes(q)
      const matchSev = !sev || e.severity.toUpperCase() === sev
      return matchQ && matchSev
    })
  }

  const filtered = getFiltered()

  const TAB_LABELS: { id: TabType; label: string; count: number; color: string }[] = [
    { id: 'pickup', label: 'Pickup Exceptions', count: PICKUP_EXCEPTIONS.length, color: C.info },
    { id: 'warehouse', label: 'Warehouse Exceptions', count: WAREHOUSE_EXCEPTIONS.length, color: '#8b5cf6' },
    { id: 'delivery', label: 'Delivery Exceptions', count: DELIVERY_EXCEPTIONS.length, color: C.success },
  ]

  const activeTotal = tab === 'pickup' ? PICKUP_EXCEPTIONS.length : tab === 'warehouse' ? WAREHOUSE_EXCEPTIONS.length : DELIVERY_EXCEPTIONS.length

  return (
    <div style={{ background: C.bg, padding: 24, minHeight: '100%', fontFamily: FF.body }}>
      <div style={{ display: 'grid', gap: 24 }}>
        <section style={{ background: `linear-gradient(135deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.border}`, borderRadius: 24, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ maxWidth: 860 }}>
              <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }}>Britium Express</div>
              <h1 style={{ fontSize: 20, fontWeight: 700, textTransform: 'uppercase', color: C.gold, marginTop: 10, fontFamily: FF.body, letterSpacing: '0.08em' }}>Exception Master Design</h1>
              <p style={{ fontSize: 14, color: C.text2, lineHeight: 1.7, marginTop: 10 }}>
                Central exception catalogue for pickup, warehouse, and delivery workflows. Supabase record counts remain live while the interface has been redesigned for executive readability.
              </p>
            </div>
            <button onClick={loadRecords} style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.orange})`, color: '#082032', border: 'none', borderRadius: 14, padding: '12px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FF.body }}>
              Refresh Counts
            </button>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <KPICard label="Total Exception Records" value={recordsLoading ? '—' : totalCount} accent={C.gold} note="All rows currently loaded from exception_records" />
          <KPICard label="Pickup Exceptions" value={recordsLoading ? '—' : pickupCount} accent={C.info} note="Live pickup exception volume" />
          <KPICard label="Warehouse Exceptions" value={recordsLoading ? '—' : warehouseCount} accent="#8b5cf6" note="Warehouse issue record volume" />
          <KPICard label="Delivery Exceptions" value={recordsLoading ? '—' : deliveryCount} accent={C.success} note="Delivery issue record volume" />
        </section>

        <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, padding: 22 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={searchCode}
              onChange={e => setSearchCode(e.target.value)}
              placeholder="Search by code or name..."
              style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 14, padding: '12px 14px', width: 260, outline: 'none', fontSize: 14, fontFamily: FF.body }}
            />
            {(tab === 'pickup' || tab === 'delivery') && (
              <select
                value={filterSeverity}
                onChange={e => setFilterSeverity(e.target.value)}
                style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 14, padding: '12px 14px', outline: 'none', fontSize: 14, fontFamily: FF.body }}
              >
                <option value="">All Severities</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            )}
            <div style={{ marginLeft: 'auto', fontSize: 14, color: C.text2 }}>
              {filtered.length} of {activeTotal} codes shown
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
            {(TAB_LABELS ?? []).map(t => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setSearchCode(''); setFilterSeverity('') }}
                style={{
                  border: `1px solid ${tab === t.id ? t.color : C.border}`,
                  background: tab === t.id ? t.color + '14' : C.panel2,
                  color: tab === t.id ? t.color : C.text2,
                  borderRadius: 999,
                  padding: '10px 16px',
                  fontSize: 14,
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontFamily: FF.body,
                }}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>
        </section>

        <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, overflow: 'hidden' }}>
          <div style={{ padding: 24, borderBottom: `1px solid ${C.border}` }}>
            <SectionTitle eyebrow="Exception Matrix" title={tab === 'pickup' ? 'Pickup Exception Catalogue' : tab === 'warehouse' ? 'Warehouse Exception Catalogue' : 'Delivery Exception Catalogue'} description="Master exception definitions, mapped statuses, evidence requirements, next actions, and customer-facing messaging." />
          </div>
          <div style={{ overflowX: 'auto' }}>
            {tab === 'pickup' && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: C.panel2, borderBottom: `1px solid ${C.border}` }}>
                    {['Code', 'Exception Name', 'Mapped Status', 'Severity', 'Photo', 'Call Log', 'Reschedule', 'Next Action', 'Customer Message'].map(h => <th key={h} style={{ textAlign: 'left', padding: '14px 18px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.muted, letterSpacing: '0.12em' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(filtered as PickupException[] ?? []).map((ex, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '14px 18px', color: C.info, fontWeight: 700 }}>{ex.exception_code}</td>
                      <td style={{ padding: '14px 18px', minWidth: 190 }}><div style={{ color: C.text, fontSize: 14 }}>{ex.exception_name_en}</div><div style={{ color: C.text2, fontSize: 13, marginTop: 6 }}>{ex.exception_name_mm}</div></td>
                      <td style={{ padding: '14px 18px' }}><MappedStatusPill status={ex.mapped_status} /></td>
                      <td style={{ padding: '14px 18px' }}><SeverityBadge severity={ex.severity} /></td>
                      <td style={{ padding: '14px 18px' }}><IndicatorPill val={ex.require_photo} label="Photo" /></td>
                      <td style={{ padding: '14px 18px' }}><IndicatorPill val={ex.require_call_log} label="Call" /></td>
                      <td style={{ padding: '14px 18px' }}><IndicatorPill val={ex.allow_reschedule} label="Reschedule" /></td>
                      <td style={{ padding: '14px 18px', color: C.gold, fontWeight: 700 }}>{ex.next_action}</td>
                      <td style={{ padding: '14px 18px', minWidth: 280, color: C.text2, lineHeight: 1.6 }}>{ex.customer_message_en}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={9} style={{ padding: 36, textAlign: 'center', color: C.text2 }}>No exceptions match your filters.</td></tr>}
                </tbody>
              </table>
            )}

            {tab === 'warehouse' && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: C.panel2, borderBottom: `1px solid ${C.border}` }}>
                    {['Code', 'Exception Name', 'Mapped Status', 'Hold', 'Approval Required By', 'Next Action', 'Customer Message'].map(h => <th key={h} style={{ textAlign: 'left', padding: '14px 18px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.muted, letterSpacing: '0.12em' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(filtered as WarehouseException[] ?? []).map((ex, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '14px 18px', color: '#c084fc', fontWeight: 700 }}>{ex.exception_code}</td>
                      <td style={{ padding: '14px 18px', minWidth: 190 }}><div style={{ color: C.text, fontSize: 14 }}>{ex.exception_name_en}</div><div style={{ color: C.text2, fontSize: 13, marginTop: 6 }}>{ex.exception_name_mm}</div></td>
                      <td style={{ padding: '14px 18px' }}><MappedStatusPill status={ex.mapped_status} /></td>
                      <td style={{ padding: '14px 18px' }}><HoldPill val={ex.hold_shipment} /></td>
                      <td style={{ padding: '14px 18px', color: C.text }}>{ex.approval_required_by}</td>
                      <td style={{ padding: '14px 18px', color: C.gold, fontWeight: 700 }}>{ex.next_action}</td>
                      <td style={{ padding: '14px 18px', minWidth: 280, color: C.text2, lineHeight: 1.6 }}>{ex.customer_message_en}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={7} style={{ padding: 36, textAlign: 'center', color: C.text2 }}>No exceptions match your filters.</td></tr>}
                </tbody>
              </table>
            )}

            {tab === 'delivery' && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: C.panel2, borderBottom: `1px solid ${C.border}` }}>
                    {['Code', 'Exception Name', 'Mapped Status', 'Severity', 'Photo', 'Call Log', 'Reschedule', 'Next Action', 'Customer Message'].map(h => <th key={h} style={{ textAlign: 'left', padding: '14px 18px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.muted, letterSpacing: '0.12em' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(filtered as DeliveryException[] ?? []).map((ex, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '14px 18px', color: C.success, fontWeight: 700 }}>{ex.exception_code}</td>
                      <td style={{ padding: '14px 18px', minWidth: 190 }}><div style={{ color: C.text, fontSize: 14 }}>{ex.exception_name_en}</div><div style={{ color: C.text2, fontSize: 13, marginTop: 6 }}>{ex.exception_name_mm}</div></td>
                      <td style={{ padding: '14px 18px' }}><MappedStatusPill status={ex.mapped_status} /></td>
                      <td style={{ padding: '14px 18px' }}><SeverityBadge severity={ex.severity} /></td>
                      <td style={{ padding: '14px 18px' }}><IndicatorPill val={ex.require_photo} label="Photo" /></td>
                      <td style={{ padding: '14px 18px' }}><IndicatorPill val={ex.require_call_log} label="Call" /></td>
                      <td style={{ padding: '14px 18px' }}><IndicatorPill val={ex.allow_reschedule} label="Reschedule" /></td>
                      <td style={{ padding: '14px 18px', color: C.gold, fontWeight: 700 }}>{ex.next_action}</td>
                      <td style={{ padding: '14px 18px', minWidth: 280, color: C.text2, lineHeight: 1.6 }}>{ex.customer_message_en}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={9} style={{ padding: 36, textAlign: 'center', color: C.text2 }}>No exceptions match your filters.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, overflow: 'hidden' }}>
          <button
            onClick={() => setShowAudit(v => !v)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 22, background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <SectionTitle eyebrow="Validation" title="Audit Validation Fields" description={`Required logging fields for exception_records rows. ${AUDIT_FIELDS.length} validation fields defined.`} />
            <div style={{ fontSize: 20, color: C.gold }}>{showAudit ? '−' : '+'}</div>
          </button>
          {showAudit && (
            <div style={{ borderTop: `1px solid ${C.border}`, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: C.panel2, borderBottom: `1px solid ${C.border}` }}>
                    {['Field Name', 'Required', 'Notes'].map(h => <th key={h} style={{ textAlign: 'left', padding: '14px 18px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.muted, letterSpacing: '0.12em' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(AUDIT_FIELDS ?? []).map((f, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '14px 18px', color: C.info, fontWeight: 700 }}>{f.field}</td>
                      <td style={{ padding: '14px 18px' }}><span style={{ padding: '4px 10px', borderRadius: 999, background: f.required === 'YES' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)', color: f.required === 'YES' ? C.success : C.warning, border: `1px solid ${f.required === 'YES' ? 'rgba(34,197,94,0.22)' : 'rgba(245,158,11,0.22)'}`, fontSize: 11, fontWeight: 700 }}>{f.required}</span></td>
                      <td style={{ padding: '14px 18px', color: C.text2 }}>{f.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
