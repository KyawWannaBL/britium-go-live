import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Loader2,
  MapPinned,
  Navigation,
  RefreshCw,
} from "lucide-react";
import {
  googleMapsUrl,
  gpsStatusText,
  loadSupervisorLiveMapSnapshot,
  subscribeGpsTables,
  type SupervisorLiveMapPoint,
} from "@/lib/gpsCapture";

type Props = {
  selectedPickupId?: string;
  selectedRequestCode?: string;
};

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4">
      <div className="text-[10px] font-black uppercase tracking-widest text-[#4d7a9b]">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-black ${tone}`}>
        {Number(value || 0).toLocaleString()}
      </div>
    </div>
  );
}

export default function SupervisorLiveMapMonitor({
  selectedPickupId,
  selectedRequestCode,
}: Props) {
  const [rows, setRows] = useState<SupervisorLiveMapPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadGps(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError("");

    try {
      const nextRows = await loadSupervisorLiveMapSnapshot();
      setRows(nextRows);
    } catch (err: any) {
      setError(err?.message || "Unable to load supervisor live map.");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  useEffect(() => {
    void loadGps();

    return subscribeGpsTables(() => {
      void loadGps(false);
    });
  }, []);

  const selectedPoint = useMemo(() => {
    if (!rows.length) return null;

    return (
      rows.find((row) => selectedPickupId && row.pickup_id === selectedPickupId) ||
      rows.find((row) => selectedRequestCode && row.request_code === selectedRequestCode) ||
      rows[0]
    );
  }, [rows, selectedPickupId, selectedRequestCode]);

  const stats = useMemo(() => {
    const gps = rows.filter((row) => row.lat && row.lng).length;
    const live = rows.filter((row) => gpsStatusText(row) === "LIVE").length;

    return {
      total: rows.length,
      gps,
      live,
      waiting: rows.length - gps,
    };
  }, [rows]);

  function openFullMap() {
    const params = new URLSearchParams();

    if (selectedPoint?.pickup_id) params.set("pickup", selectedPoint.pickup_id);
    if (selectedPoint?.request_code) params.set("request", selectedPoint.request_code);
    if (selectedPoint?.rider_email) params.set("rider", selectedPoint.rider_email);
    if (selectedPoint?.rider_code) params.set("riderCode", selectedPoint.rider_code);

    const query = params.toString();
    const target = `${window.location.origin}${window.location.pathname}#/rider/live-map${query ? `?${query}` : ""}`;

    window.open(target, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6 shadow-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="m-0 flex items-center gap-2 text-xl font-black text-white">
            <MapPinned size={21} className="text-[#38bdf8]" />
            Supervisor Live GPS Monitor
          </h2>
          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-[#9bb7cc]">
            Monitor rider GPS capture, assigned pickup progress, and field movement from the supervisor screen.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadGps()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#102b45] px-4 py-3 text-xs font-black uppercase tracking-wider text-[#eef8ff] hover:border-[#38bdf8] disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh GPS
          </button>

          <button
            type="button"
            onClick={openFullMap}
            disabled={!selectedPoint}
            className="inline-flex items-center gap-2 rounded-xl bg-[#38bdf8] px-4 py-3 text-xs font-black uppercase tracking-wider text-[#061524] hover:bg-[#7dd3fc] disabled:opacity-50"
          >
            <ExternalLink size={15} />
            Open Full Map
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <Metric label="Monitor Jobs" value={stats.total} tone="text-[#38bdf8]" />
        <Metric label="GPS Available" value={stats.gps} tone="text-[#22c55e]" />
        <Metric label="Live Now" value={stats.live} tone="text-[#f6b84b]" />
        <Metric label="Waiting GPS" value={stats.waiting} tone="text-[#ff4f93]" />
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="relative min-h-[320px] overflow-hidden rounded-3xl border border-[#1a3a5c] bg-[#061524]">
          <div className="absolute inset-0 opacity-30">
            <div className="h-full w-full bg-[radial-gradient(circle_at_50%_50%,rgba(56,189,248,0.25),transparent_35%),linear-gradient(90deg,rgba(77,122,155,0.15)_1px,transparent_1px),linear-gradient(rgba(77,122,155,0.15)_1px,transparent_1px)] bg-[size:100%_100%,48px_48px,48px_48px]" />
          </div>

          {selectedPoint?.lat && selectedPoint?.lng ? (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-md rounded-3xl border border-[#38bdf8]/50 bg-[#0b2236]/95 p-6 text-center shadow-2xl">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[#38bdf8] bg-[#102b45] text-[#38bdf8]">
                  <Navigation size={28} />
                </div>

                <div className="text-xs font-black uppercase tracking-[0.25em] text-[#38bdf8]">
                  {gpsStatusText(selectedPoint)}
                </div>

                <div className="mt-2 font-mono text-lg font-black text-white">
                  {selectedPoint.lat.toFixed(6)}, {selectedPoint.lng.toFixed(6)}
                </div>

                <div className="mt-2 text-sm font-bold text-[#9bb7cc]">
                  {selectedPoint.rider_name || selectedPoint.rider_email || selectedPoint.rider_code || "Rider"}
                </div>

                <a
                  href={googleMapsUrl(selectedPoint.lat, selectedPoint.lng)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#f6b84b] px-4 py-3 text-xs font-black uppercase tracking-wider text-[#061524] hover:bg-[#e5a93a]"
                >
                  <ExternalLink size={15} />
                  Open GPS Location
                </a>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <div>
                <MapPinned size={42} className="mx-auto mb-4 text-[#4d7a9b]" />
                <div className="text-lg font-black text-white">Waiting for rider GPS</div>
                <div className="mt-2 max-w-md text-sm font-semibold leading-6 text-[#4d7a9b]">
                  The assignment is visible, but the rider has not captured GPS yet.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="max-h-[320px] overflow-auto rounded-3xl border border-[#1a3a5c] bg-[#061524] p-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm font-bold text-[#4d7a9b]">
              <Loader2 className="animate-spin" size={18} />
              Loading GPS...
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#1a3a5c] p-8 text-center text-sm font-bold text-[#4d7a9b]">
              No rider GPS rows yet.
            </div>
          ) : (
            <div className="space-y-3">
              {rows.slice(0, 15).map((point) => {
                const active =
                  selectedPoint &&
                  `${selectedPoint.pickup_id}:${selectedPoint.rider_email || selectedPoint.rider_code}` ===
                    `${point.pickup_id}:${point.rider_email || point.rider_code}`;

                return (
                  <div
                    key={`${point.id}-${point.pickup_id}-${point.rider_email}-${point.rider_code}`}
                    className={`rounded-2xl border p-4 ${
                      active
                        ? "border-[#38bdf8] bg-[#102b45]"
                        : "border-[#1a3a5c] bg-[#0b2236]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="break-words font-mono text-sm font-black text-[#f6b84b]">
                          {point.pickup_id || point.request_code || point.tracking_no || "No pickup"}
                        </div>
                        <div className="mt-1 break-words text-xs font-bold text-white">
                          {point.rider_name || point.rider_email || point.rider_code || "Unassigned rider"}
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
                          point.lat && point.lng
                            ? "bg-[#083927] text-[#22c55e]"
                            : "bg-[#2a1934] text-[#f6b84b]"
                        }`}
                      >
                        {gpsStatusText(point)}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-[#9bb7cc]">
                      <div>{point.township || point.branch_code || "No township/branch"}</div>
                      <div>{point.lat && point.lng ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : "No GPS coordinate yet"}</div>
                      <div>Updated: {point.updated_at ? new Date(point.updated_at).toLocaleString() : "not yet"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
