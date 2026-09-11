// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Printer, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/useLanguage';
import { getPortalBanner } from '@/lib/portalBanner';
import { addressText, safeText } from '@/lib/displayValue';
import { PortalBanner } from '@/components/portal/PortalBanner';
import { MapboxRoutePanel } from '@/components/workflow/MapboxRoutePanel';
import { QrStepActionCard } from '@/components/workflow/QrStepActionCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function tt(language: string, en: string, mm: string) {
  return language === 'mm' ? mm : en;
}
function currentView(pathname: string) {
  if (pathname.includes('/manifests')) return 'manifests';
  if (pathname.includes('/vehicles')) return 'vehicles';
  if (pathname.includes('/ways')) return 'ways';
  if (pathname.includes('/waybills')) return 'waybills';
  return 'optimize';
}
function labelize(value: unknown) {
  return String(value || 'unknown').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function WayplanPortal() {
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useState(currentView(location.pathname));
  const [loading, setLoading] = useState(true);
  const [manifests, setManifests] = useState<any[]>([]);
  const [manifestItems, setManifestItems] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [staffRows, setStaffRows] = useState<any[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);

  useEffect(() => setView(currentView(location.pathname)), [location.pathname]);

  async function loadData() {
    setLoading(true);
    try {
      const [m, mi, s, v, st] = await Promise.all([
        supabase.from('manifests').select('*').order('scheduled_date', { ascending: false }),
        supabase.from('manifest_items').select('*'),
        supabase.from('shipments').select('*').order('created_at', { ascending: false }),
        supabase.from('vehicle_master').select('*').order('vehicle_code', { ascending: true }),
        supabase.from('staff_master').select('*').order('full_name', { ascending: true }),
      ]);
      if (m.error) throw m.error;
      if (mi.error) throw mi.error;
      if (s.error) throw s.error;
      if (v.error) throw v.error;
      if (st.error) throw st.error;
      setManifests(m.data || []);
      setManifestItems(mi.data || []);
      setShipments(s.data || []);
      setVehicles(v.data || []);
      setStaffRows(st.data || []);
      if (!selectedShipmentId && s.data?.length) setSelectedShipmentId(s.data[0].id);
    } catch (e) {
      console.error(e);
      setManifests([]);
      setManifestItems([]);
      setShipments([]);
      setVehicles([]);
      setStaffRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const selectedShipment = shipments.find((s: any) => s.id === selectedShipmentId) || null;
  const selectedManifest = manifests[0] || null;

  async function optimizeManifest(manifestId: string) {
    const items = (manifestItems || []).filter((x: any) => x.manifest_id === manifestId);
    const shipmentMap = new Map(shipments.map((s: any) => [s.id, s]));
    const sorted = items
      .map((x: any) => ({ ...x, shipment: shipmentMap.get(x.shipment_id) }))
      .sort((a: any, b: any) => {
        const aa = String(a.shipment?.recipient?.address?.city || '');
        const bb = String(b.shipment?.recipient?.address?.city || '');
        return aa.localeCompare(bb);
      })
      .map((x: any, i: number) => ({
        stop: i + 1,
        shipment_id: x.shipment_id,
        awb: x.shipment?.awb || '',
        recipient: x.shipment?.recipient?.name || '',
        city: x.shipment?.recipient?.address?.city || '',
      }));

    const { error } = await supabase
      .from('manifests')
      .update({
        planned_route: { optimized_at: new Date().toISOString(), stops: sorted },
        route_data: { optimized_at: new Date().toISOString(), stops: sorted },
        updated_at: new Date().toISOString(),
      })
      .eq('id', manifestId);

    if (error) throw error;
    await loadData();
  }

  return (
    <div className="space-y-6">
      <PortalBanner
        image={getPortalBanner(view === 'manifests' ? 'wayplan_manifests' : view === 'vehicles' ? 'wayplan_vehicles' : view === 'ways' ? 'wayplan_ways' : view === 'waybills' ? 'wayplan_waybills' : 'wayplan')}
        title={tt(language, 'Wayplan Manager', 'Wayplan Manager')}
        subtitle={tt(language, 'Route optimization, manifests, vehicle assignment, way management, and waybill printing.', 'route optimization, manifest, vehicle assignment, way management နှင့် waybill printing')}
      >
        <Button variant="outline" onClick={loadData} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {tt(language, 'Refresh', 'ပြန်လည်ရယူမည်')}
        </Button>
      </PortalBanner>

      <div className="grid gap-2 rounded-2xl bg-muted p-1 md:grid-cols-5">
        <button className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === 'optimize' ? 'bg-background shadow-sm' : ''}`} onClick={() => navigate('/wayplan/optimize')}>{tt(language, 'Optimization', 'Optimization')}</button>
        <button className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === 'manifests' ? 'bg-background shadow-sm' : ''}`} onClick={() => navigate('/wayplan/manifests')}>{tt(language, 'Manifests', 'Manifest')}</button>
        <button className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === 'vehicles' ? 'bg-background shadow-sm' : ''}`} onClick={() => navigate('/wayplan/vehicles')}>{tt(language, 'Vehicles', 'Vehicles')}</button>
        <button className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === 'ways' ? 'bg-background shadow-sm' : ''}`} onClick={() => navigate('/wayplan/ways')}>{tt(language, 'Ways', 'Ways')}</button>
        <button className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === 'waybills' ? 'bg-background shadow-sm' : ''}`} onClick={() => navigate('/wayplan/waybills')}>{tt(language, 'Waybill Print', 'Waybill Print')}</button>
      </div>

      {view === 'optimize' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
          <Card>
            <CardHeader>
              <CardTitle>{tt(language, 'Optimize Manifests', 'Manifest များကို Optimize လုပ်ရန်')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {manifests.map((row: any) => (
                <div key={row.id} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{safeText(row.manifest_number)}</div>
                      <div className="text-sm text-muted-foreground">{labelize(row.status)}</div>
                    </div>
                    <Button onClick={() => optimizeManifest(row.id)}>{tt(language, 'Optimize', 'Optimize')}</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <MapboxRoutePanel
            title={tt(language, 'Selected Route Preview', 'ရွေးထားသော Route Preview')}
            destinationAddress={selectedShipment?.recipient?.address}
            destinationCoord={selectedShipment?.recipient?.coordinates || null}
          />
        </div>
      )}

      {view === 'manifests' && (
        <Card>
          <CardHeader><CardTitle>{tt(language, 'Manifest List', 'Manifest List')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {manifests.map((row: any) => (
              <div key={row.id} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{safeText(row.manifest_number)}</div>
                    <div className="text-sm text-muted-foreground">{labelize(row.status)}</div>
                  </div>
                  <Badge>{labelize(row.status)}</Badge>
                </div>
                <div className="mt-3">
                  <QrStepActionCard
                    title={tt(language, 'Manifest QR Step', 'Manifest QR Step')}
                    processStep="wayplan_manifest_release"
                    manifestId={row.id}
                    staffRows={staffRows}
                    onDone={loadData}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {view === 'vehicles' && (
        <Card>
          <CardHeader><CardTitle>{tt(language, 'Vehicle Assignment', 'Vehicle Assignment')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {vehicles.map((row: any) => (
              <div key={row.id} className="rounded-xl border p-4">
                <div className="font-semibold">{safeText(row.display_name, row.vehicle_code)}</div>
                <div className="text-sm text-muted-foreground">{safeText(row.vehicle_type)} · {safeText(row.registration_no)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {view === 'ways' && (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader><CardTitle>{tt(language, 'Shipment Ways', 'Shipment Ways')}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {shipments.map((row: any) => (
                <button key={row.id} type="button" className={`w-full rounded-xl border p-3 text-left ${selectedShipmentId === row.id ? 'border-primary bg-primary/5' : ''}`} onClick={() => setSelectedShipmentId(row.id)}>
                  <div className="font-medium">{safeText(row.awb)}</div>
                  <div className="text-sm text-muted-foreground">{safeText(row.recipient?.name)}</div>
                </button>
              ))}
            </CardContent>
          </Card>

          <MapboxRoutePanel
            title={tt(language, 'Way Mapbox Preview', 'Way Mapbox Preview')}
            destinationAddress={selectedShipment?.recipient?.address}
            destinationCoord={selectedShipment?.recipient?.coordinates || null}
          />
        </div>
      )}

      {view === 'waybills' && (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>{tt(language, 'Shipment List', 'Shipment List')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {shipments.map((row: any) => (
                <button key={row.id} type="button" className={`w-full rounded-xl border p-3 text-left ${selectedShipmentId === row.id ? 'border-primary bg-primary/5' : ''}`} onClick={() => setSelectedShipmentId(row.id)}>
                  <div className="font-medium">{safeText(row.awb)}</div>
                  <div className="text-sm text-muted-foreground">{safeText(row.recipient?.name)}</div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card id="waybill-print-card">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>{tt(language, 'Printable Waybill', 'Printable Waybill')}</CardTitle>
                <CardDescription>{tt(language, 'Live shipment print layout.', 'live shipment print layout')}</CardDescription>
              </div>
              <Button onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                {tt(language, 'Print', 'ပုံနှိပ်မည်')}
              </Button>
            </CardHeader>
            <CardContent>
              {!selectedShipment && <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">{tt(language, 'Select a shipment.', 'shipment တစ်ခုရွေးပါ')}</div>}
              {selectedShipment && (
                <div className="rounded-2xl border bg-white p-8 text-slate-900">
                  <div className="flex items-start justify-between gap-6 border-b pb-6">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Britium Express</div>
                      <div className="mt-2 text-3xl font-black">WAYBILL</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-slate-500">AWB</div>
                      <div className="text-3xl font-black">{safeText(selectedShipment.awb)}</div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-6 md:grid-cols-2">
                    <div className="rounded-2xl border p-4">
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{tt(language, 'Sender', 'ပို့သူ')}</div>
                      <div className="mt-3 space-y-1">
                        <div className="font-semibold">{safeText(selectedShipment.sender?.name)}</div>
                        <div className="text-sm text-slate-600">{safeText(selectedShipment.sender?.phone)}</div>
                        <div className="text-sm text-slate-600">{addressText(selectedShipment.sender?.address)}</div>
                      </div>
                    </div>

                    <div className="rounded-2xl border p-4">
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{tt(language, 'Recipient', 'လက်ခံသူ')}</div>
                      <div className="mt-3 space-y-1">
                        <div className="font-semibold">{safeText(selectedShipment.recipient?.name)}</div>
                        <div className="text-sm text-slate-600">{safeText(selectedShipment.recipient?.phone)}</div>
                        <div className="text-sm text-slate-600">{addressText(selectedShipment.recipient?.address)}</div>
                      </div>
                    </div>
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
