import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Package,
  ScanLine,
  Boxes,
  Warehouse,
  Truck,
  QrCode,
  RefreshCw,
  CheckCircle2,
  ArrowRightLeft,
  Search,
  AlertTriangle,
  Archive,
  Layers3,
  ClipboardList,
  PlusCircle,
  FileText,
  Send,
} from "lucide-react";

type ViewKey = "overview" | "inbound" | "staging" | "storage" | "outbound" | "qr";

type WarehouseStats = {
  inbound: number;
  sorting: number;
  dispatch: number;
  exceptions: number;
};

type OpenBag = {
  id: string;
  bag_code?: string;
  destination?: string;
  status?: string;
  shipments?: Array<{ id: string }>;
  created_at?: string;
};

type StorageRow = {
  id: string;
  trackingNo: string;
  zone: string;
  rack: string;
  bin: string;
  phase: string;
  status: string;
  updatedAt?: string;
  notes?: string;
};

type OutboundBatch = {
  id: string;
  batch_no: string;
  destination_name: string;
  vehicle_no?: string | null;
  driver_name?: string | null;
  total_parcels: number;
  status: string;
  dispatched_at?: string | null;
  manifest_id?: string | null;
};

type ManifestRow = {
  id: string;
  manifest_no: string;
  destination_name: string;
  vehicle_no?: string | null;
  driver_name?: string | null;
  total_parcels: number;
  status: string;
  closed_at?: string | null;
  item_count?: number;
};

type ScanLedgerRow = {
  id: string;
  tracking_no: string;
  scan_type: string;
  created_at?: string;
};

function currentView(pathname: string): ViewKey {
  if (pathname.includes("/inbound")) return "inbound";
  if (pathname.includes("/staging")) return "staging";
  if (pathname.includes("/storage")) return "storage";
  if (pathname.includes("/outbound")) return "outbound";
  if (pathname.includes("/qr")) return "qr";
  return "overview";
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();
  const parsed = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new Error(parsed?.error || parsed?.message || `Request failed: ${res.status}`);
  }

  return (parsed?.data ?? parsed) as T;
}

function statusTone(status: string) {
  const v = String(status || "").toLowerCase();
  if (
    [
      "received",
      "in_warehouse",
      "sorting",
      "staging",
      "stored",
      "ready_for_dispatch",
      "dispatched",
      "open",
      "closed",
      "manifested",
      "bagged",
    ].includes(v)
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["exception", "hold", "damaged", "rejected"].includes(v)) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (["pending", "queued"].includes(v)) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-slate-100 text-slate-700";
}

export default function WarehouseOperations() {
  const location = useLocation();
  const navigate = useNavigate();

  const [view, setView] = useState<ViewKey>(currentView(location.pathname));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [stats, setStats] = useState<WarehouseStats>({
    inbound: 0,
    sorting: 0,
    dispatch: 0,
    exceptions: 0,
  });

  const [bags, setBags] = useState<OpenBag[]>([]);
  const [storageRows, setStorageRows] = useState<StorageRow[]>([]);
  const [outboundQueue, setOutboundQueue] = useState<OutboundBatch[]>([]);
  const [manifests, setManifests] = useState<ManifestRow[]>([]);
  const [scanLedger, setScanLedger] = useState<ScanLedgerRow[]>([]);

  const [scanTracking, setScanTracking] = useState("");
  const [scanType, setScanType] = useState<"inbound" | "sorting">("inbound");

  const [newBagCode, setNewBagCode] = useState("");
  const [newBagDestination, setNewBagDestination] = useState("");
  const [bagTracking, setBagTracking] = useState("");
  const [selectedBagId, setSelectedBagId] = useState("");

  const [storageTracking, setStorageTracking] = useState("");
  const [storageZone, setStorageZone] = useState("A");
  const [storageRack, setStorageRack] = useState("R1");
  const [storageBin, setStorageBin] = useState("B01");
  const [storageNote, setStorageNote] = useState("");

  const [stagingTracking, setStagingTracking] = useState("");
  const [stagingZone, setStagingZone] = useState("STG");
  const [stagingRack, setStagingRack] = useState("L1");
  const [stagingBin, setStagingBin] = useState("P01");

  const [outboundBatchNo, setOutboundBatchNo] = useState("");
  const [outboundDestination, setOutboundDestination] = useState("");
  const [outboundVehicle, setOutboundVehicle] = useState("");
  const [outboundDriver, setOutboundDriver] = useState("");
  const [outboundParcels, setOutboundParcels] = useState("0");

  const [manifestNo, setManifestNo] = useState("");
  const [manifestDestination, setManifestDestination] = useState("");
  const [manifestVehicle, setManifestVehicle] = useState("");
  const [manifestDriver, setManifestDriver] = useState("");
  const [selectedManifestId, setSelectedManifestId] = useState("");
  const [manifestTrackingInput, setManifestTrackingInput] = useState("");

  useEffect(() => {
    setView(currentView(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function loadWarehouse() {
    setLoading(true);
    setError("");

    try {
      const [statsRes, bagsRes, storageRes, outboundRes, manifestRes] = await Promise.all([
        readJson<WarehouseStats>("/api/v1/warehouse/scans"),
        readJson<OpenBag[]>("/api/v1/warehouse/bags"),
        readJson<StorageRow[]>("/api/v1/warehouse/storage"),
        readJson<OutboundBatch[]>("/api/v1/warehouse/outbound"),
        readJson<ManifestRow[]>("/api/v1/warehouse/manifests"),
      ]);

      setStats(statsRes || { inbound: 0, sorting: 0, dispatch: 0, exceptions: 0 });
      setBags(Array.isArray(bagsRes) ? bagsRes : []);
      setStorageRows(Array.isArray(storageRes) ? storageRes : []);
      setOutboundQueue(Array.isArray(outboundRes) ? outboundRes : []);
      setManifests(Array.isArray(manifestRes) ? manifestRes : []);

      if (!selectedBagId && Array.isArray(bagsRes) && bagsRes[0]?.id) {
        setSelectedBagId(String(bagsRes[0].id));
      }

      if (!selectedManifestId && Array.isArray(manifestRes) && manifestRes[0]?.id) {
        setSelectedManifestId(String(manifestRes[0].id));
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to load warehouse data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWarehouse();
  }, []);

  async function submitScan() {
    if (!scanTracking.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      const result = await readJson<{ tracking_no: string; current_status: string }>(
        "/api/v1/warehouse/scans",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tracking_no: scanTracking.trim(),
            scan_type: scanType,
          }),
        }
      );

      setScanLedger((prev) => [
        {
          id: `local-${Date.now()}`,
          tracking_no: result.tracking_no,
          scan_type: scanType,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);

      setNotice(`Scanned ${result.tracking_no} → ${result.current_status}`);
      setScanTracking("");
      await loadWarehouse();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to process scan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function createBag() {
    if (!newBagCode.trim() || !newBagDestination.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      await readJson("/api/v1/warehouse/bags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_bag",
          bag_code: newBagCode.trim(),
          destination: newBagDestination.trim(),
        }),
      });

      setNotice(`Bag ${newBagCode.trim()} created`);
      setNewBagCode("");
      setNewBagDestination("");
      await loadWarehouse();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to create bag.");
    } finally {
      setSubmitting(false);
    }
  }

  async function scanToBag() {
    if (!bagTracking.trim() || !selectedBagId) return;

    setSubmitting(true);
    setError("");

    try {
      await readJson("/api/v1/warehouse/bags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "scan_to_bag",
          tracking_no: bagTracking.trim(),
          bag_id: selectedBagId,
        }),
      });

      setNotice(`Bagged ${bagTracking.trim()} successfully`);
      setBagTracking("");
      await loadWarehouse();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to bag parcel.");
    } finally {
      setSubmitting(false);
    }
  }

  async function moveToStaging() {
    if (!stagingTracking.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      await readJson("/api/v1/warehouse/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move_to_staging",
          tracking_no: stagingTracking.trim(),
          zone: stagingZone,
          rack: stagingRack,
          bin: stagingBin,
        }),
      });

      setNotice(`Moved ${stagingTracking.trim()} to staging`);
      setStagingTracking("");
      await loadWarehouse();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to move parcel to staging.");
    } finally {
      setSubmitting(false);
    }
  }

  async function moveToStorage() {
    if (!storageTracking.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      await readJson("/api/v1/warehouse/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move_to_storage",
          tracking_no: storageTracking.trim(),
          zone: storageZone,
          rack: storageRack,
          bin: storageBin,
          note: storageNote.trim() || undefined,
        }),
      });

      setNotice(`Stored ${storageTracking.trim()} in ${storageZone}-${storageRack}-${storageBin}`);
      setStorageTracking("");
      setStorageNote("");
      await loadWarehouse();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to move parcel to storage.");
    } finally {
      setSubmitting(false);
    }
  }

  async function markReadyForDispatch(trackingNo: string) {
    setSubmitting(true);
    setError("");

    try {
      await readJson("/api/v1/warehouse/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_ready_for_dispatch",
          tracking_no: trackingNo,
        }),
      });

      setNotice(`${trackingNo} marked ready for dispatch`);
      await loadWarehouse();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to mark parcel ready for dispatch.");
    } finally {
      setSubmitting(false);
    }
  }

  async function queueOutboundBatch() {
    if (!outboundBatchNo.trim() || !outboundDestination.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      await readJson("/api/v1/warehouse/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "queue_batch",
          batch_no: outboundBatchNo.trim(),
          destination_name: outboundDestination.trim(),
          vehicle_no: outboundVehicle.trim() || null,
          driver_name: outboundDriver.trim() || null,
          total_parcels: Number(outboundParcels || 0),
        }),
      });

      setNotice(`Outbound batch ${outboundBatchNo.trim()} queued`);
      setOutboundBatchNo("");
      setOutboundDestination("");
      setOutboundVehicle("");
      setOutboundDriver("");
      setOutboundParcels("0");
      await loadWarehouse();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to queue outbound batch.");
    } finally {
      setSubmitting(false);
    }
  }

  async function dispatchBatch(batchId: string) {
    setSubmitting(true);
    setError("");

    try {
      await readJson("/api/v1/warehouse/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dispatch_batch",
          batch_id: batchId,
        }),
      });

      setNotice("Outbound batch dispatched");
      await loadWarehouse();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to dispatch outbound batch.");
    } finally {
      setSubmitting(false);
    }
  }

  async function createManifest() {
    if (!manifestNo.trim() || !manifestDestination.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      const created = await readJson<ManifestRow>("/api/v1/warehouse/manifests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_manifest",
          manifest_no: manifestNo.trim(),
          destination_name: manifestDestination.trim(),
          vehicle_no: manifestVehicle.trim() || null,
          driver_name: manifestDriver.trim() || null,
        }),
      });

      setNotice(`Manifest ${created.manifest_no} created`);
      setManifestNo("");
      setManifestDestination("");
      setManifestVehicle("");
      setManifestDriver("");
      setSelectedManifestId(created.id);
      await loadWarehouse();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to create manifest.");
    } finally {
      setSubmitting(false);
    }
  }

  async function addManifestItems() {
    const trackingNos = manifestTrackingInput
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!selectedManifestId || !trackingNos.length) return;

    setSubmitting(true);
    setError("");

    try {
      await readJson("/api/v1/warehouse/manifests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_items",
          manifest_id: selectedManifestId,
          tracking_nos: trackingNos,
        }),
      });

      setNotice(`${trackingNos.length} parcel(s) added to manifest`);
      setManifestTrackingInput("");
      await loadWarehouse();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to add items to manifest.");
    } finally {
      setSubmitting(false);
    }
  }

  async function closeManifest(manifestId: string) {
    setSubmitting(true);
    setError("");

    try {
      await readJson("/api/v1/warehouse/manifests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "close_manifest",
          manifest_id: manifestId,
        }),
      });

      setNotice("Manifest closed");
      await loadWarehouse();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to close manifest.");
    } finally {
      setSubmitting(false);
    }
  }

  const storageStats = useMemo(() => {
    return {
      staging: storageRows.filter((row) => row.phase === "staging" || row.status === "staging").length,
      stored: storageRows.filter((row) => row.status === "stored").length,
      ready: storageRows.filter((row) => row.status === "ready_for_dispatch").length,
    };
  }, [storageRows]);

  return (
    <div className="space-y-6">
      <HeroCard
        title="Warehouse Operations"
        subtitle="Inbound receiving, staging lanes, rack/bin storage, outbound dispatch, and QR scan control."
        actions={
          <PrimaryButton onClick={() => void loadWarehouse()} disabled={loading || submitting}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </PrimaryButton>
        }
      />

      <div className="grid gap-2 rounded-2xl bg-slate-100 p-1 md:grid-cols-6">
        <TabButton active={view === "overview"} onClick={() => navigate("/warehouse")}>
          Overview
        </TabButton>
        <TabButton active={view === "inbound"} onClick={() => navigate("/warehouse/inbound")}>
          Inbound
        </TabButton>
        <TabButton active={view === "staging"} onClick={() => navigate("/warehouse/staging")}>
          Staging
        </TabButton>
        <TabButton active={view === "storage"} onClick={() => navigate("/warehouse/storage")}>
          Storage
        </TabButton>
        <TabButton active={view === "outbound"} onClick={() => navigate("/warehouse/outbound")}>
          Outbound
        </TabButton>
        <TabButton active={view === "qr"} onClick={() => navigate("/warehouse/qr")}>
          QR Scanner
        </TabButton>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      {view === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
            <MetricCard title="Inbound Queue" value={stats.inbound} icon={<Package className="h-5 w-5" />} />
            <MetricCard title="Sorting" value={stats.sorting} icon={<Layers3 className="h-5 w-5" />} />
            <MetricCard title="Dispatch" value={stats.dispatch} icon={<Truck className="h-5 w-5" />} />
            <MetricCard title="Exceptions" value={stats.exceptions} icon={<AlertTriangle className="h-5 w-5" />} />
            <MetricCard title="Open Bags" value={bags.length} icon={<Archive className="h-5 w-5" />} />
            <MetricCard title="Staging" value={storageStats.staging} icon={<ClipboardList className="h-5 w-5" />} />
            <MetricCard title="Stored" value={storageStats.stored} icon={<Warehouse className="h-5 w-5" />} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
            <Panel title="Inbound Scan Console">
              <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={scanTracking}
                    onChange={(e) => setScanTracking(e.target.value)}
                    placeholder="Scan or type tracking number"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-mono outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                  />
                </div>

                <select
                  value={scanType}
                  onChange={(e) => setScanType(e.target.value as "inbound" | "sorting")}
                  className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                >
                  <option value="inbound">Inbound Receive</option>
                  <option value="sorting">Move to Sorting</option>
                </select>

                <PrimaryButton onClick={() => void submitScan()} disabled={submitting}>
                  <ScanLine className="h-4 w-4" />
                  Scan
                </PrimaryButton>
              </div>

              <div className="mt-5 space-y-3">
                {scanLedger.length === 0 ? (
                  <EmptyState text="No local scan events yet." />
                ) : (
                  scanLedger.slice(0, 8).map((row) => (
                    <div key={row.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-mono font-semibold text-slate-900">{row.tracking_no}</div>
                        <StatusBadge label={row.scan_type} />
                      </div>
                      <div className="mt-1 text-sm text-slate-500">{row.created_at || "Just now"}</div>
                    </div>
                  ))
                )}
              </div>
            </Panel>

            <Panel title="Bagging / Consolidation">
              <div className="space-y-3">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  Create Bag
                </div>
                <input
                  value={newBagCode}
                  onChange={(e) => setNewBagCode(e.target.value)}
                  placeholder="Bag Code"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />
                <input
                  value={newBagDestination}
                  onChange={(e) => setNewBagDestination(e.target.value)}
                  placeholder="Destination"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />
                <PrimaryButton onClick={() => void createBag()} disabled={submitting}>
                  <PlusCircle className="h-4 w-4" />
                  Create Bag
                </PrimaryButton>

                <div className="border-t border-slate-200 pt-4 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  Scan to Bag
                </div>

                <select
                  value={selectedBagId}
                  onChange={(e) => setSelectedBagId(e.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                >
                  <option value="">Select Open Bag</option>
                  {bags.map((bag) => (
                    <option key={bag.id} value={bag.id}>
                      {bag.bag_code || bag.id} · {bag.destination || "Destination"}
                    </option>
                  ))}
                </select>

                <input
                  value={bagTracking}
                  onChange={(e) => setBagTracking(e.target.value)}
                  placeholder="Tracking No"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-mono outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />

                <PrimaryButton onClick={() => void scanToBag()} disabled={submitting}>
                  <Boxes className="h-4 w-4" />
                  Bag Parcel
                </PrimaryButton>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {view === "inbound" && (
        <Panel title="Inbound Receiving">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Inbound Waiting" value={stats.inbound} icon={<Package className="h-5 w-5" />} />
            <MetricCard title="Open Bags" value={bags.length} icon={<Archive className="h-5 w-5" />} />
            <MetricCard title="Sorting Capacity" value={stats.sorting} icon={<Layers3 className="h-5 w-5" />} />
            <MetricCard title="Exceptions" value={stats.exceptions} icon={<AlertTriangle className="h-5 w-5" />} />
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200">
            <div className="grid grid-cols-4 gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
              <div>Bag Code</div>
              <div>Destination</div>
              <div>Parcel Count</div>
              <div>Status</div>
            </div>
            {bags.length === 0 ? (
              <EmptyState text="No open inbound bags." />
            ) : (
              bags.map((bag) => (
                <div key={bag.id} className="grid grid-cols-4 gap-4 border-b border-slate-100 px-4 py-3 text-sm">
                  <div className="font-mono font-semibold text-slate-900">{bag.bag_code || bag.id}</div>
                  <div className="text-slate-700">{bag.destination || "—"}</div>
                  <div className="text-slate-700">{bag.shipments?.length || 0}</div>
                  <div><StatusBadge label={bag.status || "open"} /></div>
                </div>
              ))
            )}
          </div>
        </Panel>
      )}

      {view === "staging" && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Panel title="Move Parcel to Staging">
            <div className="space-y-3">
              <input
                value={stagingTracking}
                onChange={(e) => setStagingTracking(e.target.value)}
                placeholder="Tracking No"
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-mono outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  value={stagingZone}
                  onChange={(e) => setStagingZone(e.target.value)}
                  placeholder="Zone"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />
                <input
                  value={stagingRack}
                  onChange={(e) => setStagingRack(e.target.value)}
                  placeholder="Rack"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />
                <input
                  value={stagingBin}
                  onChange={(e) => setStagingBin(e.target.value)}
                  placeholder="Bin"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />
              </div>
              <PrimaryButton onClick={() => void moveToStaging()} disabled={submitting}>
                <ArrowRightLeft className="h-4 w-4" />
                Move to Staging
              </PrimaryButton>
            </div>
          </Panel>

          <Panel title="Staging Queue">
            <div className="space-y-4">
              {storageRows
                .filter((row) => row.phase === "staging" || row.status === "staging")
                .map((row) => (
                  <div key={row.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-mono font-semibold text-slate-900">{row.trackingNo}</div>
                      <StatusBadge label={row.status} />
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                      Zone {row.zone} · Rack {row.rack} · Bin {row.bin}
                    </div>
                  </div>
                ))}
            </div>
          </Panel>
        </div>
      )}

      {view === "storage" && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Panel title="Move Parcel to Storage">
            <div className="space-y-3">
              <input
                value={storageTracking}
                onChange={(e) => setStorageTracking(e.target.value)}
                placeholder="Tracking No"
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-mono outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  value={storageZone}
                  onChange={(e) => setStorageZone(e.target.value)}
                  placeholder="Zone"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />
                <input
                  value={storageRack}
                  onChange={(e) => setStorageRack(e.target.value)}
                  placeholder="Rack"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />
                <input
                  value={storageBin}
                  onChange={(e) => setStorageBin(e.target.value)}
                  placeholder="Bin"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />
              </div>
              <textarea
                value={storageNote}
                onChange={(e) => setStorageNote(e.target.value)}
                placeholder="Storage note"
                className="min-h-[96px] w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
              />
              <PrimaryButton onClick={() => void moveToStorage()} disabled={submitting}>
                <Warehouse className="h-4 w-4" />
                Put to Storage
              </PrimaryButton>
            </div>
          </Panel>

          <Panel title="Rack / Bin Storage">
            <div className="rounded-2xl border border-slate-200">
              <div className="grid grid-cols-6 gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                <div>Tracking</div>
                <div>Zone</div>
                <div>Rack</div>
                <div>Bin</div>
                <div>Status</div>
                <div>Action</div>
              </div>
              {storageRows.length === 0 ? (
                <EmptyState text="No storage records yet." />
              ) : (
                storageRows.map((row) => (
                  <div key={row.id} className="grid grid-cols-6 gap-4 border-b border-slate-100 px-4 py-3 text-sm">
                    <div className="font-mono font-semibold text-slate-900">{row.trackingNo}</div>
                    <div className="text-slate-700">{row.zone}</div>
                    <div className="text-slate-700">{row.rack}</div>
                    <div className="text-slate-700">{row.bin}</div>
                    <div><StatusBadge label={row.status} /></div>
                    <div>
                      <SecondaryButton
                        onClick={() => void markReadyForDispatch(row.trackingNo)}
                        disabled={row.status === "ready_for_dispatch" || submitting}
                      >
                        Ready
                      </SecondaryButton>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      )}

      {view === "outbound" && (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
            <Panel title="Queue Outbound Batch">
              <div className="space-y-3">
                <input
                  value={outboundBatchNo}
                  onChange={(e) => setOutboundBatchNo(e.target.value)}
                  placeholder="Batch No"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />
                <input
                  value={outboundDestination}
                  onChange={(e) => setOutboundDestination(e.target.value)}
                  placeholder="Destination"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />
                <input
                  value={outboundVehicle}
                  onChange={(e) => setOutboundVehicle(e.target.value)}
                  placeholder="Vehicle No"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />
                <input
                  value={outboundDriver}
                  onChange={(e) => setOutboundDriver(e.target.value)}
                  placeholder="Driver Name"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />
                <input
                  value={outboundParcels}
                  onChange={(e) => setOutboundParcels(e.target.value)}
                  placeholder="Total Parcels"
                  type="number"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />
                <PrimaryButton onClick={() => void queueOutboundBatch()} disabled={submitting}>
                  <Truck className="h-4 w-4" />
                  Queue Batch
                </PrimaryButton>
              </div>
            </Panel>

            <Panel title="Outbound Dispatch Batches">
              <div className="space-y-4">
                {outboundQueue.length === 0 ? (
                  <EmptyState text="No outbound batches queued." />
                ) : (
                  outboundQueue.map((row) => (
                    <div key={row.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">{row.batch_no}</div>
                          <div className="text-sm text-slate-500">
                            {row.destination_name} · {row.vehicle_no || "No vehicle"} · {row.driver_name || "No driver"}
                          </div>
                          <div className="text-sm text-slate-500">{row.total_parcels} parcels</div>
                        </div>
                        <StatusBadge label={row.status} />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <PrimaryButton
                          onClick={() => void dispatchBatch(row.id)}
                          disabled={row.status === "dispatched" || submitting}
                        >
                          <Send className="h-4 w-4" />
                          {row.status === "dispatched" ? "Dispatched" : "Dispatch"}
                        </PrimaryButton>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
            <Panel title="Create / Load Manifest">
              <div className="space-y-3">
                <input
                  value={manifestNo}
                  onChange={(e) => setManifestNo(e.target.value)}
                  placeholder="Manifest No"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />
                <input
                  value={manifestDestination}
                  onChange={(e) => setManifestDestination(e.target.value)}
                  placeholder="Destination"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />
                <input
                  value={manifestVehicle}
                  onChange={(e) => setManifestVehicle(e.target.value)}
                  placeholder="Vehicle No"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />
                <input
                  value={manifestDriver}
                  onChange={(e) => setManifestDriver(e.target.value)}
                  placeholder="Driver Name"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />
                <PrimaryButton onClick={() => void createManifest()} disabled={submitting}>
                  <FileText className="h-4 w-4" />
                  Create Manifest
                </PrimaryButton>

                <div className="border-t border-slate-200 pt-4">
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                    Add Items to Manifest
                  </div>
                  <select
                    value={selectedManifestId}
                    onChange={(e) => setSelectedManifestId(e.target.value)}
                    className="mb-3 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                  >
                    <option value="">Select Manifest</option>
                    {manifests.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.manifest_no} · {m.destination_name}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={manifestTrackingInput}
                    onChange={(e) => setManifestTrackingInput(e.target.value)}
                    placeholder="Enter tracking numbers, one per line or comma-separated"
                    className="min-h-[110px] w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-mono outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <PrimaryButton onClick={() => void addManifestItems()} disabled={submitting}>
                      <Boxes className="h-4 w-4" />
                      Add Items
                    </PrimaryButton>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="Manifests">
              <div className="space-y-4">
                {manifests.length === 0 ? (
                  <EmptyState text="No manifests yet." />
                ) : (
                  manifests.map((row) => (
                    <div key={row.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">{row.manifest_no}</div>
                          <div className="text-sm text-slate-500">
                            {row.destination_name} · {row.vehicle_no || "No vehicle"} · {row.driver_name || "No driver"}
                          </div>
                          <div className="text-sm text-slate-500">
                            {row.item_count ?? row.total_parcels} item(s)
                          </div>
                        </div>
                        <StatusBadge label={row.status} />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <PrimaryButton
                          onClick={() => void closeManifest(row.id)}
                          disabled={row.status === "closed" || submitting}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {row.status === "closed" ? "Closed" : "Close Manifest"}
                        </PrimaryButton>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {view === "qr" && (
        <Panel title="QR Scan Process">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_420px]">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
                  <QrCode className="h-4 w-4" />
                  Receive Scan
                </div>
                <p className="text-sm text-slate-500">
                  Scan parcel on hub arrival. This uses the warehouse scan endpoint with
                  <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">scan_type = inbound</code>.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
                  <Layers3 className="h-4 w-4" />
                  Stage / Sort Scan
                </div>
                <p className="text-sm text-slate-500">
                  Scan again when moving from receiving to sorting lanes using
                  <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">scan_type = sorting</code>.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
                  <Boxes className="h-4 w-4" />
                  Bag / Consolidate
                </div>
                <p className="text-sm text-slate-500">
                  Use bag creation and parcel-to-bag scan before dispatch.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
                  <Truck className="h-4 w-4" />
                  Dispatch Preparation
                </div>
                <p className="text-sm text-slate-500">
                  Storage records move to <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">ready_for_dispatch</code>,
                  then into outbound batches and manifests.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-slate-500">
                Quick Scan
              </div>
              <div className="space-y-3">
                <input
                  value={scanTracking}
                  onChange={(e) => setScanTracking(e.target.value)}
                  placeholder="Tracking No"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-mono outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />
                <select
                  value={scanType}
                  onChange={(e) => setScanType(e.target.value as "inbound" | "sorting")}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                >
                  <option value="inbound">Inbound</option>
                  <option value="sorting">Sorting</option>
                </select>
                <PrimaryButton onClick={() => void submitScan()} disabled={submitting}>
                  <ScanLine className="h-4 w-4" />
                  Process QR Scan
                </PrimaryButton>
              </div>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

function HeroCard({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 shadow-sm">
            <Warehouse className="h-4 w-4 text-[#0d2c54]" />
            <span className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">
              Warehouse Portal
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-[#0d2c54] md:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-4xl text-sm font-medium leading-6 text-slate-500 md:text-[15px]">
            {subtitle}
          </p>
        </div>
        {actions}
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mb-5 border-b border-slate-200/80 pb-5">
        <div className="text-lg font-black tracking-tight text-[#0d2c54]">{title}</div>
      </div>
      {children}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
        active ? "bg-white shadow-sm text-[#0d2c54]" : "text-slate-600 hover:bg-white/60"
      }`}
    >
      {children}
    </button>
  );
}

function MetricCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-[#0d2c54] shadow-inner">
        {icon}
      </div>
      <div className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
        {title}
      </div>
      <div className="mt-3 text-3xl font-black tracking-tight text-[#0d2c54]">{value}</div>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-2xl bg-[#0d2c54] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white disabled:opacity-70"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-70"
    >
      {children}
    </button>
  );
}

function StatusBadge({ label }: { label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] ${statusTone(label)}`}>
      {String(label).replace(/_/g, " ")}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}