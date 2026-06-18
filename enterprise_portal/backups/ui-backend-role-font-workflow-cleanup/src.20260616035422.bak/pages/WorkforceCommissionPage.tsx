// @ts-nocheck
import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { RefreshCw, Bike, Car, HardHat, Users } from 'lucide-react'
import { useLanguage } from '@/contexts/i18n'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

const RATES = [
  { activityKey: 'PICKUP', rider: '+150 MMK', driver: '+75 MMK', helper: '+75 MMK' },
  { activityKey: 'DELIVERY', rider: '+300 MMK', driver: '+150 MMK', helper: '+150 MMK' },
]

const ROLE_FILTERS = ['ALL', 'RIDER', 'DRIVER', 'HELPER'] as const
type RoleFilter = (typeof ROLE_FILTERS)[number]

const sectionTitleStyle = { fontFamily: FF.sub, fontSize: 18, fontWeight: 600, color: C.text2, margin: '0 0 16px' }
const thStyle = { fontFamily: FF.body, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, background: C.panel2, textAlign: 'left', padding: '12px 14px', borderBottom: `1px solid ${C.border}` }
const tdStyle = { fontFamily: FF.body, fontSize: 13.5, color: C.text2, padding: '12px 14px', borderBottom: `1px solid ${C.border}` }
const kpiValueStyle = { fontFamily: FF.body, fontSize: 24, fontWeight: 700, color: C.gold, margin: '6px 0 0' }

export default function WorkforceCommissionPage() {
  const { t, lang } = useLanguage()
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL')

  const fetchRecords = () => {
    setLoading(true)
    supabase
      .from('commission_records')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data: d }) => { setRecords(d ?? []); setLoading(false) })
  }

  useEffect(() => { fetchRecords() }, [])

  const filtered = (records ?? []).filter(r => roleFilter === 'ALL' || (r.role ?? '').toUpperCase() === roleFilter)
  const totalCommission = (records ?? []).reduce((s, r) => s + (r.commission_amount ?? r.commission ?? 0), 0)

  const roleFilterLabel = (f: RoleFilter) => {
    if (f === 'ALL') return t('commission.filter.all')
    if (f === 'RIDER') return lang === 'mm' ? 'ဆိုင်ကယ်စီး' : 'Rider'
    if (f === 'DRIVER') return lang === 'mm' ? 'ယာဉ်မောင်း' : 'Driver'
    if (f === 'HELPER') return lang === 'mm' ? 'အကူ' : 'Helper'
    return f
  }

  const roleColor = (role: string) => {
    const key = (role ?? '').toUpperCase()
    if (key === 'RIDER') return C.info
    if (key === 'DRIVER') return C.orange
    if (key === 'HELPER') return C.success
    return C.muted
  }

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:FF.body }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontFamily:FF.body, fontSize:20, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>{t('commission.title')}</h1>
          <p style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:4, marginBottom:0 }}>{t('commission.subtitle')}</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={fetchRecords} style={{ border:`1px solid ${C.border}`, background:C.panel2, color:C.text2, borderRadius:10, padding:'10px 14px', fontFamily:FF.body, fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
            <RefreshCw size={14} style={loading ? { animation:'spin 1s linear infinite' } : undefined} />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:24, marginBottom:20, textAlign:'center' }}>
        <div style={{ fontFamily:FF.body, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted }}>{t('commission.total')}</div>
        <div style={kpiValueStyle}>{loading ? '—' : totalCommission.toLocaleString()} {!loading && <span style={{ fontSize:16, color:C.text2, fontWeight:600 }}>MMK</span>}</div>
        <div style={{ fontFamily:FF.body, fontSize:14, color:C.muted, marginTop:8 }}>{loading ? '' : `${(records ?? []).length} ${t('common.records')}`}</div>
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
        <h2 style={sectionTitleStyle}>{t('commission.rate_ref')}</h2>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {[
                  { label: t('commission.activity'), icon: null },
                  { label: t('commission.rider'), icon: <Bike size={13} color={C.info} /> },
                  { label: t('commission.driver'), icon: <Car size={13} color={C.orange} /> },
                  { label: t('commission.helper'), icon: <HardHat size={13} color={C.success} /> },
                ].map((col) => (
                  <th key={col.label} style={thStyle}>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>{col.icon}{col.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(RATES ?? []).map((row) => (
                <tr key={row.activityKey}>
                  <td style={{ ...tdStyle, color:C.gold }}>{row.activityKey === 'PICKUP' ? (lang === 'mm' ? 'ကောက်ယူမှု' : 'PICKUP') : (lang === 'mm' ? 'ပို့ဆောင်မှု' : 'DELIVERY')}</td>
                  <td style={tdStyle}>{row.rider}</td>
                  <td style={tdStyle}>{row.driver}</td>
                  <td style={tdStyle}>{row.helper}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lang === 'mm' && (
          <p style={{ fontFamily:FF.body, fontSize:13, color:C.muted, margin:'12px 0 0' }}>
            * PICKUP: ဆိုင်ကယ်စီး ၁၅၀ ကျပ်၊ ယာဉ်မောင်း ၇၅ ကျပ်၊ အကူ ၇၅ ကျပ် | DELIVERY: ဆိုင်ကယ်စီး ၃၀၀ ကျပ်၊ ယာဉ်မောင်း ၁၅၀ ကျပ်၊ အကူ ၁၅၀ ကျပ်
          </p>
        )}
      </div>

      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <Users size={16} color={C.text2} />
            <h2 style={{ ...sectionTitleStyle, margin:0 }}>{t('commission.records')}</h2>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {ROLE_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setRoleFilter(f)}
                style={{
                  border:`1px solid ${roleFilter === f ? C.orange : C.border}`,
                  background:roleFilter === f ? C.orange : C.panel2,
                  color:roleFilter === f ? C.bg : C.text2,
                  borderRadius:10,
                  padding:'8px 12px',
                  fontFamily:FF.body,
                  fontSize:13,
                  fontWeight:600,
                  cursor:'pointer'
                }}
              >
                {roleFilterLabel(f)}
              </button>
            ))}
          </div>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {[t('commission.date'), t('commission.staff'), t('commission.role'), t('commission.activity'), t('commission.amount')].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>{t('common.loading')}</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign:'center', padding:'28px 14px', color:C.muted }}>{t('commission.no_records')}</td>
                </tr>
              ) : (
                (filtered ?? []).map((r, i) => (
                  <tr key={r.id ?? i}>
                    <td style={tdStyle}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                    <td style={tdStyle}>{r.staff_name ?? r.staff ?? '—'}</td>
                    <td style={tdStyle}>
                      <span style={{ border:`1px solid ${roleColor(r.role)}`, color:roleColor(r.role), padding:'4px 10px', borderRadius:999, fontSize:12, fontWeight:600, fontFamily:FF.body }}>
                        {r.role ?? '—'}
                      </span>
                    </td>
                    <td style={tdStyle}>{r.activity ?? r.activity_type ?? '—'}</td>
                    <td style={{ ...tdStyle, color:C.gold }}>
                      {(r.commission_amount ?? r.commission) != null ? Number(r.commission_amount ?? r.commission).toLocaleString() : '—'}
                    </td>
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
