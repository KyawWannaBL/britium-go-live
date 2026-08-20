import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  Globe2,
  LockKeyhole,
  Mail,
  Radar,
  ShieldCheck,
  Sparkles,
  UserRound,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Mode = "login" | "signup" | "forgot";
type Role =
  | "superadmin"
  | "admin"
  | "supervisor"
  | "operations"
  | "data_entry"
  | "finance"
  | "cs"
  | "warehouse"
  | "executive";

const roles: { id: Role; label: string; badge: string }[] = [
  { id: "superadmin", label: "Super Admin", badge: "FULL" },
  { id: "admin", label: "Admin", badge: "OPS" },
  { id: "supervisor", label: "Supervisor", badge: "FIELD" },
  { id: "operations", label: "Operations", badge: "FLOW" },
  { id: "data_entry", label: "Data Entry", badge: "REG" },
  { id: "finance", label: "Finance", badge: "COD" },
  { id: "cs", label: "Customer Service", badge: "CS" },
  { id: "warehouse", label: "Warehouse", badge: "HUB" },
  { id: "executive", label: "Executive", badge: "HQ" },
];

export default function EnterpriseNeoLoginPage() {
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>("login");
  const [role, setRole] = useState<Role>("superadmin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [okMessage, setOkMessage] = useState("");

  const year = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate("/dashboard", { replace: true });
      }
    });
  }, [navigate]);

  function resetStatus() {
    setMessage("");
    setOkMessage("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    resetStatus();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setMessage("Enter your registered email address.");
      return;
    }

    if (mode !== "forgot" && !password.trim()) {
      setMessage("Enter your password.");
      return;
    }

    setBusy(true);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error) throw error;

        localStorage.setItem("be_enterprise_last_role", role);
        localStorage.setItem("be_login_email", remember ? normalizedEmail : "");

        setOkMessage("Access granted. Opening command center...");
        setTimeout(() => navigate("/dashboard", { replace: true }), 500);
        return;
      }

      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: fullName,
              phone,
              role,
              source: "enterprise_neo_login",
            },
          },
        });

        if (error) throw error;

        setOkMessage("Access request submitted. Check email or wait for admin approval.");
        setMode("login");
        return;
      }

      const response = await fetch("/api/password-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, mode: "portal" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = String(result?.error || "");
        throw new Error(code === "rate_limited" ? "Please wait and try again." : code === "invalid_email" ? "Please enter a valid email address." : "Unable to send password reset email.");
      }

      setOkMessage("Password reset link sent to your email.");
      setMode("login");
    } catch (error: any) {
      setMessage(error?.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function resumeSession() {
    resetStatus();
    setBusy(true);

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (!data.session) {
        setMessage("No active secure session found. Sign in with email and password.");
        return;
      }

      navigate("/dashboard", { replace: true });
    } catch (error: any) {
      setMessage(error?.message || "Could not resume session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="be-neo-login">
      <style>{`
        .be-neo-login {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          color: #eef8ff;
          background:
            radial-gradient(circle at 12% 18%, rgba(78,168,222,0.34), transparent 30%),
            radial-gradient(circle at 84% 8%, rgba(246,184,75,0.26), transparent 28%),
            radial-gradient(circle at 74% 82%, rgba(34,211,238,0.15), transparent 34%),
            #061524;
          font-family: Poppins, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .be-neo-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(78,168,222,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(78,168,222,0.08) 1px, transparent 1px);
          background-size: 68px 68px;
          mask-image: radial-gradient(circle at center, black, transparent 72%);
          animation: beGridMove 18s linear infinite;
        }

        .be-orb {
          position: absolute;
          border-radius: 999px;
          filter: blur(2px);
          opacity: 0.9;
          animation: beFloat 7s ease-in-out infinite;
        }

        .be-orb.one {
          width: 190px;
          height: 190px;
          left: 7%;
          top: 18%;
          background: rgba(78,168,222,0.20);
        }

        .be-orb.two {
          width: 240px;
          height: 240px;
          right: 8%;
          bottom: 10%;
          background: rgba(246,184,75,0.16);
          animation-delay: -2.3s;
        }

        .be-orb.three {
          width: 140px;
          height: 140px;
          right: 22%;
          top: 12%;
          background: rgba(52,211,153,0.12);
          animation-delay: -4s;
        }

        .be-wrap {
          position: relative;
          z-index: 2;
          min-height: 100vh;
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(380px, 0.85fr);
          gap: 28px;
          align-items: center;
          width: min(1180px, calc(100% - 36px));
          margin: 0 auto;
          padding: 34px 0;
        }

        .be-hero {
          border: 1px solid rgba(78,168,222,0.22);
          background: linear-gradient(145deg, rgba(11,34,54,0.64), rgba(6,21,36,0.34));
          border-radius: 34px;
          padding: 34px;
          min-height: 620px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 35px 110px rgba(0,0,0,0.34);
          backdrop-filter: blur(18px);
        }

        .be-hero::before {
          content: "";
          position: absolute;
          inset: -1px;
          background: linear-gradient(120deg, transparent, rgba(246,184,75,0.16), transparent);
          transform: translateX(-80%);
          animation: beSweep 6s ease-in-out infinite;
        }

        .be-kicker {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          border: 1px solid rgba(246,184,75,0.36);
          background: rgba(246,184,75,0.10);
          color: #f6b84b;
          padding: 8px 13px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.26em;
          text-transform: uppercase;
        }

        .be-title {
          position: relative;
          margin: 28px 0 16px;
          font-size: clamp(42px, 6vw, 78px);
          line-height: 0.94;
          letter-spacing: -0.06em;
          font-weight: 950;
        }

        .be-gradient-text {
          background: linear-gradient(90deg, #ffffff, #9bdcff, #f6b84b);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .be-subtitle {
          position: relative;
          width: min(720px, 100%);
          color: #9cc2d9;
          font-size: 16px;
          line-height: 1.7;
          margin: 0;
        }

        .be-cards {
          position: relative;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
          margin-top: 34px;
        }

        .be-mini-card {
          border: 1px solid rgba(78,168,222,0.18);
          background: rgba(6,21,36,0.55);
          border-radius: 22px;
          padding: 18px;
          min-height: 138px;
          transform: translateY(0);
          transition: 240ms ease;
        }

        .be-mini-card:hover {
          transform: translateY(-5px);
          border-color: rgba(246,184,75,0.44);
          box-shadow: 0 18px 46px rgba(0,0,0,0.26);
        }

        .be-mini-card h3 {
          margin: 12px 0 6px;
          font-size: 14px;
        }

        .be-mini-card p {
          margin: 0;
          color: #7fa8c2;
          font-size: 12px;
          line-height: 1.55;
        }

        .be-status-strip {
          position: relative;
          margin-top: 28px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .be-chip {
          border: 1px solid rgba(78,168,222,0.24);
          background: rgba(16,43,69,0.62);
          color: #c8dff0;
          padding: 9px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
        }

        .be-card {
          border: 1px solid rgba(78,168,222,0.26);
          background:
            linear-gradient(180deg, rgba(16,43,69,0.88), rgba(11,34,54,0.78)),
            rgba(6,21,36,0.86);
          border-radius: 32px;
          padding: 24px;
          box-shadow: 0 35px 120px rgba(0,0,0,0.48);
          backdrop-filter: blur(20px);
          position: relative;
          overflow: hidden;
        }

        .be-card::after {
          content: "";
          position: absolute;
          width: 220px;
          height: 220px;
          border-radius: 999px;
          right: -90px;
          top: -110px;
          background: rgba(246,184,75,0.14);
          filter: blur(10px);
        }

        .be-card-head {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
        }

        .be-brand-lock {
          width: 52px;
          height: 52px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, #f6b84b, #ffd88a);
          color: #061524;
          box-shadow: 0 16px 34px rgba(246,184,75,0.28);
        }

        .be-tabs {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          background: rgba(6,21,36,0.68);
          border: 1px solid rgba(78,168,222,0.18);
          padding: 6px;
          border-radius: 18px;
          margin-bottom: 18px;
        }

        .be-tab {
          border: 0;
          border-radius: 13px;
          padding: 10px 8px;
          color: #9cc2d9;
          background: transparent;
          cursor: pointer;
          font-weight: 900;
          font-size: 12px;
        }

        .be-tab.active {
          color: #061524;
          background: linear-gradient(135deg, #f6b84b, #ffd88a);
          box-shadow: 0 12px 28px rgba(246,184,75,0.20);
        }

        .be-form {
          position: relative;
          z-index: 1;
          display: grid;
          gap: 13px;
        }

        .be-label {
          color: #9cc2d9;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 7px;
        }

        .be-input-wrap {
          position: relative;
        }

        .be-input-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #6f91aa;
        }

        .be-input {
          width: 100%;
          height: 48px;
          border-radius: 16px;
          border: 1px solid rgba(78,168,222,0.24);
          background: rgba(6,21,36,0.74);
          color: #eef8ff;
          outline: none;
          padding: 0 44px 0 44px;
          font-weight: 700;
          transition: 160ms ease;
        }

        .be-input:focus {
          border-color: rgba(246,184,75,0.70);
          box-shadow: 0 0 0 4px rgba(246,184,75,0.10);
        }

        .be-input::placeholder {
          color: #557c96;
        }

        .be-eye {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          width: 34px;
          height: 34px;
          border-radius: 12px;
          border: 0;
          background: rgba(78,168,222,0.10);
          color: #9cc2d9;
          cursor: pointer;
          display: grid;
          place-items: center;
        }

        .be-role-grid {
          display: none !important;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .be-role {
          min-height: 48px;
          border-radius: 15px;
          border: 1px solid rgba(78,168,222,0.22);
          background: rgba(6,21,36,0.62);
          color: #c8dff0;
          cursor: pointer;
          padding: 8px;
          text-align: left;
          transition: 160ms ease;
        }

        .be-role.active {
          border-color: rgba(246,184,75,0.70);
          background: rgba(246,184,75,0.13);
          color: #f6b84b;
        }

        .be-role strong {
          display: block;
          font-size: 11px;
        }

        .be-role span {
          display: inline-flex;
          margin-top: 4px;
          font-size: 9px;
          color: #7fa8c2;
          letter-spacing: 0.14em;
        }

        .be-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          color: #9cc2d9;
          font-size: 12px;
          font-weight: 700;
        }

        .be-link-btn {
          border: 0;
          background: transparent;
          color: #4ea8de;
          cursor: pointer;
          font-weight: 900;
        }

        .be-submit {
          margin-top: 4px;
          height: 52px;
          border: 0;
          border-radius: 17px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 950;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: #061524;
          background: linear-gradient(135deg, #f6b84b, #ffd88a);
          box-shadow: 0 20px 44px rgba(246,184,75,0.26);
          transition: 180ms ease;
        }

        .be-submit:hover {
          transform: translateY(-2px);
          box-shadow: 0 24px 55px rgba(246,184,75,0.34);
        }

        .be-submit:disabled {
          opacity: 0.68;
          cursor: not-allowed;
          transform: none;
        }

        .be-secondary {
          height: 46px;
          border-radius: 15px;
          border: 1px solid rgba(78,168,222,0.24);
          background: rgba(78,168,222,0.08);
          color: #c8dff0;
          cursor: pointer;
          font-weight: 900;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
        }

        .be-error,
        .be-success {
          border-radius: 15px;
          padding: 12px 13px;
          font-size: 12px;
          font-weight: 800;
        }

        .be-error {
          border: 1px solid rgba(248,113,113,0.42);
          background: rgba(248,113,113,0.12);
          color: #ff8aa3;
        }

        .be-success {
          border: 1px solid rgba(52,211,153,0.38);
          background: rgba(52,211,153,0.11);
          color: #6ee7b7;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .be-footer {
          margin-top: 16px;
          color: #6f91aa;
          font-size: 11px;
          line-height: 1.6;
          text-align: center;
        }

        .be-spin {
          animation: beSpin 1s linear infinite;
        }

        @keyframes beFloat {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(0, -18px, 0) scale(1.04); }
        }

        @keyframes beGridMove {
          from { transform: translateY(0); }
          to { transform: translateY(68px); }
        }

        @keyframes beSweep {
          0%, 100% { transform: translateX(-90%); opacity: 0; }
          45%, 55% { opacity: 1; }
          100% { transform: translateX(90%); opacity: 0; }
        }

        @keyframes beSpin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 980px) {
          .be-wrap {
            grid-template-columns: 1fr;
            padding: 22px 0;
          }

          .be-hero {
            min-height: auto;
          }

          .be-title {
            font-size: 46px;
          }
        }

        @media (max-width: 640px) {
          .be-wrap {
            width: min(100% - 22px, 520px);
          }

          .be-hero {
            padding: 22px;
            border-radius: 26px;
          }

          .be-cards {
            grid-template-columns: 1fr;
          }

          .be-role-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .be-card {
            border-radius: 26px;
            padding: 18px;
          }
        }
      `}</style>

      <div className="be-neo-grid" />
      <div className="be-orb one" />
      <div className="be-orb two" />
      <div className="be-orb three" />

      <section className="be-wrap">
        <div className="be-hero">
          <div className="be-kicker">
            <Sparkles size={15} />
            BRITIUM ENTERPRISE
          </div>

          <h1 className="be-title">
            Intelligent logistics
            <br />
            <span className="be-gradient-text">command center.</span>
          </h1>

          <p className="be-subtitle">
            Secure access for pickup control, supervisor assignment, rider verification,
            dispatch, data entry registration, COD, finance, and executive operations.
          </p>

          <div className="be-cards">
            <div className="be-mini-card">
              <Radar color="#4ea8de" size={24} />
              <h3>Live workflow sync</h3>
              <p>Portal, rider app, notifications, and cargo events stay connected through Supabase.</p>
            </div>

            <div className="be-mini-card">
              <ShieldCheck color="#34d399" size={24} />
              <h3>Secure operations</h3>
              <p>Backend role and permission access is managed from Supabase user registry.</p>
              <p>Enterprise authentication with protected dashboard, role context, and session control.</p>
            </div>

            <div className="be-mini-card">
              <Zap color="#f6b84b" size={24} />
              <h3>Go-live ready</h3>
              <p>Built for UAT speed: dispatch, proof queue, pickup data entry, and supervisor flow.</p>
            </div>
          </div>

          <div className="be-status-strip">
            <span className="be-chip">Backend-first workflow</span>
            <span className="be-chip">Rider proof bridge</span>
            <span className="be-chip">Dispatch command</span>
            <span className="be-chip">Data entry queue</span>
          </div>
        </div>

        <div className="be-card">
          <div className="be-card-head">
            <div>
              <div style={{ color: "#f6b84b", fontSize: 12, fontWeight: 900, letterSpacing: "0.22em" }}>
                SECURE ACCESS
              </div>
              <h2 style={{ margin: "6px 0 0", fontSize: 26, lineHeight: 1 }}>
                {mode === "login" ? "Sign in" : mode === "signup" ? "Request access" : "Recover password"}
              </h2>
            </div>

            <div className="be-brand-lock">
              <LockKeyhole size={24} />
            </div>
          </div>

          <div className="be-tabs">
            <button
              type="button"
              className={`be-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => {
                setMode("login");
                resetStatus();
              }}
            >
              Login
            </button>

            <button
              type="button"
              className={`be-tab ${mode === "signup" ? "active" : ""}`}
              onClick={() => {
                setMode("signup");
                resetStatus();
              }}
            >
              Access
            </button>

            <button
              type="button"
              className={`be-tab ${mode === "forgot" ? "active" : ""}`}
              onClick={() => {
                setMode("forgot");
                resetStatus();
              }}
            >
              Reset
            </button>
          </div>

          {message && <div className="be-error">{message}</div>}
          {okMessage && (
            <div className="be-success">
              <CheckCircle2 size={16} />
              {okMessage}
            </div>
          )}

          <form className="be-form" onSubmit={handleSubmit} style={{ marginTop: message || okMessage ? 13 : 0 }}>
            {mode !== "forgot" && (
              <div>
                <div className="be-label">Workspace role</div>
                <div className="be-role-grid">
                  {roles.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`be-role ${role === item.id ? "active" : ""}`}
                      onClick={() => setRole(item.id)}
                    >
                      <strong>{item.label}</strong>
                      <span>{item.badge}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === "signup" && (
              <>
                <div>
                  <div className="be-label">Full name</div>
                  <div className="be-input-wrap">
                    <UserRound className="be-input-icon" size={17} />
                    <input
                      className="be-input"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Kyaw Wanna"
                    />
                  </div>
                </div>

                <div>
                  <div className="be-label">Phone</div>
                  <div className="be-input-wrap">
                    <Globe2 className="be-input-icon" size={17} />
                    <input
                      className="be-input"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="09..."
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <div className="be-label">Email address</div>
              <div className="be-input-wrap">
                <Mail className="be-input-icon" size={17} />
                <input
                  className="be-input"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@britiumexpress.com"
                  autoComplete="email"
                />
              </div>
            </div>

            {mode !== "forgot" && (
              <div>
                <div className="be-label">Password</div>
                <div className="be-input-wrap">
                  <LockKeyhole className="be-input-icon" size={17} />
                  <input
                    className="be-input"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                  />
                  <button
                    type="button"
                    className="be-eye"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label="Toggle password"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            {mode === "login" && (
              <div className="be-row">
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                  />
                  Remember workspace
                </label>

                <button
                  type="button"
                  className="be-link-btn"
                  onClick={() => {
                    setMode("forgot");
                    resetStatus();
                  }}
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button className="be-submit" type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Sparkles className="be-spin" size={18} />
                  Processing
                </>
              ) : (
                <>
                  {mode === "login" ? "Enter Command Center" : mode === "signup" ? "Submit Access Request" : "Send Reset Link"}
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            {mode === "login" && (
              <button className="be-secondary" type="button" onClick={resumeSession} disabled={busy}>
                <Fingerprint size={18} />
                Resume secure session
              </button>
            )}
          </form>

          <div className="be-footer">
            © {year} Britium Ventures Co., Ltd · Enterprise UAT · Authorized personnel only
          </div>
        </div>
      </section>
    </main>
  );
}
