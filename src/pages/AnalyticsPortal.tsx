// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/useLanguage';
import { getPortalBanner } from '@/lib/portalBanner';
import { safeText } from '@/lib/displayValue';
import { PortalBanner } from '@/components/portal/PortalBanner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function tt(language: string, en: string, mm: string) {
  return language === 'mm' ? mm : en;
}
function currentView(pathname: string) {
  if (pathname.includes('/revenue')) return 'revenue';
  if (pathname.includes('/drivers')) return 'drivers';
  return 'overview';
}
function fmtCurrency(value: unknown) {
  const num = Number(value || 0);
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number.isFinite(num) ? num : 0)} MMK`;
}
function labelize(value: unknown) {
  return String(value || 'unknown').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AnalyticsPortal() {
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useState(currentView(location.pathname));
  const [auxView, setAuxView] = useState<'warehouses' | 'satisfaction'>('warehouses');
  const [loading, setLoading] = useState(true);
  const [shipments, setShipments] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [staffRows, setStaffRows] = useState<any[]>([]);

  useEffect(() => setView(currentView(location.pathname)), [location.pathname]);

  async function loadData() {
    setLoading(true);
    try {
      const [sRes, dRes, wRes, fRes, stRes] = await Promise.all([
        supabase.from('shipments').select('*').order('created_at', { ascending: false }),
        supabase.from('deliveries').select('*').order('created_at', { ascending: false }),
        supabase.from('warehouses').select('*').order('name', { ascending: true }),
        supabase.from('customer_feedback').select('*').order('created_at', { ascending: false }),
        supabase.from('staff_master').select('*').order('full_name', { ascending: true }),
      ]);
      if (sRes.error) throw sRes.error;
      if (dRes.error) throw dRes.error;
      if (wRes.error) throw wRes.error;
      if (fRes.error) throw fRes.error;
      if (stRes.error) throw stRes.error;
      setShipments(sRes.data || []);
      setDeliveries(dRes.data || []);
      setWarehouses(wRes.data || []);
      setFeedback(fRes.data || []);
      setStaffRows(stRes.data || []);
    } catch (e) {
      console.error(e);
      setShipments([]);
      setDeliveries([]);
      setWarehouses([]);
      setFeedback([]);
      setStaffRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const driverRows = staffRows.filter((row: any) => ['driver', 'rider'].includes(String(row.staff_type)));

  const summary = useMemo(() => {
    const totalShipments = shipments.length;
    const delivered = shipments.filter((r: any) => String(r.status) === 'delivered').length;
    const revenue = shipments.reduce((sum: number, r: any) => sum + Number(r.shipping_fee || 0), 0);
    const cod = shipments.reduce((sum: number, r: any) => sum + Number(r.cod_amount || 0), 0);
    const avgRating = feedback.length
      ? Math.round((feedback.reduce((sum: number, r: any) => sum + Number(r.rating || 0), 0) / feedback.length) * 10) / 10
      : 0;
    return { totalShipments, delivered, revenue, cod, avgRating };
  }, [shipments, feedback]);

  const warehouseStats = useMemo(() => {
    return warehouses.map((wh: any) => ({
      ...wh,
      inbound: shipments.filter((s: any) => s.destination_warehouse_id === wh.id).length,
      outbound: shipments.filter((s: any) => s.origin_warehouse_id === wh.id).length,
    }));
  }, [warehouses, shipments]);

  const driverStats = useMemo(() => {
    return driverRows.map((driver: any) => ({
      ...driver,
      totalJobs: deliveries.filter((d: any) => d.driver_id === driver.id).length,
      deliveredJobs: deliveries.filter((d: any) => d.driver_id === driver.id && d.status === 'delivered').length,
      failedJobs: deliveries.filter((d: any) => d.driver_id === driver.id && d.status === 'failed').length,
    }));
  }, [driverRows, deliveries]);

  return (
    <div className="space-y-6">
      <PortalBanner
        image={getPortalBanner(view === 'revenue' ? 'analytics_revenue' : view === 'drivers' ? 'analytics_drivers' : auxView === 'warehouses' ? 'analytics_warehouses' : auxView === 'satisfaction' ? 'analytics_satisfaction' : 'analytics')}
        title={tt(language, 'Analytics Portal', 'Analytics Portal')}
        subtitle={tt(language, 'Overview, revenue, drivers, warehouses, and satisfaction.', 'overview, revenue, driver, warehouse နှင့် satisfaction')}
      >
        <Button variant="outline" onClick={loadData} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {tt(language, 'Refresh', 'ပြန်လည်ရယူမည်')}
        </Button>
      </PortalBanner>

      <div className="grid gap-2 rounded-2xl bg-muted p-1 md:grid-cols-5">
        <button className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === 'overview' ? 'bg-background shadow-sm' : ''}`} onClick={() => navigate('/analytics/overview')}>{tt(language, 'Overview', 'Overview')}</button>
        <button className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === 'revenue' ? 'bg-background shadow-sm' : ''}`} onClick={() => navigate('/analytics/revenue')}>{tt(language, 'Revenue', 'Revenue')}</button>
        <button className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === 'drivers' ? 'bg-background shadow-sm' : ''}`} onClick={() => navigate('/analytics/drivers')}>{tt(language, 'Drivers', 'Drivers')}</button>
        <button className={`rounded-xl px-4 py-3 text-sm font-semibold ${auxView === 'warehouses' ? 'bg-background shadow-sm' : ''}`} onClick={() => setAuxView('warehouses')}>{tt(language, 'Warehouses', 'Warehouses')}</button>
        <button className={`rounded-xl px-4 py-3 text-sm font-semibold ${auxView === 'satisfaction' ? 'bg-background shadow-sm' : ''}`} onClick={() => setAuxView('satisfaction')}>{tt(language, 'Satisfaction', 'Satisfaction')}</button>
      </div>

      {view === 'overview' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Shipments', 'Shipment')}</div><div className="mt-2 text-4xl font-semibold">{summary.totalShipments}</div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Delivered', 'ပို့ပြီး')}</div><div className="mt-2 text-4xl font-semibold">{summary.delivered}</div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Revenue', 'ဝင်ငွေ')}</div><div className="mt-2 text-4xl font-semibold">{fmtCurrency(summary.revenue)}</div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'COD', 'COD')}</div><div className="mt-2 text-4xl font-semibold">{fmtCurrency(summary.cod)}</div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Avg Rating', 'ပျမ်းမျှ Rating')}</div><div className="mt-2 text-4xl font-semibold">{summary.avgRating}</div></CardContent></Card>
        </div>
      )}

      {view === 'revenue' && (
        <Card>
          <CardHeader><CardTitle>{tt(language, 'Revenue by Shipment', 'Shipment အလိုက် Revenue')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {shipments.map((row: any) => (
              <div key={row.id} className="rounded-xl border p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{safeText(row.awb)}</div>
                  <div className="text-sm text-muted-foreground">{labelize(row.status)}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{fmtCurrency(row.shipping_fee)}</div>
                  <div className="text-sm text-muted-foreground">{fmtCurrency(row.cod_amount)}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {view === 'drivers' && (
        <Card>
          <CardHeader><CardTitle>{tt(language, 'Driver Performance', 'Driver Performance')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {driverStats.map((row: any) => (
              <div key={row.id} className="rounded-xl border p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{row.full_name}</div>
                  <div className="text-sm text-muted-foreground">{safeText(row.staff_code)} · {safeText(row.phone)}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{row.totalJobs} jobs</div>
                  <div className="text-sm text-muted-foreground">{row.deliveredJobs} delivered · {row.failedJobs} failed</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {auxView === 'warehouses' && (
        <Card>
          <CardHeader><CardTitle>{tt(language, 'Warehouse Throughput', 'Warehouse Throughput')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {warehouseStats.map((row: any) => (
              <div key={row.id} className="rounded-xl border p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{row.name}</div>
                  <div className="text-sm text-muted-foreground">{safeText(row.code)} · {labelize(row.status)}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{row.inbound} inbound</div>
                  <div className="text-sm text-muted-foreground">{row.outbound} outbound</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {auxView === 'satisfaction' && (
        <Card>
          <CardHeader><CardTitle>{tt(language, 'Customer Satisfaction', 'Customer Satisfaction')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {feedback.map((row: any) => (
              <div key={row.id} className="rounded-xl border p-4 flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{row.rating} / 5</div>
                  <div className="text-sm text-muted-foreground">{safeText(row.comment)}</div>
                </div>
                <Badge>{tt(language, 'Feedback', 'Feedback')}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
