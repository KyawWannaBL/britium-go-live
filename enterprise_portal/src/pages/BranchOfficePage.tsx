// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { RefreshCw, Bell, MapPin, Users, Clock, AlertTriangle } from 'lucide-react'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

interface BranchNode {
  id: string
  branch_code: string | null
  branch_name: string | null
  is_active: boolean | null
}

interface PickupRequest {
  id: string
  pickup_id: string | null
  merchant_name: string | null
  township: string | null
  parcel_count: number | null
  status: string | null
  assigned_to: string | null
  created_at: string | null
  branch_code: string | null
}

interface AppNotification {
  id: string
  title: string | null
  body: string | null
  is_read: boolean | null
  created_at: string | null
  target_branch: string | null
}

type BranchCode = 'YGN' | 'MDY' | 'NPT'

interface BranchDef {
  code: BranchCode
  name: string
  label: string
  townships: string[]
  color: string
}

const BRANCHES: BranchDef[] = [
  { code:'YGN', name:'Yangon', label:'Yangon (Main Branch)', color:C.info, townships:[] },
  { code:'MDY', name:'Mandalay', label:'Mandalay Branch', color:C.gold, townships:['Mandalay City', 'Amarapura', 'Chanayethazan', 'Chanmyathazi', 'Mahaaungmyay', 'Pyigyidagun'] },
  { code:'NPT', name:'Naypyitaw', label:'Naypyitaw Branch', color:C.success, townships:['Ottarathiri', 'Pobbathiri', 'Zabuthiri', 'Dekkhina', 'Lewe'] },
]

function resolveBranch(value: string | null | undefined): BranchCode {
  const v = (value ?? '').toLowerCase()
  if (v.includes('mandalay')) return 'MDY'
  if (v.includes('naypyitaw') || v.includes('naypyidaw')) return 'NPT'
  return 'YGN'
}

function statusStyle(status: string | null) {
  switch (String(status ?? '').toLowerCase()) {
    case 'delivered': return { bg:'rgba(34,197,94,0.12)', color:C.success, border:'rgba(34,197,94,0.24)' }
    case 'in transit': return { bg:'rgba(56,189,248,0.12)', color:C.info, border:'rgba(56,189,248,0.24)' }
    case 'assigned': return { bg:'rgba(245,158,11,0.12)', color:C.warning, border:'rgba(245,158,11,0.24)' }
    case 'pending': return { bg:'rgba(246,184,75,0.12)', color:C.gold, border:'rgba(246,184,75,0.24)' }
    case 'exception': return { bg:'rgba(255,79,134,0.12)', color:C.error, border:'rgba(255,79,134,0.24)' }
    default: return { bg:'rgba(255,255,255,0.06)', color:C.text2, border:'rgba(255,255,255,0.10)' }
  }
}

const cardSty: React.CSSProperties = { background:C.panel, border:`1px solid ${C.border}`, borderRadius:12 }
const thStyle: React.CSSProperties = { padding:'10px 14px', background:C.panel2, color:C.muted, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, fontFamily:FF.body }
const tdStyle: React.CSSProperties = { padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22`, fontFamily:FF.body }

function KpiCard({ label, value, color, loading }: any) {
  return (
    <div style={{ ...cardSty, padding:18 }}>
      <p style={{ fontFamily:FF.body, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, margin:'0 0 8px' }}>{label}</p>
      <p style={{ fontFamily:FF.body, fontSize:24, fontWeight:700, color, margin:0 }}>{loading ? '—' : value}</p>
    </div>
  )
}

function NotifItem({ n }: { n: AppNotification }) {
  return (
    <div style={{ padding:'12px 14px', borderBottom:`1px solid ${C.border}22`, display:'flex', alignItems:'flex-start', gap:10, opacity:n.is_read ? 0.6 : 1 }}>
      <div style={{ width:8, height:8, borderRadius:'50%', background:n.is_read ? C.muted : C.info, marginTop:6, flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontFamily:FF.body, fontSize:14, color:n.is_read ? C.text2 : C.text, margin:'0 0 4px' }}>{n.title ?? 'Notification'}</p>
        {n.body && <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, margin:'0 0 4px' }}>{n.body}</p>}
        <p style={{ fontFamily:FF.body, fontSize:12, color:C.muted, margin:0 }}>{n.created_at ? new Date(n.created_at).toLocaleString() : '—'}</p>
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return <div style={{ textAlign:'center', padding:'40px 20px', fontFamily:FF.body, fontSize:14, color:C.muted }}>{message}</div>
}

export default function BranchOfficePage() {
  const [activeBranch, setActiveBranch] = useState<BranchCode>('YGN')
  const [branchNodes, setBranchNodes] = useState<BranchNode[]>([])
  const [pickups, setPickups] = useState<PickupRequest[]>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loadingNodes, setLoadingNodes] = useState(true)
  const [loadingPickups, setLoadingPickups] = useState(true)
  const [loadingNotifs, setLoadingNotifs] = useState(true)
  const [lastSync, setLastSync] = useState<Date | null>(null)

  const loadBranchNodes = async () => {
    setLoadingNodes(true)
    try {
      const { data } = await supabase.from('be_branch_nodes').select('*')
      setBranchNodes(data ?? [])
    } catch (_) {
      setBranchNodes([])
    } finally {
      setLoadingNodes(false)
    }
  }

  const loadPickups = useCallback(async (branch: BranchCode) => {
    setLoadingPickups(true)
    try {
      const { data } = await supabase
        .from('be_portal_pickup_requests')
        .select('*')
        .eq('branch_code', branch)
        .order('created_at', { ascending: false })
        .limit(100)
      setPickups(data ?? [])
    } catch (_) {
      setPickups([])
    } finally {
      setLoadingPickups(false)
    }
  }, [])

  const loadNotifications = useCallback(async (branch: BranchCode) => {
    setLoadingNotifs(true)
    try {
      const { data } = await supabase
        .from('be_app_notifications')
        .select('*')
        .eq('target_branch', branch)
        .order('created_at', { ascending: false })
        .limit(20)
      setNotifications(data ?? [])
    } catch (_) {
      setNotifications([])
    } finally {
      setLoadingNotifs(false)
    }
  }, [])

  const refresh = useCallback((branch: BranchCode) => {
    loadBranchNodes()
    loadPickups(branch)
    loadNotifications(branch)
    setLastSync(new Date())
  }, [loadPickups, loadNotifications])

  useEffect(() => { refresh('YGN') }, [])

  const handleBranchChange = (code: BranchCode) => {
    setActiveBranch(code)
    loadPickups(code)
    loadNotifications(code)
  }

  const safePickups = pickups ?? []
  const safeNotifs = notifications ?? []
  const kpiCount = (status: string) => safePickups.filter(p => String(p.status ?? '').toLowerCase() === status.toLowerCase()).length
  const unreadCount = safeNotifs.filter(n => !n.is_read).length
  const activeBranchDef = BRANCHES.find(b => b.code === activeBranch) ?? BRANCHES[0]
  const activeNodes = (branchNodes ?? []).filter(n => n.branch_code === activeBranch && n.is_active)

  const kpis = [
    { label:'Active Pickups', value:kpiCount('submitted') + kpiCount('assigned'), color:C.info },
    { label:'Pending Dispatch', value:kpiCount('pending'), color:C.gold },
    { label:'In Warehouse', value:kpiCount('warehouse'), color:C.orange },
    { label:'Delivered Today', value:kpiCount('delivered'), color:C.success },
    { label:'Exceptions', value:kpiCount('exception'), color:C.error },
  ]

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>Branch Office Portal</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Multi-branch operations, pickup registry, notifications, and branch snapshots.</p>
        </div>
        <button onClick={() => refresh(activeBranch)} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, color:C.text2, fontSize:13, fontFamily:FF.body, fontWeight:600, cursor:'pointer' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:18 }}>
        {(BRANCHES ?? []).map(b => {
          const isActive = b.code === activeBranch
          return (
            <button key={b.code} onClick={() => handleBranchChange(b.code)} style={{ padding:'9px 14px', borderRadius:10, border:`1px solid ${isActive ? b.color : C.border}`, background:isActive ? `${b.color}22` : 'transparent', color:isActive ? b.color : C.text2, fontFamily:FF.body, fontSize:13, fontWeight:600, cursor:'pointer' }}>
              {b.code} · {b.name}
            </button>
          )
        })}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <MapPin size={13} color={activeBranchDef.color} />
          <span style={{ fontFamily:FF.body, fontSize:14, color:activeBranchDef.color }}>{activeBranchDef.label}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:16, marginLeft:'auto', flexWrap:'wrap' }}>
          {lastSync && <div style={{ display:'flex', alignItems:'center', gap:5, fontFamily:FF.body, fontSize:12, color:C.muted }}><Clock size={12} /> Last sync: {lastSync.toLocaleTimeString()}</div>}
          <div style={{ display:'flex', alignItems:'center', gap:5, fontFamily:FF.body, fontSize:12, color:C.muted }}><Users size={12} /> {loadingNodes ? '—' : activeNodes.length + ' active node(s)'}</div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14, marginBottom:18 }}>
        {(kpis ?? []).map(k => <KpiCard key={k.label} label={k.label} value={k.value} color={k.color} loading={loadingPickups} />)}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 340px', gap:16, alignItems:'start' }}>
        <div style={{ ...cardSty, overflow:'hidden' }}>
          <div style={{ padding:'16px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
            <div>
              <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 4px' }}>Pickup Registry</h2>
              <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, margin:0 }}>Source: be_portal_pickup_requests — {!loadingPickups && safePickups.length + ' row(s)'}</p>
            </div>
            <span style={{ display:'inline-flex', padding:'4px 10px', borderRadius:999, background:`${activeBranchDef.color}22`, color:activeBranchDef.color, border:`1px solid ${activeBranchDef.color}44`, fontFamily:FF.body, fontSize:12, fontWeight:700 }}>{activeBranch}</span>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF.body }}>
              <thead>
                <tr>
                  {['Pickup ID','Merchant','Township','Parcels','Status','Assigned To','Created'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loadingPickups ? (
                  <tr><td colSpan={7} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>Loading pickups...</td></tr>
                ) : safePickups.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState message={'No pickup requests for ' + activeBranchDef.label + '.'} /></td></tr>
                ) : (
                  (safePickups ?? []).map((p, i) => {
                    const sc = statusStyle(p.status)
                    return (
                      <tr key={p.id ?? i} style={{ background:i%2===0 ? C.panel : C.panel2 }}>
                        <td style={{ ...tdStyle, color:C.info }}>{p.pickup_id ?? '—'}</td>
                        <td style={{ ...tdStyle, color:C.text }}>{p.merchant_name ?? '—'}</td>
                        <td style={tdStyle}>{p.township ?? '—'}</td>
                        <td style={tdStyle}>{p.parcel_count ?? '—'}</td>
                        <td style={tdStyle}><span style={{ display:'inline-flex', padding:'4px 10px', borderRadius:999, background:sc.bg, color:sc.color, border:`1px solid ${sc.border}`, fontFamily:FF.body, fontSize:12, fontWeight:600 }}>{p.status ?? '—'}</span></td>
                        <td style={tdStyle}>{p.assigned_to ?? '—'}</td>
                        <td style={tdStyle}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ ...cardSty, padding:18 }}>
            <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 14px' }}>Branch Snapshot</h2>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                { label:'Branch Code', value:activeBranchDef.code, color:activeBranchDef.color },
                { label:'Coverage', value:activeBranchDef.name, color:C.text },
                { label:'Active Nodes', value:loadingNodes ? '—' : String(activeNodes.length), color:C.success },
                { label:'Total Requests', value:loadingPickups ? '—' : String(safePickups.length), color:C.info },
                { label:'Resolved From', value:resolveBranch(activeBranchDef.name), color:C.gold },
              ].map(item => (
                <div key={item.label} style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
                  <span style={{ fontFamily:FF.body, fontSize:14, color:C.muted }}>{item.label}</span>
                  <span style={{ fontFamily:FF.body, fontSize:14, color:item.color, fontWeight:600 }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...cardSty, padding:18 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <MapPin size={14} color={activeBranchDef.color} />
              <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:0 }}>Operation Area</h2>
            </div>
            {activeBranchDef.townships.length > 0 ? (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {(activeBranchDef.townships ?? []).map(t => <div key={t} style={{ fontFamily:FF.body, fontSize:14, color:C.text2 }}>{t}</div>)}
              </div>
            ) : (
              <p style={{ fontFamily:FF.body, fontSize:14, color:C.text2, margin:0 }}>Yangon and all townships not covered by MDY or NPT branches.</p>
            )}
          </div>

          <div style={{ ...cardSty, overflow:'hidden' }}>
            <div style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Bell size={14} color={C.info} />
                <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:0 }}>Branch Notifications</h2>
              </div>
              {unreadCount > 0 && <span style={{ display:'inline-flex', padding:'4px 10px', borderRadius:999, background:`${C.info}22`, color:C.info, border:`1px solid ${C.info}44`, fontFamily:FF.body, fontSize:12, fontWeight:700 }}>{unreadCount} new</span>}
            </div>
            <div style={{ maxHeight:260, overflowY:'auto' }}>
              {loadingNotifs ? <EmptyState message="Loading..." /> : safeNotifs.length === 0 ? <EmptyState message="No notifications for this branch." /> : (safeNotifs ?? []).map(n => <NotifItem key={n.id} n={n} />)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...cardSty, padding:18, marginTop:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
          <AlertTriangle size={14} color={C.gold} />
          <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:0 }}>Branch Resolution Rules</h2>
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'8px 28px' }}>
          {[
            { rule:'Contains "Mandalay"', branch:'MDY', color:C.gold },
            { rule:'Contains "Naypyitaw" or "Naypyidaw"', branch:'NPT', color:C.success },
            { rule:'All others (default)', branch:'YGN', color:C.info },
          ].map(item => (
            <div key={item.branch} style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ display:'inline-flex', padding:'4px 10px', borderRadius:8, background:`${item.color}22`, color:item.color, border:`1px solid ${item.color}44`, fontFamily:FF.body, fontSize:12, fontWeight:700 }}>{item.branch}</span>
              <span style={{ fontFamily:FF.body, fontSize:14, color:C.text2 }}>{item.rule}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
