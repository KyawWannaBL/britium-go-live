import MasterDataCombobox from '@/components/shared/MasterDataCombobox';
import HistoricalDataSuggestions from '@/components/shared/HistoricalDataSuggestions';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  Map,
  Navigation,
  Play,
  RefreshCw,
  Search,
  Truck,
  UserPlus,
  XCircle,
} from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Wayplan = {
  id: string;
  wayplan_no: string;
  route_name: string;
  planned_date: string;
  status: string;
  declared_stops: number;
  declared_cod: number;
  google_maps_url: string;
  assigned_rider_name: string;
  assigned_driver_name: string;
  assigned_helper_name: string;
  assigned_vehicle_plate: string;
  dispatcher_note: string;
  created_at: string;
  updated_at: string;
};

type Stop = {
  id: string;
  wayplan_id: string;
  stop_seq: number;
  tracking_no: string;
  merchant_name: string;
  receiver_name: string;
  receiver_phone: string;
  township: string;
  address: string;
  cod_amount: number;
  delivery_fee: number;
  actual_kg: number;
  included_kg: number;
  extra_kg: number;
  extra_kg_rate: number;
  weight_fee: number;
  status: string;
  rider_name: string;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string;
  note: string;
  updated_at: string;
};

type Detail = {
  wayplan: Wayplan | null;
  summary: {
    stop_count: number;
    total_cod: number;
    delivered: number;
    exceptions: number;
  };
  stops: Stop[];
  events: Array<{
    id: string;
    action: string;
    old_status: string;
    new_status: string;
    note: string;
    created_at: string;
  }>;
  generated_at: string;
};

const EMPTY: Detail = {
  wayplan: null,
  summary: {
    stop_count: 0,
    total_cod: 0,
    delivered: 0,
    exceptions: 0,
  },
  stops: [],
  events: [],
  generated_at: '',
};

function formatMoney(value: number | string | null | undefined) {
  return `${Number(value || 0).toLocaleString()} MMK`;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = (status || 'pending').toLowerCase();

  if (['completed', 'delivered', 'resolved'].includes(normalized)) {
    return <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">{normalized}</span>;
  }

  if (['assigned', 'in_progress', 'in_transit', 'out_for_delivery', 'picked_up'].includes(normalized)) {
    return <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">{normalized}</span>;
  }

  if (['failed', 'exception', 'cancelled', 'refused', 'address_not_found'].includes(normalized)) {
    return <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">{normalized}</span>;
  }

  return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{normalized}</span>;
}

function mapsUrl(stop: Stop) {
  if (stop.google_maps_url) return stop.google_maps_url;
  if (stop.latitude && stop.longitude) return `https://www.google.com/maps/search/?api=1&query=${stop.latitude},${stop.longitude}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.address} ${stop.township}`)}`;
}

export default function WayplanDetailPage() {
  const { wayplanId } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<Detail>(EMPTY);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadDetail() {
    if (!wayplanId) return;

    setLoading(true);
    setError('');

    const { data, error: rpcError } = await supabase.rpc('be_delivery_wayplan_detail' as any, {
      p_wayplan_id: wayplanId,
    } as any);

    if (rpcError) {
      setError(rpcError.message);
      setDetail(EMPTY);
    } else {
      setDetail((data || EMPTY) as Detail);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wayplanId]);

  const filteredStops = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return detail.stops || [];

    return (detail.stops || []).filter((stop) =>
      [
        stop.tracking_no,
        stop.merchant_name,
        stop.receiver_name,
        stop.receiver_phone,
        stop.township,
        stop.address,
        stop.status,
        stop.rider_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [detail.stops, search]);

  async function assignWayplan() {
    if (!detail.wayplan) return;

    const riderName = window.prompt('Rider name', detail.wayplan.assigned_rider_name || '');
    if (riderName === null) return;

    const driverName = window.prompt('Driver name, optional', detail.wayplan.assigned_driver_name || '') || '';
    const helperName = window.prompt('Helper name, optional', detail.wayplan.assigned_helper_name || '') || '';
    const vehiclePlate = window.prompt('Vehicle plate, optional', detail.wayplan.assigned_vehicle_plate || '') || '';
    const note = window.prompt('Assignment note, optional', detail.wayplan.dispatcher_note || '') || '';

    setActionLoading('assign');
    setError('');
    setMessage('');

    const { error: rpcError } = await supabase.rpc('be_delivery_assign_wayplan' as any, {
      p_wayplan_id: detail.wayplan.id,
      p_rider_name: riderName,
      p_driver_name: driverName,
      p_helper_name: helperName,
      p_vehicle_plate: vehiclePlate,
      p_note: note,
    } as any);

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setMessage('Assignment saved.');
      await loadDetail();
    }

    setActionLoading('');
  }

  async function setWayplanStatus(status: string) {
    if (!detail.wayplan) return;

    const note = window.prompt(`Note for ${status}, optional`, '') || '';

    setActionLoading(status);
    setError('');
    setMessage('');

    const { error: rpcError } = await supabase.rpc('be_delivery_set_wayplan_status' as any, {
      p_wayplan_id: detail.wayplan.id,
      p_status: status,
      p_note: note,
    } as any);

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setMessage(`Wayplan changed to ${status}.`);
      await loadDetail();
    }

    setActionLoading('');
  }

  async function setStopStatus(stop: Stop, status: string) {
    const note = window.prompt(`Note for ${status}, optional`, stop.note || '') || '';

    setActionLoading(`${stop.id}-${status}`);
    setError('');
    setMessage('');

    const { error: rpcError } = await supabase.rpc('be_delivery_update_stop_status' as any, {
      p_stop_id: stop.id,
      p_status: status,
      p_note: note,
    } as any);

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setMessage(`${stop.tracking_no || 'Stop'} changed to ${status}.`);
      await loadDetail();
    }

    setActionLoading('');
  }

  function exportStops() {
    const rows = [
      [
        'Seq',
        'Tracking No',
        'Merchant',
        'Receiver',
        'Phone',
        'Township',
        'Address',
        'COD',
        'Delivery Fee',
        'Actual kg',
        'Included kg',
        'Extra kg',
        'Weight Fee',
        'Status',
        'Rider',
        'Note',
      ],
      ...filteredStops.map((stop) => [
        stop.stop_seq,
        stop.tracking_no,
        stop.merchant_name,
        stop.receiver_name,
        stop.receiver_phone,
        stop.township,
        stop.address,
        stop.cod_amount,
        stop.delivery_fee,
        stop.actual_kg,
        stop.included_kg,
        stop.extra_kg,
        stop.weight_fee,
        stop.status,
        stop.rider_name,
        stop.note,
      ]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${detail.wayplan?.wayplan_no || 'wayplan'}-stops.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex min-h-[500px] items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        Loading wayplan detail...
      </div>
    );
  }

  if (!detail.wayplan) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
        <p className="font-bold">Wayplan not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/delivery-workflow')}>
          Back to Delivery Workflow
        </Button>
      </div>
    );
  }

  const wayplan = detail.wayplan;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <Button variant="ghost" onClick={() => navigate('/delivery-workflow')} className="mb-2 px-0">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Delivery Workflow
          </Button>

          <h1 className="text-3xl font-black text-slate-950">{wayplan.wayplan_no}</h1>
          <p className="mt-1 text-slate-500">{wayplan.route_name}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <StatusBadge status={wayplan.status} />
            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">
              {wayplan.planned_date ? new Date(wayplan.planned_date).toLocaleDateString() : '-'}
            </span>
            <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">
              {formatMoney(detail.summary.total_cod)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadDetail} disabled={!!actionLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" onClick={exportStops}>
            <Download className="mr-2 h-4 w-4" />
            Export Stops
          </Button>
          <Button onClick={assignWayplan} disabled={!!actionLoading}>
            <UserPlus className="mr-2 h-4 w-4" />
            Assign/Edit
          </Button>
          <Button variant="outline" onClick={() => setWayplanStatus('in_progress')} disabled={!!actionLoading}>
            <Play className="mr-2 h-4 w-4" />
            Start
          </Button>
          <Button onClick={() => setWayplanStatus('completed')} disabled={!!actionLoading}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Complete
          </Button>
          <Button variant="destructive" onClick={() => setWayplanStatus('cancelled')} disabled={!!actionLoading}>
            <XCircle className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        </div>
      </div>

      {(message || error) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
            error
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {error || message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Stops</p>
          <p className="mt-2 text-3xl font-black">{detail.summary.stop_count}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Delivered</p>
          <p className="mt-2 text-3xl font-black">{detail.summary.delivered}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Exceptions</p>
          <p className="mt-2 text-3xl font-black">{detail.summary.exceptions}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total COD</p>
          <p className="mt-2 text-2xl font-black">{formatMoney(detail.summary.total_cod)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 text-sm md:grid-cols-4">
          <div><span className="font-bold">Rider:</span> {wayplan.assigned_rider_name || '-'}</div>
          <div><span className="font-bold">Driver:</span> {wayplan.assigned_driver_name || '-'}</div>
          <div><span className="font-bold">Helper:</span> {wayplan.assigned_helper_name || '-'}</div>
          <div><span className="font-bold">Vehicle:</span> {wayplan.assigned_vehicle_plate || '-'}</div>
        </div>
        {wayplan.dispatcher_note && (
          <p className="mt-3 text-sm text-slate-500">
            <span className="font-bold">Note:</span> {wayplan.dispatcher_note}
          </p>
        )}
      </div>

      <div className="relative max-w-2xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search stop, tracking, receiver, phone, township..."
          className="pl-10"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <h2 className="text-lg font-black">All Stops</h2>
          <p className="text-sm text-slate-500">
            This is the dedicated route detail screen opened from the Delivery Workflow Open button.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px] text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">Seq</th>
                <th className="px-4 py-3">Tracking</th>
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Receiver</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Township</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">COD</th>
                <th className="px-4 py-3">Weight</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredStops.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-slate-500">
                    No stops found for this wayplan.
                  </td>
                </tr>
              ) : (
                filteredStops.map((stop) => (
                  <tr key={stop.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{stop.stop_seq || '-'}</td>
                    <td className="px-4 py-3 font-mono font-bold">{stop.tracking_no || '-'}</td>
                    <td className="px-4 py-3">{stop.merchant_name || '-'}</td>
                    <td className="px-4 py-3">{stop.receiver_name || '-'}</td>
                    <td className="px-4 py-3">{stop.receiver_phone || '-'}</td>
                    <td className="px-4 py-3">{stop.township || '-'}</td>
                    <td className="max-w-sm truncate px-4 py-3" title={stop.address}>{stop.address || '-'}</td>
                    <td className="px-4 py-3 font-semibold">{formatMoney(stop.cod_amount)}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs">
                        <div>Actual: {stop.actual_kg || 0} kg</div>
                        <div>Included: {stop.included_kg || 0} kg</div>
                        <div>Weight fee: {formatMoney(stop.weight_fee)}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={stop.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <a
                          href={mapsUrl(stop)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-xs font-bold hover:bg-accent"
                        >
                          <Navigation className="mr-1 h-3 w-3" />
                          Maps
                        </a>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!actionLoading}
                          onClick={() => setStopStatus(stop, 'picked_up')}
                        >
                          <Truck className="mr-1 h-3 w-3" />
                          Picked
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!actionLoading}
                          onClick={() => setStopStatus(stop, 'in_transit')}
                        >
                          <Map className="mr-1 h-3 w-3" />
                          Transit
                        </Button>
                        <Button
                          size="sm"
                          disabled={!!actionLoading}
                          onClick={() => setStopStatus(stop, 'delivered')}
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Delivered
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={!!actionLoading}
                          onClick={() => setStopStatus(stop, 'failed')}
                        >
                          <XCircle className="mr-1 h-3 w-3" />
                          Failed
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detail.events.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-black">Route Activity</h2>
          <div className="space-y-2">
            {detail.events.slice(0, 10).map((event) => (
              <div key={event.id} className="rounded-xl border border-slate-100 p-3 text-sm">
                <div className="flex flex-col justify-between gap-1 md:flex-row">
                  <p className="font-bold">
                    {event.action}: {event.old_status || '-'} → {event.new_status || '-'}
                  </p>
                  <p className="text-xs text-slate-400">{new Date(event.created_at).toLocaleString()}</p>
                </div>
                {event.note && <p className="mt-1 text-slate-500">{event.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
