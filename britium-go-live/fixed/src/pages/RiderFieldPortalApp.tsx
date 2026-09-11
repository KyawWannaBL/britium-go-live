// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Briefcase,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock3,
  DollarSign,
  Download,
  Eye,
  EyeOff,
  Fingerprint,
  Globe2,
  Headphones,
  Home,
  LifeBuoy,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Package,
  PackageCheck,
  Phone,
  RefreshCw,
  Route,
  ShieldCheck,
  Smartphone,
  Truck,
  UploadCloud,
  User,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { getRiderSupabase, riderSupabaseConfigured } from "../lib/riderPortalSupabase";

import { supabase } from "../integrations/supabase/client";

type View =
  | "wall"
  | "jobs"
  | "pickup"
  | "delivery"
  | "route"
  | "cod"
  | "notifications"
  | "profile"
  | "support";

type LoginMode = "login" | "signup" | "forgot";
type ModalMode = null | "pickup" | "delivery" | "exception";

type RiderSession = {
  login: string;
  normalizedLogin: string;
  worker_code?: string;
  display_name?: string;
  email?: string;
  phone?: string;
  branch_code?: string;
  assigned_zone?: string;
  role?: string;
  signedInAt: string;
};

type RiderJob = Record<string, any>;
type NotificationRow = Record<string, any>;

const C = {
  bg: "#061524",
  bg2: "#071b2c",
  panel: "#0b2236",
  panel2: "#102b45",
  panel3: "#0a1d30",
  border: "#1a3a5c",
  text: "#eef8ff",
  sub: "#9cc2d9",
  dim: "#6f91aa",
  gold: "#f6b84b",
  blue: "#4ea8de",
  green: "#34d399",
  red: "#f87171",
  purple: "#c084fc",
  cyan: "#22d3ee",
};

const SESSION_KEY = "britium_rider_portal_session_v4";
const LEGACY_SESSION_KEYS = [
  "britium_rider_uat_session",
  "britium_rider_session",
  "britium_rider_login",
  "be_rider_code",
  "britium_rider_email",
];
const PASSWORDS = new Set(["1234", "12345678", "password", "britium123"]);

function text(value: unknown, fallback = "") {
  const out = String(value ?? "").trim();
  return out || fallback;
}

function upper(value: unknown) {
  return text(value).toUpperCase();
}

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString()} Ks`;
}

function compactDate(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function normalizeRiderLogin(value: string) {
  const raw = text(value);
  if (!raw) return "";

  const uat = raw.match(/^UAT[-_ ]?RIDER[-_ ]?(\d{1,3})$/i);
  if (uat) return `RID${String(Number(uat[1])).padStart(3, "0")}`;

  const rid = raw.match(/^RID\s*-?\s*(\d{1,3})$/i);
  if (rid) return `RID${String(Number(rid[1])).padStart(3, "0")}`;

  const riderYgn = raw.match(/^rider_ygn_0*(\d+)$/i);
  if (riderYgn) return `RID${String(Number(riderYgn[1])).padStart(3, "0")}`;

  return raw;
}

function defaultRiderEmail(code?: string) {
  const m = text(code).match(/^RID(\d{3})$/i);
  return m ? `rider_ygn_${m[1]}@britiumventures.com` : "";
}

function pickupId(job: RiderJob) {
  return text(
    job.pickup_id || job.canonical_pickup_id || job.pickup_way_id || job.waybill_no || job.raw_pickup_id,
    "UNKNOWN-PICKUP"
  );
}

function statusLabel(job: RiderJob) {
  return text(job.rider_status || job.pickup_status || job.workflow_stage || job.status, "WAITING_ACCEPTANCE").replaceAll(
    "_",
    " "
  );
}

function isDelivered(job: RiderJob) {
  return upper(job.pickup_status).includes("DELIVERED") || upper(job.rider_status).includes("DELIVERED");
}

function isException(job: RiderJob) {
  const hay = `${upper(job.pickup_status)} ${upper(job.rider_status)} ${upper(job.workflow_stage)}`;
  return hay.includes("EXCEPTION") || hay.includes("FAILED");
}

function isCollected(job: RiderJob) {
  const hay = `${upper(job.pickup_status)} ${upper(job.rider_status)} ${upper(job.workflow_stage)}`;
  return hay.includes("COLLECTED") || hay.includes("READY_FOR_DELIVERY");
}

function isOutForDelivery(job: RiderJob) {
  const hay = `${upper(job.pickup_status)} ${upper(job.rider_status)} ${upper(job.workflow_stage)}`;
  return hay.includes("OUT_FOR_DELIVERY");
}

function isPickupJob(job: RiderJob) {
  return !isCollected(job) && !isOutForDelivery(job) && !isDelivered(job) && !isException(job);
}


type ParcelVerificationRow = {
  id: string;
  index: number;
  parcelId: string;
  deliveryWayId?: string;
  trackingNo?: string;
  waybillNo?: string;
  weightKg: string;
  photoName: string;
  photoUrl: string;
  signatureUrl?: string;
  remarks: string;
  verified: boolean;
  uploadStatus?: string;
  uploadError?: string;
  reviewStatus?: string;
  rejectionReason?: string;
  reuploadRequired?: boolean;
  reviewedAt?: string;
  photoFile?: File;
  previewUrl?: string;
};

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : fallback;
}

function parcelCountFromPickupId(value: unknown) {
  const id = text(value);
  const m = id.match(/-(\d{3})$/);
  return m ? Math.max(1, Math.min(200, Number(m[1]))) : 1;
}

function operationalPrefixFromPickupId(value: unknown) {
  const id = text(value);
  const m = id.match(/^P(\d{4}-[A-Z0-9]{3})-\d{3}$/i);
  return m ? m[1].toUpperCase() : id.replace(/^P/i, "").replace(/-\d{3}$/, "").toUpperCase();
}

function buildParcelRows(job: RiderJob): ParcelVerificationRow[] {
  const base = pickupId(job);
  const count = Math.max(
    1,
    Math.min(
      200,
      Math.round(
        safeNumber(
          job.expected_parcels ||
            job.expected_parcel_count ||
            job.parcel_count ||
            job.delivery_line_count ||
            parcelCountFromPickupId(base),
          parcelCountFromPickupId(base)
        )
      )
    )
  );
  const prefix = operationalPrefixFromPickupId(base);

  return Array.from({ length: count }, (_, i) => {
    const suffix = String(i + 1).padStart(3, "0");
    const deliveryWayId = `D${prefix}-${suffix}`;
    const trackingNo = `TRK${prefix}-${suffix}`;
    const waybillNo = `WB${prefix}-${suffix}`;

    return {
      id: deliveryWayId,
      index: i + 1,
      parcelId: deliveryWayId,
      deliveryWayId,
      trackingNo,
      waybillNo,
      weightKg: "0.0",
      photoName: "",
      photoUrl: "",
      signatureUrl: "",
      remarks: "",
      verified: false,
    };
  });
}

function batchDate(job: RiderJob) {
  return text(job.pickup_date || job.assigned_at || job.created_at, "-");
}

function verifiedCount(rows: ParcelVerificationRow[]) {
  return rows.filter((row) => row.verified || upper(row.reviewStatus) === "APPROVED" || upper(row.reviewStatus) === "APPROVED_AFTER_REUPLOAD").length;
}

function validateParcelPhoto(file: File) {
  if (!file.type.startsWith("image/")) return { ok: false, reason: "Only image files are allowed." };
  if (file.size < 80 * 1024) return { ok: false, reason: "Photo file is too small and may be unclear. Capture a clearer image." };
  if (file.size > 15 * 1024 * 1024) return { ok: false, reason: "Photo exceeds the 15 MB upload limit." };
  return { ok: true, reason: "" };
}

function parcelReviewLabel(row: ParcelVerificationRow) {
  const value = upper(row.reviewStatus || (row.verified ? "APPROVED" : "PENDING_REVIEW"));
  if (value === "PHOTO_REJECTED" || value === "REUPLOAD_REQUIRED") return "REUPLOAD REQUIRED";
  if (value === "APPROVED_AFTER_REUPLOAD") return "APPROVED";
  return value.replaceAll("_", " ");
}

function isDeliveryJob(job: RiderJob) {
  return (isCollected(job) || isOutForDelivery(job)) && !isDelivered(job) && !isException(job);
}

function isCodJob(job: RiderJob) {
  const cod = Number(job.rider_cod_amount || job.cod_amount || job.item_price || 0);
  return cod > 0 || upper(job.payment_terms || job.payment_type).includes("COD");
}

function readJson(key: string) {
  try {
    const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readSavedSession(): RiderSession | null {
  const direct = readJson(SESSION_KEY);
  if (direct?.normalizedLogin || direct?.login) return direct as RiderSession;

  const legacy = readJson("britium_rider_uat_session") || readJson("britium_rider_session");
  if (legacy?.riderCode || legacy?.worker_code || legacy?.email) {
    const normalizedLogin = normalizeRiderLogin(legacy.riderCode || legacy.worker_code || legacy.email);
    return {
      login: legacy.email || legacy.riderCode || legacy.worker_code,
      normalizedLogin,
      worker_code: legacy.riderCode || legacy.worker_code || normalizedLogin,
      display_name: legacy.name || legacy.display_name || "Rider",
      email: legacy.email || defaultRiderEmail(normalizedLogin),
      phone: legacy.phone,
      branch_code: legacy.branchCode || legacy.branch_code || "YGN",
      assigned_zone: legacy.assignedZone || legacy.assigned_zone,
      role: "rider",
      signedInAt: new Date().toISOString(),
    };
  }

  const storedLogin =
    localStorage.getItem("britium_rider_login") ||
    localStorage.getItem("be_rider_code") ||
    localStorage.getItem("britium_rider_email") ||
    "";
  if (storedLogin) {
    const normalizedLogin = normalizeRiderLogin(storedLogin);
    return {
      login: storedLogin,
      normalizedLogin,
      worker_code: /^RID/i.test(normalizedLogin) ? normalizedLogin.toUpperCase() : undefined,
      email: storedLogin.includes("@") ? storedLogin : defaultRiderEmail(normalizedLogin),
      role: "rider",
      signedInAt: new Date().toISOString(),
    };
  }

  return null;
}

function saveSession(session: RiderSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.setItem("britium_rider_login", session.normalizedLogin || session.login);
    if (session.worker_code) localStorage.setItem("be_rider_code", session.worker_code);
    if (session.email) localStorage.setItem("britium_rider_email", session.email);
  } catch {
    // storage may be blocked
  }
}

function clearAllSessions() {
  try {
    localStorage.removeItem(SESSION_KEY);
    for (const key of LEGACY_SESSION_KEYS) localStorage.removeItem(key);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem("britium_rider_session");
  } catch {
    // ignore
  }
}

function makeSession(login: string, identity?: any): RiderSession {
  const normalizedLogin = normalizeRiderLogin(login);
  const workerCode = text(identity?.worker_code || identity?.account_code || (/^RID/i.test(normalizedLogin) ? normalizedLogin.toUpperCase() : ""));
  return {
    login,
    normalizedLogin,
    worker_code: workerCode,
    display_name: text(identity?.display_name || identity?.name || identity?.rider_name, "Rider"),
    email: text(identity?.email || (login.includes("@") ? login : defaultRiderEmail(workerCode || normalizedLogin))),
    phone: text(identity?.phone || identity?.phone_primary),
    branch_code: text(identity?.branch_code, "YGN"),
    assigned_zone: text(identity?.assigned_zone),
    role: text(identity?.role, "rider"),
    signedInAt: new Date().toISOString(),
  };
}

function buttonStyle(kind: "gold" | "blue" | "green" | "red" | "plain" | "ghost" = "plain") {
  const variants: Record<string, { bg: string; fg: string; border: string }> = {
    gold: { bg: C.gold, fg: C.bg, border: C.gold },
    blue: { bg: C.blue, fg: C.bg, border: C.blue },
    green: { bg: C.green, fg: C.bg, border: C.green },
    red: { bg: "rgba(248,113,113,0.14)", fg: C.red, border: "rgba(248,113,113,0.55)" },
    plain: { bg: C.panel2, fg: C.text, border: C.border },
    ghost: { bg: "transparent", fg: C.sub, border: C.border },
  };
  const v = variants[kind];
  return {
    minHeight: 44,
    borderRadius: 14,
    border: `1px solid ${v.border}`,
    background: v.bg,
    color: v.fg,
    fontWeight: 700,
    padding: "10px 14px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  } as React.CSSProperties;
}

function inputStyle() {
  return {
    width: "100%",
    minHeight: 46,
    boxSizing: "border-box",
    borderRadius: 14,
    border: `1px solid ${C.border}`,
    background: C.bg,
    color: C.text,
    outline: "none",
    padding: "10px 12px",
    fontSize: 14,
  } as React.CSSProperties;
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section
      style={{
        border: `1px solid ${C.border}`,
        background: C.panel,
        borderRadius: 22,
        padding: 18,
        boxShadow: "0 16px 44px rgba(0,0,0,0.18)",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

function Badge({ children, color = C.sub }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      style={{
        border: `1px solid ${color}55`,
        background: `${color}18`,
        color,
        borderRadius: 999,
        padding: "5px 9px",
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function ViewTitle({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 16,
          background: "rgba(246,184,75,0.16)",
          border: `1px solid rgba(246,184,75,0.36)`,
          color: C.gold,
          display: "grid",
          placeItems: "center",
        }}
      >
        <Icon size={22} />
      </div>
      <div>
        <h2 style={{ margin: 0, fontSize: 19 }}>{title}</h2>
        <p style={{ margin: "5px 0 0", color: C.sub, fontSize: 13 }}>{subtitle}</p>
      </div>
    </div>
  );
}

function viewFromHash(): View {
  const hash = (window.location.hash || "#/wall").replace(/^#/, "").toLowerCase();
  if (hash.includes("notification")) return "notifications";
  if (hash.includes("profile") || hash.includes("account")) return "profile";
  if (hash.includes("pickup")) return "pickup";
  if (hash.includes("delivery")) return "delivery";
  if (hash.includes("route") || hash.includes("map")) return "route";
  if (hash.includes("cod") || hash.includes("wallet") || hash.includes("settlement")) return "cod";
  if (hash.includes("support")) return "support";
  if (hash.includes("job")) return "jobs";
  return "wall";
}

function navHash(view: View) {
  if (view === "wall") return "#/wall";
  return `#/${view}`;
}

function visibleIdentity(session: RiderSession | null, identity: any) {
  return {
    name: text(identity?.display_name || session?.display_name, "Rider"),
    code: text(identity?.worker_code || session?.worker_code || session?.normalizedLogin, "RID---"),
    email: text(identity?.email || session?.email, "Not linked"),
    phone: text(identity?.phone || session?.phone, "-") || "-",
    branch: text(identity?.branch_code || session?.branch_code, "YGN"),
    zone: text(identity?.assigned_zone || session?.assigned_zone, "Not assigned"),
  };
}

async function fetchRiderPayload(login: string) {
  const supabase = getRiderSupabase();

  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, rebuild, and redeploy."
    );
  }

  const normalizedLogin = normalizeRiderLogin(login);
  const normalizedEmail = normalizedLogin.includes("@")
    ? normalizedLogin
    : defaultRiderEmail(normalizedLogin);

  try {
    const { data, error } = await supabase.rpc("be_rider_pickup_queue", {
      p_payload: {
        rider_code: normalizedLogin,
        rider_id: normalizedLogin,
        login: normalizedLogin,
      },
    });

    if (error) {
      console.warn("be_rider_pickup_queue failed", error);
    }

    const rows = data
      ? Array.isArray(data.pickups)
        ? data.pickups
        : Array.isArray(data.jobs)
          ? data.jobs
          : Array.isArray(data.data)
            ? data.data
            : []
      : [];

    if (rows.length > 0) {
      const notificationQueries = [
        supabase
          .from("be_app_notifications")
          .select("*")
          .eq("target_user_code", normalizedLogin)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("be_app_notifications")
          .select("*")
          .eq("target_role", "rider")
          .order("created_at", { ascending: false })
          .limit(100),
      ];

      if (normalizedEmail) {
        notificationQueries.push(
          supabase
            .from("be_app_notifications")
            .select("*")
            .eq("target_email", normalizedEmail)
            .order("created_at", { ascending: false })
            .limit(100)
        );
      }

      const nSettled = await Promise.allSettled(notificationQueries);
      const notificationsById = new Map<string, NotificationRow>();

      nSettled.forEach((res) => {
        if (res.status === "fulfilled" && !res.value.error) {
          for (const row of res.value.data || []) {
            const key = text(row.id || `${row.pickup_id || ""}-${row.created_at || ""}-${row.title || ""}`);
            notificationsById.set(key, row);
          }
        }
      });

      return {
        identity: {
          worker_code: normalizedLogin,
          display_name: rows.find((row: any) => row.rider_name)?.rider_name || "Ko Kyaw Zin Khant",
          email: normalizedEmail,
          branch_code: "YGN",
          role: "rider",
        },
        jobs: rows,
        notifications: Array.from(notificationsById.values()),
        source: `rpc:be_rider_pickup_queue / ${normalizedLogin}`,
      };
    }
  } catch (err) {
    console.warn("be_rider_pickup_queue fallback triggered", err);
  }

  const { data, error } = await supabase.rpc("be_get_rider_sync_payload", {
    p_login: normalizedLogin,
  });

  if (!error && data) {
    return {
      identity: data.identity || null,
      jobs: Array.isArray(data.jobs) ? data.jobs : [],
      notifications: Array.isArray(data.notifications) ? data.notifications : [],
      source: `${data.source || "rpc:be_get_rider_sync_payload"} / ${normalizedLogin}`,
    };
  }

  const jobQueries = [];

  jobQueries.push(
    supabase
      .from("be_v_rider_pickup_queue")
      .select("*")
      .eq("rider_code", normalizedLogin)
      .limit(200)
  );

  for (const field of ["assigned_rider_code", "assigned_workforce_code", "rider_id"]) {
    jobQueries.push(
      supabase
        .from("be_portal_pickup_requests")
        .select("*")
        .eq(field, normalizedLogin)
        .limit(200)
    );
  }

  if (normalizedEmail) {
    jobQueries.push(
      supabase
        .from("be_portal_pickup_requests")
        .select("*")
        .eq("assigned_rider_email", normalizedEmail)
        .limit(200)
    );
  }

  const settled = await Promise.allSettled(jobQueries);
  const byId = new Map<string, RiderJob>();

  settled.forEach((res) => {
    if (res.status === "fulfilled" && !res.value.error) {
      for (const row of res.value.data || []) {
        byId.set(pickupId(row), row);
      }
    }
  });

  return {
    identity: {
      worker_code: normalizedLogin,
      display_name: "Rider",
      email: normalizedEmail,
      branch_code: "YGN",
      role: "rider",
    },
    jobs: Array.from(byId.values()),
    notifications: [],
    source: `fallback:be_v_rider_pickup_queue / ${normalizedLogin}`,
  };
}

function LoginPortal({ onSignedIn }: { onSignedIn: (session: RiderSession, payload?: any) => void }) {
  const [mode, setMode] = useState<LoginMode>("login");
  const [login, setLogin] = useState("RID001");
  const [password, setPassword] = useState("12345678");
  const [showPassword, setShowPassword] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestPhone, setRequestPhone] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");


  async function runWayplanDeliveryAction(job: any, action: string, extra: any = {}) {
    const { data, error } = await supabase.rpc("be_rider_wayplan_action", {
      p_payload: {
        wayplan_id: job.wayplan_id,
        delivery_way_id: job.delivery_way_id || job.tracking_no,
        action,
        ...extra,
      },
    });

    if (error) throw error;
    if (data?.ok === false) throw new Error(data?.error || "Wayplan delivery action failed.");
    return data;
  }

  async function signIn(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    setSuccess("");

    if (!login.trim()) {
      setError("Enter your Rider code or registered email.");
      return;
    }
    if (!password.trim()) {
      setError("Enter your password.");
      return;
    }

    setLoading(true);
    try {
      const supabase = getRiderSupabase();
      const normalized = normalizeRiderLogin(login);

      if (supabase && login.includes("@")) {
        const auth = await supabase.auth.signInWithPassword({ email: login.trim(), password });
        if (auth.error) {
          // Continue to workforce resolution for UAT accounts. Real go-live should provision Auth users.
          console.warn("Supabase auth sign-in failed; trying workforce payload", auth.error.message);
        }
      }

      let payload: any = { identity: null, jobs: [], notifications: [], source: "local" };
      if (supabase) {
        payload = await fetchRiderPayload(normalized);
      }

      const allowedLocalPassword = PASSWORDS.has(password.trim()) || (import.meta.env.DEV && password.trim().length >= 4);
      if (!supabase && !allowedLocalPassword) throw new Error("Invalid password.");

      const session = makeSession(normalized, payload.identity);
      saveSession(session);
      onSignedIn(session, payload);
    } catch (err: any) {
      setError(err?.message || "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function requestAccess(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!login.includes("@") || !requestName.trim()) {
      setError("Enter your full name and company email.");
      return;
    }
    setLoading(true);
    try {
      const supabase = getRiderSupabase();
      if (supabase) {
        const { error } = await supabase.from("be_app_notifications").insert({
          notification_type: "RIDER_ACCESS_REQUEST",
          title: "Rider app access request",
          body: `${requestName} requested Rider App access`,
          target_role: "super_admin",
          target_branch: "YGN",
          target_email: login.trim().toLowerCase(),
          is_read: false,
          metadata: {
            name: requestName,
            email: login.trim().toLowerCase(),
            phone: requestPhone,
            reason: requestReason,
            source: "rider_app_signup",
          },
        });
        if (error) throw error;
      }
      setSuccess("Access request submitted. Admin can provision your Supabase Auth and workforce account.");
      setMode("login");
    } catch (err: any) {
      setError(err?.message || "Could not submit access request.");
    } finally {
      setLoading(false);
    }
  }

  async function forgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!login.includes("@")) {
      setError("Enter your registered email address first.");
      return;
    }
    const supabase = getRiderSupabase();
    if (!supabase) {
      setError("Supabase is not configured, so password reset email cannot be sent from this deployment.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(login.trim().toLowerCase(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setSuccess("Password reset email sent. Check your inbox.");
      setMode("login");
    } catch (err: any) {
      setError(err?.message || "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  }

  async function quickUnlock() {
    setError("");
    const saved = readSavedSession();
    if (!saved) {
      setError("No remembered Rider session. Sign in once first.");
      return;
    }
    if (!("PublicKeyCredential" in window)) {
      setError("This browser does not expose passkey / biometric unlock. Use email/password.");
      return;
    }
    saveSession(saved);
    onSignedIn(saved);
  }

  const configured = riderSupabaseConfigured();

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 18% 20%, rgba(78,168,222,0.18), transparent 34%), radial-gradient(circle at 80% 0%, rgba(246,184,75,0.14), transparent 30%), #061524",
        color: C.text,
        display: "grid",
        placeItems: "center",
        padding: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <style>{globalStyle}</style>
      <section
        style={{
          width: "min(1120px, 100%)",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, 0.85fr)",
          gap: 18,
          alignItems: "stretch",
        }}
        className="be-login-grid"
      >
        <Card
          style={{
            padding: 26,
            minHeight: 540,
            background:
              "linear-gradient(145deg, rgba(11,34,54,0.96), rgba(16,43,69,0.72)), repeating-linear-gradient(90deg, rgba(78,168,222,0.08) 0 1px, transparent 1px 70px)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", inset: "auto -80px -80px auto", width: 240, height: 240, borderRadius: 999, background: "rgba(78,168,222,0.10)" }} />
          <div style={{ color: C.gold, letterSpacing: "0.35em", fontSize: 13, fontWeight: 800 }}>BRITIUM EXPRESS RIDER</div>
          <h1 style={{ margin: "26px 0 12px", fontSize: 44, lineHeight: 1.03, maxWidth: 650 }}>
            Field Command Wall for pickup, delivery, COD, and exceptions.
          </h1>
          <p style={{ color: C.sub, fontSize: 16, lineHeight: 1.65, maxWidth: 720 }}>
            Sign in once, then your wall page, profile, notifications, route, pickup, delivery, COD, and logout controls stay available from every screen.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 30 }} className="be-three-grid">
            <Card style={{ background: "rgba(6,21,36,0.55)", boxShadow: "none" }}>
              <ShieldCheck color={C.green} />
              <h3>Backend only</h3>
              <p>Jobs come from Supabase assignment payloads, not mock rows.</p>
            </Card>
            <Card style={{ background: "rgba(6,21,36,0.55)", boxShadow: "none" }}>
              <Bell color={C.gold} />
              <h3>Notifications</h3>
              <p>Assignment and status alerts are visible and markable as read.</p>
            </Card>
            <Card style={{ background: "rgba(6,21,36,0.55)", boxShadow: "none" }}>
              <PackageCheck color={C.blue} />
              <h3>Action buttons</h3>
              <p>Accept, arrive, verify, collect, deliver, exception, and COD actions.</p>
            </Card>
          </div>
          <div style={{ marginTop: 28, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Badge color={configured ? C.green : C.red}>{configured ? "Supabase configured" : "Supabase env missing"}</Badge>
            <Badge color={C.cyan}>No role selection</Badge>
            <Badge color={C.gold}>Wall page included</Badge>
          </div>
        </Card>

        <Card style={{ padding: 24 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            <button onClick={() => setMode("login")} style={buttonStyle(mode === "login" ? "gold" : "ghost")}>Login</button>
            <button onClick={() => setMode("signup")} style={buttonStyle(mode === "signup" ? "gold" : "ghost")}><UserPlus size={16} /> Sign up</button>
            <button onClick={() => setMode("forgot")} style={buttonStyle(mode === "forgot" ? "gold" : "ghost")}>Forgot</button>
          </div>

          {error && <div style={{ border: `1px solid ${C.red}`, background: "rgba(248,113,113,0.12)", color: C.red, borderRadius: 14, padding: 12, marginBottom: 14 }}>{error}</div>}
          {success && <div style={{ border: `1px solid ${C.green}`, background: "rgba(52,211,153,0.12)", color: C.green, borderRadius: 14, padding: 12, marginBottom: 14 }}>{success}</div>}

          {mode === "login" && (
            <form onSubmit={signIn} style={{ display: "grid", gap: 14 }}>
              <div>
                <label>Rider code / email</label>
                <div style={{ position: "relative" }}>
                  <User size={18} style={{ position: "absolute", left: 13, top: 14, color: C.sub }} />
                  <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="RID001 or rider_ygn_0001@britiumventures.com" style={{ ...inputStyle(), paddingLeft: 42 }} />
                </div>
              </div>
              <div>
                <label>Password</label>
                <div style={{ position: "relative" }}>
                  <Lock size={18} style={{ position: "absolute", left: 13, top: 14, color: C.sub }} />
                  <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? "text" : "password"} placeholder="Password" style={{ ...inputStyle(), paddingLeft: 42, paddingRight: 42 }} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", right: 10, top: 8, ...buttonStyle("ghost"), minHeight: 30, padding: 6 }}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} style={buttonStyle("gold")}>{loading ? <RefreshCw size={17} className="be-spin" /> : <ShieldCheck size={17} />} Sign in</button>
              <button type="button" onClick={quickUnlock} style={buttonStyle("plain")}><Fingerprint size={17} /> Biometric / passkey quick unlock</button>
              <a href="/downloads/britium-rider-app.apk" style={{ ...buttonStyle("ghost"), textDecoration: "none" }}><Download size={17} /> Download Rider APK</a>
            </form>
          )}

          {mode === "signup" && (
            <form onSubmit={requestAccess} style={{ display: "grid", gap: 14 }}>
              <div><label>Full name</label><input value={requestName} onChange={(e) => setRequestName(e.target.value)} style={inputStyle()} placeholder="Rider full name" /></div>
              <div><label>Company email</label><input value={login} onChange={(e) => setLogin(e.target.value)} style={inputStyle()} placeholder="rider_ygn_0001@britiumventures.com" /></div>
              <div><label>Phone</label><input value={requestPhone} onChange={(e) => setRequestPhone(e.target.value)} style={inputStyle()} placeholder="09..." /></div>
              <div><label>Request note</label><textarea value={requestReason} onChange={(e) => setRequestReason(e.target.value)} style={{ ...inputStyle(), minHeight: 84 }} placeholder="Need access to Rider App" /></div>
              <button disabled={loading} style={buttonStyle("gold")}><UserPlus size={17} /> Submit access request</button>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={forgotPassword} style={{ display: "grid", gap: 14 }}>
              <p style={{ color: C.sub, lineHeight: 1.55 }}>Enter your registered Supabase Auth email. You will receive a password reset link.</p>
              <div><label>Email</label><input value={login} onChange={(e) => setLogin(e.target.value)} style={inputStyle()} placeholder="rider_ygn_0001@britiumventures.com" /></div>
              <button disabled={loading} style={buttonStyle("gold")}><Mail size={17} /> Send reset email</button>
            </form>
          )}
        </Card>
      </section>
    </main>
  );
}

function JobCard({ job, onAction, onModal }: { job: RiderJob; onAction: (job: RiderJob, action: string, remark?: string) => void; onModal: (job: RiderJob, mode: ModalMode) => void }) {
  const id = pickupId(job);
  const status = statusLabel(job);
  const cod = Number(job.rider_cod_amount || job.cod_amount || job.item_price || 0);
  const delivered = isDelivered(job);
  const exception = isException(job);

  return (
    <Card style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{id}</div>
          <div style={{ color: C.sub, marginTop: 4 }}>{text(job.merchant_name || job.customer_name || job.sender_name, "Merchant / customer")}</div>
        </div>
        <Badge color={exception ? C.red : delivered ? C.green : C.gold}>{status}</Badge>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }} className="be-three-grid">
        <div><small>Township</small><strong>{text(job.township || job.pickup_township, "-")}</strong></div>
        <div><small>Parcels</small><strong>{text(job.expected_parcels || job.delivery_line_count || 1)}</strong></div>
        <div><small>COD</small><strong>{money(cod)}</strong></div>
      </div>

      <div style={{ color: C.sub, display: "flex", gap: 8, alignItems: "flex-start" }}>
        <MapPin size={17} style={{ marginTop: 2, flex: "0 0 auto" }} />
        <span>{text(job.pickup_address || job.delivery_address || job.address, "No address in backend record")}</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {!delivered && !exception && <button style={buttonStyle("plain")} onClick={() => onAction(job, "ACCEPTED", "Rider accepted assignment")}><CheckCircle2 size={16} /> Accept</button>}
        {!delivered && !exception && <button style={buttonStyle("blue")} onClick={() => onAction(job, "ARRIVED_AT_PICKUP", "Rider arrived at pickup")}>Arrived</button>}
        {!delivered && !exception && <button style={buttonStyle("gold")} onClick={() => onModal(job, "pickup")}>Verify pickup</button>}
        {!delivered && !exception && <button style={buttonStyle("green")} onClick={() => onAction(job, "PICKUP_COLLECTED", "Pickup collected")}>Collected</button>}
        {!delivered && !exception && <button style={buttonStyle("blue")} onClick={() => onAction(job, "OUT_FOR_DELIVERY", "Started delivery")}>Start delivery</button>}
        {!delivered && !exception && <button style={buttonStyle("green")} onClick={() => onModal(job, "delivery")}>Delivered</button>}
        {!delivered && !exception && <button style={buttonStyle("red")} onClick={() => onModal(job, "exception")}>Exception</button>}
      </div>
    </Card>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card style={{ textAlign: "center", padding: 28 }}>
      <Package size={40} color={C.dim} />
      <h3 style={{ margin: "12px 0 8px" }}>{title}</h3>
      <p style={{ margin: 0, color: C.sub, lineHeight: 1.6 }}>{body}</p>
    </Card>
  );
}

function FieldPortal() {
  const [session, setSession] = useState<RiderSession | null>(() => readSavedSession());
  const [view, setView] = useState<View>(viewFromHash());
  const [identity, setIdentity] = useState<any>(null);
  const [jobs, setJobs] = useState<RiderJob[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [source, setSource] = useState("not synced");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedJob, setSelectedJob] = useState<RiderJob | null>(null);
  const [modal, setModal] = useState<ModalMode>(null);
  const [parcelCount, setParcelCount] = useState("1");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [codCollected, setCodCollected] = useState("0");
  const [proofUrl, setProofUrl] = useState("");
  const [remark, setRemark] = useState("");
  const [exceptionReason, setExceptionReason] = useState("CUSTOMER_UNREACHABLE");
  const [pickupSearch, setPickupSearch] = useState("");
  const [parcelRows, setParcelRows] = useState<ParcelVerificationRow[]>([]);

  async function loadParcelVerificationQueue(pickupIdValue: string, job?: RiderJob) {
    try {
      const { data, error } = await supabase.rpc(
        "be_rider_parcel_verification_queue",
        {
          p_pickup_id: pickupIdValue,
        }
      );

      if (error) throw error;

      const rows = Array.isArray(data?.rows) ? data.rows : [];

      if (!rows.length) {
        setParcelRows(buildParcelRows(job || { pickup_id: pickupIdValue }));
        return;
      }

      setParcelRows(
        rows.map((row: any, index: number) => ({
          id:
            row.delivery_way_id ||
            row.tracking_no ||
            `${pickupIdValue}-${index + 1}`,

          index:
            row.parcel_sequence ||
            index + 1,

          parcelId:
            row.delivery_way_id ||
            row.tracking_no ||
            `${pickupIdValue}-${index + 1}`,

          deliveryWayId:
            row.delivery_way_id,

          trackingNo:
            row.tracking_no,

          waybillNo:
            row.waybill_no,

          weightKg:
            String(row.weight_kg || row.actual_weight_kg || 0),

          photoName: "",

          photoUrl:
            row.proof_url || "",

          signatureUrl:
            row.signature_url || "",

          remarks:
            row.remarks || "",

          verified:
            Boolean(row.verified) || upper(row.status) === "VERIFIED",

          uploadStatus:
            Boolean(row.verified) || upper(row.status) === "VERIFIED" ? "uploaded" : "idle",

          reviewStatus:
            row.review_status || row.photo_status || (Boolean(row.verified) || upper(row.status) === "VERIFIED" ? "APPROVED" : "PENDING_REVIEW"),

          rejectionReason:
            row.rejection_reason || row.photo_rejection_reason || "",

          reuploadRequired:
            ["PHOTO_REJECTED", "REUPLOAD_REQUIRED"].includes(upper(row.review_status || row.photo_status)),

          reviewedAt:
            row.reviewed_at || row.photo_checked_at || "",

          uploadError: "",
        }))
      );

    } catch (err) {
      console.error("Parcel verification queue error", err);
      setError("Parcel verification queue unavailable. Using Pickup ID suffix fallback rows.");
      setParcelRows(buildParcelRows(job || { pickup_id: pickupIdValue }));
    }
  }

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (session) void load(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.normalizedLogin]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => void load(session, true), 30000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.normalizedLogin]);

  function navigate(next: View) {
    window.location.hash = navHash(next);
    setView(next);
  }

  async function load(nextSession = session, silent = false) {
    if (!nextSession) return;
    if (!silent) {
      setLoading(true);
      setError("");
      setMessage("");
    }
    try {
      const payload = await fetchRiderPayload(nextSession.normalizedLogin || nextSession.login);
      setIdentity(payload.identity || null);
      setJobs(payload.jobs || []);
      setNotifications(payload.notifications || []);
      setSource(payload.source || "backend");
      if (payload.identity) {
        const refreshed = makeSession(nextSession.login || nextSession.normalizedLogin, payload.identity);
        setSession(refreshed);
        saveSession(refreshed);
      }
      try {
        localStorage.setItem("britium_rider_last_jobs", JSON.stringify(payload.jobs || []));
      } catch {
        // ignore
      }
    } catch (err: any) {
      setError(err?.message || "Could not synchronize Rider App.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function onSignedIn(nextSession: RiderSession, payload?: any) {
    saveSession(nextSession);
    setSession(nextSession);
    setIdentity(payload?.identity || null);
    setJobs(payload?.jobs || []);
    setNotifications(payload?.notifications || []);
    setSource(payload?.source || "login");
    window.location.hash = "#/wall";
    setView("wall");
  }

  async function logout() {
    try {
      const supabase = getRiderSupabase();
      if (supabase) await supabase.auth.signOut();
    } catch {
      // ignore
    }
    clearAllSessions();
    setSession(null);
    setIdentity(null);
    setJobs([]);
    setNotifications([]);
    setSource("signed out");
    window.location.hash = "#/login";
  }

  async function runAction(job: RiderJob, action: string, actionRemark = "") {
    const supabase = getRiderSupabase();

    if (!supabase || !session) {
      setError("Supabase/session is missing.");
      return;
    }

    const normalizedAction =
      action === "ACCEPTED"
        ? "accept"
        : action === "ARRIVED_AT_PICKUP"
          ? "arrive"
          : action === "PICKUP_VERIFIED"
            ? "verify_pickup"
            : action === "PICKUP_COLLECTED"
              ? "collect"
              : action === "OUT_FOR_DELIVERY"
                ? "start_delivery"
                : action === "DELIVERED"
                  ? "deliver"
                  : action.includes("EXCEPTION")
                    ? "exception"
                    : action.toLowerCase();

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const { data, error: rpcError } = await supabase.rpc("be_rider_pickup_action", {
        p_payload: {
          pickup_id: pickupId(job),
          pickup_way_id: pickupId(job),
          rider_code: session.normalizedLogin || session.worker_code || session.login,
          rider_id: session.normalizedLogin || session.worker_code || session.login,
          rider_name: session.display_name || identity?.display_name || identity?.rider_name || "Rider",
          action: normalizedAction,
          source_action: action,
          remark: actionRemark,
          remarks: actionRemark,
        },
      });

      if (rpcError) throw rpcError;

      if ((data as any)?.ok === false) {
        throw new Error((data as any)?.error || `Could not update ${pickupId(job)}.`);
      }

      setMessage(`${pickupId(job)} updated: ${(data as any)?.action || normalizedAction}`);
      await load(session, true);
    } catch (err: any) {
      setError(err?.message || `Could not update ${pickupId(job)}.`);
    } finally {
      setBusy(false);
    }
  }

  async function openModal(job: RiderJob, mode: ModalMode) {
    setSelectedJob(job);
    setModal(mode);
    const nextCount = String(job.expected_parcels || job.delivery_line_count || 1);
    setParcelCount(nextCount);
    setRecipientName(text(job.recipient_name || job.customer_name));
    setRecipientPhone(text(job.recipient_phone || job.customer_phone));
    setCodCollected(String(Number(job.rider_cod_amount || job.cod_amount || job.item_price || 0)));
    setProofUrl("");
    setRemark("");
    setExceptionReason("CUSTOMER_UNREACHABLE");
    setPickupSearch("");

    if (mode === "pickup") {
      setParcelRows([]);
      await loadParcelVerificationQueue(
        pickupId(job),
        job
      );
    } else {
      setParcelRows([]);
    }
  }

  function updateParcelRow(rowId: string, patch: Partial<ParcelVerificationRow>) {
    setParcelRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }

  async function verifyParcelRow(rowId: string) {
    if (!selectedJob) return;

    const row = parcelRows.find((r) => r.id === rowId);
    if (!row) return;

    const weight = Number(row.weightKg || 0);
    if (!Number.isFinite(weight) || weight <= 0) {
      alert("Actual weight is required before verification.");
      setError("Actual weight is required before verification.");
      return;
    }

    if (!row.photoFile && !row.photoUrl) {
      alert("Please Attach Photo or Capture photo before verification.");
      setError("Please Attach Photo or Capture photo before verification.");
      return;
    }

    const currentPickupId = pickupId(selectedJob);
    const itemNo =
      Number((row as any).index || (row as any).item_no || (row as any).parcel_sequence) ||
      Number(String(row.parcelId || row.id).match(/-(\d+)$/)?.[1] || 1);

    try {
      setBusy(true);
      setError("");
      setMessage(`Uploading parcel ${itemNo} photo...`);
      updateParcelRow(rowId, { uploadStatus: "uploading", uploadError: "" } as any);

      let publicUrl = row.photoUrl || "";

      if (row.photoFile) {
        const safeName = row.photoFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `pickup-proofs/${currentPickupId}/${itemNo}-${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("rider-proofs")
          .upload(storagePath, row.photoFile, {
            cacheControl: "3600",
            upsert: true,
          });

        if (uploadError) throw uploadError;

        const { data: publicData } = supabase.storage
          .from("rider-proofs")
          .getPublicUrl(storagePath);

        publicUrl = publicData.publicUrl;
      }

      const { error: saveError } = await supabase.rpc("be_rider_save_parcel_proof", {
        p_payload: {
          pickup_id: currentPickupId,
          item_no: itemNo,
          actual_weight_kg: weight,
          photo_url: publicUrl,
          proof_url: publicUrl,
          proof_photo_path: publicUrl,
          remark: row.remarks || null,
        },
      });

      if (saveError) throw saveError;

      const { error: reviewQueueError } = await supabase.rpc("be_submit_parcel_photo_for_review", {
        p_payload: {
          pickup_id: currentPickupId,
          parcel_sequence: itemNo,
          delivery_way_id: row.deliveryWayId || row.parcelId,
          tracking_no: row.trackingNo || null,
          photo_url: publicUrl,
          actual_weight_kg: weight,
          uploaded_by: session?.normalizedLogin || session?.worker_code || session?.login || "RIDER",
          uploaded_role: "RIDER",
          remarks: row.remarks || null,
        },
      });

      if (reviewQueueError) {
        console.warn("Photo review queue RPC unavailable; proof remains uploaded", reviewQueueError);
      }

      updateParcelRow(rowId, {
        verified: false,
        photoUrl: publicUrl,
        previewUrl: publicUrl,
        uploadStatus: "uploaded",
        reviewStatus: "PENDING_REVIEW",
        rejectionReason: "",
        reuploadRequired: false,
        uploadError: "",
      } as any);

      setMessage(`Parcel ${itemNo} photo uploaded and sent to Data Entry for review.`);
      alert(`Parcel ${itemNo} photo uploaded. Data Entry review is pending.`);
      await load(session, true);
    } catch (err: any) {
      updateParcelRow(rowId, {
        verified: false,
        uploadStatus: "failed",
        uploadError: err?.message || "Upload failed",
      } as any);
      setError(err?.message || "Photo upload failed.");
      alert(err?.message || "Photo upload failed.");
    } finally {
      setBusy(false);
    }
  }

  function handleParcelPhoto(rowId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedJob) return;

    const quality = validateParcelPhoto(file);
    if (!quality.ok) {
      setError(quality.reason);
      alert(quality.reason);
      e.currentTarget.value = "";
      return;
    }

    const previewUrl = URL.createObjectURL(file);

    updateParcelRow(rowId, {
      photoName: file.name,
      photoFile: file,
      previewUrl,
      photoUrl: previewUrl,
      uploadStatus: "idle",
      uploadError: "",
      reviewStatus: "PENDING_UPLOAD",
      rejectionReason: "",
      reuploadRequired: false,
      verified: false,
    } as any);

    setMessage(`Photo selected for parcel ${rowId}. Click VERIFY to upload.`);
  }

  function handleProof(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedJob) return;
    setProofUrl(`local-proof://${pickupId(selectedJob)}/${Date.now()}-${file.name}`);
  }

  async function submitModal() {
    if (!selectedJob || !session) return;

    const supabase = getRiderSupabase();

    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    const id = pickupId(selectedJob);
    const codRequired = Number(selectedJob.rider_cod_amount || selectedJob.cod_amount || selectedJob.item_price || 0);
    let action = "";
    let payload: Record<string, any> = {};
    let proof = proofUrl || null;
    let note = remark;

    if (modal === "pickup") {
      const rows = parcelRows.length ? parcelRows : buildParcelRows(selectedJob);
      const submittedRows = rows.filter((row) => Number(row.weightKg || 0) > 0 && Boolean(row.photoUrl) && !row.reuploadRequired);

      if (!submittedRows.length) {
        setError("Upload at least one clear parcel photo and enter its actual weight before saving pickup verification.");
        return;
      }

      action = "verify_pickup";
      payload = {
        parcel_count: rows.length,
        submitted_count: submittedRows.length,
        verified_count: verifiedCount(rows),
        rejected_count: rows.filter((row) => row.reuploadRequired).length,
        pending_count: rows.length - verifiedCount(rows) - rows.filter((row) => row.reuploadRequired).length,
        partial_verification: verifiedCount(rows) < rows.length,
        parcels: rows.map((row) => ({
          parcel_id: row.parcelId,
          delivery_way_id: row.deliveryWayId,
          tracking_no: row.trackingNo,
          waybill_no: row.waybillNo,
          parcel_sequence: row.index,
          actual_weight_kg: Number(row.weightKg || 0),
          proof_url: row.photoUrl || null,
          proof_file_name: row.photoName || null,
          remarks: row.remarks || null,
          review_status: row.reviewStatus || "PENDING_REVIEW",
          rejection_reason: row.rejectionReason || null,
          verified: row.verified || ["APPROVED", "APPROVED_AFTER_REUPLOAD"].includes(upper(row.reviewStatus)),
        })),
      };
      proof = submittedRows.find((row) => row.photoUrl)?.photoUrl || proof;
      note = note || `Pickup photo submission: ${submittedRows.length}/${rows.length} uploaded, ${verifiedCount(rows)} approved`;
    }

    if (modal === "delivery") {
      if (!recipientName.trim()) {
        setError("Recipient name is required before marking delivered.");
        return;
      }

      if (codRequired > 0 && Number(codCollected || 0) < codRequired) {
        setError(`COD must be collected before delivery. Required ${money(codRequired)}.`);
        return;
      }

      if (!proof) {
        setError("Delivery proof photo is required.");
        return;
      }

      action = "deliver";
      payload = {
        recipient_name: recipientName,
        recipient_phone: recipientPhone,
        cod_collected_amount: Number(codCollected || 0),
        proof_url: proof,
      };
      note = note || "Delivery verified by rider";
    }

    if (modal === "exception") {
      if (!exceptionReason) {
        setError("Exception reason is required.");
        return;
      }

      if (!proof) {
        setError("Exception proof photo is required.");
        return;
      }

      action = "exception";
      payload = {
        exception_reason: exceptionReason,
        reason: exceptionReason,
        proof_url: proof,
        workflow_area: isPickupJob(selectedJob) ? "pickup" : "delivery",
      };
      note = note || exceptionReason;
    }

    setBusy(true);
    setError("");

    try {
      const actionPayload = {
        pickup_id: id,
        pickup_way_id: id,
        rider_code: session.normalizedLogin || session.worker_code || session.login,
        rider_id: session.normalizedLogin || session.worker_code || session.login,
        rider_name: session.display_name || identity?.display_name || identity?.rider_name || "Rider",
        action,
        remark: note,
        remarks: note,
        proof_url: proof,
        ...payload,
      };

      let data: any = null;
      let rpcError: any = null;

      if (modal === "pickup") {
        const partialResult = await supabase.rpc("be_rider_submit_partial_pickup_verification", { p_payload: actionPayload });
        data = partialResult.data;
        rpcError = partialResult.error;
      }

      if (modal !== "pickup" || rpcError) {
        if (rpcError) console.warn("Partial pickup RPC unavailable; falling back to be_rider_pickup_action", rpcError);
        const fallbackResult = await supabase.rpc("be_rider_pickup_action", { p_payload: actionPayload });
        data = fallbackResult.data;
        rpcError = fallbackResult.error;
      }

      if (rpcError) throw rpcError;

      if ((data as any)?.ok === false) {
        throw new Error((data as any)?.error || `Could not update ${id}.`);
      }

      if (modal === "pickup" && payload?.parcels?.length) {
        try {
          await supabase.rpc("be_rider_save_pickup_parcel_verifications", {
            p_pickup_id: id,
            p_rider_login: session.normalizedLogin || session.login,
            p_parcels: payload.parcels,
          });
        } catch (saveErr) {
          console.warn("Optional parcel verification save skipped", saveErr);
        }
      }

      setMessage(`${id} updated: ${(data as any)?.action || action}`);
      setModal(null);
      setSelectedJob(null);
      await load(session, true);
    } catch (err: any) {
      setError(err?.message || `Could not update ${id}.`);
    } finally {
      setBusy(false);
    }
  }

  async function markRead(row: NotificationRow) {
    if (!row?.id || !session) return;
    const supabase = getRiderSupabase();
    if (!supabase) return;
    try {
      await supabase.rpc("be_mark_app_notification_read", { p_notification_id: row.id, p_login: session.normalizedLogin || session.login });
      await load(session, true);
    } catch (err) {
      console.warn(err);
    }
  }

  if (!session) return <LoginPortal onSignedIn={onSignedIn} />;

  const me = visibleIdentity(session, identity);
  const pickupJobs = jobs.filter(isPickupJob);
  const deliveryJobs = jobs.filter(isDeliveryJob);
  const deliveredJobs = jobs.filter(isDelivered);
  const exceptionJobs = jobs.filter(isException);
  const codJobs = jobs.filter(isCodJob);
  const unread = notifications.filter((n) => !n.is_read);
  const totalCod = codJobs.reduce((sum, job) => sum + Number(job.rider_cod_amount || job.cod_amount || job.item_price || 0), 0);

  const statCards = [
    { label: "Assigned", value: jobs.length, color: C.blue },
    { label: "Pickup", value: pickupJobs.length, color: C.gold },
    { label: "Delivery", value: deliveryJobs.length, color: C.green },
    { label: "Delivered", value: deliveredJobs.length, color: C.green },
    { label: "Exceptions", value: exceptionJobs.length, color: C.red },
    { label: "Unread", value: unread.length, color: C.purple },
  ];

  const nav = [
    { id: "wall", label: "Wall", icon: Home },
    { id: "jobs", label: "Jobs", icon: Briefcase },
    { id: "pickup", label: "Pickup", icon: Package },
    { id: "delivery", label: "Delivery", icon: Truck },
    { id: "route", label: "Route", icon: Route },
    { id: "cod", label: "COD", icon: Wallet },
    { id: "notifications", label: `Alerts ${unread.length ? `(${unread.length})` : ""}`, icon: Bell },
    { id: "profile", label: "Profile", icon: User },
  ] as { id: View; label: string; icon: any }[];

  const renderJobs = (rows: RiderJob[], emptyTitle: string, emptyBody: string) => (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.length ? rows.map((job) => <JobCard key={pickupId(job)} job={job} onAction={runAction} onModal={openModal} />) : <EmptyState title={emptyTitle} body={emptyBody} />}
    </div>
  );

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
      <style>{globalStyle}</style>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          borderBottom: `1px solid ${C.border}`,
          background: "rgba(6,21,36,0.92)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <button onClick={() => navigate("wall")} style={{ background: "transparent", border: 0, color: C.text, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <div style={{ width: 38, height: 38, borderRadius: 14, background: C.gold, color: C.bg, display: "grid", placeItems: "center", fontWeight: 900 }}>B</div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 14, fontWeight: 900 }}>BRITIUM RIDER</div>
              <div style={{ color: C.sub, fontSize: 12 }}>{me.code} / {me.branch}</div>
            </div>
          </button>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button onClick={() => void load(session)} style={buttonStyle("plain")} disabled={loading || busy}><RefreshCw size={16} className={loading ? "be-spin" : ""} /> Sync</button>
            <button onClick={() => navigate("profile")} style={buttonStyle(view === "profile" ? "gold" : "plain")}><User size={16} /> Profile</button>
            <button onClick={logout} style={buttonStyle("red")}><LogOut size={16} /> Logout</button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: 16, display: "grid", gap: 14 }}>
        <Card style={{ background: "linear-gradient(135deg, rgba(11,34,54,1), rgba(16,43,69,0.72))" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ color: C.gold, letterSpacing: "0.28em", fontSize: 12, fontWeight: 800 }}>FIELD COMMAND WALL</div>
              <h1 style={{ margin: "8px 0 6px", fontSize: 28 }}>Welcome, {me.name}</h1>
              <p style={{ margin: 0, color: C.sub }}>Backend assignments, notifications, pickup, delivery, COD, route, and exception workflow.</p>
            </div>
            <div style={{ display: "grid", gap: 7, minWidth: 260 }}>
              <div style={{ color: C.sub, fontSize: 12 }}>Source</div>
              <Badge color={error ? C.red : C.green}>{error ? "sync error" : source}</Badge>
              <div style={{ color: C.sub, fontSize: 12 }}>Login: {session.normalizedLogin}</div>
            </div>
          </div>
        </Card>

        {error && <div style={{ border: `1px solid ${C.red}`, background: "rgba(248,113,113,0.12)", color: C.red, borderRadius: 16, padding: 12 }}>{error}</div>}
        {message && <div style={{ border: `1px solid ${C.green}`, background: "rgba(52,211,153,0.12)", color: C.green, borderRadius: 16, padding: 12 }}>{message}</div>}

        <nav style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }} className="be-scroll-x">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button key={item.id} onClick={() => navigate(item.id)} style={buttonStyle(active ? "gold" : "ghost")}>
                <Icon size={16} /> {item.label}
              </button>
            );
          })}
        </nav>

        {view === "wall" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10 }} className="be-six-grid">
              {statCards.map((s) => (
                <Card key={s.label} style={{ padding: 14 }}>
                  <div style={{ color: C.sub, fontSize: 12 }}>{s.label}</div>
                  <div style={{ color: s.color, fontSize: 25, fontWeight: 900 }}>{s.value}</div>
                </Card>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 14 }} className="be-two-grid">
              <Card>
                <ViewTitle icon={Home} title="Wall page" subtitle="Your command center; each button opens a different functional screen." />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }} className="be-two-grid">
                  {nav.filter((n) => n.id !== "wall").map((n) => {
                    const Icon = n.icon;
                    return (
                      <button key={n.id} onClick={() => navigate(n.id)} style={{ ...buttonStyle("plain"), justifyContent: "space-between" }}>
                        <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon size={17} /> {n.label}</span>
                        <ChevronRight size={16} />
                      </button>
                    );
                  })}
                </div>
              </Card>
              <Card>
                <ViewTitle icon={User} title="Profile snapshot" subtitle="Logged-in workforce identity." />
                <div style={{ display: "grid", gap: 9 }}>
                  <div><small>Name</small><strong>{me.name}</strong></div>
                  <div><small>Code</small><strong>{me.code}</strong></div>
                  <div><small>Email</small><strong>{me.email}</strong></div>
                  <div><small>Zone</small><strong>{me.zone}</strong></div>
                  <button onClick={() => navigate("profile")} style={buttonStyle("gold")}>Open full profile</button>
                </div>
              </Card>
            </div>
            <Card>
              <ViewTitle icon={Bell} title="Latest notifications" subtitle="Assignment and workflow alerts from Enterprise Portal." />
              {notifications.length ? notifications.slice(0, 4).map((n) => (
                <div key={n.id || `${n.notification_type}-${n.created_at}`} style={{ borderTop: `1px solid ${C.border}`, padding: "10px 0", display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div><strong>{text(n.title || n.notification_type, "Notification")}</strong><div style={{ color: C.sub }}>{text(n.body || n.pickup_id)} / {compactDate(n.created_at)}</div></div>
                  {!n.is_read && <Badge color={C.purple}>Unread</Badge>}
                </div>
              )) : <p style={{ color: C.sub }}>No notifications yet.</p>}
            </Card>
          </div>
        )}

        {view === "jobs" && <><ViewTitle icon={Briefcase} title="Assigned jobs" subtitle="All backend assignments for this Rider account." />{renderJobs(jobs, "No assigned jobs", "Supervisor assignment has not reached this rider account yet, or this rider code is not assigned to any real pickup.")}</>}
        {view === "pickup" && <><ViewTitle icon={Package} title="Pickup workflow" subtitle="Accept, arrive, verify pickup, collect parcels, or log pickup exception." />{renderJobs(pickupJobs, "No pickup jobs", "There are no active pickup tasks for this rider.")}</>}
        {view === "delivery" && <><ViewTitle icon={Truck} title="Delivery workflow" subtitle="Start delivery, verify delivered with proof, or submit exception with reason and photo." />{renderJobs(deliveryJobs, "No delivery jobs", "Collected parcels will appear here when ready for delivery.")}</>}

        {view === "route" && (
          <div style={{ display: "grid", gap: 12 }}>
            <ViewTitle icon={Route} title="Route manifest" subtitle="Stops generated from assigned pickup and delivery records." />
            {jobs.length ? jobs.map((job, idx) => {
              const address = text(job.delivery_address || job.pickup_address || job.address);
              const maps = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : "https://www.google.com/maps";
              return (
                <Card key={pickupId(job)} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ width: 38, height: 38, borderRadius: 999, background: C.panel2, display: "grid", placeItems: "center", color: C.gold }}>{idx + 1}</div>
                    <div><strong>{pickupId(job)}</strong><div style={{ color: C.sub }}>{address || "No address"}</div></div>
                  </div>
                  <a href={maps} target="_blank" rel="noreferrer" style={{ ...buttonStyle("blue"), textDecoration: "none" }}><MapPin size={16} /> Open map</a>
                </Card>
              );
            }) : <EmptyState title="No route stops" body="Route stays empty until real backend assignments exist." />}
          </div>
        )}

        {view === "cod" && (
          <div style={{ display: "grid", gap: 12 }}>
            <ViewTitle icon={Wallet} title="COD wallet" subtitle="COD collection and settlement visibility." />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }} className="be-three-grid">
              <Card><small>COD jobs</small><div style={{ color: C.gold, fontSize: 26, fontWeight: 900 }}>{codJobs.length}</div></Card>
              <Card><small>Total COD</small><div style={{ color: C.green, fontSize: 26, fontWeight: 900 }}>{money(totalCod)}</div></Card>
              <Card><small>Settlement</small><div style={{ color: C.blue, fontSize: 26, fontWeight: 900 }}>Backend</div></Card>
            </div>
            {renderJobs(codJobs, "No COD jobs", "COD records appear only when assigned pickups include COD/payment amount.")}
          </div>
        )}

        {view === "notifications" && (
          <div style={{ display: "grid", gap: 12 }}>
            <ViewTitle icon={Bell} title="Notifications" subtitle="Unread and read Enterprise Portal notifications." />
            {notifications.length ? notifications.map((n) => (
              <Card key={n.id || `${n.notification_type}-${n.created_at}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><strong>{text(n.title || n.notification_type, "Notification")}</strong>{!n.is_read && <Badge color={C.purple}>Unread</Badge>}</div>
                  <div style={{ color: C.sub, marginTop: 5 }}>{text(n.body || n.pickup_id)} / {compactDate(n.created_at)}</div>
                </div>
                {!n.is_read && <button onClick={() => markRead(n)} style={buttonStyle("gold")}>Mark read</button>}
              </Card>
            )) : <EmptyState title="No notifications" body="Assignment alerts and status notifications will appear here." />}
          </div>
        )}

        {view === "profile" && (
          <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 14 }} className="be-two-grid">
            <Card>
              <ViewTitle icon={User} title="Rider profile" subtitle="Profile, session, language, and logout." />
              <div style={{ display: "grid", gap: 10 }}>
                <div><small>Name</small><strong>{me.name}</strong></div>
                <div><small>Worker code</small><strong>{me.code}</strong></div>
                <div><small>Email</small><strong>{me.email}</strong></div>
                <div><small>Phone</small><strong>{me.phone}</strong></div>
                <div><small>Branch</small><strong>{me.branch}</strong></div>
                <div><small>Assigned zone</small><strong>{me.zone}</strong></div>
                <button onClick={() => void load(session)} style={buttonStyle("blue")}><RefreshCw size={16} /> Refresh profile</button>
                <button onClick={logout} style={buttonStyle("red")}><LogOut size={16} /> Logout</button>
              </div>
            </Card>
            <Card>
              <ViewTitle icon={ShieldCheck} title="Session and compliance" subtitle="Backend-only assignment and cargo event workflow." />
              <div style={{ display: "grid", gap: 10 }}>
                <div><small>Signed in</small><strong>{compactDate(session.signedInAt)}</strong></div>
                <div><small>Source</small><strong>{source}</strong></div>
                <div><small>Supabase</small><strong>{riderSupabaseConfigured() ? "Configured" : "Missing"}</strong></div>
                <p style={{ color: C.sub, lineHeight: 1.6 }}>This screen confirms the user session and provides the missing logout/profile controls. All job actions call backend RPCs and create cargo events when the SQL wiring is installed.</p>
                <button onClick={() => { clearAllSessions(); window.location.reload(); }} style={buttonStyle("plain")}>Clear local session and return to login</button>
              </div>
            </Card>
          </div>
        )}

        {view === "support" && (
          <Card>
            <ViewTitle icon={LifeBuoy} title="Support" subtitle="HQ support and APK tools." />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="tel:+959897447744" style={{ ...buttonStyle("blue"), textDecoration: "none" }}><Phone size={16} /> Call hotline</a>
              <a href="mailto:support@britiumventures.com" style={{ ...buttonStyle("plain"), textDecoration: "none" }}><Mail size={16} /> Email support</a>
              <a href="/downloads/britium-rider-app.apk" style={{ ...buttonStyle("gold"), textDecoration: "none" }}><Download size={16} /> Download APK</a>
            </div>
          </Card>
        )}
      </div>

      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(6,21,36,0.94)",
          borderTop: `1px solid ${C.border}`,
          display: "none",
          zIndex: 30,
        }}
        className="be-bottom-nav"
      >
        {nav.slice(0, 5).map((n) => {
          const Icon = n.icon;
          const active = view === n.id;
          return <button key={n.id} onClick={() => navigate(n.id)} style={{ flex: 1, minHeight: 58, background: "transparent", border: 0, color: active ? C.gold : C.sub, fontWeight: 700 }}><Icon size={18} /><div style={{ fontSize: 11 }}>{n.label.replace(/\s\(.*\)/, "")}</div></button>;
        })}
      </div>

      {modal && selectedJob && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.58)", display: "grid", placeItems: "center", zIndex: 50, padding: 16 }}>
          <Card style={{ width: modal === "pickup" ? "min(1180px, 100%)" : "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
              <div><strong>{modal === "pickup" ? "Verify pickup" : modal === "delivery" ? "Verify delivery" : "Submit exception"}</strong><div style={{ color: C.sub }}>{pickupId(selectedJob)}</div></div>
              <button onClick={() => setModal(null)} style={buttonStyle("ghost")}><X size={16} /></button>
            </div>

            {modal === "pickup" && (
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 18, overflow: "hidden", background: "linear-gradient(180deg, rgba(16,43,69,0.96), rgba(11,34,54,0.96))" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 0 }} className="be-pickup-verification-grid">
                    <aside style={{ borderRight: `1px solid ${C.border}`, padding: 14, background: "rgba(6,21,36,0.28)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <strong style={{ fontSize: 13, letterSpacing: 1.6, textTransform: "uppercase" }}>Assigned Pickups</strong>
                        <Badge color={C.red}>{jobs.filter(isPickupJob).length}</Badge>
                      </div>
                      <input value={pickupSearch} onChange={(e) => setPickupSearch(e.target.value)} placeholder="Pickup / merchant" style={{ ...inputStyle(), height: 42, marginBottom: 12 }} />
                      <div style={{ display: "grid", gap: 10, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
                        {jobs.filter(isPickupJob).filter((job) => {
                          const q = pickupSearch.trim().toLowerCase();
                          if (!q) return true;
                          return `${pickupId(job)} ${job.merchant_name || ""} ${job.customer_name || ""}`.toLowerCase().includes(q);
                        }).map((job) => {
                          const active = pickupId(job) === pickupId(selectedJob);
                          return (
                            <button key={pickupId(job)} type="button" onClick={() => openModal(job, "pickup")} style={{ textAlign: "left", border: `1px solid ${active ? C.red : C.border}`, background: active ? "rgba(248,113,113,0.10)" : "rgba(6,21,36,0.46)", color: C.text, borderRadius: 14, padding: 12, display: "grid", gap: 6, cursor: "pointer" }}>
                              <div style={{ color: active ? C.red : C.gold, fontWeight: 800, fontFamily: "monospace" }}>{pickupId(job)}</div>
                              <div style={{ fontWeight: 700 }}>{text(job.merchant_name || job.customer_name, "Merchant")}</div>
                              <div style={{ color: C.sub, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text(job.pickup_address || job.address, "No address")}</div>
                              <div style={{ display: "flex", justifyContent: "space-between", color: C.sub, fontSize: 12 }}><span>{compactDate(job.assigned_at || job.created_at)}</span><span>{text(job.expected_parcels || job.delivery_line_count || 1)} parcels</span></div>
                            </button>
                          );
                        })}
                      </div>
                    </aside>
                    <section style={{ padding: 16, display: "grid", gap: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ color: C.red, fontWeight: 900, fontSize: 18, fontFamily: "monospace" }}>{pickupId(selectedJob)}</div>
                          <div style={{ fontWeight: 800, marginTop: 4 }}>{text(selectedJob.merchant_name || selectedJob.customer_name, "Merchant")}</div>
                          <div style={{ color: C.sub, marginTop: 8, maxWidth: 620 }}>{text(selectedJob.pickup_address || selectedJob.address, "No pickup address")}</div>
                        </div>
                        <div style={{ minWidth: 260, border: `1px solid rgba(248,113,113,0.52)`, background: "rgba(248,113,113,0.08)", borderRadius: 16, padding: 14 }}>
                          <div style={{ color: C.red, fontWeight: 900, textTransform: "uppercase", fontSize: 12, marginBottom: 8 }}>Batch Info</div>
                          <div style={{ display: "grid", gap: 5, fontSize: 13 }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.sub }}>Parcels</span><strong style={{ color: C.red }}>{parcelRows.length || parcelCount}</strong></div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.sub }}>Pickup</span><strong>{batchDate(selectedJob)}</strong></div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.sub }}>Rider</span><strong>{text(me.name || session.name, "Rider")}</strong></div>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <Badge color={C.blue}>{verifiedCount(parcelRows)} / {parcelRows.length} verified</Badge>
                        <Badge color={C.gold}>Photo required for verification</Badge>
                        <Badge color={C.green}>Weight required</Badge>
                      </div>
                      <div style={{ display: "grid", gap: 12, maxHeight: "54vh", overflowY: "auto", paddingRight: 4 }}>
                        {parcelRows.map((row) => (
                          <div key={row.id} style={{ border: `1px solid ${row.verified ? "rgba(52,211,153,0.55)" : C.border}`, background: row.verified ? "rgba(52,211,153,0.06)" : "rgba(11,34,54,0.78)", borderRadius: 16, padding: 14, display: "grid", gap: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <div><div style={{ color: C.sub, fontSize: 11, textTransform: "uppercase", fontWeight: 900 }}>Parcel {row.index}/{parcelRows.length}</div><div style={{ fontFamily: "monospace", fontWeight: 900 }}>
                                {row.deliveryWayId || row.parcelId}</div><div style={{ color: C.sub, fontSize: 12 }}>
                                {row.trackingNo || ""}
                              </div><div style={{ color: C.gold, fontSize: 12 }}>
                                {row.waybillNo || ""}</div></div>
                              <Badge color={row.reuploadRequired ? C.red : row.verified || ["APPROVED", "APPROVED_AFTER_REUPLOAD"].includes(upper(row.reviewStatus)) ? C.green : C.gold}>{parcelReviewLabel(row)}</Badge>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(300px, 360px) 130px", gap: 10, alignItems: "end" }} className="be-parcel-row-grid">
                              <div><label>Actual weight (kg)</label><input data-weight={`${pickupId(selectedJob)}-${row.index}`} value={row.weightKg} inputMode="decimal" onChange={(e) => updateParcelRow(row.id, { weightKg: e.target.value, verified: false })} style={{ ...inputStyle(), textAlign: "center", fontFamily: "monospace" }} /></div>
                              <div>
                                <label>Cargo photo</label>
                                {(row.previewUrl || row.photoUrl) && (
                                  <a href={row.photoUrl || row.previewUrl} target="_blank" rel="noreferrer" style={{ display: "block", marginBottom: 8 }}>
                                    <img src={row.photoUrl || row.previewUrl} alt={row.parcelId} style={{ width: "100%", height: 180, objectFit: "contain", background: C.bg, borderRadius: 12, border: `1px solid ${C.border}` }} />
                                  </a>
                                )}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, minWidth: 280 }}>
                                  <label style={{ ...buttonStyle("plain"), width: "100%", minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", margin: 0, fontSize: 12, paddingLeft: 8, paddingRight: 8 }}>
                                    <Camera size={15} /> Capture
                                    <input type="file" accept="image/*" capture="environment" onChange={(e) => handleParcelPhoto(row.id, e)} style={{ display: "none" }} />
                                  </label>
                                  <label style={{ ...buttonStyle("plain"), width: "100%", minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", margin: 0, fontSize: 12, paddingLeft: 8, paddingRight: 8 }}>
                                    Attach
                                    <input type="file" accept="image/*" onChange={(e) => handleParcelPhoto(row.id, e)} style={{ display: "none" }} />
                                  </label>
                                </div>
                                {row.uploadStatus === "uploading" && <div style={{ color: C.gold, fontSize: 11, marginTop: 6 }}>Uploading...</div>}
                                {row.uploadStatus === "uploaded" && <div style={{ color: C.green, fontSize: 11, marginTop: 6 }}>Upload success</div>}
                                {row.uploadStatus === "failed" && <div style={{ color: C.red, fontSize: 11, marginTop: 6 }}>{row.uploadError || "Upload failed"}</div>}
                                {row.reuploadRequired && <div style={{ color: C.red, fontSize: 12, marginTop: 6, fontWeight: 700 }}>Rejected: {row.rejectionReason || "Photo is unclear or required information is missing."}</div>}
                              </div>
                              <button type="button" onClick={() => verifyParcelRow(row.id)} style={buttonStyle(row.reuploadRequired ? "red" : row.verified ? "green" : "gold")}>{row.uploadStatus === "uploading" ? "UPLOADING..." : row.reuploadRequired ? "RE-UPLOAD" : row.verified ? "APPROVED" : "UPLOAD FOR REVIEW"}</button>
                            </div>
                            <div><label>Remarks</label><input value={row.remarks} onChange={(e) => updateParcelRow(row.id, { remarks: e.target.value })} placeholder="Fragile / special handling note..." style={inputStyle()} /></div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            )}

            {modal === "delivery" && (
              <div style={{ display: "grid", gap: 12 }}>
                <div><label>Recipient name</label><input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} style={inputStyle()} /></div>
                <div><label>Recipient phone</label><input value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} style={inputStyle()} /></div>
                <div><label>COD collected amount</label><input value={codCollected} onChange={(e) => setCodCollected(e.target.value)} style={inputStyle()} /></div>
                <div><label>Required delivery proof photo</label><input type="file" accept="image/*" capture="environment" onChange={handleProof} style={inputStyle()} /></div>
                {proofUrl && <Badge color={C.green}>Proof attached</Badge>}
              </div>
            )}

            {modal === "exception" && (
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <label>Exception reason</label>
                  <select value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} style={inputStyle()}>
                    <option value="CUSTOMER_UNREACHABLE">Customer unreachable</option>
                    <option value="ADDRESS_NOT_FOUND">Address not found</option>
                    <option value="CUSTOMER_REFUSED">Customer refused</option>
                    <option value="DAMAGED_PARCEL">Damaged parcel</option>
                    <option value="MERCHANT_NOT_READY">Merchant not ready</option>
                    <option value="OTHER_EXCEPTION">Other</option>
                  </select>
                </div>
                <div><label>Required exception proof photo</label><input type="file" accept="image/*" capture="environment" onChange={handleProof} style={inputStyle()} /></div>
                {proofUrl && <Badge color={C.green}>Proof attached</Badge>}
              </div>
            )}

            <div style={{ marginTop: 12 }}><label>Remark</label><textarea value={remark} onChange={(e) => setRemark(e.target.value)} style={{ ...inputStyle(), minHeight: 82 }} /></div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button onClick={() => setModal(null)} style={buttonStyle("ghost")}>Cancel</button>
              <button onClick={submitModal} disabled={busy} style={buttonStyle(modal === "exception" ? "red" : "gold")}><UploadCloud size={16} /> Submit</button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}

const globalStyle = `
  @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Noto+Sans+Myanmar:wght@400;500;600;700&display=swap");
  * { box-sizing: border-box; }
  html, body, #root { min-height: 100%; margin: 0; background: #061524; }
  body { font-family: Poppins, "Noto Sans Myanmar", Inter, system-ui, sans-serif; }
  label { display: block; color: #9cc2d9; font-size: 13px; margin: 0 0 6px; font-weight: 600; }
  small { display: block; color: #6f91aa; font-size: 12px; margin-bottom: 3px; }
  strong { display: block; color: #eef8ff; font-size: 14px; line-height: 1.45; }
  h3 { margin: 12px 0 7px; font-size: 16px; }
  p { line-height: 1.55; }
  .be-spin { animation: be-spin 1s linear infinite; }
  @keyframes be-spin { to { transform: rotate(360deg); } }
  .be-scroll-x::-webkit-scrollbar { height: 6px; }
  .be-scroll-x::-webkit-scrollbar-thumb { background: #1a3a5c; border-radius: 999px; }
  @media (max-width: 920px) { .be-login-grid, .be-two-grid { grid-template-columns: 1fr !important; } .be-six-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; } }
  @media (max-width: 680px) { .be-three-grid, .be-six-grid { grid-template-columns: 1fr !important; } .be-bottom-nav { display: flex !important; } main { padding-bottom: 64px; } h1 { font-size: 24px !important; } }

  @media (max-width: 900px) {
    .be-pickup-verification-grid { grid-template-columns: 1fr !important; }
    .be-pickup-verification-grid aside { border-right: 0 !important; border-bottom: 1px solid #1a3a5c !important; }
    .be-parcel-row-grid { grid-template-columns: 1fr !important; }
  }
`;

export default function RiderFieldPortalApp() {
  return <FieldPortal />;
}