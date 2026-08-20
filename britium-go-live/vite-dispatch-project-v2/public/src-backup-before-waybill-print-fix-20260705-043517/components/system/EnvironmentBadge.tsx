import { useEffect } from "react";

declare global {
  interface Window {
    __BRITIUM_ENV__?: {
      env: string;
      label: string;
      badge: string;
      appName: string;
      mode: string;
      buildTime: string;
      host: string;
    };
  }
}

const buildTime = new Date().toISOString();

export default function EnvironmentBadge() {
  const env = String(import.meta.env.VITE_APP_ENV || "production").toLowerCase();
  const label = String(import.meta.env.VITE_APP_ENV_LABEL || "").toUpperCase();
  const badge = String(import.meta.env.VITE_APP_ENV_BADGE || (label ? `${label} ENVIRONMENT` : ""));
  const appName = String(import.meta.env.VITE_APP_NAME || "Britium Express Enterprise Portal");
  const mode = String(import.meta.env.MODE || "production");

  const isProd = env === "production" || env === "prod";
  const showBadge = Boolean(label) && !isProd;

  useEffect(() => {
    window.__BRITIUM_ENV__ = {
      env,
      label,
      badge,
      appName,
      mode,
      buildTime,
      host: window.location.host,
    };

    document.title = showBadge ? `[${label}] ${appName}` : appName;
    document.documentElement.dataset.appEnv = showBadge ? env : "production";
    document.documentElement.dataset.appEnvLabel = showBadge ? label : "PROD";

    console.info("[Britium Environment]", window.__BRITIUM_ENV__);
  }, [appName, badge, env, label, mode, showBadge]);

  if (!showBadge) return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 8,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 999999,
          padding: "6px 16px",
          borderRadius: 999,
          background: "#f59e0b",
          color: "#1b0b05",
          fontWeight: 950,
          fontSize: 12,
          letterSpacing: "0.1em",
          boxShadow: "0 10px 30px rgba(0,0,0,.32)",
          border: "1px solid rgba(255,255,255,.35)",
          fontFamily: "Poppins, Inter, system-ui, sans-serif",
          pointerEvents: "none",
          textTransform: "uppercase",
        }}
      >
        {badge}
      </div>

      <div
        style={{
          position: "fixed",
          right: 12,
          bottom: 12,
          zIndex: 999998,
          padding: "5px 10px",
          borderRadius: 10,
          background: "rgba(245,158,11,.16)",
          color: "#fbbf24",
          border: "1px solid rgba(245,158,11,.45)",
          fontWeight: 900,
          fontSize: 11,
          fontFamily: "Poppins, Inter, system-ui, sans-serif",
          pointerEvents: "none",
          backdropFilter: "blur(8px)",
        }}
      >
        {label} · {appName}
      </div>
    </>
  );
}
