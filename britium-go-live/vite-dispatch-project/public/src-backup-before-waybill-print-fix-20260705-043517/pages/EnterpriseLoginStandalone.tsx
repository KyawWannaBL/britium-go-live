// @ts-nocheck
import React, { useState } from "react";
import { supabase } from "../integrations/supabase/client";

const css: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 24,
    background:
      "radial-gradient(circle at top left, rgba(250,204,21,.18), transparent 34%), linear-gradient(135deg,#020617,#071426 55%,#0b1120)",
    color: "#f8fafc",
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    width: "min(480px,100%)",
    borderRadius: 28,
    border: "1px solid rgba(250,204,21,.35)",
    background: "rgba(8,20,36,.92)",
    boxShadow: "0 32px 90px rgba(0,0,0,.45)",
    padding: 30,
  },
  logo: {
    width: 62,
    height: 62,
    borderRadius: 18,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg,#facc15,#fb923c)",
    color: "#071426",
    fontWeight: 900,
    fontSize: 20,
    marginBottom: 18,
  },
  eyebrow: {
    color: "#fbbf24",
    fontWeight: 900,
    letterSpacing: 2.5,
    fontSize: 12,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: 900,
    margin: 0,
  },
  sub: {
    color: "#bae6fd",
    lineHeight: 1.6,
    marginTop: 14,
    marginBottom: 24,
  },
  label: {
    display: "block",
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: 800,
    marginBottom: 8,
  },
  input: {
    width: "100%",
    height: 50,
    boxSizing: "border-box",
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,.35)",
    background: "rgba(15,23,42,.95)",
    color: "#ffffff",
    padding: "0 14px",
    fontSize: 15,
    outline: "none",
    marginBottom: 16,
  },
  button: {
    width: "100%",
    height: 54,
    border: 0,
    borderRadius: 16,
    background: "linear-gradient(135deg,#facc15,#fb923c)",
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer",
    marginTop: 4,
  },
  error: {
    background: "rgba(239,68,68,.15)",
    color: "#fecaca",
    border: "1px solid rgba(239,68,68,.35)",
    padding: "12px 14px",
    borderRadius: 14,
    marginBottom: 16,
    fontWeight: 700,
  },
  ok: {
    background: "rgba(34,197,94,.15)",
    color: "#bbf7d0",
    border: "1px solid rgba(34,197,94,.35)",
    padding: "12px 14px",
    borderRadius: 14,
    marginBottom: 16,
    fontWeight: 700,
  },
  note: {
    color: "#93c5fd",
    fontSize: 13,
    lineHeight: 1.55,
    marginTop: 18,
  },
};

function clearOldStorage() {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {}
}

export default function EnterpriseLoginStandalone() {
  const [email, setEmail] = useState("sai@britiumexpress.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function submit() {
    if (busy) return;

    setBusy(true);
    setErr("");
    setMsg("");

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (!normalizedEmail || !password) {
        throw new Error("Email and password are required.");
      }

      clearOldStorage();

      const { data: authData, error: signError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signError) throw signError;

      const { data: accessData, error: accessError } = await supabase.rpc(
        "be_resolve_user_access_by_email",
        { p_email: normalizedEmail }
      );

      if (accessError) throw accessError;

      if (!accessData?.ok) {
        throw new Error(accessData?.error || "Backend access profile not found for this user.");
      }

      localStorage.setItem("be_user_authenticated", "true");
      localStorage.setItem("be_user_email", normalizedEmail);
      localStorage.setItem("be_login_email", normalizedEmail);
      localStorage.setItem("be_user_role", accessData.role || "");
      localStorage.setItem("be_user_portal", accessData.portal || "");
      localStorage.setItem("be_branch_code", accessData.branch_code || "HQ");
      localStorage.setItem("be_user_access_profile", JSON.stringify(accessData));

      if (authData?.session) {
        localStorage.setItem("be_session_ok", "true");
      }

      setMsg("Login successful. Opening dashboard...");
      window.location.href = "/#/dashboard";
    } catch (error: any) {
      console.error("Enterprise login failed:", error);
      setErr(error?.message || "Login failed.");
      setBusy(false);
    }
  }

  return (
    <main style={css.page}>
      <section style={css.card}>
        <div style={css.logo}>BE</div>
        <div style={css.eyebrow}>Britium Express UAT Portal</div>
        <h1 style={css.title}>Enterprise Login</h1>
        <p style={css.sub}>
          Sign in with your backend-registered email. Role, branch, portal and permissions are resolved from Supabase.
        </p>

        {err ? <div style={css.error}>{err}</div> : null}
        {msg ? <div style={css.ok}>{msg}</div> : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label style={css.label}>Email address</label>
          <input
            style={css.input}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="sai@britiumexpress.com"
          />

          <label style={css.label}>Password</label>
          <input
            style={css.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
          />

          <button type="button" style={css.button} onClick={submit}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p style={css.note}>
          No frontend role selector. Backend controls superadmin, admin, data entry, warehouse, dispatch, finance, merchant and customer access.
        </p>
      </section>
    </main>
  );
}
