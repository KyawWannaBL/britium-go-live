// src/pages/DispatchCenterPage.tsx
import { useState, useEffect } from 'react';
import { fetchWorkforce, fetchUnassigned, assignShipments, fetchDispatchSummary, WorkerRow, UnassignedRow, DispatchSummary } from '@/lib/dispatchApi';

const G='#D4AF37'; const N='#0A1628';
const inp:React.CSSProperties={background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,padding:'8px 12px',color:'#fff',fontSize:12,outline:'none'};

function PriBadge({p}:{p:string}){ const c=p==='SAME_DAY'?'#f87171':p==='EXPRESS'?'#fbbf24':'rgba(255,255,255,0.35)'; return <span style={{fontSize:9,padding:'2px 7px',borderRadius:20,background:c+'22',color:c,fontWeight:700}}>{p.replace('_',' ')}</span>; }

export default function DispatchCenterPage(){
  const [summary,setSummary]=useState<DispatchSummary|null>(null);
  const [workers,setWorkers]=useState<WorkerRow[]>([]);
  const [unassigned,setUnassigned]=useState<UnassignedRow[]>([]);
  const [selectedShipments,setSelectedShipments]=useState<string[]>([]);
  const [selectedWorker,setSelectedWorker]=useState<WorkerRow|null>(null);
  const [routeLabel,setRouteLabel]=useState('');
  const [assigning,setAssigning]=useState(false);
  const [msg,setMsg]=useState('');
  const [loading,setLoading]=useState(true);

  const load=async()=>{
    setLoading(true);
    try{ const [s,w,u]=await Promise.all([fetchDispatchSummary(),fetchWorkforce(),fetchUnassigned()]); setSummary(s); setWorkers(w); setUnassigned(u); }
    catch{}
    finally{ setLoading(false); }
  };
  useEffect(()=>{ load(); },[]);

  const handleAssign=async()=>{
    if(!selectedShipments.length||!selectedWorker){ setMsg('Select shipments and a worker'); return; }
    setAssigning(true); setMsg('');
    try{
      const r=await assignShipments(selectedShipments,selectedWorker.user_id,selectedWorker.full_name,routeLabel||undefined);
      setMsg('✅ Assigned '+r.assigned+' shipments to '+selectedWorker.full_name);
      setSelectedShipments([]); setSelectedWorker(null); setRouteLabel('');
      await load();
    }catch(e:unknown){ setMsg(e instanceof Error?e.message:'Assignment failed'); }
    finally{ setAssigning(false); }
  };

  return (
    <div style={{maxWidth:1100,margin:'0 auto',padding:'24px 20px 60px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:800,color:'#fff',margin:'0 0 3px'}}>Dispatch Center</h1>
          <div style={{fontSize:12,color:'rgba(255,255,255,0.4)'}}>Workforce management and shipment assignment</div>
        </div>
        <button onClick={load} style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'7px 14px',color:'rgba(255,255,255,0.6)',fontSize:12,cursor:'pointer'}}>↻ Refresh</button>
      </div>

      {/* Summary */}
      {summary&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:24}}>
          {[['Unassigned',summary.unassigned,'#fbbf24'],['In Transit',summary.in_transit,'#60a5fa'],['Delivered Today',summary.delivered_today,'#22c55e'],['Failed Today',summary.failed_today,'#f87171'],['Active Riders',summary.active_riders,G]].map(([l,v,c])=>(
            <div key={String(l)} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'14px 16px'}}>
              <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',marginBottom:5,lineHeight:1.3}}>{l}</div>
              <div style={{fontSize:22,fontWeight:800,color:String(c)}}>{Number(v).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {msg&&<div style={{padding:'10px 14px',background:msg.startsWith('✅')?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',border:'1px solid '+(msg.startsWith('✅')?'rgba(34,197,94,0.3)':'rgba(239,68,68,0.3)'),borderRadius:8,fontSize:12,color:msg.startsWith('✅')?'#22c55e':'#f87171',marginBottom:16}}>{msg}</div>}

      <div style={{display:'grid',gridTemplateColumns:'420px 1fr',gap:20}}>
        {/* Left: Workforce */}
        <div>
          <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,0.4)',marginBottom:10,letterSpacing:'0.08em'}}>WORKFORCE ROSTER</div>
          <div style={{maxHeight:500,overflowY:'auto'}}>
            {loading&&<div style={{color:'rgba(255,255,255,0.3)',fontSize:12,padding:12}}>Loading…</div>}
            {(workers??[]).map(w=>(
              <div key={w.user_id} onClick={()=>setSelectedWorker(s=>s?.user_id===w.user_id?null:w)} style={{padding:'12px 14px',borderRadius:10,marginBottom:8,cursor:'pointer',border:'1px solid '+(selectedWorker?.user_id===w.user_id?'rgba(212,175,55,0.4)':'rgba(255,255,255,0.07)'),background:selectedWorker?.user_id===w.user_id?'rgba(212,175,55,0.06)':'rgba(255,255,255,0.02)',transition:'all .15s'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#fff'}}>{w.full_name}</div>
                  <span style={{fontSize:9,padding:'2px 7px',borderRadius:20,background:w.role==='rider'?'rgba(96,165,250,0.2)':'rgba(167,139,250,0.2)',color:w.role==='rider'?'#60a5fa':'#a78bfa',fontWeight:700}}>{w.role.toUpperCase()}</span>
                </div>
                <div style={{fontSize:11,color:'rgba(255,255,255,0.45)',display:'flex',gap:12}}>
                  <span>{w.phone_number}</span>
                  <span>{w.branch_code}</span>
                  <span style={{color:w.active_assignments>5?'#f87171':w.active_assignments>2?'#fbbf24':'#22c55e'}}>Active: {w.active_assignments}</span>
                  <span style={{color:'rgba(255,255,255,0.3)'}}>Done: {w.delivered_today}</span>
                </div>
                {w.vehicle_type&&<div style={{fontSize:10,color:'rgba(255,255,255,0.3)',marginTop:3}}>{w.vehicle_type}{w.license_plate?' · '+w.license_plate:''}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Unassigned Shipments + Assignment */}
        <div>
          <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,0.4)',marginBottom:10,letterSpacing:'0.08em'}}>
            UNASSIGNED SHIPMENTS ({unassigned.length})
          </div>

          {/* Assignment bar */}
          <div style={{display:'flex',gap:10,marginBottom:14,alignItems:'center',flexWrap:'wrap',padding:'12px 14px',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10}}>
            <div style={{fontSize:12,color:selectedWorker?G:'rgba(255,255,255,0.4)',fontWeight:selectedWorker?700:400}}>
              {selectedWorker?'→ '+selectedWorker.full_name+' ('+selectedWorker.role+')':'Select a worker from roster →'}
            </div>
            <input style={{...inp,width:130}} value={routeLabel} onChange={e=>setRouteLabel(e.target.value)} placeholder="Route label (opt)"/>
            <button onClick={handleAssign} disabled={assigning||!selectedWorker||!selectedShipments.length} style={{background:(!assigning&&selectedWorker&&selectedShipments.length)?G:'rgba(255,255,255,0.08)',color:(!assigning&&selectedWorker&&selectedShipments.length)?N:'rgba(255,255,255,0.3)',border:'none',borderRadius:8,padding:'8px 18px',fontSize:12,fontWeight:700,cursor:(!assigning&&selectedWorker&&selectedShipments.length)?'pointer':'default',marginLeft:'auto'}}>
              {assigning?'Assigning…':'Assign '+selectedShipments.length+' Shipments'}
            </button>
          </div>

          {/* Unassigned list */}
          <div style={{maxHeight:420,overflowY:'auto',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead style={{position:'sticky',top:0,background:'#0f1e35'}}>
                <tr style={{borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
                  <th style={{padding:'8px 10px',width:32}}><input type="checkbox" onChange={e=>setSelectedShipments(e.target.checked?unassigned.map(u=>u.pickup_id):[])}/></th>
                  {['Pickup ID','Merchant','Recipient','Township','Pri','COD','Method'].map(h=><th key={h} style={{padding:'8px 10px',color:'rgba(255,255,255,0.4)',textAlign:'left',whiteSpace:'nowrap'}}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {(unassigned??[]).map(row=>(
                  <tr key={row.pickup_id} style={{borderBottom:'1px solid rgba(255,255,255,0.04)',background:selectedShipments.includes(row.pickup_id)?'rgba(212,175,55,0.05)':'transparent'}}>
                    <td style={{padding:'6px 10px'}}><input type="checkbox" checked={selectedShipments.includes(row.pickup_id)} onChange={e=>setSelectedShipments(p=>e.target.checked?[...p,row.pickup_id]:p.filter(x=>x!==row.pickup_id))}/></td>
                    <td style={{padding:'6px 10px',color:G,fontFamily:'monospace',fontSize:10}}>{row.pickup_id}</td>
                    <td style={{padding:'6px 10px',color:'rgba(255,255,255,0.7)',maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{row.merchant_name}</td>
                    <td style={{padding:'6px 10px',color:'rgba(255,255,255,0.7)',maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{row.recipient_name}</td>
                    <td style={{padding:'6px 10px',color:'rgba(255,255,255,0.5)'}}>{row.delivery_township}</td>
                    <td style={{padding:'6px 10px'}}><PriBadge p={row.priority}/></td>
                    <td style={{padding:'6px 10px',color:row.payment_method==='COD'?'#fbbf24':'rgba(255,255,255,0.4)',textAlign:'right'}}>{row.payment_method==='COD'?row.cod_amount.toLocaleString():'—'}</td>
                    <td style={{padding:'6px 10px',color:'rgba(255,255,255,0.4)'}}>{row.payment_method}</td>
                  </tr>
                ))}
                {unassigned.length===0&&<tr><td colSpan={8} style={{padding:20,textAlign:'center',color:'rgba(255,255,255,0.25)'}}>No unassigned shipments.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
