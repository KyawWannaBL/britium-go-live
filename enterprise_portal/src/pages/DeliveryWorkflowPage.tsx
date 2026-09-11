// @ts-nocheck
import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

type StatusGroup =
  | 'Pickup'
  | 'Warehouse'
  | 'In Transit'
  | 'Delivery'
  | 'Exception'
  | 'Return'

interface ProcessStatus {
  status_code: string
  status_name_en: string
  status_name_mm: string
  process_type: 'PICKUP' | 'WAREHOUSE' | 'DELIVERY' | 'RETURN'
  is_final: boolean
  is_exception: boolean
  status_group: StatusGroup
}

const PROCESS_STATUSES: ProcessStatus[] = [
  { status_code: 'PICKUP_REQUESTED', status_name_en: 'Pickup Requested', status_name_mm: 'ကောက်ယူမည်ဟုတောင်းဆို', process_type: 'PICKUP', is_final: false, is_exception: false, status_group: 'Pickup' },
  { status_code: 'PICKUP_ASSIGNED', status_name_en: 'Pickup Assigned', status_name_mm: 'ကောက်ယူသူသတ်မှတ်ပြီး', process_type: 'PICKUP', is_final: false, is_exception: false, status_group: 'Pickup' },
  { status_code: 'RIDER_EN_ROUTE_PICKUP', status_name_en: 'Rider En Route to Pickup', status_name_mm: 'ဆိုင်ကယ်စီးသူသွားနေသည်', process_type: 'PICKUP', is_final: false, is_exception: false, status_group: 'Pickup' },
  { status_code: 'ARRIVED_AT_PICKUP', status_name_en: 'Arrived at Pickup', status_name_mm: 'ကောက်ယူရာနေရာရောက်ပြီ', process_type: 'PICKUP', is_final: false, is_exception: false, status_group: 'Pickup' },
  { status_code: 'PICKUP_COMPLETED', status_name_en: 'Pickup Completed', status_name_mm: 'ကောက်ယူမှုပြီးဆုံး', process_type: 'PICKUP', is_final: false, is_exception: false, status_group: 'Pickup' },
  { status_code: 'PICKUP_FAILED', status_name_en: 'Pickup Failed', status_name_mm: 'ကောက်ယူမှုမအောင်မြင်', process_type: 'PICKUP', is_final: false, is_exception: true, status_group: 'Exception' },
  { status_code: 'PICKUP_RESCHEDULED', status_name_en: 'Pickup Rescheduled', status_name_mm: 'ကောက်ယူမှုနောက်ဆိုင်းပြောင်း', process_type: 'PICKUP', is_final: false, is_exception: true, status_group: 'Exception' },
  { status_code: 'PICKUP_CANCELLED', status_name_en: 'Pickup Cancelled', status_name_mm: 'ကောက်ယူမှုဖျက်သိမ်း', process_type: 'PICKUP', is_final: true, is_exception: true, status_group: 'Exception' },
  { status_code: 'RECEIVED_AT_ORIGIN', status_name_en: 'Received at Origin', status_name_mm: 'မူလဂိုဒေါင်ရောက်ပြီ', process_type: 'WAREHOUSE', is_final: false, is_exception: false, status_group: 'Warehouse' },
  { status_code: 'SORTING', status_name_en: 'Sorting', status_name_mm: 'စီစစ်နေဆဲ', process_type: 'WAREHOUSE', is_final: false, is_exception: false, status_group: 'Warehouse' },
  { status_code: 'READY_FOR_DISPATCH', status_name_en: 'Ready for Dispatch', status_name_mm: 'ပေးပို့ရန်အဆင်သင့်', process_type: 'WAREHOUSE', is_final: false, is_exception: false, status_group: 'Warehouse' },
  { status_code: 'IN_TRANSIT_TO_HUB', status_name_en: 'In Transit to Hub', status_name_mm: 'ဟပ်ဆီသို့သွားနေဆဲ', process_type: 'WAREHOUSE', is_final: false, is_exception: false, status_group: 'In Transit' },
  { status_code: 'RECEIVED_AT_DESTINATION', status_name_en: 'Received at Destination', status_name_mm: 'ဦးတည်ရာဂိုဒေါင်ရောက်ပြီ', process_type: 'WAREHOUSE', is_final: false, is_exception: false, status_group: 'Warehouse' },
  { status_code: 'WAREHOUSE_HOLD', status_name_en: 'Warehouse Hold', status_name_mm: 'ဂိုဒေါင်တွင်ဆိုင်းထားသည်', process_type: 'WAREHOUSE', is_final: false, is_exception: true, status_group: 'Exception' },
  { status_code: 'DAMAGED', status_name_en: 'Damaged', status_name_mm: 'ပစ္စည်းပျက်စီး', process_type: 'WAREHOUSE', is_final: false, is_exception: true, status_group: 'Exception' },
  { status_code: 'LOST', status_name_en: 'Lost', status_name_mm: 'ပစ္စည်းပျောက်ဆုံး', process_type: 'WAREHOUSE', is_final: true, is_exception: true, status_group: 'Exception' },
  { status_code: 'READY_FOR_DELIVERY', status_name_en: 'Ready for Delivery', status_name_mm: 'ပို့ဆောင်ရန်အဆင်သင့်', process_type: 'DELIVERY', is_final: false, is_exception: false, status_group: 'Delivery' },
  { status_code: 'DELIVERY_ASSIGNED', status_name_en: 'Delivery Assigned', status_name_mm: 'ပို့ဆောင်သူသတ်မှတ်ပြီး', process_type: 'DELIVERY', is_final: false, is_exception: false, status_group: 'Delivery' },
  { status_code: 'OUT_FOR_DELIVERY', status_name_en: 'Out for Delivery', status_name_mm: 'ပို့ဆောင်နေဆဲ', process_type: 'DELIVERY', is_final: false, is_exception: false, status_group: 'Delivery' },
  { status_code: 'DELIVERY_ATTEMPTED', status_name_en: 'Delivery Attempted', status_name_mm: 'ပို့ဆောင်ကြိုးပမ်းမှု', process_type: 'DELIVERY', is_final: false, is_exception: true, status_group: 'Exception' },
  { status_code: 'DELIVERED', status_name_en: 'Delivered', status_name_mm: 'ပို့ဆောင်ပြီးဆုံး', process_type: 'DELIVERY', is_final: true, is_exception: false, status_group: 'Delivery' },
  { status_code: 'DELIVERY_FAILED', status_name_en: 'Delivery Failed', status_name_mm: 'ပို့ဆောင်မှုမအောင်မြင်', process_type: 'DELIVERY', is_final: false, is_exception: true, status_group: 'Exception' },
  { status_code: 'DELIVERY_RESCHEDULED', status_name_en: 'Delivery Rescheduled', status_name_mm: 'ပို့ဆောင်မှုနောက်ဆိုင်းပြောင်း', process_type: 'DELIVERY', is_final: false, is_exception: true, status_group: 'Exception' },
  { status_code: 'RTO_INITIATED', status_name_en: 'RTO Initiated', status_name_mm: 'မူရင်းပြန်ပေးပို့မည်', process_type: 'RETURN', is_final: false, is_exception: false, status_group: 'Return' },
  { status_code: 'RETURNED_TO_SENDER', status_name_en: 'Returned to Sender', status_name_mm: 'ပေးပို့သူထံပြန်ရောက်ပြီ', process_type: 'RETURN', is_final: true, is_exception: false, status_group: 'Return' },
]

interface ColumnDef {
  id: 'PICKUP' | 'WAREHOUSE' | 'DELIVERY' | 'RETURN'
  label: string
  color: string
  icon: string
}

const COLUMNS: ColumnDef[] = [
  { id: 'PICKUP', label: 'Pickup', color: C.info, icon: 'P' },
  { id: 'WAREHOUSE', label: 'Warehouse', color: '#8b5cf6', icon: 'W' },
  { id: 'DELIVERY', label: 'Delivery', color: C.success, icon: 'D' },
  { id: 'RETURN', label: 'Return', color: C.gold, icon: 'R' },
]

const FLOW_STEPS: Record<string, string[]> = {
  PICKUP: ['PICKUP_REQUESTED', 'PICKUP_ASSIGNED', 'RIDER_EN_ROUTE_PICKUP', 'ARRIVED_AT_PICKUP', 'PICKUP_COMPLETED'],
  WAREHOUSE: ['RECEIVED_AT_ORIGIN', 'SORTING', 'READY_FOR_DISPATCH', 'IN_TRANSIT_TO_HUB', 'RECEIVED_AT_DESTINATION'],
  DELIVERY: ['READY_FOR_DELIVERY', 'DELIVERY_ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERY_ATTEMPTED', 'DELIVERED'],
  RETURN: ['RTO_INITIATED', 'RETURNED_TO_SENDER'],
}

const getGroupTone = (group: StatusGroup) => {
  const map: Record<StatusGroup, { bg: string; color: string; border: string }> = {
    Pickup: { bg: 'rgba(56,189,248,0.12)', color: C.info, border: 'rgba(56,189,248,0.28)' },
    Warehouse: { bg: 'rgba(168,85,247,0.12)', color: '#c084fc', border: 'rgba(192,132,252,0.24)' },
    'In Transit': { bg: 'rgba(34,197,94,0.12)', color: '#86efac', border: 'rgba(34,197,94,0.24)' },
    Delivery: { bg: 'rgba(246,184,75,0.12)', color: C.gold, border: 'rgba(246,184,75,0.24)' },
    Exception: { bg: 'rgba(255,79,134,0.12)', color: C.error, border: 'rgba(255,79,134,0.24)' },
    Return: { bg: 'rgba(255,138,76,0.12)', color: C.orange, border: 'rgba(255,138,76,0.24)' },
  }
  return map[group] ?? map.Pickup
}

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: FF.body, fontWeight: 700 }}>{eyebrow}</div>
      <h2 style={{ fontFamily: FF.sub, fontSize: 18, fontWeight: 600, color: C.text, marginTop: 8 }}>{title}</h2>
      <p style={{ fontSize: 14, color: C.text2, marginTop: 6, lineHeight: 1.6 }}>{description}</p>
    </div>
  )
}

function StatusGroupChip({ group }: { group: StatusGroup }) {
  const tone = getGroupTone(group)
  return (
    <span style={{ padding: '4px 10px', borderRadius: 999, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, fontSize: 11, fontWeight: 700, fontFamily: FF.body, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
      {group}
    </span>
  )
}

function FlowIndicator({ steps, col, liveCountMap, loading }: { steps: string[]; col: ColumnDef; liveCountMap: Record<string, number>; loading: boolean }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {(steps ?? []).map((code, i) => {
        const cnt = liveCountMap[code] ?? 0
        return (
          <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ minWidth: 148, borderRadius: 14, padding: '12px 14px', border: `1px solid ${cnt > 0 ? col.color + '55' : C.border}`, background: cnt > 0 ? col.color + '12' : C.panel2 }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: FF.body }}>{code.replace(/_/g, ' ')}</div>
              <div style={{ marginTop: 6, fontSize: 14, color: loading ? C.text2 : cnt > 0 ? C.gold : C.text2, fontWeight: 600, fontFamily: FF.sub }}>
                {loading ? 'Loading...' : `${cnt} live`}
              </div>
            </div>
            {i < steps.length - 1 && <div style={{ color: col.color, fontSize: 20, lineHeight: 1 }}>→</div>}
          </div>
        )
      })}
    </div>
  )
}

function KPICard({ label, value, accent, note }: { label: string; value: string | number; accent: string; note: string }) {
  return (
    <div style={{ background: `linear-gradient(180deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.border}`, borderTop: `2px solid ${accent}`, borderRadius: 18, padding: 18, boxShadow: '0 12px 30px rgba(0,0,0,0.24)' }}>
      <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, fontFamily: FF.body }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: C.gold, fontFamily: FF.body, marginTop: 10 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.text2, marginTop: 8, fontFamily: FF.body }}>{note}</div>
    </div>
  )
}

function StatusCard({ s, col, count, loading }: { s: ProcessStatus; col: ColumnDef; count: number; loading: boolean }) {
  const tone = s.is_exception ? { bg: 'rgba(255,79,134,0.08)', border: 'rgba(255,79,134,0.24)', text: C.error } : { bg: C.panel2, border: C.border, text: col.color }
  return (
    <div style={{ background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, transition: 'all .2s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ display: 'inline-flex', width: 'fit-content', padding: '5px 10px', borderRadius: 999, background: col.color + '16', color: col.color, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: FF.body }}>{s.status_code}</span>
          <StatusGroupChip group={s.status_group} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          {s.is_final && <span style={{ padding: '4px 10px', borderRadius: 999, background: s.is_exception ? 'rgba(255,79,134,0.12)' : 'rgba(34,197,94,0.12)', color: s.is_exception ? C.error : C.success, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', fontFamily: FF.body }}>Final</span>}
          <span style={{ fontSize: 18, fontWeight: 700, color: loading ? C.text2 : count > 0 ? C.gold : C.text2, fontFamily: FF.body }}>{loading ? '—' : count}</span>
        </div>
      </div>
      <div>
        <div style={{ fontFamily: FF.sub, fontSize: 18, fontWeight: 600, color: C.text }}>{s.status_name_en}</div>
        <div style={{ fontSize: 14, color: C.text2, marginTop: 6, lineHeight: 1.5, fontFamily: FF.body }}>{s.status_name_mm}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: C.muted, fontFamily: FF.body }}>
        <span>{s.process_type}</span>
        <span style={{ color: tone.text }}>{s.is_exception ? 'Exception path' : 'Standard path'}</span>
      </div>
    </div>
  )
}

export default function DeliveryWorkflowPage() {
  const [cargoEvents, setCargoEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('be_portal_cargo_events')
        .select('status, process_type')
      setCargoEvents(data ?? [])
    } catch (_) {
      setCargoEvents([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const liveCountMap: Record<string, number> = {}
  ;(cargoEvents ?? []).forEach(ev => {
    const s = String(ev.status ?? '').toUpperCase()
    liveCountMap[s] = (liveCountMap[s] ?? 0) + 1
  })

  const totalEvents = (cargoEvents ?? []).length
  const pickupEvents = (cargoEvents ?? []).filter(e => String(e.process_type ?? '').toUpperCase() === 'PICKUP').length
  const warehouseEvents = (cargoEvents ?? []).filter(e => String(e.process_type ?? '').toUpperCase() === 'WAREHOUSE').length
  const deliveryEvents = (cargoEvents ?? []).filter(e => String(e.process_type ?? '').toUpperCase() === 'DELIVERY').length
  const returnEvents = (cargoEvents ?? []).filter(e => String(e.process_type ?? '').toUpperCase() === 'RETURN').length
  const exceptionStatuses = PROCESS_STATUSES.filter(s => s.is_exception)
  const exceptionCount = exceptionStatuses.reduce((sum, s) => sum + (liveCountMap[s.status_code] ?? 0), 0)

  return (
    <div style={{ background: C.bg, padding: 24, minHeight: '100%', fontFamily: FF.body }}>
      <div style={{ display: 'grid', gap: 24 }}>
        <section style={{ background: `linear-gradient(135deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.border}`, borderRadius: 24, padding: 24, boxShadow: '0 20px 45px rgba(0,0,0,0.28)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ maxWidth: 860 }}>
              <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }}>Britium Express</div>
              <h1 style={{ fontSize: 20, fontWeight: 700, textTransform: 'uppercase', color: C.gold, marginTop: 10, fontFamily: FF.body, letterSpacing: '0.08em' }}>Delivery Workflow Command Design</h1>
              <p style={{ fontSize: 14, color: C.text2, lineHeight: 1.7, marginTop: 10 }}>
                Full process status reference across pickup, warehouse, delivery, and return. Live counters are preserved from Supabase and mapped directly to each operational stage.
              </p>
            </div>
            <button onClick={load} style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.orange})`, color: '#082032', border: 'none', borderRadius: 14, padding: '12px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FF.body }}>
              Refresh Live Counts
            </button>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 }}>
          <KPICard label="Total Events" value={loading ? '—' : totalEvents} accent={C.gold} note="All event rows loaded from cargo status stream" />
          <KPICard label="Pickup Events" value={loading ? '—' : pickupEvents} accent={C.info} note="Pickup process activity currently logged" />
          <KPICard label="Warehouse Events" value={loading ? '—' : warehouseEvents} accent="#8b5cf6" note="Warehouse movement and handling stages" />
          <KPICard label="Delivery Events" value={loading ? '—' : deliveryEvents} accent={C.success} note="Delivery execution and completion states" />
          <KPICard label="Return Events" value={loading ? '—' : returnEvents} accent={C.orange} note="Return-to-origin and sender return volume" />
          <KPICard label="Exceptions" value={loading ? '—' : exceptionCount} accent={C.error} note="Statuses flagged as exception workflows" />
        </section>

        <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, padding: 24 }}>
          <SectionTitle eyebrow="Process Flow" title="Normal Path Sequence" description="Each lane below shows the expected step order for the operational workflow, with live event counts overlaid per step." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, marginTop: 20 }}>
            {(COLUMNS ?? []).map(col => (
              <div key={col.id} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 20, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: col.color + '18', color: col.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{col.icon}</div>
                  <div>
                    <h2 style={{ fontFamily: FF.sub, fontSize: 18, fontWeight: 600, color: C.text }}>{col.label} Flow</h2>
                    <div style={{ fontSize: 12, color: C.muted }}>Primary standard routing sequence</div>
                  </div>
                </div>
                <FlowIndicator steps={FLOW_STEPS[col.id] ?? []} col={col} liveCountMap={liveCountMap} loading={loading} />
              </div>
            ))}
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {(COLUMNS ?? []).map(col => {
            const statuses = PROCESS_STATUSES.filter(s => s.process_type === col.id)
            const colTotal = statuses.reduce((sum, s) => sum + (liveCountMap[s.status_code] ?? 0), 0)
            return (
              <div key={col.id} style={{ background: `linear-gradient(180deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.border}`, borderRadius: 24, overflow: 'hidden' }}>
                <div style={{ padding: 20, borderBottom: `1px solid ${C.border}`, background: col.color + '10', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}>{col.id}</div>
                    <h2 style={{ fontFamily: FF.sub, fontSize: 18, fontWeight: 600, color: C.text, marginTop: 6 }}>{col.label} Status Cards</h2>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: C.gold }}>{loading ? '—' : colTotal}</div>
                    <div style={{ fontSize: 12, color: C.text2 }}>{statuses.length} master statuses</div>
                  </div>
                </div>
                <div style={{ padding: 18, display: 'grid', gap: 14, maxHeight: 920, overflowY: 'auto' }}>
                  {(statuses ?? []).map(s => (
                    <StatusCard key={s.status_code} s={s} col={col} count={liveCountMap[s.status_code] ?? 0} loading={loading} />
                  ))}
                </div>
              </div>
            )
          })}
        </section>

        <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, overflow: 'hidden' }}>
          <div style={{ padding: 24, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <SectionTitle eyebrow="Reference Matrix" title="Complete Status Master Table" description={`All ${PROCESS_STATUSES.length} statuses remain available with live count visibility and process classification.`} />
            <div style={{ padding: '10px 14px', borderRadius: 14, border: `1px solid ${C.border}`, background: C.panel2, color: C.text2, fontSize: 13 }}>
              {loading ? 'Loading live events...' : `${totalEvents} live events loaded`}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.panel2, borderBottom: `1px solid ${C.border}` }}>
                  {['Status Code', 'Name EN', 'Name MM', 'Process Type', 'Group', 'Final', 'Exception', 'Live Count'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '14px 18px', fontSize: 11, fontFamily: FF.body, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.muted }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(PROCESS_STATUSES ?? []).map((s, i) => {
                  const col = COLUMNS.find(c => c.id === s.process_type) ?? COLUMNS[0]
                  const cnt = liveCountMap[s.status_code] ?? 0
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: s.is_exception ? 'rgba(255,79,134,0.04)' : 'transparent' }}>
                      <td style={{ padding: '14px 18px' }}><span style={{ padding: '5px 10px', borderRadius: 999, background: col.color + '16', color: col.color, fontSize: 11, fontWeight: 700 }}>{s.status_code}</span></td>
                      <td style={{ padding: '14px 18px', fontSize: 14, color: C.text }}>{s.status_name_en}</td>
                      <td style={{ padding: '14px 18px', fontSize: 14, color: C.text2 }}>{s.status_name_mm}</td>
                      <td style={{ padding: '14px 18px', fontSize: 14, color: col.color, fontWeight: 700 }}>{s.process_type}</td>
                      <td style={{ padding: '14px 18px' }}><StatusGroupChip group={s.status_group} /></td>
                      <td style={{ padding: '14px 18px', fontSize: 14, color: s.is_final ? C.success : C.text2 }}>{s.is_final ? 'YES' : '—'}</td>
                      <td style={{ padding: '14px 18px', fontSize: 14, color: s.is_exception ? C.error : C.text2 }}>{s.is_exception ? 'YES' : '—'}</td>
                      <td style={{ padding: '14px 18px', fontSize: 14, color: cnt > 0 ? C.gold : C.text2, fontWeight: 700 }}>{loading ? '—' : cnt}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
