// src/pages/WaybillInvoicePage.tsx
import { useState, useEffect } from 'react';
import { fetchLabelQueue, markWaybillPrinted, fetchInvoiceList, approveInvoice, LabelRow, InvoiceRow } from '@/lib/waybillInvoiceApi';

const G='#D4AF37'; const N='#0A1628';
type Tab='labels'|'invoices';

function Badge({printed}:{printed:boolean}){
  return printed
    ? <span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'rgba(34,197,94,0.15)',color:'#22c55e'}}>Printed</span>
    : <span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'rgba(251,191,36,0.15)',color:'#fbbf24'}}>Pending</span>;
}
function ApprBadge({approved}:{approved:boolean|null}){
  if(approved===null||approved===undefined) return <span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.5)'}}>Pending</span>;
  return approved
    ? <span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'rgba(34,197,94,0.15)',color:'#22c55e'}}>Approved</span>
    : <span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'rgba(239,68,68,0.15)',color:'#f87171'}}>Rejected</span>;
}

export default function WaybillInvoicePage(){
  const [tab,setTab]=useState<Tab>('labels');
  const [labels,setLabels]=useState<LabelRow[]>([]);
  const [invoices,setInvoices]=useState<InvoiceRow[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [loading,setLoading]=useState(false);
  const [msg,setMsg]=useState('');

  const loadLabels=()=>fetchLabelQueue(undefined,undefined,100).then(setLabels).catch(()=>{});
  const loadInvoices=()=>fetchInvoiceList(undefined,undefined,100).then(setInvoices).catch(()=>{});

  useEffect(()=>{
    if(tab==='labels') loadLabels();
    else loadInvoices();
    setSelected([]);
  },[tab]);

  const handleMarkPrinted=async()=>{
    if(!selected.length) return;
    setLoading(true);
    try{ await markWaybillPrinted(selected); setMsg(selected.length+' waybills marked as printed'); setSelected([]); loadLabels(); }
    catch(e:unknown){ setMsg(e instanceof Error?e.message:'Error'); }
    finally{ setLoading(false); }
  };

  const handleApprove=async(id:string, approved:boolean)=>{
    try{ await approveInvoice(id, approved); loadInvoices(); }
    catch(e:unknown){ setMsg(e instanceof Error?e.message:'Error'); }
  };

  return (
    <div style={{maxWidth:1000,margin:'0 auto',padding:'24px 20px 60px'}}>
      <div style={{marginBottom:24}}>
        <h1 style={{fontSize:20,fontWeight:800,color:'#fff',margin:'0 0 3px'}}>Waybill & Invoice</h1>
        <div style={{fontSize:12,color:'rgba(255,255,255,0.4)'}}>Label print queue and invoice approval workflow</div>
      </div>

      <div style={{display:'flex',gap:4,marginBottom:20}}>
        {(['labels','invoices'] as Tab[]).map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{background:tab===t?'rgba(212,175,55,0.12)':'transparent',border:'1px solid '+(tab===t?'rgba(212,175,55,0.3)':'rgba(255,255,255,0.08)'),borderRadius:8,padding:'7px 16px',color:tab===t?G:'rgba(255,255,255,0.5)',fontSize:12,fontWeight:600,cursor:'pointer'}}>
            {t==='labels'?'🏷️ Label Queue':'💰 Invoice Approval'}
          </button>
        ))}
      </div>

      {msg&&<div style={{padding:'10px 14px',background:'rgba(212,175,55,0.1)',border:'1px solid rgba(212,175,55,0.25)',borderRadius:8,fontSize:12,color:G,marginBottom:14}}>{msg}</div>}

      {/* LABEL QUEUE */}
      {tab==='labels'&&(
        <div>
          <div style={{display:'flex',gap:10,marginBottom:14,alignItems:'center'}}>
            <span style={{fontSize:12,color:'rgba(255,255,255,0.5)'}}>{selected.length} selected</span>
            <button onClick={handleMarkPrinted} disabled={loading||selected.length===0} style={{background:selected.length>0?G:'rgba(255,255,255,0.08)',color:selected.length>0?N:'rgba(255,255,255,0.3)',border:'none',borderRadius:8,padding:'7px 18px',fontSize:12,fontWeight:700,cursor:selected.length>0?'pointer':'default'}}>
              {loading?'Updating…':'🖨 Mark Printed'}
            </button>
          </div>
          <div style={{overflowX:'auto',borderRadius:10,border:'1px solid rgba(255,255,255,0.07)'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead>
                <tr style={{borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
                  <th style={{padding:'9px 10px',width:32}}><input type="checkbox" onChange={e=>setSelected(e.target.checked?labels.map(l=>l.pickup_id):[])}/></th>
                  {['Waybill No','Pickup ID','Merchant','Recipient','Township','Service','Fee (MMK)','COD','Status','Printed'].map(h=><th key={h} style={{padding:'9px 10px',color:'rgba(255,255,255,0.4)',textAlign:'left',whiteSpace:'nowrap'}}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {(labels??[]).map(row=>(
                  <tr key={row.pickup_id} style={{borderBottom:'1px solid rgba(255,255,255,0.04)',background:selected.includes(row.pickup_id)?'rgba(212,175,55,0.05)':'transparent'}}>
                    <td style={{padding:'7px 10px'}}><input type="checkbox" checked={selected.includes(row.pickup_id)} onChange={e=>setSelected(p=>e.target.checked?[...p,row.pickup_id]:p.filter(x=>x!==row.pickup_id))}/></td>
                    <td style={{padding:'7px 10px',color:G,fontFamily:'monospace',fontSize:10}}>{row.waybill_no}</td>
                    <td style={{padding:'7px 10px',color:'rgba(255,255,255,0.5)',fontFamily:'monospace',fontSize:10}}>{row.pickup_id}</td>
                    <td style={{padding:'7px 10px',color:'rgba(255,255,255,0.7)'}}>{row.merchant_name}</td>
                    <td style={{padding:'7px 10px',color:'rgba(255,255,255,0.7)'}}>{row.recipient_name}</td>
                    <td style={{padding:'7px 10px',color:'rgba(255,255,255,0.5)'}}>{row.delivery_township}</td>
                    <td style={{padding:'7px 10px',color:'rgba(255,255,255,0.5)'}}>{row.service_tier}</td>
                    <td style={{padding:'7px 10px',color:'rgba(255,255,255,0.7)',textAlign:'right'}}>{row.delivery_fee.toLocaleString()}</td>
                    <td style={{padding:'7px 10px',color:row.payment_method==='COD'?'#fbbf24':'rgba(255,255,255,0.4)',textAlign:'right'}}>{row.payment_method==='COD'?row.cod_amount.toLocaleString():'—'}</td>
                    <td style={{padding:'7px 10px'}}><span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>{row.status}</span></td>
                    <td style={{padding:'7px 10px'}}><Badge printed={!!row.waybill_printed_at}/></td>
                  </tr>
                ))}
                {labels.length===0&&<tr><td colSpan={11} style={{padding:20,textAlign:'center',color:'rgba(255,255,255,0.25)'}}>No labels in queue.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* INVOICE APPROVAL */}
      {tab==='invoices'&&(
        <div style={{overflowX:'auto',borderRadius:10,border:'1px solid rgba(255,255,255,0.07)'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
            <thead>
              <tr style={{borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
                {['Invoice No','Pickup ID','Merchant','Recipient','Fee (MMK)','COD','Payment','Status','Approval','Actions'].map(h=><th key={h} style={{padding:'9px 12px',color:'rgba(255,255,255,0.4)',textAlign:'left',whiteSpace:'nowrap'}}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {(invoices??[]).map(row=>(
                <tr key={row.pickup_id} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                  <td style={{padding:'7px 12px',color:G,fontFamily:'monospace',fontSize:10}}>{row.invoice_no}</td>
                  <td style={{padding:'7px 12px',color:'rgba(255,255,255,0.5)',fontFamily:'monospace',fontSize:10}}>{row.pickup_id}</td>
                  <td style={{padding:'7px 12px',color:'rgba(255,255,255,0.7)'}}>{row.merchant_name}</td>
                  <td style={{padding:'7px 12px',color:'rgba(255,255,255,0.7)'}}>{row.recipient_name}</td>
                  <td style={{padding:'7px 12px',color:'rgba(255,255,255,0.7)',textAlign:'right'}}>{row.delivery_fee.toLocaleString()}</td>
                  <td style={{padding:'7px 12px',color:row.payment_method==='COD'?'#fbbf24':'rgba(255,255,255,0.4)',textAlign:'right'}}>{row.payment_method==='COD'?row.cod_amount.toLocaleString():'—'}</td>
                  <td style={{padding:'7px 12px',color:'rgba(255,255,255,0.5)'}}>{row.payment_method}</td>
                  <td style={{padding:'7px 12px'}}><span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>{row.status}</span></td>
                  <td style={{padding:'7px 12px'}}><ApprBadge approved={row.invoice_approved}/></td>
                  <td style={{padding:'7px 12px'}}>
                    {row.invoice_approved===null&&(
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={()=>handleApprove(row.pickup_id,true)} style={{background:'rgba(34,197,94,0.15)',border:'1px solid rgba(34,197,94,0.3)',borderRadius:6,padding:'4px 10px',color:'#22c55e',fontSize:10,cursor:'pointer',fontWeight:600}}>✓ Approve</button>
                        <button onClick={()=>handleApprove(row.pickup_id,false)} style={{background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:6,padding:'4px 10px',color:'#f87171',fontSize:10,cursor:'pointer',fontWeight:600}}>✗ Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {invoices.length===0&&<tr><td colSpan={10} style={{padding:20,textAlign:'center',color:'rgba(255,255,255,0.25)'}}>No invoices found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
