import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Bell, CheckCircle2, RefreshCw, Search, ShieldCheck, Truck, UserCheck } from "lucide-react";

type PickupQueueItem = {
  id: string;
  pickup_id: string;
  waybill_no?: string;
  merchant_code?: string;
  merchant_name?: string;
  pickup_address?: string;
  township?: string;
  city?: string;
  branch_code?: string;
  expected_parcels?: number;
  pickup_status?: string;
  workflow_stage?: string;
  supervisor_status?: string;
  rider_status?: string;
  assigned_rider_email?: string;
  assigned_driver_email?: string;
  assigned_helper_email?: string;
  assigned_rider_code?: string;
  assigned_driver_code?: string;
  assigned_helper_code?: string;
  assigned_vehicle_id?: string;
  has_unread_notification?: boolean;
  created_at?: string;
};

type WorkforceOption = {
  code: string;
  email: string;
  name: string;
  role: "RIDER" | "DRIVER" | "HELPER" | string;
  status?: string;
  branch_code?: string;
  assigned_zone?: string;
};

type FleetOption = {
  id: string;
  vehicle_no: string;
  vehicle_type?: string;
  ownership_type?: string;
  status?: string;
  branch_code?: string;
};

function asText(value: any) {
  return String(value ?? "").trim();
}

function isActiveStatus(status: any) {
  return !["INACTIVE", "SUSPENDED", "BLACKLISTED", "MAINTENANCE", "UNAVAILABLE"].includes(asText(status).toUpperCase());
}

function getQueueKey(item: PickupQueueItem) {
  return item.pickup_id || item.id || "";
}

function normalizePickup(row: any): PickupQueueItem {
  const pickupId = asText(row.pickup_id || row.pickup_code || row.pickup_request_id || row.id);

  return {
    id: asText(row.id || pickupId),
    pickup_id: pickupId,
    waybill_no: asText(row.waybill_no),
    merchant_code: asText(row.merchant_code),
    merchant_name: asText(row.merchant_name || row.customer_name || row.contact_person),
    pickup_address: asText(row.pickup_address || row.address || row.default_pickup_address),
    township: asText(row.township || row.pickup_township),
    city: asText(row.city || row.pickup_city),
    branch_code: asText(row.branch_code || row.origin_branch_code),
    expected_parcels: Number(row.expected_parcels || row.parcel_count || row.qty || 1),
    pickup_status: asText(row.pickup_status),
    workflow_stage: asText(row.workflow_stage),
    supervisor_status: asText(row.supervisor_status),
    rider_status: asText(row.rider_status),
    assigned_rider_email: asText(row.assigned_rider_email),
    assigned_driver_email: asText(row.assigned_driver_email),
    assigned_helper_email: asText(row.assigned_helper_email),
    assigned_rider_code: asText(row.assigned_rider_code),
    assigned_driver_code: asText(row.assigned_driver_code),
    assigned_helper_code: asText(row.assigned_helper_code),
    assigned_vehicle_id: asText(row.assigned_vehicle_id || row.assigned_fleet_id),
    has_unread_notification: Boolean(row.has_unread_notification),
    created_at: asText(row.created_at),
  };
}

function normalizeWorker(row: any, fallbackRole = ""): WorkforceOption {
  const role = asText(row.role || row.workforce_role || row.employee_type || row.staff_type || fallbackRole).toUpperCase();

  return {
    code: asText(row.workforce_code || row.rider_id || row.driver_id || row.helper_id || row.employee_id || row.code || row.id || row.email),
    email: asText(row.email || row.user_email || row.login_email || row.auth_email),
    name: asText(row.full_name || row.rider_name || row.driver_name || row.helper_name || row.employee_name || row.name || row.display_name || row.email || row.workforce_code),
    role,
    status: asText(row.status || row.record_status || (row.is_active === false ? "Inactive" : "Active")),
    branch_code: asText(row.branch_code),
    assigned_zone: asText(row.assigned_zone || row.zone),
  };
}

function normalizeFleet(row: any): FleetOption {
  return {
    id: asText(row.fleet_id || row.vehicle_id || row.id || row.code || row.vehicle_no),
    vehicle_no: asText(row.vehicle_no || row.plate || row.plate_no || row.vehicle_plate || row.registration_no || row.vehicle_id),
    vehicle_type: asText(row.vehicle_type || row.type),
    ownership_type: asText(row.ownership_type),
    status: asText(row.status || row.fleet_status || (row.is_active === false ? "Inactive" : "Available")),
    branch_code: asText(row.branch_code),
  };
}

function workerValue(worker: WorkforceOption) {
  return worker.email || worker.code;
}

async function getActorEmail() {
  const { data } = await supabase.auth.getUser();
  return data.user?.email || "testsupervisor@britiumexpress.com";
}

async function loadAssignmentMasters() {
  let workforceRows: any[] = [];

  try {
    const { data, error } = await (supabase as any)
      .from("be_mobile_workforce_accounts")
      .select("*")
      .order("role", { ascending: true })
      .order("workforce_code", { ascending: true });

    if (error) throw error;
    workforceRows = data || [];
  } catch {
    workforceRows = [];
  }

  if (!workforceRows.length) {
    try {
      const { data } = await (supabase as any).rpc("be_master_data_page_snapshot");
      const snapshot = data || {};
      workforceRows = [
        ...(snapshot.workforce || []),
        ...(snapshot.workforce_accounts || []),
        ...(snapshot.riders || []).map((row: any) => ({ ...row, role: "RIDER" })),
        ...(snapshot.drivers || []).map((row: any) => ({ ...row, role: "DRIVER" })),
        ...(snapshot.helpers || []).map((row: any) => ({ ...row, role: "HELPER" })),
        ...(snapshot.Rider_Master || []).map((row: any) => ({ ...row, role: "RIDER" })),
        ...(snapshot.Driver_Master || []).map((row: any) => ({ ...row, role: "DRIVER" })),
        ...(snapshot.Helper_Master || []).map((row: any) => ({ ...row, role: "HELPER" })),
      ];
    } catch {
      workforceRows = [];
    }
  }

  let fleetRows: any[] = [];

  for (const tableName of ["be_fleet_master", "be_fleet_vehicles", "fleet_master"]) {
    try {
      const { data, error } = await (supabase as any).from(tableName).select("*");
      if (error) throw error;
      if (data?.length) {
        fleetRows = data;
        break;
      }
    } catch {
      // keep trying possible fleet master table names
    }
  }

  const activeWorkers = workforceRows
    .map((row) => normalizeWorker(row))
    .filter((row) => (row.code || row.email) && isActiveStatus(row.status));

  const activeFleets = fleetRows
    .map((row) => normalizeFleet(row))
    .filter((row) => (row.id || row.vehicle_no) && isActiveStatus(row.status));

  const dedupeWorkers = (rows: WorkforceOption[]) => {
    const seen = new Set<string>();
    return rows.filter((row) => {
      const key = (row.email || row.code).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const dedupeFleets = (rows: FleetOption[]) => {
    const seen = new Set<string>();
    return rows.filter((row) => {
      const key = (row.id || row.vehicle_no).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  return {
    riders: dedupeWorkers(activeWorkers.filter((row) => row.role === "RIDER")),
    drivers: dedupeWorkers(activeWorkers.filter((row) => row.role === "DRIVER")),
    helpers: dedupeWorkers(activeWorkers.filter((row) => row.role === "HELPER")),
    fleets: dedupeFleets(activeFleets),
  };
}

export default function SupervisorPortalPage() {
  const { t } = useLanguage();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const [queue, setQueue] = useState<PickupQueueItem[]>([]);
  const [riders, setRiders] = useState<WorkforceOption[]>([]);
  const [drivers, setDrivers] = useState<WorkforceOption[]>([]);
  const [helpers, setHelpers] = useState<WorkforceOption[]>([]);
  const [fleets, setFleets] = useState<FleetOption[]>([]);

  const [selectedId, setSelectedId] = useState("");
  const [selectedRider, setSelectedRider] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [selectedHelper, setSelectedHelper] = useState("");
  const [selectedFleet, setSelectedFleet] = useState("");
  const [supervisorNote, setSupervisorNote] = useState("");

  async function loadData(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setMessage("");

    try {
      const { data: pickups, error: pickupError } = await (supabase as any)
        .from("be_v_supervisor_pickup_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(150);

      if (pickupError) throw pickupError;
      setQueue((pickups || []).map(normalizePickup));

      const masters = await loadAssignmentMasters();
      setRiders(masters.riders);
      setDrivers(masters.drivers);
      setHelpers(masters.helpers);
      setFleets(masters.fleets);
    } catch (e: any) {
      setMessage(e.message || t("Unable to synchronize supervisor data.", "Supervisor Data မရရှိပါ။"));
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function safeReload() {
      if (mounted) await loadData(false);
    }

    loadData();

    const channel = supabase
      .channel("supervisor-portal-live-assignment")
      .on("postgres_changes", { event: "*", schema: "public", table: "be_portal_pickup_requests" }, safeReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "be_app_notifications" }, safeReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "be_mobile_workforce_accounts" }, safeReload)
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredQueue = useMemo(() => {
    const keyword = search.toLowerCase().trim();

    return queue.filter((q) => {
      if (!keyword) return true;
      return [
        q.waybill_no,
        q.pickup_id,
        q.merchant_name,
        q.merchant_code,
        q.pickup_address,
        q.township,
        q.city,
        q.pickup_status,
        q.workflow_stage,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [queue, search]);

  const selectedItem = useMemo(
    () => queue.find((q) => getQueueKey(q) === selectedId) || null,
    [queue, selectedId],
  );

  const assignedCount = queue.filter((item) => item.supervisor_status === "ASSIGNED" || item.pickup_status === "RIDER_ASSIGNED").length;
  const pendingCount = queue.filter((item) => item.supervisor_status === "PENDING_ASSIGNMENT" || item.pickup_status === "PICKUP_REQUESTED").length;
  const unreadCount = queue.filter((item) => item.has_unread_notification).length;

  function selectItem(item: PickupQueueItem) {
    setSelectedId(getQueueKey(item));
    setSelectedRider(item.assigned_rider_email || item.assigned_rider_code || "");
    setSelectedDriver(item.assigned_driver_email || item.assigned_driver_code || "");
    setSelectedHelper(item.assigned_helper_email || item.assigned_helper_code || "");
    setSelectedFleet(item.assigned_vehicle_id || "");
    setSupervisorNote("");
  }

  async function markSupervisorNotificationRead(pickupId: string) {
    try {
      await (supabase as any)
        .from("be_app_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("recipient_role", "supervisor")
        .eq("notification_type", "PICKUP_REQUESTED")
        .eq("pickup_id", pickupId);
    } catch {
      // Do not block assignment for notification acknowledgement.
    }
  }

  async function assignJob() {
    if (!selectedItem?.pickup_id || !selectedRider) {
      setMessage(t("Please select a pickup and a Rider.", "ကျေးဇူးပြု၍ Pickup နှင့် Rider ကို ရွေးချယ်ပါ။"));
      return;
    }

    setLoading(true);

    try {
      const actorEmail = await getActorEmail();

      const { data, error } = await (supabase as any).rpc("be_supervisor_assign_pickup", {
        p_pickup_id: selectedItem.pickup_id,
        p_rider_email: selectedRider,
        p_driver_email: selectedDriver || null,
        p_helper_email: selectedHelper || null,
        p_vehicle_id: selectedFleet || null,
        p_actor_email: actorEmail,
      });

      if (error) throw error;

      await markSupervisorNotificationRead(selectedItem.pickup_id);

      setMessage(
        t(
          `Successfully assigned ${selectedItem.pickup_id}. Rider/Driver app job is now available.`,
          `${selectedItem.pickup_id} ကို တာဝန်ချထားပြီး Rider/Driver App တွင် Job ရရှိနိုင်ပါပြီ။`,
        ),
      );

      setSelectedId("");
      setSelectedRider("");
      setSelectedDriver("");
      setSelectedHelper("");
      setSelectedFleet("");
      setSupervisorNote("");

      await loadData(false);
      console.info("Supervisor portal assignment", data);
    } catch (e: any) {
      setMessage(e.message || t("Assignment failed.", "တာဝန်ချထားမှု မအောင်မြင်ပါ။"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 notranslate" translate="no">
      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="text-[#f6b84b] text-[11px] font-bold uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <ShieldCheck size={14} /> <span>{t("Supervisor Portal", "ကြီးကြပ်ရေးမှူး ကွပ်ကဲမှုစင်တာ")}</span>
          </div>
          <h1 className="text-2xl font-bold text-white m-0">
            <span>{t("Pickup Assignment Control", "Pickup တာဝန်ချထားခြင်း")}</span>
          </h1>
          <p className="text-[#4d7a9b] text-[13px] mt-2">
            {t("Reads CS pickup requests from be_v_supervisor_pickup_queue and sends assignment to rider/driver/helper app.", "CS Pickup Queue ကိုဖတ်ပြီး Rider/Driver/Helper App သို့ တာဝန်ပို့ပါသည်။")}
          </p>
        </div>
        <button onClick={() => loadData()} disabled={loading} className="bg-[#1a3a5c]/50 border border-[#1a3a5c] text-[#c8dff0] px-4 py-2 rounded-xl flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider hover:bg-[#1a3a5c] transition-colors">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> <span>{t("Sync", "ပြန်လည်ရယူမည်")}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-5">
          <div className="text-[#4d7a9b] text-[11px] uppercase tracking-widest">{t("Pending", "စောင့်ဆိုင်း")}</div>
          <div className="text-[#f6b84b] text-2xl font-black mt-1">{pendingCount}</div>
        </div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-5">
          <div className="text-[#4d7a9b] text-[11px] uppercase tracking-widest">{t("Assigned", "တာဝန်ချပြီး")}</div>
          <div className="text-[#22c55e] text-2xl font-black mt-1">{assignedCount}</div>
        </div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-5">
          <div className="text-[#4d7a9b] text-[11px] uppercase tracking-widest">{t("Unread CS Notifications", "မဖတ်ရသေးသော CS အသိပေးချက်")}</div>
          <div className="text-[#ff4f93] text-2xl font-black mt-1">{unreadCount}</div>
        </div>
      </div>

      {message && (
        <div className="flex items-center gap-2 rounded-2xl border border-[#22c55e]/30 bg-[#22c55e]/10 px-5 py-4 text-[13px] font-bold text-[#22c55e]">
          <CheckCircle2 className="shrink-0" size={18} /> <span>{message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl flex flex-col h-[650px] shadow-xl overflow-hidden">
          <div className="p-6 border-b border-[#1a3a5c] bg-[#081b2e]">
            <h2 className="text-lg font-bold text-white m-0">
              <span>{t("Live CS Pickup Queue", "CS Pickup Queue")}</span>
            </h2>
            <div className="mt-4 relative">
              <Search className="absolute left-4 top-3.5 text-[#4d7a9b]" size={18} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search pickup, merchant, address...", "Pickup / Merchant / Address ရှာရန်...")}
                className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 pl-12 pr-4 text-[13px] outline-none focus:border-[#f6b84b]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-[#061524] p-4 space-y-3">
            {filteredQueue.length === 0 ? (
              <div className="p-10 text-center text-[#4d7a9b] font-medium">
                <span>{loading ? t("Loading queue...", "စာရင်းဖတ်နေပါသည်...") : t("No pending pickups.", "စောင့်ဆိုင်းနေသော Pickup မရှိပါ။")}</span>
              </div>
            ) : (
              filteredQueue.map((item) => {
                const itemKey = getQueueKey(item);
                const assigned = item.supervisor_status === "ASSIGNED" || item.pickup_status === "RIDER_ASSIGNED";

                return (
                  <button
                    key={itemKey}
                    onClick={() => selectItem(item)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all ${selectedId === itemKey ? "bg-[#1a3a5c] border-[#f6b84b]/50" : "bg-[#081b2e] border-[#1a3a5c] hover:border-[#4d7a9b]"}`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <div className="font-mono text-[13px] font-black text-[#38bdf8] mb-1 flex items-center gap-2">
                          {item.has_unread_notification && !assigned ? <Bell size={14} className="text-[#ff4f93]" /> : null}
                          <span>{item.pickup_id || item.id}</span>
                        </div>
                        <div className="font-bold text-white text-[15px]">
                          <span>{item.merchant_code ? `${item.merchant_code} - ` : ""}{item.merchant_name || "Merchant"}</span>
                        </div>
                        <div className="text-[12px] text-[#c8dff0] mt-1">
                          <span>{item.pickup_address || [item.township, item.city, item.branch_code].filter(Boolean).join(", ") || "No Address"}</span>
                        </div>
                      </div>
                      <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border ${assigned ? "text-[#22c55e] bg-[#082f35] border-[#0d6b4c]" : "text-[#f6b84b] bg-[#061524] border-[#1a3a5c]"}`}>
                        <span>{assigned ? t("Assigned", "Assigned") : String(item.pickup_status || "PICKUP_REQUESTED").replace(/_/g, " ")}</span>
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-xl h-fit">
          <h2 className="text-xl font-black text-white mb-6 border-b border-[#1a3a5c] pb-4 flex items-center gap-2">
            <UserCheck className="text-[#f6b84b]" size={20} /> <span>{t("Assign Field Team", "တာဝန်ချထားရန်")}</span>
          </h2>

          <div className="space-y-5">
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-2">
                <span>{t("Selected Pickup", "ရွေးချယ်ထားသော Pickup")}</span>
              </span>
              <div className="h-12 w-full rounded-xl bg-[#061524] border border-[#1a3a5c] flex items-center px-4 font-mono font-bold text-[#f6b84b]">
                <span>{selectedItem?.pickup_id || t("None selected", "မရွေးချယ်ရသေးပါ")}</span>
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-2">
                <span>{t("Rider - required", "Rider - လိုအပ်သည်")}</span>
              </span>
              <select value={selectedRider} onChange={(e) => setSelectedRider(e.target.value)} className="h-12 w-full rounded-xl bg-[#061524] border border-[#1a3a5c] text-white px-4 text-[13px] font-bold outline-none focus:border-[#f6b84b] cursor-pointer">
                <option value="">{t("Select Rider...", "Rider ရွေးချယ်ပါ...")}</option>
                {riders.map((r) => <option key={workerValue(r)} value={workerValue(r)}>{r.code} - {r.name}{r.email ? ` (${r.email})` : ""}</option>)}
              </select>
            </div>

            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-2"><span>{t("Driver", "Driver")}</span></span>
              <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)} className="h-12 w-full rounded-xl bg-[#061524] border border-[#1a3a5c] text-white px-4 text-[13px] font-bold outline-none focus:border-[#f6b84b] cursor-pointer">
                <option value="">{t("Select Driver...", "Driver ရွေးချယ်ပါ...")}</option>
                {drivers.map((d) => <option key={workerValue(d)} value={workerValue(d)}>{d.code} - {d.name}{d.email ? ` (${d.email})` : ""}</option>)}
              </select>
            </div>

            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-2"><span>{t("Helper", "Helper")}</span></span>
              <select value={selectedHelper} onChange={(e) => setSelectedHelper(e.target.value)} className="h-12 w-full rounded-xl bg-[#061524] border border-[#1a3a5c] text-white px-4 text-[13px] font-bold outline-none focus:border-[#f6b84b] cursor-pointer">
                <option value="">{t("Select Helper...", "Helper ရွေးချယ်ပါ...")}</option>
                {helpers.map((h) => <option key={workerValue(h)} value={workerValue(h)}>{h.code} - {h.name}{h.email ? ` (${h.email})` : ""}</option>)}
              </select>
            </div>

            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-2"><span>{t("Vehicle / Fleet", "ပို့ဆောင်မည့် ယာဉ်")}</span></span>
              <select value={selectedFleet} onChange={(e) => setSelectedFleet(e.target.value)} className="h-12 w-full rounded-xl bg-[#061524] border border-[#1a3a5c] text-white px-4 text-[13px] font-bold outline-none focus:border-[#f6b84b] cursor-pointer">
                <option value="">{t("Select Vehicle...", "ယာဉ် ရွေးချယ်ပါ...")}</option>
                {fleets.map((f) => <option key={f.id} value={f.id}>{f.vehicle_no} - {f.vehicle_type || "Vehicle"}</option>)}
              </select>
            </div>

            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-2"><span>{t("Supervisor Note", "ကြီးကြပ်သူ မှတ်ချက်")}</span></span>
              <textarea value={supervisorNote} onChange={(e) => setSupervisorNote(e.target.value)} maxLength={500} placeholder={t("Special instructions...", "အထူးမှာကြားချက်...")} className="h-24 w-full rounded-xl bg-[#061524] border border-[#1a3a5c] text-white p-4 text-[13px] outline-none focus:border-[#f6b84b]" />
            </div>

            <button onClick={assignJob} disabled={loading || !selectedItem || !selectedRider} className="w-full h-14 rounded-2xl bg-[#f6b84b] hover:bg-[#e5a93a] text-[#061524] font-black uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer shadow-lg shadow-[#f6b84b]/10 flex items-center justify-center gap-2">
              <Truck size={18} /> <span>{loading ? t("Assigning...", "Assigning...") : t("Confirm Assignment + Send to App", "တာဝန်ချပြီး App သို့ ပို့မည်")}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}