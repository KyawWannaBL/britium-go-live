// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  CarFront,
  ClipboardList,
  Database,
  MapPinned,
  PackageSearch,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  ScanLine,
  Save,
  ShieldCheck,
  Trash2,
  Users, // FIX: Changed from Users2 to Users to prevent the crash
  X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext'; // FIX: Updated to your correct context path
import { acknowledgeWorkflow, bumpReminder, recordQrWorkflowStep } from '@/lib/qrWorkflow';
import { safeText } from '@/lib/displayValue';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

function tt(language: string, en: string, mm: string) {
  return language === 'mm' ? mm : en;
}

function currentViewFromPath(pathname: string) {
  if (pathname.includes('/merchants')) return 'merchants';
  if (pathname.includes('/townships')) return 'townships';
  if (pathname.includes('/vehicles')) return 'vehicles';
  if (pathname.includes('/assets')) return 'assets';
  if (pathname.includes('/assignments')) return 'assignments';
  if (pathname.includes('/scans')) return 'scans';
  if (pathname.includes('/acknowledgements')) return 'acknowledgements';
  return 'staff';
}

function fmtDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function fmtJson(value: unknown) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return '{}';
  }
}

function clean(value: any, fallback = '') {
  const text = String(value ?? '').trim();
  if (!text || text === '-' || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return fallback;
  return text;
}

function toNumber(value: any, fallback = 0) {
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function bannerImage(view: string) {
  const map: Record<string, string> = {
    merchants: '/images/b1.png',
    townships: '/images/b2.png',
    staff: '/images/b1.png',
    vehicles: '/images/b2.png',
    assets: '/images/b3.png',
    assignments: '/images/b4.png',
    scans: '/images/b5.png',
    acknowledgements: '/images/b6.png',
  };
  return map[view] || '/images/b1.png';
}

const ROUTES: Record<string, string> = {
  merchants: '/master-data/merchants',
  townships: '/master-data/townships',
  staff: '/master-data/staff',
  vehicles: '/master-data/vehicles',
  assets: '/master-data/assets',
  assignments: '/master-data/assignments',
  scans: '/master-data/scans',
  acknowledgements: '/master-data/acknowledgements',
};

const emptyMerchantForm = {
  merchant_id: '',
  merchant_code: '',
  merchant_name: '',
  phone_primary: '',
  address_line_1: '',
  township: '',
  city: 'Yangon',
  region_state: 'Yangon',
  business_type: '',
  payment_terms: 'COD',
  is_active: true,
};

const emptyTownshipForm = {
  township_code: '',
  township_name: '',
  township_mm: '',
  city: 'Yangon',
  region_state: 'Yangon',
  zone: 'Zone A',
  delivery_fee: '0',
  is_active: true,
};

const emptyStaffForm = {
  staff_code: '',
  full_name: '',
  staff_type: 'driver',
  role_name: 'driver',
  phone: '',
  email: '',
  branch_name: '',
  warehouse_id: '',
  is_active: true,
};

const emptyVehicleForm = {
  vehicle_code: '',
  registration_no: '',
  vehicle_type: 'motorbike',
  display_name: '',
  capacity_kg: '0',
  warehouse_id: '',
  status: 'available',
};

const emptyAssetForm = {
  asset_code: '',
  asset_type: 'scanner',
  model_name: '',
  serial_no: '',
  status: 'available',
};

const emptyAssignmentForm = {
  staff_id: '',
  asset_id: '',
  vehicle_id: '',
  notes: '',
  status: 'assigned',
};

const emptyScanForm = {
  actor_staff_id: '',
  next_staff_id: '',
  shipment_id: '',
  process_step: 'handover',
  territory_code: '',
  scan_channel: 'qr_scanner',
  notes: '',
};

async function safeSelect(table: string, select = '*', orderColumn = 'created_at', ascending = false, limit?: number) {
  try {
    let query = supabase.from(table).select(select);
    if (orderColumn) query = query.order(orderColumn, { ascending });
    if (limit) query = query.limit(limit);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (firstError) {
    try {
      let query = supabase.from(table).select(select);
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (secondError) {
      console.warn(`Master data load skipped for ${table}`, secondError);
      return [];
    }
  }
}

function getPkValue(row: any, fallbackFields: string[] = ['id']) {
  for (const field of fallbackFields) {
    const value = row?.[field];
    if (value !== undefined && value !== null && String(value).trim() !== '') return { field, value };
  }
  return { field: 'id', value: row?.id };
}

export default function MasterDataPortal() {
  const { lang: language } = useLanguage(); // FIX: Extracted lang as language to match your code
  const location = useLocation();
  const navigate = useNavigate();

  const [view, setView] = useState(currentViewFromPath(location.pathname));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [merchantRows, setMerchantRows] = useState<any[]>([]);
  const [townshipRows, setTownshipRows] = useState<any[]>([]);
  const [staffRows, setStaffRows] = useState<any[]>([]);
  const [vehicleRows, setVehicleRows] = useState<any[]>([]);
  const [assetRows, setAssetRows] = useState<any[]>([]);
  const [assignmentRows, setAssignmentRows] = useState<any[]>([]);
  const [scanRows, setScanRows] = useState<any[]>([]);
  const [ackRows, setAckRows] = useState<any[]>([]);
  const [warehouseRows, setWarehouseRows] = useState<any[]>([]);
  const [shipmentRows, setShipmentRows] = useState<any[]>([]);

  const [merchantForm, setMerchantForm] = useState(emptyMerchantForm);
  const [townshipForm, setTownshipForm] = useState(emptyTownshipForm);
  const [staffForm, setStaffForm] = useState(emptyStaffForm);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [assetForm, setAssetForm] = useState(emptyAssetForm);
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignmentForm);
  const [scanForm, setScanForm] = useState(emptyScanForm);

  const [editingMerchant, setEditingMerchant] = useState<any | null>(null);
  const [editingTownship, setEditingTownship] = useState<any | null>(null);
  const [editingStaff, setEditingStaff] = useState<any | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<any | null>(null);
  const [editingAsset, setEditingAsset] = useState<any | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<any | null>(null);

  useEffect(() => {
    setView(currentViewFromPath(location.pathname));
  }, [location.pathname]);

  async function loadData() {
    setLoading(true);
    setMessage('');
    try {
      const [
        merchantData, townshipData, staffData, vehicleData, assetData,
        assignmentData, scanData, ackData, warehouseData, shipmentData,
      ] = await Promise.all([
        safeSelect('merchant_master', '*', 'merchant_name', true),
        safeSelect('townships', '*', 'township_name', true),
        safeSelect('staff_master', '*', 'created_at', false),
        safeSelect('vehicle_master', '*', 'created_at', false),
        safeSelect('asset_master', '*', 'created_at', false),
        safeSelect('staff_asset_assignments', '*', 'created_at', false),
        safeSelect('qr_scan_events', '*', 'created_at', false, 100),
        safeSelect('workflow_acknowledgements', '*', 'created_at', false, 100),
        safeSelect('warehouses', 'id, name, code', 'name', true),
        safeSelect('shipments', 'id, awb, tracking_no, recipient, receiver_name, recipient_name', 'created_at', false, 100),
      ]);

      setMerchantRows(merchantData); setTownshipRows(townshipData); setStaffRows(staffData);
      setVehicleRows(vehicleData); setAssetRows(assetData); setAssignmentRows(assignmentData);
      setScanRows(scanData); setAckRows(ackData); setWarehouseRows(warehouseData); setShipmentRows(shipmentData);
    } catch (e: any) {
      console.error(e);
      setMessage(e?.message || 'Unable to load master data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  const staffMap = useMemo(() => new Map(staffRows.map((r: any) => [r.id, r])), [staffRows]);
  const vehicleMap = useMemo(() => new Map(vehicleRows.map((r: any) => [r.id, r])), [vehicleRows]);
  const assetMap = useMemo(() => new Map(assetRows.map((r: any) => [r.id, r])), [assetRows]);
  const shipmentMap = useMemo(() => new Map(shipmentRows.map((r: any) => [r.id, r])), [shipmentRows]);

  async function insertRow(table: string, payload: any, successMessage: string) {
    setSaving(true); setMessage('');
    try {
      const { error } = await supabase.from(table).insert(payload);
      if (error) throw error;
      setMessage(successMessage);
      await loadData();
      return true;
    } catch (e: any) { console.error(e); setMessage(e?.message || `Unable to insert into ${table}.`); return false; } 
    finally { setSaving(false); }
  }

  async function updateRow(table: string, pkField: string, pkValue: any, payload: any, successMessage: string) {
    if (!pkValue) { setMessage('Cannot update this row because no primary key was found.'); return false; }
    setSaving(true); setMessage('');
    try {
      const { error } = await supabase.from(table).update(payload).eq(pkField, pkValue);
      if (error) throw error;
      setMessage(successMessage); await loadData(); return true;
    } catch (e: any) { console.error(e); setMessage(e?.message || `Unable to update ${table}.`); return false; } 
    finally { setSaving(false); }
  }

  async function deleteRow(table: string, row: any, pkFields: string[], label: string) {
    const { field, value } = getPkValue(row, pkFields);
    if (!value) { setMessage('Cannot delete this row because no primary key was found.'); return; }
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setSaving(true); setMessage('');
    try {
      const { error } = await supabase.from(table).delete().eq(field, value);
      if (error) throw error;
      setMessage(`${label} deleted.`); await loadData();
    } catch (e: any) { console.error(e); setMessage(e?.message || `Unable to delete ${label}.`); } 
    finally { setSaving(false); }
  }

  async function saveMerchant() {
    const payload = { ...merchantForm, merchant_id: merchantForm.merchant_id || merchantForm.merchant_code || `MER-${Date.now()}`, merchant_code: merchantForm.merchant_code || null, merchant_name: merchantForm.merchant_name || null, phone_primary: merchantForm.phone_primary || null, address_line_1: merchantForm.address_line_1 || null, township: merchantForm.township || null, city: merchantForm.city || null, region_state: merchantForm.region_state || null, business_type: merchantForm.business_type || null, payment_terms: merchantForm.payment_terms || 'COD', is_active: Boolean(merchantForm.is_active) };
    const ok = editingMerchant ? await updateRow('merchant_master', getPkValue(editingMerchant, ['merchant_id', 'id']).field, getPkValue(editingMerchant, ['merchant_id', 'id']).value, payload, 'Merchant updated.') : await insertRow('merchant_master', payload, 'Merchant added.');
    if (ok) { setMerchantForm(emptyMerchantForm); setEditingMerchant(null); }
  }

  function editMerchant(row: any) {
    setEditingMerchant(row);
    setMerchantForm({ merchant_id: clean(row.merchant_id), merchant_code: clean(row.merchant_code), merchant_name: clean(row.merchant_name), phone_primary: clean(row.phone_primary), address_line_1: clean(row.address_line_1), township: clean(row.township), city: clean(row.city, 'Yangon'), region_state: clean(row.region_state, 'Yangon'), business_type: clean(row.business_type), payment_terms: clean(row.payment_terms, 'COD'), is_active: row.is_active !== false });
  }

  async function saveTownship() {
    const payload = { ...townshipForm, township_code: townshipForm.township_code || townshipForm.township_name || `TSP-${Date.now()}`, township_name: townshipForm.township_name || null, township_mm: townshipForm.township_mm || null, city: townshipForm.city || null, region_state: townshipForm.region_state || null, zone: townshipForm.zone || null, delivery_fee: toNumber(townshipForm.delivery_fee), is_active: Boolean(townshipForm.is_active) };
    const ok = editingTownship ? await updateRow('townships', getPkValue(editingTownship, ['id', 'township_code']).field, getPkValue(editingTownship, ['id', 'township_code']).value, payload, 'Township updated.') : await insertRow('townships', payload, 'Township added.');
    if (ok) { setTownshipForm(emptyTownshipForm); setEditingTownship(null); }
  }

  function editTownship(row: any) {
    setEditingTownship(row);
    setTownshipForm({ township_code: clean(row.township_code || row.code), township_name: clean(row.township_name || row.name || row.township), township_mm: clean(row.township_mm || row.name_mm), city: clean(row.city, 'Yangon'), region_state: clean(row.region_state || row.region, 'Yangon'), zone: clean(row.zone, 'Zone A'), delivery_fee: String(row.delivery_fee || row.fee || 0), is_active: row.is_active !== false });
  }

  async function saveStaff() {
    const payload = { ...staffForm, warehouse_id: staffForm.warehouse_id || null, phone: staffForm.phone || null, email: staffForm.email || null, branch_name: staffForm.branch_name || null, is_active: Boolean(staffForm.is_active) };
    const ok = editingStaff ? await updateRow('staff_master', 'id', editingStaff.id, payload, 'Staff updated.') : await insertRow('staff_master', payload, 'Staff added.');
    if (ok) { setStaffForm(emptyStaffForm); setEditingStaff(null); }
  }

  function editStaff(row: any) {
    setEditingStaff(row);
    setStaffForm({ staff_code: clean(row.staff_code), full_name: clean(row.full_name), staff_type: clean(row.staff_type, 'driver'), role_name: clean(row.role_name, 'driver'), phone: clean(row.phone), email: clean(row.email), branch_name: clean(row.branch_name), warehouse_id: clean(row.warehouse_id), is_active: row.is_active !== false });
  }

  async function saveVehicle() {
    const payload = { ...vehicleForm, capacity_kg: toNumber(vehicleForm.capacity_kg), registration_no: vehicleForm.registration_no || null, display_name: vehicleForm.display_name || null, warehouse_id: vehicleForm.warehouse_id || null, status: vehicleForm.status || 'available' };
    const ok = editingVehicle ? await updateRow('vehicle_master', 'id', editingVehicle.id, payload, 'Vehicle updated.') : await insertRow('vehicle_master', payload, 'Vehicle added.');
    if (ok) { setVehicleForm(emptyVehicleForm); setEditingVehicle(null); }
  }

  function editVehicle(row: any) {
    setEditingVehicle(row);
    setVehicleForm({ vehicle_code: clean(row.vehicle_code), registration_no: clean(row.registration_no), vehicle_type: clean(row.vehicle_type, 'motorbike'), display_name: clean(row.display_name), capacity_kg: String(row.capacity_kg || 0), warehouse_id: clean(row.warehouse_id), status: clean(row.status, 'available') });
  }

  async function saveAsset() {
    const payload = { ...assetForm, model_name: assetForm.model_name || null, serial_no: assetForm.serial_no || null, status: assetForm.status || 'available' };
    const ok = editingAsset ? await updateRow('asset_master', 'id', editingAsset.id, payload, 'Asset updated.') : await insertRow('asset_master', payload, 'Asset added.');
    if (ok) { setAssetForm(emptyAssetForm); setEditingAsset(null); }
  }

  function editAsset(row: any) {
    setEditingAsset(row);
    setAssetForm({ asset_code: clean(row.asset_code), asset_type: clean(row.asset_type, 'scanner'), model_name: clean(row.model_name), serial_no: clean(row.serial_no), status: clean(row.status, 'available') });
  }

  async function saveAssignment() {
    const payload = { staff_id: assignmentForm.staff_id || null, asset_id: assignmentForm.asset_id || null, vehicle_id: assignmentForm.vehicle_id || null, notes: assignmentForm.notes || null, status: assignmentForm.status || 'assigned' };
    const ok = editingAssignment ? await updateRow('staff_asset_assignments', 'id', editingAssignment.id, payload, 'Assignment updated.') : await insertRow('staff_asset_assignments', { ...payload, assigned_at: new Date().toISOString() }, 'Assignment added.');
    if (ok) { setAssignmentForm(emptyAssignmentForm); setEditingAssignment(null); }
  }

  function editAssignment(row: any) {
    setEditingAssignment(row);
    setAssignmentForm({ staff_id: clean(row.staff_id), asset_id: clean(row.asset_id), vehicle_id: clean(row.vehicle_id), notes: clean(row.notes), status: clean(row.status, 'assigned') });
  }

  async function createScan() {
    setSaving(true); setMessage('');
    try {
      if (typeof recordQrWorkflowStep !== 'function') throw new Error("recordQrWorkflowStep is not available in lib/qrWorkflow.");
      await recordQrWorkflowStep({ actorStaffId: scanForm.actor_staff_id || null, nextStaffId: scanForm.next_staff_id || null, shipmentId: scanForm.shipment_id || null, processStep: scanForm.process_step, territoryCode: scanForm.territory_code || null, scanChannel: scanForm.scan_channel as any, notes: scanForm.notes || null });
      setScanForm(emptyScanForm); setMessage('QR workflow step recorded.'); await loadData();
    } catch (e: any) { console.error(e); setMessage(e?.message || 'Unable to record scan step.'); } finally { setSaving(false); }
  }

  async function updateAck(id: string, status: 'accepted' | 'completed' | 'rejected') {
    setSaving(true); setMessage('');
    try {
      if (typeof acknowledgeWorkflow !== 'function') throw new Error("acknowledgeWorkflow is not available in lib/qrWorkflow.");
      await acknowledgeWorkflow(id, status); setMessage(`Acknowledgement ${status}.`); await loadData();
    } catch (e: any) { console.error(e); setMessage(e?.message || 'Unable to update acknowledgement.'); } finally { setSaving(false); }
  }

  async function remindAck(id: string) {
    setSaving(true); setMessage('');
    try {
      if (typeof bumpReminder !== 'function') throw new Error("bumpReminder is not available in lib/qrWorkflow.");
      await bumpReminder(id); setMessage('Reminder sent.'); await loadData();
    } catch (e: any) { console.error(e); setMessage(e?.message || 'Unable to remind acknowledgement.'); } finally { setSaving(false); }
  }

  const titles: Record<string, { title: string; subtitle: string }> = {
    merchants: { title: tt(language, 'Master Data — Merchants', 'Master Data — Merchant များ'), subtitle: tt(language, 'Create, edit, and delete merchant master records used by Customer Service auto-fill.', 'Customer Service auto-fill အသုံးပြုမည့် merchant master records များ') },
    townships: { title: tt(language, 'Master Data — Townships', 'Master Data — မြို့နယ်များ'), subtitle: tt(language, 'Create, edit, and delete township / pricing master data.', 'မြို့နယ်နှင့် pricing master data များ') },
    staff: { title: tt(language, 'Master Data — Staff', 'Master Data — ဝန်ထမ်း'), subtitle: tt(language, 'Create, edit, and delete driver, rider, helper, and other staff definitions.', 'driver, rider, helper နှင့် အခြားဝန်ထမ်း မူလအချက်အလက်များ') },
    vehicles: { title: tt(language, 'Master Data — Vehicles', 'Master Data — ယာဉ်များ'), subtitle: tt(language, 'Create, edit, and delete motorbikes, vans, trucks, and route-ready vehicles.', 'motorbike, van, truck နှင့် route-ready ယာဉ်များ') },
    assets: { title: tt(language, 'Master Data — Assets', 'Master Data — ပစ္စည်းများ'), subtitle: tt(language, 'Create, edit, and delete scanners, phones, printers, and controlled assets.', 'scanner, phone, printer နှင့် controlled assets များ') },
    assignments: { title: tt(language, 'Master Data — Assignments', 'Master Data — ခန့်ထားမှုများ'), subtitle: tt(language, 'Create, edit, and delete staff/asset/vehicle assignments.', 'staff/asset/vehicle ခန့်ထားမှုများ') },
    scans: { title: tt(language, 'QR Workflow Events', 'QR Workflow Events'), subtitle: tt(language, 'Record and delete QR/mobile scanner workflow events.', 'QR/mobile scanner workflow events များ') },
    acknowledgements: { title: tt(language, 'Workflow Acknowledgements', 'Workflow Acknowledgements'), subtitle: tt(language, 'Accept, complete, reject, remind, or delete handoff acknowledgements.', 'handoff acknowledgements များ') },
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border bg-cover bg-center p-8" style={{ backgroundImage: `linear-gradient(rgba(255,255,255,.82), rgba(255,255,255,.90)), url(${bannerImage(view)})` }}>
        <div className="relative z-10">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{tt(language, 'Master Data', 'မူလအချက်အလက်')}</div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">{titles[view].title}</h1>
          <p className="mt-2 text-muted-foreground">{titles[view].subtitle}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={loadData} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> {tt(language, 'Refresh', 'ပြန်လည်ရယူမည်')}
        </Button>
        {message && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800">{message}</div>}
      </div>

      <div className="grid gap-2 rounded-2xl bg-muted p-1 md:grid-cols-4 xl:grid-cols-8">
        {[
          ['merchants', Building2, tt(language, 'Merchants', 'Merchant များ')],
          ['townships', MapPinned, tt(language, 'Townships', 'မြို့နယ်များ')],
          ['staff', Users, tt(language, 'Staff', 'ဝန်ထမ်း')],
          ['vehicles', CarFront, tt(language, 'Vehicles', 'ယာဉ်များ')],
          ['assets', PackageSearch, tt(language, 'Assets', 'ပစ္စည်းများ')],
          ['assignments', ClipboardList, tt(language, 'Assignments', 'ခန့်ထားမှုများ')],
          ['scans', ScanLine, tt(language, 'QR Scans', 'QR Scans')],
          ['acknowledgements', ShieldCheck, tt(language, 'Acknowledgements', 'Acknowledgements')],
        ].map(([key, Icon, label]) => (
          <button key={String(key)} type="button" onClick={() => { setView(String(key)); navigate(ROUTES[String(key)]); }} className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${view === key ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
            {/* @ts-ignore */}
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {view === 'merchants' && (
        <div className="grid gap-6 xl:grid-cols-[460px_minmax(0,1fr)]">
          <Card>
            <CardHeader><CardTitle>{editingMerchant ? tt(language, 'Edit Merchant', 'Merchant ပြင်ဆင်ရန်') : tt(language, 'Add Merchant', 'Merchant အသစ်ထည့်ရန်')}</CardTitle><CardDescription>{tt(language, 'Saved merchants are used by Customer Service pickup auto-fill.', 'Customer Service pickup auto-fill တွင် အသုံးပြုမည်')}</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Merchant ID" value={merchantForm.merchant_id} onChange={(e) => setMerchantForm({ ...merchantForm, merchant_id: e.target.value })} />
              <Input placeholder="Merchant Code" value={merchantForm.merchant_code} onChange={(e) => setMerchantForm({ ...merchantForm, merchant_code: e.target.value })} />
              <Input placeholder="Merchant Name" value={merchantForm.merchant_name} onChange={(e) => setMerchantForm({ ...merchantForm, merchant_name: e.target.value })} />
              <Input placeholder="Primary Phone" value={merchantForm.phone_primary} onChange={(e) => setMerchantForm({ ...merchantForm, phone_primary: e.target.value })} />
              <textarea className="min-h-[90px] w-full rounded-md border p-3 text-sm" placeholder="Pickup Address" value={merchantForm.address_line_1} onChange={(e) => setMerchantForm({ ...merchantForm, address_line_1: e.target.value })} />
              <Input placeholder="Township" value={merchantForm.township} onChange={(e) => setMerchantForm({ ...merchantForm, township: e.target.value })} />
              <Input placeholder="City" value={merchantForm.city} onChange={(e) => setMerchantForm({ ...merchantForm, city: e.target.value })} />
              <Input placeholder="Region / State" value={merchantForm.region_state} onChange={(e) => setMerchantForm({ ...merchantForm, region_state: e.target.value })} />
              <Input placeholder="Business Type" value={merchantForm.business_type} onChange={(e) => setMerchantForm({ ...merchantForm, business_type: e.target.value })} />
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={merchantForm.payment_terms} onChange={(e) => setMerchantForm({ ...merchantForm, payment_terms: e.target.value })}>
                <option value="COD">COD</option><option value="Prepaid">Prepaid</option><option value="Credit">Credit</option>
              </select>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={merchantForm.is_active} onChange={(e) => setMerchantForm({ ...merchantForm, is_active: e.target.checked })} /> Active</label>
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveMerchant} disabled={saving}>{editingMerchant ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />} {editingMerchant ? tt(language, 'Update Merchant', 'Merchant ပြင်မည်') : tt(language, 'Add Merchant', 'Merchant ထည့်မည်')}</Button>
                {editingMerchant && <Button variant="outline" onClick={() => { setEditingMerchant(null); setMerchantForm(emptyMerchantForm); }}><X className="mr-2 h-4 w-4" /> Cancel</Button>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{tt(language, 'Merchant Register', 'Merchant စာရင်း')}</CardTitle><CardDescription>{merchantRows.length} record(s)</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {merchantRows.map((row: any) => (
                <div key={row.merchant_id || row.id || row.merchant_code || row.merchant_name} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{safeText(row.merchant_name)}</div>
                      <div className="text-sm text-muted-foreground">{safeText(row.merchant_code || row.merchant_id)} · {safeText(row.phone_primary)}</div>
                      <div className="text-sm text-muted-foreground">{safeText(row.township)} · {safeText(row.city || row.region_state)}</div>
                      <div className="mt-1 max-w-xl text-sm text-muted-foreground">{safeText(row.address_line_1)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={row.is_active === false ? 'destructive' : 'default'}>{row.is_active === false ? 'Inactive' : 'Active'}</Badge>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => editMerchant(row)}><Pencil className="mr-1 h-3 w-3" />Edit</Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteRow('merchant_master', row, ['merchant_id', 'id'], safeText(row.merchant_name, 'merchant'))}><Trash2 className="mr-1 h-3 w-3" />Delete</Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {!merchantRows.length && <Empty text={tt(language, 'No merchant master records.', 'merchant master record မရှိပါ')} />}
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'townships' && (
        <div className="grid gap-6 xl:grid-cols-[460px_minmax(0,1fr)]">
          <Card>
            <CardHeader><CardTitle>{editingTownship ? tt(language, 'Edit Township', 'Township ပြင်ဆင်ရန်') : tt(language, 'Add Township', 'Township အသစ်ထည့်ရန်')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Township Code" value={townshipForm.township_code} onChange={(e) => setTownshipForm({ ...townshipForm, township_code: e.target.value })} />
              <Input placeholder="Township Name" value={townshipForm.township_name} onChange={(e) => setTownshipForm({ ...townshipForm, township_name: e.target.value })} />
              <Input placeholder="Myanmar Name" value={townshipForm.township_mm} onChange={(e) => setTownshipForm({ ...townshipForm, township_mm: e.target.value })} />
              <Input placeholder="City" value={townshipForm.city} onChange={(e) => setTownshipForm({ ...townshipForm, city: e.target.value })} />
              <Input placeholder="Region / State" value={townshipForm.region_state} onChange={(e) => setTownshipForm({ ...townshipForm, region_state: e.target.value })} />
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={townshipForm.zone} onChange={(e) => setTownshipForm({ ...townshipForm, zone: e.target.value })}>
                <option value="Zone A">Zone A</option><option value="Zone B">Zone B</option><option value="Zone C">Zone C</option><option value="Zone D">Zone D</option><option value="Zone E">Zone E</option>
              </select>
              <Input placeholder="Delivery Fee" value={townshipForm.delivery_fee} onChange={(e) => setTownshipForm({ ...townshipForm, delivery_fee: e.target.value })} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={townshipForm.is_active} onChange={(e) => setTownshipForm({ ...townshipForm, is_active: e.target.checked })} /> Active</label>
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveTownship} disabled={saving}>{editingTownship ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />} {editingTownship ? 'Update Township' : 'Add Township'}</Button>
                {editingTownship && <Button variant="outline" onClick={() => { setEditingTownship(null); setTownshipForm(emptyTownshipForm); }}><X className="mr-2 h-4 w-4" />Cancel</Button>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{tt(language, 'Township Register', 'Township စာရင်း')}</CardTitle><CardDescription>{townshipRows.length} record(s)</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {townshipRows.map((row: any) => (
                <div key={row.id || row.township_code || row.township_name || row.name} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{safeText(row.township_name || row.name || row.township)}</div>
                      <div className="text-sm text-muted-foreground">{safeText(row.township_code || row.code)} · {safeText(row.zone)} · {safeText(row.city || row.region_state || row.region)}</div>
                      <div className="text-sm text-muted-foreground">Fee: {safeText(row.delivery_fee || row.fee, '0')} MMK</div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => editTownship(row)}><Pencil className="mr-1 h-3 w-3" />Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteRow('townships', row, ['id', 'township_code'], safeText(row.township_name || row.name, 'township'))}><Trash2 className="mr-1 h-3 w-3" />Delete</Button>
                    </div>
                  </div>
                </div>
              ))}
              {!townshipRows.length && <Empty text={tt(language, 'No township master records.', 'township master record မရှိပါ')} />}
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'staff' && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card>
            <CardHeader><CardTitle>{editingStaff ? tt(language, 'Edit Staff', 'ဝန်ထမ်းပြင်ရန်') : tt(language, 'Add Staff', 'ဝန်ထမ်းအသစ်ထည့်ရန်')}</CardTitle><CardDescription>{tt(language, 'Production staff master entry.', 'production staff master entry')}</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder={tt(language, 'Staff Code', 'Staff Code')} value={staffForm.staff_code} onChange={(e) => setStaffForm({ ...staffForm, staff_code: e.target.value })} />
              <Input placeholder={tt(language, 'Full Name', 'အမည်အပြည့်အစုံ')} value={staffForm.full_name} onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })} />
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={staffForm.staff_type} onChange={(e) => setStaffForm({ ...staffForm, staff_type: e.target.value, role_name: e.target.value })}>
                <option value="driver">Driver</option><option value="rider">Rider</option><option value="helper">Helper</option><option value="warehouse">Warehouse</option><option value="customer-service">Customer Service</option><option value="finance">Finance</option><option value="supervisor">Supervisor</option><option value="branch-office">Branch Office</option><option value="admin">Admin</option><option value="other">Other</option>
              </select>
              <Input placeholder={tt(language, 'Role Name', 'Role Name')} value={staffForm.role_name} onChange={(e) => setStaffForm({ ...staffForm, role_name: e.target.value })} />
              <Input placeholder={tt(language, 'Phone', 'ဖုန်း')} value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} />
              <Input placeholder={tt(language, 'Email', 'အီးမေးလ်')} value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} />
              <Input placeholder={tt(language, 'Branch Name', 'ရုံးခွဲအမည်')} value={staffForm.branch_name} onChange={(e) => setStaffForm({ ...staffForm, branch_name: e.target.value })} />
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={staffForm.warehouse_id} onChange={(e) => setStaffForm({ ...staffForm, warehouse_id: e.target.value })}>
                <option value="">{tt(language, 'No Warehouse', 'Warehouse မချိတ်ဆက်ပါ')}</option>
                {warehouseRows.map((wh: any) => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={staffForm.is_active} onChange={(e) => setStaffForm({ ...staffForm, is_active: e.target.checked })} /> Active</label>
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveStaff} disabled={saving}>{editingStaff ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />} {editingStaff ? tt(language, 'Update Staff', 'ဝန်ထမ်းပြင်မည်') : tt(language, 'Add Staff', 'ဝန်ထမ်းထည့်မည်')}</Button>
                {editingStaff && <Button variant="outline" onClick={() => { setEditingStaff(null); setStaffForm(emptyStaffForm); }}><X className="mr-2 h-4 w-4" />Cancel</Button>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{tt(language, 'Staff Register', 'ဝန်ထမ်းစာရင်း')}</CardTitle><CardDescription>{tt(language, 'Live staff master data.', 'live staff master data')}</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {staffRows.map((row: any) => (
                <div key={row.id} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{row.full_name}</div>
                      <div className="text-sm text-muted-foreground">{row.staff_code} · {safeText(row.role_name)}</div>
                      <div className="text-sm text-muted-foreground">{safeText(row.phone)} · {safeText(row.email)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={row.is_active ? 'default' : 'destructive'}>{row.is_active ? tt(language, 'Active', 'Active') : tt(language, 'Inactive', 'Inactive')}</Badge>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => editStaff(row)}><Pencil className="mr-1 h-3 w-3" />Edit</Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteRow('staff_master', row, ['id'], safeText(row.full_name, 'staff'))}><Trash2 className="mr-1 h-3 w-3" />Delete</Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {!staffRows.length && <Empty text={tt(language, 'No staff master records.', 'staff master record မရှိပါ')} />}
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'vehicles' && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card>
            <CardHeader><CardTitle>{editingVehicle ? tt(language, 'Edit Vehicle', 'ယာဉ်ပြင်ရန်') : tt(language, 'Add Vehicle', 'ယာဉ်အသစ်ထည့်ရန်')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder={tt(language, 'Vehicle Code', 'Vehicle Code')} value={vehicleForm.vehicle_code} onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_code: e.target.value })} />
              <Input placeholder={tt(language, 'Registration No', 'ယာဉ်မှတ်ပုံတင်နံပါတ်')} value={vehicleForm.registration_no} onChange={(e) => setVehicleForm({ ...vehicleForm, registration_no: e.target.value })} />
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={vehicleForm.vehicle_type} onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_type: e.target.value })}>
                <option value="bicycle">Bicycle</option><option value="motorbike">Motorbike</option><option value="van">Van</option><option value="truck">Truck</option><option value="car">Car</option><option value="other">Other</option>
              </select>
              <Input placeholder={tt(language, 'Display Name', 'ဖော်ပြမည့်အမည်')} value={vehicleForm.display_name} onChange={(e) => setVehicleForm({ ...vehicleForm, display_name: e.target.value })} />
              <Input placeholder={tt(language, 'Capacity KG', 'အလေးချိန်စွမ်းရည် KG')} value={vehicleForm.capacity_kg} onChange={(e) => setVehicleForm({ ...vehicleForm, capacity_kg: e.target.value })} />
              <Input placeholder="Status" value={vehicleForm.status} onChange={(e) => setVehicleForm({ ...vehicleForm, status: e.target.value })} />
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={vehicleForm.warehouse_id} onChange={(e) => setVehicleForm({ ...vehicleForm, warehouse_id: e.target.value })}>
                <option value="">{tt(language, 'No Warehouse', 'Warehouse မချိတ်ဆက်ပါ')}</option>
                {warehouseRows.map((wh: any) => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
              </select>
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveVehicle} disabled={saving}>{editingVehicle ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />} {editingVehicle ? tt(language, 'Update Vehicle', 'ယာဉ်ပြင်မည်') : tt(language, 'Add Vehicle', 'ယာဉ်ထည့်မည်')}</Button>
                {editingVehicle && <Button variant="outline" onClick={() => { setEditingVehicle(null); setVehicleForm(emptyVehicleForm); }}><X className="mr-2 h-4 w-4" />Cancel</Button>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{tt(language, 'Vehicle Register', 'ယာဉ်စာရင်း')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {vehicleRows.map((row: any) => (
                <div key={row.id} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{safeText(row.display_name, row.vehicle_code)}</div>
                      <div className="text-sm text-muted-foreground">{row.vehicle_code} · {safeText(row.registration_no)} · {safeText(row.vehicle_type)}</div>
                      <div className="text-sm text-muted-foreground">{tt(language, 'Capacity', 'စွမ်းရည်')}: {row.capacity_kg || 0} kg</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="secondary">{safeText(row.status)}</Badge>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => editVehicle(row)}><Pencil className="mr-1 h-3 w-3" />Edit</Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteRow('vehicle_master', row, ['id'], safeText(row.vehicle_code, 'vehicle'))}><Trash2 className="mr-1 h-3 w-3" />Delete</Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {!vehicleRows.length && <Empty text={tt(language, 'No vehicle master records.', 'vehicle master record မရှိပါ')} />}
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'assets' && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card>
            <CardHeader><CardTitle>{editingAsset ? tt(language, 'Edit Asset', 'ပစ္စည်းပြင်ရန်') : tt(language, 'Add Asset', 'ပစ္စည်းအသစ်ထည့်ရန်')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder={tt(language, 'Asset Code', 'Asset Code')} value={assetForm.asset_code} onChange={(e) => setAssetForm({ ...assetForm, asset_code: e.target.value })} />
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={assetForm.asset_type} onChange={(e) => setAssetForm({ ...assetForm, asset_type: e.target.value })}>
                <option value="scanner">Scanner</option><option value="mobile-phone">Mobile Phone</option><option value="helmet">Helmet</option><option value="bag">Bag</option><option value="printer">Printer</option><option value="signature-pad">Signature Pad</option><option value="camera">Camera</option><option value="sim-card">SIM Card</option><option value="uniform">Uniform</option><option value="other">Other</option>
              </select>
              <Input placeholder={tt(language, 'Model Name', 'Model Name')} value={assetForm.model_name} onChange={(e) => setAssetForm({ ...assetForm, model_name: e.target.value })} />
              <Input placeholder={tt(language, 'Serial No', 'Serial No')} value={assetForm.serial_no} onChange={(e) => setAssetForm({ ...assetForm, serial_no: e.target.value })} />
              <Input placeholder="Status" value={assetForm.status} onChange={(e) => setAssetForm({ ...assetForm, status: e.target.value })} />
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveAsset} disabled={saving}>{editingAsset ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />} {editingAsset ? tt(language, 'Update Asset', 'ပစ္စည်းပြင်မည်') : tt(language, 'Add Asset', 'ပစ္စည်းထည့်မည်')}</Button>
                {editingAsset && <Button variant="outline" onClick={() => { setEditingAsset(null); setAssetForm(emptyAssetForm); }}><X className="mr-2 h-4 w-4" />Cancel</Button>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{tt(language, 'Asset Register', 'ပစ္စည်းစာရင်း')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {assetRows.map((row: any) => (
                <div key={row.id} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{row.asset_code}</div>
                      <div className="text-sm text-muted-foreground">{safeText(row.asset_type)} · {safeText(row.model_name)} · {safeText(row.serial_no)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="secondary">{safeText(row.status)}</Badge>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => editAsset(row)}><Pencil className="mr-1 h-3 w-3" />Edit</Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteRow('asset_master', row, ['id'], safeText(row.asset_code, 'asset'))}><Trash2 className="mr-1 h-3 w-3" />Delete</Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {!assetRows.length && <Empty text={tt(language, 'No asset master records.', 'asset master record မရှိပါ')} />}
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'assignments' && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card>
            <CardHeader><CardTitle>{editingAssignment ? tt(language, 'Edit Assignment', 'ခန့်ထားမှုပြင်ရန်') : tt(language, 'Add Assignment', 'ခန့်ထားမှုအသစ်ထည့်ရန်')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={assignmentForm.staff_id} onChange={(e) => setAssignmentForm({ ...assignmentForm, staff_id: e.target.value })}>
                <option value="">{tt(language, 'Select Staff', 'ဝန်ထမ်းရွေးပါ')}</option>
                {staffRows.map((row: any) => <option key={row.id} value={row.id}>{row.full_name} · {row.staff_code}</option>)}
              </select>
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={assignmentForm.asset_id} onChange={(e) => setAssignmentForm({ ...assignmentForm, asset_id: e.target.value })}>
                <option value="">{tt(language, 'No Asset', 'ပစ္စည်းမရွေးပါ')}</option>
                {assetRows.map((row: any) => <option key={row.id} value={row.id}>{row.asset_code} · {safeText(row.asset_type)}</option>)}
              </select>
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={assignmentForm.vehicle_id} onChange={(e) => setAssignmentForm({ ...assignmentForm, vehicle_id: e.target.value })}>
                <option value="">{tt(language, 'No Vehicle', 'ယာဉ်မရွေးပါ')}</option>
                {vehicleRows.map((row: any) => <option key={row.id} value={row.id}>{row.vehicle_code} · {safeText(row.registration_no)}</option>)}
              </select>
              <Input placeholder="Status" value={assignmentForm.status} onChange={(e) => setAssignmentForm({ ...assignmentForm, status: e.target.value })} />
              <textarea className="min-h-[110px] w-full rounded-md border p-3 text-sm" placeholder={tt(language, 'Notes', 'မှတ်ချက်')} value={assignmentForm.notes} onChange={(e) => setAssignmentForm({ ...assignmentForm, notes: e.target.value })} />
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveAssignment} disabled={saving}>{editingAssignment ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />} {editingAssignment ? tt(language, 'Update Assignment', 'ခန့်ထားမှုပြင်မည်') : tt(language, 'Add Assignment', 'ခန့်ထားမှုထည့်မည်')}</Button>
                {editingAssignment && <Button variant="outline" onClick={() => { setEditingAssignment(null); setAssignmentForm(emptyAssignmentForm); }}><X className="mr-2 h-4 w-4" />Cancel</Button>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{tt(language, 'Assignment Ledger', 'ခန့်ထားမှုစာရင်း')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {assignmentRows.map((row: any) => (
                <div key={row.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{staffMap.get(row.staff_id)?.full_name || 'Unknown staff'}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{assetMap.get(row.asset_id)?.asset_code || tt(language, 'No asset', 'ပစ္စည်းမရှိ')} · {vehicleMap.get(row.vehicle_id)?.vehicle_code || tt(language, 'No vehicle', 'ယာဉ်မရှိ')}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{fmtDate(row.assigned_at)} · {safeText(row.status)}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => editAssignment(row)}><Pencil className="mr-1 h-3 w-3" />Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteRow('staff_asset_assignments', row, ['id'], 'assignment')}><Trash2 className="mr-1 h-3 w-3" />Delete</Button>
                    </div>
                  </div>
                </div>
              ))}
              {!assignmentRows.length && <Empty text={tt(language, 'No assignments.', 'ခန့်ထားမှုမရှိပါ')} />}
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'scans' && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card>
            <CardHeader><CardTitle>{tt(language, 'Log QR Workflow Step', 'QR Workflow Step မှတ်တမ်းတင်ရန်')}</CardTitle><CardDescription>{tt(language, 'This is the production foundation for scan-based responsibility transfer.', 'scan-based responsibility transfer အတွက် production foundation')}</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={scanForm.actor_staff_id} onChange={(e) => setScanForm({ ...scanForm, actor_staff_id: e.target.value })}>
                <option value="">{tt(language, 'Actor Staff', 'လုပ်ဆောင်သူ staff')}</option>
                {staffRows.map((row: any) => <option key={row.id} value={row.id}>{row.full_name}</option>)}
              </select>
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={scanForm.next_staff_id} onChange={(e) => setScanForm({ ...scanForm, next_staff_id: e.target.value })}>
                <option value="">{tt(language, 'Next Responsible Staff', 'နောက်ထပ် တာဝန်ယူမည့် staff')}</option>
                {staffRows.map((row: any) => <option key={row.id} value={row.id}>{row.full_name}</option>)}
              </select>
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={scanForm.shipment_id} onChange={(e) => setScanForm({ ...scanForm, shipment_id: e.target.value })}>
                <option value="">{tt(language, 'Select Shipment', 'Shipment ရွေးပါ')}</option>
                {shipmentRows.map((row: any) => <option key={row.id} value={row.id}>{row.awb || row.tracking_no} · {safeText(row.recipient?.name || row.receiver_name || row.recipient_name)}</option>)}
              </select>
              <Input placeholder={tt(language, 'Process Step (handover / inbound / sorting / dispatch)', 'Process Step')} value={scanForm.process_step} onChange={(e) => setScanForm({ ...scanForm, process_step: e.target.value })} />
              <Input placeholder={tt(language, 'Territory Code', 'Territory Code')} value={scanForm.territory_code} onChange={(e) => setScanForm({ ...scanForm, territory_code: e.target.value })} />
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={scanForm.scan_channel} onChange={(e) => setScanForm({ ...scanForm, scan_channel: e.target.value })}>
                <option value="qr_scanner">QR Scanner</option><option value="mobile_scanner">Mobile Scanner</option><option value="manual_override">Manual Override</option>
              </select>
              <textarea className="min-h-[110px] w-full rounded-md border p-3 text-sm" placeholder={tt(language, 'Notes', 'မှတ်ချက်')} value={scanForm.notes} onChange={(e) => setScanForm({ ...scanForm, notes: e.target.value })} />
              <Button onClick={createScan} disabled={saving}><QrCode className="mr-2 h-4 w-4" /> {tt(language, 'Record Scan Step', 'Scan Step မှတ်တမ်းတင်မည်')}</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{tt(language, 'Latest QR Events', 'နောက်ဆုံး QR Events')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {scanRows.map((row: any) => (
                <div key={row.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{safeText(row.process_step)}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{shipmentMap.get(row.shipment_id)?.awb || shipmentMap.get(row.shipment_id)?.tracking_no || tt(language, 'No shipment', 'shipment မရှိ')} · {' '}{staffMap.get(row.actor_staff_id)?.full_name || tt(language, 'Unknown actor', 'မသိသေးသော actor')} {' → '} {staffMap.get(row.next_staff_id)?.full_name || tt(language, 'No next staff', 'နောက်ထပ် staff မသတ်မှတ်ရသေး')}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{fmtDate(row.created_at)} · {safeText(row.scan_channel)} · {safeText(row.territory_code)}</div>
                    </div>
                    <Button size="sm" variant="destructive" onClick={() => deleteRow('qr_scan_events', row, ['id'], 'QR event')}><Trash2 className="mr-1 h-3 w-3" />Delete</Button>
                  </div>
                </div>
              ))}
              {!scanRows.length && <Empty text={tt(language, 'No QR workflow events yet.', 'QR workflow events မရှိသေးပါ')} />}
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'acknowledgements' && (
        <Card>
          <CardHeader><CardTitle>{tt(language, 'Workflow Acknowledgements', 'Workflow Acknowledgements')}</CardTitle><CardDescription>{tt(language, 'Accept, complete, reject, remind, or delete pending responsibility handoffs.', 'တာဝန်လွှဲပြောင်းမှုများကို manage လုပ်နိုင်သည်')}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {ackRows.map((row: any) => (
              <div key={row.id} className="rounded-2xl border p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="font-semibold">{staffMap.get(row.responsible_staff_id)?.full_name || 'Unknown staff'}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{tt(language, 'Status', 'အခြေအနေ')}: {safeText(row.status)} · {' '}{tt(language, 'Due', 'Due')}: {fmtDate(row.due_at)}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{tt(language, 'Reminder Count', 'Reminder Count')}: {row.reminder_count || 0}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => updateAck(row.id, 'accepted')} disabled={saving}>{tt(language, 'Accept', 'လက်ခံမည်')}</Button>
                    <Button size="sm" variant="outline" onClick={() => updateAck(row.id, 'completed')} disabled={saving}>{tt(language, 'Complete', 'ပြီးစီးကြောင်းအတည်ပြုမည်')}</Button>
                    <Button size="sm" variant="outline" onClick={() => updateAck(row.id, 'rejected')} disabled={saving}>{tt(language, 'Reject', 'ငြင်းပယ်မည်')}</Button>
                    <Button size="sm" onClick={() => remindAck(row.id)} disabled={saving}>{tt(language, 'Remind', 'သတိပေးမည်')}</Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteRow('workflow_acknowledgements', row, ['id'], 'acknowledgement')} disabled={saving}><Trash2 className="mr-1 h-3 w-3" /> Delete</Button>
                  </div>
                </div>
              </div>
            ))}
            {!ackRows.length && <Empty text={tt(language, 'No workflow acknowledgements.', 'workflow acknowledgement မရှိပါ')} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{text}</div>;
}