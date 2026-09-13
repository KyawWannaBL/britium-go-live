// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MapPin, Printer, RefreshCw, Route, Truck } from 'lucide-react';
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
function normalized(value: unknown) {
  return String(value || '').toLowerCase().replace(/[.(),\-_]/g, ' ').replace(/\s+/g, ' ').trim();
}
function townshipOf(shipment: any) {
  return safeText(
    shipment?.recipient?.address?.township,
    shipment?.recipient?.township,
    shipment?.receiver_township,
    shipment?.delivery_township,
    shipment?.township,
  );
}
function coordOf(shipment: any) {
  const c = shipment?.recipient?.coordinates || shipment?.recipient?.address?.coordinates || shipment?.coordinates || null;
  const lat = Number(c?.lat ?? c?.latitude ?? shipment?.latitude ?? shipment?.lat);
  const lng = Number(c?.lng ?? c?.longitude ?? shipment?.longitude ?? shipment?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

const HUB = 'East Dagon Logistics Center';

const TOWNSHIP_ALIASES: Record<string, string> = {
  'east dagon': 'East Dagon',
  'dagon myothit east': 'East Dagon',
  'ဒဂုံမြို့သစ် အရှေ့ပိုင်း': 'East Dagon',
  'အရှေ့ဒဂုံ': 'East Dagon',
  'north dagon': 'North Dagon',
  'dagon myothit north': 'North Dagon',
  'ဒဂုံမြို့သစ် မြောက်ပိုင်း': 'North Dagon',
  'မြောက်ဒဂုံ': 'North Dagon',
  'south dagon': 'South Dagon',
  'dagon myothit south': 'South Dagon',
  'ဒဂုံမြို့သစ် တောင်ပိုင်း': 'South Dagon',
  'တောင်ဒဂုံ': 'South Dagon',
  'dagon seikkan': 'Dagon Seikkan',
  'thingangyun': 'Thingangyun',
  'south okkalapa': 'South Okkalapa',
  'north okkalapa': 'North Okkalapa',
  'yankin': 'Yankin',
  'tarmwe': 'Tarmwe',
  'tamwe': 'Tarmwe',
  'bahan': 'Bahan',
  'thaketa': 'Thaketa',
  'dawbon': 'Dawbon',
  'kyauktada': 'Kyauktada',
  'pabedan': 'Pabedan',
  'latha': 'Latha',
  'lanmadaw': 'Lanmadaw',
  'botahtaung': 'Botahtaung',
  'pazundaung': 'Pazundaung',
  'dagon': 'Dagon',
  'sanchaung': 'Sanchaung',
  'ahlone': 'Ahlone',
  'kyimyindaing': 'Kyimyindaing',
  'hlaing': 'Hlaing',
  'kamayut': 'Kamayut',
  'kamaryut': 'Kamayut',
  'mayangone': 'Mayangone',
  'inseIn': 'Insein',
  'insein': 'Insein',
  'mingaladon': 'Mingaladon',
  'shwepyitha': 'Shwepyitha',
  'hlaingthaya': 'Hlaingthaya',
  'hlaing tharyar': 'Hlaingthaya',
};

function canonicalTownship(value: unknown) {
  const raw = safeText(value);
  if (!raw) return '';
  const key = normalized(raw);
  return TOWNSHIP_ALIASES[key] || raw;
}

const STANDARD_ZONES = [
  {
    id: 'Z1',
    name: 'Zone 1: East Core',
    townships: ['East Dagon', 'North Dagon', 'South Dagon', 'Dagon Seikkan'],
    vehicle: '1.5-Ton Box Van',
    dispatch: '08:30',
    strategy: 'Micro-routing within wards. Home-zone vehicle handles bulkier B2B and dense residential drops close to the East Dagon hub.',
    order: ['East Dagon', 'Dagon Seikkan', 'South Dagon', 'North Dagon'],
  },
  {
    id: 'Z2',
    name: 'Zone 2: North-East Corridor',
    townships: ['Thingangyun', 'South Okkalapa', 'North Okkalapa', 'Yankin'],
    vehicle: '1-Ton Delivery Van',
    dispatch: '09:00',
    strategy: 'Use No. 2 Highway to Thanthumar Road or Waizayantar Road. Progress from South Okkalapa toward North Okkalapa.',
    order: ['South Okkalapa', 'Thingangyun', 'Yankin', 'North Okkalapa'],
  },
  {
    id: 'Z3',
    name: 'Zone 3: Central-East Corridor',
    townships: ['Tarmwe', 'Bahan', 'Thaketa', 'Dawbon'],
    vehicle: '1-Ton Light Van',
    dispatch: '09:00',
    strategy: 'Access via Yaza Dirit Road, service Thaketa/Dawbon first, loop through Tarmwe and finish in Bahan.',
    order: ['Thaketa', 'Dawbon', 'Tarmwe', 'Bahan'],
  },
  {
    id: 'Z4',
    name: 'Zone 4: Downtown, CBD & Inner West',
    townships: ['Kyauktada', 'Pabedan', 'Latha', 'Lanmadaw', 'Botahtaung', 'Pazundaung', 'Dagon', 'Sanchaung', 'Ahlone', 'Kyimyindaing'],
    vehicle: 'High-Roof Compact Van',
    dispatch: '08:00',
    strategy: 'Use Lower Pazundaung Road to Strand Road; Strand Road is the downtown spine, then sweep through Ahlone and Kyimyindaing.',
    order: ['Botahtaung', 'Pazundaung', 'Kyauktada', 'Pabedan', 'Latha', 'Lanmadaw', 'Dagon', 'Sanchaung', 'Ahlone', 'Kyimyindaing'],
  },
  {
    id: 'Z5',
    name: 'Zone 5: West & North Gateway',
    townships: ['Hlaing', 'Kamayut', 'Mayangone', 'Insein', 'Mingaladon', 'Shwepyitha', 'Hlaingthaya'],
    vehicle: '1.5-Ton High-Capacity Cargo Van',
    dispatch: '08:30',
    strategy: 'Use No. 3 Highway / Khayay Pin Road or Bayintnaung Bridge. Clear the outer arc first, then sweep back toward Hlaing/Kamayut/Mayangone.',
    order: ['Mingaladon', 'Insein', 'Shwepyitha', 'Hlaingthaya', 'Hlaing', 'Kamayut', 'Mayangone'],
  },
];

const LOW_ZONES = [
  {
    id: 'A',
    name: 'Super-Zone A: East & North-East',
    townships: ['East Dagon', 'North Dagon', 'South Dagon', 'Dagon Seikkan', 'Thingangyun', 'South Okkalapa', 'North Okkalapa', 'Yankin'],
    vehicle: '1.5-Ton Box Van',
    dispatch: '08:30',
    strategy: 'Service the Dagon home zone first, then continue into the Okkalapa/Thingangyun residential arc.',
    order: ['East Dagon', 'Dagon Seikkan', 'South Dagon', 'North Dagon', 'South Okkalapa', 'Thingangyun', 'Yankin', 'North Okkalapa'],
  },
  {
    id: 'B',
    name: 'Super-Zone B: Complete Urban Core',
    townships: ['Thaketa', 'Dawbon', 'Tarmwe', 'Bahan', 'Kyauktada', 'Pabedan', 'Latha', 'Lanmadaw', 'Botahtaung', 'Pazundaung', 'Dagon', 'Sanchaung', 'Ahlone', 'Kyimyindaing'],
    vehicle: '1-Ton High-Roof Van',
    dispatch: '08:00',
    strategy: 'Direct transit to Thaketa/Dawbon, then use Lay Daung Kan / Bogyoke Aung San Road through Tarmwe into Downtown and finish in Inner West.',
    order: ['Thaketa', 'Dawbon', 'Tarmwe', 'Bahan', 'Botahtaung', 'Pazundaung', 'Kyauktada', 'Pabedan', 'Latha', 'Lanmadaw', 'Dagon', 'Sanchaung', 'Ahlone', 'Kyimyindaing'],
  },
  {
    id: 'C',
    name: 'Super-Zone C: Outer Western/Northern Arc',
    townships: ['Hlaing', 'Kamayut', 'Mayangone', 'Insein', 'Mingaladon', 'Shwepyitha', 'Hlaingthaya'],
    vehicle: '1.5-Ton Cargo Van',
    dispatch: '08:30',
    strategy: 'Keep the long-distance outer ring isolated. Service Mingaladon/Insein first, descend through Hlaing/Kamayut, and cross to Hlaingthaya last.',
    order: ['Mingaladon', 'Insein', 'Shwepyitha', 'Mayangone', 'Hlaing', 'Kamayut', 'Hlaingthaya'],
  },
];

const HIGH_ZONES = [
  { id: 'R1', name: 'Route 1: East Dagon & Dagon Seikkan', townships: ['East Dagon', 'Dagon Seikkan'], vehicle: 'Van', dispatch: '08:30', strategy: 'Heavy industrial/B2B and home-zone drops.', order: ['East Dagon', 'Dagon Seikkan'] },
  { id: 'R2', name: 'Route 2: North Dagon & South Dagon', townships: ['North Dagon', 'South Dagon'], vehicle: 'Van', dispatch: '08:30', strategy: 'Dense residential e-commerce drops.', order: ['South Dagon', 'North Dagon'] },
  { id: 'R3', name: 'Route 3: South Okkalapa & Thingangyun', townships: ['South Okkalapa', 'Thingangyun'], vehicle: 'Van', dispatch: '09:00', strategy: 'Mid-city residential transit.', order: ['South Okkalapa', 'Thingangyun'] },
  { id: 'R4', name: 'Route 4: North Okkalapa & Yankin', townships: ['North Okkalapa', 'Yankin'], vehicle: 'Van', dispatch: '09:00', strategy: 'Airport/residential arc.', order: ['Yankin', 'North Okkalapa'] },
  { id: 'R5', name: 'Route 5: Central & Peninsula Loop', townships: ['Thaketa', 'Dawbon', 'Tarmwe', 'Bahan'], vehicle: 'Van', dispatch: '09:00', strategy: 'Eastern bridge traffic and central commercial hubs.', order: ['Thaketa', 'Dawbon', 'Tarmwe', 'Bahan'] },
  { id: 'R6', name: 'Route 6: Downtown Core', townships: ['Kyauktada', 'Pabedan', 'Latha', 'Lanmadaw', 'Botahtaung', 'Pazundaung'], vehicle: 'Bulk Cargo Van / Mobile Hub', dispatch: '08:00', strategy: 'Use Strand Road mobile-hub concept for CBD.', order: ['Botahtaung', 'Pazundaung', 'Kyauktada', 'Pabedan', 'Latha', 'Lanmadaw'] },
  { id: 'R7', name: 'Route 7: Inner West', townships: ['Sanchaung', 'Ahlone', 'Kyimyindaing', 'Dagon'], vehicle: 'Light Unit', dispatch: '08:00', strategy: 'Rapid Inner West sweep, separated from CBD gridlock.', order: ['Dagon', 'Sanchaung', 'Ahlone', 'Kyimyindaing'] },
  { id: 'R8', name: 'Route 8: Outer Residential', townships: ['Hlaing', 'Kamayut', 'Mayangone', 'Insein', 'Mingaladon'], vehicle: 'Van', dispatch: '08:30', strategy: 'Outer residential arc.', order: ['Mingaladon', 'Insein', 'Mayangone', 'Hlaing', 'Kamayut'] },
  { id: 'R9', name: 'Route 9: Industrial Gateway', townships: ['Hlaingthaya', 'Shwepyitha'], vehicle: 'Heavy Cargo Van', dispatch: '08:30', strategy: 'Dedicated industrial/heavy commercial route across Aung Zeya / Bayintnaung bridges.', order: ['Shwepyitha', 'Hlaingthaya'] },
];

function planForCount(count: number) {
  if (count < 45) return { option: 2, label: 'LOW-VOLUME CONSOLIDATION', zones: LOW_ZONES };
  if (count <= 95) return { option: 1, label: 'STANDARD 5-ZONE BASELINE', zones: STANDARD_ZONES };
  return { option: 3, label: 'HIGH-VOLUME 9-ROUTE EXPANSION', zones: HIGH_ZONES };
}

function haversine(a: any, b: any) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function orderZoneStops(rows: any[], townshipOrder: string[]) {
  const idx = new Map(townshipOrder.map((t, i) => [t, i]));
  const grouped = [...rows].sort((a, b) => (idx.get(a.township) ?? 999) - (idx.get(b.township) ?? 999));
  const output: any[] = [];
  for (const township of townshipOrder) {
    const bucket = grouped.filter((x) => x.township === township);
    if (!bucket.length) continue;
    const pending = [...bucket];
    let current = pending.shift();
    if (!current) continue;
    output.push(current);
    while (pending.length) {
      const currentCoord = coordOf(current.shipment);
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      pending.forEach((candidate, i) => {
        const d = haversine(currentCoord, coordOf(candidate.shipment));
        if (d < bestDistance) {
          bestDistance = d;
          bestIndex = i;
        }
      });
      current = pending.splice(bestIndex, 1)[0];
      output.push(current);
    }
  }
  grouped.filter((x) => !townshipOrder.includes(x.township)).forEach((x) => output.push(x));
  return output;
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
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

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
  const selectedPlan = selectedManifest?.planned_route || selectedManifest?.route_data || null;

  async function optimizeManifest(manifestId: string) {
    const items = (manifestItems || []).filter((x: any) => x.manifest_id === manifestId);
    const shipmentMap = new Map(shipments.map((s: any) => [s.id, s]));
    const source = items.map((x: any) => {
      const shipment = shipmentMap.get(x.shipment_id);
      return {
        ...x,
        shipment,
        township: canonicalTownship(townshipOf(shipment)),
      };
    });

    const plan = planForCount(source.length);
    const assignedIds = new Set<string>();
    const routes = plan.zones.map((zone: any) => {
      const rows = source.filter((x: any) => zone.townships.includes(x.township));
      rows.forEach((x: any) => assignedIds.add(x.shipment_id));
      const ordered = orderZoneStops(rows, zone.order);
      return {
        route_id: zone.id,
        route_name: zone.name,
        vehicle_type: zone.vehicle,
        dispatch_window: zone.dispatch,
        routing_strategy: zone.strategy,
        townships: zone.townships,
        parcel_count: ordered.length,
        stops: ordered.map((x: any, i: number) => ({
          stop: i + 1,
          shipment_id: x.shipment_id,
          awb: x.shipment?.awb || '',
          recipient: x.shipment?.recipient?.name || x.shipment?.receiver_name || '',
          township: x.township,
          address: addressText(x.shipment?.recipient?.address) || safeText(x.shipment?.receiver_address),
          coordinates: coordOf(x.shipment),
        })),
      };
    });

    const unassigned = source.filter((x: any) => !assignedIds.has(x.shipment_id));
    if (unassigned.length) {
      routes.push({
        route_id: 'REVIEW',
        route_name: 'Manual Review / Out-of-Scope Yangon',
        vehicle_type: 'Manual assignment required',
        dispatch_window: '-',
        routing_strategy: 'Excluded from automatic Yangon zoning until township is corrected or explicitly approved.',
        townships: [],
        parcel_count: unassigned.length,
        stops: unassigned.map((x: any, i: number) => ({
          stop: i + 1,
          shipment_id: x.shipment_id,
          awb: x.shipment?.awb || '',
          recipient: x.shipment?.recipient?.name || x.shipment?.receiver_name || '',
          township: x.township || 'Unknown',
          address: addressText(x.shipment?.recipient?.address) || safeText(x.shipment?.receiver_address),
          coordinates: coordOf(x.shipment),
        })),
      });
    }

    const payload = {
      optimized_at: new Date().toISOString(),
      hub: HUB,
      parcel_count: source.length,
      plan_option: plan.option,
      plan_label: plan.label,
      thresholds: { low: '<45', standard: '45-95', high: '>95' },
      routes,
    };

    const { error } = await supabase
      .from('manifests')
      .update({ planned_route: payload, route_data: payload, updated_at: new Date().toISOString() })
      .eq('id', manifestId);

    if (error) throw error;
    setSelectedRouteId(routes.find((r: any) => r.parcel_count > 0)?.route_id || null);
    await loadData();
  }

  const previewShipment = useMemo(() => {
    if (!selectedPlan?.routes?.length) return selectedShipment;
    const route = selectedPlan.routes.find((r: any) => r.route_id === selectedRouteId) || selectedPlan.routes.find((r: any) => r.parcel_count > 0);
    const first = route?.stops?.[0];
    return first ? shipments.find((s: any) => s.id === first.shipment_id) || selectedShipment : selectedShipment;
  }, [selectedPlan, selectedRouteId, shipments, selectedShipment]);

  const waybillTownship = canonicalTownship(townshipOf(selectedShipment));

  return (
    <div className="space-y-6">
      <style>{`
        #waybill-4x6-preview { width: 4in; height: 6in; box-sizing: border-box; }
        @media screen {
          #waybill-4x6-preview { max-width: 100%; margin: 0 auto; }
        }
        @media print {
          @page { size: 4in 6in; margin: 0; }
          html, body { width: 4in !important; height: 6in !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          #waybill-4x6-preview, #waybill-4x6-preview * { visibility: visible !important; }
          #waybill-4x6-preview {
            position: fixed !important;
            inset: 0 auto auto 0 !important;
            width: 4in !important;
            height: 6in !important;
            min-width: 4in !important;
            min-height: 6in !important;
            max-width: 4in !important;
            max-height: 6in !important;
            margin: 0 !important;
            padding: 0.14in !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            transform: none !important;
            overflow: hidden !important;
            background: #fff !important;
          }
          [data-print-hide='true'] { display: none !important; }
        }
      `}</style>

      <PortalBanner
        image={getPortalBanner(view === 'manifests' ? 'wayplan_manifests' : view === 'vehicles' ? 'wayplan_vehicles' : view === 'ways' ? 'wayplan_ways' : view === 'waybills' ? 'wayplan_waybills' : 'wayplan')}
        title={tt(language, 'Wayplan Manager', 'Wayplan Manager')}
        subtitle={tt(language, 'Yangon volume-aware fleet planning, route zoning, manifests, vehicle assignment, and 4×6 waybill printing.', 'ရန်ကုန် fleet planning, route zoning, manifest, vehicle assignment နှင့် 4×6 waybill printing')}
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
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Route className="h-5 w-5" /> Yangon Delivery Automation</CardTitle>
              <CardDescription>
                East Dagon Hub · &lt;45 parcels = 3 super-zones · 45–95 = 5-zone baseline · &gt;95 = 9-route expansion. Dala, Seikkyi Kanaungto and Thanlyin are outside this automatic plan.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {manifests.map((row: any) => {
                const count = manifestItems.filter((x: any) => x.manifest_id === row.id).length;
                const planned = row.planned_route || row.route_data;
                const proposed = planForCount(count);
                return (
                  <div key={row.id} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-semibold">{safeText(row.manifest_number)}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{count} parcels · Trigger: Option {proposed.option} — {proposed.label}</div>
                        {planned?.plan_label && <Badge className="mt-2">Current: Option {planned.plan_option} · {planned.plan_label}</Badge>}
                      </div>
                      <Button onClick={() => optimizeManifest(row.id)}>Generate compliant wayplan</Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {selectedPlan?.routes?.length ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Option {selectedPlan.plan_option}: {selectedPlan.plan_label}</CardTitle>
                  <CardDescription>{selectedPlan.parcel_count} parcels · Hub: {selectedPlan.hub || HUB}</CardDescription>
                </CardHeader>
                <CardContent className="max-h-[720px] space-y-3 overflow-auto pr-1">
                  {selectedPlan.routes.map((route: any) => (
                    <button
                      key={route.route_id}
                      type="button"
                      onClick={() => setSelectedRouteId(route.route_id)}
                      className={`w-full rounded-xl border p-4 text-left transition ${selectedRouteId === route.route_id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{route.route_name}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{route.vehicle_type} · Dispatch {route.dispatch_window}</div>
                        </div>
                        <Badge variant="secondary">{route.parcel_count} parcels</Badge>
                      </div>
                      <div className="mt-3 text-sm">{route.routing_strategy}</div>
                      {route.stops?.length > 0 && (
                        <div className="mt-3 max-h-40 space-y-1 overflow-auto rounded-lg bg-muted/40 p-2 text-xs">
                          {route.stops.map((stop: any) => (
                            <div key={`${route.route_id}-${stop.stop}-${stop.shipment_id}`} className="flex gap-2">
                              <span className="w-6 shrink-0 font-bold">{stop.stop}.</span>
                              <span className="font-medium">{stop.awb || 'No AWB'}</span>
                              <span className="text-muted-foreground">· {stop.township}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <MapboxRoutePanel
                  title={tt(language, 'Selected Route / Stop Preview', 'ရွေးထားသော Route / Stop Preview')}
                  destinationAddress={previewShipment?.recipient?.address}
                  destinationCoord={previewShipment?.recipient?.coordinates || coordOf(previewShipment)}
                />
                <Card>
                  <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
                    <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Hub</div><div className="mt-1 font-semibold">East Dagon</div></div>
                    <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Fleet plan</div><div className="mt-1 font-semibold">Option {selectedPlan.plan_option}</div></div>
                    <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Routes</div><div className="mt-1 font-semibold">{selectedPlan.routes.filter((r: any) => r.parcel_count > 0).length}</div></div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {view === 'manifests' && (
        <Card>
          <CardHeader><CardTitle>{tt(language, 'Manifest List', 'Manifest List')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {manifests.map((row: any) => (
              <div key={row.id} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div><div className="font-semibold">{safeText(row.manifest_number)}</div><div className="text-sm text-muted-foreground">{labelize(row.status)}</div></div>
                  <Badge>{labelize(row.status)}</Badge>
                </div>
                <div className="mt-3"><QrStepActionCard title={tt(language, 'Manifest QR Step', 'Manifest QR Step')} processStep="wayplan_manifest_release" manifestId={row.id} staffRows={staffRows} onDone={loadData} /></div>
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
                <div className="flex items-start gap-3"><Truck className="mt-0.5 h-5 w-5 text-muted-foreground" /><div><div className="font-semibold">{safeText(row.display_name, row.vehicle_code)}</div><div className="text-sm text-muted-foreground">{safeText(row.vehicle_type)} · {safeText(row.registration_no)}</div></div></div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {view === 'ways' && (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card>
            <CardHeader><CardTitle>{tt(language, 'Shipment Ways', 'Shipment Ways')}</CardTitle></CardHeader>
            <CardContent className="max-h-[720px] space-y-2 overflow-auto">
              {shipments.map((row: any) => (
                <button key={row.id} type="button" className={`w-full rounded-xl border p-3 text-left ${selectedShipmentId === row.id ? 'border-primary bg-primary/5' : ''}`} onClick={() => setSelectedShipmentId(row.id)}>
                  <div className="font-medium">{safeText(row.awb)}</div>
                  <div className="text-sm text-muted-foreground">{safeText(row.recipient?.name)}</div>
                  <div className="mt-1 flex items-center gap-1 text-xs font-medium"><MapPin className="h-3 w-3" /> {canonicalTownship(townshipOf(row)) || 'Township not recognized'}</div>
                </button>
              ))}
            </CardContent>
          </Card>

          <MapboxRoutePanel title={tt(language, 'Way Location Preview', 'Way Location Preview')} destinationAddress={selectedShipment?.recipient?.address} destinationCoord={selectedShipment?.recipient?.coordinates || coordOf(selectedShipment)} />
        </div>
      )}

      {view === 'waybills' && (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card data-print-hide="true">
            <CardHeader><CardTitle>{tt(language, 'Shipment List', 'Shipment List')}</CardTitle></CardHeader>
            <CardContent className="max-h-[720px] space-y-2 overflow-auto">
              {shipments.map((row: any) => (
                <button key={row.id} type="button" className={`w-full rounded-xl border p-3 text-left ${selectedShipmentId === row.id ? 'border-primary bg-primary/5' : ''}`} onClick={() => setSelectedShipmentId(row.id)}>
                  <div className="font-medium">{safeText(row.awb)}</div>
                  <div className="text-sm text-muted-foreground">{safeText(row.recipient?.name)}</div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card id="waybill-print-card">
            <CardHeader className="flex flex-row items-center justify-between gap-4" data-print-hide="true">
              <div><CardTitle>{tt(language, '4×6 Waybill', '4×6 Waybill')}</CardTitle><CardDescription>{tt(language, 'Exact 4 inch × 6 inch print profile. Other print layouts are unchanged.', '4 inch × 6 inch print profile သီးသန့်ပြင်ထားပြီး အခြား print layout များ မပြောင်းလဲပါ။')}</CardDescription></div>
              <Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />{tt(language, 'Print 4×6', '4×6 ပုံနှိပ်မည်')}</Button>
            </CardHeader>
            <CardContent className="overflow-auto p-4 md:p-6">
              {!selectedShipment && <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">{tt(language, 'Select a shipment.', 'shipment တစ်ခုရွေးပါ')}</div>}
              {selectedShipment && (
                <div id="waybill-4x6-preview" className="border bg-white p-[0.14in] text-slate-950 shadow-sm">
                  <div className="flex items-start justify-between gap-3 border-b-2 border-slate-900 pb-2">
                    <div><div className="text-[9px] font-extrabold uppercase tracking-[0.18em]">Britium Express</div><div className="mt-1 text-[22px] font-black leading-none">WAYBILL</div></div>
                    <div className="text-right"><div className="text-[8px] font-bold uppercase text-slate-500">AWB</div><div className="mt-1 max-w-[2.2in] break-all text-[19px] font-black leading-tight">{safeText(selectedShipment.awb)}</div></div>
                  </div>

                  <div className="mt-2 rounded-md border-2 border-slate-900 p-2">
                    <div className="text-[8px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Destination Township / Route Area</div>
                    <div className="mt-1 text-[20px] font-black leading-tight">{waybillTownship || 'LOCATION REVIEW'}</div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-md border p-2">
                      <div className="text-[8px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Sender</div>
                      <div className="mt-1 text-[11px] font-bold leading-tight">{safeText(selectedShipment.sender?.name)}</div>
                      <div className="mt-1 text-[9px] leading-tight">{safeText(selectedShipment.sender?.phone)}</div>
                      <div className="mt-1 line-clamp-4 text-[8px] leading-[1.25]">{addressText(selectedShipment.sender?.address)}</div>
                    </div>
                    <div className="rounded-md border p-2">
                      <div className="text-[8px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Recipient</div>
                      <div className="mt-1 text-[12px] font-black leading-tight">{safeText(selectedShipment.recipient?.name, selectedShipment.receiver_name)}</div>
                      <div className="mt-1 text-[11px] font-bold leading-tight">{safeText(selectedShipment.recipient?.phone, selectedShipment.receiver_phone)}</div>
                      <div className="mt-1 line-clamp-5 text-[9px] font-medium leading-[1.25]">{addressText(selectedShipment.recipient?.address) || safeText(selectedShipment.receiver_address)}</div>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-[9px]">
                    <div className="rounded-md border p-2"><div className="font-bold text-slate-500">Service</div><div className="mt-0.5 font-black">{safeText(selectedShipment.service_type, selectedShipment.serviceType, 'Standard')}</div></div>
                    <div className="rounded-md border p-2"><div className="font-bold text-slate-500">Postal Code</div><div className="mt-0.5 font-black">{safeText(selectedShipment.recipient?.address?.postal_code, selectedShipment.postal_code, '-')}</div></div>
                  </div>

                  <div className="mt-2 grid grid-cols-[1fr_1.2fr] gap-2">
                    <div className="rounded-md border p-2 text-[9px]"><div className="font-bold text-slate-500">Weight</div><div className="mt-0.5 text-[13px] font-black">{safeText(selectedShipment.weight_kg, selectedShipment.weight, '0')} kg</div></div>
                    <div className="rounded-md border-2 border-slate-900 p-2 text-right"><div className="text-[9px] font-black uppercase">COD / Collect</div><div className="mt-1 text-[22px] font-black leading-none">{Number(selectedShipment.cod_amount || selectedShipment.item_price || 0).toLocaleString()} MMK</div></div>
                  </div>

                  <div className="mt-2 border-t pt-2 text-[8px] leading-tight text-slate-600">Recognized route: {waybillTownship || 'Needs location review'} · Printed from Britium Express Production</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
