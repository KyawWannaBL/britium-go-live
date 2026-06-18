// src/pages/WayManagementPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { fetchWayList, fetchWayDetail, updateWayStatus, initiateReturn, ShipmentRow, WayDetail } from '@/lib/wayManagementApi';

const N='#0A1628'; const G='#D4AF37';

const STATUS_COLORS:Record<string,string>={
  SUBMITTED:'#60a5fa', PICKED_UP:'#a78bfa', IN_TRANSIT:'#34d399',
  DELIVERED:'#22c55e', FAILED_DELIVERY:'#f87171', HOLD:'#fbbf24',
  RETURN_INITIATED:'#fb923c', RETURNED:'#94a3b8', CANCELLED:'#6b7280',
};
const STATUS_LIST=['SUBMITTED','PICKED_UP','IN_TRANSIT','DELIVERED','FAILED_DELIVERY','HOLD','RETURN_INITIATED','RETURNED','CANCELLED'];
const inp:React.CSSProperties={background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,padding:'7px 12px',color:'#fff',fontSize:12,outline:'none'};

function Badge({status}:{status:string}){ const c=STATUS_COLORS[status]||'#94a3b8'; return <span style={{background:c+'22',color:c,border:'1px solid '+c+'44',borderRadius:20,padding:'3px 10px',fontSize:10,fontWeight:700,letterSpacing:'0.06em',whiteSpace:'nowrap'}}>{status.replace(/_/g,' ')}</span>; }

function ActionModal({pickupId,onClose,onDone}:{pickupId:string;onClose:()=>void;onDone:()=>void}) {
  const [mode,setMode]=useState<'status'|'return'|null>(null);
  const [status,setStatus]=useState('');
  const [reason,setReason]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  const submit=async()=>{
    if(!reason.trim()){ setError('Reason is required'); return; }
    if(mode==='status'&&!status){ setError('Select a status'); return; }
    setLoading(true); setError('');
    try{
      if(mode==='status') await updateWayStatus(pickupId,status,reason);
      else await initiateReturn(pickupId,reason);
      onDone();
    }catch(e:unknown){ setError(e instanceof Error?e.message:'Action failed'); }
    finally{ setLoading(false); }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#0f1e35',border:'1px solid rgba(255,255,255,0.12)',borderRadius:16,padding:28,width:440,maxWidth:'90vw'}}>
        <div style={{fontWeight:700,color:'#fff',fontSize:16,marginBottom:20}}>Shipment Action — <span style={{color:G,fontSize:13,fontFamily:'monospace'}}>{pickupId}</span></div>
        {!mode&&(
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {[['status','📋 Update Status','Update shipment status'],['return','↩️ Initiate Return','Return to origin']].map(([m,title,desc])=>(
              <button key={m} onClick={()=>setMode(m as 'status'|'return')} style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,padding:'14px 12px',textAlign:'left',cursor:'pointer',color:'#fff'}}>
                <div style={{fontSize:18,marginBottom:6}}>{title.split(' ')[0]}</div>
                <div style={{fontSize:12,fontWeight:600}}>{title.split(' ').slice(1).join(' ')}</div>
                <div style={{fontSize:11,color:'rgba(255,255,255,0.4)',marginTop:3}}>{desc}</div>
              </button>
            ))}
          </div>
        )}
        {mode&&(
          <div>
            {mode==='status'&&(
              <div style={{marginBottom:14}}>
                <label style={{fontSize:11,color:'rgba(255,255,255,0.45)',display:'block',marginBottom:5}}>NEW STATUS *</label>
                <select style={{...inp,width:'100%'}} value={status} onChange={e=>setStatus(e.target.value)}>
                  <option value="">— Select Status —</option>
                  {STATUS_LIST.filter(s=>!['CANCELLED'].includes(s)).map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                </select>
              </div>
            )}
            <div style={{marginBottom:14}}>
              <label style={{fontSize:11,color:'rgba(255,255,255,0.45)',display:'block',marginBottom:5}}>REASON *</label>
              <textarea style={{...inp,width:'100%',height:72,resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'} as React.CSSProperties} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Enter reason for this action…"/>
            </div>
            {error&&<div style={{color:'#ef4444',fontSize:12,marginBottom:10}}>{error}</div>}
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>{setMode(null);setReason('');setStatus('');setError('');}} style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'8px 18px',color:'rgba(255,255,255,0.7)',fontSize:12,cursor:'pointer'}}>Back</button>
              <button onClick={submit} disabled={loading} style={{background:loading?'rgba(255,255,255,0.1)':G,color:loading?'rgba(255,255,255,0.3)':N,border:'none',borderRadius:8,padding:'8px 22px',fontSize:12,fontWeight:700,cursor:loading?'default':'pointer'}}>
                {loading?'Processing…':'Confirm'}
              </button>
            </div>
          </div>
        )}
        {!mode&&<button onClick={onClose} style={{display:'block',marginTop:16,width:'100%',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'8px',color:'rgba(255,255,255,0.5)',fontSize:12,cursor:'pointer'}}>Cancel</button>}
      </div>
    </div>
  );
}

function Timeline({events}:{events:WayDetail['events']}) {
  return (
    <div style={{padding:'0 4px'}}>
      {(events??[]).length===0&&<div style={{fontSize:12,color:'rgba(255,255,255,0.3)',padding:'16px 0'}}>No events recorded.</div>}
      {(events??[]).map((ev,i)=>(
        <div key={ev.id??i} style={{display:'flex',gap:12,marginBottom:16,position:'relative'}}>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:G,flexShrink:0,marginTop:3}}/>
            {i<(events.length-1)&&<div style={{width:2,flex:1,background:'rgba(255,255,255,0.1)',marginTop:4}}/>}
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:11,fontWeight:700,color:G,letterSpacing:'0.06em'}}>{ev.event_type}</div>
            <div style={{fontSize:12,color:'rgba(255,255,255,0.75)',marginTop:2}}>{ev.description}</div>
            <div style={{fontSize:10,color:'rgba(255,255,255,0.35)',marginTop:3}}>{new Date(ev.created_at).toLocaleString()} · {ev.actor_role}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function WayManagementPage() {
  const [rows,setRows]=useState<ShipmentRow[]>([]);
  const [total,setTotal]=useState(0);
  const [search,setSearch]=useState('');
  const [filterStatus,setFilterStatus]=useState('');
  const [selected,setSelected]=useState<ShipmentRow|null>(null);
  const [detail,setDetail]=useState<WayDetail|null>(null);
  const [loading,setLoading]=useState(false);
  const [detailLoading,setDetailLoading]=useState(false);
  const [showModal,setShowModal]=useState(false);
  const [page,setPage]=useState(0);
  const PAGE_SIZE=30;

  const loadList=useCallback(async()=>{
    setLoading(true);
    try{
      const res=await fetchWayList({status:filterStatus||undefined,search:search||undefined,limit:PAGE_SIZE,offset:page*PAGE_SIZE});
      setRows(res.rows??[]); setTotal(res.total??0);
    }catch{}
    finally{ setLoading(false); }
  },[search,filterStatus,page]);

  useEffect(()=>{ loadList(); },[loadList]);

  const selectShipment=async(row:ShipmentRow)=>{
    setSelected(row); setDetail(null); setDetailLoading(true);
    try{ const d=await fetchWayDetail(row.pickup_id); setDetail(d); }catch{}
    finally{ setDetailLoading(false); }
  };

  const handleActionDone=async()=>{
    setShowModal(false);
    await loadList();
    if(selected) selectShipment(selected);
  };

  const statCounts=rows.reduce((acc,r)=>{ acc[r.status]=(acc[r.status]||0)+1; return acc; },{} as Record<string,number>);
  const topStatuses=['IN_TRANSIT','SUBMITTED','FAILED_DELIVERY','HOLD'];

  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 60px)',overflow:'hidden'}}>
      {/* Top bar */}
      <div style={{padding:'16px 20px 12px',borderBottom:'1px solid rgba(255,255,255,0.07)',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <div>
            <h1 style={{fontSize:18,fontWeight:800,color:'#fff',margin:'0 0 2px'}}>Way Management</h1>
            <div style={{fontSize:11,color:'rgba(255,255,255,0.4)'}}>Shipment Control Tower — {total.toLocaleString()} total shipments</div>
          </div>
          <button onClick={loadList} style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,padding:'7px 14px',color:'rgba(255,255,255,0.75)',fontSize:12,cursor:'pointer'}}>↻ Refresh</button>
        </div>
        {/* Stat pills */}
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {topStatuses.map(s=>(
            <button key={s} onClick={()=>setFilterStatus(f=>f===s?'':s)} style={{background:filterStatus===s?(STATUS_COLORS[s]+'33'):'rgba(255,255,255,0.05)',border:'1px solid '+(filterStatus===s?STATUS_COLORS[s]+'55':'rgba(255,255,255,0.1)'),borderRadius:20,padding:'4px 12px',cursor:'pointer',color:filterStatus===s?STATUS_COLORS[s]:'rgba(255,255,255,0.6)',fontSize:11,fontWeight:600}}>
              {s.replace(/_/g,' ')} {statCounts[s]?<span style={{fontSize:10,opacity:.7}}>({statCounts[s]})</span>:null}
            </button>
          ))}
          {filterStatus&&!topStatuses.includes(filterStatus)&&<button onClick={()=>setFilterStatus('')} style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:20,padding:'4px 12px',cursor:'pointer',color:'rgba(255,255,255,0.5)',fontSize:11}}>✕ Clear filter</button>}
        </div>
      </div>

      {/* Main split panel */}
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        {/* Left: List */}
        <div style={{width:380,flexShrink:0,display:'flex',flexDirection:'column',borderRight:'1px solid rgba(255,255,255,0.07)'}}>
          <div style={{padding:'10px 12px',borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
            <input style={{...inp,width:'100%',boxSizing:'border-box'}} placeholder="Search ID, recipient, waybill, merchant…" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/>
          </div>
          <div style={{flex:1,overflowY:'auto'}}>
            {loading&&<div style={{padding:20,textAlign:'center',color:'rgba(255,255,255,0.3)',fontSize:12}}>Loading…</div>}
            {!loading&&rows.length===0&&<div style={{padding:20,textAlign:'center',color:'rgba(255,255,255,0.3)',fontSize:12}}>No shipments found.</div>}
            {(rows??[]).map(row=>(
              <div key={row.pickup_id} onClick={()=>selectShipment(row)} style={{padding:'12px 14px',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.04)',background:selected?.pickup_id===row.pickup_id?'rgba(212,175,55,0.06)':'transparent',transition:'background .15s'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:5}}>
                  <span style={{fontSize:12,fontWeight:700,color:G,fontFamily:'monospace'}}>{row.pickup_id}</span>
                  <Badge status={row.status}/>
                </div>
                <div style={{fontSize:12,color:'rgba(255,255,255,0.75)',marginBottom:2}}>{row.recipient_name} · {row.recipient_phone}</div>
                <div style={{fontSize:11,color:'rgba(255,255,255,0.4)'}}>{row.delivery_township} · {row.payment_method}{row.payment_method==='COD'?' · '+row.cod_amount.toLocaleString()+' MMK':''}</div>
                <div style={{fontSize:10,color:'rgba(255,255,255,0.25)',marginTop:3}}>{new Date(row.updated_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
          {/* Pagination */}
          {total>PAGE_SIZE&&(
            <div style={{padding:'8px 12px',borderTop:'1px solid rgba(255,255,255,0.07)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <button disabled={page===0} onClick={()=>setPage(p=>p-1)} style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:6,padding:'5px 12px',color:'rgba(255,255,255,0.6)',fontSize:11,cursor:page===0?'default':'pointer',opacity:page===0?.4:1}}>← Prev</button>
              <span style={{fontSize:11,color:'rgba(255,255,255,0.4)'}}>Page {page+1} / {Math.ceil(total/PAGE_SIZE)}</span>
              <button disabled={(page+1)*PAGE_SIZE>=total} onClick={()=>setPage(p=>p+1)} style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:6,padding:'5px 12px',color:'rgba(255,255,255,0.6)',fontSize:11,cursor:(page+1)*PAGE_SIZE>=total?'default':'pointer',opacity:(page+1)*PAGE_SIZE>=total?.4:1}}>Next →</button>
            </div>
          )}
        </div>

        {/* Right: Detail */}
        <div style={{flex:1,overflowY:'auto',padding:'20px 24px'}}>
          {!selected&&(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',color:'rgba(255,255,255,0.2)',fontSize:13}}>
              <div style={{fontSize:36,marginBottom:10}}>🗺️</div>
              <div>Select a shipment to view details</div>
            </div>
          )}
          {selected&&(
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
                <div>
                  <div style={{fontSize:17,fontWeight:800,color:'#fff',marginBottom:4,fontFamily:'monospace'}}>{selected.pickup_id}</div>
                  <div style={{display:'flex',gap:10,alignItems:'center'}}>
                    <Badge status={selected.status}/>
                    <span style={{fontSize:11,color:'rgba(255,255,255,0.35)'}}>Waybill: {selected.waybill_no}</span>
                    <span style={{fontSize:11,color:'rgba(255,255,255,0.35)'}}>{selected.branch_code}</span>
                  </div>
                </div>
                <button onClick={()=>setShowModal(true)} style={{background:G,color:N,border:'none',borderRadius:8,padding:'8px 18px',fontSize:12,fontWeight:700,cursor:'pointer'}}>Actions</button>
              </div>

              {detailLoading&&<div style={{color:'rgba(255,255,255,0.3)',fontSize:12}}>Loading detail…</div>}

              {detail&&!detailLoading&&(
                <div>
                  {/* Info grid */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
                    {[
                      ['Merchant',detail.shipment.merchant_name],
                      ['Recipient',`${detail.shipment.recipient_name} · ${detail.shipment.recipient_phone}`],
                      ['Pickup Address',((detail.shipment as ShipmentRow & { pickup_address?: string | null }).pickup_address) || '—'],
                      ['Delivery Address',`${detail.shipment.delivery_address}, ${detail.shipment.delivery_township}`],
                      ['Payment',`${detail.shipment.payment_method}${detail.shipment.payment_method==='COD'?' · '+detail.shipment.cod_amount.toLocaleString()+' MMK':''}`],
                      ['Delivery Fee',detail.shipment.delivery_fee.toLocaleString()+' MMK'],
                      ['Created',new Date(detail.shipment.created_at).toLocaleString()],
                      ['Updated',new Date(detail.shipment.updated_at).toLocaleString()],
                    ].map(([l,v])=>(
                      <div key={l} style={{background:'rgba(255,255,255,0.03)',borderRadius:8,padding:'10px 12px'}}>
                        <div style={{fontSize:10,color:'rgba(255,255,255,0.35)',marginBottom:3}}>{l}</div>
                        <div style={{fontSize:12,color:'rgba(255,255,255,0.8)'}}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Timeline */}
                  <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'16px 18px'}}>
                    <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,0.4)',letterSpacing:'0.08em',marginBottom:14}}>CARGO EVENT TIMELINE</div>
                    <Timeline events={detail.events}/>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showModal&&selected&&<ActionModal pickupId={selected.pickup_id} onClose={()=>setShowModal(false)} onDone={handleActionDone}/>}
    </div>
  );
}
