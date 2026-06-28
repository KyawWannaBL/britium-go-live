import { useEffect, useMemo, useState } from "react";
import {
  Database,
  ExternalLink,
  LocateFixed,
  MapPinned,
  Radio,
  RefreshCw,
  Route,
  Smartphone,
  Truck,
  Users,
  Workflow,
} from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  gpsLink,
  loadLiveGpsRows,
  loadPickupQueue,
  loadWayplanRows,
  subscribeSupervisorAssignmentSync,
  type LiveGpsPoint,
  type PickupOrder,
} from "@/lib/supervisorAssignmentSync";

const MAPBOX_TOKEN =
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ||
  import.meta.env.VITE_MAPBOX_TOKEN ||
  "";

const RIDER_APP_URL =
  import.meta.env.VITE_RIDER_APP_URL ||
  "https://uat.britiumexpress.app";

function ageText(updatedAt?: string) {
  const time = Date.parse(updatedAt || "");
  if (!time) return "No timestamp";

  const mins = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (mins <= 5) return "Live now";
  if (mins < 60) return `${mins} min ago`;

  const hours = Math.round(mins / 60);
  return `${hours} hr ago`;
}

function pointKey(point: LiveGpsPoint) {
  return point.id || point.rider_email || point.rider_code || point.pickup_id || point.request_code;
}

function defaultCenter(points: LiveGpsPoint[]) {
  const live = points.find((point) => point.lat && point.lng);

  return {
    lat: live?.lat || 16.8409,
    lng: live?.lng || 96.1561,
  };
}

export default function SupervisorLiveMapManagementPanel() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [pickupRows, setPickupRows] = useState<PickupOrder[]>([]);
  const [wayplanRows, setWayplanRows] = useState<PickupOrder[]>([]);
  const [gpsRows, setGpsRows] = useState<LiveGpsPoint[]>([]);
  const [selectedGpsKey, setSelectedGpsKey] = useState("");

  const selectedGps = useMemo(
    () => gpsRows.find((point) => pointKey(point) === selectedGpsKey) || gpsRows[0] || null,
    [gpsRows, selectedGpsKey],
  );

  const stats = useMemo(
    () => ({
      queue: pickupRows.length,
      assigned: pickupRows.filter((row) => row.supervisor_status === "ASSIGNED").length,
      pending: pickupRows.filter((row) => row.supervisor_status !== "ASSIGNED").length,
      wayplans: wayplanRows.length,
      gps: gpsRows.filter((row) => row.lat && row.lng).length,
      live: gpsRows.filter((row) => row.lat && row.lng && ageText(row.updated_at) === "Live now").length,
    }),
    [pickupRows, wayplanRows, gpsRows],
  );

  async function loadData(showSpinner = true) {
    if (showSpinner) setLoading(true);

    try {
      const [pickups, wayplans, gps] = await Promise.all([
        loadPickupQueue(),
        loadWayplanRows(),
        loadLiveGpsRows(),
      ]);

      setPickupRows(pickups);
      setWayplanRows(wayplans);
      setGpsRows(gps);

      if (gps.length) {
        setSelectedGpsKey((current) =>
          gps.some((point) => pointKey(point) === current)
            ? current
            : pointKey(gps[0]),
        );
      }

      setMessage(`Management sync: ${pickups.length} pickups, ${wayplans.length} wayplans, ${gps.length} GPS rows.`);
    } catch (error: any) {
      setMessage(error?.message || "Unable to load supervisor management map.");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  function openRiderLiveMap(point?: LiveGpsPoint | null) {
    const params = new URLSearchParams();

    params.set("rider_email", point?.rider_email || "testrider@britiumexpress.com");
    params.set("rider_code", point?.rider_code || "UAT-RIDER-001");

    if (point?.pickup_id) params.set("pickup", point.pickup_id);
    if (point?.request_code) params.set("request", point.request_code);

    const target = `${RIDER_APP_URL.replace(/\/$/, "")}/#/rider/live-map?${params.toString()}`;
    window.open(target, "_blank", "noopener,noreferrer");
  }

  function openGoogleMap(point?: LiveGpsPoint | null) {
    const link = gpsLink(point || null);
    if (link) window.open(link, "_blank", "noopener,noreferrer");
  }

  function go(path: string) {
    window.location.hash = path;
  }

  useEffect(() => {
    void loadData();

    return subscribeSupervisorAssignmentSync(() => {
      void loadData(false);
    });
  }, []);

  useEffect(() => {
    if (!MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const container = document.getElementById("supervisor-management-mapbox");
    if (!container) return;

    container.innerHTML = "";

    const center = selectedGps?.lat && selectedGps?.lng
      ? { lat: selectedGps.lat, lng: selectedGps.lng }
      : defaultCenter(gpsRows);

    const map = new mapboxgl.Map({
      container,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [center.lng, center.lat],
      zoom: gpsRows.length ? 12 : 10.8,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    const livePoints = gpsRows.filter((point) => point.lat && point.lng);

    if (livePoints.length) {
      livePoints.forEach((point) => {
        const popupHtml = `
          <div style="font-family:Arial,sans-serif">
            <strong>${point.rider_email || point.rider_code || "Rider"}</strong><br/>
            Pickup: ${point.pickup_id || "-"}<br/>
            Request: ${point.request_code || "-"}<br/>
            Updated: ${ageText(point.updated_at)}
          </div>
        `;

        new mapboxgl.Marker({
          color: pointKey(point) === selectedGpsKey ? "#ff7a3d" : "#f6b84b",
        })
          .setLngLat([point.lng as number, point.lat as number])
          .setPopup(new mapboxgl.Popup().setHTML(popupHtml))
          .addTo(map);
      });
    } else {
      new mapboxgl.Marker({ color: "#38bdf8" })
        .setLngLat([center.lng, center.lat])
        .setPopup(new mapboxgl.Popup().setText("Yangon default supervisor map center"))
        .addTo(map);
    }

    return () => {
      map.remove();
    };
  }, [gpsRows, selectedGpsKey, selectedGps?.lat, selectedGps?.lng]);

  return (
    <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236]">
      <div className="flex flex-col gap-4 border-b border-[#1a3a5c] p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black">
            <MapPinned size={19} className="text-[#38bdf8]" />
            Supervisor Wayplan + Live Map Management
          </h2>
          <p className="mt-1 text-sm font-semibold text-[#9bb7cc]">
            Mapbox monitor for pickup queue, wayplan rows, rider dispatch, fleet control, data-entry sync, and live GPS.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadData()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-sm font-black text-[#eef8ff] disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Sync Management
          </button>

          <button
            type="button"
            onClick={() => openRiderLiveMap(selectedGps)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#38bdf8] px-4 py-3 text-sm font-black text-[#061524]"
          >
            <Smartphone size={15} />
            Open Rider Live Map
          </button>

          <button
            type="button"
            onClick={() => openGoogleMap(selectedGps)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#f6b84b] px-4 py-3 text-sm font-black text-[#061524]"
          >
            <ExternalLink size={15} />
            Google Map
          </button>
        </div>
      </div>

      {message ? (
        <div className="mx-5 mt-5 rounded-2xl border border-[#0d6b4c] bg-[#06352f] px-4 py-3 text-sm font-bold text-[#22c55e]">
          {message}
        </div>
      ) : null}

      <div className="grid gap-3 p-5 md:grid-cols-6">
        <ManagementMetric icon={<Truck size={17} />} label="Pickup Queue" value={stats.queue} />
        <ManagementMetric icon={<Workflow size={17} />} label="Assigned" value={stats.assigned} />
        <ManagementMetric icon={<Route size={17} />} label="Wayplans" value={stats.wayplans} />
        <ManagementMetric icon={<Radio size={17} />} label="GPS Rows" value={stats.gps} />
        <ManagementMetric icon={<LocateFixed size={17} />} label="Live GPS" value={stats.live} />
        <ManagementMetric icon={<Database size={17} />} label="Data Sync" value={stats.queue ? 1 : 0} />
      </div>

      <div className="grid gap-0 border-t border-[#1a3a5c] xl:grid-cols-[minmax(0,1.25fr)_430px]">
        <div className="min-h-[520px] bg-[#061524]">
          {MAPBOX_TOKEN ? (
            <div id="supervisor-management-mapbox" className="h-[560px] w-full" />
          ) : (
            <div className="grid h-[560px] place-items-center p-6 text-center">
              <div>
                <MapPinned size={48} className="mx-auto text-[#38bdf8]" />
                <h3 className="mt-4 text-xl font-black">Mapbox token missing</h3>
                <p className="mt-2 text-sm font-semibold text-[#9bb7cc]">
                  Add VITE_MAPBOX_ACCESS_TOKEN in the enterprise portal Vercel project. Management data still loads.
                </p>
              </div>
            </div>
          )}
        </div>

        <aside className="border-l border-[#1a3a5c] p-5">
          <div className="rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4">
            <div className="text-xs font-black uppercase tracking-widest text-[#9bb7cc]">
              Selected GPS / Rider
            </div>

            <div className="mt-2 break-words text-lg font-black text-[#f6b84b]">
              {selectedGps?.rider_email || selectedGps?.rider_code || "No rider GPS yet"}
            </div>

            <div className="mt-2 text-sm font-bold text-[#9bb7cc]">
              Pickup: {selectedGps?.pickup_id || "-"}
            </div>

            <div className="mt-1 text-sm font-bold text-[#9bb7cc]">
              Request: {selectedGps?.request_code || "-"}
            </div>

            <div className="mt-3 rounded-xl border border-[#1a3a5c] bg-[#0b2236] p-3 text-sm font-black text-[#38bdf8]">
              {selectedGps?.lat && selectedGps?.lng
                ? `${selectedGps.lat.toFixed(6)}, ${selectedGps.lng.toFixed(6)}`
                : "Waiting for GPS capture"}
            </div>

            <div className="mt-2 text-xs font-black text-[#f6b84b]">
              {ageText(selectedGps?.updated_at)}
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            <ManagementButton icon={<Workflow size={15} />} label="Supervisor Pickup" onClick={() => go("/supervisor-pickup")} />
            <ManagementButton icon={<Route size={15} />} label="Supervisor Wayplan" onClick={() => go("/supervisor-wayplan")} />
            <ManagementButton icon={<Database size={15} />} label="Data Entry" onClick={() => go("/data-entry")} />
            <ManagementButton icon={<Users size={15} />} label="Rider Settlement" onClick={() => go("/rider-settlement")} />
            <ManagementButton icon={<Truck size={15} />} label="Dispatch Command" onClick={() => go("/dispatch-command")} />
          </div>

          <div className="mt-5 max-h-[240px] space-y-2 overflow-auto">
            {gpsRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#1a3a5c] p-4 text-center text-sm font-bold text-[#7aa0bd]">
                No GPS rows yet. Open rider app and capture GPS.
              </div>
            ) : (
              gpsRows.map((point) => (
                <button
                  key={pointKey(point)}
                  type="button"
                  onClick={() => setSelectedGpsKey(pointKey(point))}
                  className={`w-full rounded-xl border p-3 text-left text-sm transition ${
                    pointKey(point) === selectedGpsKey
                      ? "border-[#f6b84b] bg-[#392a08]"
                      : "border-[#1a3a5c] bg-[#061524] hover:border-[#38bdf8]"
                  }`}
                >
                  <div className="font-black text-[#f6b84b]">
                    {point.rider_email || point.rider_code || "Rider"}
                  </div>
                  <div className="mt-1 text-xs font-bold text-[#9bb7cc]">
                    {point.pickup_id || point.request_code || "-"}
                  </div>
                  <div className="mt-1 text-xs font-black text-[#38bdf8]">
                    {ageText(point.updated_at)}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function ManagementMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4">
      <div className="text-[#38bdf8]">{icon}</div>
      <div className="mt-2 text-xs font-black uppercase tracking-widest text-[#9bb7cc]">{label}</div>
      <div className="mt-1 text-2xl font-black text-[#ff7a3d]">{value}</div>
    </div>
  );
}

function ManagementButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-full items-center justify-between rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-left text-sm font-black text-[#eef8ff] hover:border-[#38bdf8]"
    >
      <span className="inline-flex items-center gap-2">
        {icon}
        {label}
      </span>
      <ExternalLink size={14} className="text-[#4d7a9b]" />
    </button>
  );
}
