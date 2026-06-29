// ─────────────────────────────────────────────────────────────────────────────
// PortalLayout.tsx — Britium Express Shared Portal Shell
// Sidebar navigation + top bar + main content area
// Usage: <PortalLayout title="Finance" navItems={[...]} onLogout={logout}>
//          <YourPage />
//        </PortalLayout>
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications, useMarkAllRead } from "../hooks/useApi";
import type { Notification } from "../types";

// ── Nav item type ─────────────────────────────────────────────────────────────
export interface NavItem {
  key: string;
  label: string;
  icon: string;
  badge?: number;
}

interface PortalLayoutProps {
  title: string;
  subtitle?: string;
  accentColor?: string;         // CSS color for sidebar header, default #1a56db
  navItems: NavItem[];
  activeKey: string;
  onNav: (key: string) => void;
  children: React.ReactNode;
}

// ── Inline styles (no Tailwind dependency here) ───────────────────────────────
const S = {
  root: {
    display: "flex",
    height: "100vh",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    background: "#f0f4f8",
    color: "#1e293b",
    overflow: "hidden",
  } as React.CSSProperties,

  sidebar: (accent: string, collapsed: boolean): React.CSSProperties => ({
    width: collapsed ? 60 : 240,
    background: "#0f172a",
    display: "flex",
    flexDirection: "column",
    transition: "width 0.2s ease",
    flexShrink: 0,
    zIndex: 10,
    overflow: "hidden",
  }),

  sidebarHeader: (accent: string): React.CSSProperties => ({
    background: accent,
    padding: "16px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    flexShrink: 0,
  }),

  brandText: {
    color: "#fff",
    fontWeight: 900,
    fontSize: 14,
    letterSpacing: "0.5px",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  brandSub: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    marginTop: 2,
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
  },

  navScroll: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "8px 0",
  },

  navItem: (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    cursor: "pointer",
    background: active ? "rgba(255,255,255,0.12)" : "transparent",
    borderLeft: active ? "3px solid #f59e0b" : "3px solid transparent",
    color: active ? "#fff" : "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontWeight: active ? 700 : 400,
    transition: "background 0.15s, color 0.15s",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    userSelect: "none" as const,
  }),

  navIcon: {
    fontSize: 16,
    flexShrink: 0,
    minWidth: 20,
    textAlign: "center" as const,
  },

  badge: {
    background: "#ef4444",
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    padding: "1px 6px",
    borderRadius: 20,
    marginLeft: "auto",
    flexShrink: 0,
  },

  sidebarFooter: {
    borderTop: "1px solid rgba(255,255,255,0.08)",
    padding: "12px 14px",
    flexShrink: 0,
  },

  logoutBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: 0,
    fontFamily: "inherit",
    whiteSpace: "nowrap" as const,
  },

  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
  },

  topbar: {
    background: "#fff",
    borderBottom: "1px solid #e2e8f0",
    padding: "0 24px",
    height: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
    gap: 12,
  },

  topbarLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },

  collapseBtn: {
    background: "none",
    border: "1px solid #e2e8f0",
    borderRadius: 6,
    cursor: "pointer",
    padding: "4px 8px",
    fontSize: 14,
    color: "#64748b",
  },

  topbarTitle: {
    fontWeight: 800,
    fontSize: 15,
    color: "#1e293b",
  },

  topbarRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },

  notifBtn: (hasUnread: boolean): React.CSSProperties => ({
    position: "relative",
    background: "none",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 16,
    color: hasUnread ? "#ef4444" : "#64748b",
  }),

  notifDot: {
    position: "absolute" as const,
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#ef4444",
    border: "2px solid #fff",
  },

  userChip: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: "#1e293b",
  },

  avatar: (accent: string): React.CSSProperties => ({
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: accent,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  }),

  content: {
    flex: 1,
    overflowY: "auto" as const,
    padding: 24,
  },

  // ── Notification panel ──────────────────────────────────────────────────────
  notifPanel: {
    position: "fixed" as const,
    top: 56,
    right: 16,
    width: 340,
    maxHeight: 480,
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
    zIndex: 200,
    overflowY: "auto" as const,
  },

  notifHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid #e2e8f0",
    fontWeight: 700,
    fontSize: 13,
  },

  notifItem: (unread: boolean): React.CSSProperties => ({
    padding: "10px 16px",
    borderBottom: "1px solid #f1f5f9",
    background: unread ? "#eff6ff" : "transparent",
    cursor: "pointer",
  }),

  notifTitle: {
    fontWeight: 600,
    fontSize: 13,
    color: "#1e293b",
  },

  notifBody: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },

  notifTime: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 3,
  },

  markAllBtn: {
    background: "none",
    border: "none",
    color: "#1a56db",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    padding: 0,
  },
};

// ── Relative time formatter ───────────────────────────────────────────────────
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Notification Panel ────────────────────────────────────────────────────────
function NotifPanel({ onClose }: { onClose: () => void }) {
  const { data } = useNotifications();
  const markAll = useMarkAllRead();
  const notifications = (data as unknown as Notification[] | undefined) ?? [];

  return (
    <div style={S.notifPanel} onClick={(e) => e.stopPropagation()}>
      <div style={S.notifHeader}>
        <span>Notifications</span>
        <button
          style={S.markAllBtn}
          onClick={() => markAll.mutate(undefined as unknown as void)}
        >
          Mark all read
        </button>
      </div>
      {notifications.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
          No notifications
        </div>
      ) : (
        notifications.map((n) => (
          <div key={n.id} style={S.notifItem(!n.is_read)}>
            <div style={S.notifTitle}>{n.title}</div>
            <div style={S.notifBody}>{n.body}</div>
            <div style={S.notifTime}>{relTime(n.created_at)}</div>
          </div>
        ))
      )}
      <div style={{ padding: "8px 16px", borderTop: "1px solid #f1f5f9" }}>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── PortalLayout ──────────────────────────────────────────────────────────────
export default function PortalLayout({
  title,
  subtitle,
  accentColor = "#1a56db",
  navItems,
  activeKey,
  onNav,
  children,
}: PortalLayoutProps) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const { data: notifData } = useNotifications();
  const notifications = (notifData as unknown as Notification[] | undefined) ?? [];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const initials = user?.full_name
    ? user.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <div style={S.root} onClick={() => showNotif && setShowNotif(false)}>
      {/* ── Sidebar ── */}
      <aside style={S.sidebar(accentColor, collapsed)}>
        <div style={S.sidebarHeader(accentColor)}>
          {!collapsed && (
            <>
              <div style={S.brandText}>Britium Express</div>
              <div style={S.brandSub}>{title}</div>
            </>
          )}
          {collapsed && <div style={{ color: "#fff", fontSize: 18, textAlign: "center" }}>B</div>}
        </div>

        <nav style={S.navScroll}>
          {navItems.map((item) => (
            <div
              key={item.key}
              style={S.navItem(activeKey === item.key)}
              onClick={() => onNav(item.key)}
            >
              <span style={S.navIcon}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.badge != null && item.badge > 0 && (
                <span style={S.badge}>{item.badge > 99 ? "99+" : item.badge}</span>
              )}
            </div>
          ))}
        </nav>

        <div style={S.sidebarFooter}>
          {!collapsed && user && (
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginBottom: 8 }}>
              {user.full_name} · <em>{user.role.replace("_", " ")}</em>
            </div>
          )}
          <button style={S.logoutBtn} onClick={logout}>
            <span>🚪</span>
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div style={S.main}>
        {/* Top bar */}
        <header style={S.topbar}>
          <div style={S.topbarLeft}>
            <button style={S.collapseBtn} onClick={() => setCollapsed((c) => !c)}>
              {collapsed ? "→" : "←"}
            </button>
            <div>
              <div style={S.topbarTitle}>{title}</div>
              {subtitle && (
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{subtitle}</div>
              )}
            </div>
          </div>

          <div style={S.topbarRight}>
            {/* Notifications button */}
            <button
              style={S.notifBtn(unreadCount > 0)}
              onClick={(e) => {
                e.stopPropagation();
                setShowNotif((v) => !v);
              }}
            >
              🔔
              {unreadCount > 0 && <span style={S.notifDot} />}
            </button>

            {/* User chip */}
            <div style={S.userChip}>
              <div style={S.avatar(accentColor)}>{initials}</div>
              <span>{user?.full_name ?? "User"}</span>
            </div>
          </div>
        </header>

        {/* Notification panel */}
        {showNotif && <NotifPanel onClose={() => setShowNotif(false)} />}

        {/* Page content */}
        <main style={S.content}>{children}</main>
      </div>
    </div>
  );
}

// ── Re-export common UI primitives used by portals ────────────────────────────

// Stat card
export function StatCard({
  label,
  value,
  icon,
  color = "#1a56db",
  sub,
}: {
  label: string;
  value: string | number;
  icon: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: "18px 20px",
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: color + "20",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1e293b", lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// Section card wrapper
export function Card({
  title,
  children,
  action,
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        marginBottom: 20,
      }}
    >
      {title && (
        <div
          style={{
            padding: "12px 18px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>{title}</span>
          {action}
        </div>
      )}
      <div style={{ padding: "0" }}>{children}</div>
    </div>
  );
}

// Status pill
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  // Shipment
  created:          { bg: "#dbeafe", color: "#1e40af" },
  pickup_scheduled: { bg: "#fef3c7", color: "#92400e" },
  picked_up:        { bg: "#d1fae5", color: "#065f46" },
  at_hub:           { bg: "#ede9fe", color: "#5b21b6" },
  in_transit:       { bg: "#dbeafe", color: "#1e40af" },
  out_for_delivery: { bg: "#fef3c7", color: "#92400e" },
  delivered:        { bg: "#d1fae5", color: "#065f46" },
  failed_delivery:  { bg: "#fee2e2", color: "#991b1b" },
  reattempt:        { bg: "#ffedd5", color: "#9a3412" },
  return_pending:   { bg: "#f1f5f9", color: "#475569" },
  returned:         { bg: "#f1f5f9", color: "#475569" },
  cancelled:        { bg: "#f1f5f9", color: "#475569" },
  // Generic
  active:           { bg: "#d1fae5", color: "#065f46" },
  inactive:         { bg: "#f1f5f9", color: "#475569" },
  pending:          { bg: "#fef3c7", color: "#92400e" },
  approved:         { bg: "#d1fae5", color: "#065f46" },
  rejected:         { bg: "#fee2e2", color: "#991b1b" },
  open:             { bg: "#dbeafe", color: "#1e40af" },
  resolved:         { bg: "#d1fae5", color: "#065f46" },
  closed:           { bg: "#f1f5f9", color: "#475569" },
  draft:            { bg: "#f1f5f9", color: "#475569" },
  transferred:      { bg: "#d1fae5", color: "#065f46" },
  suspended:        { bg: "#fee2e2", color: "#991b1b" },
};

export function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase().replace(/ /g, "_");
  const c = STATUS_COLORS[s] ?? { bg: "#f1f5f9", color: "#475569" };
  return (
    <span
      style={{
        display: "inline-block",
        background: c.bg,
        color: c.color,
        padding: "2px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "capitalize",
        whiteSpace: "nowrap",
      }}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

// Generic table
export function DataTable({
  columns,
  rows,
  emptyMsg = "No data",
}: {
  columns: { key: string; label: string; width?: string | number }[];
  rows: Record<string, React.ReactNode>[];
  emptyMsg?: string;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  padding: "10px 14px",
                  textAlign: "left",
                  fontWeight: 700,
                  fontSize: 12,
                  color: "#475569",
                  width: c.width,
                  whiteSpace: "nowrap",
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{ padding: 32, textAlign: "center", color: "#94a3b8", fontSize: 13 }}
              >
                {emptyMsg}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={i}
                style={{
                  borderBottom: "1px solid #f1f5f9",
                  background: i % 2 === 1 ? "#fafbfc" : "transparent",
                }}
              >
                {columns.map((c) => (
                  <td key={c.key} style={{ padding: "9px 14px", verticalAlign: "top" }}>
                    {row[c.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// Inline loading / error helpers
export function LoadingBlock() {
  return (
    <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
      ⏳ Loading…
    </div>
  );
}

export function ErrorBlock({ message }: { message?: string }) {
  return (
    <div
      style={{
        padding: 20,
        background: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: 8,
        color: "#991b1b",
        fontSize: 13,
      }}
    >
      ❌ {message ?? "Something went wrong. Please refresh."}
    </div>
  );
}

// Primary + secondary buttons
export function PrimaryBtn({
  children,
  onClick,
  disabled,
  color = "#1a56db",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#94a3b8" : color,
        color: "#fff",
        border: "none",
        borderRadius: 8,
        padding: "8px 18px",
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

export function GhostBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        color: "#1a56db",
        border: "1px solid #1a56db",
        borderRadius: 8,
        padding: "7px 16px",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

// Text input
export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && (
        <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{label}</label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
          background: "#fff",
        }}
      />
    </div>
  );
}
