import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, MapPin, Navigation, RefreshCw, Route, Save, Search, Settings2, Truck } from 'lucide-react'
import {
  BRITIUM_HEAD_OFFICE,
  WayplanStop,
  buildSupabaseMapboxResultPayload,
  optimizeRouteWithMapbox,
  orderStopsByHeadOfficeDistance,
} from './mapbox_wayplan_routing'

// --- GO-LIVE IMPORTS ---
// import { supabase } from '@/integrations/supabase/client'
// -----------------------

// --- PREVIEW ENVIRONMENT STUBS ---
type RpcResponse<T> = { data: T | null; error: Error | null }

const seedSnapshot: MapboxMasterSnapshot = {
  branch_code: 'YGN',
  branches: [{ branch_code: 'YGN', label: 'YGN' }],
  hubs: [
    {
      hub_id: '00000000-0000-0000-0000-000000000001',
      branch_code: 'YGN',
      hub_name: 'Britium Ventures Head Office',
      address: 'Britium Ventures Company Limited, Yangon, Myanmar',
      latitude: 16.88955881695471,
      longitude: 96.1970999756031,
      mapbox_place_name: 'Britium Ventures Company Limited',
      is_default: true,
    },
  ],
  townships: [
    { route_point_id: 'trp-01', branch_code: 'YGN', township: 'Yankin', latitude: 16.8409, longitude: 96.1735 },
    { route_point_id: 'trp-02', branch_code: 'YGN', township: 'Tamwe', latitude: 16.8065, longitude: 96.1698 },
    { route_point_id: 'trp-03', branch_code: 'YGN', township: 'Thingangyun', latitude: 16.8286, longitude: 96.1997 },
  ],
  workforce: [
    { worker_code: 'RID001', display_name: 'Preview Rider 1', worker_type: 'rider', phone: '09900000001', branch_code: 'YGN', zone: 'Yankin', status: 'active' },
    { worker_code: 'RID002', display_name: 'Preview Rider 2', worker_type: 'rider', phone: '09900000002', branch_code: 'YGN', zone: 'Tamwe', status: 'active' },
  ],
  ready_stops: [
    {
      pickup_request_id: 'pr-01',
      pickup_item_id: '11111111-1111-1111-1111-111111111111',
      pickup_id: 'PU-READY-001',
      delivery_township: 'Yankin',
      delivery_address: 'Yankin preview delivery address',
      latitude: 16.8409,
      longitude: 96.1735,
      distance_from_origin_km: 5.94,
      proposed_sequence: 1,
    },
    {
      pickup_request_id: 'pr-02',
      pickup_item_id: '22222222-2222-2222-2222-222222222222',
      pickup_id: 'PU-READY-002',
      delivery_township: 'Thingangyun',
      delivery_address: 'Thingangyun preview delivery address',
      latitude: 16.8286,
      longitude: 96.1997,
      distance_from_origin_km: 6.78,
      proposed_sequence: 2,
    },
  ],
  draft_wayplans: [],
  loaded_at: new Date().toISOString(),
}

const supabase = {
  rpc: async <T,>(_fn: string, _params?: Record<string, unknown>): Promise<RpcResponse<T>> => {
    await new Promise(resolve => setTimeout(resolve, 350))
    if (_fn === 'be_mapbox_wayplan_master_snapshot') {
      return { data: seedSnapshot as T, error: null }
    }
    if (_fn === 'be_create_mapbox_wayplan_from_master') {
      return {
        data: {
          ok: true,
          wayplan_id: '33333333-3333-3333-3333-333333333333',
          wayplan_no: `MBXWP-${Date.now()}`,
          stop_count: seedSnapshot.ready_stops.length,
          message: 'Preview draft wayplan created from backend master dropdown filters.',
        } as T,
        error: null,
      }
    }
    if (_fn === 'be_apply_mapbox_wayplan_result') {
      return { data: { ok: true, updated_stops: seedSnapshot.ready_stops.length, route_mode: 'MAPBOX_OPTIMIZED' } as T, error: null }
    }
    return { data: null, error: null }
  },
}
// ---------------------------------

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif" }

type BranchOption = {
  branch_code: string
  label?: string | null
}

type RouteHub = {
  hub_id: string
  branch_code: string
  hub_name: string
  address?: string | null
  latitude: number
  longitude: number
  mapbox_place_name?: string | null
  is_default?: boolean | null
}

type TownshipRoutePoint = {
  route_point_id?: string
  branch_code?: string
  township: string
  latitude?: number | null
  longitude?: number | null
  notes?: string | null
}

type WorkforceOption = {
  worker_code: string
  display_name: string
  worker_type?: string | null
  phone?: string | null
  branch_code?: string | null
  zone?: string | null
  status?: string | null
}

type ReadyStopRecord = {
  pickup_request_id: string
  pickup_item_id: string
  pickup_id: string
  delivery_township?: string | null
  delivery_address?: string | null
  latitude?: number | null
  longitude?: number | null
  distance_from_origin_km?: number | string | null
  proposed_sequence?: number | null
}

type DraftWayplanRecord = {
  wayplan_id: string
  wayplan_no: string
  branch_code?: string | null
  planned_delivery_date?: string | null
  status?: string | null
  route_origin_hub_id?: string | null
  route_origin_name?: string | null
  route_mode?: string | null
  mapbox_optimized_at?: string | null
}

type MapboxMasterSnapshot = {
  branch_code: string
  branches: BranchOption[]
  hubs: RouteHub[]
  townships: TownshipRoutePoint[]
  workforce: WorkforceOption[]
  ready_stops: ReadyStopRecord[]
  draft_wayplans: DraftWayplanRecord[]
  loaded_at?: string
}

type CreateWayplanResult = {
  ok: boolean
  wayplan_id: string
  wayplan_no: string
  stop_count: number
  message?: string
}

type ApplyMapboxResult = {
  ok: boolean
  updated_stops: number
  route_mode: string
}

type Props = {
  mapboxAccessToken?: string
  defaultBranchCode?: string
}

function panel(extra: React.CSSProperties = {}): React.CSSProperties {
  return { background: `linear-gradient(180deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.border}`, borderRadius: 18, boxShadow: '0 18px 40px rgba(0,0,0,.20)', ...extra }
}

function button(primary = false): React.CSSProperties {
  return { height: 40, borderRadius: 10, border: `1px solid ${primary ? C.gold : C.border}`, background: primary ? C.gold : C.panel2, color: primary ? '#082032' : C.text2, padding: '0 14px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: FF.body }
}

function inputStyle(): React.CSSProperties {
  return { width: '100%', height: 40, borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel2, color: C.text, padding: '0 12px', outline: 'none', fontFamily: FF.body }
}

function Label({ children }: { children?: React.ReactNode }) {
  return <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>{children}</div>
}

function toStop(row: ReadyStopRecord): WayplanStop | null {
  const latitude = Number(row.latitude)
  const longitude = Number(row.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return {
    pickupItemId: row.pickup_item_id,
    pickupId: row.pickup_id,
    township: row.delivery_township,
    address: row.delivery_address,
    latitude,
    longitude,
  }
}

function formatNumber(value: unknown, fallback = '0') {
  const n = Number(value)
  return Number.isFinite(n) ? n.toLocaleString() : fallback
}

export default function WayplanMapboxHQPanelMaster({ mapboxAccessToken = '', defaultBranchCode = 'YGN' }: Props) {
  const [branchCode, setBranchCode] = useState(defaultBranchCode)
  const [hubId, setHubId] = useState('')
  const [township, setTownship] = useState('')
  const [workerCode, setWorkerCode] = useState('')
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10))
  const [maxStops, setMaxStops] = useState(11)
  const [search, setSearch] = useState('')
  const [snapshot, setSnapshot] = useState<MapboxMasterSnapshot | null>(null)
  const [selectedWayplanId, setSelectedWayplanId] = useState('')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [optimized, setOptimized] = useState<Awaited<ReturnType<typeof optimizeRouteWithMapbox>> | null>(null)

  const hubs = snapshot?.hubs ?? []
  const selectedHub = hubs.find(h => h.hub_id === hubId) ?? hubs.find(h => h.is_default) ?? hubs[0]
  const origin = selectedHub
    ? { latitude: Number(selectedHub.latitude), longitude: Number(selectedHub.longitude) }
    : BRITIUM_HEAD_OFFICE

  const readyStops = useMemo(() => (snapshot?.ready_stops ?? []).filter(row => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [row.pickup_id, row.delivery_township, row.delivery_address]
      .some(value => String(value ?? '').toLowerCase().includes(q))
  }), [snapshot, search])

  const routeStops = useMemo(() => readyStops.map(toStop).filter((stop): stop is WayplanStop => Boolean(stop)), [readyStops])
  const nearestOrder = useMemo(() => orderStopsByHeadOfficeDistance(routeStops, origin), [routeStops, origin])
  const activeStops = optimized?.orderedStops ?? nearestOrder

  const loadMasterRecords = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const { data, error } = await supabase.rpc<MapboxMasterSnapshot>('be_mapbox_wayplan_master_snapshot', {
        p_branch_code: branchCode,
        p_township: township || null,
        p_limit: 200,
      })
      if (error) throw error
      if (!data) throw new Error('No master snapshot returned from backend')
      setSnapshot(data)
      setOptimized(null)
      const defaultHub = data.hubs.find(h => h.is_default) ?? data.hubs[0]
      setHubId(current => current || defaultHub?.hub_id || '')
      setMessage('Master dropdowns and READY_FOR_WAYPLAN records loaded from backend.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load backend master records')
      setSnapshot(null)
    } finally {
      setLoading(false)
    }
  }, [branchCode, township])

  useEffect(() => { void loadMasterRecords() }, [loadMasterRecords])

  const createDraftWayplan = async () => {
    setWorking(true)
    setMessage(null)
    try {
      const { data, error } = await supabase.rpc<CreateWayplanResult>('be_create_mapbox_wayplan_from_master', {
        p_branch_code: branchCode,
        p_hub_id: hubId || null,
        p_township: township || null,
        p_delivery_date: deliveryDate,
        p_max_stops: maxStops,
        p_assigned_worker_code: workerCode || null,
      })
      if (error) throw error
      if (!data?.wayplan_id) throw new Error('Wayplan was not created')
      setSelectedWayplanId(data.wayplan_id)
      setMessage(`${data.wayplan_no} created with ${data.stop_count} stop(s). Reloading master records.`)
      await loadMasterRecords()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create Mapbox-ready wayplan')
    } finally {
      setWorking(false)
    }
  }

  const runMapboxOptimization = async () => {
    setWorking(true)
    setMessage(null)
    try {
      const stopsForMapbox = nearestOrder.slice(0, Math.min(maxStops, 11))
      const result = await optimizeRouteWithMapbox(stopsForMapbox, mapboxAccessToken, {
        origin,
        profile: 'mapbox/driving-traffic',
        roundtrip: false,
      })
      setOptimized(result)
      setMessage('Mapbox optimization completed. Select/create a wayplan and save the sequence.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Mapbox optimization failed')
    } finally {
      setWorking(false)
    }
  }

  const saveMapboxResult = async () => {
    if (!optimized || !selectedWayplanId) return
    setWorking(true)
    setMessage(null)
    try {
      const payload = buildSupabaseMapboxResultPayload(optimized)
      const { data, error } = await supabase.rpc<ApplyMapboxResult>('be_apply_mapbox_wayplan_result', {
        p_wayplan_id: selectedWayplanId,
        p_profile: 'mapbox/driving-traffic',
        ...payload,
      })
      if (error) throw error
      setMessage(`Mapbox result saved. Updated stops: ${data?.updated_stops ?? 0}.`)
      await loadMasterRecords()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save Mapbox result')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section style={panel({ padding: 18, fontFamily: FF.body, color: C.text })}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ color: C.gold, fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase' }}>Backend Master Wayplan Routing</div>
          <h2 style={{ color: C.text, margin: '6px 0 0', fontSize: 20 }}>Head Office + Mapbox Route Builder</h2>
          <p style={{ color: C.text2, margin: '6px 0 0', fontSize: 13 }}>
            Dropdowns load from Supabase master records, then READY_FOR_WAYPLAN stops are sequenced from the selected hub.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={loadMasterRecords} disabled={loading || working} style={button(false)}>
            {loading ? <Loader2 size={15} /> : <RefreshCw size={15} />} Load Master Records
          </button>
          <button type="button" onClick={createDraftWayplan} disabled={loading || working || routeStops.length === 0} style={button(true)}>
            {working ? <Loader2 size={15} /> : <Route size={15} />} Create Wayplan
          </button>
        </div>
      </div>

      {message && (
        <div style={{ marginBottom: 14, padding: 12, borderRadius: 12, border: `1px solid ${message.toLowerCase().includes('unable') || message.toLowerCase().includes('failed') ? C.error : C.success}`, color: message.toLowerCase().includes('unable') || message.toLowerCase().includes('failed') ? C.error : C.success, background: C.panel2 }}>
          {message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 14 }}>
        <div>
          <Label>Branch</Label>
          <select value={branchCode} onChange={e => setBranchCode(e.target.value)} style={inputStyle()}>
            {(snapshot?.branches ?? [{ branch_code: branchCode, label: branchCode }]).map(branch => (
              <option key={branch.branch_code} value={branch.branch_code}>{branch.label ?? branch.branch_code}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Origin Hub</Label>
          <select value={hubId} onChange={e => setHubId(e.target.value)} style={inputStyle()}>
            <option value="">Default hub</option>
            {hubs.map(hub => (
              <option key={hub.hub_id} value={hub.hub_id}>{hub.hub_name}{hub.is_default ? ' · default' : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Township / Area</Label>
          <select value={township} onChange={e => setTownship(e.target.value)} style={inputStyle()}>
            <option value="">All READY areas</option>
            {(snapshot?.townships ?? []).map(tp => (
              <option key={`${tp.branch_code ?? branchCode}-${tp.township}`} value={tp.township}>{tp.township}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Assign Rider / Driver</Label>
          <select value={workerCode} onChange={e => setWorkerCode(e.target.value)} style={inputStyle()}>
            <option value="">No worker selected</option>
            {(snapshot?.workforce ?? []).map(worker => (
              <option key={worker.worker_code} value={worker.worker_code}>{worker.worker_code} — {worker.display_name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Delivery Date</Label>
          <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} style={inputStyle()} />
        </div>
        <div>
          <Label>Max Stops</Label>
          <select value={maxStops} onChange={e => setMaxStops(Number(e.target.value))} style={inputStyle()}>
            {[5, 8, 11, 15, 20, 25].map(n => <option key={n} value={n}>{n} stops</option>)}
          </select>
        </div>
        <div>
          <Label>Draft Wayplan</Label>
          <select value={selectedWayplanId} onChange={e => setSelectedWayplanId(e.target.value)} style={inputStyle()}>
            <option value="">Select after creation</option>
            {(snapshot?.draft_wayplans ?? []).map(wp => <option key={wp.wayplan_id} value={wp.wayplan_id}>{wp.wayplan_no} · {wp.status}</option>)}
          </select>
        </div>
        <div>
          <Label>Search Stops</Label>
          <div style={{ position: 'relative' }}>
            <Search size={14} color={C.muted} style={{ position: 'absolute', left: 12, top: 13 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pickup ID / township" style={{ ...inputStyle(), paddingLeft: 34 }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Hubs', value: hubs.length, icon: MapPin, color: C.gold },
          { label: 'Townships', value: snapshot?.townships?.length ?? 0, icon: Settings2, color: C.info },
          { label: 'Workforce', value: snapshot?.workforce?.length ?? 0, icon: Truck, color: C.success },
          { label: 'Ready Stops', value: readyStops.length, icon: CheckCircle2, color: C.orange },
        ].map(kpi => (
          <div key={kpi.label} style={panel({ padding: 14, borderTop: `2px solid ${kpi.color}` })}>
            <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', display: 'flex', gap: 8, alignItems: 'center' }}><kpi.icon size={14} color={kpi.color} /> {kpi.label}</div>
            <div style={{ color: kpi.color, fontSize: 24, fontWeight: 900, marginTop: 8 }}>{formatNumber(kpi.value)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, .85fr) minmax(0, 1.15fr)', gap: 14 }}>
        <div style={panel({ padding: 14, minHeight: 390 })}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.gold, fontWeight: 800, marginBottom: 10 }}>
            <MapPin size={16} /> Selected Origin Hub
          </div>
          <div style={{ color: C.text, fontWeight: 800 }}>{selectedHub?.hub_name ?? BRITIUM_HEAD_OFFICE.name}</div>
          <div style={{ color: C.text2, marginTop: 6, fontSize: 13 }}>{selectedHub?.address ?? BRITIUM_HEAD_OFFICE.address}</div>
          <div style={{ color: C.info, marginTop: 6, fontSize: 13 }}>Lat {origin.latitude} · Lng {origin.longitude}</div>

          <div style={{ marginTop: 18, border: `1px dashed ${C.border}`, borderRadius: 16, minHeight: 210, display: 'grid', placeItems: 'center', color: C.muted, textAlign: 'center', padding: 18 }}>
            <div>
              <Route size={34} color={C.info} />
              <div style={{ marginTop: 10, color: C.text2, fontWeight: 800 }}>Mapbox live-map canvas</div>
              <div style={{ marginTop: 6, fontSize: 13 }}>
                Render the selected hub, ready stops, and `optimized.geometry` here using your existing mapbox-gl component.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" onClick={runMapboxOptimization} disabled={working || !mapboxAccessToken || nearestOrder.length === 0} style={button(true)}>
              {working ? <Loader2 size={15} /> : <Navigation size={15} />} Optimize Mapbox
            </button>
            <button type="button" onClick={saveMapboxResult} disabled={working || !optimized || !selectedWayplanId} style={button(false)}>
              <Save size={15} /> Save Mapbox Sequence
            </button>
          </div>
        </div>

        <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${C.border}`, color: C.text, fontWeight: 800, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span>{optimized ? 'Mapbox Optimized Stop Order' : 'Nearest-from-Hub Stop Order'}</span>
            <span style={{ color: C.gold }}>{activeStops.length}</span>
          </div>
          <div style={{ maxHeight: 430, overflow: 'auto' }}>
            {activeStops.map(stop => (
              <div key={stop.pickupItemId} style={{ display: 'grid', gridTemplateColumns: '46px minmax(0, 1fr) 90px', gap: 10, padding: 12, borderBottom: `1px solid ${C.border}66`, alignItems: 'center' }}>
                <div style={{ width: 32, height: 32, borderRadius: 999, background: C.gold, color: '#082032', display: 'grid', placeItems: 'center', fontWeight: 900 }}>{stop.sequence}</div>
                <div>
                  <div style={{ color: C.text, fontWeight: 800 }}>{stop.pickupId}</div>
                  <div style={{ color: C.text2, fontSize: 13 }}>{stop.township ?? '—'} · {stop.address ?? '—'}</div>
                </div>
                <div style={{ color: C.info, fontSize: 12, textAlign: 'right' }}>{stop.distanceFromHeadOfficeKm.toFixed(2)} km</div>
              </div>
            ))}
            {activeStops.length === 0 && <div style={{ padding: 22, color: C.muted, textAlign: 'center' }}>No backend READY_FOR_WAYPLAN stops with route coordinates.</div>}
          </div>
        </div>
      </div>
    </section>
  )
}
