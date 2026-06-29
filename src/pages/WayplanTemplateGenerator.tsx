import React, { useEffect, useState, useRef } from 'react';
import { Building2, CarFront, Database, MapPinned, Pencil, Plus, RefreshCw, Save, ShieldAlert, CheckCircle2, Loader2, PackageSearch, Trash2, UploadCloud, Users, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import * as XLSX from 'xlsx';

const C = { bg: '#061524', panel: '#0b2236', panel2: '#081b2e', panelHover: '#0f2a42', border: '#1a3a5c', gold: '#f6b84b', text: '#eef8ff', text2: '#c8dff0', muted: '#4d7a9b', success: '#22c55e', error: '#ff4f86', warning: '#f59e0b', info: '#38bdf8' };
const FF = { body: "'Poppins', sans-serif" };

const TRANSLATIONS = {
  en: {
    title: "Enterprise Master Data", subtitle: "Direct frontend registry management. Authorized personnel only.", refresh: "Sync Live Data",
    tabs: { merchants: "Merchants", townships: "Townships", staff: "Workforce", vehicles: "Fleet", assets: "Assets" },
    btnSave: "Save Record", btnUpdate: "Update Record", btnCancel: "Cancel", btnDelete: "Delete", btnEdit: "Edit", btnUpload: "Bulk Upload Templates",
    empty: "No records found in live registry.", unauthorized: "Access Restricted", unauthSub: "You have view-only access. Modification requires Super Admin privileges."
  },
  mm: {
    title: "အခြေခံဒေတာ ဗဟို", subtitle: "စနစ်၏ မူလအချက်အလက်များကို ဤနေရာမှ တိုက်ရိုက်ပြင်ဆင်နိုင်ပါသည်။ ခွင့်ပြုချက်ရှိသူများသာ။", refresh: "ဒေတာ ဆန်းသစ်ရန်",
    tabs: { merchants: "ကုန်သည်များ", townships: "မြို့နယ်များ", staff: "ဝန်ထမ်းများ", vehicles: "ယာဉ်များ", assets: "ပစ္စည်းများ" },
    btnSave: "သိမ်းမည်", btnUpdate: "ပြင်ဆင်မည်", btnCancel: "ပယ်ဖျက်မည်", btnDelete: "ဖျက်မည်", btnEdit: "ပြင်မည်", btnUpload: "ဖိုင်ဖြင့် အများအပြားတင်မည်",
    empty: "မှတ်တမ်းများ မတွေ့ရှိပါ။", unauthorized: "ခွင့်ပြုချက် မရှိပါ", unauthSub: "ကြည့်ရှုရန်သာ ခွင့်ပြုထားပါသည်။ ပြင်ဆင်ရန် Super Admin အဆင့် လိုအပ်ပါသည်။"
  }
};

function getPkValue(row: any, fallbackFields: string[] = ['id']) {
  for (const field of fallbackFields) {
    if (row?.[field] !== undefined && row?.[field] !== null && String(row[field]).trim() !== '') return { field, value: row[field] };
  }
  return { field: 'id', value: row?.id };
}

export default function MasterDataPortal() {
  const { lang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState('merchants');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const [merchantRows, setMerchantRows] = useState<any[]>([]);
  const [townshipRows, setTownshipRows] = useState<any[]>([]);
  const [staffRows, setStaffRows] = useState<any[]>([]);
  const [vehicleRows, setVehicleRows] = useState<any[]>([]);
  const [assetRows, setAssetRows] = useState<any[]>([]);

  const [form, setForm] = useState<any>({});
  const [editingRow, setEditingRow] = useState<any | null>(null);

  const initialize = async () => {
    setLoading(true); setMessage(null);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const email = authData.user?.email || "";
      const userMeta = authData.user?.user_metadata || {};
      setIsSuperAdmin(email.includes('admin') || userMeta.role === 'superadmin' || userMeta.role === 'director');

      // Fully wired data synchronization from Supabase
      const [m, tw, s, v, a] = await Promise.all([
        supabase.from('merchant_master').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('townships').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('be_mobile_workforce_accounts').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('be_fleet_master').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('asset_master').select('*').order('created_at', { ascending: false }).limit(500)
      ]);

      setMerchantRows(m.data || []); setTownshipRows(tw.data || []); setStaffRows(s.data || []); setVehicleRows(v.data || []); setAssetRows(a.data || []);
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setLoading(false); }
  };

  useEffect(() => { void initialize(); }, []);

  const saveRecord = async (table: string, payload: any, pkFields: string[], successMsg: string) => {
    if (!isSuperAdmin) return setMessage({ type: 'error', text: t.unauthorized });
    setSaving(true); setMessage(null);
    try {
      if (editingRow) {
        const { field, value } = getPkValue(editingRow, pkFields);
        const { error } = await supabase.from(table).update(payload).eq(field, value);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).insert(payload);
        if (error) throw error;
      }
      setMessage({ type: 'success', text: successMsg });
      setEditingRow(null); setForm({});
      await initialize();
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setSaving(false); }
  };

  const deleteRecord = async (table: string, row: any, pkFields: string[]) => {
    if (!isSuperAdmin) return;
    if (!window.confirm("Permanently delete this record?")) return;
    setSaving(true); setMessage(null);
    try {
      const { field, value } = getPkValue(row, pkFields);
      const { error } = await supabase.from(table).delete().eq(field, value);
      if (error) throw error;
      setMessage({ type: 'success', text: "Record permanently deleted." });
      await initialize();
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setSaving(false); }
  };

  const inpSty = { width: '100%', height: 44, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0 14px', color: C.text, fontSize: 13, outline: 'none', fontFamily: FF.body };
  const btnSty = (primary=false, danger=false) => ({ height: 42, background: primary ? C.gold : danger ? 'rgba(255,79,134,0.1)' : C.panel2, color: primary ? '#000' : danger ? C.error : C.text, border: `1px solid ${primary ? C.gold : danger ? C.error : C.border}`, borderRadius: 10, padding: '0 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FF.body });

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 24, color: C.text, fontFamily: FF.body }}>
      <div style={{ maxWidth: 1600, margin: '0 auto', display: 'grid', gap: 24 }}>
        
        <header style={{ background: C.panel, border: `1px solid ${C.border}`, padding: 24, borderRadius: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
          <div>
            <div style={{ color: C.gold, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em' }}><Database size={16} className="inline mr-2" /> <span>{t.title}</span></div>
            <p style={{ color: C.muted, margin: '6px 0 0', fontSize: 14, fontWeight: 500 }}>{t.subtitle}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={initialize} disabled={loading} style={btnSty()}>{loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {t.refresh}</button>
          </div>
        </header>

        {message && <div style={{ padding: 18, background: message.type === 'error' ? 'rgba(255,79,134,0.1)' : 'rgba(34,197,94,0.1)', border: `1px solid ${message.type === 'error' ? C.error : C.success}40`, color: message.type === 'error' ? C.error : C.success, borderRadius: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}><CheckCircle2 size={20}/> {message.text}</div>}
        {!isSuperAdmin && !loading && <div style={{ padding: 18, background: 'rgba(245,158,11,0.1)', border: `1px solid ${C.warning}40`, color: C.warning, borderRadius: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}><ShieldAlert size={24} className="shrink-0" /><div><div style={{ fontWeight: 900, fontSize: 15, textTransform: 'uppercase' }}>{t.unauthorized}</div><div style={{ fontSize: 13, marginTop: 4 }}>{t.unauthSub}</div></div></div>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { id: 'merchants', icon: Building2, label: t.tabs.merchants },
            { id: 'townships', icon: MapPinned, label: t.tabs.townships },
            { id: 'staff', icon: Users, label: t.tabs.staff },
            { id: 'vehicles', icon: CarFront, label: t.tabs.vehicles }
          ].map(tab => (
            <button key={tab.id} onClick={() => { setView(tab.id); setEditingRow(null); setForm({}); }} style={{ ...btnSty(view === tab.id), background: view === tab.id ? C.gold : C.panel2 }}>
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 450px) 1fr', gap: 24, alignItems: 'start' }}>
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, padding: 24, opacity: isSuperAdmin ? 1 : 0.5, pointerEvents: isSuperAdmin ? 'auto' : 'none' }}>
            <h2 style={{ fontSize: 18, fontWeight: 900, margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
              {editingRow ? <Pencil size={18} color={C.gold}/> : <Plus size={18} color={C.info}/>} 
              {editingRow ? t.btnEdit : t.btnSave} Record
            </h2>
            
            {view === 'merchants' && (
              <div style={{ display: 'grid', gap: 16 }}>
                <input value={form.merchant_code || ''} onChange={e => setForm({...form, merchant_code: e.target.value})} placeholder="Merchant Code" style={inpSty} />
                <input value={form.merchant_name || ''} onChange={e => setForm({...form, merchant_name: e.target.value})} placeholder="Merchant Name" style={inpSty} />
                <input value={form.phone_primary || ''} onChange={e => setForm({...form, phone_primary: e.target.value})} placeholder="Contact Phone" style={inpSty} />
                <button onClick={() => saveRecord('merchant_master', form, ['merchant_id', 'id'], 'Merchant saved.')} disabled={saving} style={{...btnSty(true), width: '100%', justifyContent: 'center'}}><Save size={18}/> {editingRow ? t.btnUpdate : t.btnSave}</button>
              </div>
            )}

            {view === 'staff' && (
              <div style={{ display: 'grid', gap: 16 }}>
                <input value={form.workforce_code || ''} onChange={e => setForm({...form, workforce_code: e.target.value})} placeholder="Staff Code" style={inpSty} />
                <input value={form.display_name || ''} onChange={e => setForm({...form, display_name: e.target.value})} placeholder="Full Name" style={inpSty} />
                <select value={form.role || ''} onChange={e => setForm({...form, role: e.target.value})} style={inpSty}>
                  <option value="">Select Role</option><option value="RIDER">RIDER</option><option value="DRIVER">DRIVER</option><option value="HELPER">HELPER</option>
                </select>
                <button onClick={() => saveRecord('be_mobile_workforce_accounts', form, ['id', 'workforce_code'], 'Staff saved.')} disabled={saving} style={{...btnSty(true), width: '100%', justifyContent: 'center'}}><Save size={18}/> {editingRow ? t.btnUpdate : t.btnSave}</button>
              </div>
            )}
            
            {editingRow && <button onClick={() => { setEditingRow(null); setForm({}); }} style={{ ...btnSty(), marginTop: 12, width: '100%', justifyContent: 'center' }}><X size={16}/> {t.btnCancel}</button>}
          </div>

          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 800 }}>
            <div style={{ padding: 24, borderBottom: `1px solid ${C.border}`, background: C.panel2 }}><h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>Live Data Registry</h2></div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'grid', gap: 16 }}>
              {view === 'merchants' && merchantRows.map(r => (
                <div key={r.id} style={{ background: C.panel2, border: `1px solid ${C.border}`, padding: 20, borderRadius: 16, display: 'flex', justifyContent: 'space-between' }}>
                  <div><div style={{ fontWeight: 900, fontSize: 16 }}>{r.merchant_name}</div><div style={{ fontSize: 13, color: C.muted }}>{r.merchant_code}</div></div>
                  {isSuperAdmin && <div style={{ display: 'flex', gap: 8 }}><button onClick={() => { setEditingRow(r); setForm(r); }} style={btnSty()}><Pencil size={14}/></button><button onClick={() => deleteRecord('merchant_master', r, ['id', 'merchant_code'])} style={btnSty(false, true)}><Trash2 size={14}/></button></div>}
                </div>
              ))}
              {view === 'staff' && staffRows.map(r => (
                <div key={r.id} style={{ background: C.panel2, border: `1px solid ${C.border}`, padding: 20, borderRadius: 16, display: 'flex', justifyContent: 'space-between' }}>
                  <div><div style={{ fontWeight: 900, fontSize: 16 }}>{r.display_name}</div><div style={{ fontSize: 13, color: C.muted }}>{r.workforce_code} · {r.role}</div></div>
                  {isSuperAdmin && <div style={{ display: 'flex', gap: 8 }}><button onClick={() => { setEditingRow(r); setForm(r); }} style={btnSty()}><Pencil size={14}/></button><button onClick={() => deleteRecord('be_mobile_workforce_accounts', r, ['id', 'workforce_code'])} style={btnSty(false, true)}><Trash2 size={14}/></button></div>}
                </div>
              ))}
              {((view === 'merchants' && merchantRows.length === 0) || (view === 'staff' && staffRows.length === 0)) && !loading && (
                 <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>{t.empty}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}