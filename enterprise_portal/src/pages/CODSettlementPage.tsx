// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import {
  Search, RefreshCw, DollarSign, Layers, AlertTriangle,
  ShieldAlert, Package, Download
} from 'lucide-react'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const badge = (s: string): React.CSSProperties => {
  const m: Record<string,any> = { active:{bg:'#052e16',c:'#22c55e',b:'#166534'}, completed:{bg:'#052e16',c:'#22c55e',b:'#166534'}, paid:{bg:'#052e16',c:'#22c55e',b:'#166534'}, pending:{bg:'#451a03',c:'#f59e0b',b:'#92400e'}, processing:{bg:'#082f49',c:'#38bdf8',b:'#0c4a6e'}, failed:{bg:'#4a0521',c:'#ff4f86',b:'#831843'}, unpaid:{bg:'#4a0521',c:'#ff4f86',b:'#831843'} }
  const v = m[s?.toLowerCase()] ?? {bg:C.panel2,c:C.muted,b:C.border}
  return { display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, fontFamily:FF.body, textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap', background:v.bg, color:v.c, border:`1px solid ${v.b}` }
}

const btnBase: React.CSSProperties = { display:'inline-flex', alignItems:'center', gap:8, padding:'9px 14px', borderRadius:10, border:`1px solid ${C.border}`, background:C.panel2, color:C.text2, fontFamily:FF.body, fontSize:13, fontWeight:600, cursor:'pointer' }
const cardStyle: React.CSSProperties = { background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }

const COD_STATUSES = [
  { key: 'PENDING_COLLECTION', label: 'Pending Collection', color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' },
  { key: 'COLLECTED',          label: 'Collected',          color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  { key: 'AWAITING_HANDOVER',  label: 'Awaiting Handover',  color: '#facc15', bg: 'rgba(250,204,21,0.12)' },
  { key: 'SUBMITTED',          label: 'Submitted',          color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)' },
  { key: 'UNDER_VERIFICATION', label: 'Under Verification', color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
  { key: 'HANDED_OVER',        label: 'Handed Over',        color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
  { key: 'SHORTAGE',           label: 'Shortage',           color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  { key: 'EXCESS',             label: 'Excess',             color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  { key: 'DISPUTED',           label: 'Disputed',           color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  { key: 'LOCKED',             label: 'Locked',             color: '#c084fc', bg: 'rgba(192,132,252,0.12)' },
] as const

const MERCHANT_STATUSES = [
  { label: 'Pending',               color: '#9ca3af' },
  { label: 'Ready for Settlement',  color: '#60a5fa' },
  { label: 'Transferred',           color: '#4ade80' },
  { label: 'Partially Transferred', color: '#2dd4bf' },
  { label: 'On Hold',               color: '#fb923c' },
  { label: 'Reconciled',            color: '#34d399' },
  { label: 'Disputed',              color: '#f87171' },
  { label: 'Closed',                color: '#a3a3a3' },
]

const EXCEPTIONS = [
  { type: 'Short Cash', example: 'Rider collected 15,000 MMK but submitted 12,000 MMK' },
  { type: 'Wrong COD Amount', example: 'Invoice says 8,000 MMK but receiver paid 10,000 MMK' },
  { type: 'No Proof / Missing POD', example: 'Handover submitted without signed receipt' },
  { type: 'Wrong Parcel', example: 'COD collected for Waybill A but attributed to Waybill B' },
  { type: 'Failed Delivery with COD Collected', example: 'Delivery marked failed but COD cash retained by rider' },
  { type: 'Duplicate Handover', example: 'Same batch submitted twice on different shifts' },
]

function statusBadge(status: string) {
  const s = (status ?? '').toUpperCase().replace(/ /g, '_')
  const found = COD_STATUSES.find(c => c.key === s)
  if (found) return <span style={{ ...badge(found.label), background: found.bg, color: found.color, border:`1px solid ${found.color}33` }}>{found.label}</span>
  const mFound = MERCHANT_STATUSES.find(m => m.label.toUpperCase().replace(/ /g, '_') === s || m.label.toUpperCase() === (status ?? '').toUpperCase())
  if (mFound) return <span style={{ ...badge(mFound.label), background: 'rgba(255,255,255,0.07)', color: mFound.color, border:`1px solid ${mFound.color}33` }}>{mFound.label}</span>
  return <span style={badge(status)}>{status}</span>
}

const TABS = ['COD Handover Tracker', 'Settlement Batches', 'Cash Exceptions'] as const
type Tab = (typeof TABS)[number]

export default function CODSettlementPage() {
  const [codRows, setCodRows]   = useState<any[]>([])
  const [batches, setBatches]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<Tab>('COD Handover Tracker')
  const [search, setSearch]     = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [codRes, settRes] = await Promise.all([
        supabase.from('cod_deliveries').select('*').order('created_at', { ascending: false }),
        supabase.from('settlement_batches').select('*').order('created_at', { ascending: false }),
      ])
      setCodRows(codRes.data ?? [])
      setBatches(settRes.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [refreshKey])

  const statusCount = (key: string) =>
    (codRows ?? []).filter(r => (r.cod_status ?? r.status ?? '').toUpperCase().replace(/ /g, '_') === key).length

  const statusAmount = (key: string) =>
    (codRows ?? []).filter(r => (r.cod_status ?? r.status ?? '').toUpperCase().replace(/ /g, '_') === key)
      .reduce((s, r) => s + (r.cod_amount ?? 0), 0)

  const filteredCod = (codRows ?? []).filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (r.delivery_id ?? r.id ?? '').toString().toLowerCase().includes(q) ||
      (r.receiver_name ?? '').toLowerCase().includes(q) ||
      (r.rider_name ?? '').toLowerCase().includes(q) ||
      (r.batch_ref ?? r.batch_id ?? '').toLowerCase().includes(q) ||
      (r.merchant_code ?? r.merchant_name ?? '').toLowerCase().includes(q)
    )
  })

  const totalCOD = (codRows ?? []).reduce((s, r) => s + (r.cod_amount ?? 0), 0)
  const openBatches = (batches ?? []).filter(r => !['TRANSFERRED','CLOSED','RECONCILED'].includes((r.status ?? '').toUpperCase())).length
  const disputeCount = statusCount('DISPUTED')
  const shortageCount = statusCount('SHORTAGE')

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px} @media print{body{background:white;color:black}}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0, lineHeight:1.2 }}>COD SETTLEMENT CENTER</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Track rider handovers, merchant settlement batches, and cash verification exceptions.</p>
        </div>
        <button onClick={() => setRefreshKey(k => k + 1)} style={btnBase}>
          <RefreshCw size={15} style={loading ? { animation:'spin 0.8s linear infinite' } : undefined} />
          Refresh
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom:20 }}>
        {[
          { label:'Total COD Pool', value: totalCOD.toLocaleString() + ' MMK', icon:<DollarSign size={15} />, color:C.gold },
          { label:'Open Batches', value: openBatches, icon:<Layers size={15} />, color:C.info },
          { label:'Disputed Cases', value: disputeCount, icon:<AlertTriangle size={15} />, color:C.error },
          { label:'Shortage Cases', value: shortageCount, icon:<ShieldAlert size={15} />, color:C.warning },
        ].map(k => (
          <div key={k.label} style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:'18px 20px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>{k.label}</div>
              <div style={{ color:k.color }}>{k.icon}</div>
            </div>
            <div style={{ fontSize:24, fontWeight:700, color:C.gold }}>{loading ? '—' : k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ ...cardStyle, marginBottom:20 }}>
        <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 16px' }}>Rider COD Handover Status — 10 States</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:12 }}>
          {COD_STATUSES.map(s => (
            <div key={s.key} style={{ borderRadius:12, padding:14, background:s.bg, border:`1px solid ${s.color}22` }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:6 }}>{s.label}</div>
              <div style={{ fontSize:24, fontWeight:700, color:C.gold }}>{loading ? '—' : statusCount(s.key)}</div>
              <div style={{ fontSize:13.5, color:C.text2, marginTop:4 }}>{loading ? '' : statusAmount(s.key).toLocaleString() + ' K'}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom:20, background:'rgba(56,189,248,0.05)' }}>
        <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 16px' }}>Reference Formats</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:16 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:6 }}>Rider Handover Ref Format</div>
            <div style={{ fontSize:14, color:C.text2, fontFamily:FF.body }}>RH{'{MMDD}'}-{'{RIDER_ID}'}-{'{MERCHANT_CODE}'}-{'{SEQUENCE}'}</div>
            <div style={{ fontSize:13.5, color:C.muted, marginTop:4 }}>e.g. RH0525-RD009-BBK-001</div>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:6 }}>Finance Settlement Batch Ref Format</div>
            <div style={{ fontSize:14, color:C.text2, fontFamily:FF.body }}>SET{'{MMDD}'}-{'{MERCHANT_CODE}'}-{'{SEQUENCE}'}</div>
            <div style={{ fontSize:13.5, color:C.muted, marginTop:4 }}>e.g. SET0525-BBK-001</div>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom:20 }}>
        <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 16px' }}>Merchant Settlement Status Pipeline</h2>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
          {MERCHANT_STATUSES.map((m, i) => (
            <React.Fragment key={m.label}>
              <span style={{ ...badge(m.label), background:`${m.color}18`, color:m.color, border:`1px solid ${m.color}33` }}>{m.label}</span>
              {i < MERCHANT_STATUSES.length - 1 && <span style={{ color:C.muted, fontSize:12 }}>→</span>}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div style={{ position:'relative', marginBottom:20 }}>
        <Search size={14} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:C.muted }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search delivery ID, receiver, rider, merchant or batch ref…"
          style={{ width:'100%', padding:'11px 14px 11px 38px', borderRadius:10, border:`1px solid ${C.border}`, background:C.panel2, color:C.text2, fontSize:14, fontFamily:FF.body }}
        />
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ ...btnBase, background: tab === t ? C.panelHover : C.panel2, color: tab === t ? C.gold : C.text2, border:`1px solid ${tab === t ? C.gold : C.border}` }}>{t}</button>
        ))}
      </div>

      {tab === 'COD Handover Tracker' && (
        <div style={cardStyle}>
          <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 16px' }}>COD Handover Tracker</h2>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF.body }}>
              <thead><tr>{['DELIVERY ID', 'RIDER', 'MERCHANT', 'COD AMOUNT', 'COD STATUS', 'COLLECTED AT', 'HANDOVER REF'].map(h => <th key={h} style={{ padding:'10px 14px', background:C.panel2, color:C.muted, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, whiteSpace:'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ padding:'28px 14px', fontSize:13.5, color:C.muted, textAlign:'center' }}>Loading…</td></tr>
                ) : filteredCod.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding:'32px 14px', fontSize:13.5, color:C.muted, textAlign:'center' }}>No COD delivery records found.</td></tr>
                ) : (
                  (filteredCod ?? []).map((r, i) => (
                    <tr key={r.id ?? i} style={{ background: i % 2 === 0 ? C.panel : C.panel2 }}>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.gold, borderBottom:`1px solid ${C.border}22` }}>{r.delivery_id ?? r.id ?? '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{r.rider_name ?? r.rider_id ?? '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{r.merchant_code ?? r.merchant_name ?? '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{r.cod_amount != null ? Number(r.cod_amount).toLocaleString() : '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{statusBadge(r.cod_status ?? r.status ?? '')}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{r.collected_at ? new Date(r.collected_at).toLocaleString() : '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{r.handover_ref ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Settlement Batches' && (
        <div style={cardStyle}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:16, flexWrap:'wrap' }}>
            <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:0 }}>Settlement Batches</h2>
            <button style={btnBase}><Download size={14} /> Export</button>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF.body }}>
              <thead><tr>{['SETTLEMENT BATCH', 'MERCHANT', 'COD AMOUNT', 'DELIVERY FEE', 'COD FEE', 'NET PAYABLE', 'STATUS', 'TRANSFER DATE'].map(h => <th key={h} style={{ padding:'10px 14px', background:C.panel2, color:C.muted, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, whiteSpace:'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ padding:'28px 14px', fontSize:13.5, color:C.muted, textAlign:'center' }}>Loading…</td></tr>
                ) : batches.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding:'32px 14px', fontSize:13.5, color:C.muted, textAlign:'center' }}>No settlement batches found.</td></tr>
                ) : (
                  (batches ?? []).map((r, i) => (
                    <tr key={r.id ?? i} style={{ background: i % 2 === 0 ? C.panel : C.panel2 }}>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.gold, borderBottom:`1px solid ${C.border}22` }}>{r.batch_ref ?? r.batch_id ?? r.id ?? '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{r.merchant_code ?? r.merchant_name ?? '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{r.cod_amount != null ? Number(r.cod_amount).toLocaleString() : '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{r.delivery_fee != null ? Number(r.delivery_fee).toLocaleString() : '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{r.cod_fee != null ? Number(r.cod_fee).toLocaleString() : '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{r.net_payable != null ? Number(r.net_payable).toLocaleString() : r.total_amount != null ? Number(r.total_amount).toLocaleString() : '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{statusBadge(r.status ?? '')}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{r.transfer_date ? new Date(r.transfer_date).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Cash Exceptions' && (
        <div style={cardStyle}>
          <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 8px' }}>Cash Exceptions</h2>
          <p style={{ fontSize:14, color:C.muted, margin:'0 0 16px' }}>Cash verification exceptions requiring finance review and escalation.</p>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF.body }}>
              <thead><tr>{['EXCEPTION TYPE', 'EXAMPLE SCENARIO', 'ACTION REQUIRED'].map(h => <th key={h} style={{ padding:'10px 14px', background:C.panel2, color:C.muted, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, whiteSpace:'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {(EXCEPTIONS ?? []).map((ex, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? C.panel : C.panel2 }}>
                    <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}><span style={{ ...badge(ex.type), background:'rgba(239,68,68,0.1)', color:'#f87171', border:'1px solid rgba(239,68,68,0.25)' }}>{ex.type}</span></td>
                    <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{ex.example}</td>
                    <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}><span style={{ ...badge('Flag & Escalate'), background:'rgba(251,146,60,0.1)', color:'#fb923c', border:'1px solid rgba(251,146,60,0.25)' }}>Flag & Escalate</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
