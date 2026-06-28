import { FormEvent, useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Download, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type LoginMode = "portal" | "rider";

const ROLE_ROUTES: Record<string, string> = {
  super_admin: "/dashboard",
  admin: "/dashboard",
  supervisor: "/supervisor",
  supervisor_pickup: "/supervisor-pickup",
  ops_manager: "/ops-manager",
  operation_manager: "/ops-manager",
  dispatch: "/dispatch",
  cs_agent: "/customer-service",
  customer_service: "/customer-service",
  finance: "/finance",
  data_entry: "/data-entry",
  warehouse: "/warehouse",
  branch_admin: "/branch-office",
  merchant: "/merchant",
  customer: "/customer",
  biz_dev: "/biz-dev",
  business_development_manager: "/biz-dev",
  rider: "/rider-dashboard",
  driver: "/driver",
  helper: "/helper",
};

async function readEnterpriseAccount(user: any) {
  if (!user?.id && !user?.email) return null;

  try {
    const filters = [`auth_user_id.eq.${user.id}`];
    if (user.email) filters.push(`email.eq.${user.email}`);

    const { data, error } = await (supabase as any)
      .from("be_user_account_registry")
      .select("*")
      .or(filters.join(","))
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.warn("Enterprise registry lookup failed:", error);
    return null;
  }
}

function getRole(user: any, registry: any) {
  return (
    registry?.role_id ||
    registry?.app_role ||
    registry?.role ||
    user?.user_metadata?.role ||
    user?.app_metadata?.role ||
    "dashboard"
  );
}

function needsPasswordChange(user: any, registry: any) {
  return Boolean(
    registry?.must_change_password ||
      registry?.force_password_change ||
      registry?.password_change_required ||
      user?.user_metadata?.must_change_password ||
      user?.app_metadata?.must_change_password,
  );
}

export default function PortalLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const apkHref = useMemo(() => "/downloads/britium-rider-app.apk", []);

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setMessage("");

      if (!email.trim() || !password) {
        setMessage("Please enter your email and password.");
        return;
      }

      setBusy(true);

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        const user = data?.user;
        const registry = await readEnterpriseAccount(user);
        const role = getRole(user, registry);
        const target = next || ROLE_ROUTES[role] || "/dashboard";

        if (needsPasswordChange(user, registry)) {
          navigate(`/must-change-password?mode=portal&next=${encodeURIComponent(target)}`, { replace: true });
          return;
        }

        navigate(target, { replace: true });
      } catch (error: any) {
        setMessage(error?.message || "Unable to sign in.");
      } finally {
        setBusy(false);
      }
    },
    [email, password, navigate, next],
  );

  return (
    <main className="min-h-screen bg-[#061524] text-[#eef8ff] font-sans flex items-center justify-center px-6 py-10">
      <section className="w-full max-w-[1120px] grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-8 items-stretch">
        <div className="hidden lg:flex rounded-[32px] border border-[#1a3a5c] bg-[#0b2236] p-10 flex-col justify-between overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(246,184,75,0.16),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(78,168,222,0.12),transparent_35%)]" />
          <div className="relative">
            <p className="text-[#f6b84b] text-[12px] font-black uppercase tracking-[0.35em]">Britium Enterprise Portal</p>
            <h1 className="mt-5 text-[42px] leading-tight font-black">
              One pickup ID. One backend workflow. All departments synchronized.
            </h1>
            <p className="mt-5 text-[#9bb7cc] text-[15px] leading-7 max-w-xl">
              Customer Service, Supervisor, Dispatch, Warehouse, Finance, Merchant Portal, and Rider App all operate from shared backend records.
            </p>
          </div>

          <div className="relative grid grid-cols-3 gap-3">
            {["Master Data", "Pickup Workflow", "Rider App"].map((item) => (
              <div key={item} className="rounded-2xl border border-[#1a3a5c] bg-[#061524]/70 p-4">
                <ShieldCheck className="h-5 w-5 text-[#f6b84b]" />
                <p className="mt-3 text-[12px] font-black uppercase tracking-wider text-[#c8dff0]">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={submit} className="rounded-[32px] border border-[#1a3a5c] bg-[#0b2236] p-8 shadow-2xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[#f6b84b] text-[11px] font-black uppercase tracking-[0.35em]">BRITIUM OPS</p>
              <h2 className="mt-3 text-[28px] font-black">Portal Login</h2>
            </div>
            <div className="h-14 w-14 rounded-2xl bg-[#061524] border border-[#1a3a5c] flex items-center justify-center">
              <Lock className="h-6 w-6 text-[#f6b84b]" />
            </div>
          </div>

          {message ? (
            <div className="mt-6 rounded-2xl border border-[#ff4d8d]/50 bg-[#ff4d8d]/10 px-4 py-3 text-[13px] font-bold text-[#ff8fbd]">
              {message}
            </div>
          ) : null}

          <label className="mt-8 block">
            <span className="mb-2 block text-[11px] font-black uppercase tracking-widest text-[#4d7a9b]">Work Email</span>
            <div className="flex h-14 items-center gap-3 rounded-2xl border border-[#1a3a5c] bg-[#061524] px-4 focus-within:border-[#f6b84b]">
              <Mail className="h-5 w-5 text-[#4d7a9b]" />
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="username"
                placeholder="name@britiumexpress.com"
                className="h-full flex-1 bg-transparent text-[13px] font-bold outline-none placeholder:text-[#4d7a9b]"
              />
            </div>
          </label>

          <label className="mt-5 block">
            <span className="mb-2 block text-[11px] font-black uppercase tracking-widest text-[#4d7a9b]">Password</span>
            <div className="flex h-14 items-center gap-3 rounded-2xl border border-[#1a3a5c] bg-[#061524] px-4 focus-within:border-[#f6b84b]">
              <Lock className="h-5 w-5 text-[#4d7a9b]" />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter password"
                className="h-full flex-1 bg-transparent text-[13px] font-bold outline-none placeholder:text-[#4d7a9b]"
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="text-[#4d7a9b] hover:text-[#f6b84b]">
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </label>

          <div className="mt-4 flex items-center justify-between gap-3 text-[12px] font-bold">
            <Link to="/forgot-password?mode=portal" className="text-[#4ea8de] hover:text-[#f6b84b]">
              Forgot password?
            </Link>
            <Link to="/signup?mode=portal" className="text-[#4ea8de] hover:text-[#f6b84b]">
              Create account
            </Link>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="mt-8 inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#f6b84b] px-5 font-black text-[#061524] hover:bg-[#e5a93a] disabled:opacity-60"
          >
            {busy && <Loader2 className="h-5 w-5 animate-spin" />}
            Sign In
          </button>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              to="/rider-login"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#1a3a5c] bg-[#061524] text-[12px] font-black uppercase tracking-wider text-[#c8dff0] hover:border-[#4ea8de]"
            >
              <Smartphone className="h-4 w-4 text-[#4ea8de]" />
              Rider Login
            </Link>
            <a
              href={apkHref}
              download
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#1a3a5c] bg-[#061524] text-[12px] font-black uppercase tracking-wider text-[#c8dff0] hover:border-[#f6b84b]"
            >
              <Download className="h-4 w-4 text-[#f6b84b]" />
              Rider APK
            </a>
          </div>
        </form>
      </section>
    </main>
  );
}
