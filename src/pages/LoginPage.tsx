// ─────────────────────────────────────────────────────────────────────────────
// LoginPage.tsx — Britium Express Production Login
// Supabase auth → role resolution → portal redirect
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ROLE_PORTALS } from "../lib/config";

export default function LoginPage() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reason param (e.g. session_expired)
  const reason = new URLSearchParams(location.search).get("reason");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError("Email and password are required.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const result = await login(form.email, form.password);
      if (!result.success) {
        setError(result.error ?? "Login failed.");
        return;
      }
      if (result.must_change_password) {
        navigate("/reset-password", { replace: true });
        return;
      }
      const role = result.user?.role ?? "rider";
      const portal = ROLE_PORTALS[role] ?? "/";
      navigate(portal, { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || loading;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoArea}>
          <div style={styles.logoCircle}>
            <span style={styles.logoText}>B</span>
          </div>
          <div>
            <h1 style={styles.brand}>Britium Express</h1>
            <p style={styles.tagline}>Enterprise Platform</p>
          </div>
        </div>

        {/* Session-expired banner */}
        {reason === "session_expired" && (
          <div style={styles.bannerWarn}>
            ⚠️ Your session has expired. Please log in again.
          </div>
        )}

        {/* Error */}
        {error && <div style={styles.bannerError}>❌ {error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Email Address
            <input
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              style={styles.input}
              placeholder="you@britiumexpress.com"
              disabled={busy}
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              style={styles.input}
              placeholder="••••••••"
              disabled={busy}
            />
          </label>

          <button type="submit" style={busy ? styles.btnDisabled : styles.btn} disabled={busy}>
            {busy ? "Signing in…" : "Sign In →"}
          </button>
        </form>

        <div style={styles.footer}>
          <a href="/reset-password" style={styles.link}>
            Forgot password?
          </a>
          <span style={styles.sep}>|</span>
          <span style={styles.version}>v{__APP_VERSION__}</span>
        </div>
      </div>
    </div>
  );
}

declare const __APP_VERSION__: string;

// ── Inline styles (no build dependency) ───────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #1a56db 100%)",
    fontFamily: "'Segoe UI', sans-serif",
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: "40px 40px 28px",
    width: "100%",
    maxWidth: 420,
    boxShadow: "0 24px 64px rgba(0,0,0,.35)",
  },
  logoArea: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 28,
  },
  logoCircle: {
    width: 52,
    height: 52,
    borderRadius: 14,
    background: "linear-gradient(135deg, #1e3a8a, #1a56db)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  logoText: {
    color: "#fff",
    fontWeight: 900,
    fontSize: 26,
  },
  brand: {
    fontSize: 20,
    fontWeight: 800,
    color: "#0f172a",
    margin: 0,
  },
  tagline: {
    fontSize: 12,
    color: "#64748b",
    margin: "2px 0 0",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  bannerWarn: {
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    color: "#92400e",
    marginBottom: 16,
  },
  bannerError: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    color: "#991b1b",
    marginBottom: 16,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  input: {
    border: "1.5px solid #d1d5db",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 14,
    outline: "none",
    transition: "border-color .15s",
    fontFamily: "inherit",
  },
  btn: {
    marginTop: 8,
    background: "linear-gradient(90deg, #1e3a8a, #1a56db)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "13px 24px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: ".02em",
    transition: "opacity .15s",
  },
  btnDisabled: {
    marginTop: 8,
    background: "#94a3b8",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "13px 24px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "not-allowed",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
    fontSize: 12,
    color: "#94a3b8",
  },
  link: {
    color: "#1a56db",
    textDecoration: "none",
    fontSize: 12,
  },
  sep: { color: "#cbd5e1" },
  version: { color: "#cbd5e1" },
};
