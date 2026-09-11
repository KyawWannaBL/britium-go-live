import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Bell,
  BookOpen,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  CreditCard,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Globe2,
  Headphones,
  History,
  Home,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Package2,
  Phone,
  PieChart,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  Upload,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";

type UiLanguage = "en" | "my" | "both";
type TabKey =
  | "dashboard"
  | "profile"
  | "booking"
  | "bulk"
  | "shipments"
  | "tracking"
  | "pickups"
  | "cod"
  | "billing"
  | "exceptions"
  | "reports"
  | "receivers"
  | "support"
  | "notifications";

type Tone = "blue" | "amber" | "green" | "rose" | "violet" | "slate";

type AuthUser = {
  id?: string;
  email?: string;
  role?: string;
  roleCode?: string;
  roles?: string[];
  permissions?: string[];
  displayName?: string;
  fullName?: string;
};

type MerchantProfile = {
  merchantId: string;
  businessName: string;
  ownerName: string;
  phone: string;
  email: string;
  registeredAddress: string;
  pickupAddress: string;
  township: string;
  city: string;
  region: string;
  businessType: string;
  preferredPaymentMethod: string;
  bankAccount: string;
  settlementPreference: string;
  memberSince: string;
  accountStatus: string;
  languagePreference: string;
  verified: boolean;
};

type MerchantStats = {
  todaysShipments: number;
  activeShipments: number;
  deliveredShipments: number;
  failedDeliveryAttempts: number;
  pendingPickups: number;
  codCollected: number;
  codPendingTransfer: number;
  codTransferred: number;
  returnShipments: number;
  openSupportTickets: number;
};

type ShipmentStatus =
  | "BOOKED"
  | "PICKUP_SCHEDULED"
  | "PICKED_UP"
  | "AT_HUB"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED_DELIVERY"
  | "RETURNED";

type ShipmentTimelineRow = {
  labelEn: string;
  labelMy?: string | null;
  time: string;
  done: boolean;
};

type ShipmentRow = {
  id: string;
  trackingNo: string;
  bookingDate: string;
  receiver: string;
  phone: string;
  destination: string;
  serviceType: string;
  codAmount: number;
  deliveryFee: number;
  pickupStatus: string;
  paymentStatus: string;
  returnStatus: string;
  status: ShipmentStatus;
  eta: string;
  location: string;
  rider?: string | null;
  proof?: string | null;
  failedReason?: string | null;
  returnReason?: string | null;
  timeline: ShipmentTimelineRow[];
};

type PickupRow = {
  id: string;
  pickupDate: string;
  timeWindow: string;
  parcelCount: number;
  address: string;
  contact: string;
  status: string;
  riderStatus: string;
};

type CodStatementRow = {
  id: string;
  shipmentId: string;
  deliveredDate: string;
  receiver: string;
  codAmount: number;
  serviceFee: number;
  deduction: number;
  netPayable: number;
  transferStatus: "PENDING" | "TRANSFERRED" | "ON_HOLD";
  settlementBatch: string;
  transferDate: string;
};

type InvoiceRow = {
  id: string;
  invoiceNo: string;
  billingPeriod: string;
  totalCharges: number;
  codFees: number;
  deductions: number;
  paymentStatus: string;
  dueDate: string;
};

type ExceptionRow = {
  id: string;
  trackingNo: string;
  receiver: string;
  issue: string;
  reason: string;
  status: string;
  updatedAt: string;
};

type ReceiverRow = {
  id: string;
  name: string;
  phone: string;
  address: string;
  township: string;
  city: string;
  note?: string | null;
  frequent?: boolean;
  recent?: boolean;
};

type TicketRow = {
  id: string;
  subject: string;
  issueType: string;
  relatedShipmentId?: string | null;
  priority: string;
  status: string;
  lastUpdated: string;
};

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
  tone: Tone;
};

type ReportRow = {
  id: string;
  reportDate: string;
  metric: string;
  value: string;
  label?: string | null;
};

type MerchantBootstrapPayload = {
  profile: MerchantProfile;
  stats: MerchantStats;
  notifications: NotificationRow[];
  recentShipments: ShipmentRow[];
  recentTickets: TicketRow[];
};

type BookingForm = {
  merchantName: string;
  senderContact: string;
  pickupAddress: string;
  pickupTownship: string;
  pickupCity: string;
  pickupInstructions: string;
  receiverName: string;
  receiverPhone: string;
  receiverEmail: string;
  deliveryAddress: string;
  deliveryTownship: string;
  deliveryCity: string;
  deliveryRegion: string;
  landmark: string;
  parcelType: string;
  itemDescription: string;
  quantity: string;
  weight: string;
  length: string;
  width: string;
  height: string;
  fragile: boolean;
  urgent: boolean;
  declaredValue: string;
  codAmount: string;
  deliveryNote: string;
  serviceType: string;
  pickupDate: string;
  deliverySlot: string;
  insurance: boolean;
  paymentResponsibility: string;
  specialHandling: string;
};

type PickupForm = {
  pickupDate: string;
  timeWindow: string;
  parcelCount: string;
  notes: string;
  contactPerson: string;
  pickupAddress: string;
};

type SupportForm = {
  subject: string;
  issueType: string;
  relatedShipmentId: string;
  priority: string;
  description: string;
};

const MERCHANT_ACCESS_ROLE_TOKENS = new Set<string>([
  "SYS",
  "SUPER_ADMIN",
  "ADMIN",
  "MERCHANT",
  "MERCHANT_ADMIN",
  "MERCHANT_OWNER",
  "MERCHANT_MANAGER",
  "MERCHANT_STAFF",
  "CUSTOMER_SERVICE",
  "CS",
]);

const MERCHANT_ACCESS_PERMISSION_TOKENS = new Set<string>([
  "MERCHANT_PORTAL_ACCESS",
  "MERCHANT_ALL",
  "ALL",
  "SUPER_ADMIN",
]);

const tabs: Array<{
  id: TabKey;
  labelEn: string;
  labelMy: string;
  icon: React.ComponentType<{ size?: string | number; className?: string }>;
}> = [
  { id: "dashboard", labelEn: "Dashboard", labelMy: "ပင်မအနှစ်ချုပ်", icon: Home },
  { id: "profile", labelEn: "Business Profile", labelMy: "လုပ်ငန်းပရိုဖိုင်", icon: Store },
  { id: "booking", labelEn: "Create Shipment", labelMy: "Shipment ဖန်တီးမည်", icon: Package2 },
  { id: "bulk", labelEn: "Bulk Upload", labelMy: "အစုလိုက် upload", icon: Upload },
  { id: "shipments", labelEn: "Shipment Management", labelMy: "Shipment စီမံခန့်ခွဲမှု", icon: Boxes },
  { id: "tracking", labelEn: "Cargo Tracking", labelMy: "ကုန်ပစ္စည်းခြေရာခံမှု", icon: Truck },
  { id: "pickups", labelEn: "Pickup Requests", labelMy: "Pickup တောင်းဆိုချက်များ", icon: CalendarClock },
  { id: "cod", labelEn: "COD & Settlement", labelMy: "COD နှင့် စာရင်းရှင်းလင်းမှု", icon: Wallet },
  { id: "billing", labelEn: "Billing & Statements", labelMy: "ငွေတောင်းခံမှုနှင့် statement များ", icon: FileText },
  { id: "exceptions", labelEn: "Returns & Exceptions", labelMy: "Returns နှင့် Exception များ", icon: AlertTriangle },
  { id: "reports", labelEn: "Reports & Analytics", labelMy: "အစီရင်ခံစာနှင့် Analytics", icon: PieChart },
  { id: "receivers", labelEn: "Receiver Directory", labelMy: "လက်ခံသူစာရင်း", icon: Users },
  { id: "support", labelEn: "Support Center", labelMy: "အကူအညီစင်တာ", icon: Headphones },
  { id: "notifications", labelEn: "Notifications", labelMy: "အသိပေးချက်များ", icon: Bell },
];

const TAB_TO_PATH: Record<TabKey, string> = {
  dashboard: "/merchant",
  profile: "/merchant/profile",
  booking: "/merchant/booking",
  bulk: "/merchant/bulk",
  shipments: "/merchant/shipments",
  tracking: "/merchant/tracking",
  pickups: "/merchant/pickups",
  cod: "/merchant/cod",
  billing: "/merchant/billing",
  exceptions: "/merchant/exceptions",
  reports: "/merchant/reports",
  receivers: "/merchant/receivers",
  support: "/merchant/support",
  notifications: "/merchant/notifications",
};

function getTabFromPath(pathname: string): TabKey {
  if (pathname.includes("/profile")) return "profile";
  if (pathname.includes("/booking")) return "booking";
  if (pathname.includes("/bulk")) return "bulk";
  if (pathname.includes("/shipments")) return "shipments";
  if (pathname.includes("/tracking")) return "tracking";
  if (pathname.includes("/pickups")) return "pickups";
  if (pathname.includes("/cod")) return "cod";
  if (pathname.includes("/billing")) return "billing";
  if (pathname.includes("/exceptions")) return "exceptions";
  if (pathname.includes("/reports")) return "reports";
  if (pathname.includes("/receivers")) return "receivers";
  if (pathname.includes("/support")) return "support";
  if (pathname.includes("/notifications")) return "notifications";
  return "dashboard";
}

function tt(language: UiLanguage, en: string, my: string) {
  if (language === "en") return en;
  if (language === "my") return my;
  return `${en} / ${my}`;
}

function normalizeToken(value?: string | null) {
  return (value ?? "").trim().replace(/[\s-]+/g, "_").toUpperCase();
}

function mergeUnique(left: string[] = [], right: string[] = []) {
  return Array.from(new Set([...left, ...right].filter(Boolean)));
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function toAuthUserCandidate(raw: unknown): Partial<AuthUser> | null {
  if (!raw || typeof raw !== "object") return null;

  const obj = raw as Record<string, any>;
  const role = obj.role ?? obj.app_role ?? obj.user_role ?? obj.roleCode ?? obj.role_code ?? obj.userType ?? obj.type;
  const roleCode = obj.roleCode ?? obj.role_code ?? obj.app_role ?? obj.user_role ?? obj.role;

  const candidate: Partial<AuthUser> = {
    id: obj.id,
    email: obj.email,
    role: typeof role === "string" ? role : undefined,
    roleCode: typeof roleCode === "string" ? roleCode : undefined,
    roles: mergeUnique(
      asStringArray(obj.roles),
      mergeUnique(asStringArray(obj.userRoles), mergeUnique(asStringArray(role), asStringArray(roleCode))),
    ),
    permissions: mergeUnique(
      asStringArray(obj.permissions),
      mergeUnique(asStringArray(obj.permission), mergeUnique(asStringArray(obj.scopes), asStringArray(obj.scope))),
    ),
    displayName: obj.displayName ?? obj.display_name ?? obj.fullName ?? obj.full_name ?? obj.name ?? obj.email,
    fullName: obj.fullName ?? obj.full_name,
  };

  const useful =
    candidate.id ||
    candidate.email ||
    candidate.role ||
    candidate.roleCode ||
    (candidate.roles && candidate.roles.length > 0) ||
    (candidate.permissions && candidate.permissions.length > 0);

  return useful ? candidate : null;
}

function extractAuthCandidate(source: unknown): Partial<AuthUser> | null {
  if (!source || typeof source !== "object") return null;

  const obj = source as Record<string, any>;
  const candidates = [
    obj,
    obj.user,
    obj.currentUser,
    obj.profile,
    obj.session,
    obj.session?.user,
    obj.data,
    obj.data?.user,
    obj.data?.session,
    obj.data?.session?.user,
    obj.auth,
    obj.auth?.user,
    obj.me,
    obj.account,
  ];

  for (const candidate of candidates) {
    const mapped = toAuthUserCandidate(candidate);
    if (mapped) return mapped;
  }

  return null;
}

function mergeAuthUser(base: AuthUser, patch?: Partial<AuthUser> | null): AuthUser {
  if (!patch) return base;

  return {
    id: patch.id ?? base.id,
    email: patch.email ?? base.email,
    role: patch.role ?? base.role,
    roleCode: patch.roleCode ?? base.roleCode,
    roles: mergeUnique(base.roles ?? [], patch.roles ?? []),
    permissions: mergeUnique(base.permissions ?? [], patch.permissions ?? []),
    displayName: patch.displayName ?? base.displayName,
    fullName: patch.fullName ?? base.fullName,
  };
}

function getRoleTokens(user: AuthUser) {
  return new Set([user.role, user.roleCode, ...(user.roles ?? [])].map(normalizeToken).filter(Boolean));
}

function getPermissionTokens(user: AuthUser) {
  return new Set((user.permissions ?? []).map(normalizeToken).filter(Boolean));
}

function canAccessMerchantPortal(user: AuthUser) {
  const roles = getRoleTokens(user);
  const perms = getPermissionTokens(user);
  if ([...roles].some((token) => MERCHANT_ACCESS_ROLE_TOKENS.has(token))) return true;
  if ([...perms].some((token) => MERCHANT_ACCESS_PERMISSION_TOKENS.has(token))) return true;
  return false;
}

async function fetchAuthUserFromProfiles(
  supabaseClient: any,
  userId: string,
): Promise<Partial<AuthUser> | null> {
  const tables = ["profiles", "user_profiles", "merchant_profiles", "staff_profiles"];
  const idFields = ["id", "user_id", "auth_user_id"];
  const selectColumns = "id,email,role,role_code,app_role,user_role,roles,permissions,display_name,full_name";

  for (const table of tables) {
    for (const idField of idFields) {
      try {
        const { data, error } = await supabaseClient
          .from(table)
          .select(selectColumns)
          .eq(idField, userId)
          .maybeSingle();

        if (!error && data) {
          const extracted = extractAuthCandidate(data);
          if (extracted) return extracted;
        }
      } catch {
        // ignore lookup failures
      }
    }
  }

  return null;
}

async function resolveAuthUserFromSupabase(): Promise<AuthUser> {
  let resolved: AuthUser = {};

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return {};

    resolved = mergeAuthUser(resolved, extractAuthCandidate(user));

    if (
      (!(resolved.role || resolved.roleCode || (resolved.roles && resolved.roles.length > 0)) ||
        !(resolved.permissions && resolved.permissions.length > 0)) &&
      user.id
    ) {
      const fromProfiles = await fetchAuthUserFromProfiles(supabase, user.id);
      resolved = mergeAuthUser(resolved, fromProfiles);
    }

    return resolved;
  } catch {
    return resolved;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const raw = await res.text();
  const parsed = raw ? JSON.parse(raw) : {};
  if (!res.ok) {
    throw new Error(parsed?.message || parsed?.error || `Request failed: ${res.status}`);
  }
  return (parsed?.data ?? parsed) as T;
}

function formatMMK(value?: number | null) {
  return `${Number(value ?? 0).toLocaleString()} MMK`;
}

function statusTone(status?: string | null): Tone {
  const v = normalizeToken(status);
  if (["DELIVERED", "TRANSFERRED", "PAID", "COMPLETED", "VERIFIED", "RESOLVED"].includes(v)) return "green";
  if (["OUT_FOR_DELIVERY", "BOOKED", "PICKUP_SCHEDULED", "IN_REVIEW", "IN_TRANSIT"].includes(v)) return "blue";
  if (["PENDING", "COD_PENDING", "ON_HOLD", "PARTIALLY_PAID", "AWAITING_MERCHANT_INSTRUCTION"].includes(v)) return "amber";
  if (["FAILED_DELIVERY", "RETURNED", "OPEN", "REJECTED"].includes(v)) return "rose";
  return "slate";
}

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value && value.trim()) query.set(key, value.trim());
  });
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

function emptyBookingForm(profile?: MerchantProfile | null): BookingForm {
  return {
    merchantName: profile?.businessName || "",
    senderContact: profile?.ownerName || "",
    pickupAddress: profile?.pickupAddress || "",
    pickupTownship: profile?.township || "",
    pickupCity: profile?.city || "",
    pickupInstructions: "",
    receiverName: "",
    receiverPhone: "",
    receiverEmail: "",
    deliveryAddress: "",
    deliveryTownship: "",
    deliveryCity: "",
    deliveryRegion: "",
    landmark: "",
    parcelType: "Parcel",
    itemDescription: "",
    quantity: "1",
    weight: "",
    length: "",
    width: "",
    height: "",
    fragile: false,
    urgent: false,
    declaredValue: "0",
    codAmount: "",
    deliveryNote: "",
    serviceType: "standard",
    pickupDate: "",
    deliverySlot: "",
    insurance: false,
    paymentResponsibility: "merchant",
    specialHandling: "",
  };
}

function emptyPickupForm(profile?: MerchantProfile | null): PickupForm {
  return {
    pickupDate: "",
    timeWindow: "10:00 AM - 12:00 PM",
    parcelCount: "1",
    notes: "",
    contactPerson: profile?.ownerName || "",
    pickupAddress: profile?.pickupAddress || "",
  };
}

function emptySupportForm(): SupportForm {
  return {
    subject: "",
    issueType: "shipment",
    relatedShipmentId: "",
    priority: "normal",
    description: "",
  };
}

export default function Merchants() {
  const location = useLocation();
  const navigate = useNavigate();

  const [authUser, setAuthUser] = useState<AuthUser>({});
  const [authReady, setAuthReady] = useState(false);

  const [language, setLanguage] = useState<UiLanguage>("both");
  const [tab, setTab] = useState<TabKey>(getTabFromPath(location.pathname));

  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [stats, setStats] = useState<MerchantStats | null>(null);

  const [recentShipments, setRecentShipments] = useState<ShipmentRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [recentTickets, setRecentTickets] = useState<TicketRow[]>([]);

  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [pickups, setPickups] = useState<PickupRow[]>([]);
  const [codStatements, setCodStatements] = useState<CodStatementRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [receivers, setReceivers] = useState<ReceiverRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);

  const [trackingNo, setTrackingNo] = useState("");
  const [shipmentSearch, setShipmentSearch] = useState("");
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [reportType, setReportType] = useState("shipment_volume");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const [bookingForm, setBookingForm] = useState<BookingForm>(emptyBookingForm());
  const [pickupForm, setPickupForm] = useState<PickupForm>(emptyPickupForm());
  const [supportForm, setSupportForm] = useState<SupportForm>(emptySupportForm());

  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ tone: "ok" | "warn" | "err"; message: string } | null>(null);

  const trackingInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTab(getTabFromPath(location.pathname));
  }, [location.pathname]);

  const goToTab = useCallback(
    (nextTab: TabKey) => {
      const nextPath = TAB_TO_PATH[nextTab];
      setTab(nextTab);
      if (location.pathname !== nextPath) {
        navigate(nextPath);
      }
    },
    [location.pathname, navigate],
  );

  const accessAllowed = authReady && canAccessMerchantPortal(authUser);

  const searchedTrackingShipment = useMemo(
    () =>
      shipments.find(
        (item) => item.trackingNo.trim().toLowerCase() === trackingNo.trim().toLowerCase(),
      ) ?? null,
    [shipments, trackingNo],
  );

  const filteredShipments = useMemo(() => {
    const q = shipmentSearch.trim().toLowerCase();
    return shipments.filter((item) => {
      if (!q) return true;
      return [
        item.trackingNo,
        item.receiver,
        item.destination,
        item.phone,
        item.serviceType,
        item.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [shipmentSearch, shipments]);

  const bookingEstimate = useMemo(() => {
    const baseRate =
      bookingForm.serviceType === "same_day"
        ? 4200
        : bookingForm.serviceType === "next_day"
          ? 3600
          : 3000;
    const weightCharge = Math.max(0, (parseFloat(bookingForm.weight) || 0) - 1) * 600;
    const codFee = bookingForm.codAmount ? 700 : 0;
    const insuranceFee = bookingForm.insurance ? 800 : 0;
    const urgentFee = bookingForm.urgent ? 900 : 0;
    const total = baseRate + weightCharge + codFee + insuranceFee + urgentFee;
    return { baseRate, weightCharge, codFee, insuranceFee, urgentFee, total };
  }, [bookingForm]);

  const refreshBootstrap = useCallback(async () => {
    if (!accessAllowed) return;

    setLoadingMap((prev) => ({ ...prev, bootstrap: true }));
    try {
      const payload = await fetchJson<MerchantBootstrapPayload>("/api/v1/merchant-portal/bootstrap");
      setProfile(payload.profile);
      setStats(payload.stats);
      setNotifications(payload.notifications ?? []);
      setRecentShipments(payload.recentShipments ?? []);
      setRecentTickets(payload.recentTickets ?? []);
      setBookingForm((prev) => {
        if (prev.merchantName || prev.senderContact || prev.pickupAddress) return prev;
        return emptyBookingForm(payload.profile);
      });
      setPickupForm((prev) => {
        if (prev.contactPerson || prev.pickupAddress) return prev;
        return emptyPickupForm(payload.profile);
      });
    } catch (e) {
      setToast({
        tone: "err",
        message: e instanceof Error ? e.message : "Unable to load merchant portal bootstrap.",
      });
    } finally {
      setLoadingMap((prev) => ({ ...prev, bootstrap: false }));
    }
  }, [accessAllowed]);

  const loadTabData = useCallback(
    async (targetTab: TabKey) => {
      if (!accessAllowed) return;

      setLoadingMap((prev) => ({ ...prev, [targetTab]: true }));
      try {
        if (targetTab === "shipments" || targetTab === "tracking") {
          const rows = await fetchJson<ShipmentRow[]>(
            `/api/v1/merchant-portal/shipments${buildQuery({ search: shipmentSearch || undefined })}`,
          );
          setShipments(rows);
          if (!selectedShipmentId && rows[0]) setSelectedShipmentId(rows[0].id);
        }

        if (targetTab === "pickups") {
          const rows = await fetchJson<PickupRow[]>("/api/v1/merchant-portal/pickups");
          setPickups(rows);
        }

        if (targetTab === "cod") {
          const rows = await fetchJson<CodStatementRow[]>("/api/v1/merchant-portal/cod-statements");
          setCodStatements(rows);
        }

        if (targetTab === "billing") {
          const rows = await fetchJson<InvoiceRow[]>("/api/v1/merchant-portal/invoices");
          setInvoices(rows);
        }

        if (targetTab === "exceptions") {
          const rows = await fetchJson<ExceptionRow[]>("/api/v1/merchant-portal/exceptions");
          setExceptions(rows);
        }

        if (targetTab === "reports") {
          const rows = await fetchJson<ReportRow[]>(
            `/api/v1/merchant-portal/reports${buildQuery({ type: reportType })}`,
          );
          setReports(rows);
        }

        if (targetTab === "receivers") {
          const rows = await fetchJson<ReceiverRow[]>("/api/v1/merchant-portal/receivers");
          setReceivers(rows);
        }

        if (targetTab === "support") {
          const rows = await fetchJson<TicketRow[]>("/api/v1/merchant-portal/tickets");
          setTickets(rows);
        }

        if (targetTab === "notifications") {
          const rows = await fetchJson<NotificationRow[]>("/api/v1/merchant-portal/notifications");
          setNotifications(rows);
        }
      } catch (e) {
        setToast({
          tone: "err",
          message: e instanceof Error ? e.message : `Unable to load ${targetTab}.`,
        });
      } finally {
        setLoadingMap((prev) => ({ ...prev, [targetTab]: false }));
      }
    },
    [accessAllowed, reportType, selectedShipmentId, shipmentSearch],
  );

  useEffect(() => {
    let active = true;

    const syncAuthUser = async () => {
      const nextUser = await resolveAuthUserFromSupabase();
      if (active) {
        setAuthUser(nextUser);
        setAuthReady(true);
      }
    };

    void syncAuthUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async () => {
      const nextUser = await resolveAuthUserFromSupabase();
      if (active) {
        setAuthUser(nextUser);
        setAuthReady(true);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (accessAllowed) {
      void refreshBootstrap();
    }
  }, [accessAllowed, refreshBootstrap]);

  useEffect(() => {
    if (!accessAllowed) return;
    if (tab === "dashboard" || tab === "profile" || tab === "booking" || tab === "bulk") return;
    void loadTabData(tab);
  }, [accessAllowed, loadTabData, tab]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (tab === "tracking") {
      trackingInputRef.current?.focus();
    }
  }, [tab]);

  const handleBookingSubmit = useCallback(async () => {
    if (!bookingForm.receiverName.trim() || !bookingForm.receiverPhone.trim() || !bookingForm.deliveryAddress.trim()) {
      setToast({ tone: "warn", message: "Receiver name, phone, and delivery address are required." });
      return;
    }

    try {
      await fetchJson("/api/v1/merchant-portal/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookingForm),
      });

      setToast({ tone: "ok", message: "Shipment booking submitted successfully." });
      setBookingForm(emptyBookingForm(profile));
      await refreshBootstrap();
      goToTab("shipments");
    } catch (e) {
      setToast({
        tone: "err",
        message: e instanceof Error ? e.message : "Unable to submit booking.",
      });
    }
  }, [bookingForm, goToTab, profile, refreshBootstrap]);

  const handlePickupSubmit = useCallback(async () => {
    if (!pickupForm.pickupDate || !pickupForm.pickupAddress.trim() || !pickupForm.contactPerson.trim()) {
      setToast({ tone: "warn", message: "Pickup date, address, and contact person are required." });
      return;
    }

    try {
      const created = await fetchJson<PickupRow>("/api/v1/merchant-portal/pickups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...pickupForm,
          parcelCount: Number(pickupForm.parcelCount || 0),
        }),
      });

      setPickups((prev) => [created, ...prev]);
      setPickupForm(emptyPickupForm(profile));
      setToast({ tone: "ok", message: "Pickup request submitted successfully." });
      await refreshBootstrap();
    } catch (e) {
      setToast({
        tone: "err",
        message: e instanceof Error ? e.message : "Unable to submit pickup request.",
      });
    }
  }, [pickupForm, profile, refreshBootstrap]);

  const handleSupportSubmit = useCallback(async () => {
    if (!supportForm.subject.trim() || !supportForm.description.trim()) {
      setToast({ tone: "warn", message: "Subject and description are required." });
      return;
    }

    try {
      const created = await fetchJson<TicketRow>("/api/v1/merchant-portal/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supportForm),
      });

      setTickets((prev) => [created, ...prev]);
      setSupportForm(emptySupportForm());
      setToast({ tone: "ok", message: "Support ticket submitted successfully." });
      await refreshBootstrap();
    } catch (e) {
      setToast({
        tone: "err",
        message: e instanceof Error ? e.message : "Unable to submit support ticket.",
      });
    }
  }, [supportForm, refreshBootstrap]);

  const handleBulkUpload = useCallback(async () => {
    if (!uploadFile) {
      setToast({ tone: "warn", message: "Please choose a CSV or XLSX file first." });
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);

      await fetchJson("/api/v1/merchant-portal/imports/shipments", {
        method: "POST",
        body: formData,
      });

      setUploadFile(null);
      setToast({ tone: "ok", message: "Bulk shipment file uploaded successfully." });
      goToTab("shipments");
    } catch (e) {
      setToast({
        tone: "err",
        message: e instanceof Error ? e.message : "Unable to upload bulk shipment file.",
      });
    }
  }, [goToTab, uploadFile]);

  const handleReportExport = useCallback(async () => {
    try {
      const payload = await fetchJson<{ url: string }>(
        `/api/v1/merchant-portal/reports/export${buildQuery({ type: reportType })}`,
      );
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setToast({
        tone: "err",
        message: e instanceof Error ? e.message : "Unable to export report.",
      });
    }
  }, [reportType]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8fbff_0%,#eef4fb_54%,#f8fafc_100%)] p-8">
        <div className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm text-sm text-slate-500">
          Checking merchant access...
        </div>
      </div>
    );
  }

  if (!accessAllowed) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8fbff_0%,#eef4fb_54%,#f8fafc_100%)] p-8">
        <div className="max-w-2xl rounded-[32px] border border-rose-200 bg-white p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-rose-50 p-3 text-rose-600">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-[#0d2c54]">
                Merchant Portal Access Restricted
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                This portal is only for authorized merchant and admin users.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(13,44,84,0.12),transparent_24%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_20%),linear-gradient(180deg,#f8fbff_0%,#eef4fb_54%,#f8fafc_100%)] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1800px] space-y-6">
        <motion.header
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/76 p-6 shadow-[0_24px_56px_rgba(15,23,42,0.08)] backdrop-blur-xl md:p-7"
        >
          <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="absolute left-0 top-0 h-32 w-32 rounded-full bg-[#ffd700]/10 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/90 px-3 py-1.5 shadow-sm">
                <Sparkles size={14} className="text-[#0d2c54]" />
                <span className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">
                  Merchant Portal
                </span>
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#0d2c54] md:text-5xl">
                Britium Express Merchant Workspace
              </h1>
              <p className="mt-4 text-sm font-medium leading-6 text-slate-500 md:text-[15px]">
                {tt(
                  language,
                  "A production merchant portal for shipments, pickups, tracking, COD, billing, receivers, support, and analytics.",
                  "Shipment, pickup, tracking, COD, billing, receiver, support နှင့် analytics များအတွက် production merchant portal ဖြစ်သည်။",
                )}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:w-[560px]">
              <Panel className="p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                  {tt(language, "Merchant Account", "merchant account")}
                </div>
                <div className="mt-3 text-base font-black text-[#0d2c54]">
                  {profile?.businessName || authUser.displayName || authUser.email || "-"}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-500">
                  {profile?.ownerName || authUser.fullName || "-"} • {profile?.merchantId || "-"}
                </div>
              </Panel>

              <Panel className="p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                  {tt(language, "Language Mode", "ဘာသာစကား mode")}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    ["en", "EN"],
                    ["my", "မြန်မာ"],
                    ["both", "EN + မြန်မာ"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLanguage(value as UiLanguage)}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                        language === value
                          ? "bg-[#0d2c54] text-white shadow"
                          : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Panel>
            </div>
          </div>

          <div className="relative z-10 mt-6 flex flex-wrap gap-3">
            <ActionButton onClick={() => goToTab("booking")}>
              <Package2 size={15} />
              {tt(language, "Create Shipment", "Shipment ဖန်တီးမည်")}
            </ActionButton>
            <ActionButton tone="secondary" onClick={() => goToTab("bulk")}>
              <Upload size={15} />
              {tt(language, "Bulk Upload", "အစုလိုက် upload")}
            </ActionButton>
            <ActionButton tone="secondary" onClick={() => goToTab("pickups")}>
              <CalendarClock size={15} />
              {tt(language, "Request Pickup", "Pickup တောင်းဆိုမည်")}
            </ActionButton>
            <ActionButton tone="secondary" onClick={() => goToTab("cod")}>
              <Wallet size={15} />
              {tt(language, "COD Statement", "COD statement")}
            </ActionButton>
          </div>
        </motion.header>

        {toast ? (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
              toast.tone === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : toast.tone === "warn"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {toast.message}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <motion.aside
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            className="xl:sticky xl:top-6 xl:self-start"
          >
            <Panel className="p-3">
              <div className="mb-3 px-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                {tt(language, "Portal Navigation", "Portal လမ်းညွှန်")}
              </div>
              <nav className="flex flex-row flex-wrap gap-2 xl:flex-col">
                {tabs.map((item) => {
                  const Icon = item.icon;
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => goToTab(item.id)}
                      className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
                        active
                          ? "bg-[#0d2c54] text-white shadow-[0_16px_30px_rgba(13,44,84,0.22)]"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <Icon size={17} />
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.16em]">
                          {item.labelEn}
                        </div>
                        <div className={`mt-1 text-xs font-semibold ${active ? "text-white/70" : "text-slate-400"}`}>
                          {item.labelMy}
                        </div>
                      </div>
                      <ChevronRight size={14} className="ml-auto" />
                    </button>
                  );
                })}
              </nav>
            </Panel>
          </motion.aside>

          <main>{/* keep the rest of your existing view blocks and helper components unchanged; only replace every setTab(...) navigation with goToTab(...) where it changes portal screens */}</main>
        </div>
      </div>
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl ${className}`}
    >
      {children}
    </motion.section>
  );
}

function DarkPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-[30px] border border-[#17375f] bg-[linear-gradient(180deg,#0d2c54_0%,#0a2343_100%)] p-6 text-white shadow-[0_24px_64px_rgba(13,44,84,0.36)] ${className}`}
    >
      <div className="absolute -right-14 -top-14 h-44 w-44 rounded-full bg-[#ffd700]/10 blur-3xl" />
      <div className="absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-sky-400/10 blur-3xl" />
      <div className="relative z-10">{children}</div>
    </motion.section>
  );
}

function SectionTitle({ language, icon, titleEn, titleMy, subtitleEn, subtitleMy }: { language: UiLanguage; icon: React.ReactNode; titleEn: string; titleMy: string; subtitleEn?: string; subtitleMy?: string }) {
  return (
    <div className="mb-5 flex items-start gap-3 border-b border-slate-200/80 pb-5">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-[#0d2c54] shadow-inner">{icon}</div>
      <div>
        <div className="text-lg font-black tracking-tight text-[#0d2c54]">{tt(language, titleEn, titleMy)}</div>
        {subtitleEn ? <div className="mt-3 text-sm font-medium leading-6 text-slate-500">{tt(language, subtitleEn, subtitleMy || subtitleEn)}</div> : null}
      </div>
    </div>
  );
}

function ActionButton({ children, tone = "primary", onClick }: { children: React.ReactNode; tone?: "primary" | "secondary"; onClick?: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -1, scale: 1.01 }}
      whileTap={{ scale: 0.985 }}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-[0.16em] ${
        tone === "primary"
          ? "bg-[#0d2c54] text-white shadow-[0_18px_36px_rgba(13,44,84,0.2)]"
          : "border border-slate-200 bg-white text-slate-700 shadow-[0_12px_24px_rgba(15,23,42,0.05)]"
      }`}
    >
      {children}
    </motion.button>
  );
}

function MetricCard({ language, titleEn, titleMy, value, icon }: { language: UiLanguage; titleEn: string; titleMy: string; value: string; icon: React.ReactNode }) {
  return (
    <Panel className="relative overflow-hidden p-5">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#0d2c54]/[0.04] blur-2xl" />
      <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-[#0d2c54] shadow-inner">{icon}</div>
      <div className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{tt(language, titleEn, titleMy)}</div>
      <div className="mt-3 text-3xl font-black tracking-tight text-[#0d2c54]">{value}</div>
    </Panel>
  );
}

function InputGroup({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</label>
      {children}
    </div>
  );
}

function StatusBadge({ label, tone = "blue" }: { label: string; tone?: Tone }) {
  const palette = {
    blue: "bg-sky-50 text-sky-700 border-sky-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  }[tone];

  return <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] ${palette}`}>{label}</span>;
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-semibold text-[#0d2c54] shadow-sm">{value}</div>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm font-semibold text-white/75">
      <span>{label}</span>
      <span>{value.toLocaleString()} Ks</span>
    </div>
  );
}

function EmptyState({ title }: { title: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">{title}</div>;
}

function LoadingState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">
      <div className="inline-flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" />
        Loading...
      </div>
    </div>
  );
}

function SimpleTable({ columns, rows, loading }: { columns: string[]; rows: Array<Array<React.ReactNode>>; loading?: boolean }) {
  if (loading) return <LoadingState />;
  if (!rows.length) return <EmptyState title="No records found." />;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            {columns.map((col) => (
              <th key={col} className="px-4 py-3 font-black">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-t border-slate-100">
              {row.map((cell, cellIdx) => (
                <td key={cellIdx} className="px-4 py-3 align-top text-slate-700">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimelineBlock({ timeline }: { timeline: ShipmentTimelineRow[] }) {
  return (
    <div className="space-y-4">
      {timeline.map((step, index) => (
        <div key={`${step.labelEn}-${index}`} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-black ${step.done ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-slate-200 bg-white text-slate-400"}`}>
              {step.done ? <CheckCircle2 size={16} /> : index + 1}
            </div>
            {index < timeline.length - 1 ? <div className={`mt-2 h-10 w-px ${step.done ? "bg-emerald-200" : "bg-slate-200"}`} /> : null}
          </div>
          <div className="pb-4">
            <div className="text-sm font-black text-[#0d2c54]">{step.labelEn}</div>
            {step.labelMy ? <div className="mt-1 text-sm font-semibold text-slate-500">{step.labelMy}</div> : null}
            <div className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{step.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
