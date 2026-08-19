HEAD
import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Box,
  CheckSquare,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Home,
  Loader2,
  Lock,
  LogOut,
  Map as MapIcon,
  MapPin,
  Package,
  Truck,
  User,
} from "lucide-react";

const Theme = {
  bg: "#061524",
  panel: "#0b2236",
  panel2: "#102b45",
  border: "#1a3a5c",
  text: "#eef8ff",
  sub: "#7ea0b8",
  orange: "#f6b84b",
  green: "#34d399",
  blue: "#4ea8de",
  error: "#f87171",
};

type Lang = "en" | "mm";
type TabId = "dashboard" | "route" | "scan" | "eod";

interface RiderMasterRow {
  rider_id: string;
  rider_code: string;
  rider_name: string;
  name: string;
  phone_primary: string;
  phone: string;
  assigned_zone: string;
  branch_code: string;
  employment_type: string;
  status: string;
}

interface UserProfile {
  id: string;
  riderCode: string;
  name: string;
  phone: string;
  assignedZone: string;
  branchCode: string;
  email: string;
}

interface LangProps {
  lang: Lang;
  toggleLang: () => void;
  t: (en: string, mm: string) => string;
}

const SESSION_KEY = "britium_rider_uat_session";

/**
 * UAT rider master.
 * This avoids calling the missing Supabase RPC:
 * public.be_rider_login_profile(p_payload)
 */
const RIDERS: RiderMasterRow[] = [
  {
    rider_id: "RID001",
    rider_code: "RID001",
    rider_name: "Ko Kyaw Zin Khant",
    name: "Ko Kyaw Zin Khant",
    phone_primary: "09-779 052 872",
    phone: "09-779 052 872",
    assigned_zone: "Yangon Central",
    branch_code: "YGN",
    employment_type: "Permanent",
    status: "active",
  },
  {
    rider_id: "RID002",
    rider_code: "RID002",
    rider_name: "Ko Paing Zay Htet",
    name: "Ko Paing Zay Htet",
    phone_primary: "09-779 615 147",
    phone: "09-779 615 147",
    assigned_zone: "Yangon South",
    branch_code: "YGN",
    employment_type: "Permanent",
    status: "active",
  },
  {
    rider_id: "RID003",
    rider_code: "RID003",
    rider_name: "Ko Chit Yin Htoo",
    name: "Ko Chit Yin Htoo",
    phone_primary: "09-662 385 475",
    phone: "09-662 385 475",
    assigned_zone: "Yangon North",
    branch_code: "YGN",
    employment_type: "Permanent",
    status: "active",
  },
  {
    rider_id: "RID004",
    rider_code: "RID004",
    rider_name: "Ko Wai Lin Phyo",
    name: "Ko Wai Lin Phyo",
    phone_primary: "09-779 634 710",
    phone: "09-779 634 710",
    assigned_zone: "Yangon North",
    branch_code: "YGN",
    employment_type: "Permanent",
    status: "active",
  },
  {
    rider_id: "RID005",
    rider_code: "RID005",
    rider_name: "Ko Aye Chan Soe",
    name: "Ko Aye Chan Soe",
    phone_primary: "09-259 725 323",
    phone: "09-259 725 323",
    assigned_zone: "Yangon North",
    branch_code: "YGN",
    employment_type: "Permanent",
    status: "active",
  },
  {
    rider_id: "RID006",
    rider_code: "RID006",
    rider_name: "Ma Myo Pa Pa Aung",
    name: "Ma Myo Pa Pa Aung",
    phone_primary: "09-779 617 044",
    phone: "09-779 617 044",
    assigned_zone: "Yangon East",
    branch_code: "YGN",
    employment_type: "Permanent",
    status: "active",
  },
  {
    rider_id: "RID007",
    rider_code: "RID007",
    rider_name: "Ko Myo Min Kyaw",
    name: "Ko Myo Min Kyaw",
    phone_primary: "09-775 018 446",
    phone: "09-775 018 446",
    assigned_zone: "Yangon Central",
    branch_code: "YGN",
    employment_type: "Permanent",
    status: "active",
  },
  {
    rider_id: "RID008",
    rider_code: "RID008",
    rider_name: "Ko Than Min Soe",
    name: "Ko Than Min Soe",
    phone_primary: "09-786 015 602",
    phone: "09-786 015 602",
    assigned_zone: "Yangon South",
    branch_code: "YGN",
    employment_type: "Contract",
    status: "active",
  },
  {
    rider_id: "RID009",
    rider_code: "RID009",
    rider_name: "Ko S Lin Phyo",
    name: "Ko S Lin Phyo",
    phone_primary: "09-965 023 790",
    phone: "09-965 023 790",
    assigned_zone: "Yangon Central",
    branch_code: "YGN",
    employment_type: "Contract",
    status: "active",
  },
];

const VALID_UAT_PASSWORDS = new Set(["1234", "12345678", "password", "britium123"]);

function useLocalLang(): LangProps {
  const [lang, setLang] = useState<Lang>("en");

  const toggleLang = () => {
    setLang((prev) => (prev  "en" ? "mm" : "en"));
  };

  const t = (en: string, mm: string) => {
    return lang  "mm" ? mm : en;
  };

  return { lang, toggleLang, t };
}

function normalize(value: unknown): string {
  return String(value || "").trim();
}

function lower(value: unknown): string {
  return normalize(value).toLowerCase();
}

function phoneDigits(value: unknown): string {
  return normalize(value).replace(/[^\d]/g, "");
}

function riderEmail(code: string): string {
  return `${code.toLowerCase()}@britiumexpress.com`;
}

function findRiderByLogin(loginValue: string): { rider: RiderMasterRow; email: string } | null {
  const login = lower(loginValue);
  const loginDigits = phoneDigits(loginValue);

  if (!login) {
    return null;
  }

  if (login  "sqi@britiumexpress.com") {
    return {
      rider: RIDERS[0],
      email: "sqi@britiumexpress.com",
    };
  }

  const emailMatch = login.match(/^(rid\d{3})@britiumexpress\.com$/i);

  if (emailMatch) {
    const code = emailMatch[1].toUpperCase();
    const rider = RIDERS.find((item) => item.rider_code  code);

    return rider
      ? {
          rider,
          email: login,
        }
      : null;
  }

  const directCodeMatch = login.match(/^rid\d{3}$/i);

  if (directCodeMatch) {
    const code = directCodeMatch[0].toUpperCase();
    const rider = RIDERS.find((item) => item.rider_code  code);

    return rider
      ? {
          rider,
          email: riderEmail(code),
        }
      : null;
  }

  const ygnMatch = login.match(/^rider_ygn_0*(\d+)$/i);

  if (ygnMatch) {
    const number = Number(ygnMatch[1]);

    if (Number.isFinite(number) && number > 0) {
      const code = `RID${String(number).padStart(3, "0")}`;
      const rider = RIDERS.find((item) => item.rider_code  code);

      return rider
        ? {
            rider,
            email: riderEmail(code),
          }
        : null;
    }
  }

  const byPhone = RIDERS.find((item) => {
    return phoneDigits(item.phone)  loginDigits || phoneDigits(item.phone_primary)  loginDigits;
  });

  if (byPhone) {
    return {
      rider: byPhone,
      email: riderEmail(byPhone.rider_code),
    };
  }

  return null;
}

function buildProfile(rider: RiderMasterRow, email: string): UserProfile {
  return {
    id: rider.rider_id,
    riderCode: rider.rider_code,
    name: rider.rider_name || rider.name,
    phone: rider.phone_primary || rider.phone,
    assignedZone: rider.assigned_zone,
    branchCode: rider.branch_code,
    email,
  };
}

function isPasswordAccepted(password: string): boolean {
  const value = password.trim();

  /**
   * Localhost/UAT convenience:
   * In npm run dev, any password with 4+ chars is accepted.
   * In production build, only the fixed UAT passwords above are accepted.
   */
  if (import.meta.env.DEV && value.length >= 4) {
    return true;
  }

  return VALID_UAT_PASSWORDS.has(value);
}

function getSavedSession(): UserProfile | null {
  try {
    if (typeof window  "undefined") {
      return null;
    }

    const raw = localStorage.getItem(SESSION_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as UserProfile;

    if (!parsed?.id || !parsed?.riderCode) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveSession(user: UserProfile): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch {
    // Ignore localStorage failure in private/restricted browser mode.
  }
}

function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore localStorage failure.
  }
}

/* ==
   LOGIN SCREEN
== */
function LoginScreen({
  onLogin,
  langProps,
}: {
  onLogin: (user: UserProfile) => void;
  langProps: LangProps;
}) {
  const { lang, toggleLang, t } = langProps;

  const [login, setLogin] = useState("sqi@britiumexpress.com");
  const [password, setPassword] = useState("12345678");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!login.trim()) {
      setError(t("Email or Rider ID is required.", "အီးမေးလ် သို့မဟုတ် Rider ID လိုအပ်ပါသည်။"));
      return;
    }

    if (!password.trim()) {
      setError(t("Password is required.", "Password လိုအပ်ပါသည်။"));
      return;
    }

    setError("");
    setIsLoading(true);

    await new Promise((resolve) => window.setTimeout(resolve, 500));

    const match = findRiderByLogin(login);

    if (!match || match.rider.status !== "active") {
      setError(t("Invalid rider account.", "Rider အကောင့် မမှန်ပါ။"));
      setIsLoading(false);
      return;
    }

    if (!isPasswordAccepted(password)) {
      setError(t("Invalid password.", "Password မှားနေပါသည်။"));
      setIsLoading(false);
      return;
    }

    const profile = buildProfile(match.rider, match.email);

    saveSession(profile);
    onLogin(profile);
    setIsLoading(false);
=
import React, { useEffect, useState } from "react";

type TemplateItem = {
  title: string;
  file: string;
  uploadRoute: string;
};

const templates: TemplateItem[] = [
  {
    title: "Data Entry Upload Template",
    file: "/templates/Britium_Data_Entry_UAT_GoLive_Template.xlsx",
    uploadRoute: "/data-entry/upload",
  },
  {
    title: "Merchant / Customer Upload Template",
    file: "/templates/Britium_Merchant_Customer_Upload_UAT_Template.xlsx",
    uploadRoute: "/merchant/upload",
  },
  {
    title: "Warehouse Scan Template",
    file: "/templates/Britium_Warehouse_Scan_UAT_GoLive_Template.xlsx",
    uploadRoute: "/warehouse/upload",
  },
];

const nav = [
  ["/go-live-readiness", "Go-Live Readiness"],
  ["/templates", "Template Center"],
  ["/data-entry/upload", "Data Entry Upload"],
  ["/merchant/upload", "Merchant Upload"],
  ["/customer/upload", "Customer Upload"],
  ["/warehouse/upload", "Warehouse Upload"],
  ["/warehouse/scan", "Warehouse Scan"],
];

function getRoute() {
  const raw = window.location.hash.replace("#", "") || "/go-live-readiness";

  if (
    raw  "/" ||
    raw  "/login" ||
    raw  "/dashboard" ||
    raw  "login" ||
    raw  "dashboard"
  ) {
    return "/go-live-readiness";
>>>>>>> 4646c0320cd6b080a8a3d06ac01efadef71748b2
  }

  return raw.startsWith("/") ? raw : `/${raw}`;
}

export default function App() {
  const [route, setRoute] = useState(getRoute());

  function go(nextRoute: string) {
    window.location.hash = nextRoute;
    setRoute(nextRoute);
  }

  useEffect(() => {
    const initialRoute = getRoute();

    if (window.location.hash  "#/login" || window.location.hash  "#/dashboard") {
      window.location.hash = "/go-live-readiness";
      setRoute("/go-live-readiness");
    } else {
      setRoute(initialRoute);
    }

    const handler = () => setRoute(getRoute());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  return (
HEAD
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: Theme.bg,
        color: Theme.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        position: "relative",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <button
        type="button"
        onClick={toggleLang}
        style={{
          position: "absolute",
          top: 24,
          right: 24,
          border: `1px solid ${Theme.border}`,
          color: Theme.sub,
          backgroundColor: Theme.panel,
          borderRadius: 999,
          padding: "8px 14px",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {lang  "en" ? "🇲🇲 မြန်မာ" : "🇬🇧 English"}
      </button>

      <div
        style={{
          width: "100%",
          maxWidth: 460,
          backgroundColor: Theme.panel,
          border: `1px solid ${Theme.border}`,
          borderRadius: 28,
          padding: 34,
          boxShadow: "0 24px 80px rgba(0,0,0,.32)",
        }}
      >
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              color: Theme.orange,
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: ".04em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Britium Rider App
=
    <div style={styles.app}>
      <aside style={styles.sidebar}>
        <h2 style={styles.brand}>Britium UAT</h2>
        <p style={styles.note}>Login bypassed for UAT smoke testing.</p>

        {nav.map(([path, label]) => (
          <button
            key={path}
            type="button"
            onClick={() => go(path)}
            style={{
              ...styles.nav,
              background:
                route  path
                  ? "rgba(255,255,255,0.22)"
                  : "rgba(255,255,255,0.08)",
            }}
          >
            {label}
          </button>
        ))}
      </aside>

      <main style={styles.main}>
        {route  "/templates" ? (
          <TemplateCenter go={go} />
        ) : route  "/data-entry/upload" ? (
          <UploadPage title="Data Entry Upload" template={templates[0].file} />
        ) : route  "/merchant/upload" ? (
          <UploadPage title="Merchant Upload" template={templates[1].file} />
        ) : route  "/customer/upload" ? (
          <UploadPage title="Customer Upload" template={templates[1].file} />
        ) : route  "/warehouse/upload" ? (
          <UploadPage title="Warehouse Upload" template={templates[2].file} />
        ) : route  "/warehouse/scan" ? (
          <WarehouseScan />
        ) : (
          <Readiness />
        )}
      </main>
    </div>
  );
}

function Readiness() {
  return (
    <section>
      <h1>Go-Live Readiness Center</h1>
      <p style={styles.muted}>
        Use this screen for UAT smoke testing before reconnecting live auth and backend cleanup RPCs.
      </p>

      <div style={styles.grid}>
        <StatusCard title="Mock / Demo Runtime Data" value="Must be zero" />
        <StatusCard title="Dispatch Routes" value="Zero until generated" />
        <StatusCard title="Warehouse Manifests" value="Real records only" />
        <StatusCard title="Template Uploads" value="Ready for UAT" />
      </div>

      <div style={styles.card}>
        <h2>UAT Dry Run Flow</h2>
        <ol>
          <li>Download the needed template.</li>
          <li>Upload Data Entry, Merchant/Customer, or Warehouse file.</li>
          <li>Confirm row validation result.</li>
          <li>Create one real pickup request.</li>
          <li>
            Verify one canonical Pickup ID flows through supervisor, warehouse, dispatch,
            rider, tracking, and finance.
          </li>
        </ol>
      </div>
    </section>
  );
}

function TemplateCenter({ go }: { go: (route: string) => void }) {
  return (
    <section>
      <h1>Template Download Center</h1>
      <p style={styles.muted}>Header-only UAT templates. No mock/sample/demo rows.</p>

      <div style={styles.grid}>
        {templates.map((item) => (
          <div key={item.title} style={styles.card}>
            <h2>{item.title}</h2>
            <p>Download the approved upload format.</p>

            <a href={item.file} download style={styles.button}>
              Download XLSX
            </a>

            <button
              type="button"
              onClick={() => go(item.uploadRoute)}
              style={styles.secondaryButton}
            >
              Open Upload Screen
            </button>
>>>>>>> 4646c0320cd6b080a8a3d06ac01efadef71748b2
          </div>
        ))}
      </div>
    </section>
  );
}

HEAD
          <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.15 }}>
            {t("Workforce Login", "လုပ်သားအကောင့်ဝင်ရန်")}
          </h1>

          <p style={{ marginTop: 18, color: Theme.sub, fontSize: 16, lineHeight: 1.6 }}>
            {t(
              "Sign in with your registered workforce email, rider code, or phone number.",
              "မှတ်ပုံတင်ထားသော အီးမေးလ်၊ Rider Code သို့မဟုတ် ဖုန်းနံပါတ်ဖြင့် ဝင်ပါ။"
            )}
          </p>
=
function UploadPage({ title, template }: { title: string; template: string }) {
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("No file selected.");

  return (
    <section>
      <h1>{title}</h1>
      <p style={styles.muted}>Upload CSV/XLSX for UAT validation. This screen does not load mock data.</p>

      <div style={styles.card}>
        <a href={template} download style={styles.button}>
          Download Template
        </a>

        <div style={{ marginTop: 24 }}>
          <label style={styles.label}>
            Select upload file
            <input
              style={styles.input}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  setFileName("");
                  setMessage("No file selected.");
                  return;
                }

                setFileName(file.name);
                setMessage(`Selected ${file.name}. Ready for backend validation/import.`);
              }}
            />
          </label>
        </div>

        <div style={styles.result}>
          <strong>File:</strong> {fileName || "None"}
          <br />
          <strong>Status:</strong> {message}
>>>>>>> 4646c0320cd6b080a8a3d06ac01efadef71748b2
        </div>

        <form onSubmit={handleLogin} style={{ display: "grid", gap: 20 }}>
          {error && (
            <div
              style={{
                padding: 16,
                borderRadius: 16,
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                backgroundColor: "rgba(248,113,113,0.12)",
                border: `1px solid ${Theme.error}`,
                color: Theme.error,
                lineHeight: 1.45,
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{error}</span>
            </div>
          )}

          <label style={{ display: "grid", gap: 9 }}>
            <span
              style={{
                color: Theme.sub,
                fontSize: 13,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: ".05em",
              }}
            >
              {t("Email Address / Rider ID", "အီးမေးလ် / Rider ID")}
            </span>

            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <User size={19} style={{ position: "absolute", left: 17, color: Theme.sub }} />

              <input
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="sqi@britiumexpress.com"
                disabled={isLoading}
                autoComplete="username"
                style={{
                  width: "100%",
                  height: 56,
                  paddingLeft: 48,
                  paddingRight: 16,
                  borderRadius: 16,
                  border: `1px solid ${Theme.border}`,
                  backgroundColor: "#061524",
                  color: Theme.text,
                  outline: "none",
                  fontSize: 16,
                  fontWeight: 650,
                }}
              />
            </div>
          </label>

          <label style={{ display: "grid", gap: 9 }}>
            <span
              style={{
                color: Theme.sub,
                fontSize: 13,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: ".05em",
              }}
            >
              {t("Password", "Password")}
            </span>

            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <Lock size={19} style={{ position: "absolute", left: 17, color: Theme.sub }} />

              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="12345678"
                disabled={isLoading}
                autoComplete="current-password"
                style={{
                  width: "100%",
                  height: 56,
                  paddingLeft: 48,
                  paddingRight: 52,
                  borderRadius: 16,
                  border: `1px solid ${Theme.border}`,
                  backgroundColor: "#061524",
                  color: Theme.text,
                  outline: "none",
                  fontSize: 16,
                  fontWeight: 650,
                }}
              />

              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                disabled={isLoading}
                style={{
                  position: "absolute",
                  right: 16,
                  border: "none",
                  background: "transparent",
                  color: Theme.sub,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              height: 58,
              border: "none",
              borderRadius: 18,
              backgroundColor: Theme.orange,
              color: "#061524",
              fontSize: 17,
              fontWeight: 800,
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.72 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              marginTop: 6,
            }}
          >
            {isLoading ? (
              <>
                <Loader2 size={19} className="animate-spin" />
                {t("Signing in...", "ဝင်ရောက်နေသည်...")}
              </>
            ) : (
              t("Sign in", "အကောင့်ဝင်မည်")
            )}
          </button>

          <div
            style={{
              border: `1px solid ${Theme.border}`,
              backgroundColor: "rgba(78,168,222,0.08)",
              color: Theme.sub,
              borderRadius: 16,
              padding: 14,
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            <strong style={{ color: Theme.text }}>UAT Login:</strong>
            <br />
            sqi@britiumexpress.com / 12345678
            <br />
            rid001@britiumexpress.com / 1234
            <br />
            RID001 / 1234
          </div>
        </form>
      </div>
HEAD
    </div>
  );
}

/* ==
   DASHBOARD
== */
function DashboardTab({
  user,
  onNavigate,
  onLogout,
  langProps,
}: {
  user: UserProfile;
  onNavigate: (tab: TabId) => void;
  onLogout: () => void;
  langProps: LangProps;
}) {
  const { t } = langProps;

  return (
    <div
      style={{
        maxWidth: 520,
        margin: "0 auto",
        padding: "20px 16px 100px",
        display: "grid",
        gap: 16,
      }}
    >
      <div
        style={{
          backgroundColor: Theme.panel,
          border: `1px solid ${Theme.border}`,
          borderRadius: 24,
          padding: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 18,
              border: `2px solid ${Theme.orange}`,
              backgroundColor: "rgba(246,184,75,0.1)",
              color: Theme.orange,
              display: "grid",
              placeItems: "center",
              fontSize: 22,
              fontWeight: 900,
              flexShrink: 0,
            }}
          >
            {user.name.charAt(0)}
          </div>

          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                lineHeight: 1.25,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {t(`Mingalarbar, ${user.name}`, `မင်္ဂလာပါ ${user.name}`)}
            </h2>

            <p
              style={{
                margin: "5px 0 0",
                color: Theme.sub,
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              {user.riderCode} · {user.assignedZone} · {user.branchCode}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          title={t("Logout", "ထွက်မည်")}
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            border: `1px solid ${Theme.border}`,
            backgroundColor: Theme.panel2,
            color: Theme.sub,
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <LogOut size={18} />
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 14,
        }}
      >
        <KpiCard
          icon={Package}
          label={t("Pending Drops", "ပို့ရန်ကျန်")}
          value="14"
          color={Theme.blue}
        />

        <KpiCard
          icon={Box}
          label={t("Pickups", "ကောက်ယူရန်")}
          value="3"
          color={Theme.orange}
        />
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <h3
          style={{
            margin: "4px 0 0",
            color: Theme.sub,
            fontSize: 13,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: ".05em",
          }}
        >
          {t("Next Recommended Stop", "နောက်ထပ်သွားရမည့်နေရာ")}
        </h3>

        <div
          style={{
            backgroundColor: Theme.panel,
            border: `1px solid ${Theme.blue}`,
            borderRadius: 24,
            padding: 18,
            position: "relative",
            overflow: "hidden",
            display: "grid",
            gap: 14,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 4,
              backgroundColor: Theme.blue,
            }}
          />

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  padding: "5px 8px",
                  borderRadius: 8,
                  backgroundColor: "rgba(78,168,222,0.16)",
                  color: Theme.blue,
                  fontSize: 10,
                  fontWeight: 900,
                  textTransform: "uppercase",
                }}
              >
                Dropoff
              </span>

              <span
                style={{
                  padding: "5px 8px",
                  borderRadius: 8,
                  backgroundColor: "rgba(248,113,113,0.16)",
                  color: Theme.error,
                  fontSize: 10,
                  fontWeight: 900,
                  textTransform: "uppercase",
                }}
              >
                Express
              </span>
            </div>

            <span
              style={{
                color: Theme.text,
                fontSize: 12,
                fontWeight: 800,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                whiteSpace: "nowrap",
              }}
            >
              <Clock size={13} />
              10:30 AM
            </span>
          </div>

          <div>
            <h4 style={{ margin: 0, fontSize: 18 }}>DEL-84920</h4>

            <p
              style={{
                margin: "8px 0 0",
                color: Theme.sub,
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 6,
                lineHeight: 1.45,
              }}
            >
              <MapPin size={14} />
              No. 12, Hledan Road, Kamayut
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate("route")}
            style={{
              height: 48,
              border: "none",
              borderRadius: 16,
              backgroundColor: Theme.blue,
              color: "#061524",
              fontSize: 15,
              fontWeight: 900,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {t("Navigate to Stop", "မြေပုံဖြင့်သွားမည်")}
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <h3
          style={{
            margin: "4px 0 0",
            color: Theme.sub,
            fontSize: 13,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: ".05em",
          }}
        >
          {t("Today Queue", "ယနေ့လုပ်ငန်းစဉ်")}
        </h3>

        <JobCard code="PU-UAT-001" type="Pickup" address="Yangon Test Address · Hlaing" count="3" />
        <JobCard code="DEL-84920" type="Dropoff" address="No. 12, Hledan Road · Kamayut" count="1" />
      </div>
=
    </section>
  );
}

function WarehouseScan() {
  const [scan, setScan] = useState("");

  return (
    <section>
      <h1>Warehouse Scan</h1>
      <p style={styles.muted}>
        Scan or enter Pickup ID, Deliver ID, Invoice No, Waybill No, or Bag Code.
      </p>

      <div style={styles.card}>
        <label style={styles.label}>
          Scan value
          <input
            style={styles.input}
            value={scan}
            onChange={(event) => setScan(event.target.value)}
            placeholder="Example: W0525-BBK-015"
            autoFocus
          />
        </label>

        <div style={styles.result}>
          <strong>Current Scan:</strong> {scan || "Waiting for scan..."}
          <br />
          <strong>Status:</strong> Ready for backend lookup / warehouse intake validation.
        </div>
      </div>
    </section>
  );
}

function StatusCard({ title, value }: { title: string; value: string }) {
  return (
    <div style={styles.card}>
      <h2>{title}</h2>
      <p style={styles.status}>{value}</p>
>>>>>>> 4646c0320cd6b080a8a3d06ac01efadef71748b2
    </div>
  );
}

HEAD
function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        backgroundColor: Theme.panel,
        border: `1px solid ${Theme.border}`,
        borderRadius: 22,
        padding: 18,
        position: "relative",
        overflow: "hidden",
        minHeight: 126,
      }}
    >
      <Icon size={22} style={{ color, marginBottom: 10 }} />

      <div
        style={{
          color: Theme.sub,
          fontSize: 12,
          fontWeight: 850,
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {label}
      </div>

      <div style={{ marginTop: 7, fontSize: 30, fontWeight: 900 }}>{value}</div>

      <div style={{ position: "absolute", right: -18, bottom: -22, opacity: 0.05 }}>
        <Icon size={92} />
      </div>
    </div>
  );
}

function JobCard({
  code,
  type,
  address,
  count,
}: {
  code: string;
  type: string;
  address: string;
  count: string;
}) {
  return (
    <div
      style={{
        backgroundColor: Theme.panel,
        border: `1px solid ${Theme.border}`,
        borderRadius: 20,
        padding: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: Theme.orange, fontSize: 13, fontWeight: 900 }}>{code}</div>

        <div style={{ marginTop: 5, color: Theme.text, fontSize: 15, fontWeight: 750 }}>{type}</div>

        <div
          style={{
            marginTop: 5,
            color: Theme.sub,
            fontSize: 12,
            lineHeight: 1.4,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {address}
        </div>
      </div>

      <div
        style={{
          minWidth: 42,
          height: 42,
          borderRadius: 14,
          backgroundColor: "rgba(246,184,75,.12)",
          border: `1px solid ${Theme.orange}`,
          color: Theme.orange,
          display: "grid",
          placeItems: "center",
          fontWeight: 900,
        }}
      >
        {count}
      </div>
    </div>
  );
}

/* ==
   PLACEHOLDER TABS
== */
function PlaceholderScreen({
  icon: Icon,
  title,
  desc,
  color,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  color: string;
}) {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 160px)",
        display: "grid",
        placeItems: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div>
        <Icon size={54} style={{ color, opacity: 0.72, marginBottom: 16 }} />

        <h2 style={{ margin: 0, fontSize: 23 }}>{title}</h2>

        <p style={{ marginTop: 10, color: Theme.sub, fontSize: 14, lineHeight: 1.55, maxWidth: 360 }}>
          {desc}
        </p>
      </div>
    </div>
  );
}

/* ==
   MAIN APP SHELL
== */
export default function App() {
  const langProps = useLocalLang();

  const [user, setUser] = useState<UserProfile | null>(() => getSavedSession());
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  const navItems = useMemo(
    () => [
      {
        id: "dashboard" as TabId,
        icon: Home,
        label: langProps.lang  "en" ? "Home" : "ပင်မ",
      },
      {
        id: "route" as TabId,
        icon: MapIcon,
        label: langProps.lang  "en" ? "Route" : "မြေပုံ",
      },
      {
        id: "scan" as TabId,
        icon: Box,
        label: langProps.lang  "en" ? "Scan" : "စကင်န်",
      },
      {
        id: "eod" as TabId,
        icon: CheckSquare,
        label: langProps.lang  "en" ? "EOD" : "သိမ်းမည်",
      },
    ],
    [langProps.lang]
  );

  function handleLogin(nextUser: UserProfile) {
    setUser(nextUser);
    setActiveTab("dashboard");
  }

  function handleLogout() {
    clearSession();
    setUser(null);
    setActiveTab("dashboard");
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} langProps={langProps} />;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: Theme.bg,
        color: Theme.text,
        position: "relative",
        overflow: "hidden",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          height: 58,
          borderBottom: `1px solid ${Theme.border}`,
          backgroundColor: "rgba(6,21,36,.96)",
          backdropFilter: "blur(12px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 900,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: Theme.orange }}>BE</span>
          Rider
        </div>

        <button
          type="button"
          onClick={langProps.toggleLang}
          style={{
            border: `1px solid ${Theme.border}`,
            backgroundColor: Theme.panel,
            color: Theme.sub,
            borderRadius: 999,
            padding: "7px 12px",
            fontSize: 11,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          {langProps.lang  "en" ? "🇲🇲 MM" : "🇬🇧 EN"}
        </button>
      </div>

      <div
        style={{
          height: "calc(100vh - 58px)",
          overflowY: "auto",
          paddingBottom: 90,
        }}
      >
        {activeTab  "dashboard" && (
          <DashboardTab
            user={user}
            onNavigate={setActiveTab}
            onLogout={handleLogout}
            langProps={langProps}
          />
        )}

        {activeTab  "route" && (
          <PlaceholderScreen
            icon={MapIcon}
            title={langProps.t("Route Optimization", "မြေပုံ")}
            desc={langProps.t(
              "The Route Optimization module loads here.",
              "Route Optimization module ကို ဒီနေရာတွင် ပြသမည်။"
            )}
            color={Theme.orange}
          />
        )}

        {activeTab  "scan" && (
          <PlaceholderScreen
            icon={Box}
            title={langProps.t("Pickup / Execution", "ကောက်ယူခြင်း")}
            desc={langProps.t(
              "The QR Scanner and Execution modules load here.",
              "QR Scanner နှင့် Execution module များကို ဒီနေရာတွင် ပြသမည်။"
            )}
            color={Theme.blue}
          />
        )}

        {activeTab  "eod" && (
          <PlaceholderScreen
            icon={CheckSquare}
            title={langProps.t("EOD Settlement", "ငွေစာရင်းသိမ်းမည်")}
            desc={langProps.t(
              "The End of Day Settlement module loads here.",
              "End of Day Settlement module ကို ဒီနေရာတွင် ပြသမည်။"
            )}
            color={Theme.green}
          />
        )}
      </div>

      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: 74,
          borderTop: `1px solid ${Theme.border}`,
          backgroundColor: "rgba(11,34,54,0.96)",
          backdropFilter: "blur(14px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          zIndex: 30,
        }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab  item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                background: "transparent",
                color: isActive ? Theme.orange : Theme.sub,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  padding: 6,
                  borderRadius: 14,
                  backgroundColor: isActive ? "rgba(255,255,255,.08)" : "transparent",
                }}
              >
                <Icon size={21} strokeWidth={isActive ? 2.7 : 2} />
              </div>

              <span
                style={{
                  fontSize: 10,
                  letterSpacing: ".02em",
                  fontWeight: isActive ? 900 : 650,
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
=
const styles: Record<string, React.CSSProperties> = {
  app: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "270px 1fr",
    background: "#f8fafc",
    color: "#0f172a",
    fontFamily: "Arial, sans-serif",
  },
  sidebar: {
    background: "#0f172a",
    color: "white",
    padding: 20,
  },
  brand: {
    margin: "0 0 8px",
  },
  note: {
    color: "#cbd5e1",
    fontSize: 12,
    marginBottom: 20,
  },
  nav: {
    display: "block",
    width: "100%",
    color: "white",
    border: 0,
    textAlign: "left",
    padding: "14px 16px",
    borderRadius: 10,
    marginBottom: 8,
    fontWeight: 800,
    cursor: "pointer",
    pointerEvents: "auto",
  },
  main: {
    padding: 32,
    overflow: "auto",
  },
  muted: {
    color: "#64748b",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 16,
    marginTop: 20,
  },
  card: {
    background: "white",
    borderRadius: 18,
    padding: 24,
    boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
  },
  status: {
    color: "#065f46",
    fontWeight: 800,
  },
  button: {
    display: "inline-block",
    background: "#0f172a",
    color: "white",
    textDecoration: "none",
    padding: "12px 16px",
    borderRadius: 10,
    fontWeight: 800,
    marginRight: 10,
    marginBottom: 10,
  },
  secondaryButton: {
    display: "inline-block",
    background: "#e2e8f0",
    color: "#0f172a",
    border: 0,
    textDecoration: "none",
    padding: "12px 16px",
    borderRadius: 10,
    fontWeight: 800,
    cursor: "pointer",
  },
  label: {
    display: "grid",
    gap: 8,
    fontWeight: 800,
  },
  input: {
    height: 48,
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "0 14px",
    fontSize: 16,
    background: "white",
    color: "#0f172a",
  },
  result: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    background: "#ecfdf5",
    color: "#065f46",
    lineHeight: 1.7,
  },
};
>>>>>>> 4646c0320cd6b080a8a3d06ac01efadef71748b2
