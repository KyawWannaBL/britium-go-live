import { FormEvent, useCallback, useState } from "react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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
      const redirectTo = `${window.location.origin}/login`;
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      });

      if (error) throw error;

      setMessage("Password reset email sent. Please check your inbox.");
    } catch (error: any) {
      setMessage(error?.message || "Unable to send password reset email.");
    } finally {
      setBusy(false);
    }
  }, [email]);

  return (
    <main className="min-h-screen bg-background px-6 py-10 font-sans text-foreground">
      <section className="mx-auto flex min-h-[calc(100vh-80px)] max-w-xl items-center justify-center">
        <form onSubmit={submit} className="w-full rounded-[32px] border border-border bg-card/80 p-8 shadow-2xl backdrop-blur-md">
          <Link to="/login" className="inline-flex items-center gap-2 text-sm font-black text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>

          <p className="mt-8 text-xs font-black uppercase tracking-[0.35em] text-primary">Account recovery</p>
          <h1 className="mt-3 text-3xl font-black">Forgot password</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-muted-foreground">
            Enter your BRITIUM work email and we will send a secure password reset link.
          </p>

          {message && (
            <div className="mt-6 rounded-2xl border border-border bg-background/70 p-4 text-sm font-bold">
              {message}
            </div>
          )}

          <label className="mt-8 block">
            <span className="mb-2 block text-sm font-black">Work Email</span>
            <div className="flex h-14 items-center gap-3 rounded-2xl border border-border bg-background/70 px-4 focus-within:border-primary">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="username"
                placeholder="name@britiumexpress.com"
                className="h-full flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-muted-foreground"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={busy}
            className="mt-8 inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 font-black text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-5 w-5 animate-spin" />}
            Send reset link
          </button>
        </form>
      </section>
    </main>
  );
}
