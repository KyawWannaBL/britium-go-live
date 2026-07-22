// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Navigation, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/useLanguage';
import { getPortalBanner } from '@/lib/portalBanner';
import { addressText, safeText } from '@/lib/displayValue';
import { bi, workforceErrorMessage } from '@/lib/workforceI18n';
import { PortalBanner } from '@/components/portal/PortalBanner';
import { MapboxRoutePanel } from '@/components/workflow/MapboxRoutePanel';
import { PhotoUploaderField } from '@/components/workflow/PhotoUploaderField';
import { SignaturePadField } from '@/components/workflow/SignaturePadField';
import { QrStepActionCard } from '@/components/workflow/QrStepActionCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function tt(_language: string, en: string, mm: string) {
  return bi(en, mm);
}
function currentView(pathname: string) {
  if (pathname.includes('/route')) return 'route';
  if (pathname.includes('/proof')) return 'proof';
  if (pathname.includes('/earnings')) return 'earnings';
  return 'jobs';
}
function labelize(value: unknown) {
  return String(value || 'unknown').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmtCurrency(value: unknown) {
  const num = Number(value || 0);
  const amount = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(num) ? num : 0);

  return `${amount} MMK / ကျပ်`;
}

function statusLabel(value: unknown) {
  const status = String(value || '').toLowerCase();

  const labels: Record<string, string> = {
    assigned: bi('Assigned', 'တာဝန်ခွဲဝေထား'),
    pending: bi('Pending', 'စောင့်ဆိုင်းနေ'),
    accepted: bi('Accepted', 'လက်ခံပြီး'),
    in_progress: bi('In Progress', 'လုပ်ဆောင်နေ'),
    out_for_delivery: bi('Out for Delivery', 'ပို့ဆောင်နေ'),
    delivered: bi('Delivered', 'ပို့ဆောင်ပြီး'),
    failed: bi('Failed', 'မအောင်မြင်'),
    cancelled: bi('Cancelled', 'ပယ်ဖျက်ထား'),
    exception: bi('Exception', 'ပြဿနာရှိ'),
  };

  return labels[status] || bi(
    labelize(value),
    'အခြေအနေ'
  );
}

export default function DriverPortal() {
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useState(currentView(location.pathname));
  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<any>(null);
  const [staffRows, setStaffRows] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [podPhoto, setPodPhoto] = useState<string>('');
  const [podSignature, setPodSignature] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => setView(currentView(location.pathname)), [location.pathname]);

  async function loadData() {
    setLoading(true);
    setErrorMessage('');

    try {
      const [{ data: auth }, staffRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('staff_master').select('*').order('full_name', { ascending: true }),
      ]);
      if (staffRes.error) throw staffRes.error;
      setStaffRows(staffRes.data || []);

      const current = (staffRes.data || []).find(
        (row: any) =>
          row.auth_user_id === auth.user?.id ||
          row.user_profile_id === auth.user?.id
      );

      setDriver(current || null);

      if (!current?.id) {
        setDeliveries([]);
        setShipments([]);
        setSelectedRowId(null);
        setErrorMessage(
          bi(
            'Your Driver staff profile is not connected to this login.',
            'ဤအကောင့်နှင့် ချိတ်ဆက်ထားသော ယာဉ်မောင်းဝန်ထမ်းအချက်အလက် မရှိပါ။'
          )
        );
        return;
      }

      const delRes = await supabase.from('deliveries').select('*').eq('driver_id', current.id).order('created_at', { ascending: false });
      if (delRes.error) throw delRes.error;
      const rows = delRes.data || [];
      const ids = [...new Set(rows.map((r: any) => r.shipment_id).filter(Boolean))];
      const shipRes = ids.length
        ? await supabase.from('shipments').select('*').in('id', ids)
        : { data: [], error: null };
      if (shipRes.error) throw shipRes.error;
      setDeliveries(rows);
      setShipments(shipRes.data || []);
      if (!selectedRowId && rows.length) setSelectedRowId(rows[0].id);
    } catch (e) {
      console.error(e);
      setDeliveries([]);
      setShipments([]);
      setErrorMessage(workforceErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const shipMap = useMemo(() => new Map(shipments.map((s: any) => [s.id, s])), [shipments]);
  const rows = useMemo(() => deliveries.map((d: any) => ({ ...d, shipment: shipMap.get(d.shipment_id) || null })), [deliveries, shipMap]);
  const selected = rows.find((r: any) => r.id === selectedRowId) || rows[0] || null;
  const deliveredRows = rows.filter((r: any) => String(r.status) === 'delivered');

  async function saveProof() {
    setNotice('');
    setErrorMessage('');

    if (!selected) {
      setErrorMessage(
        bi(
          'Select a delivery first.',
          'ပို့ဆောင်မှုတစ်ခုကို အရင်ရွေးပါ။'
        )
      );
      return;
    }

    if (!podPhoto) {
      setErrorMessage(
        bi(
          'Delivery photo is required.',
          'ပို့ဆောင်မှုဓာတ်ပုံ လိုအပ်ပါသည်။'
        )
      );
      return;
    }

    if (!podSignature) {
      setErrorMessage(
        bi(
          'Recipient signature is required.',
          'လက်ခံသူလက်မှတ် လိုအပ်ပါသည်။'
        )
      );
      return;
    }

    setSaving(true);

    try {
      const now = new Date().toISOString();
      const proof = {
        photo_path: podPhoto,
        signature_path: podSignature,
        captured_at: now,
      };

      const shipmentRes = await supabase
        .from('shipments')
        .update({
          proof_of_delivery: proof,
          status: 'delivered',
          actual_delivery_date: now,
          updated_at: now,
        })
        .eq('id', selected.shipment_id);

      if (shipmentRes.error) throw shipmentRes.error;

      const deliveryRes = await supabase
        .from('deliveries')
        .update({
          status: 'delivered',
          delivered_at: now,
          updated_at: now,
        })
        .eq('id', selected.id);

      if (deliveryRes.error) throw deliveryRes.error;

      setPodPhoto('');
      setPodSignature('');

      await loadData();

      setNotice(
        bi(
          'Delivery completed successfully.',
          'ပို့ဆောင်မှု အောင်မြင်စွာ ပြီးစီးပါပြီ။'
        )
      );
    } catch (error) {
      setErrorMessage(workforceErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PortalBanner
        image={getPortalBanner(view === 'route' ? 'driver_route' : 'driver')}
        title={tt(language, 'Driver / Rider Portal', 'ယာဉ်မောင်း / ပို့ဆောင်ရေးဝန်ထမ်း အက်ပ်')}
        subtitle={tt(language, 'Live jobs, route, proof of delivery, and earnings.', 'လက်ရှိတာဝန်များ၊ လမ်းကြောင်း၊ ပို့ဆောင်မှုအထောက်အထားနှင့် ဝင်ငွေစာရင်း။')}
      >
        <Button variant="outline" onClick={loadData} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {tt(language, 'Refresh', 'ပြန်လည်ရယူမည်')}
        </Button>
      </PortalBanner>

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          {notice}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-2 rounded-2xl bg-muted p-1 md:grid-cols-4">
        <button className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === 'jobs' ? 'bg-background shadow-sm' : ''}`} onClick={() => navigate('/driver/jobs')}>{tt(language, 'Active Jobs', 'လက်ရှိအလုပ်များ')}</button>
        <button className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === 'route' ? 'bg-background shadow-sm' : ''}`} onClick={() => navigate('/driver/route')}>{tt(language, 'Route', 'လမ်းကြောင်း')}</button>
        <button className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === 'proof' ? 'bg-background shadow-sm' : ''}`} onClick={() => navigate('/driver/proof')}>{tt(language, 'Proof', 'အထောက်အထား')}</button>
        <button className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === 'earnings' ? 'bg-background shadow-sm' : ''}`} onClick={() => navigate('/driver/earnings')}>{tt(language, 'Earnings', 'ဝင်ငွေ')}</button>
      </div>

      {view === 'jobs' && (
        <Card>
          <CardHeader>
            <CardTitle>{tt(language, 'Assigned Jobs', 'ခွဲဝေထားသောအလုပ်များ')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.map((row: any) => (
              <div key={row.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{safeText(row.shipment?.awb, row.id)}</div>
                    <div className="text-sm text-muted-foreground">{safeText(row.shipment?.recipient?.name)}</div>
                    <div className="text-sm text-muted-foreground">{addressText(row.shipment?.recipient?.address)}</div>
                  </div>
                  <Badge>{statusLabel(row.status)}</Badge>
                </div>
                <div className="mt-3">
                  <QrStepActionCard
                    title={tt(language, 'Confirm Process Step', 'လုပ်ငန်းအဆင့်ကို အတည်ပြုမည်')}
                    processStep="driver_job_progress"
                    shipmentId={row.shipment_id}
                    deliveryId={row.id}
                    staffRows={staffRows}
                    onDone={loadData}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {view === 'route' && (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>{tt(language, 'Stops', 'ပို့ဆောင်ရမည့်နေရာများ')}</CardTitle>
              <CardDescription>{driver ? safeText(driver.full_name) : '—'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {rows.map((row: any) => (
                <button key={row.id} type="button" className={`w-full rounded-xl border p-3 text-left ${selectedRowId === row.id ? 'border-primary bg-primary/5' : ''}`} onClick={() => setSelectedRowId(row.id)}>
                  <div className="font-medium">{safeText(row.shipment?.recipient?.name)}</div>
                  <div className="text-sm text-muted-foreground">{safeText(row.shipment?.awb)}</div>
                </button>
              ))}
            </CardContent>
          </Card>

          <MapboxRoutePanel
            title={tt(language, 'Route Preview', 'လမ်းကြောင်းကြိုတင်ကြည့်ရန်')}
            destinationAddress={selected?.shipment?.recipient?.address}
            destinationCoord={selected?.shipment?.recipient?.coordinates || null}
          />
        </div>
      )}

      {view === 'proof' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
          <Card>
            <CardHeader>
              <CardTitle>{tt(language, 'Proof of Delivery', 'ပို့ဆောင်မှုအထောက်အထား')}</CardTitle>
              <CardDescription>{selected ? safeText(selected.shipment?.awb) : '—'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <PhotoUploaderField
                label={tt(language, 'Delivery Photo', 'ပို့ဆောင်မှုဓာတ်ပုံ')}
                onUploaded={(path) => setPodPhoto(path)}
              />
              <SignaturePadField
                label={tt(language, 'Recipient Signature', 'လက်ခံသူလက်မှတ်')}
                onUploaded={(path) => setPodSignature(path)}
              />
              <Button
                  onClick={saveProof}
                  disabled={saving || !selected}
                >
                  {saving
                    ? tt(language, 'Saving…', 'သိမ်းဆည်းနေသည်…')
                    : tt(
                        language,
                        'Mark Delivered',
                        'ပို့ပြီးကြောင်း အတည်ပြုမည်'
                      )}
                </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{tt(language, 'Selected Shipment', 'ရွေးထားသော ပို့ဆောင်မှု')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>{safeText(selected?.shipment?.recipient?.name)}</div>
              <div className="text-sm text-muted-foreground">{addressText(selected?.shipment?.recipient?.address)}</div>
              <div className="text-sm text-muted-foreground">{fmtCurrency(selected?.shipment?.cod_amount)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'earnings' && (
        <Card>
          <CardHeader>
            <CardTitle>{tt(language, 'Delivered Ledger', 'ပို့ဆောင်ပြီးစာရင်း')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {deliveredRows.map((row: any) => (
              <div key={row.id} className="rounded-xl border p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{safeText(row.shipment?.awb)}</div>
                  <div className="text-sm text-muted-foreground">{safeText(row.shipment?.recipient?.name)}</div>
                </div>
                <div className="font-semibold">{fmtCurrency(Number(row.shipment?.cod_amount || 0) + Number(row.shipment?.shipping_fee || 0))}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
