import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  FileSpreadsheet,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export const REPORTING_V52_BUILD = 'REPORTING_V52_CERTIFIED_RECONCILED_EXPORT_2026-07-30';

type Row = Record<string, any>;
type Summary = Record<string, number | boolean | string | null>;
type ReportRun = {
  report_run_id: string;
  report_name: string;
  review_status: string;
  generated_by: string;
  generated_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  dataset_hash: string;
  row_count: number;
  controlled_export_location?: string | null;
  stale?: boolean;
};

type Snapshot = {
  ok: boolean;
  build: string;
  workflow: string;
  period: { from: string; to: string };
  filters: Record<string, string | null>;
  summary: Summary;
  rows: Row[];
  breakdowns?: Record<string, Row[]>;
  filter_options?: {
    branches?: string[];
    teams?: Array<{ code: string; name: string }>;
    services?: string[];
    statuses?: string[];
    finance_statuses?: string[];
  };
  report_run?: ReportRun;
};

const C = {
  bg: '#071827',
  panel: '#0c2438',
  panel2: '#071625',
  border: '#1d4664',
  text: '#eef8ff',
  muted: '#79a3bd',
  gold: '#f6b84b',
  cyan: '#24b9ed',
  green: '#32d296',
  red: '#ff6686',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 40,
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  background: '#f8fbff',
  color: '#071827',
  padding: '8px 10px',
  fontSize: 12,
  fontWeight: 700,
};

function actorEmail() {
  return (
    localStorage.getItem('be_user_email') ||
    localStorage.getItem('be_actor_email') ||
    localStorage.getItem('user_email') ||
    null
  );
}

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString()} MMK`;
}

function csvEscape(value: unknown) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildCsv(rows: Row[]) {
  if (!rows.length) return '';
  const preferred = [
    'delivery_way_id', 'wayplan_id', 'pickup_id', 'branch_code', 'route_zone',
    'assignment_mode', 'team_code', 'team_name', 'vehicle_code', 'vehicle_name',
    'recipient_name', 'recipient_phone', 'township', 'destination', 'service_tier',
    'weight_kg', 'item_value', 'delivery_fee', 'surcharge', 'collect_amount',
    'expected_cod', 'delivery_status', 'finance_status', 'cs_status', 'payment_mode',
    'settlement_reference', 'certified_by', 'certified_at', 'certification_note',
  ];
  const extra = Object.keys(rows[0] || {}).filter((key) => !preferred.includes(key) && key !== 'source_snapshot');
  const headers = [...preferred.filter((key) => rows.some((row) => key in row)), ...extra];
  return [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((key) => csvEscape(row[key])).join(',')),
  ].join('\n');
}

function KPI({ label, value, tone = C.text }: { label: string; value: string | number; tone?: string }) {
  return (
    <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ color: C.muted, fontSize: 10, letterSpacing: '.08em', fontWeight: 800 }}>{label}</div>
      <div style={{ color: tone, fontSize: 22, fontWeight: 900, marginTop: 5 }}>{value}</div>
    </div>
  );
}

export default function CertifiedOperationalReportingV52() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = useMemo(() => {
    const date = new Date();
    date.setDate(1);
    return date.toISOString().slice(0, 10);
  }, []);

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [reportName, setReportName] = useState(`Certified Operations ${monthStart} to ${today}`);
  const [branch, setBranch] = useState('');
  const [team, setTeam] = useState('');
  const [service, setService] = useState('');
  const [status, setStatus] = useState('');
  const [financeStatus, setFinanceStatus] = useState('');
  const [reviewNote, setReviewNote] = useState('Reviewed against V50 certified canonical records.');
  const [exportLocation, setExportLocation] = useState('Britium controlled reporting archive');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [recentRuns, setRecentRuns] = useState<ReportRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const run = snapshot?.report_run;
  const rows = snapshot?.rows || [];
  const summary = snapshot?.summary || {};
  const options = snapshot?.filter_options || {};

  async function loadRecentRuns() {
    const { data, error: rpcError } = await (supabase as any).rpc('be_reporting_recent_runs_v52', { p_limit: 30 });
    if (!rpcError) setRecentRuns((data?.runs || []) as ReportRun[]);
  }

  useEffect(() => {
    void loadRecentRuns();
  }, []);

  async function generateReport() {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { data, error: rpcError } = await (supabase as any).rpc('be_reporting_generate_v52', {
        p_report_name: reportName,
        p_from: from,
        p_to: to,
        p_branch: branch || null,
        p_team: team || null,
        p_service: service || null,
        p_status: status || null,
        p_finance_status: financeStatus || null,
        p_actor: actorEmail(),
      });
      if (rpcError) throw rpcError;
      setSnapshot(data as Snapshot);
      setMessage(`Generated certified report with ${Number(data?.summary?.rows || 0).toLocaleString()} row(s).`);
      await loadRecentRuns();
    } catch (e: any) {
      setError(e?.message || 'Unable to generate V52 report. Run reporting_certified_v52.sql first.');
    } finally {
      setLoading(false);
    }
  }

  async function review(decision: 'REVIEW' | 'APPROVE' | 'REJECT') {
    if (!run?.report_run_id) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { data, error: rpcError } = await (supabase as any).rpc('be_reporting_review_v52', {
        p_report_run_id: run.report_run_id,
        p_decision: decision,
        p_note: reviewNote,
        p_export_location: exportLocation || null,
        p_actor: actorEmail(),
      });
      if (rpcError) throw rpcError;
      setSnapshot((old) => old ? { ...old, report_run: data?.report_run } : old);
      setMessage(`Report ${decision.toLowerCase()} completed.`);
      await loadRecentRuns();
    } catch (e: any) {
      setError(e?.message || `Unable to ${decision.toLowerCase()} report.`);
    } finally {
      setLoading(false);
    }
  }

  async function exportApprovedCsv() {
    if (!run?.report_run_id) return;
    if (run.review_status !== 'APPROVED' || run.stale) {
      setError('Approve the current, non-stale report before exporting.');
      return;
    }
    if (!rows.length) {
      setError('There are no certified rows to export.');
      return;
    }
    if (!exportLocation.trim()) {
      setError('Controlled export location is required.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');
    try {
      const fileName = `britium_certified_report_${from}_${to}_${run.report_run_id.slice(0, 8)}.csv`;
      const csv = buildCsv(rows);
      const { error: rpcError } = await (supabase as any).rpc('be_reporting_register_export_v52', {
        p_report_run_id: run.report_run_id,
        p_export_format: 'CSV',
        p_file_name: fileName,
        p_export_location: exportLocation,
        p_row_count: rows.length,
        p_dataset_hash: run.dataset_hash,
        p_actor: actorEmail(),
      });
      if (rpcError) throw rpcError;

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(`Controlled CSV export registered: ${fileName}`);
      await loadRecentRuns();
    } catch (e: any) {
      setError(e?.message || 'Unable to register or download the approved report export.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ marginTop: 18, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 18, padding: 18, color: C.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: C.gold, fontSize: 11, fontWeight: 900, letterSpacing: '.18em' }}>STEP 14 · CERTIFIED OPERATIONAL REPORTING</div>
          <h2 style={{ margin: '6px 0 4px', fontSize: 24 }}>V50 Certified Data → Reviewed Report → Controlled Export</h2>
          <p style={{ color: C.muted, margin: 0, fontSize: 12, maxWidth: 780 }}>
            Only non-stale V50 CERTIFIED records with zero open variances are reportable. Approval revalidates the dataset hash before any export is registered.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: C.green, border: `1px solid ${C.green}`, borderRadius: 999, padding: '6px 10px', fontSize: 10, fontWeight: 900 }}>CERTIFIED ONLY</span>
          <span style={{ color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 999, padding: '6px 10px', fontSize: 10, fontWeight: 900 }}>{REPORTING_V52_BUILD}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginTop: 18 }}>
        <label style={{ color: C.muted, fontSize: 11 }}>Report Name<input style={inputStyle} value={reportName} onChange={(e) => setReportName(e.target.value)} /></label>
        <label style={{ color: C.muted, fontSize: 11 }}>From<input style={inputStyle} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label style={{ color: C.muted, fontSize: 11 }}>To<input style={inputStyle} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label style={{ color: C.muted, fontSize: 11 }}>Branch
          <select style={inputStyle} value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">All certified branches</option>
            {(options.branches || []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label style={{ color: C.muted, fontSize: 11 }}>Team
          <select style={inputStyle} value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">All assigned teams</option>
            {(options.teams || []).map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
          </select>
        </label>
        <label style={{ color: C.muted, fontSize: 11 }}>Service
          <select style={inputStyle} value={service} onChange={(e) => setService(e.target.value)}>
            <option value="">All services</option>
            {(options.services || []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label style={{ color: C.muted, fontSize: 11 }}>Delivery Status
          <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All final statuses</option>
            {(options.statuses || []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label style={{ color: C.muted, fontSize: 11 }}>Finance Status
          <select style={inputStyle} value={financeStatus} onChange={(e) => setFinanceStatus(e.target.value)}>
            <option value="">All finance statuses</option>
            {(options.finance_statuses || []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
        <button onClick={generateReport} disabled={loading} style={{ border: 0, borderRadius: 10, padding: '11px 16px', background: C.gold, color: C.bg, fontWeight: 900, cursor: 'pointer', display: 'flex', gap: 7, alignItems: 'center' }}>
          <RefreshCw size={16} /> {loading ? 'Working…' : 'Generate Certified Report'}
        </button>
        {run && <span style={{ color: C.muted, fontSize: 11 }}>Run {run.report_run_id} · Hash {run.dataset_hash.slice(0, 16)}… · {run.review_status}</span>}
      </div>

      {error && <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'rgba(255,102,134,.12)', color: C.red, border: `1px solid ${C.red}`, display: 'flex', gap: 8 }}><AlertTriangle size={18} />{error}</div>}
      {message && <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'rgba(50,210,150,.10)', color: C.green, border: `1px solid ${C.green}`, display: 'flex', gap: 8 }}><CheckCircle2 size={18} />{message}</div>}

      {snapshot && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 10, marginTop: 16 }}>
            <KPI label="CERTIFIED ROWS" value={Number(summary.rows || 0).toLocaleString()} tone={C.gold} />
            <KPI label="WAYPLANS" value={Number(summary.wayplans || 0).toLocaleString()} tone={C.cyan} />
            <KPI label="DELIVERED" value={Number(summary.delivered || 0).toLocaleString()} tone={C.green} />
            <KPI label="DELIVERY RATE" value={`${Number(summary.delivery_rate_pct || 0).toFixed(2)}%`} />
            <KPI label="DELIVERY FEES" value={money(summary.total_delivery_fee)} tone={C.gold} />
            <KPI label="EXPECTED COD" value={money(summary.expected_cod)} tone={C.green} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginTop: 16 }}>
            <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`, fontWeight: 900 }}>Certified report rows · {rows.length.toLocaleString()}</div>
              <div style={{ overflow: 'auto', maxHeight: 430 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1200, fontSize: 11 }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f6b84b', color: '#071827' }}>
                    <tr>
                      {['Way ID','Wayplan','Pickup','Branch','Route','Team','Recipient','Township','Service','Weight','Fee','COD','Delivery','Finance','CS','Certified'].map((h) => <th key={h} style={{ padding: 9, textAlign: 'left' }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={`${row.wayplan_id}:${row.delivery_way_id}`} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: 8, color: C.gold, fontWeight: 900 }}>{row.delivery_way_id}</td>
                        <td style={{ padding: 8 }}>{row.wayplan_id}</td>
                        <td style={{ padding: 8 }}>{row.pickup_id}</td>
                        <td style={{ padding: 8 }}>{row.branch_code}</td>
                        <td style={{ padding: 8 }}>{row.route_zone}</td>
                        <td style={{ padding: 8 }}>{row.team_code}<br/><span style={{ color: C.muted }}>{row.team_name}</span></td>
                        <td style={{ padding: 8 }}>{row.recipient_name}</td>
                        <td style={{ padding: 8 }}>{row.township}</td>
                        <td style={{ padding: 8 }}>{row.service_tier}</td>
                        <td style={{ padding: 8 }}>{Number(row.weight_kg || 0).toLocaleString()} kg</td>
                        <td style={{ padding: 8 }}>{money(row.delivery_fee)}</td>
                        <td style={{ padding: 8 }}>{money(row.expected_cod)}</td>
                        <td style={{ padding: 8, color: row.delivery_status === 'DELIVERED' ? C.green : C.gold }}>{row.delivery_status}</td>
                        <td style={{ padding: 8 }}>{row.finance_status}</td>
                        <td style={{ padding: 8 }}>{row.cs_status}</td>
                        <td style={{ padding: 8 }}>{row.certified_at ? new Date(row.certified_at).toLocaleString() : ''}</td>
                      </tr>
                    ))}
                    {!rows.length && <tr><td colSpan={16} style={{ padding: 32, textAlign: 'center', color: C.muted }}>No V50-certified records match this period and filter set.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 900, display: 'flex', gap: 8, alignItems: 'center' }}><ShieldCheck size={17} color={C.gold}/> Review and retention</div>
              <label style={{ display: 'block', color: C.muted, fontSize: 11, marginTop: 12 }}>Review Note<textarea style={{ ...inputStyle, minHeight: 88, resize: 'vertical' }} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} /></label>
              <label style={{ display: 'block', color: C.muted, fontSize: 11, marginTop: 10 }}>Controlled Export Location<input style={inputStyle} value={exportLocation} onChange={(e) => setExportLocation(e.target.value)} /></label>
              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                <button disabled={loading || !run} onClick={() => review('REVIEW')} style={{ padding: 10, borderRadius: 9, border: `1px solid ${C.cyan}`, background: 'transparent', color: C.cyan, fontWeight: 900, cursor: 'pointer' }}><FileCheck2 size={15} style={{ verticalAlign: 'middle', marginRight: 6 }}/>Mark Reviewed</button>
                <button disabled={loading || !run || !rows.length} onClick={() => review('APPROVE')} style={{ padding: 10, borderRadius: 9, border: 0, background: C.green, color: C.bg, fontWeight: 900, cursor: 'pointer' }}><CheckCircle2 size={15} style={{ verticalAlign: 'middle', marginRight: 6 }}/>Approve Report</button>
                <button disabled={loading || !run} onClick={() => review('REJECT')} style={{ padding: 10, borderRadius: 9, border: `1px solid ${C.red}`, background: 'transparent', color: C.red, fontWeight: 900, cursor: 'pointer' }}>Reject Report</button>
                <button disabled={loading || run?.review_status !== 'APPROVED' || Boolean(run?.stale)} onClick={exportApprovedCsv} style={{ padding: 10, borderRadius: 9, border: 0, background: C.gold, color: C.bg, fontWeight: 900, cursor: 'pointer' }}><Download size={15} style={{ verticalAlign: 'middle', marginRight: 6 }}/>Register & Download CSV</button>
              </div>
              <div style={{ color: C.muted, fontSize: 10, lineHeight: 1.5, marginTop: 12 }}>
                Approval rechecks the certified dataset hash. Export is blocked when V50 source data changes, certification becomes stale, the reviewer is unauthorized, or the export destination is missing.
              </div>
            </div>
          </div>
        </>
      )}

      <div style={{ marginTop: 18, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 900 }}><FileSpreadsheet size={17} color={C.gold}/>Recent controlled report runs</div>
        <div style={{ overflowX: 'auto', marginTop: 9 }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr>{['Generated','Report','Rows','Status','Preparer','Reviewer','Exports','Location'].map((h) => <th key={h} style={{ color: C.muted, padding: 7, textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
            <tbody>
              {recentRuns.map((item) => <tr key={item.report_run_id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: 7 }}>{new Date(item.generated_at).toLocaleString()}</td>
                <td style={{ padding: 7 }}>{item.report_name}<br/><span style={{ color: C.muted }}>{item.report_run_id}</span></td>
                <td style={{ padding: 7 }}>{Number(item.row_count || 0).toLocaleString()}</td>
                <td style={{ padding: 7, color: item.review_status === 'APPROVED' ? C.green : item.review_status === 'REJECTED' || item.review_status === 'STALE' ? C.red : C.gold }}>{item.review_status}</td>
                <td style={{ padding: 7 }}>{item.generated_by}</td>
                <td style={{ padding: 7 }}>{item.reviewed_by || '—'}</td>
                <td style={{ padding: 7 }}>{Number((item as any).export_count || 0)}</td>
                <td style={{ padding: 7 }}>{item.controlled_export_location || '—'}</td>
              </tr>)}
              {!recentRuns.length && <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: C.muted }}>No V52 report run has been recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
