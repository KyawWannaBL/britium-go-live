#!/usr/bin/env bash
set -euo pipefail

backup() {
  if [ -f "$1" ]; then
    cp "$1" "$1.bak.$(date +%Y%m%d%H%M%S)"
  fi
}

backup src/pages/SupervisorPortal.tsx
backup src/pages/DriverPortal.tsx
backup src/pages/WayplanPortal.tsx
backup src/pages/WarehousePortal.tsx
backup src/pages/Login.tsx
backup src/components/Layout.tsx

node <<'NODE'
const fs = require('fs');

{
  const p = 'src/components/Layout.tsx';
  let s = fs.readFileSync(p, 'utf8');

  s = s.replace(
    /\{\s*path: ROUTE_PATHS\.WAYPLAN,[\s\S]*?subItems:\s*\[[\s\S]*?\]\s*\n\s*\},/,
`{ 
    path: ROUTE_PATHS.WAYPLAN, 
    label: 'nav.wayplan', 
    icon: Route,
    subItems: [
      { label: 'nav.routeOptimization', path: '/wayplan/optimize', icon: Route },
      { label: 'nav.manifests', path: '/wayplan/manifests', icon: FileText },
      { label: 'nav.vehicleAssignment', path: '/wayplan/vehicles', icon: Truck },
      { label: 'Way Management / လမ်းကြောင်းစီမံခန့်ခွဲမှု', path: '/wayplan/ways', icon: Package },
      { label: 'Waybill Print / waybill ပုံနှိပ်ရန်', path: '/wayplan/waybills', icon: FileText },
    ]
  },`
  );

  fs.writeFileSync(p, s);
}

{
  const p = 'src/pages/Login.tsx';
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace(
    /className="absolute inset-0 h-full w-full object-cover"/g,
    'className="absolute inset-0 h-full w-full object-cover saturate-[1.45] contrast-[1.18] brightness-[1.08]"'
  );
  fs.writeFileSync(p, s);
}
NODE

cat > src/pages/SupervisorPortal.tsx <<'TSX'
// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Package,
  RefreshCw,
  Save,
  Search,
  Truck,
  UserCheck,
  RotateCcw,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/useLanguage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const VIEW_ROUTES = {
  overview: '/supervisor/overview',
  queue: '/supervisor/queue',
  fleet: '/supervisor/fleet',
  exceptions: '/supervisor/exceptions',
};

const ACTIVE_STATUSES = ['pending', 'assigned', 'picked_up', 'in_transit', 'out_for_delivery', 'failed'];

function currentViewFromPath(pathname: string) {
  if (pathname.includes('/queue')) return 'queue';
  if (pathname.includes('/fleet')) return 'fleet';
  if (pathname.includes('/exceptions')) return 'exceptions';
  return 'overview';
}

function tt(language: string, en: string, mm: string) {
  return language === 'mm' ? mm : en;
}

function labelize(value: string | null | undefined) {
  return String(value || 'unknown').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function fmtCurrency(value: unknown) {
  const amount = Number(value || 0);
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0)} MMK`;
}

function statusVariant(status: string) {
  const s = String(status || '').toLowerCase();
  if (['delivered'].includes(s)) return 'default';
  if (['failed', 'cancelled', 'returned'].includes(s)) return 'destructive';
  if (['assigned', 'picked_up', 'in_transit', 'out_for_delivery'].includes(s)) return 'secondary';
  return 'outline';
}

function shipmentStatusFromDelivery(deliveryStatus: string) {
  const map: Record<string, string> = {
    pending: 'pending',
    assigned: 'assigned',
    picked_up: 'picked_up',
    in_transit: 'in_transit',
    out_for_delivery: 'out_for_delivery',
    delivered: 'delivered',
    failed: 'failed',
    cancelled: 'cancelled',
    returned: 'returned',
  };
  return map[deliveryStatus] || 'pending';
}

function Metric({ title, value, desc, icon }: any) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-muted-foreground">{title}</div>
            <div className="mt-2 text-4xl font-semibold tracking-tight">{value}</div>
            <div className="mt-2 text-sm text-muted-foreground">{desc}</div>
          </div>
          <div className="rounded-xl bg-primary/10 p-3 text-primary">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SupervisorPortal() {
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const [view, setView] = useState(currentViewFromPath(location.pathname));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [manifests, setManifests] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [assignmentFilter, setAssignmentFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState('pending');
  const [formDriverId, setFormDriverId] = useState('unassigned');
  const [formManifestId, setFormManifestId] = useState('none');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    setView(currentViewFromPath(location.pathname));
  }, [location.pathname]);

  async function loadData() {
    setLoading(true);
    try {
      const deliveryRes = await supabase
        .from('deliveries')
        .select('id, shipment_id, manifest_id, driver_id, status, attempt_number, max_attempts, assigned_at, created_at, updated_at, failed_at, notes, failure_reason, ndr_case')
        .order('created_at', { ascending: false });

      if (deliveryRes.error) throw deliveryRes.error;
      const deliveries = deliveryRes.data || [];

      const shipmentIds = [...new Set(deliveries.map((d: any) => d.shipment_id).filter(Boolean))];
      const driverIds = [...new Set(deliveries.map((d: any) => d.driver_id).filter(Boolean))];
      const manifestIds = [...new Set(deliveries.map((d: any) => d.manifest_id).filter(Boolean))];

      const shipmentRes = shipmentIds.length
        ? await supabase
            .from('shipments')
            .select('id, awb, status, recipient, sender, cod_amount, shipping_fee, payment_method, expected_delivery_date, current_location, created_at')
            .in('id', shipmentIds)
        : { data: [], error: null };

      if (shipmentRes.error) throw shipmentRes.error;

      const allDriverRes = await supabase
        .from('user_profiles')
        .select('id, full_name, email, phone, role, is_active')
        .in('role', ['driver', 'rider'])
        .eq('is_active', true)
        .order('full_name', { ascending: true });

      if (allDriverRes.error) throw allDriverRes.error;

      const manifestRes = manifestIds.length
        ? await supabase
            .from('manifests')
            .select('id, manifest_number, status, scheduled_date, driver_id, vehicle_id, warehouse_id, total_shipments, completed_shipments, failed_shipments')
            .in('id', manifestIds)
        : await supabase
            .from('manifests')
            .select('id, manifest_number, status, scheduled_date, driver_id, vehicle_id, warehouse_id, total_shipments, completed_shipments, failed_shipments')
            .in('status', ['draft', 'assigned', 'in_progress']);

      if (manifestRes.error) throw manifestRes.error;

      const shipMap = new Map((shipmentRes.data || []).map((s: any) => [s.id, s]));
      const driverMap = new Map((allDriverRes.data || []).map((d: any) => [d.id, d]));
      const manifestMap = new Map((manifestRes.data || []).map((m: any) => [m.id, m]));

      const merged = deliveries.map((d: any) => ({
        ...d,
        shipment: shipMap.get(d.shipment_id) || null,
        driver: driverMap.get(d.driver_id) || null,
        manifest: manifestMap.get(d.manifest_id) || null,
      }));

      setRows(merged);
      setDrivers(allDriverRes.data || []);
      setManifests(manifestRes.data || []);
      if (!selectedId && merged.length) setSelectedId(merged[0].id);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setFormStatus(selected.status || 'pending');
    setFormDriverId(selected.driver_id || 'unassigned');
    setFormManifestId(selected.manifest_id || 'none');
    setFormNotes(selected.notes || '');
  }, [selected?.id]);

  useEffect(() => {
    const channel = supabase
      .channel('supervisor-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        !q ||
        String(row.shipment?.awb || '').toLowerCase().includes(q) ||
        String(row.shipment?.recipient?.name || '').toLowerCase().includes(q) ||
        String(row.shipment?.recipient?.phone || '').toLowerCase().includes(q) ||
        String(row.driver?.full_name || '').toLowerCase().includes(q) ||
        String(row.id || '').toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'all' ? true : row.status === statusFilter;
      const matchesAssignment =
        assignmentFilter === 'all'
          ? true
          : assignmentFilter === 'assigned'
          ? Boolean(row.driver_id)
          : !row.driver_id;

      return matchesQuery && matchesStatus && matchesAssignment;
    });
  }, [rows, search, statusFilter, assignmentFilter]);

  const queueRows = useMemo(
    () => filteredRows.filter((r) => ACTIVE_STATUSES.includes(String(r.status || '').toLowerCase())),
    [filteredRows]
  );

  const exceptionRows = useMemo(
    () => rows.filter((r) => ['failed', 'returned', 'cancelled'].includes(String(r.status || '').toLowerCase()) || r.failure_reason || r.ndr_case),
    [rows]
  );

  const fleetRows = useMemo(() => {
    const countMap = new Map<string, number>();
    rows.forEach((row) => {
      if (!row.driver_id) return;
      countMap.set(row.driver_id, (countMap.get(row.driver_id) || 0) + 1);
    });

    return drivers.map((driver) => ({
      ...driver,
      active_jobs: countMap.get(driver.id) || 0,
    }));
  }, [drivers, rows]);

  const metrics = useMemo(() => {
    const queue = rows.filter((r) => !['delivered', 'cancelled'].includes(String(r.status || '').toLowerCase()));
    return {
      queue: queue.length,
      unassigned: queue.filter((r) => !r.driver_id).length,
      onRoad: rows.filter((r) => ['in_transit', 'out_for_delivery'].includes(String(r.status || '').toLowerCase())).length,
      exceptions: exceptionRows.length,
      activeDrivers: drivers.length,
    };
  }, [rows, exceptionRows.length, drivers.length]);

  async function saveSelected() {
    if (!selected) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { data: auth } = await supabase.auth.getUser();

      const deliveryPatch: any = {
        status: formStatus,
        driver_id: formDriverId === 'unassigned' ? null : formDriverId,
        manifest_id: formManifestId === 'none' ? null : formManifestId,
        notes: formNotes || null,
        assigned_at: formDriverId === 'unassigned' ? null : selected.assigned_at || now,
        failed_at: formStatus === 'failed' ? now : null,
        delivered_at: formStatus === 'delivered' ? now : null,
        failure_reason: formStatus === 'failed' ? formNotes || selected.failure_reason || 'Supervisor exception' : null,
        ndr_case: formStatus === 'failed' ? { reason: formNotes || selected.failure_reason || 'Supervisor exception', updated_at: now } : null,
      };

      const updateRes = await supabase.from('deliveries').update(deliveryPatch).eq('id', selected.id).select('id, shipment_id').single();
      if (updateRes.error) throw updateRes.error;

      const shipmentRes = await supabase
        .from('shipments')
        .update({ status: shipmentStatusFromDelivery(formStatus), updated_at: now })
        .eq('id', selected.shipment_id);
      if (shipmentRes.error) throw shipmentRes.error;

      await supabase.from('delivery_history').insert({
        delivery_id: selected.id,
        shipment_id: selected.shipment_id,
        status: formStatus,
        notes: formNotes || null,
        changed_by: auth.user?.id || null,
      });

      await loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function quickRequeue() {
    if (!selected) return;
    setFormStatus('pending');
    setFormDriverId('unassigned');
    setFormManifestId('none');
    setFormNotes(selected.notes || '');
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await supabase.from('deliveries').update({
        status: 'pending',
        driver_id: null,
        manifest_id: null,
        failure_reason: null,
        ndr_case: null,
        notes: formNotes || null,
        updated_at: now,
      }).eq('id', selected.id);

      await supabase.from('shipments').update({ status: 'pending', updated_at: now }).eq('id', selected.shipment_id);
      await loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  function exportQueue() {
    const lines = [
      ['delivery_id', 'awb', 'status', 'recipient', 'phone', 'driver', 'manifest', 'cod_amount'].join(','),
      ...queueRows.map((row) =>
        [
          row.id,
          row.shipment?.awb || '',
          row.status || '',
          row.shipment?.recipient?.name || '',
          row.shipment?.recipient?.phone || '',
          row.driver?.full_name || '',
          row.manifest?.manifest_number || '',
          row.shipment?.cod_amount || 0,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([lines], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supervisor-queue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const titleMap: any = {
    overview: {
      title: tt(language, 'Supervisor Portal', 'ကြီးကြပ်ရေး Portal'),
      subtitle: tt(language, 'Operational visibility across queue, fleet, and exceptions.', 'queue, fleet နှင့် exception များကို လုပ်ငန်းပိုင်းဆိုင်ရာ မြင်နိုင်မှု'),
    },
    queue: {
      title: tt(language, 'Supervisor Queue Management', 'Supervisor Queue စီမံခန့်ခွဲမှု'),
      subtitle: tt(language, 'Live queue backed by deliveries, manifests, and driver assignment data.', 'deliveries, manifests နှင့် driver assignment data ဖြင့် live queue'),
    },
    fleet: {
      title: tt(language, 'Fleet Mobility', 'Fleet လှုပ်ရှားမှု'),
      subtitle: tt(language, 'Driver workload, manifest allocation, and execution readiness.', 'driver workload, manifest allocation နှင့် execution readiness'),
    },
    exceptions: {
      title: tt(language, 'Exceptions', 'Exceptions'),
      subtitle: tt(language, 'Failed, returned, and escalation-ready deliveries.', 'failed, returned နှင့် escalation-ready deliveries'),
    },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{titleMap[view].title}</h1>
          <p className="mt-2 text-muted-foreground">{titleMap[view].subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {tt(language, 'Refresh', 'ပြန်လည်ရယူမည်')}
          </Button>
          <Button variant="outline" onClick={exportQueue}>
            <Download className="mr-2 h-4 w-4" />
            {tt(language, 'Export Queue', 'Queue export')}
          </Button>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric title={tt(language, 'Queue Size', 'Queue အရွယ်အစား')} value={metrics.queue} desc={tt(language, 'Open deliveries requiring attention', 'ကြီးကြပ်ရန်လိုအပ်သော deliveries')} icon={<Package className="h-5 w-5" />} />
        <Metric title={tt(language, 'Unassigned', 'မခန့်ထားရသေး')} value={metrics.unassigned} desc={tt(language, 'Deliveries waiting for driver allocation', 'driver ခန့်ရန်စောင့်နေသော deliveries')} icon={<UserCheck className="h-5 w-5" />} />
        <Metric title={tt(language, 'On Road', 'လမ်းပေါ်တွင်')} value={metrics.onRoad} desc={tt(language, 'Shipments in transit or out for delivery', 'in transit / out for delivery shipments')} icon={<Truck className="h-5 w-5" />} />
        <Metric title={tt(language, 'Exceptions', 'Exceptions')} value={metrics.exceptions} desc={tt(language, 'Failed or escalation records', 'failed သို့မဟုတ် escalation records')} icon={<AlertTriangle className="h-5 w-5" />} />
        <Metric title={tt(language, 'Active Drivers', 'လက်ရှိ Driver များ')} value={metrics.activeDrivers} desc={tt(language, 'Available driver and rider pool', 'အသုံးပြုနိုင်သော driver/rider များ')} icon={<CheckCircle2 className="h-5 w-5" />} />
      </motion.div>

      <div className="grid grid-cols-4 gap-2 rounded-2xl bg-muted p-1">
        {Object.keys(VIEW_ROUTES).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setView(key);
              navigate((VIEW_ROUTES as any)[key]);
            }}
            className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === key ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
          >
            {key === 'overview' && tt(language, 'Overview', 'အနှစ်ချုပ်')}
            {key === 'queue' && tt(language, 'Queue Management', 'Queue စီမံခန့်ခွဲမှု')}
            {key === 'fleet' && tt(language, 'Fleet Mobility', 'Fleet Mobility')}
            {key === 'exceptions' && tt(language, 'Exceptions', 'Exceptions')}
          </button>
        ))}
      </div>

      {view === 'overview' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{tt(language, 'Queue Snapshot', 'Queue Snapshot')}</CardTitle>
              <CardDescription>{tt(language, 'Current operational pressure across the live queue.', 'live queue အတွင်း လက်ရှိအခြေအနေ')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {queueRows.slice(0, 6).map((row) => (
                <div key={row.id} className="flex items-start justify-between rounded-lg border p-4">
                  <div>
                    <div className="font-medium">{row.shipment?.awb || row.id}</div>
                    <div className="text-sm text-muted-foreground">
                      {row.shipment?.recipient?.name || 'Unknown'} · {row.driver?.full_name || tt(language, 'Unassigned', 'မခန့်ထားရသေး')}
                    </div>
                  </div>
                  <Badge variant={statusVariant(row.status)}>{labelize(row.status)}</Badge>
                </div>
              ))}
              {!queueRows.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No live queue records matched the current filters.', 'လက်ရှိ filter နှင့်ကိုက်ညီသော queue မရှိပါ')}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{tt(language, 'Exception Watchlist', 'Exception Watchlist')}</CardTitle>
              <CardDescription>{tt(language, 'Deliveries blocked by failed attempts or NDR activity.', 'failed attempt သို့မဟုတ် NDR activity ကြောင့် ရပ်တန့်နေသော deliveries')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {exceptionRows.slice(0, 6).map((row) => (
                <div key={row.id} className="flex items-start justify-between rounded-lg border p-4">
                  <div>
                    <div className="font-medium">{row.shipment?.awb || row.id}</div>
                    <div className="text-sm text-muted-foreground">{row.failure_reason || row.notes || tt(language, 'Supervisor follow-up required', 'Supervisor follow-up လိုအပ်သည်')}</div>
                  </div>
                  <Badge variant="destructive">{labelize(row.status)}</Badge>
                </div>
              ))}
              {!exceptionRows.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No open exceptions right now.', 'လက်ရှိ open exception မရှိပါ')}</div>}
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'queue' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(340px,0.9fr)]">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <CardTitle>{tt(language, 'Live Queue', 'Live Queue')}</CardTitle>
                  <CardDescription>{tt(language, 'Search, assign, and move deliveries through the live production queue.', 'deliveries များကို ရှာဖွေ၊ assign လုပ်ပြီး live queue တွင် ရွှေ့ပြောင်းနိုင်သည်')}</CardDescription>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="relative min-w-[220px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tt(language, 'Search AWB, recipient, phone, driver', 'AWB, recipient, phone, driver ဖြင့်ရှာရန်')} className="pl-9" />
                  </div>
                  <select className="h-10 rounded-md border px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">{tt(language, 'All statuses', 'အခြေအနေအားလုံး')}</option>
                    {ACTIVE_STATUSES.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}
                  </select>
                  <select className="h-10 rounded-md border px-3 text-sm" value={assignmentFilter} onChange={(e) => setAssignmentFilter(e.target.value)}>
                    <option value="all">{tt(language, 'All assignments', 'assignment အားလုံး')}</option>
                    <option value="assigned">{tt(language, 'Assigned only', 'assign လုပ်ထားသည်များ')}</option>
                    <option value="unassigned">{tt(language, 'Unassigned only', 'မခန့်ထားရသေးသည်များ')}</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-y bg-muted/30">
                    <tr className="text-left">
                      <th className="px-4 py-3">{tt(language, 'Shipment', 'Shipment')}</th>
                      <th className="px-4 py-3">{tt(language, 'Recipient', 'Recipient')}</th>
                      <th className="px-4 py-3">{tt(language, 'Status', 'အခြေအနေ')}</th>
                      <th className="px-4 py-3">{tt(language, 'Driver', 'Driver')}</th>
                      <th className="px-4 py-3">{tt(language, 'Manifest', 'Manifest')}</th>
                      <th className="px-4 py-3">{tt(language, 'Created', 'ဖန်တီးချိန်')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queueRows.map((row) => (
                      <tr key={row.id} className={`cursor-pointer border-b ${selectedId === row.id ? 'bg-primary/5' : 'hover:bg-muted/20'}`} onClick={() => setSelectedId(row.id)}>
                        <td className="px-4 py-3">
                          <div className="font-medium">{row.shipment?.awb || row.id}</div>
                          <div className="text-xs text-muted-foreground">{row.id.slice(0, 8)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div>{row.shipment?.recipient?.name || 'Unknown'}</div>
                          <div className="text-xs text-muted-foreground">{row.shipment?.recipient?.phone || '—'}</div>
                        </td>
                        <td className="px-4 py-3"><Badge variant={statusVariant(row.status)}>{labelize(row.status)}</Badge></td>
                        <td className="px-4 py-3">{row.driver?.full_name || tt(language, 'Unassigned', 'မခန့်ထားရသေး')}</td>
                        <td className="px-4 py-3">{row.manifest?.manifest_number || '—'}</td>
                        <td className="px-4 py-3">{fmtDate(row.created_at)}</td>
                      </tr>
                    ))}
                    {!loading && !queueRows.length && (
                      <tr><td className="px-4 py-12 text-center text-muted-foreground" colSpan={6}>{tt(language, 'No deliveries matched your queue filters.', 'queue filter နှင့်ကိုက်ညီသော deliveries မရှိပါ')}</td></tr>
                    )}
                    {loading && (
                      <tr><td className="px-4 py-12 text-center text-muted-foreground" colSpan={6}>{tt(language, 'Loading live queue…', 'live queue တင်နေသည်…')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>{tt(language, 'Queue Action Panel', 'Queue Action Panel')}</CardTitle>
              <CardDescription>{selected ? `${tt(language, 'Editing', 'ပြင်ဆင်နေသည်')} ${selected.shipment?.awb || selected.id}` : tt(language, 'Select a delivery from the queue', 'queue မှ delivery တစ်ခုရွေးပါ')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {!selected && <div className="text-sm text-muted-foreground">{tt(language, 'No delivery selected.', 'ရွေးထားသော delivery မရှိပါ')}</div>}
              {selected && (
                <>
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold">{selected.shipment?.awb || selected.id}</div>
                        <div className="text-sm text-muted-foreground">{selected.shipment?.recipient?.name || 'Unknown recipient'}</div>
                      </div>
                      <Badge variant={statusVariant(selected.status)}>{labelize(selected.status)}</Badge>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                      <div>{tt(language, 'Phone', 'ဖုန်း')}: {selected.shipment?.recipient?.phone || '—'}</div>
                      <div>{tt(language, 'Expected delivery', 'မျှော်မှန်းပို့ချိန်')}: {fmtDate(selected.shipment?.expected_delivery_date)}</div>
                      <div>{tt(language, 'COD amount', 'COD ပမာဏ')}: {fmtCurrency(selected.shipment?.cod_amount)}</div>
                      <div>{tt(language, 'Failure reason', 'မအောင်မြင်ရသည့်အကြောင်း')}: {selected.failure_reason || '—'}</div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">{tt(language, 'Assign driver', 'Driver ခန့်ထားရန်')}</label>
                    <select className="h-10 w-full rounded-md border px-3 text-sm" value={formDriverId} onChange={(e) => setFormDriverId(e.target.value)}>
                      <option value="unassigned">{tt(language, 'Unassigned', 'မခန့်ထားရသေး')}</option>
                      {drivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {(driver.full_name || driver.email || driver.id) + (driver.role ? ` · ${labelize(driver.role)}` : '')}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">{tt(language, 'Attach manifest', 'Manifest ချိတ်ဆက်ရန်')}</label>
                    <select className="h-10 w-full rounded-md border px-3 text-sm" value={formManifestId} onChange={(e) => setFormManifestId(e.target.value)}>
                      <option value="none">{tt(language, 'No manifest', 'Manifest မရှိ')}</option>
                      {manifests.map((manifest) => (
                        <option key={manifest.id} value={manifest.id}>
                          {manifest.manifest_number} · {labelize(manifest.status)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">{tt(language, 'Delivery status', 'Delivery အခြေအနေ')}</label>
                    <select className="h-10 w-full rounded-md border px-3 text-sm" value={formStatus} onChange={(e) => setFormStatus(e.target.value)}>
                      {['pending', 'assigned', 'picked_up', 'in_transit', 'out_for_delivery', 'failed', 'delivered', 'returned', 'cancelled'].map((status) => (
                        <option key={status} value={status}>{labelize(status)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">{tt(language, 'Supervisor notes', 'Supervisor မှတ်ချက်')}</label>
                    <textarea className="min-h-[120px] w-full rounded-md border p-3 text-sm" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder={tt(language, 'Operational note, reassignment reason, or escalation detail', 'လုပ်ငန်းဆိုင်ရာ မှတ်ချက်၊ ပြန်လည်ခန့်ထားရသည့်အကြောင်း၊ escalation အသေးစိတ်')} />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button onClick={saveSelected} disabled={saving}>
                      <Save className={`mr-2 h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
                      {tt(language, 'Save changes', 'ပြောင်းလဲမှုသိမ်းမည်')}
                    </Button>
                    <Button variant="outline" onClick={quickRequeue} disabled={saving}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {tt(language, 'Requeue', 'Queue သို့ပြန်ထည့်မည်')}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'fleet' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{tt(language, 'Driver Workload', 'Driver Workload')}</CardTitle>
              <CardDescription>{tt(language, 'Current queue load distribution across active drivers.', 'active drivers များအပေါ် queue load ခွဲဝေမှု')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {fleetRows.map((driver) => (
                <div key={driver.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <div className="font-medium">{driver.full_name || driver.email || driver.id}</div>
                    <div className="text-sm text-muted-foreground">{driver.phone || labelize(driver.role) || 'Driver'}</div>
                  </div>
                  <Badge variant={driver.active_jobs > 0 ? 'secondary' : 'outline'}>{driver.active_jobs} {tt(language, 'active', 'active')}</Badge>
                </div>
              ))}
              {!fleetRows.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No active drivers returned by the backend.', 'backend မှ active drivers မရရှိပါ')}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{tt(language, 'Manifest Readiness', 'Manifest Readiness')}</CardTitle>
              <CardDescription>{tt(language, 'Open manifests available for supervisor allocation.', 'supervisor allocation အတွက် ရနိုင်သော open manifests')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {manifests.map((manifest) => (
                <div key={manifest.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <div className="font-medium">{manifest.manifest_number}</div>
                    <div className="text-sm text-muted-foreground">{fmtDate(manifest.scheduled_date)}</div>
                  </div>
                  <Badge variant={statusVariant(manifest.status)}>{labelize(manifest.status)}</Badge>
                </div>
              ))}
              {!manifests.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No manifests available right now.', 'လက်ရှိ manifest မရှိပါ')}</div>}
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'exceptions' && (
        <Card>
          <CardHeader>
            <CardTitle>{tt(language, 'Exception Queue', 'Exception Queue')}</CardTitle>
            <CardDescription>{tt(language, 'Failed deliveries and NDR-linked records from the production backend.', 'production backend မှ failed deliveries နှင့် NDR-linked records')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {exceptionRows.map((row) => (
              <div key={row.id} className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="font-medium">{row.shipment?.awb || row.id}</div>
                    <div className="text-sm text-muted-foreground">{row.shipment?.recipient?.name || 'Unknown recipient'} · {row.shipment?.recipient?.phone || 'No phone'}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{row.failure_reason || row.notes || tt(language, 'No failure reason recorded', 'မအောင်မြင်ရသည့်အကြောင်း မမှတ်တမ်းတင်ထားပါ')}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="destructive">{labelize(row.status)}</Badge>
                    <Button variant="outline" size="sm" onClick={() => { setSelectedId(row.id); setView('queue'); navigate('/supervisor/queue'); }}>
                      {tt(language, 'Open in queue', 'Queue တွင်ဖွင့်မည်')}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {!exceptionRows.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No open exceptions right now.', 'လက်ရှိ open exception မရှိပါ')}</div>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
TSX

cat > src/pages/DriverPortal.tsx <<'TSX'
// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Camera,
  CheckCircle2,
  Clock,
  DollarSign,
  MapPin,
  Navigation,
  Package,
  Phone,
  RefreshCw,
  Route as RouteIcon,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/useLanguage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function tt(language: string, en: string, mm: string) {
  return language === 'mm' ? mm : en;
}

function currentViewFromPath(pathname: string) {
  if (pathname.includes('/route')) return 'route';
  if (pathname.includes('/proof')) return 'proof';
  if (pathname.includes('/earnings')) return 'earnings';
  return 'jobs';
}

function labelize(value: string | null | undefined) {
  return String(value || 'unknown').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function fmtCurrency(value: unknown) {
  const amount = Number(value || 0);
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0)} MMK`;
}

function statusVariant(status: string) {
  const s = String(status || '').toLowerCase();
  if (['delivered'].includes(s)) return 'default';
  if (['failed', 'cancelled', 'returned'].includes(s)) return 'destructive';
  if (['assigned', 'picked_up', 'in_transit', 'out_for_delivery'].includes(s)) return 'secondary';
  return 'outline';
}

export default function DriverPortal() {
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useState(currentViewFromPath(location.pathname));
  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<any>(null);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [manifests, setManifests] = useState<any[]>([]);

  useEffect(() => {
    setView(currentViewFromPath(location.pathname));
  }, [location.pathname]);

  async function loadData() {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      let profile = null;

      if (auth.user?.id) {
        const profileRes = await supabase
          .from('user_profiles')
          .select('id, full_name, email, phone, role, branch_id, is_active')
          .eq('id', auth.user.id)
          .maybeSingle();

        if (!profileRes.error && profileRes.data && ['driver', 'rider'].includes(String(profileRes.data.role))) {
          profile = profileRes.data;
        }
      }

      if (!profile) {
        const fallbackRes = await supabase
          .from('user_profiles')
          .select('id, full_name, email, phone, role, branch_id, is_active')
          .in('role', ['driver', 'rider'])
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (fallbackRes.error) throw fallbackRes.error;
        profile = fallbackRes.data;
      }

      setDriver(profile);

      if (!profile?.id) {
        setDeliveries([]);
        setShipments([]);
        setManifests([]);
        return;
      }

      const deliveryRes = await supabase
        .from('deliveries')
        .select('id, shipment_id, manifest_id, driver_id, status, assigned_at, picked_up_at, delivered_at, failed_at, notes, failure_reason, created_at')
        .eq('driver_id', profile.id)
        .order('created_at', { ascending: false });

      if (deliveryRes.error) throw deliveryRes.error;

      const deliveryRows = deliveryRes.data || [];
      const shipmentIds = [...new Set(deliveryRows.map((d: any) => d.shipment_id).filter(Boolean))];
      const manifestIds = [...new Set(deliveryRows.map((d: any) => d.manifest_id).filter(Boolean))];

      const shipmentRes = shipmentIds.length
        ? await supabase
            .from('shipments')
            .select('id, awb, status, sender, recipient, cod_amount, shipping_fee, payment_method, expected_delivery_date, actual_delivery_date, proof_of_delivery, package_details, special_instructions, current_location, created_at')
            .in('id', shipmentIds)
        : { data: [], error: null };

      if (shipmentRes.error) throw shipmentRes.error;

      const manifestRes = manifestIds.length
        ? await supabase
            .from('manifests')
            .select('id, manifest_number, status, scheduled_date, route_data, planned_route, vehicle_id, warehouse_id, total_shipments, completed_shipments, failed_shipments')
            .in('id', manifestIds)
        : await supabase
            .from('manifests')
            .select('id, manifest_number, status, scheduled_date, route_data, planned_route, vehicle_id, warehouse_id, total_shipments, completed_shipments, failed_shipments')
            .eq('driver_id', profile.id);

      if (manifestRes.error) throw manifestRes.error;

      setDeliveries(deliveryRows);
      setShipments(shipmentRes.data || []);
      setManifests(manifestRes.data || []);
    } catch (e) {
      console.error(e);
      setDeliveries([]);
      setShipments([]);
      setManifests([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const shipmentMap = useMemo(() => new Map(shipments.map((s: any) => [s.id, s])), [shipments]);
  const manifestMap = useMemo(() => new Map(manifests.map((m: any) => [m.id, m])), [manifests]);

  const rows = useMemo(() => deliveries.map((d) => ({ ...d, shipment: shipmentMap.get(d.shipment_id), manifest: manifestMap.get(d.manifest_id) })), [deliveries, shipmentMap, manifestMap]);

  const activeJobs = rows.filter((r) => ['assigned', 'picked_up', 'in_transit', 'out_for_delivery'].includes(String(r.status || '').toLowerCase()));
  const deliveredRows = rows.filter((r) => String(r.status || '').toLowerCase() === 'delivered');
  const proofRows = rows.filter((r) => ['delivered', 'failed', 'returned'].includes(String(r.status || '').toLowerCase()));
  const earningsRows = deliveredRows;

  const stats = useMemo(() => {
    const deliveredToday = deliveredRows.filter((r) => {
      if (!r.delivered_at) return false;
      return new Date(r.delivered_at).toDateString() === new Date().toDateString();
    }).length;

    const cod = deliveredRows.reduce((sum, r) => sum + Number(r.shipment?.cod_amount || 0), 0);
    const fees = deliveredRows.reduce((sum, r) => sum + Number(r.shipment?.shipping_fee || 0), 0);
    const successRate = rows.length ? Math.round((deliveredRows.length / rows.length) * 1000) / 10 : 0;

    return {
      activeJobs: activeJobs.length,
      deliveredToday,
      cod,
      fees,
      successRate,
    };
  }, [rows, deliveredRows, activeJobs.length]);

  const manifestGroups = useMemo(() => {
    const groups = new Map<string, any>();
    rows.forEach((row) => {
      const key = row.manifest_id || 'unmanifested';
      if (!groups.has(key)) {
        groups.set(key, {
          manifest: row.manifest || { manifest_number: tt(language, 'Unmanifested', 'Manifest မရှိ') },
          rows: [],
        });
      }
      groups.get(key).rows.push(row);
    });
    return Array.from(groups.values());
  }, [rows, language]);

  const routeMapLink = (shipment: any) => {
    const address = shipment?.recipient?.address?.street
      || shipment?.recipient?.address
      || shipment?.current_location?.address
      || shipment?.recipient?.name
      || '';
    if (!address) return;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{tt(language, 'Driver / Rider Portal', 'Driver / Rider Portal')}</h1>
          <p className="mt-2 text-muted-foreground">{driver ? `${driver.full_name || driver.email} · ${labelize(driver.role)}` : tt(language, 'Live field execution workspace', 'live field execution workspace')}</p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {tt(language, 'Refresh', 'ပြန်လည်ရယူမည်')}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Active Jobs', 'လက်ရှိအလုပ်များ')}</div><div className="mt-2 text-4xl font-semibold">{stats.activeJobs}</div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Completed Today', 'ယနေ့ပြီးစီး')}</div><div className="mt-2 text-4xl font-semibold">{stats.deliveredToday}</div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Collected COD', 'ကောက်ခံထားသော COD')}</div><div className="mt-2 text-4xl font-semibold">{fmtCurrency(stats.cod)}</div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Success Rate', 'အောင်မြင်မှုနှုန်း')}</div><div className="mt-2 text-4xl font-semibold">{stats.successRate}%</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-4 gap-2 rounded-2xl bg-muted p-1">
        <button type="button" onClick={() => { setView('jobs'); navigate('/driver/jobs'); }} className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === 'jobs' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{tt(language, 'Current Jobs', 'လက်ရှိအလုပ်များ')}</button>
        <button type="button" onClick={() => { setView('route'); navigate('/driver/route'); }} className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === 'route' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{tt(language, 'Active Route', 'လက်ရှိလမ်းကြောင်း')}</button>
        <button type="button" onClick={() => { setView('proof'); navigate('/driver/proof'); }} className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === 'proof' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{tt(language, 'Proof of Delivery', 'ပို့ဆောင်မှုအထောက်အထား')}</button>
        <button type="button" onClick={() => { setView('earnings'); navigate('/driver/earnings'); }} className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === 'earnings' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{tt(language, 'Earnings', 'ဝင်ငွေ')}</button>
      </div>

      {view === 'jobs' && (
        <Card>
          <CardHeader>
            <CardTitle>{tt(language, 'Active Deliveries', 'လက်ရှိပို့ဆောင်မှုများ')}</CardTitle>
            <CardDescription>{tt(language, 'Deliveries currently assigned to this rider/driver.', 'ဤ rider/driver ထံ လက်ရှိ assign ထားသော deliveries')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeJobs.map((row) => (
              <div key={row.id} className="rounded-2xl border p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant(row.status)}>{labelize(row.status)}</Badge>
                      <span className="font-semibold">{row.shipment?.awb || row.id}</span>
                    </div>
                    <div className="text-lg font-semibold">{row.shipment?.recipient?.name || 'Unknown recipient'}</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2"><MapPin className="h-4 w-4" />{row.shipment?.recipient?.address?.street || row.shipment?.recipient?.address || '—'}</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2"><Phone className="h-4 w-4" />{row.shipment?.recipient?.phone || '—'}</div>
                    <div className="text-sm text-muted-foreground">{tt(language, 'COD', 'COD')}: {fmtCurrency(row.shipment?.cod_amount)}</div>
                    {row.shipment?.special_instructions && <div className="text-sm text-amber-600">{row.shipment.special_instructions}</div>}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => routeMapLink(row.shipment)}><Navigation className="mr-2 h-4 w-4" />{tt(language, 'Navigate', 'လမ်းညွှန်')}</Button>
                    <div className="text-xs text-muted-foreground">{tt(language, 'Assigned', 'ခန့်ထားချိန်')}: {fmtDate(row.assigned_at)}</div>
                  </div>
                </div>
              </div>
            ))}
            {!loading && !activeJobs.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No active jobs.', 'လက်ရှိအလုပ်မရှိပါ')}</div>}
          </CardContent>
        </Card>
      )}

      {view === 'route' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{tt(language, 'Manifest Route Summary', 'Manifest Route Summary')}</CardTitle>
              <CardDescription>{tt(language, 'Grouped by manifest for route execution.', 'route execution အတွက် manifest အလိုက်စုထားသည်')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {manifestGroups.map((group: any, index: number) => (
                <div key={index} className="rounded-2xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{group.manifest?.manifest_number || tt(language, 'Unmanifested', 'Manifest မရှိ')}</div>
                      <div className="text-sm text-muted-foreground">{tt(language, 'Scheduled', 'စီစဉ်ချိန်')}: {fmtDate(group.manifest?.scheduled_date)}</div>
                    </div>
                    <Badge variant={statusVariant(group.manifest?.status || 'assigned')}>{labelize(group.manifest?.status || 'assigned')}</Badge>
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground">{group.rows.length} {tt(language, 'stops', 'stop များ')}</div>
                </div>
              ))}
              {!manifestGroups.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No route data available.', 'route data မရှိပါ')}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{tt(language, 'Next Stops', 'နောက်သွားရမည့်နေရာများ')}</CardTitle>
              <CardDescription>{tt(language, 'Open deliveries in execution order.', 'လက်ရှိလုပ်ဆောင်နေသော deliveries')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeJobs.map((row) => (
                <div key={row.id} className="rounded-2xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{row.shipment?.recipient?.name || 'Unknown'}</div>
                      <div className="text-sm text-muted-foreground">{row.shipment?.awb || row.id}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{row.shipment?.recipient?.address?.street || row.shipment?.recipient?.address || '—'}</div>
                    </div>
                    <Button variant="outline" onClick={() => routeMapLink(row.shipment)}>
                      <RouteIcon className="mr-2 h-4 w-4" />
                      {tt(language, 'Open Map', 'မြေပုံဖွင့်မည်')}
                    </Button>
                  </div>
                </div>
              ))}
              {!activeJobs.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No active route stops.', 'လက်ရှိ route stop မရှိပါ')}</div>}
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'proof' && (
        <Card>
          <CardHeader>
            <CardTitle>{tt(language, 'Proof of Delivery', 'ပို့ဆောင်မှုအထောက်အထား')}</CardTitle>
            <CardDescription>{tt(language, 'Delivered, failed, and returned records with proof or exception evidence.', 'delivered, failed, returned records နှင့် proof / exception evidence')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {proofRows.map((row) => {
              const pod = row.shipment?.proof_of_delivery || {};
              return (
                <div key={row.id} className="rounded-2xl border p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariant(row.status)}>{labelize(row.status)}</Badge>
                        <span className="font-semibold">{row.shipment?.awb || row.id}</span>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">{row.shipment?.recipient?.name || 'Unknown recipient'}</div>
                      <div className="mt-2 text-sm text-muted-foreground">{tt(language, 'Delivered at', 'ပို့ပြီးချိန်')}: {fmtDate(row.delivered_at || row.failed_at)}</div>
                      <div className="mt-2 text-sm text-muted-foreground">{tt(language, 'Notes', 'မှတ်ချက်')}: {row.notes || row.failure_reason || '—'}</div>
                    </div>
                    <div className="grid gap-2 text-sm">
                      <div className="flex items-center gap-2"><Camera className="h-4 w-4" />{pod?.photo_url ? tt(language, 'Photo captured', 'ဓာတ်ပုံမှတ်တမ်းရှိ') : tt(language, 'No photo', 'ဓာတ်ပုံမရှိ')}</div>
                      <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{pod?.recipient_name || tt(language, 'Recipient not recorded', 'လက်ခံသူမမှတ်တမ်းတင်ရသေး')}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            {!proofRows.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No proof records available.', 'proof records မရှိပါ')}</div>}
          </CardContent>
        </Card>
      )}

      {view === 'earnings' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{tt(language, 'Collected Amounts', 'ကောက်ခံထားသောပမာဏ')}</CardTitle>
              <CardDescription>{tt(language, 'Delivered shipment earnings summary.', 'delivered shipment များ၏ ဝင်ငွေအနှစ်ချုပ်')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border p-4">
                <div className="text-sm text-muted-foreground">{tt(language, 'Collected COD', 'ကောက်ခံထားသော COD')}</div>
                <div className="mt-2 text-4xl font-semibold">{fmtCurrency(stats.cod)}</div>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="text-sm text-muted-foreground">{tt(language, 'Shipping Fee Total', 'စုစုပေါင်းပို့ခ')}</div>
                <div className="mt-2 text-4xl font-semibold">{fmtCurrency(stats.fees)}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{tt(language, 'Delivered Shipment Ledger', 'Delivered Shipment Ledger')}</CardTitle>
              <CardDescription>{tt(language, 'Shipment-by-shipment collected values.', 'shipment အလိုက် ကောက်ခံထားသောတန်ဖိုးများ')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {earningsRows.map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <div className="font-medium">{row.shipment?.awb || row.id}</div>
                    <div className="text-sm text-muted-foreground">{row.shipment?.recipient?.name || 'Unknown recipient'}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{fmtCurrency(Number(row.shipment?.cod_amount || 0) + Number(row.shipment?.shipping_fee || 0))}</div>
                    <div className="text-xs text-muted-foreground"><Clock className="mr-1 inline h-3 w-3" />{fmtDate(row.delivered_at)}</div>
                  </div>
                </div>
              ))}
              {!earningsRows.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No delivered shipment earnings yet.', 'delivered shipment earnings မရှိသေးပါ')}</div>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
TSX

cat > src/pages/WayplanPortal.tsx <<'TSX'
// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Printer,
  RefreshCw,
  Route as RouteIcon,
  Truck,
  FileText,
  Package,
  Search,
  Save,
  MapPinned,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/useLanguage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

function tt(language: string, en: string, mm: string) {
  return language === 'mm' ? mm : en;
}

function currentViewFromPath(pathname: string) {
  if (pathname.includes('/manifests')) return 'manifests';
  if (pathname.includes('/vehicles')) return 'vehicles';
  if (pathname.includes('/ways')) return 'ways';
  if (pathname.includes('/waybills')) return 'waybills';
  return 'optimize';
}

function labelize(value: string | null | undefined) {
  return String(value || 'unknown').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function fmtCurrency(value: unknown) {
  const amount = Number(value || 0);
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0)} MMK`;
}

function statusVariant(status: string) {
  const s = String(status || '').toLowerCase();
  if (['completed', 'delivered'].includes(s)) return 'default';
  if (['failed', 'cancelled', 'returned'].includes(s)) return 'destructive';
  if (['assigned', 'in_progress', 'draft', 'out_for_delivery', 'pending'].includes(s)) return 'secondary';
  return 'outline';
}

const VIEW_ROUTES: Record<string, string> = {
  optimize: '/wayplan/optimize',
  manifests: '/wayplan/manifests',
  vehicles: '/wayplan/vehicles',
  ways: '/wayplan/ways',
  waybills: '/wayplan/waybills',
};

export default function WayplanPortal() {
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const [view, setView] = useState(currentViewFromPath(location.pathname));
  const [loading, setLoading] = useState(true);
  const [savingVehicle, setSavingVehicle] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState<string | null>(null);

  const [manifests, setManifests] = useState<any[]>([]);
  const [manifestItems, setManifestItems] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);

  const [shipmentSearch, setShipmentSearch] = useState('');
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState('all');
  const [selectedWaybillId, setSelectedWaybillId] = useState<string | null>(null);
  const [vehicleDriverDraft, setVehicleDriverDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    setView(currentViewFromPath(location.pathname));
  }, [location.pathname]);

  async function loadData() {
    setLoading(true);
    try {
      const [manifestRes, manifestItemRes, vehicleRes, driverRes, shipmentRes] = await Promise.all([
        supabase
          .from('manifests')
          .select('id, manifest_number, driver_id, vehicle_id, warehouse_id, status, route_data, planned_route, scheduled_date, total_shipments, completed_shipments, failed_shipments, created_at')
          .order('scheduled_date', { ascending: false }),
        supabase
          .from('manifest_items')
          .select('id, manifest_id, shipment_id, sequence_number, status, estimated_arrival, actual_arrival'),
        supabase
          .from('vehicles')
          .select('id, registration_number, type, status, warehouse_id, current_driver_id, capacity')
          .order('registration_number', { ascending: true }),
        supabase
          .from('user_profiles')
          .select('id, full_name, email, phone, role, is_active')
          .in('role', ['driver', 'rider'])
          .eq('is_active', true)
          .order('full_name', { ascending: true }),
        supabase
          .from('shipments')
          .select('id, awb, status, sender, recipient, cod_amount, shipping_fee, payment_method, expected_delivery_date, actual_delivery_date, created_at, service_type, special_instructions')
          .order('created_at', { ascending: false }),
      ]);

      if (manifestRes.error) throw manifestRes.error;
      if (manifestItemRes.error) throw manifestItemRes.error;
      if (vehicleRes.error) throw vehicleRes.error;
      if (driverRes.error) throw driverRes.error;
      if (shipmentRes.error) throw shipmentRes.error;

      setManifests(manifestRes.data || []);
      setManifestItems(manifestItemRes.data || []);
      setVehicles(vehicleRes.data || []);
      setDrivers(driverRes.data || []);
      setShipments(shipmentRes.data || []);
      const draft: Record<string, string> = {};
      (vehicleRes.data || []).forEach((v: any) => {
        draft[v.id] = v.current_driver_id || '';
      });
      setVehicleDriverDraft(draft);
      if (!selectedWaybillId && shipmentRes.data?.length) setSelectedWaybillId(shipmentRes.data[0].id);
    } catch (e) {
      console.error(e);
      setManifests([]);
      setManifestItems([]);
      setVehicles([]);
      setDrivers([]);
      setShipments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const driverMap = useMemo(() => new Map(drivers.map((d: any) => [d.id, d])), [drivers]);
  const vehicleMap = useMemo(() => new Map(vehicles.map((v: any) => [v.id, v])), [vehicles]);
  const shipmentMap = useMemo(() => new Map(shipments.map((s: any) => [s.id, s])), [shipments]);
  const manifestItemMap = useMemo(() => {
    const map = new Map<string, any[]>();
    manifestItems.forEach((item: any) => {
      if (!map.has(item.manifest_id)) map.set(item.manifest_id, []);
      map.get(item.manifest_id).push(item);
    });
    return map;
  }, [manifestItems]);

  const manifestRows = useMemo(() => {
    return manifests.map((m) => ({
      ...m,
      driver: driverMap.get(m.driver_id) || null,
      vehicle: vehicleMap.get(m.vehicle_id) || null,
      itemCount: (manifestItemMap.get(m.id) || []).length,
    }));
  }, [manifests, driverMap, vehicleMap, manifestItemMap]);

  const wayRows = useMemo(() => {
    const q = shipmentSearch.trim().toLowerCase();
    return shipments.filter((s: any) => {
      const matchQuery =
        !q ||
        String(s.awb || '').toLowerCase().includes(q) ||
        String(s.recipient?.name || '').toLowerCase().includes(q) ||
        String(s.recipient?.phone || '').toLowerCase().includes(q);

      const matchStatus = shipmentStatusFilter === 'all' ? true : String(s.status) === shipmentStatusFilter;
      return matchQuery && matchStatus;
    });
  }, [shipments, shipmentSearch, shipmentStatusFilter]);

  const selectedWaybill = useMemo(
    () => shipments.find((s: any) => s.id === selectedWaybillId) || null,
    [shipments, selectedWaybillId]
  );

  const metrics = useMemo(() => {
    return {
      activeRoutes: manifestRows.length,
      optimized: manifestRows.filter((m: any) => m.planned_route || m.route_data).length,
      vehiclesAssigned: vehicles.filter((v: any) => v.current_driver_id).length,
      openWays: shipments.filter((s: any) => !['delivered', 'cancelled'].includes(String(s.status || '').toLowerCase())).length,
    };
  }, [manifestRows, vehicles, shipments]);

  async function optimizeManifest(manifestId: string) {
    setOptimizing(manifestId);
    try {
      const items = (manifestItemMap.get(manifestId) || [])
        .map((item: any) => ({ ...item, shipment: shipmentMap.get(item.shipment_id) }))
        .sort((a: any, b: any) => {
          const da = new Date(a.shipment?.expected_delivery_date || a.shipment?.created_at || 0).getTime();
          const db = new Date(b.shipment?.expected_delivery_date || b.shipment?.created_at || 0).getTime();
          return da - db;
        });

      const plannedRoute = {
        optimized_at: new Date().toISOString(),
        ordered_by: 'expected_delivery_date',
        stops: items.map((item: any, index: number) => ({
          sequence: index + 1,
          shipment_id: item.shipment_id,
          awb: item.shipment?.awb || '',
          recipient: item.shipment?.recipient?.name || '',
          address: item.shipment?.recipient?.address?.street || item.shipment?.recipient?.address || '',
        })),
      };

      const res = await supabase
        .from('manifests')
        .update({ planned_route: plannedRoute, route_data: plannedRoute, updated_at: new Date().toISOString() })
        .eq('id', manifestId);

      if (res.error) throw res.error;
      await loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setOptimizing(null);
    }
  }

  async function saveVehicleDriver(vehicleId: string) {
    setSavingVehicle(vehicleId);
    try {
      const driverId = vehicleDriverDraft[vehicleId] || null;
      const res = await supabase.from('vehicles').update({ current_driver_id: driverId || null, updated_at: new Date().toISOString() }).eq('id', vehicleId);
      if (res.error) throw res.error;
      await loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setSavingVehicle(null);
    }
  }

  async function updateWayStatus(shipmentId: string, nextStatus: string) {
    try {
      const res = await supabase
        .from('shipments')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', shipmentId);
      if (res.error) throw res.error;
      await loadData();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{tt(language, 'Wayplan Manager', 'Wayplan Manager')}</h1>
          <p className="mt-2 text-muted-foreground">{tt(language, 'Route optimization, manifests, vehicle assignment, way management, and waybill printing.', 'route optimization, manifest, vehicle assignment, way management နှင့် waybill printing')}</p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {tt(language, 'Refresh', 'ပြန်လည်ရယူမည်')}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Active Routes', 'လက်ရှိ route များ')}</div><div className="mt-2 text-4xl font-semibold">{metrics.activeRoutes}</div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Optimized Routes', 'optimize လုပ်ပြီးသော route များ')}</div><div className="mt-2 text-4xl font-semibold">{metrics.optimized}</div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Vehicles Assigned', 'ခန့်ထားပြီးသောယာဉ်များ')}</div><div className="mt-2 text-4xl font-semibold">{metrics.vehiclesAssigned}</div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Open Ways', 'လက်ရှိ ways')}</div><div className="mt-2 text-4xl font-semibold">{metrics.openWays}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-5 gap-2 rounded-2xl bg-muted p-1">
        {Object.keys(VIEW_ROUTES).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setView(key);
              navigate(VIEW_ROUTES[key]);
            }}
            className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === key ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
          >
            {key === 'optimize' && tt(language, 'Route Optimization', 'Route Optimization')}
            {key === 'manifests' && tt(language, 'Manifests', 'Manifest များ')}
            {key === 'vehicles' && tt(language, 'Vehicle Assignment', 'Vehicle Assignment')}
            {key === 'ways' && tt(language, 'Way Management', 'Way Management')}
            {key === 'waybills' && tt(language, 'Waybill Print', 'Waybill Print')}
          </button>
        ))}
      </div>

      {view === 'optimize' && (
        <Card>
          <CardHeader>
            <CardTitle>{tt(language, 'Route Optimization', 'Route Optimization')}</CardTitle>
            <CardDescription>{tt(language, 'Create or refresh planned route data directly on live manifests.', 'live manifest များတွင် planned route data ကိုဖန်တီး/ပြန်လည်ရယူမည်')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {manifestRows.map((manifest: any) => (
              <div key={manifest.id} className="rounded-2xl border p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-semibold">{manifest.manifest_number}</div>
                    <div className="text-sm text-muted-foreground">
                      {manifest.driver?.full_name || '—'} · {manifest.vehicle?.registration_number || '—'} · {manifest.itemCount} {tt(language, 'shipments', 'shipment များ')}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{tt(language, 'Scheduled', 'စီစဉ်ချိန်')}: {fmtDate(manifest.scheduled_date)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant(manifest.status)}>{labelize(manifest.status)}</Badge>
                    <Button onClick={() => optimizeManifest(manifest.id)} disabled={optimizing === manifest.id}>
                      <MapPinned className="mr-2 h-4 w-4" />
                      {optimizing === manifest.id ? tt(language, 'Optimizing...', 'optimize လုပ်နေသည်...') : tt(language, manifest.planned_route ? 'Rebuild Route' : 'Optimize', manifest.planned_route ? 'Route ပြန်တည်ဆောက်မည်' : 'Optimize')}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {!manifestRows.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No manifests available.', 'manifest မရှိပါ')}</div>}
          </CardContent>
        </Card>
      )}

      {view === 'manifests' && (
        <Card>
          <CardHeader>
            <CardTitle>{tt(language, 'Manifest Management', 'Manifest Management')}</CardTitle>
            <CardDescription>{tt(language, 'Live manifest list with item counts and execution status.', 'item count နှင့် execution status ပါဝင်သော live manifest list')}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="border-y bg-muted/30">
                <tr className="text-left">
                  <th className="px-4 py-3">{tt(language, 'Manifest', 'Manifest')}</th>
                  <th className="px-4 py-3">{tt(language, 'Driver', 'Driver')}</th>
                  <th className="px-4 py-3">{tt(language, 'Vehicle', 'ယာဉ်')}</th>
                  <th className="px-4 py-3">{tt(language, 'Items', 'Items')}</th>
                  <th className="px-4 py-3">{tt(language, 'Scheduled', 'စီစဉ်ချိန်')}</th>
                  <th className="px-4 py-3">{tt(language, 'Status', 'အခြေအနေ')}</th>
                </tr>
              </thead>
              <tbody>
                {manifestRows.map((manifest: any) => (
                  <tr key={manifest.id} className="border-b">
                    <td className="px-4 py-3 font-medium">{manifest.manifest_number}</td>
                    <td className="px-4 py-3">{manifest.driver?.full_name || '—'}</td>
                    <td className="px-4 py-3">{manifest.vehicle?.registration_number || '—'}</td>
                    <td className="px-4 py-3">{manifest.itemCount}</td>
                    <td className="px-4 py-3">{fmtDate(manifest.scheduled_date)}</td>
                    <td className="px-4 py-3"><Badge variant={statusVariant(manifest.status)}>{labelize(manifest.status)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {view === 'vehicles' && (
        <div className="grid gap-4 xl:grid-cols-2">
          {vehicles.map((vehicle: any) => (
            <Card key={vehicle.id}>
              <CardHeader>
                <CardTitle>{vehicle.registration_number}</CardTitle>
                <CardDescription>{labelize(vehicle.type)} · {labelize(vehicle.status)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">{tt(language, 'Capacity', 'စွမ်းရည်')}: {JSON.stringify(vehicle.capacity || {})}</div>
                <select
                  className="h-10 w-full rounded-md border px-3 text-sm"
                  value={vehicleDriverDraft[vehicle.id] || ''}
                  onChange={(e) => setVehicleDriverDraft((prev) => ({ ...prev, [vehicle.id]: e.target.value }))}
                >
                  <option value="">{tt(language, 'Unassigned', 'မခန့်ထားရသေး')}</option>
                  {drivers.map((driver: any) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.full_name || driver.email || driver.id}
                    </option>
                  ))}
                </select>
                <Button onClick={() => saveVehicleDriver(vehicle.id)} disabled={savingVehicle === vehicle.id}>
                  <Save className="mr-2 h-4 w-4" />
                  {savingVehicle === vehicle.id ? tt(language, 'Saving...', 'သိမ်းနေသည်...') : tt(language, 'Save Assignment', 'Assignment သိမ်းမည်')}
                </Button>
              </CardContent>
            </Card>
          ))}
          {!vehicles.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No vehicles returned by the backend.', 'backend မှ vehicle မရရှိပါ')}</div>}
        </div>
      )}

      {view === 'ways' && (
        <Card>
          <CardHeader>
            <CardTitle>{tt(language, 'Way Management', 'Way Management')}</CardTitle>
            <CardDescription>{tt(language, 'Search, review, and update live shipment way status.', 'live shipment way status များကို ရှာဖွေ၊ စစ်ဆေး၊ update လုပ်မည်')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_180px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={shipmentSearch} onChange={(e) => setShipmentSearch(e.target.value)} placeholder={tt(language, 'Search AWB, recipient, phone', 'AWB, recipient, phone ဖြင့်ရှာရန်')} />
              </div>
              <select className="h-10 rounded-md border px-3 text-sm" value={shipmentStatusFilter} onChange={(e) => setShipmentStatusFilter(e.target.value)}>
                <option value="all">{tt(language, 'All statuses', 'အခြေအနေအားလုံး')}</option>
                <option value="pending">Pending</option>
                <option value="assigned">Assigned</option>
                <option value="out_for_delivery">Out for Delivery</option>
                <option value="delivered">Delivered</option>
                <option value="returned">Returned</option>
              </select>
            </div>

            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="border-y bg-muted/30">
                  <tr className="text-left">
                    <th className="px-4 py-3">AWB</th>
                    <th className="px-4 py-3">{tt(language, 'Recipient', 'လက်ခံသူ')}</th>
                    <th className="px-4 py-3">{tt(language, 'Status', 'အခြေအနေ')}</th>
                    <th className="px-4 py-3">{tt(language, 'Collectable', 'ကောက်ခံရန်')}</th>
                    <th className="px-4 py-3">{tt(language, 'Actions', 'လုပ်ဆောင်ချက်')}</th>
                  </tr>
                </thead>
                <tbody>
                  {wayRows.map((row: any) => (
                    <tr key={row.id} className="border-b">
                      <td className="px-4 py-3 font-medium">{row.awb}</td>
                      <td className="px-4 py-3">
                        <div>{row.recipient?.name || 'Unknown recipient'}</div>
                        <div className="text-xs text-muted-foreground">{row.recipient?.phone || '—'}</div>
                      </td>
                      <td className="px-4 py-3"><Badge variant={statusVariant(row.status)}>{labelize(row.status)}</Badge></td>
                      <td className="px-4 py-3">{fmtCurrency(Number(row.cod_amount || 0) + Number(row.shipping_fee || 0))}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => updateWayStatus(row.id, 'out_for_delivery')}>{tt(language, 'Send Out', 'ထုတ်ပို့မည်')}</Button>
                          <Button variant="outline" size="sm" onClick={() => updateWayStatus(row.id, 'returned')}>{tt(language, 'Return', 'ပြန်ပို့မည်')}</Button>
                          <Button size="sm" onClick={() => { setSelectedWaybillId(row.id); setView('waybills'); navigate('/wayplan/waybills'); }}>{tt(language, 'Waybill', 'Waybill')}</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!wayRows.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No way records matched the current filters.', 'filter နှင့်ကိုက်ညီသော way records မရှိပါ')}</div>}
            </div>
          </CardContent>
        </Card>
      )}

      {view === 'waybills' && (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>{tt(language, 'Shipment List', 'Shipment List')}</CardTitle>
              <CardDescription>{tt(language, 'Choose a shipment to print its waybill.', 'waybill print လုပ်ရန် shipment ရွေးပါ')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {shipments.slice(0, 50).map((shipment: any) => (
                <button
                  key={shipment.id}
                  type="button"
                  onClick={() => setSelectedWaybillId(shipment.id)}
                  className={`w-full rounded-xl border p-3 text-left ${selectedWaybillId === shipment.id ? 'border-primary bg-primary/5' : ''}`}
                >
                  <div className="font-medium">{shipment.awb}</div>
                  <div className="text-sm text-muted-foreground">{shipment.recipient?.name || 'Unknown recipient'}</div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card id="waybill-print-card">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>{tt(language, 'Printable Waybill', 'Printable Waybill')}</CardTitle>
                <CardDescription>{tt(language, 'Browser print view driven by live shipment data.', 'live shipment data ဖြင့် browser print view')}</CardDescription>
              </div>
              <Button onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                {tt(language, 'Print', 'ပုံနှိပ်မည်')}
              </Button>
            </CardHeader>
            <CardContent>
              {!selectedWaybill && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'Select a shipment from the left panel.', 'ဘယ်ဘက် panel မှ shipment တစ်ခုရွေးပါ')}</div>}
              {selectedWaybill && (
                <div className="rounded-2xl border bg-white p-8 text-slate-900 print:border-0 print:p-0">
                  <div className="flex items-start justify-between gap-6 border-b pb-6">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Britium Express</div>
                      <div className="mt-2 text-3xl font-black">WAYBILL</div>
                      <div className="mt-2 text-sm text-slate-500">{tt(language, 'Live print layout', 'live print layout')}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-slate-500">AWB</div>
                      <div className="text-3xl font-black">{selectedWaybill.awb}</div>
                      <div className="mt-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase">{labelize(selectedWaybill.status)}</div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-6 md:grid-cols-2">
                    <div className="rounded-2xl border p-4">
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{tt(language, 'Sender', 'ပို့သူ')}</div>
                      <div className="mt-3 space-y-1">
                        <div className="font-semibold">{selectedWaybill.sender?.name || '—'}</div>
                        <div className="text-sm text-slate-600">{selectedWaybill.sender?.phone || '—'}</div>
                        <div className="text-sm text-slate-600">{selectedWaybill.sender?.address?.street || selectedWaybill.sender?.address || '—'}</div>
                      </div>
                    </div>

                    <div className="rounded-2xl border p-4">
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{tt(language, 'Recipient', 'လက်ခံသူ')}</div>
                      <div className="mt-3 space-y-1">
                        <div className="font-semibold">{selectedWaybill.recipient?.name || '—'}</div>
                        <div className="text-sm text-slate-600">{selectedWaybill.recipient?.phone || '—'}</div>
                        <div className="text-sm text-slate-600">{selectedWaybill.recipient?.address?.street || selectedWaybill.recipient?.address || '—'}</div>
                      </div>
                    </div>

                    <div className="rounded-2xl border p-4">
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{tt(language, 'Shipment Detail', 'Shipment Detail')}</div>
                      <div className="mt-3 grid gap-2 text-sm">
                        <div>{tt(language, 'Service', 'ဝန်ဆောင်မှု')}: {labelize(selectedWaybill.service_type)}</div>
                        <div>{tt(language, 'Payment', 'ငွေပေးချေမှု')}: {labelize(selectedWaybill.payment_method)}</div>
                        <div>{tt(language, 'COD', 'COD')}: {fmtCurrency(selectedWaybill.cod_amount)}</div>
                        <div>{tt(language, 'Shipping Fee', 'ပို့ခ')}: {fmtCurrency(selectedWaybill.shipping_fee)}</div>
                      </div>
                    </div>

                    <div className="rounded-2xl border p-4">
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{tt(language, 'Dates', 'ရက်စွဲများ')}</div>
                      <div className="mt-3 grid gap-2 text-sm">
                        <div>{tt(language, 'Created', 'ဖန်တီးချိန်')}: {fmtDate(selectedWaybill.created_at)}</div>
                        <div>{tt(language, 'Expected Delivery', 'မျှော်မှန်းပို့ချိန်')}: {fmtDate(selectedWaybill.expected_delivery_date)}</div>
                        <div>{tt(language, 'Actual Delivery', 'တကယ်ပို့ပြီးချိန်')}: {fmtDate(selectedWaybill.actual_delivery_date)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border p-4">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{tt(language, 'Instructions', 'ညွှန်ကြားချက်')}</div>
                    <div className="mt-3 text-sm text-slate-700">{selectedWaybill.special_instructions || '—'}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
TSX

cat > src/pages/WarehousePortal.tsx <<'TSX'
// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  CheckCircle2,
  Package,
  QrCode,
  RefreshCw,
  Search,
  Truck,
  Warehouse as WarehouseIcon,
  ScanLine,
  Handshake,
  FileSpreadsheet,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/useLanguage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

function tt(language: string, en: string, mm: string) {
  return language === 'mm' ? mm : en;
}

function currentViewFromPath(pathname: string) {
  if (pathname.includes('/sorting')) return 'sorting';
  if (pathname.includes('/dispatch')) return 'dispatch';
  if (pathname.includes('/transfers')) return 'transfers';
  if (pathname.includes('/inventory')) return 'inventory';
  if (pathname.includes('/exceptions')) return 'exceptions';
  if (pathname.includes('/returns')) return 'returns';
  if (pathname.includes('/handover')) return 'handover';
  if (pathname.includes('/scanqc')) return 'scanqc';
  if (pathname.includes('/reports')) return 'reports';
  if (pathname.includes('/profile')) return 'profile';
  return 'inbound';
}

function labelize(value: string | null | undefined) {
  return String(value || 'unknown').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function fmtCurrency(value: unknown) {
  const amount = Number(value || 0);
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0)} MMK`;
}

function safeWeight(details: any) {
  const weight = Number(details?.weight || details?.actual_weight || 0);
  return `${Number.isFinite(weight) ? weight.toFixed(1) : '0.0'} kg`;
}

function statusVariant(status: string) {
  const s = String(status || '').toLowerCase();
  if (['delivered', 'completed', 'operational'].includes(s)) return 'default';
  if (['failed', 'cancelled', 'returned'].includes(s)) return 'destructive';
  if (['assigned', 'draft', 'in_progress', 'pending', 'in_transit', 'out_for_delivery'].includes(s)) return 'secondary';
  return 'outline';
}

const VIEW_ROUTES: Record<string, string> = {
  inbound: '/warehouse/inbound',
  sorting: '/warehouse/sorting',
  dispatch: '/warehouse/dispatch',
  transfers: '/warehouse/transfers',
  inventory: '/warehouse/inventory',
  exceptions: '/warehouse/exceptions',
  returns: '/warehouse/returns',
  handover: '/warehouse/handover',
  scanqc: '/warehouse/scanqc',
  reports: '/warehouse/reports',
  profile: '/warehouse/profile',
};

export default function WarehousePortal() {
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const [view, setView] = useState(currentViewFromPath(location.pathname));
  const [loading, setLoading] = useState(true);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [manifests, setManifests] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [scanValue, setScanValue] = useState('');

  useEffect(() => {
    setView(currentViewFromPath(location.pathname));
  }, [location.pathname]);

  async function loadData() {
    setLoading(true);
    try {
      const [warehouseRes, shipmentRes, deliveryRes, manifestRes, driverRes] = await Promise.all([
        supabase.from('warehouses').select('id, code, name, type, status, address, capacity, operating_hours').order('name', { ascending: true }),
        supabase.from('shipments').select('id, awb, status, sender, recipient, package_details, cod_amount, shipping_fee, payment_method, current_location, expected_delivery_date, actual_delivery_date, origin_warehouse_id, destination_warehouse_id, proof_of_delivery, created_at').order('created_at', { ascending: false }),
        supabase.from('deliveries').select('id, shipment_id, manifest_id, driver_id, status, failure_reason, notes, assigned_at, delivered_at, failed_at, created_at').order('created_at', { ascending: false }),
        supabase.from('manifests').select('id, manifest_number, warehouse_id, driver_id, vehicle_id, status, scheduled_date, total_shipments, completed_shipments, failed_shipments, route_data, planned_route, created_at').order('scheduled_date', { ascending: false }),
        supabase.from('user_profiles').select('id, full_name, email, phone, role, is_active').in('role', ['driver', 'rider']).eq('is_active', true),
      ]);

      if (warehouseRes.error) throw warehouseRes.error;
      if (shipmentRes.error) throw shipmentRes.error;
      if (deliveryRes.error) throw deliveryRes.error;
      if (manifestRes.error) throw manifestRes.error;
      if (driverRes.error) throw driverRes.error;

      setWarehouses(warehouseRes.data || []);
      setShipments(shipmentRes.data || []);
      setDeliveries(deliveryRes.data || []);
      setManifests(manifestRes.data || []);
      setDrivers(driverRes.data || []);

      if (!selectedWarehouseId && warehouseRes.data?.length) {
        setSelectedWarehouseId(warehouseRes.data[0].id);
      }
    } catch (e) {
      console.error(e);
      setWarehouses([]);
      setShipments([]);
      setDeliveries([]);
      setManifests([]);
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const selectedWarehouse = useMemo(
    () => warehouses.find((w: any) => w.id === selectedWarehouseId) || warehouses[0] || null,
    [warehouses, selectedWarehouseId]
  );

  const selectedWarehouseShipments = useMemo(() => {
    if (!selectedWarehouse?.id) return [];
    return shipments.filter((s: any) => s.origin_warehouse_id === selectedWarehouse.id || s.destination_warehouse_id === selectedWarehouse.id);
  }, [shipments, selectedWarehouse?.id]);

  const selectedWarehouseManifests = useMemo(() => {
    if (!selectedWarehouse?.id) return [];
    return manifests.filter((m: any) => m.warehouse_id === selectedWarehouse.id);
  }, [manifests, selectedWarehouse?.id]);

  const manifestMap = useMemo(() => new Map(selectedWarehouseManifests.map((m: any) => [m.id, m])), [selectedWarehouseManifests]);
  const driverMap = useMemo(() => new Map(drivers.map((d: any) => [d.id, d])), [drivers]);

  const selectedWarehouseDeliveries = useMemo(() => {
    const allowedManifestIds = new Set(selectedWarehouseManifests.map((m: any) => m.id));
    const allowedShipmentIds = new Set(selectedWarehouseShipments.map((s: any) => s.id));
    return deliveries.filter((d: any) => allowedManifestIds.has(d.manifest_id) || allowedShipmentIds.has(d.shipment_id));
  }, [deliveries, selectedWarehouseManifests, selectedWarehouseShipments]);

  const shipmentMap = useMemo(() => new Map(selectedWarehouseShipments.map((s: any) => [s.id, s])), [selectedWarehouseShipments]);

  const deliveryRows = useMemo(
    () =>
      selectedWarehouseDeliveries.map((d: any) => ({
        ...d,
        shipment: shipmentMap.get(d.shipment_id) || null,
        manifest: manifestMap.get(d.manifest_id) || null,
        driver: driverMap.get(d.driver_id) || null,
      })),
    [selectedWarehouseDeliveries, shipmentMap, manifestMap, driverMap]
  );

  const inboundRows = useMemo(() => {
    return selectedWarehouseShipments.filter((s: any) => ['pending', 'assigned', 'picked_up', 'in_transit'].includes(String(s.status || '').toLowerCase()));
  }, [selectedWarehouseShipments]);

  const sortingRows = useMemo(() => {
    return selectedWarehouseShipments.filter((s: any) => ['assigned', 'picked_up', 'in_transit'].includes(String(s.status || '').toLowerCase()));
  }, [selectedWarehouseShipments]);

  const dispatchRows = useMemo(() => {
    return selectedWarehouseManifests.filter((m: any) => ['draft', 'assigned', 'in_progress'].includes(String(m.status || '').toLowerCase()));
  }, [selectedWarehouseManifests]);

  const transferRows = useMemo(() => {
    return selectedWarehouseManifests.filter((m: any) => m.vehicle_id || m.route_data || m.planned_route);
  }, [selectedWarehouseManifests]);

  const exceptionRows = useMemo(() => {
    return deliveryRows.filter((d: any) => ['failed', 'cancelled'].includes(String(d.status || '').toLowerCase()) || d.failure_reason);
  }, [deliveryRows]);

  const returnRows = useMemo(() => {
    return selectedWarehouseShipments.filter((s: any) => ['returned'].includes(String(s.status || '').toLowerCase()));
  }, [selectedWarehouseShipments]);

  const handoverRows = useMemo(() => {
    return deliveryRows.filter((d: any) => ['assigned', 'out_for_delivery'].includes(String(d.status || '').toLowerCase()));
  }, [deliveryRows]);

  const inventoryBins = useMemo(() => {
    const bins = new Map<string, number>();
    selectedWarehouseShipments.forEach((s: any) => {
      const key =
        s.current_location?.bin ||
        s.current_location?.zone ||
        (selectedWarehouse?.code ? `${selectedWarehouse.code}-DEFAULT` : 'UNMAPPED');
      bins.set(key, (bins.get(key) || 0) + 1);
    });
    return Array.from(bins.entries()).map(([bin, count]) => ({ bin, count }));
  }, [selectedWarehouseShipments, selectedWarehouse?.code]);

  const scannedParcel = useMemo(() => {
    const q = scanValue.trim().toLowerCase();
    if (!q) return null;
    return selectedWarehouseShipments.find((s: any) => String(s.awb || '').toLowerCase() === q) || null;
  }, [scanValue, selectedWarehouseShipments]);

  const searchedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return selectedWarehouseShipments;
    return selectedWarehouseShipments.filter((s: any) =>
      String(s.awb || '').toLowerCase().includes(q) ||
      String(s.recipient?.name || '').toLowerCase().includes(q) ||
      String(s.recipient?.phone || '').toLowerCase().includes(q)
    );
  }, [search, selectedWarehouseShipments]);

  const metrics = useMemo(() => ({
    inbound: inboundRows.length,
    sorting: sortingRows.length,
    dispatch: dispatchRows.length,
    exceptions: exceptionRows.length,
    cod: selectedWarehouseShipments.reduce((sum: number, s: any) => sum + Number(s.cod_amount || 0), 0),
  }), [inboundRows.length, sortingRows.length, dispatchRows.length, exceptionRows.length, selectedWarehouseShipments]);

  function renderShipmentList(title: string, description: string, rows: any[]) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.map((row: any) => (
            <div key={row.id} className="rounded-2xl border p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant(row.status)}>{labelize(row.status)}</Badge>
                    <span className="font-semibold">{row.awb || row.shipment?.awb || row.id}</span>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">{row.recipient?.name || row.shipment?.recipient?.name || 'Unknown recipient'}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{row.recipient?.address?.street || row.recipient?.address || row.shipment?.recipient?.address?.street || row.shipment?.recipient?.address || '—'}</div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <div>{tt(language, 'COD', 'COD')}: {fmtCurrency(row.cod_amount || row.shipment?.cod_amount)}</div>
                  <div>{tt(language, 'Weight', 'အလေးချိန်')}: {safeWeight(row.package_details || row.shipment?.package_details)}</div>
                  <div>{tt(language, 'ETA', 'ETA')}: {fmtDate(row.expected_delivery_date || row.shipment?.expected_delivery_date)}</div>
                </div>
              </div>
            </div>
          ))}
          {!rows.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No records in this subsection.', 'ဤ subsection အတွင်း record မရှိပါ')}</div>}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{tt(language, 'Warehouse Hub Operations', 'Warehouse Hub Operations')}</h1>
          <p className="mt-2 text-muted-foreground">{tt(language, 'Inbound, sorting, dispatch, transfers, inventory, exceptions, returns, handover, QC, and reporting.', 'inbound, sorting, dispatch, transfer, inventory, exception, return, handover, QC နှင့် reporting')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select className="h-10 rounded-md border px-3 text-sm" value={selectedWarehouseId} onChange={(e) => setSelectedWarehouseId(e.target.value)}>
            {warehouses.map((wh: any) => (
              <option key={wh.id} value={wh.id}>{wh.name}</option>
            ))}
          </select>
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {tt(language, 'Refresh', 'ပြန်လည်ရယူမည်')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Inbound', 'Inbound')}</div><div className="mt-2 text-4xl font-semibold">{metrics.inbound}</div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Sorting Queue', 'Sorting Queue')}</div><div className="mt-2 text-4xl font-semibold">{metrics.sorting}</div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Dispatch Manifests', 'Dispatch Manifests')}</div><div className="mt-2 text-4xl font-semibold">{metrics.dispatch}</div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Exceptions', 'Exceptions')}</div><div className="mt-2 text-4xl font-semibold">{metrics.exceptions}</div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'COD in Hub', 'Hub အတွင်း COD')}</div><div className="mt-2 text-4xl font-semibold">{fmtCurrency(metrics.cod)}</div></CardContent></Card>
      </div>

      <div className="grid gap-2 rounded-2xl bg-muted p-1 md:grid-cols-5 xl:grid-cols-11">
        {Object.keys(VIEW_ROUTES).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setView(key);
              navigate(VIEW_ROUTES[key]);
            }}
            className={`rounded-xl px-3 py-3 text-sm font-semibold ${view === key ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
          >
            {key === 'inbound' && tt(language, 'Inbound', 'Inbound')}
            {key === 'sorting' && tt(language, 'Sorting', 'Sorting')}
            {key === 'dispatch' && tt(language, 'Dispatch', 'Dispatch')}
            {key === 'transfers' && tt(language, 'Transfers', 'Transfers')}
            {key === 'inventory' && tt(language, 'Inventory', 'Inventory')}
            {key === 'exceptions' && tt(language, 'Exceptions', 'Exceptions')}
            {key === 'returns' && tt(language, 'Returns', 'Returns')}
            {key === 'handover' && tt(language, 'Handover', 'Handover')}
            {key === 'scanqc' && tt(language, 'Scan & QC', 'Scan & QC')}
            {key === 'reports' && tt(language, 'Reports', 'Reports')}
            {key === 'profile' && tt(language, 'Profile', 'Profile')}
          </button>
        ))}
      </div>

      {view === 'inbound' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
          {renderShipmentList(
            tt(language, 'Inbound Intake', 'Inbound Intake'),
            tt(language, 'Incoming shipments for this warehouse.', 'ဤ warehouse သို့ဝင်လာသော shipments'),
            inboundRows
          )}
          <Card>
            <CardHeader>
              <CardTitle>{tt(language, 'Search Shipments', 'Shipments ရှာရန်')}</CardTitle>
              <CardDescription>{tt(language, 'Find an inbound record quickly by AWB or recipient.', 'AWB သို့မဟုတ် recipient ဖြင့် အလျင်အမြန်ရှာဖွေရန်')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tt(language, 'Search AWB, recipient, phone', 'AWB, recipient, phone ဖြင့်ရှာရန်')} />
              <div className="space-y-3">
                {searchedRows.slice(0, 8).map((row: any) => (
                  <div key={row.id} className="rounded-xl border p-3">
                    <div className="font-medium">{row.awb}</div>
                    <div className="text-sm text-muted-foreground">{row.recipient?.name || 'Unknown recipient'}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'sorting' && renderShipmentList(
        tt(language, 'Sorting Lane', 'Sorting Lane'),
        tt(language, 'Shipments currently moving through sorting and internal routing.', 'sorting နှင့် internal routing အတွင်းရှိ shipments'),
        sortingRows
      )}

      {view === 'dispatch' && (
        <Card>
          <CardHeader>
            <CardTitle>{tt(language, 'Dispatch Staging', 'Dispatch Staging')}</CardTitle>
            <CardDescription>{tt(language, 'Active manifests waiting to leave the warehouse.', 'warehouse မှ ထွက်ရန် စောင့်နေသော active manifests')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {dispatchRows.map((manifest: any) => (
              <div key={manifest.id} className="rounded-2xl border p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-semibold">{manifest.manifest_number}</div>
                    <div className="text-sm text-muted-foreground">{tt(language, 'Scheduled', 'စီစဉ်ချိန်')}: {fmtDate(manifest.scheduled_date)}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{tt(language, 'Shipments', 'shipment များ')}: {manifest.total_shipments || 0}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant(manifest.status)}>{labelize(manifest.status)}</Badge>
                    <span className="text-sm text-muted-foreground">{driverMap.get(manifest.driver_id)?.full_name || '—'}</span>
                  </div>
                </div>
              </div>
            ))}
            {!dispatchRows.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No dispatch manifests.', 'dispatch manifest မရှိပါ')}</div>}
          </CardContent>
        </Card>
      )}

      {view === 'transfers' && (
        <Card>
          <CardHeader>
            <CardTitle>{tt(language, 'Hub Transfers', 'Hub Transfers')}</CardTitle>
            <CardDescription>{tt(language, 'Vehicle-backed or route-planned transfer batches.', 'vehicle-backed သို့မဟုတ် route-planned transfer batches')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {transferRows.map((manifest: any) => (
              <div key={manifest.id} className="rounded-2xl border p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-semibold">{manifest.manifest_number}</div>
                    <div className="text-sm text-muted-foreground">{tt(language, 'Route data', 'Route data')}: {manifest.route_data || manifest.planned_route ? tt(language, 'Available', 'ရှိသည်') : tt(language, 'Not set', 'မသတ်မှတ်ရသေး')}</div>
                    <div className="text-sm text-muted-foreground">{tt(language, 'Vehicle', 'ယာဉ်')}: {manifest.vehicle_id || '—'}</div>
                  </div>
                  <Badge variant={statusVariant(manifest.status)}>{labelize(manifest.status)}</Badge>
                </div>
              </div>
            ))}
            {!transferRows.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No transfer-ready manifests.', 'transfer-ready manifest မရှိပါ')}</div>}
          </CardContent>
        </Card>
      )}

      {view === 'inventory' && (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>{tt(language, 'Bins & Inventory', 'Bins & Inventory')}</CardTitle>
              <CardDescription>{tt(language, 'Current parcel distribution by bin or location bucket.', 'bin/location အလိုက် parcel ခွဲဝေမှု')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {inventoryBins.map((bin: any) => (
                <div key={bin.bin} className="flex items-center justify-between rounded-xl border p-3">
                  <div className="font-medium">{bin.bin}</div>
                  <Badge variant="secondary">{bin.count}</Badge>
                </div>
              ))}
              {!inventoryBins.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No mapped bins found.', 'mapped bin မတွေ့ပါ')}</div>}
            </CardContent>
          </Card>
          {renderShipmentList(
            tt(language, 'Inventory Detail', 'Inventory Detail'),
            tt(language, 'Shipments currently held in this warehouse.', 'ဤ warehouse အတွင်း လက်ရှိရှိနေသော shipments'),
            selectedWarehouseShipments
          )}
        </div>
      )}

      {view === 'exceptions' && (
        <Card>
          <CardHeader>
            <CardTitle>{tt(language, 'Exception Management', 'Exception Management')}</CardTitle>
            <CardDescription>{tt(language, 'Failed deliveries and operational exception records.', 'failed deliveries နှင့် operational exception records')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {exceptionRows.map((row: any) => (
              <div key={row.id} className="rounded-2xl border p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="font-semibold">{row.shipment?.awb || row.id}</div>
                    <div className="text-sm text-muted-foreground">{row.shipment?.recipient?.name || 'Unknown recipient'} · {row.shipment?.recipient?.phone || '—'}</div>
                    <div className="mt-2 text-sm text-rose-600">{row.failure_reason || row.notes || '—'}</div>
                  </div>
                  <Badge variant="destructive">{labelize(row.status)}</Badge>
                </div>
              </div>
            ))}
            {!exceptionRows.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No exceptions.', 'exception မရှိပါ')}</div>}
          </CardContent>
        </Card>
      )}

      {view === 'returns' && renderShipmentList(
        tt(language, 'Returns / RTS', 'Returns / RTS'),
        tt(language, 'Returned shipments associated with this warehouse.', 'ဤ warehouse နှင့်သက်ဆိုင်သော returned shipments'),
        returnRows
      )}

      {view === 'handover' && (
        <Card>
          <CardHeader>
            <CardTitle>{tt(language, 'Rider Handover', 'Rider Handover')}</CardTitle>
            <CardDescription>{tt(language, 'Deliveries ready for release to riders/drivers.', 'rider/driver များထံ လွှဲပြောင်းရန် အသင့်ဖြစ်နေသော deliveries')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {handoverRows.map((row: any) => (
              <div key={row.id} className="rounded-2xl border p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-semibold">{row.shipment?.awb || row.id}</div>
                    <div className="text-sm text-muted-foreground">{row.driver?.full_name || 'Unassigned'} · {row.manifest?.manifest_number || 'No manifest'}</div>
                    <div className="text-sm text-muted-foreground">{tt(language, 'Assigned', 'ခန့်ထားချိန်')}: {fmtDate(row.assigned_at)}</div>
                  </div>
                  <Badge variant={statusVariant(row.status)}>{labelize(row.status)}</Badge>
                </div>
              </div>
            ))}
            {!handoverRows.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No handover-ready deliveries.', 'handover-ready deliveries မရှိပါ')}</div>}
          </CardContent>
        </Card>
      )}

      {view === 'scanqc' && (
        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>{tt(language, 'Scan & QC', 'Scan & QC')}</CardTitle>
              <CardDescription>{tt(language, 'Scan an AWB to inspect the current parcel state safely.', 'AWB scan လုပ်ပြီး parcel အခြေအနေကို ဘေးကင်းစွာကြည့်ရှုမည်')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={scanValue} onChange={(e) => setScanValue(e.target.value)} placeholder={tt(language, 'Enter or scan AWB', 'AWB ကိုထည့်ပါ သို့မဟုတ် scan လုပ်ပါ')} />
              </div>
              {scannedParcel && (
                <div className="rounded-2xl border p-4">
                  <div className="font-semibold">{scannedParcel.awb}</div>
                  <div className="mt-2 text-sm text-muted-foreground">{scannedParcel.recipient?.name || 'Unknown recipient'}</div>
                  <div className="mt-2"><Badge variant={statusVariant(scannedParcel.status)}>{labelize(scannedParcel.status)}</Badge></div>
                </div>
              )}
              {!scannedParcel && scanValue && <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{tt(language, 'No parcel matched this AWB.', 'ဤ AWB နှင့်ကိုက်ညီသော parcel မတွေ့ပါ')}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{tt(language, 'QC Output', 'QC Output')}</CardTitle>
              <CardDescription>{tt(language, 'Detailed parcel preview for scan result validation.', 'scan result validation အတွက် parcel အသေးစိတ် preview')}</CardDescription>
            </CardHeader>
            <CardContent>
              {scannedParcel ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border p-4"><div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">AWB</div><div className="mt-2 font-semibold">{scannedParcel.awb}</div></div>
                  <div className="rounded-xl border p-4"><div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{tt(language, 'Status', 'အခြေအနေ')}</div><div className="mt-2 font-semibold">{labelize(scannedParcel.status)}</div></div>
                  <div className="rounded-xl border p-4"><div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{tt(language, 'Recipient', 'လက်ခံသူ')}</div><div className="mt-2 font-semibold">{scannedParcel.recipient?.name || '—'}</div></div>
                  <div className="rounded-xl border p-4"><div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{tt(language, 'Weight', 'အလေးချိန်')}</div><div className="mt-2 font-semibold">{safeWeight(scannedParcel.package_details)}</div></div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'Scan a parcel to see QC detail.', 'QC detail ကြည့်ရန် parcel scan လုပ်ပါ')}</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'reports' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Inbound Volume', 'Inbound Volume')}</div><div className="mt-2 text-4xl font-semibold">{inboundRows.length}</div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Sorting Volume', 'Sorting Volume')}</div><div className="mt-2 text-4xl font-semibold">{sortingRows.length}</div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Dispatch Manifests', 'Dispatch Manifests')}</div><div className="mt-2 text-4xl font-semibold">{dispatchRows.length}</div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Exceptions', 'Exceptions')}</div><div className="mt-2 text-4xl font-semibold">{exceptionRows.length}</div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Returns', 'Returns')}</div><div className="mt-2 text-4xl font-semibold">{returnRows.length}</div></CardContent></Card>
        </div>
      )}

      {view === 'profile' && (
        <Card>
          <CardHeader>
            <CardTitle>{tt(language, 'Warehouse Profile', 'Warehouse Profile')}</CardTitle>
            <CardDescription>{tt(language, 'Operational metadata for the selected warehouse.', 'ရွေးချယ်ထားသော warehouse ၏ operational metadata')}</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedWarehouse && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{tt(language, 'No warehouse selected.', 'warehouse မရွေးထားပါ')}</div>}
            {selectedWarehouse && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4"><div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Name</div><div className="mt-2 font-semibold">{selectedWarehouse.name}</div></div>
                <div className="rounded-xl border p-4"><div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Code</div><div className="mt-2 font-semibold">{selectedWarehouse.code}</div></div>
                <div className="rounded-xl border p-4"><div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Type</div><div className="mt-2 font-semibold">{labelize(selectedWarehouse.type)}</div></div>
                <div className="rounded-xl border p-4"><div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Status</div><div className="mt-2 font-semibold">{labelize(selectedWarehouse.status)}</div></div>
                <div className="rounded-xl border p-4 md:col-span-2"><div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Address</div><div className="mt-2 font-semibold">{JSON.stringify(selectedWarehouse.address || {})}</div></div>
                <div className="rounded-xl border p-4 md:col-span-2"><div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{tt(language, 'Capacity', 'စွမ်းရည်')}</div><div className="mt-2 font-semibold">{JSON.stringify(selectedWarehouse.capacity || {})}</div></div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
TSX

echo "Patch files written."
