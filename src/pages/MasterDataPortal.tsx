import React, { useEffect, useState, useRef } from 'react';
import { Building2, CarFront, Database, MapPinned, Pencil, Plus, RefreshCw, Save, ShieldAlert, CheckCircle2, Loader2, PackageSearch, Trash2, Ban, UploadCloud } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import * as XLSX from 'xlsx';

const C = { bg: '#061524', panel: '#0b2236', panel2: '#081b2e', panelHover: '#0f2a42', border: '#1a3a5c', gold: '#f6b84b', text: '#eef8ff', text2: '#c8dff0', muted: '#4d7a9b', success: '#22c55e', error: '#ff4f86', warning: '#f59e0b', info: '#38bdf8' };
const FF = { body: "'Poppins', sans-serif" };

const TRANSLATIONS = {
  en: {
    title: "Enterprise Master Data",
    subtitle: "Direct frontend registry management. Authorized personnel only.",
    refresh: "Sync Live Data",
    tabs: { merchants: "Merchants", townships: "Townships", staff: "Workforce", vehicles: "Fleet", assets: "Assets" },
    btnSave: "Save Record", btnUpdate: "Update Record", btnCancel: "Cancel", btnDelete: "Delete", btnEdit: "Edit", btnBlock: "Block", btnUnblock: "Unblock", btnUpload: "Bulk Upload Templates",
    empty: "No records found in live registry.",
    unauthorized: "Access Restricted",
    unauthSub: "You have view-only access. Modification requires Super Admin privileges.",
    loading: "Synchronizing with Supabase..."
  },
  mm: {
    title: "အခြေခံဒေတာ ဗဟို",
    subtitle: "စနစ်၏ မူလအချက်အလက်များကို ဤနေရာမှ တိုက်ရိုက်ပြင်ဆင်နိုင်ပါသည်။ ခွင့်ပြုချက်ရှိသူများသာ။",
    refresh: "ဒေတာ ဆန်းသစ်ရန်",
    tabs: { merchants: "ကုန်သည်များ", townships: "မြို့နယ်များ", staff: "ဝန်ထမ်းများ", vehicles: "ယာဉ်များ", assets: "ပစ္စည်းများ" },
    btnSave: "သိမ်းမည်", btnUpdate: "ပြင်ဆင်မည်", btnCancel: "ပယ်ဖျက်မည်", btnDelete: "ဖျက်မည်", btnEdit: "ပြင်မည်", btnBlock: "ပိတ်ပင်မည်", btnUnblock: "ပြန်ဖွင့်မည်", btnUpload: "ဖိုင်ဖြင့် အများအပြားတင်မည်",
    empty: "မှတ်တမ်းများ မတွေ့ရှိပါ။",
    unauthorized: "ခွင့်ပြုချက် မရှိပါ",
    unauthSub: "ကြည့်ရှုရန်သာ ခွင့်ပြုထားပါသည်။ ပြင်ဆင်ရန် Super Admin အဆင့် လိုအပ်ပါသည်။",
    loading: "ဒေတာများ ဆွဲယူနေပါသည်..."
  }
};

function getPkValue(row: any, fallbackFields: string[] = ['id']) {
  for (const field of fallbackFields) {
    if (row?.[field] !== undefined && row?.[field] !== null && String(row[field]).trim() !== '') return { field, value: row[field] };
  }
  return { field: 'id', value: row?.id };
}

function normalizeHeader(header: unknown) {
  return String(header || '').trim().toLowerCase().replace(/[\s\-\/]+/g, '_');
}

export default function MasterDataPortal() {
  const { lang, setLang } = useLanguage();
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

  const [merchantForm, setMerchantForm] = useState<any>({});
  const [townshipForm, setTownshipForm] = useState<any>({});
  const [staffForm, setStaffForm] = useState<any>({});
  const [vehicleForm, setVehicleForm] = useState<any>({});
  const [assetForm, setAssetForm] = useState<any>({});
  const [editingRow, setEditingRow] = useState<any | null>(null);

  const initialize = async () => {
    setLoading(true); setMessage(null);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const email = authData.user?.email || "";
      const userMeta = authData.user?.user_metadata || {};
      
      const hasAuthority = email.includes('admin') || userMeta.role === 'superadmin' || userMeta.role === 'director';
      setIsSuperAdmin(hasAuthority);

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

  // --- CSV / EXCEL BULK UPLOAD ENGINE ---
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSaving(true); setMessage(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      
      let totalImported = 0;
      
      // We loop through all sheets in the Excel file (or just the 1 sheet if CSV)
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
        
        if (rawData.length < 2) continue;

        // Auto-detect the actual header row (ignoring instructional title rows)
        let headerRowIdx = 0;
        for (let i = 0; i < Math.min(5, rawData.length); i++) {
          const rowStr = JSON.stringify(rawData[i]).toLowerCase();
          if (rowStr.includes('code') || rowStr.includes('id') || rowStr.includes('name')) {
            headerRowIdx = i;
            break;
          }
        }

        const headers = rawData[headerRowIdx].map(normalizeHeader);
        const rows = rawData.slice(headerRowIdx + 1).map(row => {
          const obj: any = {};
          headers.forEach((header: string, index: number) => {
            if (header) obj[header] = row[index];
          });
          return obj;
        }).filter(row => Object.values(row).some(v => String(v).trim() !== ''));

        if (rows.length === 0) continue;

        // Determine destination based on current UI View or Sheet Name
        let table = '';
        let payload = [];
        let conflictKeys = '';

        if (view === 'staff' || sheetName.includes('Employee') || sheetName.includes('Rider') || sheetName.includes('Driver') || sheetName.includes('Helper') || file.name.includes('employee') || file.name.includes('rider') || file.name.includes('driver')) {
          table = 'be_mobile_workforce_accounts';
          conflictKeys = 'workforce_code';
          payload = rows.map(r => ({
            workforce_code: r.employee_code || r.rider_id || r.driver_id || r.helper_id || r.code || r.id,
            display_name: r.full_name || r.name || r.display_name || r.rider_name || r.driver_name,
            role: r.role || r.staff_type || (sheetName.includes('Rider') ? 'RIDER' : sheetName.includes('Driver') ? 'DRIVER' : sheetName.includes('Helper') ? 'HELPER' : 'STAFF'),
            phone: r.phone || r.phone_e164 || r.mobile || '',
            email: r.email || r.user_email || '',
            branch_code: r.branch_code || r.branch || 'YGN',
            department: r.department || '',
            is_active: String(r.status).toLowerCase() !== 'inactive'
          })).filter(r => r.workforce_code);
        } 
        else if (view === 'vehicles' || sheetName.includes('Fleet') || file.name.includes('fleet')) {
          table = 'be_fleet_master';
          conflictKeys = 'vehicle_code';
          payload = rows.map(r => ({
            vehicle_code: r.fleet_id || r.fleet_code || r.vehicle_no || r.id,
            registration_no: r.vehicle_no || r.plate_no || r.registration_no,
            vehicle_type: r.vehicle_type || r.type || 'Van',
            capacity_kg: Number(r.capacity_kg || r.payload || 0),
            ownership_type: r.ownership_type || 'Owned',
            status: r.status || 'Available',
          })).filter(r => r.vehicle_code);
        }
        else if (view === 'merchants' || sheetName.includes('Merchant') || file.name.includes('merchant')) {
          table = 'merchant_master';
          conflictKeys = 'merchant_code';
          payload = rows.map(r => ({
            merchant_code: r.merchant_code || r.id,
            merchant_name: r.merchant_name || r.customer_name || r.name,
            phone_primary: r.phone || r.phone_primary || r.contact,
            address_line_1: r.address || r.address_line_1,
            township: r.township || '',
            city: r.region || r.city || 'Yangon',
            business_type: r.business_type || '',
            payment_terms: r.payment_terms || r.billing_terms || 'COD',
            is_active: String(r.status).toLowerCase() !== 'inactive'
          })).filter(r => r.merchant_code);
        }

        if (payload.length > 0) {
          const { error } = await supabase.from(table).upsert(payload, { onConflict: conflictKeys });
          if (error) throw error;
          totalImported += payload.length;
        }
      }

      setMessage({ type: 'success', text: `Successfully imported ${totalImported} records from ${file.name}.` });
      await initialize();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'File upload failed.' });
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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
      setEditingRow(null);
      setMerchantForm({}); setTownshipForm({}); setStaffForm({}); setVehicleForm({}); setAssetForm({});
      await initialize();
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setSaving(false); }
  };

  const deleteRecord = async (table: string, row: any, pkFields: string[]) => {
    if (!isSuperAdmin) return setMessage({ type: 'error', text: t.unauthorized });
    if (!window.confirm("Permanently delete this record? This action cannot be undone.")) return;
    setSaving(true); setMessage(null);
    try {
      const { field, value } = getPkValue(row, pkFields);
      const { error } = await supabase.from(table).delete().eq(field, value);
      if (error) throw error;
      setMessage({ type: 'success', text: "Record permanently deleted." });
      await initialize();
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setSaving(false); }
  };

  const toggleBlockStatus = async (table: string, row: any, pkFields: string[], currentStatus: boolean | string) => {
    if (!isSuperAdmin) return setMessage({ type: 'error', text: t.unauthorized });
    setSaving(true); setMessage(null);
    try {
      const { field, value } = getPkValue(row, pkFields);
      let payload = {};
      if (typeof currentStatus === 'boolean') payload = { is_active: !currentStatus };
      else payload = { status: String(currentStatus).toUpperCase() === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE' };
      const { error } = await supabase.from(table).update(payload).eq(field, value);
      if (error) throw error;
      setMessage({ type: 'success', text: `Status successfully updated.` });
      await initialize();
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setSaving(false); }
  };

  const inpSty = { width: '100%', height: 44, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0 14px', color: C.text, fontSize: 13, outline: 'none', fontFamily: FF.body };
  const btnSty = (primary=false, danger=false) => ({ height: 42, background: primary ? C.gold : danger ? 'rgba(255,79,134,0.1)' : C.panel2, color: primary ? '#000' : danger ? C.error : C.text, border: `1px solid ${primary ? C.gold : danger ? C.error : C.border}`, borderRadius: 10, padding: '0 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FF.body, transition: 'all 0.2s' });

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 24, color: C.text, fontFamily: FF.body }}>
      <input type="file" accept=".csv, .xlsx" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
      <div style={{ maxWidth: 1600, margin: '0 auto', display: 'grid', gap: 24 }}>
        
        {/* Header */}
        <header style={{ background: C.panel, border: `1px solid ${C.border}`, padding: 24, borderRadius: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
          <div>
            <div style={{ color: C.gold, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', display: 'flex', alignItems: 'center', gap: 8 }}><Database size={16} /> <span>{t.title}</span></div>
            <p style={{ color: C.muted, margin: '6px 0 0', fontSize: 14, fontWeight: 500 }}>{t.subtitle}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {isSuperAdmin && (
              <button onClick={() => fileInputRef.current?.click()} disabled={saving} style={{...btnSty(true), background: C.success, borderColor: C.success, color: '#fff'}}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />} {t.btnUpload}
              </button>
            )}
            <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
              <button onClick={() => setLang('en')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'en' ? C.panelHover : 'transparent', color: lang === 'en' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: FF.body }}>EN</button>
              <button onClick={() => setLang('mm')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'mm' ? C.panelHover : 'transparent', color: lang === 'mm' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: FF.body }}>မြန်မာ</button>
            </div>
            <button onClick={initialize} disabled={loading} style={btnSty()}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {t.refresh}
            </button>
          </div>
        </header>

        {/* Global Messages */}
        {message && (
          <div style={{ padding: 18, background: message.type === 'error' ? 'rgba(255,79,134,0.1)' : 'rgba(34,197,94,0.1)', border: `1px solid ${message.type === 'error' ? C.error : C.success}40`, color: message.type === 'error' ? C.error : C.success, borderRadius: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            {message.type === 'error' ? <ShieldAlert size={20}/> : <CheckCircle2 size={20}/>} {message.text}
          </div>
        )}

        {/* RBAC Warning Banner */}
        {!isSuperAdmin && !loading && (
          <div style={{ padding: 18, background: 'rgba(245,158,11,0.1)', border: `1px solid ${C.warning}40`, color: C.warning, borderRadius: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <ShieldAlert size={24} className="shrink-0" />
            <div>
              <div style={{ fontWeight: 900, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.unauthorized}</div>
              <div style={{ fontSize: 13, marginTop: 4, fontWeight: 500 }}>{t.unauthSub}</div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { id: 'merchants', icon: Building2, label: t.tabs.merchants },
            { id: 'townships', icon: MapPinned, label: t.tabs.townships },
            { id: 'staff', icon: Users2, label: t.tabs.staff },
            { id: 'vehicles', icon: CarFront, label: t.tabs.vehicles },
            { id: 'assets', icon: PackageSearch, label: t.tabs.assets }
          ].map(tab => (
            <button key={tab.id} onClick={() => { setView(tab.id); setEditingRow(null); }} style={{ ...btnSty(view === tab.id), background: view === tab.id ? C.gold : C.panel2 }}>
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>

        {/* Main Work Area */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 450px) 1fr', gap: 24, alignItems: 'start' }}>
          
          {/* Data Entry Form */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, padding: 24, opacity: isSuperAdmin ? 1 : 0.5, pointerEvents: isSuperAdmin ? 'auto' : 'none' }}>
            <h2 style={{ fontSize: 18, fontWeight: 900, margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
              {editingRow ? <Pencil size={18} color={C.gold}/> : <Plus size={18} color={C.info}/>} 
              {editingRow ? t.btnEdit : t.btnSave} Record
            </h2>
            
            {view === 'merchants' && (
              <div style={{ display: 'grid', gap: 16 }}>
                <input value={merchantForm.merchant_code || ''} onChange={e => setMerchantForm({...merchantForm, merchant_code: e.target.value})} placeholder="Merchant Code (e.g. BBK)" style={inpSty} />
                <input value={merchantForm.merchant_name || ''} onChange={e => setMerchantForm({...merchantForm, merchant_name: e.target.value})} placeholder="Full Merchant Name" style={inpSty} />
                <input value={merchantForm.phone_primary || ''} onChange={e => setMerchantForm({...merchantForm, phone_primary: e.target.value})} placeholder="Primary Phone" style={inpSty} />
                <input value={merchantForm.township || ''} onChange={e => setMerchantForm({...merchantForm, township: e.target.value})} placeholder="Township" style={inpSty} />
                <input value={merchantForm.address_line_1 || ''} onChange={e => setMerchantForm({...merchantForm, address_line_1: e.target.value})} placeholder="Full Address" style={inpSty} />
                <button onClick={() => saveRecord('merchant_master', merchantForm, ['merchant_id', 'id'], 'Merchant saved successfully.')} disabled={saving} style={{...btnSty(true), width: '100%', justifyContent: 'center', height: 48, fontSize: 14}}><Save size={18}/> {editingRow ? t.btnUpdate : t.btnSave}</button>
              </div>
            )}

            {view === 'townships' && (
              <div style={{ display: 'grid', gap: 16 }}>
                <input value={townshipForm.township_code || ''} onChange={e => setTownshipForm({...townshipForm, township_code: e.target.value})} placeholder="Code (e.g. YGN-Bahan)" style={inpSty} />
                <input value={townshipForm.township_name || ''} onChange={e => setTownshipForm({...townshipForm, township_name: e.target.value})} placeholder="Township Name (English)" style={inpSty} />
                <input value={townshipForm.township_mm || ''} onChange={e => setTownshipForm({...townshipForm, township_mm: e.target.value})} placeholder="Township Name (Myanmar)" style={inpSty} />
                <select value={townshipForm.zone || ''} onChange={e => setTownshipForm({...townshipForm, zone: e.target.value})} style={inpSty}>
                  <option value="">Select Zone</option><option value="Zone A">Zone A</option><option value="Zone B">Zone B</option><option value="Zone C">Zone C</option>
                </select>
                <input type="number" value={townshipForm.delivery_fee || ''} onChange={e => setTownshipForm({...townshipForm, delivery_fee: e.target.value})} placeholder="Base Delivery Fee (MMK)" style={inpSty} />
                <button onClick={() => saveRecord('townships', townshipForm, ['id', 'township_code'], 'Township pricing saved.')} disabled={saving} style={{...btnSty(true), width: '100%', justifyContent: 'center', height: 48, fontSize: 14}}><Save size={18}/> {editingRow ? t.btnUpdate : t.btnSave}</button>
              </div>
            )}

            {view === 'staff' && (
              <div style={{ display: 'grid', gap: 16 }}>
                <input value={staffForm.workforce_code || staffForm.code || ''} onChange={e => setStaffForm({...staffForm, workforce_code: e.target.value})} placeholder="Staff Code (e.g. RD-001)" style={inpSty} />
                <input value={staffForm.display_name || staffForm.full_name || ''} onChange={e => setStaffForm({...staffForm, display_name: e.target.value})} placeholder="Full Name" style={inpSty} />
                <input value={staffForm.phone || ''} onChange={e => setStaffForm({...staffForm, phone: e.target.value})} placeholder="Mobile Number" style={inpSty} />
                <select value={staffForm.role || ''} onChange={e => setStaffForm({...staffForm, role: e.target.value})} style={inpSty}>
                  <option value="">Select Role</option><option value="RIDER">RIDER</option><option value="DRIVER">DRIVER</option><option value="HELPER">HELPER</option>
                </select>
                <button onClick={() => saveRecord('be_mobile_workforce_accounts', staffForm, ['id', 'workforce_code'], 'Workforce profile updated.')} disabled={saving} style={{...btnSty(true), width: '100%', justifyContent: 'center', height: 48, fontSize: 14}}><Save size={18}/> {editingRow ? t.btnUpdate : t.btnSave}</button>
              </div>
            )}

            {view === 'vehicles' && (
              <div style={{ display: 'grid', gap: 16 }}>
                <input value={vehicleForm.vehicle_code || ''} onChange={e => setVehicleForm({...vehicleForm, vehicle_code: e.target.value})} placeholder="Fleet Code (e.g. VAN-01)" style={inpSty} />
                <input value={vehicleForm.registration_no || ''} onChange={e => setVehicleForm({...vehicleForm, registration_no: e.target.value})} placeholder="License Plate No." style={inpSty} />
                <select value={vehicleForm.vehicle_type || ''} onChange={e => setVehicleForm({...vehicleForm, vehicle_type: e.target.value})} style={inpSty}>
                  <option value="">Select Type</option><option value="Motorbike">Motorbike</option><option value="Van">Van</option><option value="Truck">Truck</option>
                </select>
                <input type="number" value={vehicleForm.capacity_kg || ''} onChange={e => setVehicleForm({...vehicleForm, capacity_kg: e.target.value})} placeholder="Capacity (KG)" style={inpSty} />
                <button onClick={() => saveRecord('be_fleet_master', vehicleForm, ['id', 'vehicle_code'], 'Vehicle registry updated.')} disabled={saving} style={{...btnSty(true), width: '100%', justifyContent: 'center', height: 48, fontSize: 14}}><Save size={18}/> {editingRow ? t.btnUpdate : t.btnSave}</button>
              </div>
            )}

            {view === 'assets' && (
              <div style={{ display: 'grid', gap: 16 }}>
                <input value={assetForm.asset_code || ''} onChange={e => setAssetForm({...assetForm, asset_code: e.target.value})} placeholder="Asset Tag (e.g. SCN-99)" style={inpSty} />
                <select value={assetForm.asset_type || ''} onChange={e => setAssetForm({...assetForm, asset_type: e.target.value})} style={inpSty}>
                  <option value="">Select Asset Type</option><option value="Scanner">Mobile Scanner</option><option value="Printer">Printer</option><option value="POS">POS Terminal</option>
                </select>
                <input value={assetForm.serial_no || ''} onChange={e => setAssetForm({...assetForm, serial_no: e.target.value})} placeholder="Hardware Serial Number" style={inpSty} />
                <button onClick={() => saveRecord('asset_master', assetForm, ['id', 'asset_code'], 'Asset inventory updated.')} disabled={saving} style={{...btnSty(true), width: '100%', justifyContent: 'center', height: 48, fontSize: 14}}><Save size={18}/> {editingRow ? t.btnUpdate : t.btnSave}</button>
              </div>
            )}

            {editingRow && <button onClick={() => { setEditingRow(null); setMerchantForm({}); setTownshipForm({}); setStaffForm({}); setVehicleForm({}); setAssetForm({}); }} style={{ ...btnSty(), marginTop: 12, width: '100%', justifyContent: 'center' }}><X size={16}/> {t.btnCancel}</button>}
          </div>

          {/* Registry Viewer */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 800 }}>
            <div style={{ padding: 24, borderBottom: `1px solid ${C.border}`, background: C.panel2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>Live Data Registry</h2>
              {loading && <Loader2 size={18} className="animate-spin text-[#f6b84b]" />}
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'grid', gap: 16 }}>
              
              {view === 'merchants' && merchantRows.map(r => {
                const isActive = r.is_active !== false && String(r.status).toUpperCase() !== 'BLOCKED';
                return (
                  <div key={r.id} style={{ background: C.panel2, border: `1px solid ${isActive ? C.border : C.error}`, padding: 20, borderRadius: 16, display: 'flex', justifyContent: 'space-between', opacity: isActive ? 1 : 0.6, transition: 'all 0.2s' }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 16, color: isActive ? C.text : C.error }}>{r.merchant_name}</div>
                      <div style={{ fontSize: 13, color: C.muted, marginTop: 6, fontWeight: 500 }}>{r.merchant_code} · {r.phone_primary} · {r.township}</div>
                      <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>{r.address_line_1}</div>
                    </div>
                    {isSuperAdmin && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setEditingRow(r); setMerchantForm(r); }} style={btnSty()}><Pencil size={14}/> {t.btnEdit}</button>
                          <button onClick={() => deleteRecord('merchant_master', r, ['id', 'merchant_code'])} style={btnSty(false, true)}><Trash2 size={14}/></button>
                        </div>
                        <button onClick={() => toggleBlockStatus('merchant_master', r, ['id', 'merchant_code'], r.is_active)} style={{...btnSty(false), background: 'transparent', borderColor: isActive ? C.warning : C.success, color: isActive ? C.warning : C.success}}>
                          {isActive ? <><Ban size={14}/> {t.btnBlock}</> : <><CheckCircle2 size={14}/> {t.btnUnblock}</>}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}

              {view === 'townships' && townshipRows.map(r => {
                const isActive = r.is_active !== false;
                return (
                  <div key={r.id} style={{ background: C.panel2, border: `1px solid ${isActive ? C.border : C.error}`, padding: 20, borderRadius: 16, display: 'flex', justifyContent: 'space-between', opacity: isActive ? 1 : 0.6 }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 16, color: isActive ? C.text : C.error }}>{r.township_name} <span style={{fontSize: 13, color: C.info, fontWeight: 600, marginLeft: 8}}>{r.township_mm}</span></div>
                      <div style={{ fontSize: 13, color: C.muted, marginTop: 6, fontWeight: 500 }}>{r.township_code} · {r.zone} · Base Fee: <strong style={{color: C.gold}}>{r.delivery_fee} MMK</strong></div>
                    </div>
                    {isSuperAdmin && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setEditingRow(r); setTownshipForm(r); }} style={btnSty()}><Pencil size={14}/> {t.btnEdit}</button>
                          <button onClick={() => deleteRecord('townships', r, ['id', 'township_code'])} style={btnSty(false, true)}><Trash2 size={14}/></button>
                        </div>
                        <button onClick={() => toggleBlockStatus('townships', r, ['id', 'township_code'], r.is_active)} style={{...btnSty(false), background: 'transparent', borderColor: isActive ? C.warning : C.success, color: isActive ? C.warning : C.success}}>
                          {isActive ? <><Ban size={14}/> {t.btnBlock}</> : <><CheckCircle2 size={14}/> {t.btnUnblock}</>}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}

              {view === 'staff' && staffRows.map(r => {
                const isActive = r.is_active !== false;
                return (
                  <div key={r.id} style={{ background: C.panel2, border: `1px solid ${isActive ? C.border : C.error}`, padding: 20, borderRadius: 16, display: 'flex', justifyContent: 'space-between', opacity: isActive ? 1 : 0.6 }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 16, color: isActive ? C.text : C.error }}>{r.display_name || r.full_name}</div>
                      <div style={{ fontSize: 13, color: C.muted, marginTop: 6, fontWeight: 500 }}>{r.workforce_code || r.code} · <span style={{color: C.info, fontWeight: 800}}>{r.role}</span> · {r.phone}</div>
                    </div>
                    {isSuperAdmin && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setEditingRow(r); setStaffForm(r); }} style={btnSty()}><Pencil size={14}/> {t.btnEdit}</button>
                          <button onClick={() => deleteRecord('be_mobile_workforce_accounts', r, ['id', 'workforce_code'])} style={btnSty(false, true)}><Trash2 size={14}/></button>
                        </div>
                        <button onClick={() => toggleBlockStatus('be_mobile_workforce_accounts', r, ['id', 'workforce_code'], r.is_active)} style={{...btnSty(false), background: 'transparent', borderColor: isActive ? C.warning : C.success, color: isActive ? C.warning : C.success}}>
                          {isActive ? <><Ban size={14}/> {t.btnBlock}</> : <><CheckCircle2 size={14}/> {t.btnUnblock}</>}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}

              {view === 'vehicles' && vehicleRows.map(r => {
                const isActive = String(r.status).toUpperCase() !== 'INACTIVE' && String(r.status).toUpperCase() !== 'MAINTENANCE';
                return (
                  <div key={r.id} style={{ background: C.panel2, border: `1px solid ${isActive ? C.border : C.error}`, padding: 20, borderRadius: 16, display: 'flex', justifyContent: 'space-between', opacity: isActive ? 1 : 0.6 }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 16, color: isActive ? C.text : C.error }}>{r.vehicle_code}</div>
                      <div style={{ fontSize: 13, color: C.muted, marginTop: 6, fontWeight: 500 }}>{r.registration_no} · {r.vehicle_type} · {r.capacity_kg} KG</div>
                    </div>
                    {isSuperAdmin && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setEditingRow(r); setVehicleForm(r); }} style={btnSty()}><Pencil size={14}/> {t.btnEdit}</button>
                          <button onClick={() => deleteRecord('be_fleet_master', r, ['id', 'vehicle_code'])} style={btnSty(false, true)}><Trash2 size={14}/></button>
                        </div>
                        <button onClick={() => toggleBlockStatus('be_fleet_master', r, ['id', 'vehicle_code'], r.status)} style={{...btnSty(false), background: 'transparent', borderColor: isActive ? C.warning : C.success, color: isActive ? C.warning : C.success}}>
                          {isActive ? <><Ban size={14}/> {t.btnBlock}</> : <><CheckCircle2 size={14}/> {t.btnUnblock}</>}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}

              {view === 'assets' && assetRows.map(r => {
                const isActive = String(r.status).toUpperCase() !== 'BROKEN' && String(r.status).toUpperCase() !== 'LOST';
                return (
                  <div key={r.id} style={{ background: C.panel2, border: `1px solid ${isActive ? C.border : C.error}`, padding: 20, borderRadius: 16, display: 'flex', justifyContent: 'space-between', opacity: isActive ? 1 : 0.6 }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 16, color: isActive ? C.text : C.error }}>{r.asset_code}</div>
                      <div style={{ fontSize: 13, color: C.muted, marginTop: 6, fontWeight: 500 }}>{r.asset_type} · {r.serial_no}</div>
                    </div>
                    {isSuperAdmin && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setEditingRow(r); setAssetForm(r); }} style={btnSty()}><Pencil size={14}/> {t.btnEdit}</button>
                          <button onClick={() => deleteRecord('asset_master', r, ['id', 'asset_code'])} style={btnSty(false, true)}><Trash2 size={14}/></button>
                        </div>
                        <button onClick={() => toggleBlockStatus('asset_master', r, ['id', 'asset_code'], r.status)} style={{...btnSty(false), background: 'transparent', borderColor: isActive ? C.warning : C.success, color: isActive ? C.warning : C.success}}>
                          {isActive ? <><Ban size={14}/> {t.btnBlock}</> : <><CheckCircle2 size={14}/> {t.btnUnblock}</>}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}

              {((view === 'merchants' && merchantRows.length === 0) || (view === 'staff' && staffRows.length === 0) || (view === 'townships' && townshipRows.length === 0)) && !loading && (
                <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontWeight: 600, fontSize: 14 }}>{t.empty}</div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}