// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, Headphones, RefreshCw, Search, Send, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  acknowledgeCustomerVoice,
  closeCustomerVoice,
  confirmCustomerVoice,
  createCustomerVoice,
  escalateCustomerVoice,
  loadCustomerServiceParcels,
  markCustomerVoiceSeen,
  reopenCustomerVoice,
  resolveCustomerVoice,
  superadminOverrideCustomerVoiceRoute,
  updateCustomerVoiceAction,
} from '@/customerService/customerVoiceApi';
import { customerVoiceDepartmentLabel } from '@/customerService/customerVoiceRouting';
import type {
  CustomerServiceParcelSupportRow,
  CustomerVoiceDepartment,
  CustomerVoiceIssueType,
  CustomerVoicePriority,
  CustomerVoiceSourceChannel,
} from '@/customerService/customerVoiceTypes';

const C = {
  bg: '#061524', panel: '#0b2236', panel2: '#0d2941', border: '#1a3a5c', text: '#eef8ff',
  sub: '#9cc2d9', gold: '#f6b84b', green: '#34d399', red: '#f87171', blue: '#60a5fa',
};

const issueTypes: CustomerVoiceIssueType[] = [
  'INQUIRY','REQUEST','COMPLAINT','REDELIVERY','ADDRESS_CORRECTION','LOCATION_CORRECTION',
  'COD_ISSUE','PAYMENT_ISSUE','PARCEL_MISSING','WAREHOUSE_ISSUE','RIDER_ISSUE','PICKUP_ISSUE','OTHER',
];
const departments: CustomerVoiceDepartment[] = ['operations','data_entry','warehouse','finance','pickup_supervisor'];
const channels: CustomerVoiceSourceChannel[] = ['phone','viber','messenger','email','counter','merchant','rider','internal','other'];
const priorities: CustomerVoicePriority[] = ['low','medium','high','urgent'];

const safe = (v: unknown, fallback = '-') => String(v ?? '').trim() || fallback;
const money = (v: unknown) => `${Number(v || 0).toLocaleString()} Ks`;
const dt = (v: unknown) => v ? new Date(String(v)).toLocaleString() : '-';
const normalizeRole = (v: unknown) => String(v || '').trim().toLowerCase().replace(/[ _-]+/g, '_');

function card(label: string, value: React.ReactNode) {
  return <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:16, padding:14 }}>
    <div style={{ color:C.sub, fontSize:12 }}>{label}</div><strong style={{ color:C.gold, fontSize:20 }}>{value}</strong>
  </div>;
}

export default function CustomerServicePortalPage() {
  const [rows, setRows] = useState<CustomerServiceParcelSupportRow[]>([]);
  const [summary, setSummary] = useState({ total_records:0, open_voices:0, escalated:0, urgent:0 });
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedWayId, setSelectedWayId] = useState('');
  const [voices, setVoices] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyVoice, setBusyVoice] = useState('');
  const [role, setRole] = useState('');
  const [draft, setDraft] = useState({ sourceChannel:'phone', issueType:'INQUIRY', priority:'medium', text:'', dueAt:'' });
  const [workflowNote, setWorkflowNote] = useState<Record<string,string>>({});
  const [escalationDepartment, setEscalationDepartment] = useState<Record<string,string>>({});
  const [overrideDepartment, setOverrideDepartment] = useState<Record<string,string>>({});

  const selectedRow = useMemo(() => rows.find(r => r.delivery_way_id === selectedWayId) || null, [rows, selectedWayId]);
  const isSuperadmin = ['superadmin','super_admin','app_owner','sys'].includes(normalizeRole(role));

  async function load(search = query) {
    setLoading(true); setErr('');
    try {
      const payload = await loadCustomerServiceParcels(search);
      setRows(payload.rows); setSummary(payload.summary);
      if (selectedWayId && !payload.rows.some(r => r.delivery_way_id === selectedWayId)) setSelectedWayId('');
    } catch (e:any) { setErr(e?.message || 'Could not load Customer Service parcels.'); }
    finally { setLoading(false); }
  }

  async function loadRole() {
    try {
      const { data } = await supabase.rpc('be_current_user_role');
      setRole(typeof data === 'string' ? data : data?.role || data?.current_role || '');
    } catch { setRole(''); }
  }

  async function loadDetail(wayId: string) {
    if (!wayId) return;
    setDetailLoading(true); setErr('');
    try {
      const { data: voiceRows, error: voiceError } = await supabase
        .from('be_customer_voices').select('*').eq('delivery_way_id', wayId).order('created_at', { ascending:false });
      if (voiceError) throw voiceError;
      const nextVoices = Array.isArray(voiceRows) ? voiceRows : [];
      setVoices(nextVoices);
      const ids = nextVoices.map(v => v.id).filter(Boolean);
      if (!ids.length) { setActions([]); return; }
      const { data: actionRows, error: actionError } = await supabase
        .from('be_customer_voice_actions').select('*').in('customer_voice_id', ids).order('created_at', { ascending:false });
      if (actionError) throw actionError;
      setActions(Array.isArray(actionRows) ? actionRows : []);
    } catch (e:any) { setErr(e?.message || 'Could not load parcel support history.'); }
    finally { setDetailLoading(false); }
  }

  useEffect(() => { void load(''); void loadRole(); }, []);
  useEffect(() => { if (selectedWayId) void loadDetail(selectedWayId); }, [selectedWayId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => [r.pickup_id,r.delivery_way_id,r.recipient_name,r.recipient_phone,r.township,r.merchant_name,r.assigned_rider_name,r.parcel_status]
      .join(' ').toLowerCase().includes(q));
  }, [rows, query]);

  async function refreshAffected() {
    await load(query);
    if (selectedWayId) await loadDetail(selectedWayId);
  }

  async function submitVoice() {
    if (!selectedRow || !draft.text.trim()) return setErr('Customer Voice text is required.');
    setBusyVoice('create'); setErr(''); setNotice('');
    try {
      const result = await createCustomerVoice({
        deliveryWayId:selectedRow.delivery_way_id,
        customerName:selectedRow.recipient_name || undefined,
        customerPhone:selectedRow.recipient_phone || undefined,
        sourceChannel:draft.sourceChannel as CustomerVoiceSourceChannel,
        issueType:draft.issueType as CustomerVoiceIssueType,
        priority:draft.priority as CustomerVoicePriority,
        customerVoiceText:draft.text.trim(),
        dueAt:draft.dueAt || undefined,
        idempotencyKey:`cs-${selectedRow.delivery_way_id}-${Date.now()}`,
        context:{ parcel_status:selectedRow.parcel_status, township:selectedRow.township },
      });
      setNotice(`Customer Voice created and routed to ${customerVoiceDepartmentLabel(result.route || result.current_department)}.`);
      setDraft({ sourceChannel:'phone', issueType:'INQUIRY', priority:'medium', text:'', dueAt:'' });
      await refreshAffected();
    } catch (e:any) { setErr(e?.message || 'Could not create Customer Voice.'); }
    finally { setBusyVoice(''); }
  }

  async function runVoiceAction(voice:any, op:string) {
    const note = (workflowNote[voice.id] || '').trim();
    setBusyVoice(voice.id); setErr(''); setNotice('');
    try {
      if (op === 'seen') await markCustomerVoiceSeen(voice.id);
      else if (op === 'ack') await acknowledgeCustomerVoice(voice.id, note || undefined);
      else if (op === 'progress') { if (!note) throw new Error('Action note is required.'); await updateCustomerVoiceAction(voice.id, note, 'IN_PROGRESS'); }
      else if (op === 'action') { if (!note) throw new Error('Action note is required.'); await updateCustomerVoiceAction(voice.id, note, 'ACTION_TAKEN'); }
      else if (op === 'resolve') { if (!note) throw new Error('Resolution note is required.'); await resolveCustomerVoice(voice.id, note); }
      else if (op === 'confirm') await confirmCustomerVoice(voice.id, note || undefined);
      else if (op === 'close') await closeCustomerVoice(voice.id, note || undefined);
      else if (op === 'escalate') { if (!note) throw new Error('Escalation reason is required.'); await escalateCustomerVoice(voice.id, note, (escalationDepartment[voice.id] || undefined) as CustomerVoiceDepartment | undefined); }
      else if (op === 'reopen') { if (!note) throw new Error('Reopen reason is required.'); await reopenCustomerVoice(voice.id, note); }
      else if (op === 'override') {
        if (!isSuperadmin) throw new Error('Superadmin Override is required.');
        const department = overrideDepartment[voice.id] as CustomerVoiceDepartment;
        if (!department || !note) throw new Error('New department and override reason are required.');
        if (!window.confirm(`Confirm Superadmin Override to ${customerVoiceDepartmentLabel(department)}?`)) return;
        await superadminOverrideCustomerVoiceRoute(voice.id, department, note);
      }
      setWorkflowNote(v => ({ ...v, [voice.id]:'' }));
      setNotice(op === 'escalate' ? 'Escalated. Current ownership remains unchanged until Superadmin Override.' : 'Customer Voice workflow updated.');
      await refreshAffected();
    } catch (e:any) { setErr(e?.message || 'Customer Voice action failed.'); }
    finally { setBusyVoice(''); }
  }

  const timeline = selectedRow ? [
    ['Parcel', selectedRow.parcel_status, selectedRow.updated_at],
    ['Warehouse', selectedRow.latest_warehouse_event || selectedRow.warehouse_status, selectedRow.latest_warehouse_event_at],
    ['Operations', selectedRow.latest_operation_event || selectedRow.operation_status, selectedRow.latest_operation_event_at],
    ['Waybill Status', selectedRow.latest_status_event, selectedRow.latest_status_event_at],
    ['Finance', selectedRow.finance_status, selectedRow.updated_at],
  ].filter(([,status]) => status) : [];

  return <main data-be-page="cs-portal" style={{ minHeight:'100vh', background:C.bg, color:C.text, padding:20, overflow:'auto' }}>
    <section style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:20, padding:18, marginBottom:16 }}>
      <div style={{ color:C.gold, fontWeight:900, letterSpacing:'0.22em', fontSize:12 }}>CUSTOMER SERVICE</div>
      <h1 style={{ display:'flex', gap:10, alignItems:'center', margin:'8px 0' }}><Headphones size={22}/> Parcel Support & Customer Voice</h1>
      <p style={{ color:C.sub, margin:0 }}>Parcel-centric live support queue. Routing is automatic; only Superadmin may override ownership.</p>
      <div style={{ display:'flex', gap:10, marginTop:14, flexWrap:'wrap' }}>
        <button onClick={() => void load()} disabled={loading} style={{ background:C.gold, border:0, borderRadius:12, padding:'10px 14px', fontWeight:900 }}><RefreshCw size={15}/> {loading?'Loading...':'Refresh'}</button>
        <div style={{ position:'relative', flex:1, minWidth:260 }}><Search size={16} style={{ position:'absolute', left:12, top:12, color:C.sub }}/><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') void load(query); }} placeholder="Search Way ID, pickup, customer, phone, township..." style={{ width:'100%', padding:'11px 12px 11px 36px', borderRadius:12, border:`1px solid ${C.border}`, background:C.bg, color:C.text }}/></div>
        <div style={{ color:C.sub, alignSelf:'center' }}>Role: <b style={{ color:C.text }}>{safe(role,'Unknown')}</b></div>
      </div>
    </section>

    {err && <div style={{ color:C.red, marginBottom:12, border:`1px solid ${C.red}`, borderRadius:12, padding:12 }}>{err}</div>}
    {notice && <div style={{ color:C.green, marginBottom:12, border:`1px solid ${C.green}`, borderRadius:12, padding:12 }}>{notice}</div>}

    <section style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:12, marginBottom:16 }}>
      {card('Total Parcels', summary.total_records)}{card('Open Voices', summary.open_voices)}{card('Escalated', summary.escalated)}{card('Urgent', summary.urgent)}
    </section>

    <section style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:20, padding:16, overflowX:'auto', marginBottom:16 }}>
      <table style={{ width:'100%', minWidth:1500, borderCollapse:'collapse' }}><thead><tr style={{ background:C.gold, color:C.bg }}>
        {['Pickup ID','Delivery Way ID','Live Status','Recipient','Phone','Township','Rider / Assignment','Open Voices','Current Owner','Latest Customer Voice','Latest Internal Action','Priority','SLA / Due','Escalation','Action'].map(x=><th key={x} style={{ padding:10, textAlign:'left' }}>{x}</th>)}
      </tr></thead><tbody>
        {filtered.map(row => <tr key={row.delivery_way_id} style={{ borderTop:`1px solid ${C.border}`, background:selectedWayId===row.delivery_way_id?'rgba(96,165,250,.08)':'transparent' }}>
          <td style={{ padding:10 }}>{safe(row.pickup_id)}</td><td style={{ padding:10, color:C.gold, fontWeight:800 }}>{safe(row.delivery_way_id)}</td><td style={{ padding:10 }}>{safe(row.parcel_status)}</td>
          <td style={{ padding:10 }}>{safe(row.recipient_name)}</td><td style={{ padding:10 }}>{safe(row.recipient_phone)}</td><td style={{ padding:10 }}>{safe(row.township)}</td>
          <td style={{ padding:10 }}>{safe(row.assigned_rider_name || row.assigned_driver_name)}<br/><span style={{ color:C.sub }}>{safe(row.assigned_vehicle_plate,'')}</span></td>
          <td style={{ padding:10 }}>{row.open_voice_count || 0}</td><td style={{ padding:10 }}>{customerVoiceDepartmentLabel(row.current_owner_department)}</td>
          <td style={{ padding:10, maxWidth:240 }}>{safe(row.latest_customer_voice)}</td><td style={{ padding:10, maxWidth:240 }}>{safe(row.latest_internal_action)}</td>
          <td style={{ padding:10 }}>{safe(row.latest_priority)}</td><td style={{ padding:10 }}>{dt(row.sla_due_at)}</td>
          <td style={{ padding:10 }}>{row.escalation_flag?<span style={{ color:C.red }}><AlertTriangle size={15}/> Escalated</span>:'-'}</td>
          <td style={{ padding:10 }}><button onClick={()=>setSelectedWayId(row.delivery_way_id)} style={{ background:C.blue, color:C.bg, border:0, borderRadius:9, padding:'8px 10px', fontWeight:800 }}>Open <ChevronRight size={14}/></button></td>
        </tr>)}
        {!filtered.length && <tr><td colSpan={15} style={{ padding:30, textAlign:'center', color:C.sub }}>No Customer Service parcels found.</td></tr>}
      </tbody></table>
    </section>

    {selectedRow && <section style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:20, padding:18 }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}><div><div style={{ color:C.gold, fontWeight:900 }}>PARCEL DETAIL</div><h2 style={{ margin:'5px 0' }}>{selectedRow.delivery_way_id}</h2></div><button onClick={()=>setSelectedWayId('')} style={{ border:`1px solid ${C.border}`, background:C.bg, color:C.sub, borderRadius:9, padding:'8px 12px' }}>Close Detail</button></div>
      {detailLoading && <p style={{ color:C.sub }}>Loading parcel history...</p>}

      <h3>Parcel Summary</h3><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:10 }}>
        {card('Recipient',safe(selectedRow.recipient_name))}{card('Phone',safe(selectedRow.recipient_phone))}{card('Township',safe(selectedRow.township))}{card('Merchant',safe(selectedRow.merchant_name))}{card('Rider',safe(selectedRow.assigned_rider_name))}{card('COD',money(selectedRow.cod_amount))}{card('Collected',money(selectedRow.actual_collect))}{card('Finance',safe(selectedRow.finance_status))}
      </div>

      <h3>Status Timeline</h3><div style={{ display:'grid', gap:8 }}>{timeline.map(([source,status,at])=><div key={String(source)} style={{ background:C.panel2, border:`1px solid ${C.border}`, borderRadius:12, padding:10 }}><b>{source}</b> — {safe(status)} <span style={{ color:C.sub }}>· {dt(at)}</span></div>)}</div>

      <h3>Customer Voices</h3><div style={{ display:'grid', gap:12 }}>
        {voices.map(v => <div key={v.id} style={{ background:C.panel2, border:`1px solid ${C.border}`, borderRadius:14, padding:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}><b>{v.issue_type} · {v.priority}</b><span style={{ color:C.sub }}>{dt(v.created_at)}</span></div>
          <p style={{ margin:'8px 0' }}>{v.customer_voice_text}</p><div style={{ color:C.sub }}>Status: <b style={{ color:C.text }}>{v.workflow_status}</b> · Current Owner: <b style={{ color:C.text }}>{customerVoiceDepartmentLabel(v.current_department)}</b></div>
          <textarea value={workflowNote[v.id] || ''} onChange={e=>setWorkflowNote(s=>({...s,[v.id]:e.target.value}))} placeholder="Action / resolution / escalation / reopen / override note" rows={2} style={{ width:'100%', marginTop:10, borderRadius:9, border:`1px solid ${C.border}`, background:C.bg, color:C.text, padding:9 }}/>
          <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginTop:8 }}>
            <button disabled={busyVoice===v.id} onClick={()=>void runVoiceAction(v,'seen')}>Mark Seen</button><button disabled={busyVoice===v.id} onClick={()=>void runVoiceAction(v,'ack')}>Acknowledge</button><button disabled={busyVoice===v.id} onClick={()=>void runVoiceAction(v,'progress')}>Start / In Progress</button><button disabled={busyVoice===v.id} onClick={()=>void runVoiceAction(v,'action')}>Action Taken</button><button disabled={busyVoice===v.id} onClick={()=>void runVoiceAction(v,'resolve')}>Resolve</button><button disabled={busyVoice===v.id} onClick={()=>void runVoiceAction(v,'confirm')}>CS Confirm</button><button disabled={busyVoice===v.id} onClick={()=>void runVoiceAction(v,'close')}>Close</button>
          </div>
          <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginTop:8 }}><select value={escalationDepartment[v.id] || ''} onChange={e=>setEscalationDepartment(s=>({...s,[v.id]:e.target.value}))}><option value="">Requested department (optional)</option>{departments.map(d=><option key={d} value={d}>{customerVoiceDepartmentLabel(d)}</option>)}</select><button disabled={busyVoice===v.id} onClick={()=>void runVoiceAction(v,'escalate')}>Escalate</button><button disabled={busyVoice===v.id} onClick={()=>void runVoiceAction(v,'reopen')}>Reopen</button></div>
          {isSuperadmin && <div style={{ borderTop:`1px solid ${C.border}`, marginTop:10, paddingTop:10 }}><div style={{ display:'flex', gap:6, alignItems:'center', color:C.gold, fontWeight:900 }}><ShieldCheck size={16}/> Superadmin Override</div><div style={{ display:'flex', gap:7, flexWrap:'wrap', marginTop:7 }}><select value={overrideDepartment[v.id] || ''} onChange={e=>setOverrideDepartment(s=>({...s,[v.id]:e.target.value}))}><option value="">New department</option>{departments.map(d=><option key={d} value={d}>{customerVoiceDepartmentLabel(d)}</option>)}</select><button disabled={busyVoice===v.id} onClick={()=>void runVoiceAction(v,'override')}>Superadmin Override</button></div></div>}
        </div>)}
        {!voices.length && <div style={{ color:C.sub }}>No Customer Voices recorded for this parcel.</div>}
      </div>

      <h3>Internal Action History</h3><div style={{ display:'grid', gap:8 }}>{actions.map(a=><div key={a.id} style={{ background:C.panel2, border:`1px solid ${C.border}`, borderRadius:10, padding:10 }}><b>{safe(a.action_type)}</b> · {safe(a.from_status,'')} → {safe(a.to_status,'')}<div>{safe(a.action_note,'')}</div><small style={{ color:C.sub }}>{dt(a.created_at)}</small></div>)}{!actions.length && <div style={{ color:C.sub }}>No internal actions yet.</div>}</div>

      <h3>Add Customer Voice</h3><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:9 }}>
        <label>Source Channel<select value={draft.sourceChannel} onChange={e=>setDraft(d=>({...d,sourceChannel:e.target.value}))}>{channels.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <label>Issue Type<select value={draft.issueType} onChange={e=>setDraft(d=>({...d,issueType:e.target.value}))}>{issueTypes.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <label>Priority<select value={draft.priority} onChange={e=>setDraft(d=>({...d,priority:e.target.value}))}>{priorities.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <label>Due / Callback<input type="datetime-local" value={draft.dueAt} onChange={e=>setDraft(d=>({...d,dueAt:e.target.value}))}/></label>
      </div><textarea value={draft.text} onChange={e=>setDraft(d=>({...d,text:e.target.value}))} placeholder="Customer instruction, complaint, correction, redelivery request, COD concern..." rows={4} style={{ width:'100%', marginTop:10, borderRadius:10, border:`1px solid ${C.border}`, background:C.bg, color:C.text, padding:10 }}/><button disabled={busyVoice==='create' || !draft.text.trim()} onClick={()=>void submitVoice()} style={{ marginTop:9, background:C.gold, border:0, borderRadius:10, padding:'10px 14px', fontWeight:900 }}><Send size={15}/> {busyVoice==='create'?'Submitting...':'Add Customer Voice'}</button>
    </section>}
  </main>;
}
