import { FormEvent, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  PackageCheck,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserPlus,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "@/styles/britiumLogin.css";

type AuthMode = "login" | "signup" | "forgot";
type LoginRole = "enterprise" | "merchant" | "rider" | "finance";

type BritiumLoginPageProps = {
  initialMode?: AuthMode;
};

const roles: Array<{
  id: LoginRole;
  title: string;
  note: string;
  route: string;
  icon: any;
}> = [
  {
    id: "enterprise",
    title: "Enterprise Ops",
    note: "Supervisor, CS, warehouse, branch, admin",
    route: "/dashboard",
    icon: ShieldCheck,
  },
  {
    id: "merchant",
    title: "Merchant Portal",
    note: "Pickup request, reports, settlement, wallet",
    route: "/merchant-dashboard",
    icon: Building2,
  },
  {
    id: "rider",
    title: "Rider App",
    note: "Pickup verification, delivery, GPS, wallet",
    route: "/rider-app",
    icon: PackageCheck,
  },
  {
    id: "finance",
    title: "Finance",
    note: "COD, P&L, ledger, settlement reports",
    route: "/finance-reports",
    icon: WalletCards,
  },
];

function getQueryParam(name: string) {
  const raw = window.location.hash.split("?")[1] || window.location.search.replace(/^\?/, "");
  return new URLSearchParams(raw).get(name);
}

function safeNextRoute(fallback: string) {
  const next = getQueryParam("next");
  if (!next) return fallback;
  const decoded = decodeURIComponent(next);
  if (!decoded.startsWith("/")) return fallback;
  if (decoded.startsWith("/login") || decoded.startsWith("/signup") || decoded.startsWith("/forgot")) return fallback;
  return decoded;
}

function routeForRole(role: LoginRole) {
  return roles.find((item) => item.id === role)?.route || "/dashboard";
}

function setLocalPortalSession(role: LoginRole, identifier: string, remember: boolean) {
  const store = remember ? localStorage : sessionStorage;
  store.setItem("be_enterprise_session", "1");
  store.setItem("be_enterprise_role", role);
  store.setItem("be_enterprise_identifier", identifier || role);
  localStorage.setItem("be_enterprise_last_role", role);
}

function apkUrl(kind: "rider" | "driver" | "helper" | "enterprise") {
  const urls: Record<string, string | undefined> = {
    rider: import.meta.env.VITE_RIDER_APK_URL,
    driver: import.meta.env.VITE_DRIVER_APK_URL,
    helper: import.meta.env.VITE_HELPER_APK_URL,
    enterprise: import.meta.env.VITE_ENTERPRISE_APK_URL,
  };
  return urls[kind] || "";
}

export default function BritiumLoginPage({ initialMode = "login" }: BritiumLoginPageProps) {
  const modeFromUrl = (getQueryParam("mode") as AuthMode | null) || initialMode;
  const [mode, setMode] = useState<AuthMode>(modeFromUrl === "signup" || modeFromUrl === "forgot" ? modeFromUrl : "login");
  const [role, setRole] = useState<LoginRole>((localStorage.getItem("be_enterprise_last_role") as LoginRole) || "enterprise");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [okMessage, setOkMessage] = useState("");

  const selectedRole = useMemo(() => roles.find((item) => item.id === role) || roles[0], [role]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setOkMessage("");

    try {
      const loginId = identifier.trim();

      if (!loginId) {
        setMessage("Please enter your email, staff ID, merchant ID, or rider ID.");
        return;
      }

      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(loginId, {
          redirectTo: `${window.location.origin}${window.location.pathname}#/login`,
        });
        if (error) throw error;
        setOkMessage("Password reset link sent. Please check your email.");
        return;
      }

      if (mode === "signup") {
        if (!password || password.length < 6) {
          setMessage("Password must be at least 6 characters.");
          return;
        }
        const { error } = await supabase.auth.signUp({
          email: loginId,
          password,
          options: {
            data: {
              full_name: fullName,
              role,
              workspace: "Britium Express",
            },
          },
        });
        if (error) throw error;
        setOkMessage("Signup submitted. Please verify your email, then sign in.");
        setMode("login");
        return;
      }

      /*
        UAT mode:
        - Email login uses Supabase email/password.
        - Staff/Rider/Merchant ID login allows UAT local session so the portal is not blocked during go-live testing.
      */
      if (loginId.includes("@")) {
        if (!password) {
          setMessage("Please enter your password.");
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({
          email: loginId,
          password,
        });
        if (error) throw error;
      }

      setLocalPortalSession(role, loginId, remember);
      window.location.hash = safeNextRoute(routeForRole(role));
    } catch (error: any) {
      setMessage(error?.message || "Unable to sign in. Please check your credentials.");
    } finally {
      setBusy(false);
    }
  }

  function handleApkDownload(kind: "rider" | "driver" | "helper" | "enterprise") {
    const url = apkUrl(kind);
    if (!url) {
      setMessage(`APK URL for ${kind} app is not configured yet. Set VITE_${kind.toUpperCase()}_APK_URL in Vercel environment variables.`);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="be-login-page">
      <div className="be-login-aurora be-login-aurora-one" />
      <div className="be-login-aurora be-login-aurora-two" />
      <div className="be-login-grid" />
      <div className="be-login-orbit">
        <span />
        <span />
        <span />
      </div>

      <section className="be-login-hero">
        <div className="be-login-brand">
          <img src="/logo.png" alt="Britium Express" />
          <div>
            <div className="be-login-kicker">BRITIUM EXPRESS</div>
            <h1>Enterprise Portal</h1>
            <p>Go-live command center for pickup, wayplan, rider verification, data entry, document print, finance and settlement.</p>
          </div>
        </div>

        <div className="be-login-metrics">
          <div><strong>OPS</strong><span>Workflow</span></div>
          <div><strong>GPS</strong><span>Live Track</span></div>
          <div><strong>COD</strong><span>Settlement</span></div>
          <div><strong>UAT</strong><span>Ready</span></div>
        </div>

        <div className="be-login-flow">
          <div>Pickup Request</div>
          <div>Supervisor Assign</div>
          <div>Rider Verify</div>
          <div>Data Entry</div>
          <div>Waybill / Invoice</div>
          <div>COD Settlement</div>
        </div>
      </section>

      <section className="be-login-card">
        <div className="be-login-card-head">
          <div>
            <div className="be-login-small"><Sparkles size={16} /> Secure workspace access</div>
            <h2>{mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Reset password"}</h2>
          </div>
          <span className="be-login-pill">GO-LIVE</span>
        </div>

        <div className="be-role-grid">
          {roles.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`be-role-card ${role === item.id ? "active" : ""}`}
                onClick={() => setRole(item.id)}
              >
                <Icon size={18} />
                <span>{item.title}</span>
                <small>{item.note}</small>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="be-login-form">
          {mode === "signup" && (
            <label>
              <span>Full name</span>
              <div className="be-input-wrap">
                <UserPlus size={18} />
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
              </div>
            </label>
          )}

          <label>
            <span>{role === "rider" ? "Email or Rider ID" : role === "merchant" ? "Email or Merchant ID" : "Email or Staff ID"}</span>
            <div className="be-input-wrap">
              <Mail size={18} />
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={role === "rider" ? "RID-0001 or rider@britiumexpress.com" : "you@britiumexpress.com"}
                autoComplete="username"
              />
            </div>
          </label>

          {mode !== "forgot" && (
            <label>
              <span>{role === "rider" ? "Password / PIN" : "Password"}</span>
              <div className="be-input-wrap">
                <KeyRound size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={role === "rider" ? "Optional for UAT rider ID mode" : "Enter password"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
                <button type="button" className="be-eye" onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
          )}

          {mode === "login" && (
            <div className="be-login-row">
              <label className="be-check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span>Remember this workspace</span>
              </label>
              <button type="button" className="be-link" onClick={() => setMode("forgot")}>Forgot password?</button>
            </div>
          )}

          {message && <div className="be-login-error">{message}</div>}
          {okMessage && <div className="be-login-success"><CheckCircle2 size={16} /> {okMessage}</div>}

          <button type="submit" className="be-login-submit" disabled={busy}>
            {busy ? "Processing..." : mode === "login" ? `Enter ${selectedRole.title}` : mode === "signup" ? "Create account" : "Send reset link"}
            <ArrowRight size={18} />
          </button>
        </form>

        <div className="be-login-switch">
          {mode !== "login" && <button type="button" onClick={() => setMode("login")}>Back to sign in</button>}
          {mode !== "signup" && <button type="button" onClick={() => setMode("signup")}>Request new account</button>}
        </div>

        <div className="be-apk-panel">
          <div>
            <Smartphone size={18} />
            <strong>Mobile APK downloads</strong>
          </div>
          <div className="be-apk-buttons">
            <button type="button" onClick={() => handleApkDownload("rider")}><Download size={15} /> Rider APK</button>
            <button type="button" onClick={() => handleApkDownload("driver")}><Download size={15} /> Driver APK</button>
            <button type="button" onClick={() => handleApkDownload("helper")}><Download size={15} /> Helper APK</button>
          </div>
        </div>
      </section>
    </main>
  );
}
