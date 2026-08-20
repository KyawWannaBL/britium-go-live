// src/pages/ReportingPage.tsx
import { useState } from 'react';
import { fetchOperationalReport, fetchFinanceReport, OperationalReport, FinanceReport } from '@/lib/reportingApi';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';

const G='#D4AF37'; const N='#0A1628';
type Mode='operational'|'finance';

const COLORS=['#60a5fa','#34d399','#f87171','#fbbf24','#a78bfa','#fb923c'];
const inp:React.CSSProperties={background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,padding:'8px 12px',color:'#fff',fontSize:12,outline:'none'};

function KPI({label,value,sub,color}:{label:string;value:string|number;sub?:string;color?:string}){
  return (
    <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'16px 18px'}}>
      <div style={{fontSize:11,color:'rgba(255,255,255,0.4)',marginBottom:6,letterSpacing:'0.06em'}}>{label}</div>
      <div style={{fontSize:22,fontWeight:800,color:color||'#fff'}}>{typeof value==='number'?value.toLocaleString():value}</div>
      {sub&&<div style={{fontSize:11,color:'rgba(255,255,255,0.35)',marginTop:3}}>{sub}</div>}
    </div>
  );
}

function exportCSV(data: unknown[], name: string){
  if(!data.length) return;
  const rows = data as Array<Record<string, unknown>>;
  const keys = Object.keys(rows[0] ?? {});
  const csv=[keys.join(','),...rows.map(r=>keys.map(k=>String(r[k]??'')).join(','))].join('\n');
  const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download=name+'.csv'; a.click();
}

export default function ReportingPage(){
  const [mode,setMode]=useState<Mode>('operational');
  const [from,setFrom]=useState(()=>{ const d=new Date(); d.setDate(1); return d.toISOString().split('T')[0]; });
  const [to,setTo]=useState(()=>new Date().toISOString().split('T')[0]);
  const [opReport,setOpReport]=useState<OperationalReport|null>(null);
  const [finReport,setFinReport]=useState<FinanceReport|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  const run=async()=>{
    setLoading(true); setError('');
    try{
      if(mode==='operational') setOpReport(await fetchOperationalReport(from,to));
      else setFinReport(await fetchFinanceReport(from,to));
    }catch(e:unknown){ setError(e instanceof Error?e.message:'Failed to load report'); }
    finally{ setLoading(false); }
  };

  const report = mode==='operational' ? opReport : finReport;

  return (
    <div style={{maxWidth:1050,margin:'0 auto',padding:'24px 20px 60px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:800,color:'#fff',margin:'0 0 3px'}}>Reporting</h1>
          <div style={{fontSize:12,color:'rgba(255,255,255,0.4)'}}>Operational and financial period analysis</div>
        </div>
        {report&&(
          <button onClick={()=>exportCSV((mode==='operational'?(opReport?.by_day??[]):(finReport?.by_merchant??[])),`britium_report_${mode}_${from}_${to}`)} style={{background:'rgba(212,175,55,0.12)',border:'1px solid rgba(212,175,55,0.3)',borderRadius:8,padding:'8px 16px',color:G,fontSize:12,fontWeight:600,cursor:'pointer'}}>↓ Export CSV</button>
        )}
      </div>

      {/* Controls */}
      <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',marginBottom:24,padding:'16px 20px',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12}}>
        <div style={{display:'flex',gap:4}}>
          {(['operational','finance'] as Mode[]).map(m=>(
            <button key={m} onClick={()=>{setMode(m);setOpReport(null);setFinReport(null);}} style={{background:mode===m?'rgba(212,175,55,0.12)':'transparent',border:'1px solid '+(mode===m?'rgba(212,175,55,0.3)':'rgba(255,255,255,0.08)'),borderRadius:8,padding:'7px 14px',color:mode===m?G:'rgba(255,255,255,0.5)',fontSize:12,fontWeight:600,cursor:'pointer',textTransform:'capitalize'}}>{m}</button>
          ))}
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <label style={{fontSize:11,color:'rgba(255,255,255,0.4)'}}>From</label>
          <input style={{...inp,width:130}} type="date" value={from} onChange={e=>setFrom(e.target.value)}/>
          <label style={{fontSize:11,color:'rgba(255,255,255,0.4)'}}>To</label>
          <input style={{...inp,width:130}} type="date" value={to} onChange={e=>setTo(e.target.value)}/>
        </div>
        <button onClick={run} disabled={loading} style={{background:loading?'rgba(255,255,255,0.08)':G,color:loading?'rgba(255,255,255,0.3)':N,border:'none',borderRadius:8,padding:'8px 22px',fontSize:12,fontWeight:700,cursor:loading?'default':'pointer',marginLeft:'auto'}}>
          {loading?'Loading…':'Generate Report'}
        </button>
      </div>

      {error&&<div style={{color:'#f87171',fontSize:13,padding:'10px 14px',background:'rgba(239,68,68,0.1)',borderRadius:8,marginBottom:16}}>{error}</div>}

      {/* Operational Report */}
      {mode==='operational'&&opReport&&(
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
            <KPI label="TOTAL SHIPMENTS" value={opReport.totals.total_shipments}/>
            <KPI label="DELIVERED" value={opReport.totals.delivered} color="#22c55e"/>
            <KPI label="FAILED / RETURNED" value={opReport.totals.failed} color="#f87171"/>
            <KPI label="DELIVERY RATE" value={opReport.totals.delivery_rate_pct+'%'} color={opReport.totals.delivery_rate_pct>=90?'#22c55e':opReport.totals.delivery_rate_pct>=75?'#fbbf24':'#f87171'}/>
            <KPI label="TOTAL FEE EARNED" value={opReport.totals.total_delivery_fee.toLocaleString()+' MMK'} color={G}/>
            <KPI label="COD COLLECTED" value={opReport.totals.total_cod_collected.toLocaleString()+' MMK'} color="#a78bfa"/>
            <KPI label="AVG WEIGHT" value={Number(opReport.totals.avg_weight_kg).toFixed(2)+' kg'}/>
            <KPI label="ON HOLD" value={opReport.totals.on_hold} color="#fbbf24"/>
          </div>

          {/* Daily trend chart */}
          {opReport.by_day.length>0&&(
            <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'18px 20px',marginBottom:20}}>
              <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,0.6)',marginBottom:14}}>DAILY TREND — Shipments & Deliveries</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={opReport.by_day}>
                  <XAxis dataKey="date" tick={{fill:'rgba(255,255,255,0.35)',fontSize:10}} tickFormatter={v=>v.slice(5)}/>
                  <YAxis tick={{fill:'rgba(255,255,255,0.35)',fontSize:10}}/>
                  <Tooltip contentStyle={{background:'#0f1e35',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,fontSize:11}} labelStyle={{color:'rgba(255,255,255,0.6)'}}/>
                  <Legend wrapperStyle={{fontSize:11}}/>
                  <Line type="monotone" dataKey="total" stroke="#60a5fa" strokeWidth={2} dot={false} name="Total"/>
                  <Line type="monotone" dataKey="delivered" stroke="#22c55e" strokeWidth={2} dot={false} name="Delivered"/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* By Tier + By Status */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            {opReport.by_tier.length>0&&(
              <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'16px 18px'}}>
                <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,0.6)',marginBottom:12}}>BY SERVICE TIER</div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={opReport.by_tier} layout="vertical" barSize={18}>
                    <XAxis type="number" tick={{fill:'rgba(255,255,255,0.3)',fontSize:9}}/>
                    <YAxis type="category" dataKey="service_tier" tick={{fill:'rgba(255,255,255,0.5)',fontSize:10}} width={80}/>
                    <Tooltip contentStyle={{background:'#0f1e35',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,fontSize:11}}/>
                    <Bar dataKey="count" fill={G} radius={[0,4,4,0]} name="Shipments"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {opReport.by_status.length>0&&(
              <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'16px 18px'}}>
                <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,0.6)',marginBottom:12}}>BY STATUS</div>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={opReport.by_status} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={60} label={({status,pct})=>status+' '+pct+'%'} labelLine={false}>
                      {opReport.by_status.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                    </Pie>
                    <Tooltip contentStyle={{background:'#0f1e35',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,fontSize:11}}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Finance Report */}
      {mode==='finance'&&finReport&&(
        <div>
          {/* By Payment */}
          <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'16px 20px',marginBottom:20}}>
            <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,0.6)',marginBottom:12}}>BY PAYMENT METHOD</div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
                    {['Payment Method','Shipments','Delivery Fee (MMK)','COD Total (MMK)'].map(h=><th key={h} style={{padding:'8px 12px',color:'rgba(255,255,255,0.4)',textAlign:h==='Payment Method'?'left':'right'}}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(finReport.by_payment??[]).map(row=>(
                    <tr key={row.payment_method} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <td style={{padding:'8px 12px',color:'rgba(255,255,255,0.8)',fontWeight:600}}>{row.payment_method}</td>
                      <td style={{padding:'8px 12px',color:'rgba(255,255,255,0.7)',textAlign:'right'}}>{row.count.toLocaleString()}</td>
                      <td style={{padding:'8px 12px',color:G,textAlign:'right',fontWeight:600}}>{row.total_fee.toLocaleString()}</td>
                      <td style={{padding:'8px 12px',color:'#a78bfa',textAlign:'right'}}>{row.total_cod.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Merchants */}
          <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'16px 20px'}}>
            <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,0.6)',marginBottom:12}}>TOP 20 MERCHANTS BY REVENUE</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={(finReport.by_merchant??[]).slice(0,10)} layout="vertical" barSize={14}>
                <XAxis type="number" tick={{fill:'rgba(255,255,255,0.3)',fontSize:9}} tickFormatter={v=>(v/1000).toFixed(0)+'K'}/>
                <YAxis type="category" dataKey="merchant_code" tick={{fill:'rgba(255,255,255,0.5)',fontSize:9}} width={60}/>
                <Tooltip contentStyle={{background:'#0f1e35',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,fontSize:11}} formatter={(v:number)=>v.toLocaleString()+' MMK'}/>
                <Bar dataKey="total_fee" fill={G} radius={[0,4,4,0]} name="Revenue (MMK)"/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {!report&&!loading&&(
        <div style={{textAlign:'center',padding:'48px 20px',color:'rgba(255,255,255,0.2)',fontSize:13}}>
          <div style={{fontSize:36,marginBottom:10}}>📊</div>
          Select report type and date range, then click Generate Report
        </div>
      )}
    </div>
  );
}
