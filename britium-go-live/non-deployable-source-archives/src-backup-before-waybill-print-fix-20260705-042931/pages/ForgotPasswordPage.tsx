import { FormEvent, useCallback, useMemo, useState } from "react";
import { ArrowLeft, Download, Loader2, Mail } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") === "rider" ? "rider" : "portal";
  const loginPath = mode === "rider" ? "/rider-login" : "/login";
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const apkHref = useMemo(() => "/downloads/britium-rider-app.apk", []);

  const submit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setMessage("Please enter your account email.");
      return;
    }

    setBusy(true);

    try {
      const next = mode === "rider" ? "/rider-dashboard" : "/dashboard";
      const redirectTo = `${window.location.origin}/must-change-password?mode=${mode}&next=${encodeURIComponent(next)}`;

      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      });

      if (error) throw error;

      setMessage("Password reset email sent. Please check your inbox and open the reset link.");
    } catch (error: any) {
      setMessage(error?.message || "Unable to send password reset email.");
    } finally {
      setBusy(false);
    }
  }, [email, mode]);

  return (
    <main className="min-h-screen bg-[#061524] px-6 py-10 font-sans text-[#eef8ff]">
      <section className="mx-auto flex min-h-[calc(100vh-80px)] max-w-xl items-center justify-center">
        <form onSubmit={submit} className="w-full rounded-[32px] border border-[#1a3a5c] bg-[#0b2236] p-8 shadow-2xl">
          <Link to={loginPath} className="inline-flex items-center gap-2 text-sm font-black text-[#f6b84b] hover:underline">
            <ArrowLeft className="h-4 w-4" />
            Back to {mode === "rider" ? "rider login" : "portal login"}
          </Link>

          <p className="mt-8 text-xs font-black uppercase tracking-[0.35em] text-[#f6b84b]">Account recovery</p>
          <h1 className="mt-3 text-3xl font-black">Forgot password</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-[#9bb7cc]">
            Enter your BRITIUM account email. The reset link opens the secure change-password page.
          </p>

          {message && (
            <div className="mt-6 rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4 text-sm font-bold">
              {message}
            </div>
          )}

          <label className="mt-8 block">
            <span className="mb-2 block text-sm font-black">Account Email</span>
            <div className="flex h-14 items-center gap-3 rounded-2xl border border-[#1a3a5c] bg-[#061524] px-4 focus-within:border-[#f6b84b]">
              <Mail className="h-5 w-5 text-[#4d7a9b]" />
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="username"
                placeholder={mode === "rider" ? "rider_ygn_0001@britiumventures.com" : "name@britiumexpress.com"}
                className="h-full flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-[#4d7a9b]"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={busy}
            className="mt-8 inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#f6b84b] px-5 font-black text-[#061524] hover:bg-[#e5a93a] disabled:opacity-60"
          >
            {busy && <Loader2 className="h-5 w-5 animate-spin" />}
            Send reset link
          </button>

          {mode === "rider" ? (
            <a
              href={apkHref}
              download
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#1a3a5c] bg-[#061524] text-[12px] font-black uppercase tracking-wider text-[#c8dff0] hover:border-[#f6b84b]"
            >
              <Download className="h-4 w-4 text-[#f6b84b]" />
              Download Rider APK
            </a>
          ) : null}
        </form>
      </section>
    </main>
  );
}
