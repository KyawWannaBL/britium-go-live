import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Loader2,
  Map,
  MapPin,
  Navigation,
  PackageCheck,
  Radio,
  RefreshCw,
  Route,
  Send,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  WalletCards,
  X,
} from 'lucide-react'

// --- GO-LIVE IMPORT ---
// In production, remove the preview stub below and uncomment your real client:
// import { supabase } from '@/integrations/supabase/client'
// -----------------------------------------------------------------------

// --- PREVIEW ENVIRONMENT STUBS ---
// These stubs keep the page compilable in the isolated UI sandbox while preserving
// the production-ready Supabase call shape used by the operational actions below.
type SupabaseResult<T> = { data: T[] | null; error: Error | null }
type SupabaseSingleResult<T> = { data: T | null; error: Error | null }

type RealtimeChannel = {
  on: (event: string, filter: Record<string, unknown>, callback: () => void) => RealtimeChannel
  subscribe: (callback?: (status: string) => void) => RealtimeChannel
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const emptyList = async <T,>(): Promise<SupabaseResult<T>> => {
  await delay(450)
  return { data: [], error: null }
}

const emptySingle = async <T,>(payload: T): Promise<SupabaseSingleResult<T>> => {
  await delay(250)
  return { data: payload, error: null }
}

const supabase = {
  from: (_table: string) => ({
    select: (_columns = '*') => ({
      order: (_column: string, _opts?: { ascending?: boolean }) => ({
        limit: <T,>(_count: number) => emptyList<T>(),
      }),
      eq: (_column: string, _value: unknown) => ({
        limit: <T,>(_count: number) => emptyList<T>(),
      }),
    }),
    update: <T extends Record<string, unknown>>(payload: T) => ({
      eq: (_column: string, _value: unknown) => ({
        select: (_columns = '*') => ({
          single: () => emptySingle(payload),
        }),
      }),
    }),
    insert: <T,>(payload: T) => ({
      select: (_columns = '*') => ({
        single: () => emptySingle(payload),
      }),
    }),
  }),
  channel: (_name: string): RealtimeChannel => {
    const channel: RealtimeChannel = {
      on: () => channel,
      subscribe: callback => {
        callback?.('SUBSCRIBED')
        return channel
      },
    }
    return channel
  },
  removeChannel: (_channel: RealtimeChannel) => undefined,
}
// ---------------------------------

const C = {
  bg: '#061524',
  panel: '#0b2236',
  panel2: '#081b2e',
  panelHover: '#0f2a42',
  border: '#1a3a5c',
  gold: '#f6b84b',
  orange: '#ff8a4c',
  text: '#eef8ff',
  text2: '#c8dff0',
  muted: '#4d7a9b',
  success: '#22c55e',
  error: '#ff4f86',
  warning: '#f59e0b',
  info: '#38bdf8',
}
const FF = { body: "'Poppins',Inter,system-ui,sans-serif", sub: "'Helvetica Neue',Helvetica,Arial,sans-serif" }

const USE_PREVIEW_SEED_WHEN_EMPTY = true

type Language = 'EN' | 'MM'
type WorkflowStatus =
  | 'SUBMITTED'
  | 'PENDING_PICKUP'
  | 'PICKED_UP'
  | 'READY_FOR_WAYPLAN'
  | 'DRAFT'
  | 'CONFIRMED'
  | 'DELIVERY_ASSIGNED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED_ATTEMPT'
  | 'EXCEPTION'
  | 'RETURNED'

type NotificationScope = 'pickup' | 'dropoff' | 'way' | 'cod'
type NotificationTone = 'info' | 'success' | 'warning' | 'error'
type WayEventStatus = 'SUCCESS' | 'WAYFAIL' | 'COD_PENDING' | 'COD_SETTLED'

interface PickupRequest {
  id: string
  pickup_id: string
  merchant_name: string
  pickup_township: string
  pickup_address: string
  status: WorkflowStatus
  parcel_count: number
  assigned_rider_code?: string | null
  assigned_rider_name?: string | null
  created_at: string
}

interface Wayplan {
  id: string
  wayplan_id: string
  wayplan_no: string
  branch_code: string
  delivery_zone: string
  status: WorkflowStatus
  planned_delivery_date: string
  assigned_rider_code?: string | null
  assigned_rider_name?: string | null
  total_stops: number
  success_count: number
  fail_count: number
  cod_amount: number
  cod_collected: number
  route_condition: 'Clear' | 'Traffic' | 'Rain' | 'Delayed'
  current_condition: string
  last_lat?: number
  last_lng?: number
}

interface Worker {
  worker_code: string
  worker_type: string
  display_name: string
  phone: string
  branch_code: string
  status: string
  zone: string
  current_task_count: number
  raw?: Record<string, unknown>
}

interface OpsNotification {
  id: string
  scope: NotificationScope
  title: string
  message: string
  tone: NotificationTone
  ref?: string
  created_at: string
}

interface WayEvent {
  id: string
  wayplan_no: string
  status: WayEventStatus
  reason?: string
  cod_amount: number
  rider_name: string
  updated_at: string
}

interface KpiProps {
  label: string
  value: ReactNode
  note?: string
  accent?: string
}

interface SectionTitleProps {
  title: string
  subtitle?: string
  right?: ReactNode
}

interface SelectFieldProps {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

const nowIso = () => new Date().toISOString()

const MOCK_PICKUPS: PickupRequest[] = [
  {
    id: 'pu-001',
    pickup_id: 'P0611-BRV-001',
    merchant_name: 'Britium Ventures',
    pickup_township: 'Bahan',
    pickup_address: 'No. 21, Kabar Aye Pagoda Road, Bahan',
    status: 'SUBMITTED',
    parcel_count: 4,
    created_at: nowIso(),
  },
  {
    id: 'pu-002',
    pickup_id: 'P0611-MSY-002',
    merchant_name: 'Mega Store Yangon',
    pickup_township: 'Sanchaung',
    pickup_address: 'Pyay Road, Sanchaung',
    status: 'PENDING_PICKUP',
    parcel_count: 2,
    assigned_rider_code: 'R-YGN-002',
    assigned_rider_name: 'Aung Min',
    created_at: nowIso(),
  },
  {
    id: 'pu-003',
    pickup_id: 'P0611-FHB-003',
    merchant_name: 'Fashion Hub',
    pickup_township: 'Yankin',
    pickup_address: 'Yankin Center Area',
    status: 'READY_FOR_WAYPLAN',
    parcel_count: 7,
    created_at: nowIso(),
  },
]

const MOCK_WAYPLANS: Wayplan[] = [
  {
    id: 'wp-001',
    wayplan_id: 'wp-001',
    wayplan_no: 'WP-YGN-0611-001',
    branch_code: 'YGN',
    delivery_zone: 'Bahan / Yankin',
    status: 'CONFIRMED',
    planned_delivery_date: nowIso(),
    total_stops: 18,
    success_count: 10,
    fail_count: 1,
    cod_amount: 865000,
    cod_collected: 520000,
    route_condition: 'Traffic',
    current_condition: 'Rider is moving toward stop 12. Moderate traffic near Kabar Aye.',
    assigned_rider_code: 'R-YGN-001',
    assigned_rider_name: 'Myo Thant',
    last_lat: 16.8409,
    last_lng: 96.1735,
  },
  {
    id: 'wp-002',
    wayplan_id: 'wp-002',
    wayplan_no: 'WP-YGN-0611-002',
    branch_code: 'YGN',
    delivery_zone: 'Sanchaung / Kamayut',
    status: 'DRAFT',
    planned_delivery_date: nowIso(),
    total_stops: 14,
    success_count: 0,
    fail_count: 0,
    cod_amount: 430000,
    cod_collected: 0,
    route_condition: 'Clear',
    current_condition: 'Draft route ready for supervisor assignment.',
  },
]

const MOCK_WORKERS: Worker[] = [
  { worker_code: 'R-YGN-001', worker_type: 'Rider', display_name: 'Myo Thant', phone: '+95 9 111 222 333', branch_code: 'YGN', status: 'active', zone: 'Bahan', current_task_count: 9 },
  { worker_code: 'R-YGN-002', worker_type: 'Rider', display_name: 'Aung Min', phone: '+95 9 222 333 444', branch_code: 'YGN', status: 'active', zone: 'Sanchaung', current_task_count: 6 },
  { worker_code: 'D-YGN-001', worker_type: 'Driver', display_name: 'Kyaw Zin', phone: '+95 9 333 444 555', branch_code: 'YGN', status: 'active', zone: 'Yankin', current_task_count: 4 },
]

const MOCK_NOTIFICATIONS: OpsNotification[] = [
  { id: 'n-001', scope: 'pickup', title: 'Pickup waiting', message: 'P0611-BRV-001 needs rider assignment for Bahan.', tone: 'warning', ref: 'P0611-BRV-001', created_at: nowIso() },
  { id: 'n-002', scope: 'dropoff', title: 'Draft wayplan ready', message: 'WP-YGN-0611-002 is ready for drop-off rider assignment.', tone: 'info', ref: 'WP-YGN-0611-002', created_at: nowIso() },
  { id: 'n-003', scope: 'cod', title: 'COD pending', message: 'WP-YGN-0611-001 has 345,000 MMK COD still pending.', tone: 'warning', ref: 'WP-YGN-0611-001', created_at: nowIso() },
]

const MOCK_WAY_EVENTS: WayEvent[] = [
  { id: 'we-001', wayplan_no: 'WP-YGN-0611-001', status: 'SUCCESS', cod_amount: 120000, rider_name: 'Myo Thant', updated_at: nowIso() },
  { id: 'we-002', wayplan_no: 'WP-YGN-0611-001', status: 'WAYFAIL', reason: 'Customer phone unreachable', cod_amount: 0, rider_name: 'Myo Thant', updated_at: nowIso() },
  { id: 'we-003', wayplan_no: 'WP-YGN-0611-001', status: 'COD_PENDING', reason: 'Cash collection not yet settled with branch cashier', cod_amount: 345000, rider_name: 'Myo Thant', updated_at: nowIso() },
]

function text(v: unknown, fallback = '—') {
  return v === null || v === undefined || v === '' ? fallback : String(v)
}

function num(v: unknown, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function formatDate(v: unknown) {
  if (!v) return '—'
  const d = new Date(String(v))
  if (Number.isNaN(d.getTime())) return text(v)
  return d.toLocaleString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function statusBadge(status: unknown): React.CSSProperties {
  const s = text(status, '').toUpperCase()
  const map: Record<string, [string, string]> = {
    SUBMITTED: [C.warning, '#451a03'],
    PENDING_PICKUP: [C.gold, '#3b2503'],
    PICKED_UP: [C.info, '#082f49'],
    READY_FOR_WAYPLAN: [C.success, '#052e16'],
    DRAFT: [C.warning, '#451a03'],
    CONFIRMED: [C.success, '#052e16'],
    DELIVERY_ASSIGNED: [C.info, '#082f49'],
    OUT_FOR_DELIVERY: [C.info, '#082f49'],
    DELIVERED: [C.success, '#052e16'],
    FAILED_ATTEMPT: [C.error, '#4a0521'],
    RETURNED: [C.error, '#4a0521'],
    EXCEPTION: [C.error, '#4a0521'],
    ACTIVE: [C.success, '#052e16'],
  }
  const [color, bg] = map[s] ?? [C.text2, C.panel2]
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    background: bg,
    color,
    border: `1px solid ${C.border}`,
    whiteSpace: 'nowrap',
  }
}

function root(): React.CSSProperties {
  return { minHeight: '100%', background: C.bg, color: C.text, padding: 24, fontFamily: FF.body }
}

function panel(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: `linear-gradient(180deg, ${C.panel}, ${C.panel2})`,
    border: `1px solid ${C.border}`,
    borderRadius: 20,
    boxShadow: '0 18px 40px rgba(0,0,0,.20)',
    ...extra,
  }
}

function button(primary = false, disabled = false): React.CSSProperties {
  return {
    minHeight: 42,
    borderRadius: 12,
    border: `1px solid ${primary ? C.gold : C.border}`,
    background: primary ? 'rgba(246,184,75,.15)' : C.panel2,
    color: primary ? C.gold : C.text2,
    padding: '0 14px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.62 : 1,
    fontWeight: 700,
    fontFamily: FF.body,
    transition: 'all 0.2s ease-in-out',
  }
}

function fieldStyle(): React.CSSProperties {
  return {
    width: '100%',
    minHeight: 42,
    background: C.panel2,
    border: `1px solid ${C.border}`,
    color: C.text,
    borderRadius: 12,
    padding: '0 12px',
    fontSize: 13,
    fontFamily: FF.body,
    outline: 'none',
  }
}

function Kpi({ label, value, note, accent = C.gold }: KpiProps) {
  return (
    <div style={panel({ padding: 16, borderTop: `2px solid ${accent}` })}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 26, color: accent, fontWeight: 800 }}>{value}</div>
      {note ? <div style={{ marginTop: 4, fontSize: 12, color: C.text2 }}>{note}</div> : null}
    </div>
  )
}

function normalizeWorker(row: Record<string, unknown>): Worker {
  return {
    worker_code: text(row.workforce_code || row.worker_id || row.rider_id || row.driver_id || row.code, ''),
    worker_type: text(row.workforce_type || row.role || row.role_type || row.type, 'Rider'),
    display_name: text(row.display_name || row.full_name || row.rider_name || row.driver_name || row.name, ''),
    phone: text(row.phone_e164 || row.phone_number || row.phone_primary || row.phone, ''),
    branch_code: text(row.branch_code, 'YGN'),
    status: text(row.status, 'active'),
    zone: text(row.assigned_zone || row.zone || row.township, ''),
    current_task_count: num(row.current_task_count, 0),
    raw: row,
  }
}

function normalizePickup(row: Record<string, unknown>): PickupRequest {
  return {
    id: text(row.id || row.pickup_id || crypto.randomUUID(), crypto.randomUUID()),
    pickup_id: text(row.pickup_id || row.workflow_id || row.id),
    merchant_name: text(row.merchant_name || row.customer_name),
    pickup_township: text(row.pickup_township || row.township, ''),
    pickup_address: text(row.pickup_address || row.address, ''),
    status: text(row.status, 'SUBMITTED').toUpperCase() as WorkflowStatus,
    parcel_count: num(row.parcel_count, 1),
    assigned_rider_code: row.assigned_rider_code ? text(row.assigned_rider_code) : null,
    assigned_rider_name: row.assigned_rider_name ? text(row.assigned_rider_name) : null,
    created_at: text(row.created_at, nowIso()),
  }
}

function normalizeWayplan(row: Record<string, unknown>): Wayplan {
  return {
    id: text(row.id || row.wayplan_id || row.wayplan_no || crypto.randomUUID(), crypto.randomUUID()),
    wayplan_id: text(row.wayplan_id || row.id || row.wayplan_no),
    wayplan_no: text(row.wayplan_no || row.wayplan_id || row.id),
    branch_code: text(row.branch_code, 'YGN'),
    delivery_zone: text(row.delivery_zone || row.zone || row.township, ''),
    status: text(row.status, 'DRAFT').toUpperCase() as WorkflowStatus,
    planned_delivery_date: text(row.planned_delivery_date || row.created_at, nowIso()),
    assigned_rider_code: row.assigned_rider_code ? text(row.assigned_rider_code) : null,
    assigned_rider_name: row.assigned_rider_name ? text(row.assigned_rider_name) : null,
    total_stops: num(row.total_stops || row.stop_count, 0),
    success_count: num(row.success_count, 0),
    fail_count: num(row.fail_count, 0),
    cod_amount: num(row.cod_amount || row.cod_total, 0),
    cod_collected: num(row.cod_collected, 0),
    route_condition: text(row.route_condition, 'Clear') as Wayplan['route_condition'],
    current_condition: text(row.current_condition, 'Waiting for live rider telemetry.'),
    last_lat: row.last_lat === undefined ? undefined : num(row.last_lat),
    last_lng: row.last_lng === undefined ? undefined : num(row.last_lng),
  }
}

function SectionTitle({ title, subtitle, right }: SectionTitleProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start', marginBottom: 16 }}>
      <div>
        <h2 style={{ margin: 0, color: C.text, fontSize: 18, fontWeight: 800 }}>{title}</h2>
        {subtitle ? <p style={{ margin: '6px 0 0', color: C.text2, fontSize: 13, lineHeight: 1.5 }}>{subtitle}</p> : null}
      </div>
      {right}
    </div>
  )
}

function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800, marginBottom: 6 }}>{label}</div>
      <select value={value} onChange={event => onChange(event.target.value)} style={fieldStyle()}>
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  )
}

function toneStyle(tone: NotificationTone): { color: string; bg: string; icon: ReactNode } {
  if (tone === 'success') return { color: C.success, bg: '#052e16', icon: <CheckCircle2 size={14} /> }
  if (tone === 'warning') return { color: C.warning, bg: '#451a03', icon: <AlertTriangle size={14} /> }
  if (tone === 'error') return { color: C.error, bg: '#4a0521', icon: <AlertTriangle size={14} /> }
  return { color: C.info, bg: '#082f49', icon: <Bell size={14} /> }
}

function NotificationList({ title, items, emptyText }: { title: string; items: OpsNotification[]; emptyText: string }) {
  return (
    <div style={panel({ padding: 14, height: '100%' })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Bell size={15} color={C.gold} />
        <strong style={{ fontSize: 14 }}>{title}</strong>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {items.slice(0, 6).map(item => {
          const s = toneStyle(item.tone)
          return (
            <div key={item.id} style={{ background: s.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: s.color, fontSize: 12, fontWeight: 800 }}>
                {s.icon}
                <span>{item.title}</span>
              </div>
              <div style={{ color: C.text2, fontSize: 12, lineHeight: 1.45, marginTop: 6 }}>{item.message}</div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>{formatDate(item.created_at)}</div>
            </div>
          )
        })}
        {!items.length ? <div style={{ color: C.text2, fontSize: 13 }}>{emptyText}</div> : null}
      </div>
    </div>
  )
}

const TRANSLATIONS = {
  EN: {
    supPortal: 'Supervisor Portal',
    title: 'Operational Assignment & Wayplan Control',
    subtitle: 'Assign pickup riders, assign drop-off riders, monitor live ways, track failures, and follow COD settlement from one supervisor console.',
    refresh: 'Refresh',
    aiBriefingBtn: 'AI Ops Briefing',
    aiBriefingTitle: 'AI Operations Briefing',
    aiAnalyzing: 'Analyzing current operations and workforce data...',
    errorLoading: 'Failed to load live data.',
    realtime: 'Realtime connected',
    kpiNeedPickup: 'Need Pickup Assignment',
    kpiNeedPickupNote: 'SUBMITTED',
    kpiPendingPickup: 'Pending Pickup',
    kpiPendingPickupNote: 'Rider assigned',
    kpiDraftWp: 'Draft Wayplans',
    kpiDraftWpNote: 'Needs drop-off assignment',
    kpiConfirmed: 'Live / Confirmed Ways',
    kpiConfirmedNote: 'Delivery in operation',
    kpiWayFail: 'Wayfail',
    kpiWayFailNote: 'Failed route events',
    kpiCodPending: 'COD Pending',
    kpiCodPendingNote: 'Settlement required',
    pickupOps: 'Order Picking Assignment',
    pickupOpsSub: 'Assign riders to CS-submitted pickup requests and check assignment notifications beside the queue.',
    dropOps: 'Drop-off Assignment',
    dropOpsSub: 'Assign delivery riders or drivers to reviewed wayplans before dispatch.',
    selectPickup: 'Pickup request',
    selectWayplan: 'Wayplan',
    selectWorker: 'Rider / driver',
    assignPickup: 'Assign pickup rider',
    assignDropoff: 'Assign drop-off rider',
    noPickupQueue: 'No pickup assignment queue.',
    noDropQueue: 'No drop-off assignment queue.',
    noWorker: 'No active workforce available.',
    pickupNotifications: 'Pickup Notifications',
    dropoffNotifications: 'Drop-off Notifications',
    emptyNotifications: 'No notifications for this container.',
    liveMapTitle: 'Livemap Screen / Mapbox Area',
    liveMapSub: 'Mapbox-ready display area for current ways, rider telemetry, live route condition, successful stops, wayfail, and COD collection.',
    mapboxMount: 'MapboxGL mount point',
    currentWays: 'Current Ways',
    traffic: 'Live condition',
    stops: 'Stops',
    codCollected: 'COD collected',
    wayBoard: 'Way Notifications & COD Settlement',
    wayBoardSub: 'Check all successful ways, wayfail reasons, and COD settlement state.',
    successfulWays: 'Successful ways',
    failedWays: 'Wayfail / failed reasons',
    codSettlement: 'COD settlement',
    recentPickup: 'Recent Pickup Requests',
    recentPickupSub: 'Operational status overview.',
    recentWp: 'Recent Wayplans',
    recentWpSub: 'Draft, assigned, and live delivery plans.',
    none: 'No rows found.',
    assignmentSuccess: 'Assignment completed',
    assignmentFailed: 'Assignment failed. Please try again.',
    localAiHealthy: 'Operations are stable. Workforce capacity is available, and no critical imbalance is visible in the current queue.',
    localAiPickupFocus: 'Focus first on pickup assignment. Submitted orders are waiting for riders, so clearing that queue will prevent upstream CS delays.',
    localAiWayplanFocus: 'Focus next on draft wayplans. They need drop-off assignment before dispatch can continue.',
    localAiCodFocus: 'COD settlement needs attention. Reconcile pending cash collections before shift close.',
  },
  MM: {
    supPortal: 'ကြီးကြပ်သူ မျက်နှာပြင်',
    title: 'တာဝန်ချထားမှုနှင့် လမ်းကြောင်းအစီအစဉ် လုပ်ငန်းထိန်းချုပ်ရေး',
    subtitle: 'ပစ္စည်းလာယူမည့်သူများ၊ ပို့ဆောင်မည့်သူများကို တာဝန်ချထားခြင်း၊ လက်ရှိလမ်းကြောင်းများ၊ မအောင်မြင်သောလမ်းကြောင်းများနှင့် COD ငွေရှင်းမှုကို တစ်နေရာတည်းမှ စောင့်ကြည့်ထိန်းချုပ်နိုင်သည်။',
    refresh: 'ပြန်လည်ဆန်းသစ်ရန်',
    aiBriefingBtn: 'AI လုပ်ငန်းအကျဉ်းချုပ်',
    aiBriefingTitle: 'AI လုပ်ငန်းလည်ပတ်မှု အကျဉ်းချုပ်',
    aiAnalyzing: 'လက်ရှိ လုပ်ငန်းလည်ပတ်မှုနှင့် ဝန်ထမ်းအချက်အလက်များကို ခွဲခြမ်းစိတ်ဖြာနေပါသည်...',
    errorLoading: 'အချက်အလက်များ ဆွဲယူရာတွင် အခက်အခဲရှိပါသည်။',
    realtime: 'တိုက်ရိုက်ချိတ်ဆက်ပြီး',
    kpiNeedPickup: 'လာယူရန် တာဝန်ချထားရန် လိုအပ်',
    kpiNeedPickupNote: 'တင်သွင်းပြီး',
    kpiPendingPickup: 'လာယူရန် စောင့်ဆိုင်းနေဆဲ',
    kpiPendingPickupNote: 'ပို့ဆောင်ရေးသမား သတ်မှတ်ပြီး',
    kpiDraftWp: 'ယာယီ လမ်းကြောင်းများ',
    kpiDraftWpNote: 'ပို့ဆောင်သူ သတ်မှတ်ရန်လိုအပ်',
    kpiConfirmed: 'လက်ရှိ / အတည်ပြုပြီး လမ်းကြောင်းများ',
    kpiConfirmedNote: 'ပို့ဆောင်မှု လည်ပတ်နေသည်',
    kpiWayFail: 'မအောင်မြင်သော လမ်းကြောင်းများ',
    kpiWayFailNote: 'မအောင်မြင်ဖြစ်စဉ်များ',
    kpiCodPending: 'COD ငွေရှင်းရန် ကျန်',
    kpiCodPendingNote: 'ငွေရှင်းရန် လိုအပ်',
    pickupOps: 'ပစ္စည်းလာယူရေး တာဝန်ချထားမှု',
    pickupOpsSub: 'CS မှတင်သွင်းထားသော တောင်းဆိုမှုများအတွက် ပစ္စည်းလာယူမည့်သူကို သတ်မှတ်ပြီး ဘေးရှိ အသိပေးချက်များကို စစ်ဆေးနိုင်သည်။',
    dropOps: 'ပို့ဆောင်ရေး တာဝန်ချထားမှု',
    dropOpsSub: 'စစ်ဆေးပြီးသော လမ်းကြောင်းအစီအစဉ်များအတွက် ပို့ဆောင်သူ သို့မဟုတ် ယာဉ်မောင်းကို သတ်မှတ်နိုင်သည်။',
    selectPickup: 'လာယူရန် တောင်းဆိုမှု',
    selectWayplan: 'လမ်းကြောင်းအစီအစဉ်',
    selectWorker: 'ပို့ဆောင်ရေးသမား / ယာဉ်မောင်း',
    assignPickup: 'ပစ္စည်းလာယူသူ သတ်မှတ်မည်',
    assignDropoff: 'ပို့ဆောင်သူ သတ်မှတ်မည်',
    noPickupQueue: 'လာယူရန် တာဝန်ချထားမှုစာရင်း မရှိပါ။',
    noDropQueue: 'ပို့ဆောင်ရန် တာဝန်ချထားမှုစာရင်း မရှိပါ။',
    noWorker: 'လက်ရှိ ဝန်ထမ်း မရှိပါ။',
    pickupNotifications: 'လာယူမှု အသိပေးချက်များ',
    dropoffNotifications: 'ပို့ဆောင်မှု အသိပေးချက်များ',
    emptyNotifications: 'ဤကဏ္ဍအတွက် အသိပေးချက် မရှိပါ။',
    liveMapTitle: 'Livemap / Mapbox မျက်နှာပြင်',
    liveMapSub: 'လက်ရှိလမ်းကြောင်းများ၊ တိုက်ရိုက်အခြေအနေ၊ အောင်မြင်သောနေရာများ၊ မအောင်မြင်သောနေရာများနှင့် COD ကောက်ခံမှုကို ကြည့်ရန် Mapbox အသင့်ပြင်ထားသောနေရာ။',
    mapboxMount: 'MapboxGL ထည့်သွင်းရန် နေရာ',
    currentWays: 'လက်ရှိ လမ်းကြောင်းများ',
    traffic: 'တိုက်ရိုက် အခြေအနေ',
    stops: 'ရပ်နားနေရာများ',
    codCollected: 'ကောက်ခံပြီး COD',
    wayBoard: 'လမ်းကြောင်း အသိပေးချက်နှင့် COD ငွေရှင်းမှု',
    wayBoardSub: 'အောင်မြင်သော လမ်းကြောင်းများ၊ မအောင်မြင်ရခြင်းအကြောင်းရင်းများနှင့် COD ငွေရှင်းမှုအခြေအနေကို စစ်ဆေးရန်။',
    successfulWays: 'အောင်မြင်သော လမ်းကြောင်းများ',
    failedWays: 'မအောင်မြင်သော လမ်းကြောင်း / အကြောင်းရင်းများ',
    codSettlement: 'COD ငွေရှင်းမှု',
    recentPickup: 'လတ်တလော ပစ္စည်းလာယူရန် တောင်းဆိုမှုများ',
    recentPickupSub: 'လုပ်ငန်းလည်ပတ်မှု အခြေအနေ အကျဉ်းချုပ်။',
    recentWp: 'လတ်တလော လမ်းကြောင်းအစီအစဉ်များ',
    recentWpSub: 'ယာယီ၊ တာဝန်ချထားပြီးနှင့် လက်ရှိပို့ဆောင်ရေး အစီအစဉ်များ။',
    none: 'မှတ်တမ်း မရှိပါ။',
    assignmentSuccess: 'တာဝန်ချထားမှု ပြီးစီးပါပြီ',
    assignmentFailed: 'တာဝန်ချထားမှု မအောင်မြင်ပါ။ ထပ်မံကြိုးစားပါ။',
    localAiHealthy: 'လုပ်ငန်းလည်ပတ်မှု တည်ငြိမ်နေပါသည်။ လက်ရှိစာရင်းတွင် ဝန်ထမ်းအင်အား မလုံလောက်မှု မတွေ့ရှိရပါ။',
    localAiPickupFocus: 'ပထမဦးစားပေးအနေဖြင့် လာယူမှု တာဝန်ချထားခြင်းကို အာရုံစိုက်ပါ။ တင်သွင်းထားသောအော်ဒါများကို မြန်မြန်ရှင်းလင်းခြင်းဖြင့် CS လုပ်ငန်းစဉ်နောက်ကျမှုကို လျှော့ချနိုင်သည်။',
    localAiWayplanFocus: 'နောက်တစ်ဆင့်အနေဖြင့် ယာယီလမ်းကြောင်းများကို အာရုံစိုက်ပါ။ ပို့ဆောင်မှု ဆက်လက်လုပ်ဆောင်ရန် ပို့ဆောင်သူ သတ်မှတ်ရန်လိုအပ်သည်။',
    localAiCodFocus: 'COD ငွေရှင်းမှုကို စစ်ဆေးရန်လိုအပ်သည်။ Shift မပြီးမီ မရှင်းရသေးသောငွေများကို စာရင်းညှိပါ။',
  },
}

function safeRows<T>(data: T[] | null, fallback: T[]): T[] {
  if (data && data.length > 0) return data
  return USE_PREVIEW_SEED_WHEN_EMPTY ? fallback : []
}

export default function SupervisorPortalPage() {
  const [lang, setLang] = useState<Language>('EN')
  const [pickups, setPickups] = useState<PickupRequest[]>([])
  const [wayplans, setWayplans] = useState<Wayplan[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [notifications, setNotifications] = useState<OpsNotification[]>([])
  const [wayEvents, setWayEvents] = useState<WayEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState('')
  const [selectedPickupId, setSelectedPickupId] = useState('')
  const [selectedPickupWorker, setSelectedPickupWorker] = useState('')
  const [selectedWayplanId, setSelectedWayplanId] = useState('')
  const [selectedDropoffWorker, setSelectedDropoffWorker] = useState('')
  const [aiBriefing, setAiBriefing] = useState<string | null>(null)
  const [isAiLoading, setIsAiLoading] = useState(false)

  const t = TRANSLATIONS[lang]

  const load = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const [pRes, wRes, wfRes, nRes, weRes] = await Promise.all([
        supabase.from('be_portal_pickup_requests').select('*').order('created_at', { ascending: false }).limit<Record<string, unknown>>(200),
        supabase.from('be_delivery_wayplans').select('*').order('created_at', { ascending: false }).limit<Record<string, unknown>>(100),
        supabase.from('be_mobile_workforce_accounts').select('*').eq('is_active', true).limit<Record<string, unknown>>(200),
        supabase.from('be_supervisor_notifications').select('*').order('created_at', { ascending: false }).limit<OpsNotification>(100),
        supabase.from('be_way_status_events').select('*').order('updated_at', { ascending: false }).limit<WayEvent>(100),
      ])

      if (pRes.error) throw pRes.error
      if (wRes.error) throw wRes.error
      if (wfRes.error) throw wfRes.error
      if (nRes.error) throw nRes.error
      if (weRes.error) throw weRes.error

      setPickups(safeRows(pRes.data, MOCK_PICKUPS as unknown as Record<string, unknown>[]).map(normalizePickup))
      setWayplans(safeRows(wRes.data, MOCK_WAYPLANS as unknown as Record<string, unknown>[]).map(normalizeWayplan))
      setWorkers(safeRows(wfRes.data, MOCK_WORKERS as unknown as Record<string, unknown>[]).map(normalizeWorker))
      setNotifications(safeRows(nRes.data, MOCK_NOTIFICATIONS))
      setWayEvents(safeRows(weRes.data, MOCK_WAY_EVENTS))
    } catch (err) {
      console.error('Failed to load supervisor dashboard data:', err)
      setErrorMsg(t.errorLoading)
      setPickups(MOCK_PICKUPS)
      setWayplans(MOCK_WAYPLANS)
      setWorkers(MOCK_WORKERS)
      setNotifications(MOCK_NOTIFICATIONS)
      setWayEvents(MOCK_WAY_EVENTS)
    } finally {
      setLoading(false)
    }
  }, [t.errorLoading])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const channel = supabase.channel('be-supervisor-operational-portal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'be_portal_pickup_requests' }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'be_delivery_wayplans' }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'be_supervisor_notifications' }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'be_way_status_events' }, () => { void load() })
      .subscribe(status => setRealtimeStatus(status === 'SUBSCRIBED' ? t.realtime : status))

    return () => { supabase.removeChannel(channel) }
  }, [load, t.realtime])

  const activeWorkers = useMemo(() => workers.filter(w => text(w.status, '').toLowerCase() === 'active'), [workers])
  const pickupQueue = useMemo(() => pickups.filter(p => p.status === 'SUBMITTED'), [pickups])
  const dropoffQueue = useMemo(() => wayplans.filter(w => w.status === 'DRAFT' || w.status === 'CONFIRMED'), [wayplans])
  const liveWays = useMemo(() => wayplans.filter(w => ['CONFIRMED', 'DELIVERY_ASSIGNED', 'OUT_FOR_DELIVERY'].includes(w.status)), [wayplans])

  useEffect(() => {
    if (!selectedPickupId && pickupQueue[0]) setSelectedPickupId(pickupQueue[0].id)
    if (!selectedWayplanId && dropoffQueue[0]) setSelectedWayplanId(dropoffQueue[0].id)
    if (!selectedPickupWorker && activeWorkers[0]) setSelectedPickupWorker(activeWorkers[0].worker_code)
    if (!selectedDropoffWorker && activeWorkers[0]) setSelectedDropoffWorker(activeWorkers[0].worker_code)
  }, [activeWorkers, dropoffQueue, pickupQueue, selectedDropoffWorker, selectedPickupId, selectedPickupWorker, selectedWayplanId])

  const kpis = useMemo(() => {
    const codPending = Math.max(0, wayplans.reduce((acc, w) => acc + w.cod_amount - w.cod_collected, 0))
    return {
      pickupAssign: pickupQueue.length,
      pendingPickup: pickups.filter(r => r.status === 'PENDING_PICKUP').length,
      draftWayplans: wayplans.filter(w => w.status === 'DRAFT').length,
      confirmedWayplans: liveWays.length,
      wayFail: wayEvents.filter(e => e.status === 'WAYFAIL').length,
      codPending,
    }
  }, [liveWays.length, pickupQueue.length, pickups, wayEvents, wayplans])

  const addNotification = useCallback((item: Omit<OpsNotification, 'id' | 'created_at'>) => {
    const next: OpsNotification = { ...item, id: `local-${Date.now()}`, created_at: nowIso() }
    setNotifications(prev => [next, ...prev])
    return next
  }, [])

  const assignPickupRider = async () => {
    const pickup = pickups.find(p => p.id === selectedPickupId)
    const worker = activeWorkers.find(w => w.worker_code === selectedPickupWorker)
    if (!pickup || !worker) return

    setActionLoading(true)
    try {
      const payload = {
        status: 'PENDING_PICKUP',
        assigned_rider_code: worker.worker_code,
        assigned_rider_name: worker.display_name,
        assigned_at: nowIso(),
      }
      const result = await supabase.from('be_portal_pickup_requests').update(payload).eq('id', pickup.id).select('*').single()
      if (result.error) throw result.error

      setPickups(prev => prev.map(row => row.id === pickup.id ? { ...row, status: 'PENDING_PICKUP', assigned_rider_code: worker.worker_code, assigned_rider_name: worker.display_name } : row))
      const notification = addNotification({
        scope: 'pickup',
        tone: 'success',
        title: t.assignmentSuccess,
        message: `${pickup.pickup_id} assigned to ${worker.display_name}.`,
        ref: pickup.pickup_id,
      })
      await supabase.from('be_supervisor_notifications').insert(notification).select('*').single()
    } catch (err) {
      console.error(err)
      addNotification({ scope: 'pickup', tone: 'error', title: t.assignmentFailed, message: text(err), ref: pickup.pickup_id })
    } finally {
      setActionLoading(false)
    }
  }

  const assignDropoffRider = async () => {
    const wayplan = wayplans.find(w => w.id === selectedWayplanId)
    const worker = activeWorkers.find(w => w.worker_code === selectedDropoffWorker)
    if (!wayplan || !worker) return

    setActionLoading(true)
    try {
      const payload = {
        status: 'DELIVERY_ASSIGNED',
        assigned_rider_code: worker.worker_code,
        assigned_rider_name: worker.display_name,
        assigned_at: nowIso(),
      }
      const result = await supabase.from('be_delivery_wayplans').update(payload).eq('id', wayplan.id).select('*').single()
      if (result.error) throw result.error

      setWayplans(prev => prev.map(row => row.id === wayplan.id ? { ...row, status: 'DELIVERY_ASSIGNED', assigned_rider_code: worker.worker_code, assigned_rider_name: worker.display_name } : row))
      const notification = addNotification({
        scope: 'dropoff',
        tone: 'success',
        title: t.assignmentSuccess,
        message: `${wayplan.wayplan_no} assigned to ${worker.display_name}.`,
        ref: wayplan.wayplan_no,
      })
      await supabase.from('be_supervisor_notifications').insert(notification).select('*').single()
    } catch (err) {
      console.error(err)
      addNotification({ scope: 'dropoff', tone: 'error', title: t.assignmentFailed, message: text(err), ref: wayplan.wayplan_no })
    } finally {
      setActionLoading(false)
    }
  }

  const generateAiBriefing = async () => {
    setIsAiLoading(true)
    setAiBriefing(null)
    await delay(550)

    const lines: string[] = []
    lines.push(t.localAiHealthy)
    if (kpis.pickupAssign > 0) lines.push(t.localAiPickupFocus)
    if (kpis.draftWayplans > 0) lines.push(t.localAiWayplanFocus)
    if (kpis.codPending > 0) lines.push(t.localAiCodFocus)
    setAiBriefing(lines.join('\n\n'))
    setIsAiLoading(false)
  }

  const pickupOptions = pickupQueue.map(p => ({ value: p.id, label: `${p.pickup_id} · ${p.merchant_name} · ${p.pickup_township}` }))
  const wayplanOptions = dropoffQueue.map(w => ({ value: w.id, label: `${w.wayplan_no} · ${w.delivery_zone || w.branch_code}` }))
  const workerOptions = activeWorkers.map(w => ({ value: w.worker_code, label: `${w.display_name} · ${w.worker_type} · ${w.zone || w.branch_code} · ${w.current_task_count} tasks` }))

  const pickupNotifications = notifications.filter(n => n.scope === 'pickup')
  const dropoffNotifications = notifications.filter(n => n.scope === 'dropoff')
  const successEvents = wayEvents.filter(e => e.status === 'SUCCESS')
  const failEvents = wayEvents.filter(e => e.status === 'WAYFAIL')
  const codEvents = wayEvents.filter(e => e.status === 'COD_PENDING' || e.status === 'COD_SETTLED')

  return (
    <div style={root()}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulseDot{0%,100%{opacity:.45;transform:scale(.92)}50%{opacity:1;transform:scale(1.08)}}
        select:focus,input:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}
      `}</style>
      <div style={{ maxWidth: 1540, margin: '0 auto', display: 'grid', gap: 18 }}>
        <section style={panel({ padding: 22 })}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'start', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: C.gold, textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 800, fontSize: 12 }}>{t.supPortal}</div>
              <h1 style={{ margin: '8px 0', fontSize: 28 }}>{t.title}</h1>
              <p style={{ margin: 0, color: C.text2, maxWidth: 860, lineHeight: 1.55 }}>{t.subtitle}</p>
              {realtimeStatus ? <div style={{ color: C.success, fontSize: 12, marginTop: 8 }}><Radio size={12} /> {realtimeStatus}</div> : null}
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
                <button type="button" onClick={() => setLang('EN')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'EN' ? C.panelHover : 'transparent', color: lang === 'EN' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>EN</button>
                <button type="button" onClick={() => setLang('MM')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'MM' ? C.panelHover : 'transparent', color: lang === 'MM' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>မြန်မာ</button>
              </div>
              <button type="button" style={{ ...button(true, isAiLoading), background: `linear-gradient(135deg, ${C.gold}, ${C.orange})`, color: '#082032', border: 'none' }} onClick={generateAiBriefing} disabled={isAiLoading}>
                {isAiLoading ? <Loader2 size={16} style={{ animation: 'spin .8s linear infinite' }} /> : <Sparkles size={16} />} {t.aiBriefingBtn}
              </button>
              <button type="button" style={button(false, loading)} onClick={() => void load()} disabled={loading}>
                {loading ? <Loader2 size={16} style={{ animation: 'spin .8s linear infinite' }} /> : <RefreshCw size={16} />} {t.refresh}
              </button>
            </div>
          </div>
        </section>

        {errorMsg ? (
          <div style={{ background: '#4a0521', border: '1px solid #831843', borderRadius: 12, padding: '12px 18px', color: C.error, display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
            <ShieldCheck size={18} /> {errorMsg}
          </div>
        ) : null}

        {(aiBriefing || isAiLoading) ? (
          <section style={panel({ padding: 22, background: 'linear-gradient(135deg, #0f2a42, #0b2236)', border: `1px solid ${C.info}` })}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.info, fontWeight: 800, fontSize: 16 }}>
                <Sparkles size={18} /> <span>{t.aiBriefingTitle}</span>
              </div>
              <button type="button" onClick={() => { setAiBriefing(null); setIsAiLoading(false) }} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <X size={20} />
              </button>
            </div>
            {isAiLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.text2, fontSize: 14 }}>
                <Loader2 size={16} style={{ animation: 'spin .8s linear infinite' }} /> {t.aiAnalyzing}
              </div>
            ) : (
              <div style={{ color: C.text2, lineHeight: 1.65, fontSize: 15, whiteSpace: 'pre-wrap' }}>{aiBriefing}</div>
            )}
          </section>
        ) : null}

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
          <Kpi label={t.kpiNeedPickup} value={loading ? '—' : kpis.pickupAssign} note={t.kpiNeedPickupNote} accent={C.warning} />
          <Kpi label={t.kpiPendingPickup} value={loading ? '—' : kpis.pendingPickup} note={t.kpiPendingPickupNote} accent={C.info} />
          <Kpi label={t.kpiDraftWp} value={loading ? '—' : kpis.draftWayplans} note={t.kpiDraftWpNote} accent={C.gold} />
          <Kpi label={t.kpiConfirmed} value={loading ? '—' : kpis.confirmedWayplans} note={t.kpiConfirmedNote} accent={C.success} />
          <Kpi label={t.kpiWayFail} value={loading ? '—' : kpis.wayFail} note={t.kpiWayFailNote} accent={C.error} />
          <Kpi label={t.kpiCodPending} value={loading ? '—' : `${kpis.codPending.toLocaleString()} MMK`} note={t.kpiCodPendingNote} accent={C.orange} />
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(260px,.8fr)', gap: 16 }}>
          <div style={panel({ padding: 18 })}>
            <SectionTitle title={t.pickupOps} subtitle={t.pickupOpsSub} right={<ClipboardCheck color={C.warning} size={22} />} />
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
              <SelectField label={t.selectPickup} value={selectedPickupId} onChange={setSelectedPickupId} options={pickupOptions.length ? pickupOptions : [{ value: '', label: t.noPickupQueue }]} />
              <SelectField label={t.selectWorker} value={selectedPickupWorker} onChange={setSelectedPickupWorker} options={workerOptions.length ? workerOptions : [{ value: '', label: t.noWorker }]} />
            </div>
            <button type="button" onClick={() => void assignPickupRider()} disabled={actionLoading || !selectedPickupId || !selectedPickupWorker} style={{ ...button(true, actionLoading || !selectedPickupId || !selectedPickupWorker), marginTop: 14, width: '100%' }}>
              <Send size={15} /> {t.assignPickup}
            </button>
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              {pickupQueue.slice(0, 4).map(row => (
                <div key={row.id} style={panel({ padding: 12, boxShadow: 'none' })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{row.pickup_id}</strong><span style={statusBadge(row.status)}>{row.status}</span></div>
                  <div style={{ color: C.text2, marginTop: 4, fontSize: 13 }}>{row.merchant_name} · {row.pickup_township} · {row.parcel_count} parcel(s)</div>
                </div>
              ))}
              {!pickupQueue.length ? <div style={{ color: C.text2, fontSize: 13 }}>{t.noPickupQueue}</div> : null}
            </div>
          </div>
          <NotificationList title={t.pickupNotifications} items={pickupNotifications} emptyText={t.emptyNotifications} />
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(260px,.8fr)', gap: 16 }}>
          <div style={panel({ padding: 18 })}>
            <SectionTitle title={t.dropOps} subtitle={t.dropOpsSub} right={<Truck color={C.info} size={22} />} />
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
              <SelectField label={t.selectWayplan} value={selectedWayplanId} onChange={setSelectedWayplanId} options={wayplanOptions.length ? wayplanOptions : [{ value: '', label: t.noDropQueue }]} />
              <SelectField label={t.selectWorker} value={selectedDropoffWorker} onChange={setSelectedDropoffWorker} options={workerOptions.length ? workerOptions : [{ value: '', label: t.noWorker }]} />
            </div>
            <button type="button" onClick={() => void assignDropoffRider()} disabled={actionLoading || !selectedWayplanId || !selectedDropoffWorker} style={{ ...button(true, actionLoading || !selectedWayplanId || !selectedDropoffWorker), marginTop: 14, width: '100%' }}>
              <Route size={15} /> {t.assignDropoff}
            </button>
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              {dropoffQueue.slice(0, 4).map(row => (
                <div key={row.id} style={panel({ padding: 12, boxShadow: 'none' })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{row.wayplan_no}</strong><span style={statusBadge(row.status)}>{row.status}</span></div>
                  <div style={{ color: C.text2, marginTop: 4, fontSize: 13 }}>{row.delivery_zone || row.branch_code} · {row.total_stops} stops · COD {row.cod_amount.toLocaleString()} MMK</div>
                </div>
              ))}
              {!dropoffQueue.length ? <div style={{ color: C.text2, fontSize: 13 }}>{t.noDropQueue}</div> : null}
            </div>
          </div>
          <NotificationList title={t.dropoffNotifications} items={dropoffNotifications} emptyText={t.emptyNotifications} />
        </section>

        <section style={panel({ padding: 18 })}>
          <SectionTitle title={t.liveMapTitle} subtitle={t.liveMapSub} right={<Map color={C.gold} size={22} />} />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(280px,.7fr)', gap: 16 }}>
            <div id="mapbox-live-map" style={{ minHeight: 360, borderRadius: 18, border: `1px solid ${C.border}`, background: 'radial-gradient(circle at 20% 30%, rgba(56,189,248,.20), transparent 26%), radial-gradient(circle at 72% 62%, rgba(246,184,75,.20), transparent 24%), linear-gradient(135deg, #071827, #0f2a42)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 18, border: `1px dashed ${C.border}`, borderRadius: 16 }} />
              <div style={{ position: 'absolute', top: 18, left: 18, background: 'rgba(6,21,36,.82)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '9px 12px', color: C.text2, fontSize: 12, fontWeight: 800 }}>
                <MapPin size={13} /> {t.mapboxMount}
              </div>
              <div style={{ position: 'absolute', left: '24%', top: '38%', width: 14, height: 14, borderRadius: 999, background: C.success, animation: 'pulseDot 1.4s infinite' }} />
              <div style={{ position: 'absolute', left: '62%', top: '58%', width: 14, height: 14, borderRadius: 999, background: C.warning, animation: 'pulseDot 1.7s infinite' }} />
              <div style={{ position: 'absolute', right: 18, bottom: 18, maxWidth: 300, background: 'rgba(6,21,36,.86)', border: `1px solid ${C.border}`, borderRadius: 14, padding: 12 }}>
                <div style={{ color: C.gold, fontWeight: 800, fontSize: 13 }}>{t.currentWays}</div>
                <div style={{ color: C.text2, fontSize: 12, marginTop: 6 }}>Mapbox token can be mounted here with mapbox-gl and live rider coordinates.</div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {liveWays.slice(0, 5).map(way => (
                <div key={way.id} style={panel({ padding: 12, boxShadow: 'none' })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ color: C.info }}>{way.wayplan_no}</strong>
                    <span style={statusBadge(way.route_condition)}>{way.route_condition}</span>
                  </div>
                  <div style={{ color: C.text2, fontSize: 12, lineHeight: 1.45, marginTop: 6 }}>{way.current_condition}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                    <div style={{ color: C.text2, fontSize: 12 }}><Navigation size={12} /> {t.stops}: {way.success_count}/{way.total_stops}</div>
                    <div style={{ color: C.text2, fontSize: 12 }}><WalletCards size={12} /> {t.codCollected}: {way.cod_collected.toLocaleString()}</div>
                  </div>
                </div>
              ))}
              {!liveWays.length ? <div style={{ color: C.text2, fontSize: 13 }}>{t.none}</div> : null}
            </div>
          </div>
        </section>

        <section style={panel({ padding: 18 })}>
          <SectionTitle title={t.wayBoard} subtitle={t.wayBoardSub} right={<Bell color={C.info} size={22} />} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
            <div style={panel({ padding: 14, borderTop: `2px solid ${C.success}` })}>
              <strong style={{ color: C.success }}><CheckCircle2 size={15} /> {t.successfulWays}</strong>
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {successEvents.map(e => <div key={e.id} style={{ color: C.text2, fontSize: 13 }}>{e.wayplan_no} · {e.rider_name} · COD {e.cod_amount.toLocaleString()}</div>)}
                {!successEvents.length ? <div style={{ color: C.text2, fontSize: 13 }}>{t.none}</div> : null}
              </div>
            </div>
            <div style={panel({ padding: 14, borderTop: `2px solid ${C.error}` })}>
              <strong style={{ color: C.error }}><AlertTriangle size={15} /> {t.failedWays}</strong>
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {failEvents.map(e => <div key={e.id} style={{ color: C.text2, fontSize: 13 }}>{e.wayplan_no} · {e.reason || 'No reason'} · {formatDate(e.updated_at)}</div>)}
                {!failEvents.length ? <div style={{ color: C.text2, fontSize: 13 }}>{t.none}</div> : null}
              </div>
            </div>
            <div style={panel({ padding: 14, borderTop: `2px solid ${C.orange}` })}>
              <strong style={{ color: C.orange }}><WalletCards size={15} /> {t.codSettlement}</strong>
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {codEvents.map(e => <div key={e.id} style={{ color: C.text2, fontSize: 13 }}>{e.wayplan_no} · <span style={statusBadge(e.status)}>{e.status}</span> · {e.cod_amount.toLocaleString()} MMK</div>)}
                {!codEvents.length ? <div style={{ color: C.text2, fontSize: 13 }}>{t.none}</div> : null}
              </div>
            </div>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18 }}>
          <section style={panel({ padding: 18 })}>
            <SectionTitle title={t.recentPickup} subtitle={t.recentPickupSub} />
            <div style={{ display: 'grid', gap: 10 }}>
              {pickups.slice(0, 10).map(row => (
                <div key={row.id} style={panel({ padding: 12, boxShadow: 'none' })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{row.pickup_id}</strong><span style={statusBadge(row.status)}>{row.status}</span></div>
                  <div style={{ color: C.text2, marginTop: 4 }}>{row.merchant_name} · {row.pickup_township} · {row.assigned_rider_name || 'Unassigned'}</div>
                </div>
              ))}
              {!pickups.length && !loading ? <div style={{ color: C.text2 }}>{t.none}</div> : null}
            </div>
          </section>
          <section style={panel({ padding: 18 })}>
            <SectionTitle title={t.recentWp} subtitle={t.recentWpSub} />
            <div style={{ display: 'grid', gap: 10 }}>
              {wayplans.slice(0, 10).map(row => (
                <div key={row.id} style={panel({ padding: 12, boxShadow: 'none' })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{row.wayplan_no}</strong><span style={statusBadge(row.status)}>{row.status}</span></div>
                  <div style={{ color: C.text2, marginTop: 4 }}>{row.branch_code} · {row.delivery_zone || '—'} · <Clock size={12} /> {formatDate(row.planned_delivery_date)}</div>
                </div>
              ))}
              {!wayplans.length && !loading ? <div style={{ color: C.text2 }}>{t.none}</div> : null}
            </div>
          </section>
        </section>
      </div>
    </div>
  )
}
