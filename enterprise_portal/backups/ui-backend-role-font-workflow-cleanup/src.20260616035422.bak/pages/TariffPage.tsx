// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { RefreshCw, Calculator, BookOpen, ChevronRight } from 'lucide-react'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const badge = (s: string): React.CSSProperties => {
  const m: Record<string,any> = { active:{bg:'#052e16',c:'#22c55e',b:'#166534'}, completed:{bg:'#052e16',c:'#22c55e',b:'#166534'}, paid:{bg:'#052e16',c:'#22c55e',b:'#166534'}, pending:{bg:'#451a03',c:'#f59e0b',b:'#92400e'}, processing:{bg:'#082f49',c:'#38bdf8',b:'#0c4a6e'}, failed:{bg:'#4a0521',c:'#ff4f86',b:'#831843'}, unpaid:{bg:'#4a0521',c:'#ff4f86',b:'#831843'} }
  const v = m[s?.toLowerCase()] ?? {bg:C.panel2,c:C.muted,b:C.border}
  return { display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, fontFamily:FF.body, textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap', background:v.bg, color:v.c, border:`1px solid ${v.b}` }
}

interface TariffRow {
  id: string
  township: string | null
  tier: string | null
  base_fee: number | null
  weight_allowance: number | null
  extra_weight_rate: number | null
  highway_fee: number | null
  status: string | null
}

interface CalcResult {
  chargeableWeight: number
  allowance: number
  extraWeight: number
  weightSurcharge: number
  highwayFee: number
  total: number
}

const ALLOWANCE: Record<'Standard' | 'Royal', number> = { Standard: 3, Royal: 5 }
const EXTRA_RATE = 500
const HIGHWAY_RATE = 3000

function calcTariff(tier: 'Standard' | 'Royal', weightKg: number, baseFee: number, isHighway: boolean): CalcResult {
  const chargeableWeight = Math.ceil(weightKg)
  const allowance = ALLOWANCE[tier]
  const extraWeight = Math.max(0, chargeableWeight - allowance)
  const weightSurcharge = extraWeight * EXTRA_RATE
  const highwayFee = isHighway ? HIGHWAY_RATE : 0
  const total = baseFee + weightSurcharge + highwayFee
  return { chargeableWeight, allowance, extraWeight, weightSurcharge, highwayFee, total }
}

const inputSty: React.CSSProperties = { background:C.panel2, border:`1px solid ${C.border}`, borderRadius:8, color:C.text2, padding:'10px 12px', fontSize:14, fontFamily:FF.body, width:'100%' }
const cardSty: React.CSSProperties = { background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20 }
const btnBase: React.CSSProperties = { display:'inline-flex', alignItems:'center', gap:8, padding:'9px 14px', borderRadius:10, border:`1px solid ${C.border}`, background:C.panel2, color:C.text2, fontFamily:FF.body, fontSize:13, fontWeight:600, cursor:'pointer' }

interface ExampleCardProps {
  label: string
  tier: 'Standard' | 'Royal'
  weight: number
  baseFee: number
  highway: boolean
  index: number
}
function ExampleCard({ label, tier, weight, baseFee, highway, index }: ExampleCardProps) {
  const r = calcTariff(tier, weight, baseFee, highway)
  const accent = index === 0 ? C.info : index === 1 ? C.gold : C.success
  return (
    <div style={cardSty}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
        <div style={{ width:24, height:24, borderRadius:6, background:`${accent}22`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontSize:11, fontWeight:700, color:accent }}>{index + 1}</span>
        </div>
        <span style={{ color:C.text2, fontWeight:600, fontSize:14 }}>{label}</span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {[
          ['Tier', tier],
          ['Weight', weight + ' kg'],
          ['Chargeable Wt', 'ceil(' + weight + ') = ' + r.chargeableWeight + ' kg'],
          ['Allowance', r.allowance + ' kg'],
          ['Extra Weight', r.extraWeight + ' kg'],
          ['Weight Surcharge', r.extraWeight + ' x 500 = ' + r.weightSurcharge.toLocaleString() + ' MMK'],
          ['Highway Fee', highway ? '3,000 MMK' : '0 MMK'],
          ['Base Fee', baseFee.toLocaleString() + ' MMK'],
        ].map(([k, v]) => (
          <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:12, fontSize:13.5 }}>
            <span style={{ color:C.muted }}>{k}</span>
            <span style={{ color:C.text2, textAlign:'right' }}>{v}</span>
          </div>
        ))}
        <div style={{ borderTop:`1px solid ${C.border}`, marginTop:4, paddingTop:8, display:'flex', justifyContent:'space-between' }}>
          <span style={{ color:accent, fontWeight:700, fontSize:14 }}>TOTAL TARIFF</span>
          <span style={{ color:accent, fontWeight:800, fontSize:16 }}>{r.total.toLocaleString()} MMK</span>
        </div>
      </div>
    </div>
  )
}

export default function TariffPage() {
  const [rows, setRows] = useState<TariffRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [calcTier, setCalcTier] = useState<'Standard' | 'Royal'>('Standard')
  const [calcWeight, setCalcWeight] = useState<number>(1)
  const [calcBase, setCalcBase] = useState<number>(4000)
  const [calcHighway, setCalcHighway] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.from('be_tariff_master').select('*').order('township', { ascending: true })
      if (err) throw err
      setRows(data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tariff data')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const calc = calcTariff(calcTier, calcWeight, calcBase, calcHighway)
  const safeRows = rows ?? []
  const townships = [...new Set(safeRows.map(r => r.township).filter(Boolean))].length
  const tierCounts = {
    standard: safeRows.filter(r => r.tier?.toLowerCase() === 'standard').length,
    royal: safeRows.filter(r => r.tier?.toLowerCase() === 'royal').length,
  }

  const kpis = [
    { label: 'Townships', value: loading ? '—' : String(townships) },
    { label: 'Tariff Rows', value: loading ? '—' : String(safeRows.length) },
    { label: 'Standard Rows', value: loading ? '—' : String(tierCounts.standard) },
    { label: 'Royal Rows', value: loading ? '—' : String(tierCounts.royal) },
    { label: 'Extra Rate/KG', value: '500 MMK' },
    { label: 'Highway Drop-off', value: '3,000 MMK' },
  ]

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px} @media print{body{background:white;color:black}}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0, lineHeight:1.2 }}>TARIFF MASTER</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>Official delivery tariff schedule — Standard & Royal weight tiers with highway surcharge rules.</p>
        </div>
        <button onClick={load} style={btnBase}><RefreshCw size={15} style={loading ? { animation:'spin 0.8s linear infinite' } : undefined} /> Refresh</button>
      </div>

      <div style={{ ...cardSty, marginBottom:20, display:'flex', flexWrap:'wrap', gap:'8px 24px', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}><BookOpen size={14} color={C.gold} /><span style={{ color:C.gold, fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase' }}>Tariff Rules</span></div>
        {['Standard allowance: 3 kg','Royal allowance: 5 kg','Chargeable: ceil(actual weight)','Extra: max(0, chargeable - allowance)','Surcharge: extra x 500 MMK/kg','Highway drop-off: +3,000 MMK','Total: base + surcharge + highway'].map(rule => (
          <div key={rule} style={{ display:'flex', alignItems:'center', gap:5 }}><ChevronRight size={11} color={C.muted} /><span style={{ fontSize:13.5, color:C.text2 }}>{rule}</span></div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom:20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:'18px 20px' }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8 }}>{k.label}</div>
            <div style={{ fontSize:24, fontWeight:700, color:C.gold }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ ...cardSty, marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:18 }}><Calculator size={17} color={C.info} /><h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:0 }}>Live Tariff Calculator</h2></div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:16, marginBottom:18 }}>
          <div>
            <label style={{ display:'block', marginBottom:8, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>Tier</label>
            <select value={calcTier} onChange={e => setCalcTier(e.target.value as 'Standard' | 'Royal')} style={inputSty}>
              <option value="Standard">Standard (3 kg allowance)</option>
              <option value="Royal">Royal (5 kg allowance)</option>
            </select>
          </div>
          <div>
            <label style={{ display:'block', marginBottom:8, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>Weight (kg)</label>
            <input type="number" min={0} step={0.1} value={calcWeight} onChange={e => setCalcWeight(parseFloat(e.target.value) || 0)} style={inputSty} />
          </div>
          <div>
            <label style={{ display:'block', marginBottom:8, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>Base Fee (MMK)</label>
            <input type="number" min={0} step={100} value={calcBase} onChange={e => setCalcBase(parseFloat(e.target.value) || 0)} style={inputSty} />
          </div>
          <div>
            <label style={{ display:'block', marginBottom:8, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>Highway Drop-off</label>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', paddingTop:10 }}>
              <input type="checkbox" checked={calcHighway} onChange={e => setCalcHighway(e.target.checked)} style={{ width:16, height:16, cursor:'pointer', accentColor:C.gold }} />
              <span style={{ color:C.text2, fontSize:14 }}>Highway station (+3,000 MMK)</span>
            </label>
          </div>
        </div>

        <div style={{ background:'rgba(56,189,248,0.08)', border:'1px solid rgba(56,189,248,0.22)', borderRadius:10, padding:'18px 24px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom:16 }}>
            {[
              { label:'Chargeable Weight', value: calc.chargeableWeight + ' kg', note:'ceil(' + calcWeight + ')' },
              { label:'Allowance', value: calc.allowance + ' kg', note:calcTier + ' tier' },
              { label:'Extra Weight', value: calc.extraWeight + ' kg', note:'max(0, ' + calc.chargeableWeight + ' - ' + calc.allowance + ')' },
              { label:'Weight Surcharge', value: calc.weightSurcharge.toLocaleString() + ' MMK', note:calc.extraWeight + ' kg x 500' },
              { label:'Base Fee', value: calcBase.toLocaleString() + ' MMK', note:'from tariff master' },
              { label:'Highway Fee', value: calc.highwayFee.toLocaleString() + ' MMK', note:calcHighway ? 'selected' : 'not selected' },
            ].map(item => (
              <div key={item.label}>
                <p style={{ fontSize:11, color:C.muted, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:2 }}>{item.label}</p>
                <p style={{ fontSize:14, fontWeight:600, color:C.text2, margin:'0 0 2px' }}>{item.value}</p>
                <p style={{ fontSize:12, color:C.muted, margin:0 }}>{item.note}</p>
              </div>
            ))}
          </div>
          <div style={{ borderTop:'1px solid rgba(56,189,248,0.2)', paddingTop:14, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
            <div>
              <p style={{ fontSize:11, color:C.muted, letterSpacing:'0.08em', fontWeight:700, textTransform:'uppercase', margin:0 }}>Total Tariff</p>
              <p style={{ fontSize:13.5, color:C.text2, margin:'4px 0 0' }}>{calcBase.toLocaleString()} + {calc.weightSurcharge.toLocaleString()} + {calc.highwayFee.toLocaleString()}</p>
            </div>
            <p style={{ fontSize:36, fontWeight:900, color:C.gold, margin:0 }}>{calc.total.toLocaleString()} <span style={{ fontSize:14, fontWeight:500 }}>MMK</span></p>
          </div>
        </div>
      </div>

      <div style={{ marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}><BookOpen size={15} color={C.gold} /><h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:0 }}>Calculation Examples</h2></div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:16 }}>
          <ExampleCard index={0} label="Standard — Light Parcel" tier="Standard" weight={1.5} baseFee={4000} highway={false} />
          <ExampleCard index={1} label="Standard — Heavy + Highway" tier="Standard" weight={6.2} baseFee={4000} highway={true} />
          <ExampleCard index={2} label="Royal — Heavy + Highway" tier="Royal" weight={6.2} baseFee={5000} highway={true} />
        </div>
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <div>
            <h2 style={{ fontFamily:FF.sub, fontSize:18, fontWeight:600, color:C.text2, margin:'0 0 4px' }}>Tariff Master Table</h2>
            <p style={{ color:C.muted, fontSize:14, margin:0 }}>Source: be_tariff_master{!loading && ' — ' + safeRows.length + ' row(s)'}</p>
          </div>
          {error && <span style={{ ...badge('failed'), background:'rgba(255,79,134,0.08)', color:C.error, border:`1px solid ${C.error}33` }}>{error}</span>}
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF.body }}>
            <thead><tr>{['Township', 'Tier', 'Base Fee (MMK)', 'Weight Allowance', 'Extra Rate / kg', 'Highway Fee', 'Status'].map(h => <th key={h} style={{ padding:'10px 14px', background:C.panel2, color:C.muted, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, whiteSpace:'nowrap' }}>{h}</th>)}</tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:C.muted, fontSize:13.5 }}>Loading tariff data…</td></tr>
              ) : safeRows.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign:'center', padding:48, color:C.muted, fontSize:13.5 }}>No tariff data found.</td></tr>
              ) : (
                (safeRows ?? []).map((r, i) => (
                  <tr key={r.id ?? i} style={{ background:i % 2 === 0 ? C.panel : C.panel2 }}>
                    <td style={{ padding:'11px 14px', color:C.text2, fontWeight:500, fontSize:13.5, borderBottom:`1px solid ${C.border}22` }}>{r.township ?? '—'}</td>
                    <td style={{ padding:'11px 14px', fontSize:13.5, borderBottom:`1px solid ${C.border}22` }}><span style={{ ...badge(r.tier ?? ''), background:r.tier?.toLowerCase() === 'royal' ? 'rgba(245,184,75,0.1)' : 'rgba(56,189,248,0.08)', color:r.tier?.toLowerCase() === 'royal' ? C.gold : C.info, border:`1px solid ${r.tier?.toLowerCase() === 'royal' ? C.gold : C.info}33` }}>{r.tier ?? '—'}</span></td>
                    <td style={{ padding:'11px 14px', color:C.gold, fontSize:13.5, fontWeight:600, borderBottom:`1px solid ${C.border}22` }}>{r.base_fee != null ? Number(r.base_fee).toLocaleString() : '—'}</td>
                    <td style={{ padding:'11px 14px', color:C.text2, fontSize:13.5, borderBottom:`1px solid ${C.border}22` }}>{r.weight_allowance != null ? Number(r.weight_allowance) + ' kg' : (r.tier?.toLowerCase() === 'royal' ? '5 kg' : '3 kg')}</td>
                    <td style={{ padding:'11px 14px', color:C.text2, fontSize:13.5, borderBottom:`1px solid ${C.border}22` }}>{r.extra_weight_rate != null ? Number(r.extra_weight_rate).toLocaleString() + ' MMK/kg' : '500 MMK/kg'}</td>
                    <td style={{ padding:'11px 14px', color:C.text2, fontSize:13.5, borderBottom:`1px solid ${C.border}22` }}>{r.highway_fee != null ? Number(r.highway_fee).toLocaleString() + ' MMK' : '3,000 MMK'}</td>
                    <td style={{ padding:'11px 14px', borderBottom:`1px solid ${C.border}22` }}><span style={badge(r.status ?? 'active')}>{r.status ?? 'active'}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
