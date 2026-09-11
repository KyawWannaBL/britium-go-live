import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  CloudOff,
  Headset,
  LayoutDashboard,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  PackageCheck,
  PhoneCall,
  RefreshCw,
  Route,
  ShieldAlert,
  ShieldCheck,
  Wallet,
  Wifi,
  UploadCloud
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Wired go-live page: no mock data, no browser API keys, all mutations go through Supabase RPCs.

// --- AUDIO NOTIFICATION ENGINE ---
const playAlert = (type: "success" | "error" | "alert") => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "success") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === "error") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else {
      osc.type = "square";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (err) {
    console.error("Audio playback failed", err);
  }
};

// --- BILINGUAL DICTIONARY (OFFICIAL TERMINOLOGIES) ---
const translations = {
  en: {
    appTitle: "Britium Field Operations",
    appSubtitle: "Official Pickup & Delivery Management System",
    loginHeader: "Rider Authentication",
    loginCode: "Driver ID / UUID",
    loginPin: "Authentication PIN",
    connectBtn: "Secure Login",
    navDashboard: "Dashboard",
    navPickups: "Pickups",
    navDeliveries: "Deliveries",
    navExceptions: "Exceptions",
    navWallet: "Wallet",
    navSupport: "Support",
    navSync: "System",
    kpiAssigned: "Assigned Pickups",
    kpiActive: "Active Deliveries",
    kpiExceptions: "Pending Exceptions",
    kpiSync: "Offline Queue",
    walletTitle: "Financial Management",
    walletDesc: "Track your real-time COD collections and period earnings.",
    codCollected: "Cash On Hand (COD)",
    totalEarnings: "Period Earnings",
    remittancePending: "Pending Remittance",
    supportTitle: "Driver Support Center",
    supportDesc: "Contact dispatch operations and report emergencies.",
    sosEmergency: "S.O.S Emergency",
    requestDispatch: "Request Dispatch Callback",
    issueDesc: "Issue Description",
    startPickup: "Start Pickup Journey",
    arrivePickup: "Arrive at Location",
    confirmPickup: "Confirm Pickup",
    reportException: "Report Exception",
    startDelivery: "Start Delivery Route",
    arriveDelivery: "Arrive at Destination",
    markDelivered: "Mark as Delivered",
    syncQueue: "Sync Queue",
    goLive: "Go-Live Checks",
    actualParcelCount: "Actual Parcel Count",
    receiverName: "Receiver Name",
    codCollectedInput: "COD Collected",
    photoUrl: "Photo URL",
    signatureUrl: "Signature URL",
    remarks: "Official Remarks",
    callAttempts: "Call Attempts Count",
    codNote: "COD Remarks",
    nextAttemptDate: "Next Attempt Date",
    submit: "Submit",
    cancel: "Cancel",
    noPickups: "No pickup tasks available",
    noDeliveries: "No delivery routes assigned",
    noExceptions: "No open exceptions",
    online: "Online",
    offline: "Offline",
  },
  mm: {
    appTitle: "Britium လုပ်ငန်းလည်ပတ်မှု စီမံခန့်ခွဲရေးစနစ်",
    appSubtitle: "ပို့ကုန်ကောက်ယူရေးနှင့် ပို့ဆောင်ရေး စီမံခန့်ခွဲမှုစနစ်",
    loginHeader: "ပို့ဆောင်ရေးကိုယ်စားလှယ် စနစ်ဝင်ရောက်ခြင်း",
    loginCode: "ကိုယ်စားလှယ် အမှတ်စဉ် (ID)",
    loginPin: "စကားဝှက် (PIN)",
    connectBtn: "စနစ်သို့ ချိတ်ဆက်ဝင်ရောက်မည်",
    navDashboard: "အဓိကလုပ်ငန်းစဉ် အကျဉ်းချုပ်",
    navPickups: "ကောက်ယူမည့် ပို့ကုန်များ",
    navDeliveries: "ပို့ဆောင်မည့် ကုန်ပစ္စည်းများ",
    navExceptions: "ချွင်းချက်ဖြစ်စဉ်များ",
    navWallet: "ငွေကြေးစာရင်း",
    navSupport: "အကူအညီတောင်းခံရန်",
    navSync: "အချက်အလက် ချိတ်ဆက်ခြင်း",
    kpiAssigned: "တာဝန်ပေးအပ်ထားသော ပို့ကုန်ကောက်ယူမှုများ",
    kpiActive: "လက်ရှိ ဆောင်ရွက်ဆဲ ပို့ဆောင်မှုများ",
    kpiExceptions: "ဖြေရှင်းရန်ကျန်ရှိသော ချွင်းချက်ဖြစ်စဉ်များ",
    kpiSync: "အော့ဖ်လိုင်း မှတ်တမ်းများ",
    walletTitle: "ငွေကြေးနှင့် စာရင်း စီမံခန့်ခွဲမှု",
    walletDesc: "ကောက်ခံရရှိသော ငွေသား (COD) နှင့် လုပ်ငန်းဝင်ငွေများအား စစ်ဆေးရန်။",
    codCollected: "လက်ဝယ်ရှိ ကောက်ခံရငွေ (COD)",
    totalEarnings: "ကာလအတွင်း ရရှိသော ဝင်ငွေ",
    remittancePending: "ကုမ္ပဏီသို့ လွှဲပြောင်းပေးသွင်းရန် ကျန်ငွေ",
    supportTitle: "ကိုယ်စားလှယ် အထောက်အကူပြုစင်တာ",
    supportDesc: "လုပ်ငန်းပိုင်းဆိုင်ရာ တာဝန်ခံများနှင့် ဆက်သွယ်ရန်နှင့် အရေးပေါ်အခြေအနေများ တင်ပြရန်။",
    sosEmergency: "အရေးပေါ် အကူအညီ တောင်းခံခြင်း (S.O.S)",
    requestDispatch: "တာဝန်ခံထံမှ ပြန်လည်ဆက်သွယ်ရန် တောင်းဆိုခြင်း",
    issueDesc: "ပြဿနာ အကြောင်းအရာ အသေးစိတ်",
    startPickup: "ပို့ကုန်ကောက်ယူမည့်နေရာသို့ ထွက်ခွာမည်",
    arrivePickup: "သတ်မှတ်နေရာသို့ ရောက်ရှိကြောင်း အတည်ပြုမည်",
    confirmPickup: "ပို့ကုန်လက်ခံရရှိကြောင်း အတည်ပြုမည်",
    reportException: "ချွင်းချက်ဖြစ်စဉ် (Exception) တင်ပြမည်",
    startDelivery: "ကုန်ပစ္စည်း ပို့ဆောင်ရန် ထွက်ခွာမည်",
    arriveDelivery: "ပို့ဆောင်မည့်နေရာသို့ ရောက်ရှိကြောင်း အတည်ပြုမည်",
    markDelivered: "ကုန်ပစ္စည်းပေးပို့မှု အောင်မြင်ကြောင်း အတည်ပြုမည်",
    syncQueue: "ချိတ်ဆက်ရန် ကျန်ရှိသော မှတ်တမ်းများအား ပေးပို့မည်",
    goLive: "လုပ်ငန်းစတင်ရန် စနစ်စစ်ဆေးမှုများ (Go-Live Checks)",
    actualParcelCount: "အမှန်တကယ် လက်ခံရရှိသော ပါဆယ်အရေအတွက်",
    receiverName: "ကုန်ပစ္စည်း လက်ခံသူအမည်",
    codCollectedInput: "ကောက်ခံရရှိသော COD ငွေပမာဏ",
    photoUrl: "ဓာတ်ပုံ အထောက်အထား (URL)",
    signatureUrl: "အီလက်ထရောနစ် လက်မှတ် (URL)",
    remarks: "တရားဝင် လုပ်ငန်းမှတ်ချက်များ",
    callAttempts: "ဖုန်းခေါ်ဆိုမှု အကြိမ်အရေအတွက်",
    codNote: "COD နှင့်ပတ်သက်သော မှတ်ချက်များ",
    nextAttemptDate: "နောက်တစ်ကြိမ် ထပ်မံဆောင်ရွက်မည့် ရက်စွဲ",
    submit: "အတည်ပြု တင်သွင်းမည်",
    cancel: "ပယ်ဖျက်မည်",
    noPickups: "လက်ရှိ တာဝန်ပေးအပ်ထားသော ကောက်ယူရန်ပို့ကုန် မရှိပါ။",
    noDeliveries: "လက်ရှိ တာဝန်ပေးအပ်ထားသော ပို့ဆောင်ရန်ကုန်ပစ္စည်း မရှိပါ။",
    noExceptions: "လက်ရှိ ဖြေရှင်းရန် ချွင်းချက်ဖြစ်စဉ် မရှိပါ။",
    online: "ကွန်ရက် ချိတ်ဆက်ထားသည် (Online)",
    offline: "ကွန်ရက် ပြတ်တောက်နေသည် (Offline)",
  },
};

type Lang = "en" | "mm";
const I18nContext = createContext({ lang: "en" as Lang, t: (k: keyof typeof translations.en) => "", toggle: () => {} });

function useI18n() {
  return useContext(I18nContext);
}

// --- UTILITIES ---
function safe(v: any, f = "-") {
  return v === null || v === undefined || v === "" ? f : String(v);
}
function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}
function fmt(v: any) {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function hasWindow() {
  return typeof window !== "undefined";
}

function hasNavigator() {
  return typeof navigator !== "undefined";
}

function looksLikeHttpUrl(value: any) {
  const s = safe(value, "").trim();
  return !s || /^https?:\/\//i.test(s) || /^data:image\//i.test(s);
}

function buildLocalId(prefix = "rider_queue") {
  const cryptoApi = hasWindow() ? window.crypto : undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeRpcData<T = any>(data: T) {
  if (Array.isArray(data)) return data[0] as T;
  return data;
}

function isGpsMissing(gps: any) {
  return gps?.gps_lat === null || gps?.gps_lat === undefined || gps?.gps_lng === null || gps?.gps_lng === undefined;
}

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
  gold: "#f6b84b",
  green: "#22c55e",
  red: "#ff4f86",
  blue: "#38bdf8",
};

// --- STORAGE & GPS ---
type RiderQueueItem = {
  id: string;
  actionType: string;
  entityType: string;
  entityKey: string;
  payload: any;
  queuedAt: string;
};

const getBrowserLocation = (): Promise<{ gps_lat: number | null; gps_lng: number | null }> => {
  return new Promise((resolve) => {
    if (!hasNavigator() || !navigator.geolocation) {
      return resolve({ gps_lat: null, gps_lng: null });
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ gps_lat: pos.coords.latitude, gps_lng: pos.coords.longitude }),
      () => resolve({ gps_lat: null, gps_lng: null }),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 8_000 }
    );
  });
};

const riderStorage = {
  getRiderId: () => {
    try {
      if (!hasWindow()) return "";
      return window.localStorage.getItem("be_rider_id") || "";
    } catch {
      return "";
    }
  },
  setRiderId: (id: string) => {
    try {
      if (hasWindow()) window.localStorage.setItem("be_rider_id", id);
    } catch {
      // localStorage may be unavailable in privacy mode
    }
  },
  getQueue: (): RiderQueueItem[] => {
    try {
      if (!hasWindow()) return [];
      const parsed = JSON.parse(window.localStorage.getItem("be_rider_sync_queue") || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  enqueue: (actionType: string, entityType: string, entityKey: string, payload: any) => {
    const q = riderStorage.getQueue();
    q.push({
      id: buildLocalId(),
      actionType,
      entityType,
      entityKey,
      payload,
      queuedAt: new Date().toISOString(),
    });
    try {
      if (hasWindow()) window.localStorage.setItem("be_rider_sync_queue", JSON.stringify(q));
    } catch {
      // localStorage may be unavailable in privacy mode
    }
  },
  removeQueueItem: (id: string) => {
    const q = riderStorage.getQueue().filter((x) => x.id !== id);
    try {
      if (hasWindow()) window.localStorage.setItem("be_rider_sync_queue", JSON.stringify(q));
    } catch {
      // localStorage may be unavailable in privacy mode
    }
  },
};

// --- VALIDATION HELPER ---
const validateRuleDrivenException = (rule: any, form: any) => {
  const errors: string[] = [];
  if (!rule) return ["Exception rule not found. Please select a valid reason."];
  if (rule.require_remark === "YES" && !form.remarks?.trim()) errors.push("Remark is required for this exception");
  if (rule.require_photo === "YES" && !form.photoUrl?.trim()) errors.push("Photo proof is required");
  if (rule.require_call_log === "YES" && (!form.callAttemptCount || Number(form.callAttemptCount) < 1)) errors.push("Call attempt count is required");
  if (rule.require_cod_note === "YES" && !form.codNote?.trim()) errors.push("COD note is required for this exception");
  if (rule.allow_reschedule === "YES" && !form.nextAttemptDate) errors.push("Next attempt date is required");
  return errors;
};

// --- API LAYER ---
const riderAppApi = {
  resolveRiderId: async (code: string, pin?: string) => {
    const { data, error } = await (supabase as any).rpc("be_rider_resolve_identity", {
      p_rider_key: code,
      p_pin: pin?.trim() || null,
    });

    if (error) throw new Error(error.message || "Invalid rider credentials.");
    const rider = normalizeRpcData<any>(data);
    if (!rider?.id) throw new Error("Invalid rider credentials.");
    return rider;
  },

  snapshot: async (riderId: string) => {
    const { data, error } = await (supabase as any).rpc("be_rider_app_snapshot", { p_rider_id: riderId });
    if (error) throw error;
    return data || {};
  },

  startPickupTrip: async (payload: any) => await (supabase as any).rpc("be_rider_start_pickup_trip", { p_payload: payload }),
  arriveAtPickup: async (payload: any) => await (supabase as any).rpc("be_rider_arrive_at_pickup", { p_payload: payload }),
  confirmPickupCompleted: async (payload: any) => await (supabase as any).rpc("be_rider_confirm_pickup", { p_payload: payload }),
  reportPickupException: async (payload: any) => await (supabase as any).rpc("be_rider_report_pickup_exception", { p_payload: payload }),
  startDeliveryRoute: async (payload: any) => await (supabase as any).rpc("be_rider_start_delivery_route", { p_payload: payload }),
  arriveDeliveryStop: async (payload: any) => await (supabase as any).rpc("be_rider_arrive_delivery_stop", { p_payload: payload }),

  markDelivered: async (payload: any) => {
    const rich = await (supabase as any).rpc("be_rider_mark_delivered_with_signature_and_cod", { p_payload: payload });
    if (!rich.error) return rich;

    // Temporary backward-compatible fallback for environments where the finance/signature SQL has not yet been applied.
    return await (supabase as any).rpc("be_rider_mark_delivered", { p_payload: payload });
  },

  reportDeliveryException: async (payload: any) => await (supabase as any).rpc("be_rider_report_delivery_exception", { p_payload: payload }),
  requestSupport: async (payload: any) => await (supabase as any).rpc("be_rider_support_request", { p_payload: payload }),

  flushQueue: async (_riderId: string) => {
    const queue = riderStorage.getQueue();
    if (queue.length === 0) return { ok: true, flushed: 0, failed: 0 };

    let flushed = 0;
    let failed = 0;

    for (const item of queue) {
      try {
        let fn = riderAppApi.startPickupTrip;
        if (item.actionType === "START_PICKUP_TRIP") fn = riderAppApi.startPickupTrip;
        else if (item.actionType === "ARRIVE_AT_PICKUP") fn = riderAppApi.arriveAtPickup;
        else if (item.actionType === "CONFIRM_PICKUP_COMPLETED") fn = riderAppApi.confirmPickupCompleted;
        else if (item.actionType === "REPORT_PICKUP_EXCEPTION") fn = riderAppApi.reportPickupException;
        else if (item.actionType === "START_DELIVERY_ROUTE") fn = riderAppApi.startDeliveryRoute;
        else if (item.actionType === "ARRIVE_DELIVERY_STOP") fn = riderAppApi.arriveDeliveryStop;
        else if (item.actionType === "MARK_DELIVERED") fn = riderAppApi.markDelivered;
        else if (item.actionType === "REPORT_DELIVERY_EXCEPTION") fn = riderAppApi.reportDeliveryException;

        const { error } = await fn(item.payload);
        if (error) throw error;

        riderStorage.removeQueueItem(item.id);
        flushed++;
      } catch {
        failed++;
      }
    }

    return { ok: failed === 0, flushed, failed };
  },
};

// --- MAIN COMPONENT ---
export default function RiderAppPage() {
  const [lang, setLang] = useState<Lang>("mm");
  const t = useCallback((k: keyof typeof translations.en) => translations[lang][k] || k, [lang]);

  return (
    <I18nContext.Provider value={{ lang, t, toggle: () => setLang(l => (l === "en" ? "mm" : "en")) }}>
      <AppShell />
    </I18nContext.Provider>
  );
}

function AppShell() {
  const { lang, t, toggle } = useI18n();
  const [riderInput, setRiderInput] = useState(riderStorage.getRiderId());
  const [pinInput, setPinInput] = useState("");
  const [rider, setRider] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [tab, setTab] = useState<"dashboard" | "pickups" | "deliveries" | "exceptions" | "wallet" | "support" | "sync">("dashboard");
  const [activeAction, setActiveAction] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(hasNavigator() ? navigator.onLine : true);
  const [queueSize, setQueueSize] = useState(riderStorage.getQueue().length);

  const riderId = rider?.id;

  const pickupRules = useMemo(() => (snapshot?.rules?.exception_rules || []).filter((r: any) => r.process_type === "PICKUP"), [snapshot]);
  const deliveryRules = useMemo(() => (snapshot?.rules?.exception_rules || []).filter((r: any) => r.process_type === "DELIVERY"), [snapshot]);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await riderAppApi.snapshot(id);
      setSnapshot(data);
      setRider((prev: any) => data?.rider || prev);
      setQueueSize(riderStorage.getQueue().length);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to load snapshot" });
      playAlert("error");
    } finally {
      setBusy(false);
    }
  }, []);

  const connectRider = async () => {
    if (!riderInput.trim()) return setMessage({ type: "error", text: "Rider ID / UUID is required" });
    setBusy(true);
    setMessage(null);
    try {
      const r = await riderAppApi.resolveRiderId(riderInput.trim(), pinInput.trim());
      setRider(r);
      riderStorage.setRiderId(r.id);
      await load(r.id);
      playAlert("success");
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
      playAlert("error");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);

  useEffect(() => {
    if (riderStorage.getRiderId()) {
      void load(riderStorage.getRiderId());
    }
  }, [load]);

  async function executeAction(actionType: string, entityType: string, entityKey: string, payloadFactory: (gps: any) => any) {
    if (!riderId) return;
    setBusy(true);
    setMessage(null);

    try {
      const gps = await getBrowserLocation();
      if (isGpsMissing(gps)) {
        throw new Error("GPS permission is required for rider pickup and delivery actions.");
      }

      const payload = payloadFactory(gps);

      if (!hasNavigator() || !navigator.onLine) {
        riderStorage.enqueue(actionType, entityType, entityKey, payload);
        setQueueSize(riderStorage.getQueue().length);
        setMessage({ type: "warning", text: t("syncQueue") as string });
        setActiveAction(null);
        playAlert("alert");
        return;
      }

      let fn = riderAppApi.startPickupTrip;
      if (actionType === "START_PICKUP_TRIP") fn = riderAppApi.startPickupTrip;
      else if (actionType === "ARRIVE_AT_PICKUP") fn = riderAppApi.arriveAtPickup;
      else if (actionType === "CONFIRM_PICKUP_COMPLETED") fn = riderAppApi.confirmPickupCompleted;
      else if (actionType === "REPORT_PICKUP_EXCEPTION") fn = riderAppApi.reportPickupException;
      else if (actionType === "START_DELIVERY_ROUTE") fn = riderAppApi.startDeliveryRoute;
      else if (actionType === "ARRIVE_DELIVERY_STOP") fn = riderAppApi.arriveDeliveryStop;
      else if (actionType === "MARK_DELIVERED") fn = riderAppApi.markDelivered;
      else if (actionType === "REPORT_DELIVERY_EXCEPTION") fn = riderAppApi.reportDeliveryException;

      const { error } = await fn(payload);
      if (error) throw error;

      setMessage({ type: "success", text: "လုပ်ဆောင်ချက် အောင်မြင်ပါသည်" });
      setActiveAction(null);
      playAlert("success");
      await load(riderId);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
      playAlert("error");
    } finally {
      setBusy(false);
    }
  }

  async function flushQueue() {
    if (!riderId) return;
    setBusy(true);
    try {
      const result = await riderAppApi.flushQueue(riderId);
      setQueueSize(riderStorage.getQueue().length);
      setMessage({ type: result.ok ? "success" : "warning", text: `Flushed: ${result.flushed}, Failed: ${result.failed}` });
      if (result.ok) playAlert("success"); else playAlert("alert");
      await load(riderId);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
      playAlert("error");
    } finally {
      setBusy(false);
    }
  }

  if (!riderId || !snapshot) {
    return (
      <div style={styles.page}>
        <div style={{ maxWidth: 480, margin: "10vh auto", ...styles.card, padding: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={styles.eyebrow}>{t("appTitle")}</div>
            <button onClick={toggle} style={{ ...styles.badge, cursor: "pointer", background: C.panel3, color: C.text }}>{lang === "en" ? "မြန်မာ" : "EN"}</button>
          </div>
          <h1 style={{ ...styles.title, fontSize: 28, marginTop: 12 }}>{t("loginHeader")}</h1>
          <p style={{ ...styles.desc, marginBottom: 24 }}>{t("appSubtitle")}</p>
          
          <label style={styles.label}>{t("loginCode")}</label>
          <input value={riderInput} onChange={(e) => setRiderInput(e.target.value)} placeholder="RID-0001" style={{ ...styles.input, marginBottom: 16 }} />
          
          <label style={styles.label}>{t("loginPin")}</label>
          <input type="password" value={pinInput} onChange={(e) => setPinInput(e.target.value)} placeholder="Optional until PIN enforcement" style={{ ...styles.input, marginBottom: 24 }} />
          
          {message ? <MessageBanner message={message} onClose={() => setMessage(null)} /> : null}
          
          <button style={{ ...styles.primaryBtn, width: "100%", marginTop: 16 }} disabled={busy} onClick={connectRider}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
            {t("connectBtn")}
          </button>
        </div>
      </div>
    );
  }

  const kpis = snapshot?.kpis || {};
  const pickups = Array.isArray(snapshot?.pickups) ? snapshot.pickups : [];
  const wayplans = Array.isArray(snapshot?.delivery_wayplans) ? snapshot.delivery_wayplans : [];
  const openExceptions = Array.isArray(snapshot?.open_exceptions) ? snapshot.open_exceptions : [];

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        
        {/* HEADER */}
        <section style={styles.hero}>
          <div>
            <div style={styles.eyebrow}>{t("appTitle")}</div>
            <h1 style={styles.title}>{rider?.name || rider?.rider_code || rider?.id}</h1>
            <p style={styles.desc}>{rider?.phone || "Authorized Driver Account"}</p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Badge color={isOnline ? C.green : C.red} icon={isOnline ? <Wifi size={14} /> : <CloudOff size={14} />}>
                {isOnline ? t("online") : t("offline")}
              </Badge>
              <Badge color={queueSize ? C.gold : C.green}>Queue: {queueSize}</Badge>
            </div>
            <button onClick={toggle} style={{ ...styles.badge, cursor: "pointer", background: C.panel, color: C.text }}>{lang === "en" ? "မြန်မာ" : "EN"}</button>
            <button style={styles.iconBtn} disabled={busy} onClick={() => void load(riderId)}>
              <RefreshCw size={18} className={busy ? "animate-spin" : ""} />
            </button>
          </div>
        </section>

        {message ? <MessageBanner message={message} onClose={() => setMessage(null)} /> : null}

        {/* NAVIGATION */}
        <section style={styles.tabBar}>
          <Tab active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={<LayoutDashboard size={17} />}>{t("navDashboard")}</Tab>
          <Tab active={tab === "pickups"} onClick={() => setTab("pickups")} icon={<PackageCheck size={17} />}>{t("navPickups")}</Tab>
          <Tab active={tab === "deliveries"} onClick={() => setTab("deliveries")} icon={<Route size={17} />}>{t("navDeliveries")}</Tab>
          <Tab active={tab === "exceptions"} onClick={() => setTab("exceptions")} icon={<AlertTriangle size={17} />}>{t("navExceptions")}</Tab>
          <Tab active={tab === "wallet"} onClick={() => setTab("wallet")} icon={<Wallet size={17} />}>{t("navWallet")}</Tab>
          <Tab active={tab === "support"} onClick={() => setTab("support")} icon={<Headset size={17} />}>{t("navSupport")}</Tab>
          <Tab active={tab === "sync"} onClick={() => setTab("sync")} icon={<RefreshCw size={17} />}>{t("navSync")}</Tab>
        </section>

        {busy && !snapshot ? <Loading /> : null}

        {tab === "dashboard" ? (
          <section style={styles.kpiGrid}>
            <Kpi label={t("kpiAssigned")} value={kpis.assigned_pickups} tone={C.orange} icon={<Briefcase size={22}/>} />
            <Kpi label={t("kpiActive")} value={kpis.active_wayplans} tone={C.blue} icon={<Route size={22}/>} />
            <Kpi label={t("kpiExceptions")} value={kpis.open_exceptions} tone={C.red} icon={<AlertTriangle size={22}/>} />
            <Kpi label={t("kpiSync")} value={queueSize} tone={C.gold} icon={<CloudOff size={22}/>} />
          </section>
        ) : null}

        {tab === "wallet" ? <WalletTab snapshot={snapshot} /> : null}
        
        {tab === "support" ? <SupportTab riderId={riderId} busy={busy} setBusy={setBusy} setMessage={setMessage} /> : null}

        {tab === "pickups" ? (
          <PickupTab pickups={pickups} rules={pickupRules} riderId={riderId} busy={busy} onAction={setActiveAction} onQuick={executeAction} />
        ) : null}

        {tab === "deliveries" ? (
          <DeliveryTab wayplans={wayplans} rules={deliveryRules} riderId={riderId} busy={busy} onAction={setActiveAction} onQuick={executeAction} />
        ) : null}

        {tab === "exceptions" ? <ExceptionsTab exceptions={openExceptions} /> : null}

        {tab === "sync" ? <SyncTab snapshot={snapshot} queueSize={queueSize} online={isOnline} onFlush={flushQueue} busy={busy} /> : null}

        {activeAction ? (
          <ActionModal
            action={activeAction}
            riderId={riderId}
            pickupRules={pickupRules}
            deliveryRules={deliveryRules}
            onCancel={() => setActiveAction(null)}
            onSubmit={executeAction}
            busy={busy}
          />
        ) : null}
      </div>
    </main>
  );
}

// --- TAB COMPONENTS ---

function WalletTab({ snapshot }: any) {
  const { t } = useI18n();
  // Extracted from snapshot if backend provided, otherwise safe fallbacks
  const fin = snapshot?.financials || { cod_on_hand: 0, period_earnings: 0, pending_remittance: 0 };

  return (
    <section style={styles.card}>
      <div style={styles.cardTop}>
        <div>
          <h3 style={styles.cardTitle}>{t("walletTitle")}</h3>
          <p style={styles.cardSub}>{t("walletDesc")}</p>
        </div>
        <Banknote size={32} color={C.green} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginTop: 24 }}>
        <div style={{ ...styles.kpi, borderColor: `${C.green}66`, background: `${C.green}12` }}>
          <div style={{ color: C.green, fontWeight: 950, fontSize: 13 }}>{t("codCollected")}</div>
          <div style={{ color: C.green, fontSize: 36, fontWeight: 950, marginTop: 8 }}>{Number(fin.cod_on_hand).toLocaleString()} <span style={{fontSize: 16}}>MMK</span></div>
        </div>
        <div style={{ ...styles.kpi, borderColor: `${C.blue}66`, background: `${C.blue}12` }}>
          <div style={{ color: C.blue, fontWeight: 950, fontSize: 13 }}>{t("totalEarnings")}</div>
          <div style={{ color: C.blue, fontSize: 36, fontWeight: 950, marginTop: 8 }}>{Number(fin.period_earnings).toLocaleString()} <span style={{fontSize: 16}}>MMK</span></div>
        </div>
        <div style={{ ...styles.kpi, borderColor: `${C.orange}66`, background: `${C.orange}12` }}>
          <div style={{ color: C.orange, fontWeight: 950, fontSize: 13 }}>{t("remittancePending")}</div>
          <div style={{ color: C.orange, fontSize: 36, fontWeight: 950, marginTop: 8 }}>{Number(fin.pending_remittance).toLocaleString()} <span style={{fontSize: 16}}>MMK</span></div>
        </div>
      </div>
    </section>
  );
}

function SupportTab({ riderId, busy, setBusy, setMessage }: any) {
  const { t } = useI18n();
  const [desc, setDesc] = useState("");

  const handleSupport = async (type: string) => {
    setBusy(true);
    try {
      await riderAppApi.requestSupport({ riderId, type, description: desc });
      setMessage({ type: "success", text: "အကူအညီတောင်းခံမှု အောင်မြင်ပါသည်။" });
      playAlert("success");
      setDesc("");
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message || "အကူအညီတောင်းခံမှု မအောင်မြင်ပါ။" });
      playAlert("error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={styles.card}>
       <div style={styles.cardTop}>
        <div>
          <h3 style={styles.cardTitle}>{t("supportTitle")}</h3>
          <p style={styles.cardSub}>{t("supportDesc")}</p>
        </div>
      </div>
      <div style={{ marginTop: 24, display: "grid", gap: 16, maxWidth: 600 }}>
         <button onClick={() => handleSupport("SOS")} disabled={busy} style={{ ...styles.dangerBtn, minHeight: 64, fontSize: 18 }}>
            <ShieldAlert size={24} /> {t("sosEmergency")}
         </button>
         
         <div style={{ marginTop: 16 }}>
            <label style={styles.label}>{t("issueDesc")}</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} style={{ ...styles.input, minHeight: 100, paddingTop: 12 }} />
         </div>
         
         <button onClick={() => handleSupport("CALLBACK")} disabled={busy || !desc.trim()} style={{ ...styles.primaryBtn, background: C.blue, color: "#061524" }}>
            <PhoneCall size={18} /> {t("requestDispatch")}
         </button>
      </div>
    </section>
  );
}

function PickupTab({ pickups, rules, riderId, onAction, onQuick, busy }: any) {
  const { t } = useI18n();
  return (
    <section style={styles.gridList}>
      {pickups.length === 0 ? <Empty title={t("noPickups")} /> : null}
      {pickups.map((p: any) => (
        <article key={p.id} style={styles.card}>
          <div style={styles.cardTop}>
            <div>
              <div style={styles.mono}>{safe(p.pickup_way_id || p.request_code)}</div>
              <h3 style={styles.cardTitle}>{safe(p.merchant_name || p.merchant_code)}</h3>
              <p style={styles.cardSub}>{safe(p.pickup_address)}</p>
            </div>
            <StatusPill status={p.status} />
          </div>
          <div style={styles.actionRow}>
            <button style={styles.secondaryBtn} disabled={busy} onClick={() => onQuick("START_PICKUP_TRIP", "pickup_request", p.request_code, (gps: any) => ({ requestCode: p.request_code, riderId, ...gps }))}>
              <Navigation size={15} /> {t("startPickup")}
            </button>
            <button style={styles.secondaryBtn} disabled={busy} onClick={() => onQuick("ARRIVE_AT_PICKUP", "pickup_request", p.request_code, (gps: any) => ({ requestCode: p.request_code, riderId, ...gps }))}>
              <LocateFixed size={15} /> {t("arrivePickup")}
            </button>
            <button style={styles.primaryBtn} disabled={busy} onClick={() => onAction({ type: "CONFIRM_PICKUP_COMPLETED", entity: p })}>
              <CheckCircle2 size={15} /> {t("confirmPickup")}
            </button>
            <button style={styles.dangerBtn} disabled={busy} onClick={() => onAction({ type: "REPORT_PICKUP_EXCEPTION", entity: p, rules })}>
              <AlertTriangle size={15} /> {t("reportException")}
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

function DeliveryTab({ wayplans, rules, riderId, onAction, onQuick, busy }: any) {
  const { t } = useI18n();
  return (
    <section style={{ display: "grid", gap: 18 }}>
      {wayplans.length === 0 ? <Empty title={t("noDeliveries")} /> : null}
      {wayplans.map((wp: any) => (
        <article key={wp.id} style={styles.card}>
          <div style={styles.cardTop}>
            <div>
              <div style={styles.mono}>{safe(wp.wayplan_code || wp.wayplan_no)}</div>
              <h3 style={styles.cardTitle}>{safe(wp.route_name || wp.pickup_way_id || "Delivery Route")}</h3>
              <p style={styles.cardSub}>{safe(wp.merchant_name)} · {safe(wp.plan_date || wp.planned_date)}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <StatusPill status={wp.status} />
              <div style={{ marginTop: 8 }}>
                <button style={styles.primaryBtn} disabled={busy} onClick={() => onQuick("START_DELIVERY_ROUTE", "wayplan", wp.id, (gps: any) => ({ wayplanId: wp.id, riderId, ...gps }))}>
                  <Route size={15} /> {t("startDelivery")}
                </button>
              </div>
            </div>
          </div>

          <div style={styles.stopList}>
            {(wp.stops || []).map((s: any) => (
              <div key={s.id} style={styles.stopRow}>
                <div style={styles.stopNo}>{safe(s.stop_sequence)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={styles.stopTitle}>{safe(s.delivery_way_id || s.tracking_no)}</div>
                  <div style={styles.stopSub}>{safe(s.receiver_name)} · {safe(s.receiver_phone)} · COD {safe(s.cod_amount, "0")}</div>
                  <div style={styles.stopSub}>{safe(s.address)}</div>
                </div>
                <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                  <StatusPill status={s.status || s.stop_status || s.shipment_status} />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "end" }}>
                    <button style={styles.smallBtn} onClick={() => onQuick("ARRIVE_DELIVERY_STOP", "shipment", s.delivery_way_id, (gps: any) => ({ deliveryWayId: s.delivery_way_id, riderId, ...gps }))}>
                      <MapPin size={14} /> {t("arriveDelivery")}
                    </button>
                    <button style={styles.smallPrimaryBtn} onClick={() => onAction({ type: "MARK_DELIVERED", entity: s })}>
                      <PackageCheck size={14} /> {t("markDelivered")}
                    </button>
                    <button style={styles.smallDangerBtn} onClick={() => onAction({ type: "REPORT_DELIVERY_EXCEPTION", entity: s, rules })}>
                      <AlertTriangle size={14} /> {t("reportException")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function ExceptionsTab({ exceptions }: any) {
  const { t } = useI18n();
  return (
    <section style={styles.gridList}>
      {exceptions.length === 0 ? <Empty title={t("noExceptions")} /> : null}
      {exceptions.map((e: any) => (
        <article key={e.id} style={styles.card}>
          <div style={styles.cardTop}>
            <div>
              <div style={styles.mono}>{safe(e.exception_code || e.event_type)}</div>
              <h3 style={styles.cardTitle}>{safe(e.process_type)} Exception</h3>
              <p style={styles.cardSub}>{safe(e.description)}</p>
            </div>
            <StatusPill status={e.status} tone={C.red} />
          </div>
          <div style={styles.infoGrid}>
            <Info label="Severity" value={safe(e.severity)} />
            <Info label="Next Action" value={safe(e.next_action)} />
            <Info label="Created" value={fmt(e.created_at)} />
            <Info label="Next Attempt" value={safe(e.next_attempt_date)} />
          </div>
        </article>
      ))}
    </section>
  );
}

function SyncTab({ snapshot, queueSize, online, onFlush, busy }: any) {
  const { t } = useI18n();
  const rider = snapshot?.rider;
  const checks = [
    ["စနစ်မှတ်ပုံတင်ခြင်း (Rider master)", Boolean(rider?.id), safe(rider?.rider_code || rider?.id)],
    ["ကွန်ရက် ချိတ်ဆက်မှု (Online sync)", online, online ? "Online" : "Offline"],
  ];

  return (
    <section style={styles.card}>
      <div style={styles.cardTop}>
        <div>
          <h3 style={styles.cardTitle}>{t("goLive")}</h3>
          <p style={styles.cardSub}>အချက်အလက် စစ်ဆေးမှုများနှင့် အော့ဖ်လိုင်း မှတ်တမ်းများ ပေးပို့ရန်။</p>
        </div>
        <button style={styles.primaryBtn} disabled={busy || !online || queueSize === 0} onClick={() => void onFlush()}>
          <UploadCloud size={16} /> {t("syncQueue")}
        </button>
      </div>
      <div style={styles.checkGrid}>
        {checks.map(([label, pass, detail]: any) => (
          <div key={label} style={{ ...styles.checkCard, borderColor: pass ? `${C.green}88` : `${C.red}88` }}>
            <div style={{ color: pass ? C.green : C.red, display: "flex", alignItems: "center", gap: 8, fontWeight: 950 }}>
              {pass ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              {pass ? "စစ်ဆေးပြီး" : "စစ်ဆေးရန်"}
            </div>
            <div style={{ marginTop: 8, fontWeight: 950 }}>{label}</div>
            <div style={{ color: C.sub, marginTop: 4 }}>{detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActionModal({ action, riderId, pickupRules, deliveryRules, onCancel, onSubmit, busy }: any) {
  const { t, lang } = useI18n();
  const [form, setForm] = useState<any>({
    actualParcelCount: action?.entity?.parcel_count || "",
    receiverName: action?.entity?.receiver_name || "",
    codCollected: action?.entity?.cod_amount || "",
    photoUrl: "",
    signatureUrl: "",
    remarks: "",
    exceptionCode: "",
    callAttemptCount: "",
    codNote: "",
    nextAttemptDate: todayIsoDate(),
  });
  const [errors, setErrors] = useState<string[]>([]);

  const isPickupException = action.type === "REPORT_PICKUP_EXCEPTION";
  const isDeliveryException = action.type === "REPORT_DELIVERY_EXCEPTION";
  const isException = isPickupException || isDeliveryException;
  const rules = isPickupException ? pickupRules : deliveryRules;
  const selectedRule = rules.find((r: any) => r.exception_code === form.exceptionCode);

  function validate() {
    const next: string[] = [];
    if (!riderId) next.push("ပို့ဆောင်ရေးကိုယ်စားလှယ် အချက်အလက် လိုအပ်ပါသည်။");

    if (action.type === "CONFIRM_PICKUP_COMPLETED") {
      if (Number(form.actualParcelCount || 0) <= 0) next.push("အမှန်တကယ် လက်ခံရရှိသော ပါဆယ်အရေအတွက် ဖြည့်သွင်းပါ။");
    }
    if (action.type === "MARK_DELIVERED") {
      if (!form.receiverName.trim()) next.push("ကုန်ပစ္စည်း လက်ခံသူအမည် ဖြည့်သွင်းရန် လိုအပ်ပါသည်။");
      if (!form.signatureUrl.trim()) next.push("အီလက်ထရောနစ် လက်မှတ် ထည့်သွင်းရန် လိုအပ်ပါသည်။");
      const expectedCod = Number(action.entity?.cod_amount || 0);
      if (expectedCod > 0 && form.codCollected === "") next.push("ကောက်ခံရရှိသော COD ငွေပမာဏ ဖြည့်သွင်းရန် လိုအပ်ပါသည်။");
      if (expectedCod > 0 && Number(form.codCollected) !== expectedCod) next.push("ကောက်ခံရရှိသော COD ပမာဏသည် မှတ်တမ်းပါ ပမာဏနှင့် ကိုက်ညီမှု မရှိပါ။");
    }
    if (form.photoUrl && !looksLikeHttpUrl(form.photoUrl)) {
      next.push("Photo proof must be a valid http(s) URL or uploaded data URL.");
    }
    if (form.signatureUrl && !looksLikeHttpUrl(form.signatureUrl)) {
      next.push("Electronic signature must be a valid http(s) URL or uploaded data URL.");
    }
    if (form.remarks && form.remarks.length > 500) {
      next.push("Remarks must not exceed 500 characters.");
    }

    if (isException) {
      next.push(...validateRuleDrivenException(selectedRule, form));
    }
    setErrors(next);
    if(next.length > 0) playAlert("alert");
    return next.length === 0;
  }

  async function submit() {
    if (!validate()) return;
    const e = action.entity;
    if (action.type === "CONFIRM_PICKUP_COMPLETED") {
      await onSubmit("CONFIRM_PICKUP_COMPLETED", "pickup_request", e.request_code, (gps: any) => ({
        requestCode: e.request_code, riderId, actualParcelCount: Number(form.actualParcelCount), photoUrl: form.photoUrl || null, signatureUrl: form.signatureUrl || null, remarks: form.remarks || null, ...gps,
      }));
    } else if (action.type === "REPORT_PICKUP_EXCEPTION") {
      await onSubmit("REPORT_PICKUP_EXCEPTION", "pickup_request", e.request_code, (gps: any) => ({
        requestCode: e.request_code, exceptionCode: form.exceptionCode, riderId, remarks: form.remarks, photoUrl: form.photoUrl || null, callAttemptCount: form.callAttemptCount ? Number(form.callAttemptCount) : null, nextAttemptDate: form.nextAttemptDate || null, ...gps,
      }));
    } else if (action.type === "MARK_DELIVERED") {
      await onSubmit("MARK_DELIVERED", "shipment", e.delivery_way_id, (gps: any) => ({
        deliveryWayId: e.delivery_way_id || e.tracking_no || e.waybill_id, riderId, receiverName: form.receiverName, codCollected: form.codCollected !== "" ? Number(form.codCollected) : null, photoUrl: form.photoUrl || null, signatureUrl: form.signatureUrl || null, remarks: form.remarks || null, ...gps,
      }));
    } else if (action.type === "REPORT_DELIVERY_EXCEPTION") {
      await onSubmit("REPORT_DELIVERY_EXCEPTION", "shipment", e.delivery_way_id, (gps: any) => ({
        deliveryWayId: e.delivery_way_id, exceptionCode: form.exceptionCode, riderId, remarks: form.remarks, photoUrl: form.photoUrl || null, callAttemptCount: form.callAttemptCount ? Number(form.callAttemptCount) : null, codNote: form.codNote || null, nextAttemptDate: form.nextAttemptDate || null, ...gps,
      }));
    }
  }

  return (
    <div style={styles.modalBackdrop}>
      <div style={styles.modal}>
        <div style={styles.cardTop}>
          <div>
            <div style={styles.mono}>{action.type}</div>
            <h3 style={styles.cardTitle}>{t(action.type === "CONFIRM_PICKUP_COMPLETED" ? "confirmPickup" : action.type === "MARK_DELIVERED" ? "markDelivered" : "reportException")}</h3>
          </div>
          <button style={styles.iconBtn} onClick={onCancel}>×</button>
        </div>

        {isException ? (
          <div style={{ marginTop: 14 }}>
            <label style={styles.label}>ချွင်းချက်ဖြစ်စဉ် အကြောင်းရင်း (Exception Reason)</label>
            <select style={styles.input} value={form.exceptionCode} onChange={(e) => setForm({ ...form, exceptionCode: e.target.value })}>
              <option value="">အကြောင်းရင်း ရွေးချယ်ပါ</option>
              {rules.map((r: any) => <option key={r.exception_code} value={r.exception_code}>{lang === 'mm' && r.exception_name_mm ? r.exception_name_mm : r.exception_code}</option>)}
            </select>
            {selectedRule ? (
              <div style={{ marginTop: 10, ...styles.ruleBox }}>
                <b>{selectedRule.exception_code}</b>
                <div>Photo: {safe(selectedRule.require_photo)} · Call: {safe(selectedRule.require_call_log)} · Remark: {safe(selectedRule.require_remark)}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        {action.type === "CONFIRM_PICKUP_COMPLETED" ? <Field label={t("actualParcelCount")} value={form.actualParcelCount} type="number" onChange={(v: string) => setForm({ ...form, actualParcelCount: v })} /> : null}
        {action.type === "MARK_DELIVERED" ? (
          <>
            <Field label={t("receiverName")} value={form.receiverName} onChange={(v: string) => setForm({ ...form, receiverName: v })} />
            <Field label={`${t("codCollectedInput")} (ကောက်ခံရန် ${safe(action.entity.cod_amount, "0")})`} value={form.codCollected} type="number" onChange={(v: string) => setForm({ ...form, codCollected: v })} />
          </>
        ) : null}

        {isException ? (
          <>
            <Field label={t("callAttempts")} value={form.callAttemptCount} type="number" onChange={(v: string) => setForm({ ...form, callAttemptCount: v })} />
            {isDeliveryException ? <Field label={t("codNote")} value={form.codNote} onChange={(v: string) => setForm({ ...form, codNote: v })} /> : null}
            <Field label={t("nextAttemptDate")} value={form.nextAttemptDate} type="date" onChange={(v: string) => setForm({ ...form, nextAttemptDate: v })} />
          </>
        ) : null}

        <Field label={t("photoUrl")} value={form.photoUrl} onChange={(v: string) => setForm({ ...form, photoUrl: v })} />
        {!isException ? <Field label={t("signatureUrl")} value={form.signatureUrl} onChange={(v: string) => setForm({ ...form, signatureUrl: v })} /> : null}
        
        <label style={styles.label}>{t("remarks")}</label>
        <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value.slice(0, 500) })} style={{ ...styles.input, minHeight: 96, paddingTop: 12 }} />

        {errors.length ? <div style={styles.errorList}>{errors.map((x) => <div key={x}>• {x}</div>)}</div> : null}

        <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button style={styles.secondaryBtn} onClick={onCancel}>{t("cancel")}</button>
          <button style={styles.primaryBtn} disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />} {t("submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- MICRO COMPONENTS & STYLES ---
function Field({ label, value, onChange, type = "text" }: any) {
  return (
    <div style={{ marginTop: 12 }}>
      <label style={styles.label}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={styles.input} />
    </div>
  );
}

function Kpi({ label, value, tone, icon }: any) {
  return (
    <div style={{ ...styles.kpi, borderColor: `${tone}66`, background: `${tone}12` }}>
      <div style={{ color: tone, fontWeight: 950, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>{icon}{label}</div>
      <div style={{ color: tone, fontSize: 36, fontWeight: 950, marginTop: 8 }}>{Number(value || 0).toLocaleString()}</div>
    </div>
  );
}

function Tab({ active, icon, children, onClick }: any) {
  return (
    <button onClick={onClick} style={{ ...styles.tab, borderColor: active ? C.orange : C.border, color: active ? C.orange : C.text }}>
      {icon}{children}
    </button>
  );
}

function Info({ label, value }: any) {
  return (
    <div style={styles.info}>
      <div style={styles.infoLabel}>{label}</div>
      <div style={styles.infoValue}>{value}</div>
    </div>
  );
}

function StatusPill({ status, tone }: any) {
  const color = tone || (String(status).toUpperCase().includes("EXCEPTION") || String(status).toUpperCase().includes("FAILED") ? C.red : C.green);
  return <span style={{ ...styles.badge, background: `${color}22`, borderColor: `${color}77`, color }}>{status}</span>;
}

function Badge({ color, icon, children }: any) {
  return <span style={{ ...styles.badge, background: `${color}18`, borderColor: `${color}66`, color }}>{icon}{children}</span>;
}

function MessageBanner({ message, onClose }: any) {
  const color = message.type === "error" ? C.red : message.type === "warning" ? C.gold : C.green;
  return (
    <div style={{ ...styles.banner, borderColor: `${color}66`, background: `${color}12`, color }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {message.type === "error" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}<span>{message.text}</span>
      </div>
      <button onClick={onClose} style={{ ...styles.iconBtn, width: 36, minHeight: 36 }}>×</button>
    </div>
  );
}

function Empty({ title }: any) {
  return (
    <div style={styles.empty}>
      <LocateFixed size={34} color={C.muted} />
      <div style={{ marginTop: 12, fontWeight: 950 }}>{title}</div>
    </div>
  );
}

function Loading() {
  return (
    <div style={styles.empty}>
      <Loader2 size={32} className="animate-spin" />
      <div style={{ marginTop: 12 }}>Loading...</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: C.page, color: C.text, fontFamily: "Pyidaungsu, Inter, system-ui, sans-serif", padding: 20 },
  shell: { maxWidth: 1540, margin: "0 auto", display: "grid", gap: 16 },
  hero: { border: `1px solid ${C.border}`, borderRadius: 28, background: `linear-gradient(135deg, ${C.panel}, #081b2b)`, padding: 22, display: "grid", gridTemplateColumns: "minmax(320px, 1fr) auto", gap: 20, alignItems: "center", boxShadow: "0 18px 50px rgba(0,0,0,.25)" },
  eyebrow: { color: C.orange, fontWeight: 950, letterSpacing: "0.35em", fontSize: 13 },
  title: { margin: "8px 0 0", fontSize: 38, lineHeight: 1.08, fontWeight: 950 },
  desc: { marginTop: 8, color: C.sub, lineHeight: 1.6 },
  input: { width: "100%", minHeight: 48, border: `1px solid ${C.border}`, borderRadius: 14, background: C.panel3, color: C.text, outline: "none", padding: "0 14px", fontWeight: 800 },
  label: { display: "block", color: C.sub, fontWeight: 900, fontSize: 12, marginBottom: 6, marginTop: 10 },
  primaryBtn: { minHeight: 46, border: "none", borderRadius: 14, background: C.orange, color: "#1b0b05", padding: "0 14px", fontWeight: 950, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 },
  secondaryBtn: { minHeight: 44, border: `1px solid ${C.border2}`, borderRadius: 14, background: C.panel2, color: C.text, padding: "0 12px", fontWeight: 900, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 },
  dangerBtn: { minHeight: 44, border: `1px solid ${C.red}66`, borderRadius: 14, background: `${C.red}14`, color: C.red, padding: "0 12px", fontWeight: 900, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 },
  iconBtn: { width: 48, minHeight: 46, border: `1px solid ${C.border}`, borderRadius: 14, background: C.panel3, color: C.text, cursor: "pointer", display: "grid", placeItems: "center" },
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 },
  kpi: { border: `1px solid ${C.border}`, borderRadius: 20, padding: 20, background: C.panel },
  tabBar: { display: "flex", gap: 10, flexWrap: "wrap", border: `1px solid ${C.border}`, background: "rgba(7,24,39,.55)", padding: 10, borderRadius: 18, overflowX: "auto" },
  tab: { minHeight: 42, border: `1px solid ${C.border}`, borderRadius: 12, background: C.panel3, color: C.text, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 950, whiteSpace: "nowrap" },
  gridList: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 16 },
  card: { border: `1px solid ${C.border}`, background: `linear-gradient(180deg, ${C.panel}, #081b2b)`, borderRadius: 24, padding: 18, boxShadow: "0 18px 45px rgba(0,0,0,.22)" },
  cardTop: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start", flexWrap: "wrap" },
  cardTitle: { margin: "4px 0 0", fontSize: 22, lineHeight: 1.2, fontWeight: 950 },
  cardSub: { margin: "6px 0 0", color: C.sub, lineHeight: 1.55 },
  mono: { color: C.orange, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 950, wordBreak: "break-all" },
  infoGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginTop: 16 },
  info: { border: `1px solid ${C.border}`, background: "rgba(7,24,39,.65)", borderRadius: 16, padding: 12 },
  infoLabel: { color: C.sub, fontSize: 12, fontWeight: 900 },
  infoValue: { marginTop: 4, fontWeight: 950, wordBreak: "break-word" },
  actionRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 },
  badge: { display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.border}`, borderRadius: 999, padding: "5px 10px", fontWeight: 950, fontSize: 12, whiteSpace: "nowrap" },
  stopList: { marginTop: 16, display: "grid", gap: 10 },
  stopRow: { border: `1px solid ${C.border}`, background: "rgba(7,24,39,.65)", borderRadius: 18, padding: 12, display: "grid", gridTemplateColumns: "50px minmax(0, 1fr) auto", gap: 12, alignItems: "center" },
  stopNo: { width: 40, height: 40, borderRadius: 14, background: `${C.orange}22`, color: C.orange, display: "grid", placeItems: "center", fontWeight: 950 },
  stopTitle: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: C.orange, fontWeight: 950 },
  stopSub: { color: C.sub, fontSize: 13, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis" },
  smallBtn: { minHeight: 34, border: `1px solid ${C.border2}`, borderRadius: 11, background: C.panel2, color: C.text, padding: "0 10px", fontWeight: 900, display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" },
  smallPrimaryBtn: { minHeight: 34, border: "none", borderRadius: 11, background: C.green, color: "#04130a", padding: "0 10px", fontWeight: 950, display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" },
  smallDangerBtn: { minHeight: 34, border: `1px solid ${C.red}66`, borderRadius: 11, background: `${C.red}16`, color: C.red, padding: "0 10px", fontWeight: 950, display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" },
  banner: { border: `1px solid ${C.border}`, borderRadius: 18, padding: 14, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" },
  empty: { border: `1px dashed ${C.border2}`, background: "rgba(7,24,39,.55)", borderRadius: 22, padding: 36, display: "grid", placeItems: "center", color: C.sub, textAlign: "center" },
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.62)", display: "grid", placeItems: "center", padding: 20, zIndex: 80 },
  modal: { width: "min(760px, 96vw)", maxHeight: "90vh", overflow: "auto", border: `1px solid ${C.border2}`, borderRadius: 26, background: `linear-gradient(180deg, ${C.panel}, #081b2b)`, boxShadow: "0 22px 70px rgba(0,0,0,.45)", padding: 20 },
  ruleBox: { border: `1px solid ${C.gold}55`, borderRadius: 16, padding: 12, background: `${C.gold}12`, color: C.sub, lineHeight: 1.6 },
  errorList: { marginTop: 12, border: `1px solid ${C.red}66`, borderRadius: 16, padding: 12, background: `${C.red}12`, color: C.red, lineHeight: 1.6 },
  checkGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 12, marginTop: 16 },
  checkCard: { border: `1px solid ${C.border}`, borderRadius: 18, background: "rgba(7,24,39,.65)", padding: 14 }
};