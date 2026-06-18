// src/pages/CreateDeliveryPage.tsx
// @section: create-delivery-page
import { useState, useEffect } from 'react';
import { fetchMerchantsDropdown, calculateTariff, createDelivery, MerchantOption, TariffResult, CreateDeliveryPayload } from '@/lib/createDeliveryApi';

const N='#0A1628'; const G='#D4AF37';
const TIERS=['Standard','Royal','Commitment'];
const PAYMENTS=['COD','Prepaid','Account Billing','Collect'];
const PRIORITIES=['NORMAL','EXPRESS','SAME_DAY'];

function Field({label,required,children,error}:{label:string;required?:boolean;children:React.ReactNode;error?:string}) {
  return (
    <div style={{marginBottom:16}}>
      <label style={{display:'block',fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'rgba(255,255,255,0.45)',marginBottom:5}}>
        {label}{required&&<span style={{color:'#ef4444',marginLeft:3}}>*</span>}
      </label>
      {children}
      {error&&<div style={{fontSize:11,color:'#ef4444',marginTop:3}}>{error}</div>}
    </div>
  );
}

const inp:React.CSSProperties={width:'100%',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,padding:'9px 12px',color:'#fff',fontSize:13,outline:'none',boxSizing:'border-box'};
const sel:React.CSSProperties={...inp,cursor:'pointer'};

const STEPS=['Service','Sender','Recipient','Parcel','Payment','Review'];

type Form = CreateDeliveryPayload & {product_desc:string; special_notes:string; parcel_count:number;};
const blank:Form={merchant_id:'',merchant_code:'',merchant_name:'',sender_phone:'',pickup_address:'',pickup_township:'',pickup_city:'',recipient_name:'',recipient_phone:'',delivery_township:'',delivery_address:'',service_tier:'Standard',priority:'NORMAL',payment_method:'COD',cod_amount:0,weight_kg:0,highway_dropoff:false,rider_remarks:'',product_desc:'',special_notes:'',parcel_count:1};

export default function CreateDeliveryPage() {
  const [step,setStep]=useState(0);
  const [form,setForm]=useState<Form>(blank);
  const [merchants,setMerchants]=useState<MerchantOption[]>([]);
  const [tariff,setTariff]=useState<TariffResult|null>(null);
  const [loading,setLoading]=useState(false);
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [result,setResult]=useState<{pickup_id:string;deliver_id:string;invoice_no:string;waybill_no:string;branch:string}|null>(null);

  useEffect(()=>{ fetchMerchantsDropdown().then(setMerchants).catch(()=>{}); },[]);

  const set=(k:keyof Form,v:unknown)=>setForm(p=>({...p,[k]:v}));

  const recalcTariff=async()=>{
    if(form.weight_kg>0){
      try{ const t=await calculateTariff(form.service_tier,form.weight_kg,form.highway_dropoff); setTariff(t); }catch{}
    }
  };
  useEffect(()=>{ if(step>=3) recalcTariff(); },[form.service_tier,form.weight_kg,form.highway_dropoff,step]);

  const selectMerchant=(m:MerchantOption)=>{
    setForm(p=>({...p,merchant_id:m.merchant_id,merchant_code:m.merchant_code,merchant_name:m.merchant_name,sender_phone:m.contact_phone,pickup_address:m.pickup_address,pickup_township:m.pickup_township,pickup_city:m.pickup_city,service_tier:m.tariff_tier||p.service_tier,payment_method:m.payment_profile||p.payment_method}));
  };

  const validate=():boolean=>{
    const e:Record<string,string>={};
    if(step===1&&!form.merchant_code) e.merchant_code='Merchant is required';
    if(step===1&&!form.pickup_address) e.pickup_address='Pickup address is required';
    if(step===2&&!form.recipient_name) e.recipient_name='Recipient name is required';
    if(step===2&&!form.recipient_phone) e.recipient_phone='Recipient phone is required';
    if(step===2&&form.recipient_phone&&!/^(09|\+959)[0-9]{7,9}$/.test(form.recipient_phone)) e.recipient_phone='Invalid phone format (09xxxxxxx or +959xxxxxxx)';
    if(step===2&&!form.delivery_address) e.delivery_address='Delivery address is required';
    if(step===3&&form.weight_kg<=0) e.weight_kg='Weight must be greater than 0';
    if(step===4&&form.payment_method==='COD'&&form.cod_amount<=0) e.cod_amount='COD amount is required for COD payment';
    setErrors(e);
    return Object.keys(e).length===0;
  };

  const next=()=>{ if(validate()) setStep(s=>Math.min(s+1,5)); };

  const submit=async()=>{
    setLoading(true);
    try{
      const res=await createDelivery(form);
      if(res.success){ setResult({pickup_id:res.pickup_id,deliver_id:res.deliver_id,invoice_no:res.invoice_no,waybill_no:res.waybill_no,branch:res.branch}); setStep(6); }
    }catch(e:unknown){ setErrors({submit:e instanceof Error?e.message:'Submission failed'}); }
    finally{ setLoading(false); }
  };

  // Success screen
  if(step===6&&result) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'70vh'}}>
      <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(34,197,94,0.3)',borderRadius:16,padding:40,maxWidth:480,width:'100%',textAlign:'center'}}>
        <div style={{fontSize:44,marginBottom:12}}>✅</div>
        <div style={{fontSize:20,fontWeight:800,color:'#22c55e',marginBottom:8}}>Shipment Created</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:24,textAlign:'left'}}>
          {[['Pickup ID',result.pickup_id],['Deliver ID',result.deliver_id],['Invoice No',result.invoice_no],['Waybill No',result.waybill_no],['Branch',result.branch]].map(([l,v])=>(
            <div key={l} style={{background:'rgba(255,255,255,0.04)',borderRadius:8,padding:'12px 14px'}}>
              <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',marginBottom:3}}>{l}</div>
              <div style={{fontSize:13,fontWeight:700,color:G,fontFamily:'monospace'}}>{v}</div>
            </div>
          ))}
        </div>
        <button onClick={()=>{setForm(blank);setResult(null);setStep(0);setTariff(null);}} style={{marginTop:24,background:G,color:N,border:'none',borderRadius:8,padding:'10px 28px',fontSize:13,fontWeight:700,cursor:'pointer'}}>Create Another</button>
      </div>
    </div>
  );

  return (
    <div style={{maxWidth:680,margin:'0 auto',padding:'28px 24px 60px'}}>
      <div style={{marginBottom:28}}>
        <h1 style={{fontSize:22,fontWeight:800,color:'#fff',margin:'0 0 4px'}}>Create Delivery</h1>
        <div style={{fontSize:12,color:'rgba(255,255,255,0.4)'}}>Manual shipment creation — all fields required unless marked optional</div>
      </div>

      {/* Stepper */}
      <div style={{display:'flex',gap:0,marginBottom:32}}>
        {STEPS.map((s,i)=>(
          <div key={s} style={{flex:1,textAlign:'center'}}>
            <div style={{width:28,height:28,borderRadius:'50%',margin:'0 auto 4px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,background:i<step?'#22c55e':i===step?G:'rgba(255,255,255,0.1)',color:i<=step?N:'rgba(255,255,255,0.4)'}}>{i<step?'✓':i+1}</div>
            <div style={{fontSize:10,color:i===step?G:'rgba(255,255,255,0.3)'}}>{s}</div>
            {i<STEPS.length-1&&<div style={{position:'absolute',marginTop:-18,marginLeft:'50%',width:'calc(100% - 28px)',height:2,background:i<step?'#22c55e55':'rgba(255,255,255,0.08)'}}/>}
          </div>
        ))}
      </div>

      <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:14,padding:'24px 28px'}}>
        {/* Step 0: Service */}
        {step===0&&(
          <div>
            <div style={{fontSize:14,fontWeight:700,color:'#fff',marginBottom:20}}>Service Configuration</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <Field label="Service Tier" required>
                <select style={sel} value={form.service_tier} onChange={e=>set('service_tier',e.target.value)}>
                  {TIERS.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
                <div style={{fontSize:11,color:'rgba(255,255,255,0.3)',marginTop:4}}>
                  {form.service_tier==='Standard'?'Free: 0–3 kg | Base: 4,000 MMK':form.service_tier==='Royal'?'Free: 0–5 kg | Base: 4,000 MMK':'Free: 0–5 kg | Base: 3,500 MMK'}
                </div>
              </Field>
              <Field label="Priority" required>
                <select style={sel} value={form.priority} onChange={e=>set('priority',e.target.value)}>
                  {PRIORITIES.map(p=><option key={p} value={p}>{p.replace('_',' ')}</option>)}
                </select>
              </Field>
            </div>
          </div>
        )}

        {/* Step 1: Sender */}
        {step===1&&(
          <div>
            <div style={{fontSize:14,fontWeight:700,color:'#fff',marginBottom:20}}>Merchant / Sender</div>
            <Field label="Select Merchant" required error={errors.merchant_code}>
              <select style={sel} value={form.merchant_id} onChange={e=>{ const m=merchants.find(x=>x.merchant_id===e.target.value); if(m)selectMerchant(m); }}>
                <option value="">— Select Merchant —</option>
                {merchants.map(m=><option key={m.merchant_id} value={m.merchant_id}>{m.merchant_code} · {m.merchant_name}</option>)}
              </select>
            </Field>
            {form.merchant_code&&(
              <div style={{background:'rgba(212,175,55,0.06)',border:'1px solid rgba(212,175,55,0.2)',borderRadius:8,padding:'12px 14px',marginBottom:16,fontSize:12,color:'rgba(255,255,255,0.65)'}}>
                ⚡ Auto-filled from merchant master data
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <Field label="Sender Phone" required>
                <input style={inp} value={form.sender_phone} onChange={e=>set('sender_phone',e.target.value)} placeholder="09xxxxxxxxx"/>
              </Field>
              <Field label="Pickup Township" required>
                <input style={inp} value={form.pickup_township} onChange={e=>set('pickup_township',e.target.value)}/>
              </Field>
              <Field label="Pickup City" required>
                <input style={inp} value={form.pickup_city} onChange={e=>set('pickup_city',e.target.value)} placeholder="Yangon / Mandalay / Naypyitaw"/>
              </Field>
            </div>
            <Field label="Pickup Address" required error={errors.pickup_address}>
              <input style={inp} value={form.pickup_address} onChange={e=>set('pickup_address',e.target.value)} placeholder="Full street address"/>
            </Field>
          </div>
        )}

        {/* Step 2: Recipient */}
        {step===2&&(
          <div>
            <div style={{fontSize:14,fontWeight:700,color:'#fff',marginBottom:20}}>Recipient Details</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <Field label="Recipient Name" required error={errors.recipient_name}>
                <input style={inp} value={form.recipient_name} onChange={e=>set('recipient_name',e.target.value)}/>
              </Field>
              <Field label="Recipient Phone" required error={errors.recipient_phone}>
                <input style={inp} value={form.recipient_phone} onChange={e=>set('recipient_phone',e.target.value)} placeholder="09xxxxxxxxx"/>
              </Field>
              <Field label="Delivery Township" required>
                <input style={inp} value={form.delivery_township} onChange={e=>set('delivery_township',e.target.value)}/>
              </Field>
            </div>
            <Field label="Delivery Address" required error={errors.delivery_address}>
              <input style={inp} value={form.delivery_address} onChange={e=>set('delivery_address',e.target.value)} placeholder="Full street address"/>
            </Field>
          </div>
        )}

        {/* Step 3: Parcel */}
        {step===3&&(
          <div>
            <div style={{fontSize:14,fontWeight:700,color:'#fff',marginBottom:20}}>Parcel Details</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <Field label="Weight (kg)" required error={errors.weight_kg}>
                <input style={inp} type="number" step="0.1" min="0.1" value={form.weight_kg||''} onChange={e=>set('weight_kg',parseFloat(e.target.value)||0)} placeholder="e.g. 1.5"/>
              </Field>
              <Field label="Parcel Count" required>
                <input style={inp} type="number" min="1" value={form.parcel_count} onChange={e=>set('parcel_count',parseInt(e.target.value)||1)}/>
              </Field>
              <Field label="Product Description">
                <input style={inp} value={form.product_desc} onChange={e=>set('product_desc',e.target.value)} placeholder="Brief description"/>
              </Field>
            </div>
            <Field label="Highway Station Drop-off">
              <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontSize:13,color:'rgba(255,255,255,0.75)'}}>
                <input type="checkbox" checked={form.highway_dropoff} onChange={e=>set('highway_dropoff',e.target.checked)} style={{width:16,height:16}}/>
                Yes — add +3,000 MMK highway surcharge
              </label>
            </Field>
            {tariff&&(
              <div style={{background:'rgba(212,175,55,0.08)',border:'1px solid rgba(212,175,55,0.25)',borderRadius:10,padding:'14px 16px',marginTop:8}}>
                <div style={{fontSize:11,color:'rgba(255,255,255,0.4)',marginBottom:8}}>TARIFF CALCULATION</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,fontSize:12}}>
                  {[['Base Fee',tariff.base_fee.toLocaleString()+' MMK'],['Surcharge',tariff.surcharge.toLocaleString()+' MMK'],['Highway',tariff.highway_fee.toLocaleString()+' MMK'],['TOTAL',tariff.total.toLocaleString()+' MMK']].map(([l,v])=>(
                    <div key={l} style={{textAlign:'center'}}>
                      <div style={{fontSize:10,color:'rgba(255,255,255,0.4)'}}>{l}</div>
                      <div style={{fontSize:14,fontWeight:700,color:l==='TOTAL'?G:'#fff'}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Payment */}
        {step===4&&(
          <div>
            <div style={{fontSize:14,fontWeight:700,color:'#fff',marginBottom:20}}>Payment Terms</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <Field label="Payment Method" required>
                <select style={sel} value={form.payment_method} onChange={e=>set('payment_method',e.target.value)}>
                  {PAYMENTS.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              {form.payment_method==='COD'&&(
                <Field label="COD Amount (MMK)" required error={errors.cod_amount}>
                  <input style={inp} type="number" min="0" value={form.cod_amount||''} onChange={e=>set('cod_amount',parseFloat(e.target.value)||0)} placeholder="Amount receiver will pay"/>
                </Field>
              )}
            </div>
            <Field label="Rider Remarks (optional)">
              <textarea style={{...inp,resize:'vertical',height:72,fontFamily:'inherit'} as React.CSSProperties} value={form.rider_remarks} onChange={e=>set('rider_remarks',e.target.value)} placeholder="Special delivery instructions for the rider"/>
            </Field>
          </div>
        )}

        {/* Step 5: Review */}
        {step===5&&(
          <div>
            <div style={{fontSize:14,fontWeight:700,color:'#fff',marginBottom:20}}>Review & Submit</div>
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
              {[['Merchant',`${form.merchant_code} · ${form.merchant_name}`],['Pickup',`${form.pickup_address}, ${form.pickup_township}, ${form.pickup_city}`],['Recipient',`${form.recipient_name} · ${form.recipient_phone}`],['Delivery',`${form.delivery_address}, ${form.delivery_township}`],['Service',`${form.service_tier} | ${form.priority} | ${form.weight_kg} kg`],['Payment',`${form.payment_method}${form.payment_method==='COD'?' · '+form.cod_amount.toLocaleString()+' MMK':''}`],['Tariff',tariff?tariff.total.toLocaleString()+' MMK':'Calculating…']].map(([l,v])=>(
                <div key={l} style={{display:'flex',gap:14,padding:'9px 14px',background:'rgba(255,255,255,0.04)',borderRadius:8,fontSize:13}}>
                  <span style={{width:90,color:'rgba(255,255,255,0.4)',flexShrink:0}}>{l}</span>
                  <span style={{color:'rgba(255,255,255,0.85)'}}>{v}</span>
                </div>
              ))}
            </div>
            {errors.submit&&<div style={{color:'#ef4444',fontSize:13,marginBottom:12,padding:'10px 14px',background:'rgba(239,68,68,0.1)',borderRadius:8}}>{errors.submit}</div>}
          </div>
        )}

        {/* Navigation */}
        <div style={{display:'flex',justifyContent:'space-between',marginTop:24,paddingTop:20,borderTop:'1px solid rgba(255,255,255,0.07)'}}>
          {step>0?<button onClick={()=>setStep(s=>s-1)} style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'9px 20px',color:'rgba(255,255,255,0.7)',fontSize:13,cursor:'pointer'}}>← Back</button>:<div/>}
          {step<5?<button onClick={next} style={{background:G,color:N,border:'none',borderRadius:8,padding:'9px 24px',fontSize:13,fontWeight:700,cursor:'pointer'}}>Next →</button>:
          <button onClick={submit} disabled={loading} style={{background:loading?'rgba(255,255,255,0.1)':G,color:loading?'rgba(255,255,255,0.3)':N,border:'none',borderRadius:8,padding:'9px 28px',fontSize:13,fontWeight:700,cursor:loading?'default':'pointer'}}>
            {loading?'Creating…':'✓ Create Shipment'}
          </button>}
        </div>
      </div>
    </div>
  );
}
