// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import {
  RefreshCw, FileText, Search, Printer, FileSpreadsheet,
  CheckCircle2, Clock, XCircle, AlertCircle, RotateCcw,
  ChevronRight,
} from 'lucide-react'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const badge = (s: string): React.CSSProperties => {
  const m: Record<string,any> = { active:{bg:'#052e16',c:'#22c55e',b:'#166534'}, completed:{bg:'#052e16',c:'#22c55e',b:'#166534'}, paid:{bg:'#052e16',c:'#22c55e',b:'#166534'}, pending:{bg:'#451a03',c:'#f59e0b',b:'#92400e'}, processing:{bg:'#082f49',c:'#38bdf8',b:'#0c4a6e'}, failed:{bg:'#4a0521',c:'#ff4f86',b:'#831843'}, unpaid:{bg:'#4a0521',c:'#ff4f86',b:'#831843'} }
  const v = m[s?.toLowerCase()] ?? {bg:C.panel2,c:C.muted,b:C.border}
  return { display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, fontFamily:FF.body, textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap', background:v.bg, color:v.c, border:`1px solid ${v.b}` }
}

const btnBase: React.CSSProperties = { display:'inline-flex', alignItems:'center', gap:8, padding:'9px 14px', borderRadius:10, border:`1px solid ${C.border}`, background:C.panel2, color:C.text2, fontFamily:FF.body, fontSize:13, fontWeight:600, cursor:'pointer' }
const CARD = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12 }

const INV_STATUSES = [
  { key: 'DRAFT', label: 'Draft', color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' },
  { key: 'UNDER_REVIEW', label: 'Under Review', color: '#facc15', bg: 'rgba(250,204,21,0.12)' },
  { key: 'ISSUED', label: 'Issued', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  { key: 'PARTIALLY_PAID', label: 'Partially Paid', color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)' },
  { key: 'PAID', label: 'Paid', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
  { key: 'ON_HOLD', label: 'On Hold', color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
  { key: 'CANCELLED', label: 'Cancelled', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  { key: 'ADJUSTED', label: 'Adjusted', color: '#c084fc', bg: 'rgba(192,132,252,0.12)' },
  { key: 'CLOSED', label: 'Closed', color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
] as const

const WORKFLOW_STEPS = [
  { n: 1, title: 'Draft Generated', desc: 'System auto-generates draft invoice from waybill data' },
  { n: 2, title: 'Operations Confirms', desc: 'Operations confirms delivery count and return count' },
  { n: 3, title: 'Warehouse Confirms', desc: 'Warehouse verifies no missing parcels in batch' },
  { n: 4, title: 'COD Verified', desc: 'COD handover verified and matched against rider records' },
  { n: 5, title: 'Finance Checks', desc: 'Finance reviews fees, deductions, discounts and taxes' },
  { n: 6, title: 'Advance to Under Review', desc: 'Invoice status promoted to Under Review' },
  { n: 7, title: 'Finance Manager Approves', desc: 'Finance Manager gives final approval' },
  { n: 8, title: 'Invoice Issued', desc: 'Invoice formally issued to merchant or customer' },
  { n: 9, title: 'Payment Scheduled', desc: 'Payment or payout scheduled with transfer date' },
  { n: 10, title: 'Reconciled & Closed', desc: 'Invoice reconciled, locked and marked as Closed' },
]

const INVOICE_FIELDS = [
  { field: 'Invoice No', key: 'invoice_no', format: 'I{MMDD}-{MRC}-{SEQ}' },
  { field: 'Merchant ID / Code', key: 'merchant_code', format: '' },
  { field: 'Billing Period', key: 'billing_period', format: '' },
  { field: 'Pickup ID(s)', key: 'pickup_ids', format: '' },
  { field: 'Delivery ID(s)', key: 'delivery_ids', format: '' },
  { field: 'Waybill No(s)', key: 'waybill_nos', format: '' },
  { field: 'Shipment Count', key: 'shipment_count', format: '' },
  { field: 'Delivered Count', key: 'delivered_count', format: '' },
  { field: 'Failed / Returned', key: 'failed_count', format: '' },
  { field: 'COD Collected', key: 'cod_collected', format: 'MMK' },
  { field: 'Delivery Charges', key: 'delivery_charges', format: 'MMK' },
  { field: 'COD Fees', key: 'cod_fees', format: 'MMK' },
  { field: 'Extra Weight Fees', key: 'extra_weight_fees', format: 'MMK' },
  { field: 'Return Fees', key: 'return_fees', format: 'MMK' },
  { field: 'Discounts', key: 'discounts', format: 'MMK' },
  { field: 'Deductions', key: 'deductions', format: 'MMK' },
  { field: 'Net Payable / Receivable', key: 'net_payable', format: 'MMK (calculated)' },
  { field: 'Payment Status', key: 'payment_status', format: '' },
  { field: 'Due Date', key: 'due_date', format: 'YYYY-MM-DD' },
]

function invStatusBadge(status: string) {
  const s = (status ?? '').toUpperCase().replace(/ /g, '_')
  const found = INV_STATUSES.find(c => c.key === s)
  if (found) return <span style={{ ...badge(found.label), background: found.bg, color: found.color, border:`1px solid ${found.color}33` }}>{found.label}</span>
  return <span style={badge(status)}>{status}</span>
}

function statusCount(rows: any[], key: string): number {
  return rows.filter(r => (r.status ?? '').toUpperCase().replace(/ /g, '_') === key).length
}

const TABS = ['Invoice List', 'Invoice Fields', 'Approval Workflow'] as const
type Tab = (typeof TABS)[number]

function StatusStepper() {
  const PIPELINE: Array<{ label: string; color: string; branch?: boolean }> = [
    { label: 'Draft', color: '#9ca3af' },
    { label: 'Under Review', color: '#facc15' },
    { label: 'Issued', color: '#60a5fa' },
    { label: 'Partially Paid', color: '#2dd4bf' },
    { label: 'Paid', color: '#4ade80', branch: true },
    { label: 'On Hold', color: '#fb923c', branch: true },
    { label: 'Cancelled', color: '#ef4444', branch: true },
    { label: 'Adjusted', color: '#c084fc', branch: true },
    { label: 'Closed', color: '#34d399' },
  ]
  return (
    <div style={{ ...CARD, padding:20, marginBottom:20 }}>
      <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 16px' }}>Invoice Status Pipeline</h2>
      <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:8 }}>
        {PIPELINE.map((step, i) => (
          <React.Fragment key={step.label}>
            <span style={{ ...badge(step.label), background:`${step.color}18`, color:step.color, border:`1px solid ${step.color}33` }}>{step.label}</span>
            {i < PIPELINE.length - 1 && <ChevronRight size={11} color={C.muted} />}
          </React.Fragment>
        ))}
      </div>
      <p style={{ fontSize:13.5, color:C.muted, margin:'12px 0 0' }}>After Partially Paid: branch to Paid / On Hold / Cancelled / Adjusted, then merge into Closed.</p>
    </div>
  )
}

export default function InvoiceStudioPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('Invoice List')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const { data } = await supabase.from('finance_transactions').select('*').order('created_at', { ascending: false })
      setInvoices(data ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [refreshKey])

  const draftCount = statusCount(invoices, 'DRAFT')
  const reviewCount = statusCount(invoices, 'UNDER_REVIEW')
  const issuedCount = statusCount(invoices, 'ISSUED')
  const paidCount = statusCount(invoices, 'PAID')
  const overdueCount = invoices.filter(r =>
    (r.status ?? '').toUpperCase() !== 'PAID' &&
    (r.status ?? '').toUpperCase() !== 'CLOSED' &&
    r.due_date && new Date(r.due_date) < new Date()
  ).length

  const filtered = (invoices ?? []).filter(r => {
    const matchSearch = !search ||
      (r.invoice_no ?? r.reference ?? r.id ?? '').toString().toLowerCase().includes(search.toLowerCase()) ||
      (r.merchant_code ?? r.merchant_name ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'ALL' ||
      (r.status ?? '').toUpperCase().replace(/ /g, '_') === filterStatus
    return matchSearch && matchStatus
  })

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px} @media print{body{background:white;color:black}}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0, lineHeight:1.2 }}>INVOICE PRINT STUDIO</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Manage invoice lifecycle — from draft generation to closed reconciliation.</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={() => setRefreshKey(k => k + 1)} style={btnBase}><RefreshCw size={15} style={loading ? { animation:'spin 0.8s linear infinite' } : undefined} /> Refresh</button>
          <button style={btnBase}><FileSpreadsheet size={15} /> CSV</button>
          <button style={btnBase}><Printer size={15} /> Print</button>
          <button style={{ ...btnBase, background:C.gold, color:'#1d1405', border:`1px solid ${C.gold}` }}><FileText size={15} /> Issue Invoice</button>
        </div>
      </div>

      <div style={{ ...CARD, padding:16, marginBottom:20, background:'rgba(246,184,75,0.05)' }}>
        <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:6 }}>Invoice Number Format</div>
        <div style={{ fontSize:14, color:C.gold }}>I{'{MMDD}'}-{'{MERCHANT_CODE_3}'}-{'{SEQUENCE}'}</div>
        <div style={{ fontSize:13.5, color:C.muted, marginTop:4 }}>e.g. I0525-BBK-015</div>
      </div>

      <StatusStepper />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom:20 }}>
        {[
          { label:'Draft', value:draftCount, color:'#9ca3af', icon:<FileText size={14} /> },
          { label:'Under Review', value:reviewCount, color:'#facc15', icon:<Clock size={14} /> },
          { label:'Issued', value:issuedCount, color:'#60a5fa', icon:<AlertCircle size={14} /> },
          { label:'Paid', value:paidCount, color:'#4ade80', icon:<CheckCircle2 size={14} /> },
          { label:'Overdue', value:overdueCount, color:'#ef4444', icon:<XCircle size={14} /> },
        ].map(k => (
          <div key={k.label} style={{ ...CARD, padding:'18px 20px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>{k.label}</div>
              <div style={{ color:k.color }}>{k.icon}</div>
            </div>
            <div style={{ fontSize:24, fontWeight:700, color:C.gold }}>{loading ? '—' : k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ ...btnBase, background: tab === t ? C.panelHover : C.panel2, color: tab === t ? C.gold : C.text2, border:`1px solid ${tab === t ? C.gold : C.border}` }}>{t}</button>
        ))}
      </div>

      {tab === 'Invoice List' && (
        <div style={{ ...CARD, padding:20 }}>
          <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 16px' }}>Invoice List</h2>
          <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:16 }}>
            <div style={{ position:'relative', flex:'1 1 260px', minWidth:220 }}>
              <Search size={13} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:C.muted }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice no, merchant…" style={{ width:'100%', padding:'10px 14px 10px 36px', borderRadius:8, border:`1px solid ${C.border}`, background:C.panel2, color:C.text2, fontSize:14, fontFamily:FF.body }} />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding:'10px 12px', borderRadius:8, border:`1px solid ${C.border}`, background:C.panel2, color:C.text2, fontSize:14, fontFamily:FF.body }}>
              <option value="ALL">All Statuses</option>
              {(INV_STATUSES ?? []).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF.body }}>
              <thead><tr>{['INVOICE NO', 'MERCHANT', 'BILLING PERIOD', 'COD COLLECTED', 'NET PAYABLE', 'STATUS', 'DUE DATE'].map(h => <th key={h} style={{ padding:'10px 14px', background:C.panel2, color:C.muted, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, whiteSpace:'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ padding:'28px 14px', color:C.muted, textAlign:'center', fontSize:13.5 }}>Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding:'32px 14px', color:C.muted, textAlign:'center', fontSize:13.5 }}>No invoices found.</td></tr>
                ) : (
                  (filtered ?? []).map((r, i) => (
                    <tr key={r.id ?? i} style={{ background:i % 2 === 0 ? C.panel : C.panel2 }}>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.gold, borderBottom:`1px solid ${C.border}22` }}>{r.invoice_no ?? r.reference ?? r.id ?? '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{r.merchant_code ?? r.merchant_name ?? '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{r.billing_period ?? (r.created_at ? new Date(r.created_at).toLocaleDateString() : '—')}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{r.cod_collected != null ? Number(r.cod_collected).toLocaleString() : r.amount != null ? Number(r.amount).toLocaleString() : '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{r.net_payable != null ? Number(r.net_payable).toLocaleString() : '—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, borderBottom:`1px solid ${C.border}22` }}>{invStatusBadge(r.status ?? '')}</td>
                      <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{r.due_date ? new Date(r.due_date).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Invoice Fields' && (
        <div style={{ ...CARD, padding:20 }}>
          <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 16px' }}>Invoice Data Schema — All Fields</h2>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF.body }}>
              <thead><tr>{['#', 'FIELD NAME', 'DB KEY', 'FORMAT / NOTE'].map(h => <th key={h} style={{ padding:'10px 14px', background:C.panel2, color:C.muted, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, whiteSpace:'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {(INVOICE_FIELDS ?? []).map((f, i) => (
                  <tr key={f.key} style={{ background:i % 2 === 0 ? C.panel : C.panel2 }}>
                    <td style={{ padding:'11px 14px', fontSize:13.5, color:C.muted, borderBottom:`1px solid ${C.border}22` }}>{i + 1}</td>
                    <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, fontWeight:600, borderBottom:`1px solid ${C.border}22` }}>{f.field}</td>
                    <td style={{ padding:'11px 14px', fontSize:13.5, color:C.gold, borderBottom:`1px solid ${C.border}22` }}>{f.key}</td>
                    <td style={{ padding:'11px 14px', fontSize:13.5, color:C.text2, borderBottom:`1px solid ${C.border}22` }}>{f.format || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Approval Workflow' && (
        <div style={{ ...CARD, padding:20 }}>
          <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 16px' }}>Invoice Approval Workflow — 10 Steps</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
            {(WORKFLOW_STEPS ?? []).map((step, i) => {
              const isLast = i === WORKFLOW_STEPS.length - 1
              const stepColor = step.n <= 2 ? '#9ca3af' : step.n <= 5 ? '#60a5fa' : step.n === 6 ? '#facc15' : step.n === 7 ? '#fb923c' : step.n === 8 ? '#4ade80' : step.n === 9 ? '#2dd4bf' : '#34d399'
              return (
                <div key={step.n} style={{ display:'flex', gap:12 }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, background:`${stepColor}20`, color:stepColor, border:`1px solid ${stepColor}44` }}>{step.n}</div>
                    {!isLast && <div style={{ width:1, flex:1, margin:'4px 0', background:`1px solid ${C.border}` }} />}
                  </div>
                  <div style={{ paddingBottom:16, flex:1 }}>
                    <p style={{ fontSize:14, fontWeight:600, color:stepColor, margin:'0 0 4px' }}>{step.title}</p>
                    <p style={{ fontSize:13.5, color:C.text2, margin:0 }}>{step.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop:16, border:`1px solid ${C.border}`, borderRadius:10, padding:14, background:'rgba(255,255,255,0.03)', display:'flex', flexWrap:'wrap', gap:16 }}>
            {[
              { icon:<RotateCcw size={12} />, label:'Steps 1-5', desc:'Data collection phase', color:'#60a5fa' },
              { icon:<Clock size={12} />, label:'Step 6-7', desc:'Review & approval phase', color:'#facc15' },
              { icon:<CheckCircle2 size={12} />, label:'Step 8-9', desc:'Issuance & payment phase', color:'#4ade80' },
              { icon:<FileText size={12} />, label:'Step 10', desc:'Closure & lock phase', color:'#34d399' },
            ].map(m => (
              <div key={m.label} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ color:m.color }}>{m.icon}</span>
                <div>
                  <p style={{ fontSize:11, fontWeight:700, color:m.color, margin:0 }}>{m.label}</p>
                  <p style={{ fontSize:12, color:C.muted, margin:'2px 0 0' }}>{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
