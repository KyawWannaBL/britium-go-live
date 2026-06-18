// ═══════════════════════════════════════════════════════════════
// BRITIUM EXPRESS — ENTERPRISE PORTAL DESIGN SYSTEM v2026
// Typography: Poppins (body) + Helvetica Neue (subheadings)
// Google Font: Poppins loaded in index.html
// ═══════════════════════════════════════════════════════════════

/* ── Color Palette ─────────────────────────────────────────── */
export const C = {
  bg:        '#061524',
  panel:     '#0b2236',
  panel2:    '#081b2e',
  panelHover:'#0f2a42',
  header:    '#040e1a',
  border:    '#1a3a5c',
  border2:   '#0f2540',
  gold:      '#f6b84b',
  goldLight: '#fef3c7',
  goldDark:  '#d97706',
  orange:    '#ff8a4c',
  text:      '#eef8ff',
  text2:     '#c8dff0',
  muted:     '#4d7a9b',
  success:   '#22c55e',
  successBg: '#052e16',
  error:     '#ff4f86',
  errorBg:   '#4a0521',
  warning:   '#f59e0b',
  warningBg: '#451a03',
  info:      '#38bdf8',
  infoBg:    '#082f49',
  white:     '#ffffff',
};

/* ── Font Families ─────────────────────────────────────────── */
export const F = {
  body:    "'Poppins', Inter, system-ui, sans-serif",
  heading: "'Poppins', Inter, system-ui, sans-serif",
  sub:     "'Helvetica Neue', Helvetica, Arial, sans-serif",
  mono:    "'Courier New', monospace",
};

/* ── Typography Scale ──────────────────────────────────────── */
// Heading: 20px Poppins 700 UPPERCASE
// Subheading: 18px Helvetica Neue 600
// Body/paragraph: 14px Poppins 400-500
// Label: 11px Poppins 700 UPPERCASE

export const T = {
  heading: {
    fontFamily: F.heading,
    fontSize: '20px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: C.text,
  },
  subheading: {
    fontFamily: F.sub,
    fontSize: '18px',
    fontWeight: 600,
    color: C.text2,
  },
  body: {
    fontFamily: F.body,
    fontSize: '14px',
    fontWeight: 400,
    color: C.text2,
  },
  bodyMedium: {
    fontFamily: F.body,
    fontSize: '14px',
    fontWeight: 500,
    color: C.text2,
  },
  bodySemibold: {
    fontFamily: F.body,
    fontSize: '14px',
    fontWeight: 600,
    color: C.text,
  },
  label: {
    fontFamily: F.body,
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: C.muted,
  },
  small: {
    fontFamily: F.body,
    fontSize: '12px',
    fontWeight: 500,
    color: C.muted,
  },
  value: {
    fontFamily: F.heading,
    fontSize: '24px',
    fontWeight: 700,
    color: C.gold,
  },
  valueSmall: {
    fontFamily: F.heading,
    fontSize: '20px',
    fontWeight: 700,
    color: C.gold,
  },
};

/* ── Shared Style Objects (React CSSProperties) ────────────── */

// Page wrapper — renders inside AppShell <main>
export const pageWrap: React.CSSProperties = {
  padding: '24px',
  minHeight: '100%',
  background: C.bg,
  fontFamily: F.body,
};

// Standard page heading row
export const pageTitle: React.CSSProperties = {
  ...T.heading,
  color: C.gold,
  margin: 0,
  lineHeight: 1.2,
};

export const pageSub: React.CSSProperties = {
  ...T.body,
  color: C.muted,
  marginTop: 4,
  marginBottom: 0,
};

// Card / panel
export const card: React.CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: '12px',
  padding: '20px',
};

export const cardTitle: React.CSSProperties = {
  ...T.subheading,
  color: C.text,
  margin: 0,
  marginBottom: '16px',
};

// KPI card
export const kpiCard: React.CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: '12px',
  padding: '18px 20px',
};

// Input / select
export const input: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: C.header,
  border: `1px solid ${C.border}`,
  borderRadius: '8px',
  color: C.text,
  fontSize: '14px',
  fontFamily: F.body,
  fontWeight: 400,
  outline: 'none',
};

// Buttons
export const btn = {
  primary: {
    padding: '9px 18px',
    background: C.gold,
    color: '#1a0a00',
    border: 'none',
    borderRadius: '8px',
    fontFamily: F.body,
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,
  secondary: {
    padding: '9px 18px',
    background: 'transparent',
    color: C.text2,
    border: `1px solid ${C.border}`,
    borderRadius: '8px',
    fontFamily: F.body,
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,
  danger: {
    padding: '9px 18px',
    background: C.error,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: F.body,
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,
  success: {
    padding: '9px 18px',
    background: C.success,
    color: '#052e16',
    border: 'none',
    borderRadius: '8px',
    fontFamily: F.body,
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,
  icon: {
    padding: '8px',
    background: C.border,
    color: C.text2,
    border: `1px solid ${C.border}`,
    borderRadius: '8px',
    fontFamily: F.body,
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,
};

// Table
export const tbl = {
  wrapper: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontFamily: F.body,
  } as React.CSSProperties,
  th: {
    padding: '10px 14px',
    background: C.header,
    color: C.muted,
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: F.body,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    textAlign: 'left' as const,
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  td: {
    padding: '11px 14px',
    fontSize: '13.5px',
    fontFamily: F.body,
    fontWeight: 400,
    color: C.text2,
    borderBottom: `1px solid ${C.border2}`,
  } as React.CSSProperties,
  tdNum: {
    padding: '11px 14px',
    fontSize: '13.5px',
    fontFamily: F.body,
    fontWeight: 600,
    color: C.text,
    textAlign: 'right' as const,
    borderBottom: `1px solid ${C.border2}`,
  } as React.CSSProperties,
};

// Badge / pill
export const badge = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 10px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: F.body,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  success: { background: '#052e16', color: '#22c55e', border: '1px solid #166534' } as React.CSSProperties,
  error:   { background: '#4a0521', color: '#ff4f86', border: '1px solid #831843' } as React.CSSProperties,
  warning: { background: '#451a03', color: '#f59e0b', border: '1px solid #92400e' } as React.CSSProperties,
  info:    { background: '#082f49', color: '#38bdf8', border: '1px solid #0c4a6e' } as React.CSSProperties,
  gold:    { background: '#451a03', color: '#f6b84b', border: '1px solid #92400e' } as React.CSSProperties,
  muted:   { background: C.panel2, color: C.muted,   border: `1px solid ${C.border}` } as React.CSSProperties,
};

// Status badge helper
export type StatusKey = 'active'|'inactive'|'completed'|'pending'|'failed'|'partial'|'processing'|'delivered'|'returned';
export function statusBadge(s: StatusKey): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    active:     { ...badge.base, ...badge.success },
    completed:  { ...badge.base, ...badge.success },
    delivered:  { ...badge.base, ...badge.success },
    pending:    { ...badge.base, ...badge.warning },
    processing: { ...badge.base, ...badge.info },
    partial:    { ...badge.base, ...badge.gold },
    failed:     { ...badge.base, ...badge.error },
    returned:   { ...badge.base, ...badge.error },
    inactive:   { ...badge.base, ...badge.muted },
  };
  return map[s] ?? { ...badge.base, ...badge.muted };
}

// Divider
export const divider: React.CSSProperties = {
  borderTop: `1px solid ${C.border}`,
  margin: '16px 0',
};

// Grid helpers
export const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' };
export const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' };
export const grid4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px' };

// Row: flex horizontal
export const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '12px' };
export const rowBetween: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' };

// Loading spinner
export const spinner: React.CSSProperties = {
  width: 32, height: 32,
  border: `3px solid ${C.border}`,
  borderTopColor: C.gold,
  borderRadius: '50%',
  animation: 'spin 0.7s linear infinite',
};

// Empty state
export const empty: React.CSSProperties = {
  padding: '48px 24px',
  textAlign: 'center',
  color: C.muted,
  fontFamily: F.body,
  fontSize: '14px',
};

// Global CSS string injected via <style>
export const GLOBAL_CSS = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  * { box-sizing: border-box; }
  body { font-family: 'Poppins', Inter, system-ui, sans-serif; background: #061524; }
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: #f6b84b !important;
    box-shadow: 0 0 0 3px rgba(246,184,75,0.12) !important;
  }
  input::placeholder, textarea::placeholder { color: #4d7a9b; font-family: 'Poppins', sans-serif; }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1a3a5c; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #4d7a9b; }
  table { border-collapse: collapse; }
  a { text-decoration: none; }
`;
