import { FormEvent, useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Download, Eye, EyeOff, Loader2, Lock, Mail, Smartphone, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

async function readWorkforceAccount(user: any) {
  if (!user?.id && !user?.email) return null;

  try {
    const filters = [`auth_user_id.eq.${user.id}`];
    if (user.email) filters.push(`email.eq.${user.email}`);

    const { data, error } = await (supabase as any)
      .from("be_mobile_workforce_accounts")
      .select("*")
      .or(filters.join(","))
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.warn("Workforce account lookup failed:", error);
    return null;
  }
}

function getWorkforceRole(user: any, workforce: any) {
  return String(
    workforce?.workforce_role ||
      workforce?.role ||
      workforce?.employment_role ||
      user?.user_metadata?.role ||
      user?.app_metadata?.role ||
      "",
  ).toLowerCase();
}

function needsPasswordChange(user: any, workforce: any) {
  return Boolean(
    workforce?.must_change_password ||
      workforce?.force_password_change ||
      workforce?.password_change_required ||
      user?.user_metadata?.must_change_password ||
      user?.app_metadata?.must_change_password,
  );
}

export default function RiderLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next") || "/rider-dashboard";
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
        const workforce = await readWorkforceAccount(user);
        const role = getWorkforceRole(user, workforce);

        if (role && !["rider", "driver", "helper"].includes(role)) {
          await supabase.auth.signOut();
          setMessage("This login is only for Rider / Driver / Helper accounts.");
          return;
        }

        if (needsPasswordChange(user, workforce)) {
          navigate(`/must-change-password?mode=rider&next=${encodeURIComponent(next)}`, { replace: true });
          return;
        }

        navigate(next, { replace: true });
      } catch (error: any) {
        setMessage(error?.message || "Unable to sign in.");
      } finally {
        setBusy(false);
      }
    },
    [email, password, navigate, next],
  );

  return (
    <main className="min-h-screen bg-[#061524] text-[#eef8ff] font-sans flex items-center justify-center px-5 py-8">
      <form onSubmit={submit} className="w-full max-w-[430px] rounded-[32px] border border-[#1a3a5c] bg-[#0b2236] p-7 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 rounded-3xl bg-[#061524] border border-[#1a3a5c] flex items-center justify-center">
            <Truck className="h-7 w-7 text-[#f6b84b]" />
          </div>
          <p className="mt-5 text-[#f6b84b] text-[11px] font-black uppercase tracking-[0.35em]">BRITIUM MOBILE</p>
          <h1 className="mt-3 text-[28px] font-black">Rider App Login</h1>
          <p className="mt-2 text-[13px] font-semibold text-[#9bb7cc]">
            Rider, Driver, and Helper accounts use the same backend workforce master.
          </p>
        </div>

        {message ? (
          <div className="mt-6 rounded-2xl border border-[#ff4d8d]/50 bg-[#ff4d8d]/10 px-4 py-3 text-[13px] font-bold text-[#ff8fbd]">
            {message}
          </div>
        ) : null}

        <label className="mt-7 block">
          <span className="mb-2 block text-[11px] font-black uppercase tracking-widest text-[#4d7a9b]">Email</span>
          <div className="flex h-14 items-center gap-3 rounded-2xl border border-[#1a3a5c] bg-[#061524] px-4 focus-within:border-[#f6b84b]">
            <Mail className="h-5 w-5 text-[#4d7a9b]" />
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="username"
              placeholder="rider_ygn_0001@britiumventures.com"
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
          <Link to="/forgot-password?mode=rider" className="text-[#4ea8de] hover:text-[#f6b84b]">
            Forgot password?
          </Link>
          <Link to="/signup?mode=rider&role=rider" className="text-[#4ea8de] hover:text-[#f6b84b]">
            Sign up
          </Link>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-8 inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#f6b84b] px-5 font-black text-[#061524] hover:bg-[#e5a93a] disabled:opacity-60"
        >
          {busy && <Loader2 className="h-5 w-5 animate-spin" />}
          Open Rider App
        </button>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            to="/login"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#1a3a5c] bg-[#061524] text-[12px] font-black uppercase tracking-wider text-[#c8dff0] hover:border-[#4ea8de]"
          >
            <Smartphone className="h-4 w-4 text-[#4ea8de]" />
            Portal Login
          </Link>
          <a
            href={apkHref}
            download
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#1a3a5c] bg-[#061524] text-[12px] font-black uppercase tracking-wider text-[#c8dff0] hover:border-[#f6b84b]"
          >
            <Download className="h-4 w-4 text-[#f6b84b]" />
            Download APK
          </a>
        </div>
      </form>
    </main>
  );
}
