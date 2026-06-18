// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Languages,
  Loader2,
  PackageCheck,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Truck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * BRITIUM Supervisor Assignment Portal — Go-Live Ready
 *
 * Production behaviour:
 * - Uses real Supabase client; no mock data and no client-side API keys.
 * - Uses production RPCs:
 *   - be_operational_master_snapshot()
 *   - be_supervisor_assignment_snapshot()
 *   - be_assign_pickup_request_by_rider_code(...)
 *   - be_assign_pickup_request_to_driver(...)
 * - Has defensive fallback for older deployments:
 *   - be_supervisor_pending_pickup_requests()
 *   - be_assignable_pickup_workforce()
 *   - be_assign_pickup_field_team(...)
 * - Validates request, rider, stale sync, note length, pickup status, and vehicle UUID.
 * - Provides synchronization health checks for go-live verification.
 */

type Lang = "mm" | "en";
type AnyRow = Record<string, any>;

type MasterOptionType = "rider" | "driver" | "helper" | "fleet";

type MasterOption = {
  id: string | null;
  value: string;
  code: string;
  name: string;
  phone: string;
  plate: string;
  status: string;
  type: MasterOptionType;
  raw: AnyRow;
};

type MasterData = {
  riders: MasterOption[];
  drivers: MasterOption[];
  helpers: MasterOption[];
  fleets: MasterOption[];
};

type AssignmentForm = {
  riderValue: string;
  driverValue: string;
  helperValue: string;
  vehicleValue: string;
  note: string;
};

type UiSeverity = "success" | "warning" | "error" | "info";

type UiMessage = {
  severity: UiSeverity;
  text: string;
};

type ValidationIssue = {
  severity: "ok" | "warning" | "error";
  label: string;
  detail: string;
};

const C = {
  page: "#061524",
  panel: "#0b2236",
  panel2: "#102b45",
  panel3: "#071827",
  border: "#1f4966",
  border2: "#315f81",
  text: "#eef8ff",
  sub: "#a8c4da",
  muted: "#7ea0b8",
  orange: "#ff8a4c",
  green: "#22c55e",
  red: "#ff4f86",
  blue: "#38bdf8",
  gold: "#f6b84b",
  purple: "#a855f7",
};

const I18N = {
  mm: {
    toggle: "English",
    eyebrow: "BRITIUM EXPRESS",
    title: "ကြီးကြပ်ရေးမှူး တာဝန်ချထားမှု စနစ်",
    desc: "Pickup Request များကို Rider၊ Driver၊ Helper နှင့် ယာဉ်များထံ စနစ်တကျ တာဝန်ချထားရန်။",
    refresh: "Master Data Sync",
    autoSync: "Auto Sync",
    queue: "တာဝန်ချရန် စောင့်ဆိုင်းနေသော Pickup များ",
    assignment: "တာဝန်ချထားရန်",
    details: "ရွေးချယ်ထားသော အသေးစိတ်",
    readiness: "Go-Live စစ်ဆေးချက်",
    pickupId: "Pickup ID",
    pickupWayId: "Pickup WayID",
    requestCode: "Request Code",
    merchant: "ကုန်သည်",
    address: "လိပ်စာ",
    township: "မြို့နယ်",
    parcels: "ပါဆယ် အရေအတွက်",
    status: "အခြေအနေ",
    rider: "Rider",
    driver: "Driver",
    helper: "Helper",
    vehicle: "ယာဉ် / Fleet",
    note: "ကြီးကြပ်ရေးမှူး မှတ်ချက်",
    selectPickup: "Pickup Request တစ်ခု ရွေးပါ",
    selectRider: "Rider ရွေးချယ်ပါ...",
    selectDriver: "Driver ရွေးချယ်ပါ...",
    selectHelper: "Helper ရွေးချယ်ပါ...",
    selectVehicle: "ယာဉ် ရွေးချယ်ပါ...",
    noPickup: "တာဝန်ချရန် Pickup မရှိပါ",
    noPickupDesc: "လက်ရှိတွင် Supervisor Queue ထဲတွင် စောင့်ဆိုင်းနေသော Pickup မရှိပါ။",
    complete: "တာဝန်ချထားမှု အတည်ပြုပါ",
    loading: "အချက်အလက်များ Sync လုပ်နေသည်...",
    synced: "Master Data Sync အောင်မြင်ပါသည်",
    riders: "Rider",
    drivers: "Driver",
    helpers: "Helper",
    fleets: "Fleet",
    search: "Pickup / Merchant / Phone / Township ဖြင့်ရှာရန်",
    assigned: "တာဝန်ချပြီး",
    pending: "စောင့်ဆိုင်းဆဲ",
    success: "တာဝန်ချထားမှု အောင်မြင်ပါသည်",
    error: "စနစ်ချိတ်ဆက်မှု မအောင်မြင်ပါ",
    smartSuggest: "Smart Suggestion",
    suggestionReason: "အကြံပြုချက်",
    validationFailed: "အချက်အလက် စစ်ဆေးမှု မအောင်မြင်ပါ",
    selectAtLeastRider: "Go-live workflow အတွက် Rider ကို မဖြစ်မနေ ရွေးချယ်ပါ။",
    requestCodeRequired: "Request Code မတွေ့ပါ။ Pickup Request ကို production RPC ဖြင့် assign မလုပ်နိုင်ပါ။",
    staleSync: "Sync အချိန်ကြာနေပါသည်။ တာဝန်ချမီ ပြန်လည် Sync လုပ်ပါ။",
    noteTooLong: "မှတ်ချက်သည် ၅၀၀ လုံးကျော်နေပါသည်။",
    alreadyAssigned: "ဤ Pickup သည် တာဝန်ချထားပြီးဖြစ်နိုင်ပါသည်။",
    lastSync: "နောက်ဆုံး Sync",
    none: "မရှိသေးပါ",
    ready: "အသင့်ဖြစ်သည်",
    notReady: "ပြင်ဆင်ရန်လိုသည်",
    warning: "သတိပြုရန်",
    optional: "ရွေးချယ်နိုင်သည်",
    required: "လိုအပ်သည်",
    supervisorNotePlaceholder: "Pickup timing, fragile item, route instruction, phone note...",
    syncSummary: "Sync အကျဉ်းချုပ်",
    assignmentHistory: "Assignment Result",
    selectedRider: "ရွေးထားသော Rider",
    selectedVehicle: "ရွေးထားသော ယာဉ်",
    retry: "ပြန်ကြိုးစားရန်",
  },
  en: {
    toggle: "မြန်မာ",
    eyebrow: "BRITIUM EXPRESS",
    title: "Supervisor Assignment Portal",
    desc: "Assign pickup requests to riders, drivers, helpers, and fleet resources with production validation.",
    refresh: "Sync Master Data",
    autoSync: "Auto Sync",
    queue: "Pickup Queue Awaiting Assignment",
    assignment: "Field Assignment",
    details: "Selected Details",
    readiness: "Go-Live Checks",
    pickupId: "Pickup ID",
    pickupWayId: "Pickup WayID",
    requestCode: "Request Code",
    merchant: "Merchant",
    address: "Address",
    township: "Township",
    parcels: "Parcels",
    status: "Status",
    rider: "Rider",
    driver: "Driver",
    helper: "Helper",
    vehicle: "Vehicle / Fleet",
    note: "Supervisor Note",
    selectPickup: "Select a Pickup Request",
    selectRider: "Select Rider...",
    selectDriver: "Select Driver...",
    selectHelper: "Select Helper...",
    selectVehicle: "Select Vehicle...",
    noPickup: "No Pending Pickups",
    noPickupDesc: "There are no pickup requests waiting in the Supervisor Queue.",
    complete: "Confirm Assignment",
    loading: "Synchronizing data...",
    synced: "Master Data synchronized",
    riders: "Riders",
    drivers: "Drivers",
    helpers: "Helpers",
    fleets: "Fleets",
    search: "Search Pickup / Merchant / Phone / Township",
    assigned: "Assigned",
    pending: "Pending",
    success: "Assignment completed successfully",
    error: "Connection failed",
    smartSuggest: "Smart Suggestion",
    suggestionReason: "Suggestion Reason",
    validationFailed: "Validation failed",
    selectAtLeastRider: "A rider is required for the go-live pickup workflow.",
    requestCodeRequired: "Request Code is missing. The production assignment RPC cannot assign this pickup.",
    staleSync: "Data sync is stale. Please sync before assigning.",
    noteTooLong: "Note exceeds 500 characters.",
    alreadyAssigned: "This pickup may already be assigned.",
    lastSync: "Last Sync",
    none: "Not yet",
    ready: "Ready",
    notReady: "Needs Fix",
    warning: "Warning",
    optional: "Optional",
    required: "Required",
    supervisorNotePlaceholder: "Pickup timing, fragile item, route instruction, phone note...",
    syncSummary: "Sync Summary",
    assignmentHistory: "Assignment Result",
    selectedRider: "Selected Rider",
    selectedVehicle: "Selected Vehicle",
    retry: "Retry",
  },
} as const;

const STATUS_MM: Record<string, string> = {
  PENDING: "စောင့်ဆိုင်းဆဲ",
  ASSIGNED_TO_SUPERVISOR: "ကြီးကြပ်ရေးမှူးထံ လွှဲပြောင်းထားသည်",
  ASSIGNED_TO_DRIVER: "Rider/Driver ထံ တာဝန်ချထားပြီး",
  PICKED_UP: "လက်ခံရယူပြီး",
  CONVERTED_TO_SHIPMENT: "Shipment အဖြစ် ပြောင်းပြီး",
  CANCELLED: "ပယ်ဖျက်ပြီး",
  REJECTED: "ပယ်ချပြီး",
};

const STATUS_EN: Record<string, string> = {
  PENDING: "Pending",
  ASSIGNED_TO_SUPERVISOR: "Assigned to Supervisor",
  ASSIGNED_TO_DRIVER: "Assigned to Rider/Driver",
  PICKED_UP: "Picked Up",
  CONVERTED_TO_SHIPMENT: "Converted to Shipment",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
};

const ASSIGNABLE_STATUSES = new Set(["PENDING", "ASSIGNED_TO_SUPERVISOR"]);

const NOTE_LIMIT = 500;
const STALE_SYNC_MS = 5 * 60 * 1000;

const emptyMaster: MasterData = { riders: [], drivers: [], helpers: [], fleets: [] };

function safe(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function normalizeKey(value: unknown): string {
  return safe(value, "").trim();
}

function lower(value: unknown): string {
  return normalizeKey(value).toLowerCase();
}

function isUuid(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    normalizeKey(value)
  );
}

function formatDateTime(value: unknown): string {
  if (!value) return "-";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pickupCode(row: AnyRow | null | undefined): string {
  return normalizeKey(row?.pickup_way_id || row?.pickup_id || row?.pickup_code || row?.request_code || row?.id);
}

function requestCode(row: AnyRow | null | undefined): string {
  return normalizeKey(row?.request_code || row?.pickup_request_code || row?.pickup_id || row?.id);
}

function optionLabel(option: MasterOption): string {
  return [option.code, option.name, option.phone, option.plate].filter(Boolean).join(" — ");
}

function optionSearchText(option: MasterOption): string {
  return [option.code, option.name, option.phone, option.plate, option.status].filter(Boolean).join(" ").toLowerCase();
}

function getOptionId(row: AnyRow): string | null {
  const id =
    row?.id ||
    row?.rider_id ||
    row?.driver_id ||
    row?.helper_id ||
    row?.vehicle_id ||
    row?.fleet_id ||
    row?.uuid;
  return id ? String(id) : null;
}

function getOptionCode(row: AnyRow, type: MasterOptionType): string {
  if (type === "rider") {
    return normalizeKey(row?.rider_code || row?.code || row?.employee_code || row?.id);
  }
  if (type === "driver") {
    return normalizeKey(row?.driver_code || row?.code || row?.employee_code || row?.id);
  }
  if (type === "helper") {
    return normalizeKey(row?.helper_code || row?.code || row?.employee_code || row?.id);
  }
  return normalizeKey(row?.vehicle_code || row?.fleet_code || row?.plate_no || row?.vehicle_plate || row?.registration_number || row?.code || row?.id);
}

function normalizeOption(row: AnyRow, type: MasterOptionType): MasterOption {
  const id = getOptionId(row);
  const code = getOptionCode(row, type);
  const name = normalizeKey(
    row?.name ||
      row?.display_name ||
      row?.full_name ||
      row?.rider_name ||
      row?.driver_name ||
      row?.helper_name ||
      row?.registration_number ||
      row?.vehicle_type ||
      row?.type ||
      code
  );
  const phone = normalizeKey(row?.phone || row?.phone_primary || row?.contact_number || row?.mobile);
  const plate = normalizeKey(row?.plate || row?.plate_no || row?.vehicle_plate || row?.registration_number);
  const status = normalizeKey(row?.status || row?.availability_status || "active");

  return {
    id,
    value: id || code,
    code,
    name,
    phone,
    plate,
    status,
    type,
    raw: row,
  };
}

function normalizeMaster(raw: any): MasterData {
  const value = raw || {};
  return {
    riders: Array.isArray(value.riders) ? value.riders.map((x: AnyRow) => normalizeOption(x, "rider")) : [],
    drivers: Array.isArray(value.drivers) ? value.drivers.map((x: AnyRow) => normalizeOption(x, "driver")) : [],
    helpers: Array.isArray(value.helpers) ? value.helpers.map((x: AnyRow) => normalizeOption(x, "helper")) : [],
    fleets: Array.isArray(value.fleets || value.vehicles)
      ? (value.fleets || value.vehicles).map((x: AnyRow) => normalizeOption(x, "fleet"))
      : [],
  };
}

function normalizeQueue(raw: any): AnyRow[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.pickups)) return raw.pickups;
  if (Array.isArray(raw?.pickup_requests)) return raw.pickup_requests;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

function dedupeOptions(options: MasterOption[]): MasterOption[] {
  const seen = new Set<string>();
  return options.filter((item) => {
    const key = `${item.type}:${item.value || item.code}`;
    if (!item.value && !item.code) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function labelStatus(value: unknown, lang: Lang): string {
  const raw = normalizeKey(value);
  const dict = lang === "mm" ? STATUS_MM : STATUS_EN;
  return dict[raw] || dict[raw.toUpperCase()] || raw || "-";
}

function isAssignablyActive(option: MasterOption): boolean {
  const status = lower(option.status || "active");
  return !["inactive", "disabled", "deleted", "terminated", "suspended", "unavailable"].includes(status);
}

async function rpcCall<T = any>(name: string, params?: AnyRow): Promise<T> {
  const { data, error } = await (supabase as any).rpc(name, params || {});
  if (error) throw error;
  return data as T;
}

const supervisorApi = {
  async loadMaster(): Promise<MasterData> {
    try {
      const data = await rpcCall("be_operational_master_snapshot");
      return normalizeMaster(data);
    } catch (primaryError) {
      const fallback = await rpcCall("be_assignable_pickup_workforce");
      return normalizeMaster({ riders: Array.isArray(fallback) ? fallback : [] });
    }
  },

  async loadQueue(): Promise<AnyRow[]> {
    try {
      const data = await rpcCall("be_supervisor_assignment_snapshot");
      return normalizeQueue(data);
    } catch (primaryError) {
      const fallback = await rpcCall("be_supervisor_pending_pickup_requests");
      return normalizeQueue(fallback);
    }
  },

  async assignPickup(input: {
    pickup: AnyRow;
    rider: MasterOption;
    vehicle?: MasterOption | null;
    driver?: MasterOption | null;
    helper?: MasterOption | null;
    note?: string;
  }): Promise<any> {
    const req = requestCode(input.pickup);
    const riderCode = input.rider.code;
    const riderId = input.rider.id;
    const vehicleId = input.vehicle?.id && isUuid(input.vehicle.id) ? input.vehicle.id : null;
    const note = input.note?.trim() || null;

    if (riderCode) {
      try {
        return await rpcCall("be_assign_pickup_request_by_rider_code", {
          p_request_code: req,
          p_rider_code: riderCode,
          p_assigned_vehicle_id: vehicleId,
          p_assignment_note: note,
          p_actor_registry_id: null,
        });
      } catch (error: any) {
        const missingFunction =
          error?.code === "42883" ||
          /function .*be_assign_pickup_request_by_rider_code.*does not exist/i.test(error?.message || "");

        if (!missingFunction) throw error;
      }
    }

    if (riderId && isUuid(riderId)) {
      try {
        return await rpcCall("be_assign_pickup_request_to_driver", {
          p_request_code: req,
          p_assigned_rider_id: riderId,
          p_assigned_vehicle_id: vehicleId,
          p_assignment_note: note,
          p_actor_registry_id: null,
        });
      } catch (error: any) {
        const missingFunction =
          error?.code === "42883" ||
          /function .*be_assign_pickup_request_to_driver.*does not exist/i.test(error?.message || "");

        if (!missingFunction) throw error;
      }
    }

    return await rpcCall("be_assign_pickup_field_team", {
      p_pickup_id: pickupCode(input.pickup) || req,
      p_rider_code: riderCode || null,
      p_driver_code: input.driver?.code || null,
      p_helper_code: input.helper?.code || null,
      p_vehicle_plate: input.vehicle?.plate || input.vehicle?.code || null,
      p_supervisor_note: note,
    });
  },
};

function buildValidationIssues(params: {
  selected: AnyRow | null;
  master: MasterData;
  form: AssignmentForm;
  lastSyncAt: Date | null;
  lang: Lang;
}): ValidationIssue[] {
  const T = I18N[params.lang];
  const issues: ValidationIssue[] = [];
  const selectedStatus = normalizeKey(params.selected?.status).toUpperCase();

  if (!params.selected) {
    issues.push({ severity: "error", label: T.selectPickup, detail: T.selectPickup });
  } else {
    issues.push({ severity: "ok", label: T.selectPickup, detail: pickupCode(params.selected) });
  }

  if (!params.selected || !requestCode(params.selected)) {
    issues.push({ severity: "error", label: T.requestCode, detail: T.requestCodeRequired });
  } else {
    issues.push({ severity: "ok", label: T.requestCode, detail: requestCode(params.selected) });
  }

  if (!params.form.riderValue) {
    issues.push({ severity: "error", label: T.rider, detail: T.selectAtLeastRider });
  } else {
    issues.push({ severity: "ok", label: T.rider, detail: params.form.riderValue });
  }

  if (params.form.note.length > NOTE_LIMIT) {
    issues.push({ severity: "error", label: T.note, detail: T.noteTooLong });
  } else {
    issues.push({ severity: "ok", label: T.note, detail: `${params.form.note.length}/${NOTE_LIMIT}` });
  }

  if (params.lastSyncAt && Date.now() - params.lastSyncAt.getTime() > STALE_SYNC_MS) {
    issues.push({ severity: "warning", label: T.lastSync, detail: T.staleSync });
  } else if (params.lastSyncAt) {
    issues.push({ severity: "ok", label: T.lastSync, detail: formatDateTime(params.lastSyncAt) });
  } else {
    issues.push({ severity: "warning", label: T.lastSync, detail: T.none });
  }

  if (params.master.riders.length === 0) {
    issues.push({ severity: "error", label: T.riders, detail: "No active riders loaded from master data." });
  } else {
    issues.push({ severity: "ok", label: T.riders, detail: `${params.master.riders.length}` });
  }

  if (params.master.fleets.length === 0) {
    issues.push({ severity: "warning", label: T.fleets, detail: `${T.optional}: no fleet rows loaded.` });
  } else {
    issues.push({ severity: "ok", label: T.fleets, detail: `${params.master.fleets.length}` });
  }

  if (selectedStatus && !ASSIGNABLE_STATUSES.has(selectedStatus)) {
    issues.push({ severity: "warning", label: T.status, detail: T.alreadyAssigned });
  }

  return issues;
}

function hasBlockingIssue(issues: ValidationIssue[]): boolean {
  return issues.some((x) => x.severity === "error");
}

function issueTone(severity: ValidationIssue["severity"]): string {
  if (severity === "ok") return C.green;
  if (severity === "warning") return C.gold;
  return C.red;
}

function messageTone(severity: UiSeverity): string {
  if (severity === "success") return C.green;
  if (severity === "warning") return C.gold;
  if (severity === "error") return C.red;
  return C.blue;
}

export default function SupervisorAssignmentPortal() {
  const [lang, setLang] = useState<Lang>("mm");
  const T = I18N[lang];

  const [master, setMaster] = useState<MasterData>(emptyMaster);
  const [queue, setQueue] = useState<AnyRow[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<AssignmentForm>({
    riderValue: "",
    driverValue: "",
    helperValue: "",
    vehicleValue: "",
    note: "",
  });
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [message, setMessage] = useState<UiMessage>({ severity: "info", text: T.loading });
  const [suggestionReason, setSuggestionReason] = useState("");

  const cleanedMaster = useMemo<MasterData>(() => {
    return {
      riders: dedupeOptions(master.riders).filter(isAssignablyActive),
      drivers: dedupeOptions(master.drivers).filter(isAssignablyActive),
      helpers: dedupeOptions(master.helpers).filter(isAssignablyActive),
      fleets: dedupeOptions(master.fleets).filter(isAssignablyActive),
    };
  }, [master]);

  const selected = useMemo<AnyRow | null>(() => {
    if (!queue.length) return null;
    return (
      queue.find((row) => pickupCode(row) === selectedKey || requestCode(row) === selectedKey || row?.id === selectedKey) ||
      queue[0]
    );
  }, [queue, selectedKey]);

  const selectedRider = useMemo(
    () => cleanedMaster.riders.find((x) => x.value === form.riderValue) || null,
    [cleanedMaster.riders, form.riderValue]
  );

  const selectedDriver = useMemo(
    () => cleanedMaster.drivers.find((x) => x.value === form.driverValue) || null,
    [cleanedMaster.drivers, form.driverValue]
  );

  const selectedHelper = useMemo(
    () => cleanedMaster.helpers.find((x) => x.value === form.helperValue) || null,
    [cleanedMaster.helpers, form.helperValue]
  );

  const selectedVehicle = useMemo(
    () => cleanedMaster.fleets.find((x) => x.value === form.vehicleValue) || null,
    [cleanedMaster.fleets, form.vehicleValue]
  );

  const filteredQueue = useMemo(() => {
    const q = lower(search);
    if (!q) return queue;

    return queue.filter((row) =>
      [
        pickupCode(row),
        requestCode(row),
        row?.merchant_name,
        row?.merchant_code,
        row?.pickup_address,
        row?.pickup_township,
        row?.pickup_phone,
        row?.status,
      ]
        .map((x) => lower(x))
        .some((x) => x.includes(q))
    );
  }, [queue, search]);

  const validationIssues = useMemo(
    () => buildValidationIssues({ selected, master: cleanedMaster, form, lastSyncAt, lang }),
    [selected, cleanedMaster, form, lastSyncAt, lang]
  );

  const blockingIssue = hasBlockingIssue(validationIssues);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMessage({ severity: "info", text: T.loading });

    try {
      const [nextMaster, nextQueue] = await Promise.all([
        supervisorApi.loadMaster(),
        supervisorApi.loadQueue(),
      ]);

      setMaster(nextMaster);
      setQueue(nextQueue);

      const first = nextQueue.find((row) => pickupCode(row) || requestCode(row));
      if (first && !selectedKey) {
        setSelectedKey(pickupCode(first) || requestCode(first));
      }

      setLastSyncAt(new Date());
      setMessage({
        severity: "success",
        text: `${T.synced}: ${nextMaster.riders.length} ${T.riders}, ${nextMaster.drivers.length} ${T.drivers}, ${nextMaster.helpers.length} ${T.helpers}, ${nextMaster.fleets.length} ${T.fleets}. Queue: ${nextQueue.length}`,
      });
    } catch (error: any) {
      setMessage({
        severity: "error",
        text: error?.message || error?.details || T.error,
      });
    } finally {
      setLoading(false);
    }
  }, [T, selectedKey]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!autoSync) return undefined;
    const timer = window.setInterval(() => {
      void loadAll();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [autoSync, loadAll]);

  useEffect(() => {
    setMessage((prev) => {
      if (prev.text === I18N.mm.loading || prev.text === I18N.en.loading) {
        return { severity: "info", text: T.loading };
      }
      return prev;
    });
  }, [T]);

  function updateForm(patch: Partial<AssignmentForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function pickupStatus(row: AnyRow): string {
    return labelStatus(row?.status, lang);
  }

  function resetForm() {
    setForm({ riderValue: "", driverValue: "", helperValue: "", vehicleValue: "", note: "" });
    setSuggestionReason("");
  }

  function selectPickup(row: AnyRow) {
    setSelectedKey(pickupCode(row) || requestCode(row) || safe(row.id, ""));
    resetForm();
  }

  function smartSuggest() {
    if (!selected) return;

    const township = lower(selected.pickup_township || selected.township || selected.pickup_address);
    const parcelCount = Number(selected.parcel_count || selected.total_parcels || 1);

    const rider =
      cleanedMaster.riders.find((r) => optionSearchText(r).includes(township)) ||
      cleanedMaster.riders[0] ||
      null;

    const needsLargeVehicle = parcelCount >= 20 || /truck|van|ကား|ထရပ်/i.test(safe(selected.pickup_address, ""));
    const vehicle =
      (needsLargeVehicle
        ? cleanedMaster.fleets.find((v) => /truck|van|ကား|ထရပ်/i.test(optionSearchText(v)))
        : cleanedMaster.fleets.find((v) => /bike|motor|ဆိုင်ကယ်/i.test(optionSearchText(v)))) ||
      cleanedMaster.fleets[0] ||
      null;

    updateForm({
      riderValue: rider?.value || "",
      vehicleValue: vehicle?.value || "",
    });

    setSuggestionReason(
      lang === "mm"
        ? `Township/လမ်းကြောင်း နှင့် parcel count (${parcelCount}) အပေါ်မူတည်၍ ${rider?.code || "-"} ${vehicle ? `နှင့် ${vehicle.code || vehicle.plate}` : ""} ကို အကြံပြုထားသည်။`
        : `Suggested ${rider?.code || "-"} ${vehicle ? `and ${vehicle.code || vehicle.plate}` : ""} based on township clues and parcel count (${parcelCount}).`
    );
  }

  async function assign() {
    if (!selected) {
      setMessage({ severity: "error", text: T.selectPickup });
      return;
    }

    if (blockingIssue) {
      const firstIssue = validationIssues.find((x) => x.severity === "error");
      setMessage({ severity: "error", text: `${T.validationFailed}: ${firstIssue?.detail || ""}` });
      return;
    }

    if (!selectedRider) {
      setMessage({ severity: "error", text: T.selectAtLeastRider });
      return;
    }

    setAssigning(true);
    setMessage({ severity: "info", text: T.loading });

    try {
      const result = await supervisorApi.assignPickup({
        pickup: selected,
        rider: selectedRider,
        vehicle: selectedVehicle,
        driver: selectedDriver,
        helper: selectedHelper,
        note: form.note,
      });

      setMessage({
        severity: "success",
        text: `${T.success}: ${safe(result?.request_code || requestCode(selected))} / ${safe(result?.pickup_way_id || pickupCode(selected))}`,
      });

      resetForm();
      await loadAll();
    } catch (error: any) {
      setMessage({
        severity: "error",
        text: error?.message || error?.details || "Assignment failed.",
      });
    } finally {
      setAssigning(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: C.page,
        color: C.text,
        fontFamily: "Pyidaungsu, Inter, system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 1680, margin: "0 auto", display: "grid", gap: 18 }}>
        <Header
          T={T}
          lang={lang}
          setLang={setLang}
          loading={loading}
          autoSync={autoSync}
          setAutoSync={setAutoSync}
          onRefresh={loadAll}
          message={message}
          lastSyncAt={lastSyncAt}
          master={cleanedMaster}
          queueCount={queue.length}
        />

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(360px, 520px) minmax(0, 1fr)",
            gap: 18,
            alignItems: "start",
          }}
          className="max-[1120px]:grid-cols-1"
        >
          <PickupQueue
            T={T}
            rows={filteredQueue}
            selected={selected}
            search={search}
            setSearch={setSearch}
            onSelect={selectPickup}
            pickupStatus={pickupStatus}
            loading={loading}
          />

          <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
            <AssignmentPanel
              T={T}
              selected={selected}
              form={form}
              updateForm={updateForm}
              master={cleanedMaster}
              selectedRider={selectedRider}
              selectedVehicle={selectedVehicle}
              validationIssues={validationIssues}
              suggestionReason={suggestionReason}
              onSuggest={smartSuggest}
              onAssign={assign}
              loading={loading || assigning}
              blockingIssue={blockingIssue}
            />

            <DetailsAndReadiness
              T={T}
              selected={selected}
              selectedRider={selectedRider}
              selectedVehicle={selectedVehicle}
              validationIssues={validationIssues}
              pickupStatus={pickupStatus}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function Header({
  T,
  lang,
  setLang,
  loading,
  autoSync,
  setAutoSync,
  onRefresh,
  message,
  lastSyncAt,
  master,
  queueCount,
}: {
  T: (typeof I18N)[Lang];
  lang: Lang;
  setLang: React.Dispatch<React.SetStateAction<Lang>>;
  loading: boolean;
  autoSync: boolean;
  setAutoSync: React.Dispatch<React.SetStateAction<boolean>>;
  onRefresh: () => void;
  message: UiMessage;
  lastSyncAt: Date | null;
  master: MasterData;
  queueCount: number;
}) {
  const tone = messageTone(message.severity);

  return (
    <section style={panel({ padding: 24 })}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
        <div style={{ minWidth: 280 }}>
          <div style={{ color: C.orange, fontSize: 13, fontWeight: 950, letterSpacing: ".45em", textTransform: "uppercase" }}>
            {T.eyebrow}
          </div>
          <h1 style={{ margin: "8px 0 0", fontSize: 34, lineHeight: 1.15, fontWeight: 950 }}>{T.title}</h1>
          <p style={{ marginTop: 8, color: C.sub, fontSize: 16, lineHeight: 1.6, maxWidth: 980 }}>{T.desc}</p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={() => setLang(lang === "mm" ? "en" : "mm")} style={secondaryButton()}>
            <Languages size={18} /> {T.toggle}
          </button>

          <button onClick={() => setAutoSync((x) => !x)} style={secondaryButton({ borderColor: autoSync ? C.green : C.border2 })}>
            <TimerReset size={18} /> {T.autoSync}: {autoSync ? "ON" : "OFF"}
          </button>

          <button onClick={() => void onRefresh()} disabled={loading} style={primaryButton()}>
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            {T.refresh}
          </button>
        </div>
      </div>

      <div
        style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 12 }}
        className="max-[1050px]:grid-cols-2 max-[560px]:grid-cols-1"
      >
        <Metric label={T.riders} value={master.riders.length} />
        <Metric label={T.drivers} value={master.drivers.length} />
        <Metric label={T.helpers} value={master.helpers.length} />
        <Metric label={T.fleets} value={master.fleets.length} />
        <Metric label="Queue" value={queueCount} />
      </div>

      <div
        style={{
          marginTop: 14,
          color: tone,
          background: `${tone}11`,
          border: `1px solid ${tone}55`,
          padding: 14,
          borderRadius: 16,
          fontWeight: 900,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {loading ? <Loader2 size={17} className="animate-spin" /> : message.severity === "error" ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
        <span>{message.text}</span>
        <span style={{ color: C.sub, fontWeight: 800 }}>
          {T.lastSync}: {lastSyncAt ? formatDateTime(lastSyncAt) : T.none}
        </span>
      </div>
    </section>
  );
}

function PickupQueue({
  T,
  rows,
  selected,
  search,
  setSearch,
  onSelect,
  pickupStatus,
  loading,
}: {
  T: (typeof I18N)[Lang];
  rows: AnyRow[];
  selected: AnyRow | null;
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  onSelect: (row: AnyRow) => void;
  pickupStatus: (row: AnyRow) => string;
  loading: boolean;
}) {
  return (
    <section style={panel({ padding: 20, minHeight: 620 })}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <ShieldCheck size={22} color={C.orange} />
        <h2 style={sectionTitle()}>{T.queue}</h2>
      </div>

      <div style={{ position: "relative" }}>
        <Search size={17} style={{ position: "absolute", left: 14, top: 15, color: C.muted }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={T.search} style={inputStyle({ paddingLeft: 42 })} />
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 12, maxHeight: "calc(100vh - 410px)", overflow: "auto", paddingRight: 4 }}>
        {loading && rows.length === 0 ? <LoadingBlock /> : null}

        {!loading && rows.length === 0 ? <Empty title={T.noPickup} desc={T.noPickupDesc} /> : null}

        {rows.map((row) => {
          const key = pickupCode(row) || requestCode(row) || safe(row.id);
          const active = !!selected && (pickupCode(selected) === key || requestCode(selected) === key || selected.id === row.id);
          const status = normalizeKey(row?.status).toUpperCase();
          const assignable = !status || ASSIGNABLE_STATUSES.has(status);

          return (
            <button
              key={key}
              onClick={() => onSelect(row)}
              style={{
                textAlign: "left",
                border: `1px solid ${active ? C.orange : assignable ? C.border : C.gold}`,
                background: active ? "rgba(255,138,76,.14)" : assignable ? C.panel3 : "rgba(246,184,75,.09)",
                color: C.text,
                borderRadius: 20,
                padding: 16,
                cursor: "pointer",
                transition: "0.18s all ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                <div>
                  <div style={mono(C.orange)}>{pickupCode(row)}</div>
                  <div style={{ marginTop: 4, color: C.sub, fontSize: 12 }}>{requestCode(row)}</div>
                </div>
                <span style={badge(assignable ? C.blue : C.gold, "#061524")}>{pickupStatus(row)}</span>
              </div>

              <div style={{ marginTop: 8, fontWeight: 950, fontSize: 17, lineHeight: 1.35 }}>{safe(row.merchant_name || row.merchant_code)}</div>
              <div style={{ marginTop: 6, color: C.sub, lineHeight: 1.5 }}>
                {safe(row.pickup_address)} · {safe(row.pickup_township)}
              </div>
              <div style={{ marginTop: 8, color: C.gold, fontWeight: 900 }}>
                {T.parcels}: {safe(row.parcel_count || row.total_parcels || 1)}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AssignmentPanel({
  T,
  selected,
  form,
  updateForm,
  master,
  selectedRider,
  selectedVehicle,
  validationIssues,
  suggestionReason,
  onSuggest,
  onAssign,
  loading,
  blockingIssue,
}: {
  T: (typeof I18N)[Lang];
  selected: AnyRow | null;
  form: AssignmentForm;
  updateForm: (patch: Partial<AssignmentForm>) => void;
  master: MasterData;
  selectedRider: MasterOption | null;
  selectedVehicle: MasterOption | null;
  validationIssues: ValidationIssue[];
  suggestionReason: string;
  onSuggest: () => void;
  onAssign: () => void;
  loading: boolean;
  blockingIssue: boolean;
}) {
  return (
    <section style={panel({ padding: 20 })}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Truck size={22} color={C.orange} />
          <h2 style={sectionTitle()}>{T.assignment}</h2>
        </div>

        <button onClick={onSuggest} disabled={loading || !selected || master.riders.length === 0} style={secondaryButton({ borderColor: C.purple, color: C.purple })}>
          <Sparkles size={16} />
          {T.smartSuggest}
        </button>
      </div>

      {suggestionReason ? (
        <div style={{ marginBottom: 16, padding: 14, background: `${C.purple}16`, border: `1px solid ${C.purple}66`, borderRadius: 14 }}>
          <div style={{ color: C.purple, fontWeight: 950, fontSize: 13 }}>{T.suggestionReason}</div>
          <div style={{ marginTop: 5, color: C.text, lineHeight: 1.5 }}>{suggestionReason}</div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }} className="max-[800px]:grid-cols-1">
        <Field label={T.pickupWayId}>
          <input value={selected ? pickupCode(selected) : ""} readOnly style={inputStyle({ color: C.orange, fontFamily: "monospace", opacity: 0.85 })} />
        </Field>

        <Field label={T.requestCode}>
          <input value={selected ? requestCode(selected) : ""} readOnly style={inputStyle({ color: C.sub, fontFamily: "monospace", opacity: 0.85 })} />
        </Field>

        <Field label={`${T.rider} (${T.required})`}>
          <select value={form.riderValue} onChange={(e) => updateForm({ riderValue: e.target.value })} style={selectStyle()}>
            <option value="">{T.selectRider}</option>
            {master.riders.map((item) => (
              <option key={item.value || item.code} value={item.value}>
                {optionLabel(item)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`${T.vehicle} (${T.optional})`}>
          <select value={form.vehicleValue} onChange={(e) => updateForm({ vehicleValue: e.target.value })} style={selectStyle()}>
            <option value="">{T.selectVehicle}</option>
            {master.fleets.map((item) => (
              <option key={item.value || item.code} value={item.value}>
                {optionLabel(item)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`${T.driver} (${T.optional})`}>
          <select value={form.driverValue} onChange={(e) => updateForm({ driverValue: e.target.value })} style={selectStyle()}>
            <option value="">{T.selectDriver}</option>
            {master.drivers.map((item) => (
              <option key={item.value || item.code} value={item.value}>
                {optionLabel(item)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`${T.helper} (${T.optional})`}>
          <select value={form.helperValue} onChange={(e) => updateForm({ helperValue: e.target.value })} style={selectStyle()}>
            <option value="">{T.selectHelper}</option>
            {master.helpers.map((item) => (
              <option key={item.value || item.code} value={item.value}>
                {optionLabel(item)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`${T.note} (${form.note.length}/${NOTE_LIMIT})`} wide>
          <textarea
            value={form.note}
            onChange={(e) => updateForm({ note: e.target.value.slice(0, NOTE_LIMIT + 50) })}
            placeholder={T.supervisorNotePlaceholder}
            style={inputStyle({
              height: 112,
              resize: "vertical",
              paddingTop: 12,
              color: form.note.length > NOTE_LIMIT ? C.red : C.text,
            })}
          />
        </Field>
      </div>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }} className="max-[800px]:grid-cols-1">
        <MiniSelected title={T.selectedRider} option={selectedRider} />
        <MiniSelected title={T.selectedVehicle} option={selectedVehicle} />
      </div>

      <button
        onClick={() => void onAssign()}
        disabled={loading || !selected || blockingIssue}
        style={{
          ...primaryButton(),
          width: "100%",
          marginTop: 16,
          height: 58,
          fontSize: 18,
          opacity: loading || !selected || blockingIssue ? 0.55 : 1,
        }}
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        {T.complete}
      </button>

      {blockingIssue ? (
        <div style={{ marginTop: 12, color: C.red, fontWeight: 900 }}>
          {validationIssues.find((x) => x.severity === "error")?.detail}
        </div>
      ) : null}
    </section>
  );
}

function DetailsAndReadiness({
  T,
  selected,
  selectedRider,
  selectedVehicle,
  validationIssues,
  pickupStatus,
}: {
  T: (typeof I18N)[Lang];
  selected: AnyRow | null;
  selectedRider: MasterOption | null;
  selectedVehicle: MasterOption | null;
  validationIssues: ValidationIssue[];
  pickupStatus: (row: AnyRow) => string;
}) {
  const errors = validationIssues.filter((x) => x.severity === "error").length;
  const warnings = validationIssues.filter((x) => x.severity === "warning").length;
  const ready = errors === 0;

  return (
    <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: 18 }} className="max-[1180px]:grid-cols-1">
      <div style={panel({ padding: 20 })}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ClipboardCheck size={22} color={C.orange} />
          <h2 style={sectionTitle()}>{T.details}</h2>
        </div>

        {selected ? (
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }} className="max-[900px]:grid-cols-1">
            <Detail label={T.pickupId} value={safe(selected.id)} monoText />
            <Detail label={T.pickupWayId} value={pickupCode(selected)} monoText />
            <Detail label={T.requestCode} value={requestCode(selected)} monoText />
            <Detail label={T.merchant} value={safe(selected.merchant_name || selected.merchant_code)} desc={safe(selected.merchant_code)} />
            <Detail label={T.parcels} value={safe(selected.parcel_count || selected.total_parcels || 1)} />
            <Detail label={T.status} value={pickupStatus(selected)} />
            <Detail label={T.address} value={safe(selected.pickup_address)} desc={safe(selected.pickup_township)} wide />
            <Detail label={T.rider} value={selectedRider ? optionLabel(selectedRider) : "-"} />
            <Detail label={T.vehicle} value={selectedVehicle ? optionLabel(selectedVehicle) : "-"} />
          </div>
        ) : (
          <Empty title={T.selectPickup} desc="" compact />
        )}
      </div>

      <div style={panel({ padding: 20 })}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PackageCheck size={22} color={ready ? C.green : errors ? C.red : C.gold} />
          <h2 style={sectionTitle()}>{T.readiness}</h2>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div
            style={{
              border: `1px solid ${ready ? C.green : errors ? C.red : C.gold}66`,
              background: `${ready ? C.green : errors ? C.red : C.gold}12`,
              borderRadius: 18,
              padding: 14,
              fontWeight: 950,
              color: ready ? C.green : errors ? C.red : C.gold,
            }}
          >
            {ready ? T.ready : errors ? T.notReady : T.warning} · {errors} error(s), {warnings} warning(s)
          </div>

          {validationIssues.map((issue, index) => (
            <div key={`${issue.label}-${index}`} style={{ border: `1px solid ${issueTone(issue.severity)}44`, borderRadius: 16, padding: 12, background: `${issueTone(issue.severity)}0F` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: C.text, fontWeight: 950 }}>{issue.label}</span>
                <span style={badge(issueTone(issue.severity), "#061524")}>{issue.severity.toUpperCase()}</span>
              </div>
              <div style={{ marginTop: 5, color: C.sub, fontSize: 13, lineHeight: 1.45 }}>{issue.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panel3, borderRadius: 18, padding: 16 }}>
      <div style={{ color: C.sub, fontSize: 12, fontWeight: 950 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 32, color: C.orange, fontWeight: 950 }}>{Number(value || 0).toLocaleString()}</div>
    </div>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label style={{ display: "block", gridColumn: wide ? "1 / -1" : undefined }}>
      <span style={{ display: "block", marginBottom: 8, color: C.orange, fontSize: 13, fontWeight: 950 }}>{label}</span>
      {children}
    </label>
  );
}

function Detail({ label, value, desc, monoText = false, wide = false }: { label: string; value: string; desc?: string; monoText?: boolean; wide?: boolean }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panel3, borderRadius: 18, padding: 16, gridColumn: wide ? "span 2" : undefined }}>
      <div style={{ color: C.sub, fontSize: 12, fontWeight: 950 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 17, fontWeight: 950, lineHeight: 1.45, fontFamily: monoText ? "monospace" : undefined, wordBreak: "break-word" }}>{value}</div>
      {desc ? <div style={{ marginTop: 6, color: C.sub, lineHeight: 1.45 }}>{desc}</div> : null}
    </div>
  );
}

function MiniSelected({ title, option }: { title: string; option: MasterOption | null }) {
  return (
    <div style={{ border: `1px solid ${option ? C.green : C.border}`, background: option ? `${C.green}10` : C.panel3, borderRadius: 16, padding: 12 }}>
      <div style={{ color: option ? C.green : C.sub, fontSize: 12, fontWeight: 950 }}>{title}</div>
      <div style={{ marginTop: 5, color: C.text, fontWeight: 900, lineHeight: 1.4 }}>{option ? optionLabel(option) : "-"}</div>
    </div>
  );
}

function Empty({ title, desc, compact = false }: { title: string; desc?: string; compact?: boolean }) {
  return (
    <div style={{ border: `1px dashed ${C.border2}`, borderRadius: 20, padding: compact ? 20 : 34, textAlign: "center", color: C.sub }}>
      <div style={{ fontWeight: 950, color: C.text }}>{title}</div>
      {desc ? <div style={{ marginTop: 6, lineHeight: 1.45 }}>{desc}</div> : null}
    </div>
  );
}

function LoadingBlock() {
  return (
    <div style={{ minHeight: 240, display: "grid", placeItems: "center", color: C.sub }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
        <Loader2 size={22} className="animate-spin" />
        Loading...
      </div>
    </div>
  );
}

function panel(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    border: `1px solid ${C.border}`,
    background: `linear-gradient(180deg, ${C.panel}, #081b2b)`,
    borderRadius: 26,
    boxShadow: "0 18px 50px rgba(0,0,0,.25)",
    ...extra,
  };
}

function sectionTitle(): React.CSSProperties {
  return { margin: 0, fontSize: 22, lineHeight: 1.25, fontWeight: 950 };
}

function inputStyle(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    width: "100%",
    height: 48,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    background: C.panel3,
    color: C.text,
    outline: "none",
    padding: "0 14px",
    fontWeight: 850,
    ...extra,
  };
}

function selectStyle(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    ...inputStyle(extra),
    color: C.text,
    backgroundColor: C.panel3,
    cursor: "pointer",
  };
}

function primaryButton(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    minHeight: 50,
    border: "none",
    borderRadius: 16,
    background: C.orange,
    color: "#1b0b05",
    padding: "0 20px",
    fontWeight: 950,
    cursor: "pointer",
    display: "inline-flex",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    ...extra,
  };
}

function secondaryButton(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    ...primaryButton(extra),
    background: C.panel2,
    border: `1px solid ${C.border2}`,
    color: C.text,
  };
}

function mono(color = C.orange): React.CSSProperties {
  return {
    color,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontWeight: 950,
    fontSize: 13,
    wordBreak: "break-all",
  };
}

function badge(bg: string, color: string): React.CSSProperties {
  return {
    display: "inline-flex",
    borderRadius: 999,
    padding: "4px 10px",
    background: bg,
    color,
    fontWeight: 950,
    fontSize: 12,
    whiteSpace: "nowrap",
  };
}
