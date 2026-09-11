import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Download,
  FileCheck2,
  FileSpreadsheet,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  financialV2Calculate,
  financialV2CreateWaybill,
  financialV2Save,
  financialV2Schema,
  financialV2Snapshot,
  type FinancialV2Envelope,
  type FinancialV2Field,
  type FinancialV2SchemaData,
} from '@/lib/dataEntryFinancialV2Api';

export const DATA_ENTRY_FINANCIAL_V2_BUILD = 'PORTAL_DATA_ENTRY_FINANCIAL_V2_V60_2026_08_02';

const CLIENT_WRITES_ENABLED = String(import.meta.env.VITE_FINANCIAL_V2_WRITES_ENABLED || 'false').toLowerCase() === 'true';
const PICKUP_RPC = 'be_data_entry_pickup_list_web_v16';
const SECTION_ORDER = [
  'Parcel Identity',
  'Recipient & Address',
  'Collection Instructions',
  'Weight & Tariff',
  'Merchant Settlement',
  'Validation',
  'Photo Evidence',
  'Audit Information',
];
const AMOUNT_TYPES = [
  'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
  'TOTAL_AMOUNT_INCLUDING_DELIVERY',
  'DELIVERY_CHARGE_ONLY',
  'EXACT_COLLECTION_AMOUNT',
  'OPAQUE_COD_COLLECTION',
  'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT',
];
const STATUS_OPTIONS = ['registered', 'ready_for_waybill', 'needs_fix'];
const NUMERIC_TYPES = new Set(['bigint', 'integer', 'numeric', 'decimal', 'number']);
const TEXTAREA_FIELDS = new Set(['delivery_address', 'remarks', 'validation_message']);
const INPUT_CLASS = 'mt-1 w-full rounded-lg border border-[#1a3a5c] bg-[#061524] px-3 py-2 text-[12px] text-[#eef8ff] outline-none focus:border-[#f6b84b] disabled:cursor-not-allowed disabled:text-[#7898af]';
const SERVER_CLASS = 'mt-1 min-h-[38px] w-full rounded-lg border border-[#1a3a5c] bg-[#0b2236] px-3 py-2 text-[12px] text-[#8fd3ff]';

interface PickupRow {
  pickup_id: string;
  merchant_id: string;
  merchant_name: string;
  township: string;
  city: string;
  expected_parcels: number;
  verified_parcels: number;
  rider_status: string;
  pickup_status: string;
  pickup_date: string;
  [key: string]: unknown;
}

interface EditorRow {
  key: string;
  pickup_id: string;
  parcel_sequence: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  proof: Record<string, unknown>;
  calculation?: FinancialV2Envelope<Record<string, unknown>>;
  saveCheck?: FinancialV2Envelope<Record<string, unknown>>;
  calculating: boolean;
  checkingSave: boolean;
  error: string;
  photoReviewed: boolean;
  photoUnavailableAcknowledged: boolean;
}

interface WorkbookCheck {
  fileName: string;
  valid: boolean;
  rowCount: number;
  headerCount: number;
  missing: string[];
  unexpected: string[];
  message: string;
}

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

function numberValue(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function asPositiveInteger(value: unknown): number {
  const result = Math.trunc(numberValue(value));
  return result > 0 ? result : 0;
}

function title(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function requestId(prefix: string): string {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${id}`;
}

function extractArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  }
  if (!value || typeof value !== 'object') return [];
  const object = value as Record<string, unknown>;
  for (const key of ['rows', 'items', 'pickups', 'data', 'result']) {
    const nested = extractArray(object[key]);
    if (nested.length) return nested;
  }
  return [];
}

function normalizePickup(value: Record<string, unknown>): PickupRow | null {
  const pickupId = text(value.pickup_id || value.pickupId || value.pickup_code).trim();
  if (!pickupId) return null;
  return {
    ...value,
    pickup_id: pickupId,
    merchant_id: text(value.merchant_id || value.merchant_code || value.os).trim().toUpperCase(),
    merchant_name: text(value.merchant_name || value.online_shop_name || value.os_name).trim(),
    township: text(value.township || value.pickup_township).trim(),
    city: text(value.city || value.pickup_city || value.destination).trim(),
    expected_parcels: asPositiveInteger(value.expected_parcels || value.expected_parcel_count || value.parcel_count),
    verified_parcels: asPositiveInteger(value.verified_parcels),
    rider_status: text(value.rider_status).trim(),
    pickup_status: text(value.pickup_status || value.workflow_stage).trim(),
    pickup_date: text(value.pickup_date || value.created_at).trim(),
  };
}

function expectedPickupCount(pickup?: PickupRow | null): number {
  if (!pickup) return 0;
  return pickup.expected_parcels || pickup.verified_parcels || 0;
}

function proofSequence(value: Record<string, unknown>): number {
  return asPositiveInteger(value.parcel_sequence || value.item_no || value.sequence_no);
}

function proofPhoto(value: Record<string, unknown>): string {
  return text(value.photo_url || value.proof_photo_url || value.proof_photo_path || value.image_url || value.image_path).trim();
}

function initialInput(pickup: PickupRow, proof: Record<string, unknown>, sequence: number): Record<string, unknown> {
  return {
    customer_id: text(proof.customer_id),
    merchant_id: text(proof.merchant_id || proof.merchant_code || pickup.merchant_id).trim().toUpperCase(),
    status: text(proof.status || proof.parcel_status || 'registered'),
    recipient_name: text(proof.recipient_name),
    recipient_phone: text(proof.recipient_phone || proof.contact_no_1),
    township: text(proof.township || pickup.township),
    delivery_address: text(proof.delivery_address || proof.recipient_address),
    item_price: proof.item_price ?? '',
    delivery_charges: proof.delivery_charges ?? proof.delivery_fee ?? '',
    weight_kg: proof.weight_kg ?? proof.parcel_weight_kg ?? proof.actual_weight_kg ?? '',
    amount_entry_type: text(proof.amount_entry_type),
    merchant_stated_total_amount: proof.merchant_stated_total_amount ?? '',
    additional_customer_charge: proof.additional_customer_charge ?? '',
    cbm_surcharge: proof.cbm_surcharge ?? '',
    other_surcharge: proof.other_surcharge ?? '',
    merchant_payable_charges: proof.merchant_payable_charges ?? '',
    other_merchant_credits: proof.other_merchant_credits ?? '',
    remarks: text(proof.remarks || proof.remark),
    pickup_id: pickup.pickup_id,
    parcel_sequence: sequence,
  };
}

function cleanPayload(row: EditorRow, schema: FinancialV2SchemaData): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    pickup_id: row.pickup_id,
    parcel_sequence: row.parcel_sequence,
  };
  for (const field of schema.fields) {
    if (!field.editable || field.ownership !== 'INPUT') continue;
    const raw = row.input[field.name];
    if (raw === '' || raw === undefined) payload[field.name] = null;
    else if (NUMERIC_TYPES.has(field.data_type)) payload[field.name] = Number(raw);
    else payload[field.name] = raw;
  }
  return payload;
}

function envelopeMessage(value?: FinancialV2Envelope<Record<string, unknown>>): string {
  if (!value) return '';
  const errors = Array.isArray(value.errors) ? value.errors.map((item) => item.message).filter(Boolean) : [];
  const warnings = Array.isArray(value.warnings) ? value.warnings.map((item) => item.message).filter(Boolean) : [];
  if (errors.length) return errors.join(' ');
  if (warnings.length) return warnings.join(' ');
  return text(value.data?.validation_message || value.message);
}

function formatValue(value: unknown, field?: FinancialV2Field): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field && NUMERIC_TYPES.has(field.data_type) && /amount|charge|tariff|refund|surcharge|settlement|price|credit|difference/i.test(field.name)) {
    return `${numberValue(value).toLocaleString('en-US')} MMK`;
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

export default function DataEntryFinancialV2Page() {
  const [schemaEnvelope, setSchemaEnvelope] = useState<FinancialV2Envelope<FinancialV2SchemaData> | null>(null);
  const [pickups, setPickups] = useState<PickupRow[]>([]);
  const [selectedPickupId, setSelectedPickupId] = useState('');
  const [rows, setRows] = useState<EditorRow[]>([]);
  const [extraProofRows, setExtraProofRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'register' | 'snapshot'>('register');
  const [snapshotQuery, setSnapshotQuery] = useState('');
  const [snapshotRows, setSnapshotRows] = useState<Array<Record<string, unknown>>>([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [workbookCheck, setWorkbookCheck] = useState<WorkbookCheck | null>(null);
  const [waybillResult, setWaybillResult] = useState<FinancialV2Envelope<Record<string, unknown>> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const schema = schemaEnvelope?.data || null;
  const selectedPickup = pickups.find((item) => item.pickup_id === selectedPickupId) || null;
  const expectedCount = expectedPickupCount(selectedPickup);
  const fieldsBySection = useMemo(() => {
    const result = new Map<string, FinancialV2Field[]>();
    for (const field of schema?.fields || []) {
      const list = result.get(field.section) || [];
      list.push(field);
      result.set(field.section, list);
    }
    return result;
  }, [schema?.fields]);

  async function loadSchemaAndPickups() {
    setLoading(true);
    setMessage('');
    try {
      const schemaResult = await financialV2Schema();
      if (!schemaResult.ok || !schemaResult.data) throw new Error(envelopeMessage(schemaResult) || 'Financial V2 schema is unavailable.');
      if (schemaResult.data.field_count !== 50) throw new Error(`Backend Financial V2 schema returned ${schemaResult.data.field_count} fields; expected 50.`);
      setSchemaEnvelope(schemaResult);

      let pickupResponse = await supabase.rpc(PICKUP_RPC, { p_limit: 200 });
      if (pickupResponse.error) pickupResponse = await supabase.rpc('be_data_entry_pickup_list_any', { p_limit: 200 });
      if (pickupResponse.error) throw pickupResponse.error;
      const queue = extractArray(pickupResponse.data).map(normalizePickup).filter((item): item is PickupRow => Boolean(item));
      setPickups(queue);
      setSelectedPickupId((current) => current && queue.some((item) => item.pickup_id === current) ? current : queue[0]?.pickup_id || '');
    } catch (error: any) {
      setMessage(error?.message || 'Financial V2 startup failed.');
    } finally {
      setLoading(false);
    }
  }

  async function loadRowsForPickup(pickup: PickupRow) {
    setLoadingRows(true);
    setMessage('');
    setWaybillResult(null);
    try {
      const sources = ['be_v_data_entry_parcel_rows', 'be_v_data_entry_parcel_template', 'be_v_data_entry_parcel_proofs'];
      let proofs: Array<Record<string, unknown>> = [];
      const sourceErrors: string[] = [];
      for (const source of sources) {
        const response = await supabase.from(source).select('*').eq('pickup_id', pickup.pickup_id).order('parcel_sequence', { ascending: true });
        if (response.error) {
          sourceErrors.push(`${source}: ${response.error.message}`);
          continue;
        }
        proofs = (response.data || []) as Array<Record<string, unknown>>;
        if (proofs.length) break;
      }

      const authoritativeCount = expectedPickupCount(pickup);
      if (!authoritativeCount) throw new Error('The pickup has no authoritative expected parcel count. Registration is blocked.');
      const extras = proofs.filter((proof) => proofSequence(proof) > authoritativeCount);
      setExtraProofRows(extras);

      setRows(Array.from({ length: authoritativeCount }, (_, offset) => {
        const sequence = offset + 1;
        const proof = proofs.find((item) => proofSequence(item) === sequence) || {};
        return {
          key: `${pickup.pickup_id}:${sequence}`,
          pickup_id: pickup.pickup_id,
          parcel_sequence: sequence,
          input: initialInput(pickup, proof, sequence),
          output: { ...proof, environment: 'PRODUCTION' },
          proof,
          calculating: false,
          checkingSave: false,
          error: '',
          photoReviewed: false,
          photoUnavailableAcknowledged: false,
        };
      }));
      if (!proofs.length && sourceErrors.length === sources.length) setMessage(sourceErrors.join(' | '));
    } catch (error: any) {
      setRows([]);
      setExtraProofRows([]);
      setMessage(error?.message || 'Could not load pickup parcel evidence.');
    } finally {
      setLoadingRows(false);
    }
  }

  async function loadSnapshot() {
    setSnapshotLoading(true);
    setMessage('');
    try {
      const response = await financialV2Snapshot(snapshotQuery.trim() ? { query: snapshotQuery.trim() } : {}, 200);
      if (!response.ok || !response.data) throw new Error(envelopeMessage(response) || 'Financial V2 snapshot failed.');
      setSnapshotRows(response.data.rows || []);
    } catch (error: any) {
      setSnapshotRows([]);
      setMessage(error?.message || 'Could not load the Financial V2 snapshot.');
    } finally {
      setSnapshotLoading(false);
    }
  }

  useEffect(() => {
    void loadSchemaAndPickups();
    void loadSnapshot();
  }, []);

  useEffect(() => {
    if (selectedPickup && schema) void loadRowsForPickup(selectedPickup);
    else if (!selectedPickupId) setRows([]);
  }, [selectedPickupId, schema?.schema_version]);

  function updateInput(index: number, field: string, value: unknown) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index
      ? { ...row, input: { ...row.input, [field]: value }, calculation: undefined, saveCheck: undefined, error: '' }
      : row));
  }

  async function calculateRow(index: number) {
    if (!schema) return;
    const current = rows[index];
    if (!current) return;
    setRows((items) => items.map((row, rowIndex) => rowIndex === index ? { ...row, calculating: true, error: '' } : row));
    try {
      const response = await financialV2Calculate(cleanPayload(current, schema));
      setRows((items) => items.map((row, rowIndex) => rowIndex === index ? {
        ...row,
        calculating: false,
        calculation: response,
        output: { ...row.output, ...(response.data || {}) },
        error: response.ok ? '' : envelopeMessage(response),
      } : row));
    } catch (error: any) {
      setRows((items) => items.map((row, rowIndex) => rowIndex === index ? { ...row, calculating: false, error: error?.message || 'Backend calculation failed.' } : row));
    }
  }

  async function calculateAll() {
    for (let index = 0; index < rows.length; index += 1) await calculateRow(index);
  }

  async function checkSave(index: number) {
    if (!schema) return;
    const current = rows[index];
    if (!current) return;
    if (CLIENT_WRITES_ENABLED && !window.confirm('This will persist the backend-calculated Financial V2 row in production. Continue?')) return;
    setRows((items) => items.map((row, rowIndex) => rowIndex === index ? { ...row, checkingSave: true, error: '' } : row));
    try {
      const response = await financialV2Save({
        ...cleanPayload(current, schema),
        request_id: requestId('FINANCIAL_V2_SAVE'),
        dry_run: !CLIENT_WRITES_ENABLED,
        source_file_name: 'PORTAL_FINANCIAL_V2',
        reason: CLIENT_WRITES_ENABLED ? 'PORTAL_FINANCIAL_V2_SAVE' : 'PORTAL_FINANCIAL_V2_SAVE_DRY_RUN',
        destination: selectedPickup?.city || null,
      });
      setRows((items) => items.map((row, rowIndex) => rowIndex === index ? {
        ...row,
        checkingSave: false,
        saveCheck: response,
        output: { ...row.output, ...(response.data || {}) },
        error: response.ok ? '' : envelopeMessage(response),
      } : row));
      if (CLIENT_WRITES_ENABLED && response.ok) await loadSnapshot();
    } catch (error: any) {
      setRows((items) => items.map((row, rowIndex) => rowIndex === index ? { ...row, checkingSave: false, error: error?.message || 'Save validation failed.' } : row));
    }
  }

  async function checkAllSaves() {
    for (let index = 0; index < rows.length; index += 1) await checkSave(index);
  }

  async function checkWaybill() {
    if (!selectedPickupId) return;
    setMessage('');
    try {
      if (CLIENT_WRITES_ENABLED && !window.confirm('This will create a production waybill after backend readiness checks. Continue?')) return;
      const response = await financialV2CreateWaybill({
        pickup_id: selectedPickupId,
        request_id: requestId('FINANCIAL_V2_WAYBILL'),
        dry_run: !CLIENT_WRITES_ENABLED,
      });
      setWaybillResult(response);
      if (!response.ok) setMessage(envelopeMessage(response));
    } catch (error: any) {
      setWaybillResult(null);
      setMessage(error?.message || 'Waybill readiness check failed.');
    }
  }

  async function validateWorkbook(file: File) {
    if (!schema) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      const headers = (matrix[0] || []).map((value) => text(value).trim()).filter(Boolean);
      const expected = schema.fields.map((field) => field.name);
      const missing = expected.filter((field) => !headers.includes(field));
      const unexpected = headers.filter((field) => !expected.includes(field));
      const valid = missing.length === 0 && unexpected.length === 0 && headers.length === expected.length;
      setWorkbookCheck({
        fileName: file.name,
        valid,
        rowCount: Math.max(0, matrix.length - 1),
        headerCount: headers.length,
        missing,
        unexpected,
        message: valid
          ? 'The workbook matches the active 50-field Financial V2 schema. Posting remains disabled while the backend mutation mode is shadow.'
          : 'The workbook does not match the active backend schema and cannot be posted.',
      });
    } catch (error: any) {
      setWorkbookCheck({ fileName: file.name, valid: false, rowCount: 0, headerCount: 0, missing: [], unexpected: [], message: error?.message || 'Workbook validation failed.' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-[#8fd3ff]"><Loader2 className="mr-2 animate-spin" /> Loading backend Financial V2 contract…</div>;
  }

  return (
    <main className="space-y-5" data-build={DATA_ENTRY_FINANCIAL_V2_BUILD}>
      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#f6b84b]"><ShieldCheck size={15} /> Production Financial V2</div>
            <h1 className="mt-2 text-3xl font-black text-[#eef8ff]">Backend-Authoritative Data Entry</h1>
            <p className="mt-2 max-w-5xl text-[13px] leading-6 text-[#8fb4d0]">The backend schema controls fields, editability, calculations, validation and canonical identifiers. This page contains no local tariff formula and performs no direct financial table write.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/templates/parcel.xlsx" download className="inline-flex items-center gap-2 rounded-xl border border-[#38bdf8]/50 bg-[#38bdf8]/10 px-4 py-2.5 text-[12px] font-black text-[#8fd3ff]"><Download size={15} /> Download 50-field template</a>
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-[#1a3a5c] px-4 py-2.5 text-[12px] font-black text-[#eef8ff]"><FileSpreadsheet size={15} /> Validate workbook</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void validateWorkbook(file); }} />
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Metric label="Schema" value={schema?.schema_version || 'Unavailable'} />
          <Metric label="Field Contract" value={`${schema?.field_count || 0} fields`} good={schema?.field_count === 50} />
          <Metric label="Environment" value={schema?.environment || 'PRODUCTION'} good />
          <Metric label="Mutation Gate" value={CLIENT_WRITES_ENABLED ? 'Client write gate enabled' : 'Shadow / dry-run only'} warning={!CLIENT_WRITES_ENABLED} />
        </div>
        {message ? <Notice tone="error" message={message} /> : null}
        {workbookCheck ? <Notice tone={workbookCheck.valid ? 'success' : 'error'} message={`${workbookCheck.fileName}: ${workbookCheck.message} Rows: ${workbookCheck.rowCount}. Headers: ${workbookCheck.headerCount}.${workbookCheck.missing.length ? ` Missing: ${workbookCheck.missing.join(', ')}.` : ''}${workbookCheck.unexpected.length ? ` Unexpected: ${workbookCheck.unexpected.join(', ')}.` : ''}`} /> : null}
      </section>

      <section className="flex flex-wrap gap-2">
        <Tab active={activeTab === 'register'} onClick={() => setActiveTab('register')}>Pickup Registration</Tab>
        <Tab active={activeTab === 'snapshot'} onClick={() => setActiveTab('snapshot')}>Backend Financial Rows</Tab>
      </section>

      {activeTab === 'register' ? (
        <>
          <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(320px,1fr)_repeat(4,minmax(150px,0.45fr))]">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#6f98b8]">Canonical pickup
                <select value={selectedPickupId} onChange={(event) => setSelectedPickupId(event.target.value)} className={INPUT_CLASS}>
                  <option value="">Select a production pickup</option>
                  {pickups.map((pickup) => <option key={pickup.pickup_id} value={pickup.pickup_id}>{pickup.pickup_id} — {pickup.merchant_id || pickup.merchant_name || 'Merchant pending'}</option>)}
                </select>
              </label>
              <Metric label="Expected Parcels" value={expectedCount || '—'} good={expectedCount > 0} />
              <Metric label="Rider Status" value={selectedPickup?.rider_status || '—'} />
              <Metric label="Pickup Status" value={selectedPickup?.pickup_status || '—'} />
              <Metric label="Historical Extras" value={extraProofRows.length} warning={extraProofRows.length > 0} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={!rows.length || loadingRows} onClick={() => void calculateAll()} className="inline-flex items-center gap-2 rounded-xl bg-[#38bdf8] px-4 py-2.5 text-[12px] font-black text-[#061524] disabled:opacity-50"><Calculator size={15} /> Calculate all</button>
              <button type="button" disabled={!rows.length || loadingRows || extraProofRows.length > 0} onClick={() => void checkAllSaves()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-[12px] font-black text-[#061524] disabled:opacity-50"><Save size={15} /> {CLIENT_WRITES_ENABLED ? 'Save all' : 'Validate all saves'}</button>
              <button type="button" disabled={!selectedPickupId || extraProofRows.length > 0} onClick={() => void checkWaybill()} className="inline-flex items-center gap-2 rounded-xl bg-[#f6b84b] px-4 py-2.5 text-[12px] font-black text-[#061524] disabled:opacity-50"><FileCheck2 size={15} /> {CLIENT_WRITES_ENABLED ? 'Create waybill' : 'Check waybill readiness'}</button>
              <button type="button" onClick={() => selectedPickup && void loadRowsForPickup(selectedPickup)} disabled={!selectedPickup || loadingRows} className="inline-flex items-center gap-2 rounded-xl border border-[#1a3a5c] px-4 py-2.5 text-[12px] font-black text-[#eef8ff] disabled:opacity-50"><RefreshCw size={15} className={loadingRows ? 'animate-spin' : ''} /> Refresh evidence</button>
            </div>
            {extraProofRows.length > 0 ? <Notice tone="error" message={`Integrity hold: ${extraProofRows.length} verification row(s) exceed the pickup master count of ${expectedCount}. Saving and waybill creation are blocked until controlled historical quarantine is completed.`} /> : null}
            {waybillResult ? <Notice tone={waybillResult.ok ? 'success' : 'error'} message={`${waybillResult.ok ? 'Waybill readiness check passed.' : 'Waybill readiness check failed.'} ${envelopeMessage(waybillResult)}`} /> : null}
          </section>

          <div className="space-y-5">
            {rows.map((row, index) => (
              <FinancialRowCard
                key={row.key}
                row={row}
                index={index}
                fieldsBySection={fieldsBySection}
                schema={schema!}
                blocked={extraProofRows.length > 0}
                onInput={updateInput}
                onCalculate={() => void calculateRow(index)}
                onSaveCheck={() => void checkSave(index)}
                onPhotoReviewed={(value) => setRows((items) => items.map((item, rowIndex) => rowIndex === index ? { ...item, photoReviewed: value } : item))}
                onPhotoUnavailable={(value) => setRows((items) => items.map((item, rowIndex) => rowIndex === index ? { ...item, photoUnavailableAcknowledged: value } : item))}
              />
            ))}
            {!rows.length && !loadingRows ? <div className="rounded-3xl border border-dashed border-[#1a3a5c] p-10 text-center text-[#6f98b8]">Select a pickup with an authoritative parcel count.</div> : null}
          </div>
        </>
      ) : (
        <section className="overflow-hidden rounded-3xl border border-[#1a3a5c] bg-[#0b2236]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#1a3a5c] p-4">
            <div className="relative min-w-[280px] flex-1"><Search size={15} className="absolute left-3 top-3 text-[#6f98b8]" /><input value={snapshotQuery} onChange={(event) => setSnapshotQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void loadSnapshot(); }} className={`${INPUT_CLASS} mt-0 pl-9`} placeholder="Search Way ID, merchant, recipient or phone" /></div>
            <button type="button" onClick={() => void loadSnapshot()} disabled={snapshotLoading} className="inline-flex items-center gap-2 rounded-xl bg-[#38bdf8] px-4 py-2.5 text-[12px] font-black text-[#061524] disabled:opacity-50">{snapshotLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refresh</button>
          </div>
          <div className="overflow-auto">
            <table className="min-w-[1300px] w-full text-left text-[11px] text-[#b8d3e5]">
              <thead className="bg-[#061524] uppercase tracking-wider text-[#6f98b8]"><tr><th className="px-3 py-3">Way ID</th><th className="px-3 py-3">Merchant</th><th className="px-3 py-3">Recipient</th><th className="px-3 py-3">Township</th><th className="px-3 py-3">Amount Type</th><th className="px-3 py-3">COD</th><th className="px-3 py-3">Net System Charge</th><th className="px-3 py-3">Merchant Settlement</th><th className="px-3 py-3">Validation</th><th className="px-3 py-3">Version</th><th className="px-3 py-3">Updated</th></tr></thead>
              <tbody>{snapshotRows.map((row, index) => <tr key={`${text(row.id || row.way_id)}:${index}`} className="border-t border-[#1a3a5c]"><td className="px-3 py-3 font-black text-[#f6b84b]">{text(row.way_id) || '—'}</td><td className="px-3 py-3">{text(row.merchant_id) || '—'}</td><td className="px-3 py-3">{text(row.recipient_name) || '—'}</td><td className="px-3 py-3">{text(row.township) || '—'}</td><td className="px-3 py-3">{text(row.amount_entry_type) || '—'}</td><td className="px-3 py-3">{numberValue(row.cod_amount).toLocaleString('en-US')}</td><td className="px-3 py-3">{numberValue(row.net_system_delivery_charge).toLocaleString('en-US')}</td><td className="px-3 py-3">{numberValue(row.merchant_final_settlement_amount).toLocaleString('en-US')}</td><td className="px-3 py-3"><StatusBadge value={text(row.validation_status) || 'UNKNOWN'} /></td><td className="px-3 py-3">{text(row.calculation_version) || '—'}</td><td className="px-3 py-3">{text(row.updated_at) || '—'}</td></tr>)}</tbody>
            </table>
          </div>
          {!snapshotRows.length && !snapshotLoading ? <div className="p-8 text-center text-[#6f98b8]">No Financial V2 rows returned.</div> : null}
        </section>
      )}
    </main>
  );
}

function FinancialRowCard({ row, index, fieldsBySection, schema, blocked, onInput, onCalculate, onSaveCheck, onPhotoReviewed, onPhotoUnavailable }: {
  row: EditorRow;
  index: number;
  fieldsBySection: Map<string, FinancialV2Field[]>;
  schema: FinancialV2SchemaData;
  blocked: boolean;
  onInput: (index: number, field: string, value: unknown) => void;
  onCalculate: () => void;
  onSaveCheck: () => void;
  onPhotoReviewed: (value: boolean) => void;
  onPhotoUnavailable: (value: boolean) => void;
}) {
  const validationStatus = text(row.output.validation_status || row.calculation?.data?.validation_status);
  const saveMode = text(row.saveCheck?.mutation_mode || (CLIENT_WRITES_ENABLED ? 'ACTIVE REQUIRED' : 'MUTATION_SHADOW'));
  const photo = proofPhoto(row.proof);
  const photoIsUrl = /^https?:\/\//i.test(photo) || /^data:image\//i.test(photo);

  return (
    <article className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1a3a5c] pb-4">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#6f98b8]">Parcel {row.parcel_sequence}</div>
          <div className="mt-1 text-xl font-black text-[#f6b84b]">{text(row.output.way_id || row.proof.delivery_way_id || row.proof.way_id) || 'Way ID assigned by backend'}</div>
          <div className="mt-1 text-[11px] text-[#8fb4d0]">Pickup {row.pickup_id} · Sequence {row.parcel_sequence} · {schema.schema_version}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={validationStatus || 'NOT_CALCULATED'} />
          <button type="button" onClick={onCalculate} disabled={row.calculating} className="inline-flex items-center gap-2 rounded-xl bg-[#38bdf8] px-4 py-2.5 text-[12px] font-black text-[#061524] disabled:opacity-50">{row.calculating ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />} Calculate</button>
          <button type="button" onClick={onSaveCheck} disabled={row.checkingSave || blocked || (!row.photoReviewed && !row.photoUnavailableAcknowledged)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-[12px] font-black text-[#061524] disabled:opacity-50">{row.checkingSave ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {CLIENT_WRITES_ENABLED ? 'Save' : 'Validate save'}</button>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {SECTION_ORDER.map((section) => {
          if (section === 'Photo Evidence') {
            return <section key={section} className="rounded-2xl border border-[#1a3a5c] bg-[#081b2e] p-4"><SectionTitle>{section}</SectionTitle><div className="mt-3 grid gap-4 lg:grid-cols-[220px_1fr]">{photoIsUrl ? <img src={photo} alt={`Pickup proof ${row.parcel_sequence}`} className="h-44 w-full rounded-xl border border-[#1a3a5c] bg-black/20 object-contain" /> : <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-[#1a3a5c] bg-[#061524] text-[#6f98b8]"><ImageIcon size={28} /></div>}<div className="space-y-3"><div className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-[11px] text-[#8fb4d0]">{photo || 'No Rider proof path was returned by the read-only evidence view.'}</div><label className="flex items-center gap-2 text-[12px] text-[#d8eaf5]"><input type="checkbox" checked={row.photoReviewed} onChange={(event) => onPhotoReviewed(event.target.checked)} /> Photo evidence reviewed</label><label className="flex items-center gap-2 text-[12px] text-[#d8eaf5]"><input type="checkbox" checked={row.photoUnavailableAcknowledged} onChange={(event) => onPhotoUnavailable(event.target.checked)} /> Image unavailable; acknowledge recorded proof reference for review</label><div className="text-[10px] text-[#6f98b8]">One acknowledgement is required before save validation. The backend still decides whether proof is sufficient for waybill readiness.</div></div></div></section>;
          }
          const fields = fieldsBySection.get(section) || [];
          if (!fields.length) return null;
          return <section key={section} className="rounded-2xl border border-[#1a3a5c] bg-[#081b2e] p-4"><SectionTitle>{section}</SectionTitle><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{fields.map((field) => <FieldControl key={field.name} field={field} row={row} index={index} onInput={onInput} />)}</div></section>;
        })}
      </div>

      {row.error ? <Notice tone="error" message={row.error} /> : null}
      {row.calculation ? <Notice tone={row.calculation.ok ? (validationStatus === 'REVIEW' ? 'warning' : 'success') : 'error'} message={`Calculation ${row.calculation.ok ? 'completed' : 'failed'}: ${envelopeMessage(row.calculation) || validationStatus || 'Backend response received.'}`} /> : null}
      {row.saveCheck ? <Notice tone={row.saveCheck.ok ? 'success' : 'error'} message={`${row.saveCheck.ok ? (CLIENT_WRITES_ENABLED ? 'Saved.' : 'Save dry-run passed.') : 'Save validation failed.'} Mode: ${saveMode}. Persisted: ${String(Boolean(row.saveCheck.persisted))}. ${envelopeMessage(row.saveCheck)}`} /> : null}
    </article>
  );
}

function FieldControl({ field, row, index, onInput }: { field: FinancialV2Field; row: EditorRow; index: number; onInput: (index: number, field: string, value: unknown) => void }) {
  const editable = field.editable && field.ownership === 'INPUT';
  const value = editable ? row.input[field.name] ?? '' : row.output[field.name] ?? row.input[field.name] ?? '';
  const label = title(field.name);
  if (!editable) return <label className="text-[10px] font-black uppercase tracking-wider text-[#6f98b8]">{label}{field.required ? ' *' : ''}<div className={SERVER_CLASS} title={field.source}>{formatValue(value, field)}</div></label>;
  if (field.name === 'amount_entry_type') return <label className="text-[10px] font-black uppercase tracking-wider text-[#9cc2d9]">{label} *<select className={INPUT_CLASS} value={text(value)} onChange={(event) => onInput(index, field.name, event.target.value)}><option value="">Select amount-entry type</option>{AMOUNT_TYPES.map((item) => <option key={item} value={item}>{title(item)}</option>)}</select></label>;
  if (field.name === 'status') return <label className="text-[10px] font-black uppercase tracking-wider text-[#9cc2d9]">{label}<select className={INPUT_CLASS} value={text(value)} onChange={(event) => onInput(index, field.name, event.target.value)}>{STATUS_OPTIONS.map((item) => <option key={item} value={item}>{title(item)}</option>)}</select></label>;
  if (TEXTAREA_FIELDS.has(field.name)) return <label className="md:col-span-2 text-[10px] font-black uppercase tracking-wider text-[#9cc2d9]">{label}{field.required ? ' *' : ''}<textarea className={`${INPUT_CLASS} min-h-20`} value={text(value)} onChange={(event) => onInput(index, field.name, event.target.value)} /></label>;
  const type = NUMERIC_TYPES.has(field.data_type) ? 'number' : 'text';
  return <label className="text-[10px] font-black uppercase tracking-wider text-[#9cc2d9]">{label}{field.required ? ' *' : ''}<input className={INPUT_CLASS} type={type} min={type === 'number' ? 0 : undefined} step={field.data_type === 'numeric' ? '0.01' : undefined} value={text(value)} onChange={(event) => onInput(index, field.name, event.target.value)} title={field.source} /></label>;
}

function SectionTitle({ children }: { children: string }) {
  return <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#f6b84b]">{children}</div>;
}

function Metric({ label, value, good = false, warning = false }: { label: string; value: unknown; good?: boolean; warning?: boolean }) {
  const tone = good ? 'text-emerald-300' : warning ? 'text-amber-300' : 'text-[#eef8ff]';
  return <div className="rounded-2xl border border-[#1a3a5c] bg-[#081b2e] p-4"><div className="text-[9px] font-black uppercase tracking-widest text-[#6f98b8]">{label}</div><div className={`mt-2 break-words text-[14px] font-black ${tone}`}>{String(value)}</div></div>;
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return <button type="button" onClick={onClick} className={`rounded-xl border px-4 py-2.5 text-[12px] font-black ${active ? 'border-[#f6b84b] bg-[#f6b84b] text-[#061524]' : 'border-[#1a3a5c] bg-[#0b2236] text-[#8fb4d0]'}`}>{children}</button>;
}

function Notice({ tone, message }: { tone: 'success' | 'warning' | 'error'; message: string }) {
  const styles = tone === 'success' ? 'border-emerald-600/40 bg-emerald-900/20 text-emerald-200' : tone === 'warning' ? 'border-amber-600/40 bg-amber-900/20 text-amber-200' : 'border-rose-600/40 bg-rose-900/20 text-rose-200';
  return <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-[12px] leading-5 ${styles}`}>{tone === 'success' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}<span>{message}</span></div>;
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  const styles = normalized === 'OK' || normalized === 'PASS' ? 'border-emerald-600/40 bg-emerald-900/20 text-emerald-300' : normalized === 'REVIEW' ? 'border-amber-600/40 bg-amber-900/20 text-amber-300' : normalized === 'ERROR' || normalized === 'FAIL' ? 'border-rose-600/40 bg-rose-900/20 text-rose-300' : 'border-slate-600/40 bg-slate-900/20 text-slate-300';
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-black ${styles}`}>{normalized || 'NOT_CALCULATED'}</span>;
}
