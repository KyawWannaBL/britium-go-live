import { useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck,
  ExternalLink,
  LocateFixed,
  MapPinned,
  RefreshCw,
  Search,
  Sparkles,
  Truck,
  UserCheck,
} from "lucide-react";
import {
  assignPickup,
  emptyMasters,
  getActorEmail,
  gpsLink,
  loadLiveGpsRows,
  loadMasters,
  loadPickupQueue,
  subscribeSupervisorAssignmentSync,
  workerLabel,
  workerValue,
  type FleetOption,
  type LiveGpsPoint,
  type Masters,
  type PickupOrder,
  type WorkforceOption,
} from "@/lib/supervisorAssignmentSync";

function findWorker(rows: WorkforceOption[], value: string) {
  return rows.find((row) => row.email === value || row.code === value);
}

function findFleet(rows: FleetOption[], value: string) {
  return rows.find((row) => row.id === value || row.vehicle_no === value);
}

function matchSearch(row: PickupOrder, search: string) {
  const text = search.trim().toLowerCase();
  if (!text) return true;

  return [
    row.pickup_id,
    row.pickup_way_id,
    row.request_code,
    row.waybill_no,
    row.merchant_code,
    row.merchant_name,
    row.pickup_address,
    row.township,
    row.city,
    row.branch_code,
    row.pickup_status,
    row.workflow_stage,
    row.supervisor_status,
  ]
    .join(" ")
    .toLowerCase()
    .includes(text);
}

function gpsAge(updatedAt?: string) {
  const time = Date.parse(updatedAt || "");
  if (!time) return "NO TIME";
  const mins = Math.round((Date.now() - time) / 60000);
  if (mins <= 5) return "LIVE";
  return `${mins} MIN AGO`;
}

export default function SupervisorPickupAssignmentGoLivePage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const [queue, setQueue] = useState<PickupOrder[]>([]);
  const [masters, setMasters] = useState<Masters>(emptyMasters);
  const [gpsRows, setGpsRows] = useState<LiveGpsPoint[]>([]);

  const [selectedId, setSelectedId] = useState("");
  const [selectedRider, setSelectedRider] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [selectedHelper, setSelectedHelper] = useState("");
  const [selectedFleet, setSelectedFleet] = useState("");
  const [note, setNote] = useState("");

  const filteredQueue = useMemo(
    () => queue.filter((row) => matchSearch(row, search)),
    [queue, search],
  );

  const selectedPickup = useMemo(
    () =>
      queue.find(
        (row) =>
          row.id === selectedId ||
          row.pickup_id === selectedId ||
          row.pickup_way_id === selectedId ||
          row.request_code === selectedId,
      ) || null,
    [queue, selectedId],
  );

  const selectedGps = useMemo(() => {
    if (!selectedPickup) return gpsRows[0] || null;

    return (
      gpsRows.find((row) => row.pickup_id === selectedPickup.pickup_id) ||
      gpsRows.find((row) => row.pickup_id === selectedPickup.pickup_way_id) ||
      gpsRows.find((row) => row.request_code === selectedPickup.request_code) ||
      gpsRows.find((row) => row.rider_email && row.rider_email === selectedPickup.assigned_rider_email) ||
      gpsRows.find((row) => row.rider_code && row.rider_code === selectedPickup.assigned_rider_code) ||
      null
    );
  }, [gpsRows, selectedPickup]);

  async function loadData(showSpinner = true) {
    if (showSpinner) setLoading(true);

    try {
      const [nextQueue, nextMasters, nextGps] = await Promise.all([
        loadPickupQueue(),
        loadMasters(),
        loadLiveGpsRows(),
      ]);

      setQueue(nextQueue);
      setMasters(nextMasters);
      setGpsRows(nextGps);

      if (nextQueue.length) {
        setSelectedId((current) =>
          nextQueue.some((row) => row.id === current || row.pickup_id === current)
            ? current
            : nextQueue[0].id || nextQueue[0].pickup_id,
        );
      } else {
        setSelectedId("");
      }

      setMessage(
        `Synced CS Queue: ${nextQueue.length}. Rider: ${nextMasters.riders.length}, Driver: ${nextMasters.drivers.length}, Helper: ${nextMasters.helpers.length}, Fleet: ${nextMasters.fleets.length}, GPS: ${nextGps.length}.`,
      );
    } catch (error: any) {
      setMessage(error?.message || "Unable to synchronize supervisor assignment.");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();

    return subscribeSupervisorAssignmentSync(() => {
      void loadData(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedPickup) return;

    setSelectedRider(selectedPickup.assigned_rider_email || selectedPickup.assigned_rider_code || "");
    setSelectedDriver(selectedPickup.assigned_driver_email || selectedPickup.assigned_driver_code || "");
    setSelectedHelper(selectedPickup.assigned_helper_email || selectedPickup.assigned_helper_code || "");
    setSelectedFleet(selectedPickup.assigned_vehicle_id || selectedPickup.assigned_fleet_id || "");
    setNote(selectedPickup.supervisor_note || "");
  }, [selectedPickup?.id]);

  function selectPickup(row: PickupOrder) {
    setSelectedId(row.id || row.pickup_id);
  }

  function smartSuggestion() {
    if (!selectedPickup) return;

    const rider =
      masters.riders.find((row) => row.branch_code && row.branch_code === selectedPickup.branch_code) ||
      masters.riders[0];

    const driver =
      masters.drivers.find((row) => row.branch_code && row.branch_code === selectedPickup.branch_code) ||
      masters.drivers[0];

    const helper =
      masters.helpers.find((row) => row.branch_code && row.branch_code === selectedPickup.branch_code) ||
      masters.helpers[0];

    const fleet =
      masters.fleets.find((row) => row.branch_code && row.branch_code === selectedPickup.branch_code) ||
      masters.fleets[0];

    setSelectedRider(rider ? workerValue(rider) : "");
    setSelectedDriver(driver ? workerValue(driver) : "");
    setSelectedHelper(helper ? workerValue(helper) : "");
    setSelectedFleet(fleet?.id || "");
  }

  async function handleAssign() {
    if (!selectedPickup) {
      setMessage("Select a CS pickup order first.");
      return;
    }

    if (!selectedRider) {
      setMessage("Go-live workflow requires Rider assignment.");
      return;
    }

    setLoading(true);

    try {
      const rider = findWorker(masters.riders, selectedRider);
      const driver = findWorker(masters.drivers, selectedDriver);
      const helper = findWorker(masters.helpers, selectedHelper);
      const fleet = findFleet(masters.fleets, selectedFleet);
      const actorEmail = await getActorEmail();

      await assignPickup({
        pickup_id: selectedPickup.pickup_id || selectedPickup.pickup_way_id || selectedPickup.request_code,
        rider_email: rider?.email || selectedRider,
        driver_email: driver?.email || selectedDriver || null,
        helper_email: helper?.email || selectedHelper || null,
        vehicle_id: fleet?.id || selectedFleet || null,
        supervisor_note: note,
        actor_email: actorEmail || null,
      });

      setMessage(`Assigned ${selectedPickup.pickup_id}. Synced to Supervisor Wayplan, Rider App, and Data Entry source row.`);
      await loadData(false);
    } catch (error: any) {
      setMessage(error?.message || "Assignment failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 overflow-x-hidden text-[#eef8ff]">
      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.35em] text-[#ff7a3d]">
              Britium Express
            </div>
            <h1 className="mt-2 text-2xl font-black">Supervisor Assignment</h1>
            <p className="mt-2 text-sm font-semibold text-[#9bb7cc]">
              CS pickup order waiting list + assignment template + Rider/Data Entry/Wayplan sync.
            </p>
          </div>

          <button
            type="button"
            onClick={() => loadData()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ff7a3d] px-5 py-3 text-sm font-black text-[#061524] disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Master Data Sync
          </button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-6">
          <Metric label="Rider" value={masters.riders.length} />
          <Metric label="Driver" value={masters.drivers.length} />
          <Metric label="Helper" value={masters.helpers.length} />
          <Metric label="Fleet" value={masters.fleets.length} />
          <Metric label="Queue" value={queue.length} />
          <Metric label="GPS" value={gpsRows.length} />
        </div>

        {message ? (
          <div className="mt-5 rounded-2xl border border-[#0d6b4c] bg-[#06352f] px-4 py-3 text-sm font-bold text-[#22c55e]">
            {message}
          </div>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.05fr)]">
        <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236]">
          <div className="border-b border-[#1a3a5c] p-5">
            <h2 className="flex items-center gap-2 font-black">
              <ClipboardCheck size={18} className="text-[#ff7a3d]" />
              Waiting CS Pickup Requests
            </h2>

            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[#1a3a5c] bg-[#061524] px-4 py-3">
              <Search size={16} className="text-[#4d7a9b]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Pickup / Merchant / Phone / Township..."
                className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-[#4d7a9b]"
              />
            </div>
          </div>

          <div className="max-h-[700px] space-y-4 overflow-auto p-5">
            {filteredQueue.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#1a3a5c] p-10 text-center text-sm font-bold text-[#4d7a9b]">
                No pickup requests in supervisor queue.
              </div>
            ) : (
              filteredQueue.map((row) => {
                const active = selectedPickup?.id === row.id;
                const assigned = row.supervisor_status === "ASSIGNED";

                return (
                  <div
                    key={row.id}
                    className={`rounded-2xl border p-4 transition-all ${
                      active
                        ? "border-[#ff7a3d] bg-[#2b2734]"
                        : "border-[#1a3a5c] bg-[#182d30] hover:border-[#f6b84b]/70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-mono text-base font-black text-[#ff7a3d]">
                          {row.pickup_id || row.pickup_way_id}
                        </div>
                        <div className="mt-1 text-sm font-bold text-[#9bb7cc]">
                          {row.request_code}
                        </div>
                      </div>

                      <span className={`rounded-full px-4 py-2 text-xs font-black ${
                        assigned ? "bg-[#083927] text-[#22c55e]" : "bg-[#f6b84b] text-[#061524]"
                      }`}>
                        {assigned ? "assigned" : "submitted"}
                      </span>
                    </div>

                    <div className="mt-4 text-center">
                      <div className="text-lg font-black">{row.merchant_name || "-"}</div>
                      <div className="mt-3 text-sm font-semibold leading-6 text-[#9bb7cc]">
                        {row.pickup_address || "-"} {row.township ? `· ${row.township}` : ""}
                      </div>
                      <div className="mt-2 text-sm font-black text-[#f6b84b]">
                        Parcels: {row.expected_parcels || 1}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => selectPickup(row)}
                      className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black uppercase tracking-wider ${
                        active
                          ? "bg-[#ff7a3d] text-[#061524]"
                          : "bg-[#102b45] text-[#eef8ff] hover:bg-[#1a3a5c]"
                      }`}
                    >
                      <UserCheck size={16} />
                      {active ? "Selected" : "Select This Order"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="flex items-center gap-2 font-black">
                <Truck size={18} className="text-[#ff7a3d]" />
                Assignment Template
              </h2>

              <button
                type="button"
                onClick={smartSuggestion}
                disabled={!selectedPickup}
                className="inline-flex items-center gap-2 rounded-2xl border border-purple-400 bg-purple-500/20 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                <Sparkles size={16} />
                Smart Suggestion
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Pickup WayID" value={selectedPickup?.pickup_way_id || selectedPickup?.pickup_id || ""} />
              <Field label="Request Code" value={selectedPickup?.request_code || ""} />

              <SelectField label="Rider - required" value={selectedRider} onChange={setSelectedRider}>
                <option value="">Select Rider</option>
                {masters.riders.map((worker) => (
                  <option key={workerValue(worker)} value={workerValue(worker)}>
                    {workerLabel(worker)}
                  </option>
                ))}
              </SelectField>

              <SelectField label="Van / Fleet" value={selectedFleet} onChange={setSelectedFleet}>
                <option value="">Select Fleet</option>
                {masters.fleets.map((fleet) => (
                  <option key={fleet.id} value={fleet.id}>
                    {[fleet.vehicle_no, fleet.vehicle_type, fleet.branch_code].filter(Boolean).join(" - ")}
                  </option>
                ))}
              </SelectField>

              <SelectField label="Driver" value={selectedDriver} onChange={setSelectedDriver}>
                <option value="">Select Driver</option>
                {masters.drivers.map((worker) => (
                  <option key={workerValue(worker)} value={workerValue(worker)}>
                    {workerLabel(worker)}
                  </option>
                ))}
              </SelectField>

              <SelectField label="Helper" value={selectedHelper} onChange={setSelectedHelper}>
                <option value="">Select Helper</option>
                {masters.helpers.map((worker) => (
                  <option key={workerValue(worker)} value={workerValue(worker)}>
                    {workerLabel(worker)}
                  </option>
                ))}
              </SelectField>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-black text-[#ff7a3d]">
                Supervisor Note ({note.length}/500)
              </label>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value.slice(0, 500))}
                placeholder="Pickup timing, fragile item, route instruction, phone note..."
                className="min-h-[120px] w-full rounded-xl border border-[#1a3a5c] bg-[#061524] p-4 text-sm font-bold outline-none focus:border-[#f6b84b]"
              />
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <SummaryBox label="Selected Rider" value={selectedRider || "-"} />
              <SummaryBox label="Selected Vehicle" value={selectedFleet || "-"} />
            </div>

            <button
              type="button"
              onClick={handleAssign}
              disabled={loading || !selectedPickup || !selectedRider}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#a46642] px-5 py-5 text-sm font-black uppercase tracking-wider text-[#061524] disabled:opacity-50"
            >
              <LocateFixed size={18} />
              Confirm Assignment + Sync Rider App
            </button>

            <div className="mt-4 text-sm font-black text-[#ff4f93]">
              Go-live workflow requires Rider assignment.
            </div>
          </div>

          <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
            <h2 className="flex items-center gap-2 font-black">
              <MapPinned size={18} className="text-[#38bdf8]" />
              Supervisor GPS Live Map Monitor
            </h2>

            <div className="mt-5 rounded-3xl border border-[#1a3a5c] bg-[#061524] p-6 text-center">
              {selectedGps?.lat && selectedGps?.lng ? (
                <>
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#38bdf8] text-[#38bdf8]">
                    <MapPinned size={30} />
                  </div>
                  <div className="mt-4 text-xs font-black uppercase tracking-[0.3em] text-[#38bdf8]">
                    {gpsAge(selectedGps.updated_at)}
                  </div>
                  <div className="mt-2 font-mono text-xl font-black">
                    {selectedGps.lat.toFixed(6)}, {selectedGps.lng.toFixed(6)}
                  </div>
                  <div className="mt-2 text-sm font-bold text-[#9bb7cc]">
                    {selectedGps.rider_name || selectedGps.rider_email || selectedGps.rider_code || "Rider"}
                  </div>
                  <a
                    href={gpsLink(selectedGps)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#38bdf8] px-5 py-3 text-sm font-black text-[#061524]"
                  >
                    <ExternalLink size={16} />
                    Open GPS Location
                  </a>
                </>
              ) : (
                <>
                  <MapPinned size={46} className="mx-auto text-[#4d7a9b]" />
                  <div className="mt-4 text-lg font-black">Waiting for rider GPS</div>
                  <div className="mt-2 text-sm font-semibold text-[#4d7a9b]">
                    After rider captures GPS from the rider app, supervisor can monitor here.
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4">
      <div className="text-xs font-black text-[#9bb7cc]">{label}</div>
      <div className="mt-1 text-2xl font-black text-[#ff7a3d]">{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-black text-[#ff7a3d]">{label}</label>
      <input
        readOnly
        value={value}
        className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] p-4 text-sm font-black outline-none"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-black text-[#ff7a3d]">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] p-4 text-sm font-black outline-none focus:border-[#f6b84b]"
      >
        {children}
      </select>
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-4">
      <div className="text-sm font-black text-[#9bb7cc]">{label}</div>
      <div className="mt-2 break-words text-sm font-black">{value}</div>
    </div>
  );
}
