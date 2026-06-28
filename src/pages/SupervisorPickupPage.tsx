// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, CheckCircle, ClipboardCheck, Download, Filter, RefreshCcw, Search, Truck, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function txt(v: any) { return String(v ?? "").trim(); }
function normalizePickup(row: any) {
  const pickupId = txt(row.pickup_id || row.pickup_code || row.pickup_request_id || row.id || row.request_code);
  return {
    id: txt(row.id || pickupId),
    pickup_id: pickupId,
    pickup_waybill_id: txt(row.pickup_waybill_id || row.waybill_no || row.pickup_way_id),
    waybill_no: txt(row.waybill_no),
    merchant_code: txt(row.merchant_code),
    merchant_name: txt(row.merchant_name || row.customer_name || row.contact_person),
    pickup_address: txt(row.pickup_address || row.address || row.default_pickup_address),
    township: txt(row.township || row.pickup_township),
    city: txt(row.city || row.pickup_city),
    region_state: txt(row.region_state),
    zone: txt(row.zone || row.assigned_zone),
    branch_code: txt(row.branch_code || row.origin_branch_code),
    expected_parcels: Number(row.expected_parcels || row.parcel_count || row.qty || 1),
    pickup_date: txt(row.pickup_date || row.requested_pickup_date),
    vehicle_type: txt(row.vehicle_type || row.vehicle_required),
    pickup_status: txt(row.pickup_status),
    workflow_stage: txt(row.workflow_stage),
    supervisor_status: txt(row.supervisor_status),
    rider_status: txt(row.rider_status),
    assigned_rider_email: txt(row.assigned_rider_email),
    assigned_driver_email: txt(row.assigned_driver_email),
    assigned_helper_email: txt(row.assigned_helper_email),
    assigned_rider_code: txt(row.assigned_rider_code),
    assigned_driver_code: txt(row.assigned_driver_code),
    assigned_helper_code: txt(row.assigned_helper_code),
    assigned_vehicle_id: txt(row.assigned_vehicle_id || row.assigned_fleet_id),
    assigned_fleet_id: txt(row.assigned_fleet_id || row.assigned_vehicle_id),
    has_unread_notification: Boolean(row.has_unread_notification),
    created_at: txt(row.created_at),
  };
}
function normalizeWorker(row: any, fallbackRole: "RIDER" | "DRIVER" | "HELPER") {
  const rawRole = txt(row.role || row.workforce_role || row.employee_type || row.staff_type || fallbackRole).toUpperCase();
  let role = fallbackRole;
  if (rawRole.includes("RIDER")) role = "RIDER";
  if (rawRole.includes("DRIVER")) role = "DRIVER";
  if (rawRole.includes("HELPER")) role = "HELPER";
  const code = txt(row.workforce_code || row.rider_id || row.driver_id || row.helper_id || row.employee_id || row.code || row.id);
  const email = txt(row.email || row.user_email || row.login_email || row.auth_email);
  const name = txt(row.full_name || row.rider_name || row.driver_name || row.helper_name || row.employee_name || row.name || row.display_name || email || code);
  if (!code && !email) return null;
  return { code: code || email, email, name, role, status: txt(row.status || row.record_status || (row.is_active === false ? "Inactive" : "Active")), branch_code: txt(row.branch_code), phone: txt(row.phone_primary || row.phone || row.mobile) };
}
function normalizeFleet(row: any) {
  const id = txt(row.fleet_id || row.vehicle_id || row.id || row.code);
  const vehicleNo = txt(row.vehicle_no || row.plate || row.plate_no || row.vehicle_plate || row.registration_no);
  if (!id && !vehicleNo) return null;
  return { id: id || vehicleNo, vehicle_no: vehicleNo || id, vehicle_type: txt(row.vehicle_type || row.type), status: txt(row.status || row.fleet_status || (row.is_active === false ? "Inactive" : "Available")), branch_code: txt(row.branch_code) };
}
function isActiveStatus(status: any) { return !["INACTIVE", "SUSPENDED", "BLACKLISTED", "MAINTENANCE", "UNAVAILABLE"].includes(txt(status).toUpperCase()); }
function sameBranch(masterBranch?: string, pickupBranch?: string) { if (!masterBranch || !pickupBranch) return true; return masterBranch.toUpperCase() === pickupBranch.toUpperCase(); }
function workerValue(worker: any) { return worker.email || worker.code; }
async function actorEmail() { const { data } = await supabase.auth.getUser(); return data.user?.email || "testsupervisor@britiumexpress.com"; }

export default function SupervisorPickupPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [queue, setQueue] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [helpers, setHelpers] = useState<any[]>([]);
  const [fleets, setFleets] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedRider, setSelectedRider] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [selectedHelper, setSelectedHelper] = useState("");
  const [selectedFleet, setSelectedFleet] = useState("");
  const [supervisorNote, setSupervisorNote] = useState("");

  const selectedPickup = useMemo(() => queue.find((item) => item.id === selectedId || item.pickup_id === selectedId) || null, [queue, selectedId]);
  const eligibleRiders = useMemo(() => riders.filter((row) => sameBranch(row.branch_code, selectedPickup?.branch_code)), [riders, selectedPickup]);
  const eligibleDrivers = useMemo(() => drivers.filter((row) => sameBranch(row.branch_code, selectedPickup?.branch_code)), [drivers, selectedPickup]);
  const eligibleHelpers = useMemo(() => helpers.filter((row) => sameBranch(row.branch_code, selectedPickup?.branch_code)), [helpers, selectedPickup]);
  const eligibleFleets = useMemo(() => fleets.filter((row) => sameBranch(row.branch_code, selectedPickup?.branch_code) && (!selectedPickup?.vehicle_type || !row.vehicle_type || row.vehicle_type === selectedPickup.vehicle_type)), [fleets, selectedPickup]);

  const filteredQueue = useMemo(() => {
    const q = search.trim().toLowerCase();
    return queue.filter((item) => {
      const dateText = String(item.pickup_date || item.created_at || "");
      if (fromDate && dateText < fromDate) return false;
      if (toDate && dateText > toDate) return false;
      if (!q) return true;
      return [item.pickup_id, item.pickup_waybill_id, item.waybill_no, item.merchant_name, item.merchant_code, item.township, item.city, item.branch_code, item.pickup_status, item.workflow_stage].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [queue, search, fromDate, toDate]);

  async function loadQueue() {
    let query = (supabase as any).from("be_v_supervisor_pickup_queue").select("*").order("created_at", { ascending: false }).limit(150);
    if (fromDate) query = query.gte("pickup_date", fromDate);
    if (toDate) query = query.lte("pickup_date", toDate);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(normalizePickup);
  }

  async function loadMasters() {
    let workforceRows: any[] = [];
    try {
      const { data, error } = await (supabase as any).from("be_mobile_workforce_accounts").select("*").order("role", { ascending: true }).order("workforce_code", { ascending: true });
      if (error) throw error;
      workforceRows = data || [];
    } catch { workforceRows = []; }
    if (!workforceRows.length) {
      try {
        const { data } = await (supabase as any).rpc("be_master_data_page_snapshot");
        const snapshot = data || {};
        workforceRows = [...(snapshot.workforce || []), ...(snapshot.workforce_accounts || []), ...(snapshot.riders || []).map((row: any) => ({ ...row, role: "RIDER" })), ...(snapshot.drivers || []).map((row: any) => ({ ...row, role: "DRIVER" })), ...(snapshot.helpers || []).map((row: any) => ({ ...row, role: "HELPER" }))];
      } catch { workforceRows = []; }
    }
    let fleetRows: any[] = [];
    for (const table of ["be_fleet_master", "be_fleet_vehicles", "fleet_master"]) {
      try { const { data, error } = await (supabase as any).from(table).select("*"); if (error) throw error; if (data?.length) { fleetRows = data; break; } } catch {}
    }
    const unique = (rows: any[]) => { const seen = new Set<string>(); return rows.filter((row) => { const key = String(row.email || row.code || row.id || "").toLowerCase(); if (!key || seen.has(key)) return false; seen.add(key); return true; }); };
    const workers = unique(workforceRows.map((row) => normalizeWorker(row, "RIDER")).filter(Boolean)).filter((row) => isActiveStatus(row.status));
    setRiders(workers.filter((row) => row.role === "RIDER"));
    setDrivers(workers.filter((row) => row.role === "DRIVER"));
    setHelpers(workers.filter((row) => row.role === "HELPER"));
    setFleets(unique(fleetRows.map(normalizeFleet).filter(Boolean)).filter((row) => isActiveStatus(row.status)));
  }

  async function loadData(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setMessage("");
    try {
      const [pickupRows] = await Promise.all([loadQueue(), loadMasters()]);
      setQueue(pickupRows);
      if (pickupRows.length && !selectedId) setSelectedId(pickupRows[0].id || pickupRows[0].pickup_id);
    } catch (error: any) {
      setMessage(error?.message || "Unable to synchronize supervisor pickup queue.");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    const safeLoad = async () => { if (!mounted) return; await loadData(false); };
    loadData();
    const channel = supabase
      .channel("supervisor-pickup-live-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "be_portal_pickup_requests" }, safeLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "be_pickup_requests" }, safeLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "be_app_notifications" }, safeLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "be_mobile_workforce_accounts" }, safeLoad)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []);

  function selectPickup(item: any) {
    setSelectedId(item.id || item.pickup_id);
    setSelectedRider(item.assigned_rider_email || item.assigned_rider_code || "");
    setSelectedDriver(item.assigned_driver_email || item.assigned_driver_code || "");
    setSelectedHelper(item.assigned_helper_email || item.assigned_helper_code || "");
    setSelectedFleet(item.assigned_vehicle_id || item.assigned_fleet_id || "");
    setSupervisorNote("");
  }

  async function confirmAssignment() {
    if (!selectedPickup) { setMessage("Please select a pickup request."); return; }
    if (!selectedRider) { setMessage("Go-live workflow requires Rider assignment."); return; }
    if (supervisorNote.length > 500) { setMessage("Supervisor note must be 500 characters or fewer."); return; }
    setLoading(true);
    setMessage("");
    try {
      const email = await actorEmail();
      const { data, error } = await (supabase as any).rpc("be_supervisor_assign_pickup", {
        p_pickup_id: selectedPickup.pickup_id,
        p_rider_email: selectedRider,
        p_driver_email: selectedDriver || null,
        p_helper_email: selectedHelper || null,
        p_vehicle_id: selectedFleet || null,
        p_actor_email: email,
      });
      if (error) throw error;
      await (supabase as any).from("be_app_notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("recipient_role", "supervisor").eq("notification_type", "PICKUP_REQUESTED").eq("pickup_id", selectedPickup.pickup_id);
      setMessage(`Assigned ${selectedPickup.pickup_id}. Rider/Driver app job is now visible.`);
      setSelectedId(""); setSelectedRider(""); setSelectedDriver(""); setSelectedHelper(""); setSelectedFleet(""); setSupervisorNote("");
      await loadData(false);
      console.info("Supervisor assignment result", data);
    } catch (error: any) {
      setMessage(error?.message || "Assignment failed.");
    } finally { setLoading(false); }
  }

  function downloadReport() {
    const headers = ["pickup_id", "merchant_code", "merchant_name", "township", "city", "branch_code", "expected_parcels", "pickup_date", "pickup_status", "workflow_stage", "supervisor_status", "assigned_rider_email", "assigned_driver_email", "assigned_helper_email"];
    const csv = [headers.join(","), ...filteredQueue.map((row) => headers.map((header) => `"${String((row as any)[header] || "").replaceAll('"', '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "supervisor-pickup-assignment-report.csv"; link.click(); URL.revokeObjectURL(url);
  }

  const errorCount = !riders.length ? 1 : 0;
  const warningCount = (!drivers.length ? 1 : 0) + (!helpers.length ? 1 : 0) + (!fleets.length ? 1 : 0);

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="border-b border-[#1a3a5c] pb-4">
        <h1 className="text-[#f6b84b] uppercase mb-1 text-[16px] tracking-widest">SUPERVISOR PICKUP ASSIGNMENT</h1>
        <p className="text-[#4d7a9b] text-[13px]">Live order pickup requests from Pickup Form. Assignment writes Rider/Driver/Helper into backend so mobile apps receive jobs.</p>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl flex flex-col lg:flex-row gap-4 items-end">
        <div className="w-full lg:w-auto">
          <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2 flex items-center gap-1"><Filter size={12} /> From Date</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]" />
        </div>
        <div className="w-full lg:w-auto">
          <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2 flex items-center gap-1"><Filter size={12} /> To Date</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]" />
        </div>
        <div className="w-full lg:flex-1">
          <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2 flex items-center gap-1"><Search size={12} /> Search Pickup</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pickup ID / merchant / township..." className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]" />
        </div>
        <button type="button" onClick={downloadReport} className="bg-[#1a3a5c] text-[#eef8ff] px-6 py-3 rounded-xl text-[12px] uppercase tracking-wider hover:border-[#f6b84b] border border-[#1a3a5c] flex items-center justify-center gap-2 transition-colors cursor-pointer"><Download size={14} /> Download Report</button>
      </div>

      {message ? <div className="bg-[#0b2236] border border-[#1a3a5c] p-4 rounded-2xl flex items-start gap-3 text-[#eef8ff] text-[13px]"><AlertTriangle size={16} className="text-[#f6b84b] mt-0.5 shrink-0" /><span className="break-words">{message}</span></div> : null}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(420px,0.95fr)] gap-6 items-start">
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex flex-col min-h-[560px] min-w-0">
          <div className="p-4 border-b border-[#1a3a5c] flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest flex items-center gap-2"><ClipboardCheck size={16} className="text-[#4ea8de]" /> Live Supervisor Queue</h3>
            <div className="flex items-center gap-3 text-[12px] text-[#4d7a9b]"><span>{filteredQueue.length} records</span><button type="button" onClick={() => loadData()} className="text-[#4ea8de] hover:text-[#f6b84b] flex items-center gap-1 uppercase tracking-widest"><RefreshCcw size={12} /> {loading ? "Syncing..." : "Sync"}</button></div>
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-3">
            {filteredQueue.length === 0 ? (
              <div className="bg-[#061524] border border-[#1a3a5c] p-6 rounded-xl text-center text-[#4d7a9b] text-[13px]">{loading ? "Loading backend pickup queue..." : "No pickup requests loaded from supervisor queue."}</div>
            ) : filteredQueue.map((item) => {
              const active = item.id === selectedId || item.pickup_id === selectedId;
              const assigned = item.supervisor_status === "ASSIGNED" || item.pickup_status === "RIDER_ASSIGNED";
              return (
                <button key={`${item.id}-${item.pickup_id}`} type="button" onClick={() => selectPickup(item)} className={`w-full text-left bg-[#061524] border ${active ? "border-[#f6b84b]" : "border-[#1a3a5c]"} p-4 rounded-xl cursor-pointer transition-colors hover:border-[#f6b84b] min-w-0`}>
                  <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3 mb-3 min-w-0">
                    <div className="min-w-0">
                      <div className="text-[#f6b84b] text-[13px] font-bold break-words flex items-center gap-2">{item.has_unread_notification && !assigned ? <Bell size={14} className="text-[#ff4f93]" /> : null}<span>{item.pickup_id || "Missing Pickup ID"}</span></div>
                      <div className="text-[#4ea8de] text-[11px] mt-1 break-words">{item.waybill_no ? `Waybill: ${item.waybill_no}` : null}{item.workflow_stage ? ` Stage: ${item.workflow_stage}` : null}</div>
                    </div>
                    <span className={`border px-2 py-1 rounded-full text-[10px] uppercase tracking-widest shrink-0 ${assigned ? "bg-[#083927] text-[#22c55e] border-[#0d6b4c]" : "bg-[#2a1934] text-[#ff4f93] border-[#ff4f93]/40"}`}>{assigned ? "Assigned" : "New Request"}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px] min-w-0">
                    <div><div className="text-[#4d7a9b] uppercase tracking-wider text-[10px]">Merchant</div><div className="text-[#eef8ff] break-words">{item.merchant_code ? `${item.merchant_code} - ` : ""}{item.merchant_name || "—"}</div></div>
                    <div><div className="text-[#4d7a9b] uppercase tracking-wider text-[10px]">Location</div><div className="text-[#eef8ff] break-words">{[item.township, item.city, item.branch_code].filter(Boolean).join(", ") || "—"}</div></div>
                    <div><div className="text-[#4d7a9b] uppercase tracking-wider text-[10px]">Parcels / Vehicle</div><div className="text-[#eef8ff] break-words">{item.expected_parcels || 1} / {item.vehicle_type || "Any"}</div></div>
                  </div>
                  <div className="text-[#4d7a9b] text-[12px] mt-3 break-words">{item.pickup_address || "No pickup address available."}</div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-6 min-w-0">
          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex flex-col p-6 min-w-0">
            <h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest mb-6 border-b border-[#1a3a5c] pb-4 flex items-center gap-2"><UserCheck size={16} className="text-[#4ea8de]" /> Assignment Control</h3>
            <div className="space-y-4 mb-6">
              <div><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">Selected Pickup ID</label><input readOnly value={selectedPickup?.pickup_id || ""} placeholder="Select a pickup request" className="w-full bg-[#061524] border border-[#1a3a5c] text-[#4d7a9b] p-3 rounded-xl outline-none text-[13px]" /></div>
              <div><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">Rider - required</label><select value={selectedRider} onChange={(e) => setSelectedRider(e.target.value)} className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] cursor-pointer"><option value="">Select Rider</option>{eligibleRiders.map((rider) => <option key={workerValue(rider)} value={workerValue(rider)}>{rider.code} - {rider.name}{rider.email ? ` (${rider.email})` : ""}</option>)}</select></div>
              <div><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">Driver</label><select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)} className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] cursor-pointer"><option value="">Select Driver</option>{eligibleDrivers.map((driver) => <option key={workerValue(driver)} value={workerValue(driver)}>{driver.code} - {driver.name}{driver.email ? ` (${driver.email})` : ""}</option>)}</select></div>
              <div><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">Helper</label><select value={selectedHelper} onChange={(e) => setSelectedHelper(e.target.value)} className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] cursor-pointer"><option value="">Select Helper</option>{eligibleHelpers.map((helper) => <option key={workerValue(helper)} value={workerValue(helper)}>{helper.code} - {helper.name}{helper.email ? ` (${helper.email})` : ""}</option>)}</select></div>
              <div><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">Vehicle / Fleet</label><select value={selectedFleet} onChange={(e) => setSelectedFleet(e.target.value)} className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] cursor-pointer"><option value="">Select Vehicle</option>{eligibleFleets.map((fleet) => <option key={fleet.id} value={fleet.id}>{fleet.vehicle_no}{fleet.vehicle_type ? ` - ${fleet.vehicle_type}` : ""}</option>)}</select></div>
              <div><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">Supervisor Note</label><textarea value={supervisorNote} onChange={(e) => setSupervisorNote(e.target.value)} maxLength={500} rows={4} placeholder="Route, urgency, parcel handling instruction..." className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] resize-none" /><div className="text-[#4d7a9b] text-[11px] mt-1">{supervisorNote.length}/500</div></div>
            </div>
            <button type="button" disabled={loading || !selectedPickup || !selectedRider} onClick={confirmAssignment} className="w-full bg-[#f6b84b] disabled:opacity-50 disabled:cursor-not-allowed text-[#061524] py-3 rounded-xl text-[12px] uppercase tracking-widest hover:bg-[#e5a93a] transition-colors cursor-pointer flex items-center justify-center gap-2">{loading ? <RefreshCcw size={14} className="animate-spin" /> : <Truck size={14} />} Confirm Assignment</button>
          </div>
          <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl">
            <h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest mb-4 flex items-center gap-2"><CheckCircle size={16} className="text-[#4ea8de]" /> Go-Live Checks</h3>
            <div className="flex flex-wrap gap-2 mb-4 text-[11px] uppercase tracking-widest"><span className="bg-[#08251b] text-[#22c55e] border border-[#0d6b4c] px-3 py-1 rounded-full">Errors: {errorCount}</span><span className="bg-[#30250b] text-[#f6b84b] border border-[#f6b84b]/40 px-3 py-1 rounded-full">Warnings: {warningCount}</span></div>
            <div className="space-y-3">{[["Supervisor queue source", "be_v_supervisor_pickup_queue", "OK"], ["Pickup request selected", selectedPickup?.pickup_id || "Select a pending pickup request.", selectedPickup?.pickup_id ? "OK" : "WARN"], ["Rider app connection", selectedRider || (riders.length ? "Active riders loaded." : "No active rider loaded."), selectedRider || riders.length ? "OK" : "ERROR"], ["Driver app connection", drivers.length ? "Drivers loaded." : "Driver optional.", drivers.length ? "OK" : "WARN"], ["Helper app connection", helpers.length ? "Helpers loaded." : "Helper optional.", helpers.length ? "OK" : "WARN"], ["Fleet master", selectedFleet || (fleets.length ? "Fleet records loaded." : "Fleet optional."), selectedFleet || fleets.length ? "OK" : "WARN"], ["Supervisor note length", `${supervisorNote.length}/500`, supervisorNote.length <= 500 ? "OK" : "ERROR"]].map(([label, detail, status]) => <div key={label} className="bg-[#061524] border border-[#1a3a5c] p-3 rounded-xl min-w-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[#eef8ff] text-[12px] uppercase tracking-wider break-words">{label}</div><div className="text-[#4d7a9b] text-[12px] mt-1 break-words">{detail}</div></div><span className={`text-[10px] px-2 py-1 rounded-full border shrink-0 ${status === "OK" ? "text-[#22c55e] border-[#0d6b4c] bg-[#08251b]" : status === "ERROR" ? "text-[#ff4f93] border-[#ff4f93]/40 bg-[#2a1934]" : "text-[#f6b84b] border-[#f6b84b]/40 bg-[#30250b]"}`}>{status}</span></div></div>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
