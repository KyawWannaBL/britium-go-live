// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  Loader2,
  MapPinned,
  RefreshCw,
  Route,
  Search,
  Send,
  Truck,
  Users,
  Zap,
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

type AnyRow = Record<string, any>

type WayplanSnapshot = {
  kpis: {
    total_wayplans: number
    active_wayplans: number
    planned_wayplans: number
    completed_wayplans: number
    total_stops: number
    completed_stops: number
    exception_stops: number
  }
  wayplans: AnyRow[]
  stops: AnyRow[]
  exceptions: AnyRow[]
  riders: AnyRow[]
  vehicles: AnyRow[]
  last_synced_at: string
}

const EMPTY_SNAPSHOT: WayplanSnapshot = {
  kpis: {
    total_wayplans: 0,
    active_wayplans: 0,
    planned_wayplans: 0,
    completed_wayplans: 0,
    total_stops: 0,
    completed_stops: 0,
    exception_stops: 0,
  },
  wayplans: [],
  stops: [],
  exceptions: [],
  riders: [],
  vehicles: [],
  last_synced_at: '',
}

const WAYPLAN_STATUSES = ['planned', 'active', 'completed', 'cancelled'] as const
const STOP_STATUSES = ['planned', 'arrived', 'out_for_delivery', 'completed', 'failed', 'hold', 'exception'] as const

const sectionTitleStyle = { fontFamily: FF.sub, fontSize: 18, fontWeight: 600, color: C.text2, margin: '0 0 16px' }
const thStyle = { fontFamily: FF.body, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, background: C.panel2, textAlign: 'left', padding: '12px 14px', borderBottom: `1px solid ${C.border}` }
const tdStyle = { fontFamily: FF.body, fontSize: 13.5, color: C.text2, padding: '12px 14px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' }
const kpiValueStyle = { fontFamily: FF.body, fontSize: 24, fontWeight: 700, color: C.gold, margin: '6px 0 0' }

function safe(value: unknown, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback
  return String(value)
}

function numberValue(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function lower(value: unknown) {
  return safe(value, '').trim().toLowerCase()
}

function formatDateTime(value: unknown) {
  if (!value) return '—'
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function wayplanCode(row: AnyRow) {
  return safe(row.wayplan_code || row.wayplan_no || row.route_name || row.id)
}

function stopSequence(row: AnyRow) {
  return numberValue(row.stop_sequence ?? row.stop_seq ?? row.sequence_number, 0)
}

function stopTracking(row: AnyRow) {
  return safe(row.tracking_no || row.delivery_way_id || row.waybill_id || row.shipment_id || row.id)
}

function stopStatus(row: AnyRow) {
  return safe(row.stop_status || row.status || 'planned')
}

function wayplanStatus(row: AnyRow) {
  return safe(row.status || row.dispatch_status || 'planned')
}

function normalizeSnapshot(raw: any): WayplanSnapshot {
  const data = raw && typeof raw === 'object' ? raw : {}
  return {
    kpis: {
      total_wayplans: numberValue(data.kpis?.total_wayplans),
      active_wayplans: numberValue(data.kpis?.active_wayplans),
      planned_wayplans: numberValue(data.kpis?.planned_wayplans),
      completed_wayplans: numberValue(data.kpis?.completed_wayplans),
      total_stops: numberValue(data.kpis?.total_stops),
      completed_stops: numberValue(data.kpis?.completed_stops),
      exception_stops: numberValue(data.kpis?.exception_stops),
    },
    wayplans: Array.isArray(data.wayplans) ? data.wayplans : [],
    stops: Array.isArray(data.stops) ? data.stops : [],
    exceptions: Array.isArray(data.exceptions) ? data.exceptions : [],
    riders: Array.isArray(data.riders) ? data.riders : [],
    vehicles: Array.isArray(data.vehicles) ? data.vehicles : [],
    last_synced_at: safe(data.last_synced_at || new Date().toISOString(), ''),
  }
}

async function rpc<T = any>(name: string, args?: AnyRow): Promise<T> {
  const { data, error } = await (supabase as any).rpc(name, args || {})
  if (error) throw error
  return data as T
}

async function selectRows(table: string, limit = 100, orderColumn = 'created_at') {
  const query = await (supabase as any)
    .from(table)
    .select('*')
    .order(orderColumn, { ascending: false, nullsFirst: false })
    .limit(limit)
  if (query.error) return []
  return Array.isArray(query.data) ? query.data : []
}

async function fallbackSnapshot(searchToken: string, activeWayplanId: string | null): Promise<WayplanSnapshot> {
  const [wayplans, stops, exceptions, riders, vehicles] = await Promise.all([
    selectRows('wayplans', 100, 'created_at'),
    selectRows('wayplan_stops', 300, 'created_at'),
    selectRows('exception_events', 100, 'created_at'),
    selectRows('riders', 150, 'created_at'),
    selectRows('vehicles', 150, 'created_at'),
  ])

  const token = lower(searchToken)
  const filteredWayplans = token
    ? (wayplans ?? []).filter((w) =>
        [w.id, w.wayplan_code, w.wayplan_no, w.route_name, w.assigned_rider_name, w.assigned_driver_name, w.assigned_vehicle_plate, w.assigned_vehicle_no, w.status]
          .map((v) => lower(v))
          .join(' ')
          .includes(token),
      )
    : wayplans

  const selectedWayplanId = activeWayplanId || filteredWayplans[0]?.id || null
  const filteredStops = selectedWayplanId
    ? (stops ?? []).filter((s) => safe(s.wayplan_id, '') === safe(selectedWayplanId, ''))
    : (stops ?? []).slice(0, 120)

  const completedStops = (filteredStops ?? []).filter((s) => ['completed', 'delivered'].includes(lower(stopStatus(s)))).length
  const exceptionStops = (filteredStops ?? []).filter((s) => ['failed', 'hold', 'exception', 'cancelled', 'damaged', 'lost'].includes(lower(stopStatus(s)))).length

  return {
    kpis: {
      total_wayplans: filteredWayplans.length,
      active_wayplans: filteredWayplans.filter((w) => lower(wayplanStatus(w)) === 'active').length,
      planned_wayplans: filteredWayplans.filter((w) => lower(wayplanStatus(w)) === 'planned').length,
      completed_wayplans: filteredWayplans.filter((w) => lower(wayplanStatus(w)) === 'completed').length,
      total_stops: filteredStops.length,
      completed_stops: completedStops,
      exception_stops: exceptionStops,
    },
    wayplans: filteredWayplans,
    stops: filteredStops.sort((a, b) => stopSequence(a) - stopSequence(b)),
    exceptions: (exceptions ?? []).filter((e) => lower(e.process_type || e.event_process_type || '').includes('delivery') || lower(e.process_type || e.event_process_type || '').includes('warehouse')),
    riders,
    vehicles,
    last_synced_at: new Date().toISOString(),
  }
}

function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const blob = new Blob([content], { type: mime })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

function toCsv(rows: AnyRow[]) {
  const headers = ['wayplan_id', 'wayplan_code', 'route_name', 'status', 'stop_sequence', 'delivery_way_id', 'waybill_id', 'customer_name', 'customer_phone', 'township', 'address', 'stop_status', 'rider_name']
  const escape = (v: unknown) => `"${safe(v, '').replace(/"/g, '""')}"`
  return [headers.join(','), ...(rows ?? []).map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n')
}

const btn = (tone: 'primary' | 'secondary' = 'secondary', extra: React.CSSProperties = {}) => ({
  border:`1px solid ${tone === 'primary' ? C.orange : C.border}`,
  background:tone === 'primary' ? C.orange : C.panel2,
  color:tone === 'primary' ? C.bg : C.text2,
  borderRadius:10,
  padding:'10px 14px',
  fontFamily:FF.body,
  fontSize:13,
  fontWeight:600,
  display:'inline-flex',
  alignItems:'center',
  justifyContent:'center',
  gap:8,
  cursor:'pointer',
  ...extra,
})

const inputStyle = (extra: React.CSSProperties = {}) => ({
  width:'100%',
  minHeight:42,
  background:C.panel2,
  border:`1px solid ${C.border}`,
  color:C.text2,
  borderRadius:10,
  padding:'0 12px',
  fontFamily:FF.body,
  fontSize:14,
  ...extra,
})

const textareaStyle = (extra: React.CSSProperties = {}) => ({
  ...inputStyle({ minHeight:96, padding:'12px', resize:'vertical' }),
  ...extra,
})

const badge = (tone: string) => ({
  display:'inline-flex',
  alignItems:'center',
  padding:'4px 10px',
  borderRadius:999,
  border:`1px solid ${tone}`,
  color:tone,
  fontFamily:FF.body,
  fontSize:12,
  fontWeight:600,
})

export default function WayplanCommandCenterPage() {
  const [snapshot, setSnapshot] = useState<WayplanSnapshot>(EMPTY_SNAPSHOT)
  const [searchToken, setSearchToken] = useState('')
  const [activeWayplanId, setActiveWayplanId] = useState<string | null>(null)
  const [selectedRiderId, setSelectedRiderId] = useState('')
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<(typeof WAYPLAN_STATUSES)[number]>('planned')
  const [selectedStopStatus, setSelectedStopStatus] = useState<(typeof STOP_STATUSES)[number]>('planned')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [autoSync, setAutoSync] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const mounted = useRef(true)

  const activeWayplan = useMemo(() => {
    if (!activeWayplanId) return snapshot.wayplans[0] || null
    return (snapshot.wayplans ?? []).find((w) => safe(w.id, '') === activeWayplanId) || snapshot.wayplans[0] || null
  }, [activeWayplanId, snapshot.wayplans])

  const sortedStops = useMemo(() => {
    return [...(snapshot.stops ?? [])].sort((a, b) => stopSequence(a) - stopSequence(b))
  }, [snapshot.stops])

  const readiness = useMemo(() => {
    const checks = [
      { label: 'Wayplan data sync', ok: snapshot.wayplans.length > 0, actual: snapshot.wayplans.length, expected: '> 0' },
      { label: 'Stop sequence sync', ok: snapshot.stops.length > 0, actual: snapshot.stops.length, expected: '> 0' },
      { label: 'Rider master sync', ok: snapshot.riders.length > 0, actual: snapshot.riders.length, expected: '> 0' },
      { label: 'Fleet master sync', ok: snapshot.vehicles.length > 0, actual: snapshot.vehicles.length, expected: '> 0' },
    ]
    return { ok: checks.every((c) => c.ok), checks }
  }, [snapshot])

  const addLog = useCallback((line: string) => {
    setLog((prev) => [`${new Date().toLocaleTimeString()} — ${line}`, ...prev].slice(0, 12))
  }, [])

  const loadSnapshot = useCallback(async (opts?: { token?: string; wayplanId?: string | null; silent?: boolean }) => {
    const token = opts?.token ?? searchToken
    const wayplanId = opts?.wayplanId ?? activeWayplanId

    if (!opts?.silent) setLoading(true)
    setError(null)

    try {
      let next: WayplanSnapshot
      try {
        next = normalizeSnapshot(
          await rpc('be_wayplan_command_center_snapshot', {
            p_search_token: token.trim() || null,
            p_active_wayplan_id: wayplanId || null,
          }),
        )
      } catch {
        next = await fallbackSnapshot(token, wayplanId)
      }

      if (!mounted.current) return
      setSnapshot(next)
      if (!wayplanId && next.wayplans[0]?.id) {
        setActiveWayplanId(safe(next.wayplans[0].id, ''))
      }
      addLog('Wayplan command data synchronized.')
    } catch (e: any) {
      if (!mounted.current) return
      setError(e?.message || 'Wayplan synchronization failed.')
    } finally {
      if (!opts?.silent && mounted.current) setLoading(false)
    }
  }, [activeWayplanId, addLog, searchToken])

  useEffect(() => {
    mounted.current = true
    void loadSnapshot({ token: '', wayplanId: null })
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!autoSync) return undefined
    const t = window.setInterval(() => {
      void loadSnapshot({ silent: true })
    }, 45000)
    return () => window.clearInterval(t)
  }, [autoSync, loadSnapshot])

  function validateNote() {
    if (note.length > 500) return 'Note must not exceed 500 characters.'
    return null
  }

  async function updateWayplanStatus() {
    if (!activeWayplan) {
      setError('Select a wayplan first.')
      return
    }
    const noteError = validateNote()
    if (noteError) {
      setError(noteError)
      return
    }

    setActionBusy('wayplan_status')
    setError(null)
    try {
      await rpc('be_wayplan_update_status', {
        p_wayplan_id: activeWayplan.id,
        p_status: selectedStatus,
        p_note: note.trim() || null,
      })
      setNotice(`Wayplan status updated to ${selectedStatus}.`)
      setNote('')
      addLog(`Wayplan ${wayplanCode(activeWayplan)} status → ${selectedStatus}`)
      await loadSnapshot({ wayplanId: safe(activeWayplan.id, '') })
    } catch (e: any) {
      setError(e?.message || 'Wayplan status update failed.')
    } finally {
      setActionBusy(null)
    }
  }

  async function assignDispatchTeam() {
    if (!activeWayplan) {
      setError('Select a wayplan first.')
      return
    }
    if (!selectedRiderId && !selectedVehicleId) {
      setError('Select at least rider or vehicle.')
      return
    }
    const noteError = validateNote()
    if (noteError) {
      setError(noteError)
      return
    }

    setActionBusy('assign')
    setError(null)
    try {
      await rpc('be_wayplan_assign_dispatch_team', {
        p_wayplan_id: activeWayplan.id,
        p_rider_id: selectedRiderId || null,
        p_vehicle_id: selectedVehicleId || null,
        p_note: note.trim() || null,
      })
      setNotice('Dispatch team assigned.')
      addLog(`Dispatch team updated for ${wayplanCode(activeWayplan)}.`)
      setNote('')
      await loadSnapshot({ wayplanId: safe(activeWayplan.id, '') })
    } catch (e: any) {
      setError(e?.message || 'Dispatch assignment failed.')
    } finally {
      setActionBusy(null)
    }
  }

  async function updateStopStatus(stop: AnyRow) {
    const noteError = validateNote()
    if (noteError) {
      setError(noteError)
      return
    }
    setActionBusy(`stop_${safe(stop.id)}`)
    setError(null)
    try {
      await rpc('be_wayplan_update_stop_status', {
        p_stop_id: stop.id,
        p_stop_status: selectedStopStatus,
        p_note: note.trim() || null,
      })
      setNotice(`Stop ${stopTracking(stop)} updated.`)
      addLog(`Stop ${stopTracking(stop)} status → ${selectedStopStatus}`)
      setNote('')
      await loadSnapshot({ wayplanId: safe(stop.wayplan_id || activeWayplan?.id, '') })
    } catch (e: any) {
      setError(e?.message || 'Stop status update failed.')
    } finally {
      setActionBusy(null)
    }
  }

  async function resequenceStop(stop: AnyRow, direction: 'up' | 'down') {
    const current = stopSequence(stop)
    const next = direction === 'up' ? Math.max(1, current - 1) : current + 1
    setActionBusy(`seq_${safe(stop.id)}`)
    setError(null)
    try {
      await rpc('be_wayplan_resequence_stop', {
        p_stop_id: stop.id,
        p_new_sequence: next,
      })
      addLog(`Stop ${stopTracking(stop)} sequence ${current} → ${next}`)
      await loadSnapshot({ wayplanId: safe(stop.wayplan_id || activeWayplan?.id, '') })
    } catch (e: any) {
      setError(e?.message || 'Stop resequence failed.')
    } finally {
      setActionBusy(null)
    }
  }

  function runSearch() {
    setActiveWayplanId(null)
    void loadSnapshot({ token: searchToken, wayplanId: null })
  }

  function exportStops() {
    const rows = (sortedStops ?? []).map((s) => ({
      ...s,
      wayplan_id: activeWayplan?.id || s.wayplan_id,
      wayplan_code: wayplanCode(activeWayplan || {}),
      route_name: safe(activeWayplan?.route_name || activeWayplan?.wayplan_no || ''),
      status: wayplanStatus(activeWayplan || {}),
    }))
    downloadText('britium-wayplan-stops-export.csv', toCsv(rows))
  }

  function downloadTemplate() {
    downloadText(
      'britium-wayplan-stop-update-template.csv',
      ['wayplan_code,stop_id,delivery_way_id,stop_sequence,stop_status,dispatch_note', 'D0609-AKK-001,00000000-0000-0000-0000-000000000000,D0609-AKK-001,1,planned,'].join('\n'),
    )
  }

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>Wayplan Command Center</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Live route planning, stop sequence control, dispatch assignment and execution monitoring.</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <span style={{ ...badge(readiness.ok ? C.success : C.warning), background: readiness.ok ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)' }}>{readiness.ok ? 'GO-LIVE READY' : 'CHECK REQUIRED'}</span>
          <button type='button' onClick={() => setAutoSync((v) => !v)} style={btn('secondary')}>
            <Zap size={14} />
            Auto Sync {autoSync ? 'On' : 'Off'}
          </button>
          <button type='button' onClick={() => loadSnapshot()} style={btn('secondary')}>
            {loading ? <Loader2 size={14} style={{ animation:'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div style={{ display:'grid', gap:12, marginBottom:20 }}>
          {error && (
            <div style={{ background:'rgba(255,79,134,0.08)', border:`1px solid ${C.error}`, borderRadius:12, padding:14, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, color:C.error, fontFamily:FF.body, fontSize:14 }}><AlertTriangle size={16} />{error}</div>
              <button onClick={() => setError(null)} style={btn('secondary', { padding:'8px 12px' })}>Dismiss</button>
            </div>
          )}
          {notice && (
            <div style={{ background:'rgba(34,197,94,0.08)', border:`1px solid ${C.success}`, borderRadius:12, padding:14, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, color:C.success, fontFamily:FF.body, fontSize:14 }}><CheckCircle2 size={16} />{notice}</div>
              <button onClick={() => setNotice(null)} style={btn('secondary', { padding:'8px 12px' })}>Dismiss</button>
            </div>
          )}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:12, marginBottom:20 }}>
        {[
          ['Wayplans', snapshot.kpis.total_wayplans],
          ['Active', snapshot.kpis.active_wayplans],
          ['Planned', snapshot.kpis.planned_wayplans],
          ['Completed', snapshot.kpis.completed_wayplans],
          ['Stops', snapshot.kpis.total_stops],
          ['Done Stops', snapshot.kpis.completed_stops],
          ['Exception Stops', snapshot.kpis.exception_stops],
        ].map(([label, value]) => (
          <div key={String(label)} style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:18 }}>
            <div style={{ fontFamily:FF.body, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>{label}</div>
            <div style={kpiValueStyle}>{Number(value || 0).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'minmax(300px, 360px) minmax(0, 1fr) minmax(320px, 380px)', gap:20, alignItems:'start' }}>
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
          <h2 style={sectionTitleStyle}>Wayplan Queue</h2>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, marginBottom:14 }}>
            <div style={{ position:'relative' }}>
              <Search size={16} color={C.muted} style={{ position:'absolute', left:12, top:13 }} />
              <input
                value={searchToken}
                onChange={(e) => setSearchToken(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch() }}
                placeholder='Wayplan / vehicle / rider / route'
                style={inputStyle({ paddingLeft:36 })}
              />
            </div>
            <button type='button' onClick={runSearch} style={btn('secondary', { minWidth:44, padding:'10px 12px' })}><Search size={14} /></button>
          </div>
          <div style={{ display:'grid', gap:10, maxHeight:700, overflow:'auto' }}>
            {loading && <div style={{ fontFamily:FF.body, fontSize:14, color:C.muted, padding:'12px 0' }}>Loading…</div>}
            {!loading && (snapshot.wayplans ?? []).length === 0 && <div style={{ fontFamily:FF.body, fontSize:14, color:C.muted, padding:'12px 0' }}>No wayplans found.</div>}
            {!loading && (snapshot.wayplans ?? []).map((row) => {
              const active = safe(row.id, '') === safe(activeWayplan?.id, '')
              return (
                <button
                  key={safe(row.id || wayplanCode(row))}
                  type='button'
                  onClick={() => {
                    const id = safe(row.id, '')
                    setActiveWayplanId(id)
                    void loadSnapshot({ wayplanId: id })
                  }}
                  style={{
                    textAlign:'left',
                    background:active ? C.panelHover : C.panel2,
                    border:`1px solid ${active ? C.orange : C.border}`,
                    borderRadius:12,
                    padding:14,
                    color:C.text2,
                    cursor:'pointer'
                  }}
                >
                  <div style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'flex-start' }}>
                    <div>
                      <div style={{ fontFamily:FF.body, fontSize:13, color:C.gold, fontWeight:700 }}>{wayplanCode(row)}</div>
                      <div style={{ fontFamily:FF.body, fontSize:14, color:C.text, fontWeight:600, marginTop:4 }}>{safe(row.route_name || row.wayplan_no || 'Route')}</div>
                    </div>
                    <span style={badge(lower(wayplanStatus(row)) === 'active' ? C.success : C.info)}>{wayplanStatus(row)}</span>
                  </div>
                  <div style={{ fontFamily:FF.body, fontSize:13, color:C.muted, marginTop:8 }}>
                    {safe(row.assigned_rider_name || row.assigned_driver_name || row.rider_id, 'Unassigned rider')} · {safe(row.assigned_vehicle_plate || row.assigned_vehicle_no, 'No vehicle')}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display:'grid', gap:20 }}>
          <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:16 }}>
              <div>
                <h2 style={sectionTitleStyle}>Stop Sequence Control</h2>
                <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, margin:0 }}>{activeWayplan ? `${wayplanCode(activeWayplan)} · ${safe(activeWayplan.route_name || activeWayplan.wayplan_no || '')}` : 'Select a wayplan to view stops.'}</p>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button type='button' onClick={downloadTemplate} style={btn('secondary')}><Download size={14} />Template</button>
                <button type='button' onClick={exportStops} style={btn('secondary')}><Download size={14} />Export CSV</button>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, marginBottom:16 }}>
              <select value={selectedStopStatus} onChange={(e) => setSelectedStopStatus(e.target.value as (typeof STOP_STATUSES)[number])} style={inputStyle()}>
                {(STOP_STATUSES ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <span style={{ alignSelf:'center', fontFamily:FF.body, fontSize:13, color:C.muted }}>Selected stop action</span>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    {['Seq', 'Shipment / Customer', 'Township', 'Status', 'Actions'].map((h) => <th key={h} style={thStyle}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(sortedStops ?? []).length === 0 ? (
                    <tr><td colSpan={5} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>No stops found for selected wayplan.</td></tr>
                  ) : (
                    (sortedStops ?? []).map((s) => {
                      const activeBusy = actionBusy === `stop_${safe(s.id)}` || actionBusy === `seq_${safe(s.id)}`
                      const stopTone = ['completed', 'delivered'].includes(lower(stopStatus(s))) ? C.success : ['failed', 'hold', 'exception'].includes(lower(stopStatus(s))) ? C.error : C.warning
                      return (
                        <tr key={safe(s.id || s.shipment_id || stopTracking(s))}>
                          <td style={tdStyle}>
                            <div style={{ fontFamily:FF.body, fontSize:13.5, color:C.gold }}>{stopSequence(s) || '—'}</div>
                            <div style={{ display:'flex', gap:4, marginTop:8 }}>
                              <button type='button' onClick={() => onResequenceStopWrapper(resequenceStop, s, 'up')} disabled={activeBusy || stopSequence(s) <= 1} style={btn('secondary', { padding:'6px 8px' })}><ArrowUp size={12} /></button>
                              <button type='button' onClick={() => onResequenceStopWrapper(resequenceStop, s, 'down')} disabled={activeBusy} style={btn('secondary', { padding:'6px 8px' })}><ArrowDown size={12} /></button>
                            </div>
                          </td>
                          <td style={tdStyle}>
                            <div style={{ color:C.info }}>{stopTracking(s)}</div>
                            <div style={{ marginTop:4, color:C.text }}>{safe(s.customer_name || s.receiver_name || s.merchant_name || '—')}</div>
                            <div style={{ marginTop:4, color:C.muted, fontSize:13 }}>{safe(s.address || s.delivery_address || '—')}</div>
                          </td>
                          <td style={tdStyle}>{safe(s.township)}</td>
                          <td style={tdStyle}><span style={badge(stopTone)}>{stopStatus(s)}</span></td>
                          <td style={tdStyle}>
                            <button type='button' onClick={() => void updateStopStatus(s)} disabled={activeBusy} style={btn('secondary')}>
                              {activeBusy ? <Loader2 size={14} style={{ animation:'spin 1s linear infinite' }} /> : <Send size={14} />}
                              Update
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{ display:'grid', gap:20 }}>
          <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <Truck size={18} color={C.orange} />
              <h2 style={{ ...sectionTitleStyle, margin:0 }}>Dispatch Assignment</h2>
            </div>
            <div style={{ display:'grid', gap:10 }}>
              <select value={selectedRiderId} onChange={(e) => setSelectedRiderId(e.target.value)} style={inputStyle()}>
                <option value=''>Select rider</option>
                {(snapshot.riders ?? []).map((r) => (
                  <option key={safe(r.id || r.rider_code)} value={safe(r.id, '')}>{safe(r.rider_code || r.code)} · {safe(r.name || r.full_name || r.rider_name || r.profile_id || r.id)}</option>
                ))}
              </select>
              <select value={selectedVehicleId} onChange={(e) => setSelectedVehicleId(e.target.value)} style={inputStyle()}>
                <option value=''>Select vehicle</option>
                {(snapshot.vehicles ?? []).map((v) => (
                  <option key={safe(v.id || v.vehicle_code || v.plate_no)} value={safe(v.id, '')}>{safe(v.vehicle_code || v.registration_number || v.plate_no || v.vehicle_plate || v.id)} · {safe(v.type || v.vehicle_type || '')}</option>
                ))}
              </select>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder='Dispatcher note / operational instruction, max 500 chars' style={textareaStyle()} />
              <button type='button' onClick={() => void assignDispatchTeam()} disabled={!activeWayplan || actionBusy === 'assign'} style={btn('primary', { width:'100%' })}>
                {actionBusy === 'assign' ? <Loader2 size={14} style={{ animation:'spin 1s linear infinite' }} /> : <Users size={14} />}
                Assign Dispatch Team
              </button>
            </div>
          </div>

          <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <Route size={18} color={C.info} />
              <h2 style={{ ...sectionTitleStyle, margin:0 }}>Wayplan Status</h2>
            </div>
            <div style={{ display:'grid', gap:10 }}>
              <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value as (typeof WAYPLAN_STATUSES)[number])} style={inputStyle()}>
                {(WAYPLAN_STATUSES ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button type='button' onClick={() => void updateWayplanStatus()} disabled={!activeWayplan || actionBusy === 'wayplan_status'} style={btn('primary', { width:'100%' })}>
                {actionBusy === 'wayplan_status' ? <Loader2 size={14} style={{ animation:'spin 1s linear infinite' }} /> : <Send size={14} />}
                Update Wayplan
              </button>
            </div>
          </div>

          <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <AlertTriangle size={18} color={C.warning} />
              <h2 style={{ ...sectionTitleStyle, margin:0 }}>Go-Live Validation</h2>
            </div>
            <div style={{ display:'grid', gap:10 }}>
              {(readiness.checks ?? []).map((c) => (
                <div key={c.label} style={{ border:`1px solid ${c.ok ? C.success : C.warning}`, background:c.ok ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)', borderRadius:10, padding:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center' }}>
                    <div>
                      <div style={{ fontFamily:FF.body, fontSize:14, fontWeight:600, color:C.text }}>{c.label}</div>
                      <div style={{ fontFamily:FF.body, fontSize:13, color:C.muted, marginTop:4 }}>Expected {safe(c.expected)} · Actual {safe(c.actual)}</div>
                    </div>
                    <span style={badge(c.ok ? C.success : C.warning)}>{c.ok ? 'Ready' : 'Warning'}</span>
                  </div>
                </div>
              ))}
              <div style={{ fontFamily:FF.body, fontSize:14, color:C.muted }}>Open operational exceptions: {(snapshot.exceptions ?? []).length}</div>
            </div>
          </div>

          <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <Zap size={18} color={C.gold} />
              <h2 style={{ ...sectionTitleStyle, margin:0 }}>Automation Log</h2>
            </div>
            <div style={{ display:'grid', gap:8 }}>
              {(log ?? []).length === 0 && <div style={{ fontFamily:FF.body, fontSize:14, color:C.muted }}>No activity yet.</div>}
              {(log ?? []).map((line, i) => (
                <div key={`${line}-${i}`} style={{ fontFamily:FF.body, fontSize:13, color:C.text2, borderTop: i ? `1px solid ${C.border}` : 'none', paddingTop: i ? 8 : 0 }}>{line}</div>
              ))}
            </div>
          </div>

          <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
            <h2 style={sectionTitleStyle}>Sync Snapshot</h2>
            <div style={{ display:'grid', gap:8 }}>
              <div style={{ fontFamily:FF.body, fontSize:14, color:C.text2 }}>Last sync: <span style={{ color:C.gold }}>{formatDateTime(snapshot.last_synced_at)}</span></div>
              <div style={{ fontFamily:FF.body, fontSize:14, color:C.text2 }}>Selected wayplan: <span style={{ color:C.gold }}>{activeWayplan ? wayplanCode(activeWayplan) : '—'}</span></div>
              <div style={{ fontFamily:FF.body, fontSize:14, color:C.text2 }}>Active stop action: <span style={{ color:C.gold }}>{selectedStopStatus}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function onResequenceStopWrapper(handler: (stop: AnyRow, direction: 'up' | 'down') => Promise<void>, stop: AnyRow, direction: 'up' | 'down') {
  void handler(stop, direction)
}
