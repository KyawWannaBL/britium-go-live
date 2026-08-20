import { useEffect } from 'react';

export const APP_ENVIRONMENT = String(import.meta.env.VITE_APP_ENVIRONMENT || 'PRODUCTION').toUpperCase();
export const IS_PRODUCTION = APP_ENVIRONMENT === 'PRODUCTION';

function isProductionHostname(hostname: string) {
  const host = hostname.toLowerCase();
  return host === 'britiumexpress.com'
    || host === 'www.britiumexpress.com'
    || host === 'britium-go-live.vercel.app'
    || host === 'britium-go-live-britium-ventures-website.vercel.app'
    || (host.startsWith('britium-go-live-') && host.endsWith('.vercel.app'));
}

export default function EnvironmentBadge() {
  const hostname = typeof window === 'undefined' ? '' : window.location.hostname;
  const production = IS_PRODUCTION || isProductionHostname(hostname);
  const environment = production ? 'PRODUCTION' : APP_ENVIRONMENT;
  const appName = String(import.meta.env.VITE_APP_NAME || 'Britium Express Enterprise Portal');

  useEffect(() => {
    document.title = production ? appName : `[${environment}] ${appName}`;
    document.documentElement.dataset.appEnv = environment.toLowerCase();
    document.documentElement.dataset.appEnvLabel = environment;
  }, [appName, environment, production]);

  if (production) return null;

  return (
    <div
      aria-label={`${environment} environment`}
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        zIndex: 999998,
        padding: '6px 12px',
        borderRadius: 10,
        background: 'rgba(56,189,248,.16)',
        color: '#8fd3ff',
        border: '1px solid rgba(56,189,248,.45)',
        fontWeight: 900,
        fontSize: 11,
        fontFamily: 'Poppins, Inter, system-ui, sans-serif',
        pointerEvents: 'none',
        backdropFilter: 'blur(8px)',
      }}
    >
      {environment} · {appName}
    </div>
  );
}
