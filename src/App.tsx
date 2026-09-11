// ─────────────────────────────────────────────────────────────────────────────
// App.tsx — Britium Express Production Router  (full, updated)
// Role-protected routes · auth guard · query client · error boundary
// ─────────────────────────────────────────────────────────────────────────────
import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";

// ── Lazy-load portals (code-split per role) ───────────────────────────────────
const LoginPage          = React.lazy(() => import("./pages/LoginPage"));
const WarehousePortal    = React.lazy(() => import("./pages/WarehousePortal"));
const FinancePortal      = React.lazy(() => import("./pages/FinancePortal"));
const AdminHRPortal      = React.lazy(() => import("./pages/AdminHRPortal"));
const MarketingPortal    = React.lazy(() => import("./pages/MarketingPortal"));
const SupervisorPortal   = React.lazy(() => import("./pages/SupervisorPortal"));
const DataEntryPortal    = React.lazy(() => import("./pages/DataEntryPortal"));
const CSPortal           = React.lazy(() => import("./pages/CustomerServicePortal"));
const MerchantPortal     = React.lazy(() => import("./pages/MerchantPortal"));
const SuperAdminPortal   = React.lazy(() => import("./pages/SuperAdminPortal"));
const BranchOfficePortal = React.lazy(() => import("./pages/BranchOfficePortal"));
const CustomerPortal     = React.lazy(() => import("./pages/CustomerPortal"));
const RiderPortal        = React.lazy(() => import("./pages/RiderPortal"));

// ── Query Client ──────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

// ── Full-screen spinner ───────────────────────────────────────────────────────
function PageSpinner() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#f0f4f8",
        color: "#94a3b8",
        fontSize: 14,
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 32 }}>📦</div>
      <div>Loading Britium Express…</div>
    </div>
  );
}

// ── Auth Guard ────────────────────────────────────────────────────────────────
function RequireAuth({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: string[];
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }
  return <>{children}</>;
}

// ── Root redirect: send user to their role portal ────────────────────────────
function RootRedirect() {
  const { user, loading, portalRoute } = useAuth();
  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={portalRoute} replace />;
}

// ── Unauthorized page ─────────────────────────────────────────────────────────
function UnauthorizedPage() {
  const { logout } = useAuth();
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        gap: 16,
        background: "#f8fafc",
      }}
    >
      <div style={{ fontSize: 52 }}>🚫</div>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "#1e293b" }}>
        Access Denied
      </h1>
      <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
        You don't have permission to view this page.
      </p>
      <button
        onClick={logout}
        style={{
          background: "#1e3a8a",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "10px 24px",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: 13,
          fontFamily: "inherit",
        }}
      >
        Sign Out
      </button>
    </div>
  );
}

// ── 404 page ──────────────────────────────────────────────────────────────────
function NotFoundPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        gap: 12,
        background: "#f8fafc",
      }}
    >
      <div style={{ fontSize: 52 }}>🔍</div>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "#1e293b" }}>
        404 — Page Not Found
      </h1>
      <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
        The page you're looking for doesn't exist.
      </p>
      <a
        href="/"
        style={{
          color: "#1a56db",
          fontSize: 14,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        ← Back to Home
      </a>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<PageSpinner />}>
              <Routes>
                {/* ── Public ── */}
                <Route path="/login"        element={<LoginPage />} />
                <Route path="/unauthorized" element={<UnauthorizedPage />} />

                {/* ── Root → role-based redirect ── */}
                <Route path="/" element={<RootRedirect />} />

                {/* ── Super Admin ── */}
                <Route
                  path="/admin/*"
                  element={
                    <RequireAuth allowedRoles={["super_admin"]}>
                      <SuperAdminPortal />
                    </RequireAuth>
                  }
                />

                {/* ── Warehouse ── */}
                <Route
                  path="/warehouse/*"
                  element={
                    <RequireAuth allowedRoles={["warehouse", "super_admin"]}>
                      <WarehousePortal />
                    </RequireAuth>
                  }
                />

                {/* ── Finance ── */}
                <Route
                  path="/finance/*"
                  element={
                    <RequireAuth allowedRoles={["finance", "accountant", "super_admin"]}>
                      <FinancePortal />
                    </RequireAuth>
                  }
                />

                {/* ── Admin / HR ── */}
                <Route
                  path="/admin-hr/*"
                  element={
                    <RequireAuth allowedRoles={["admin", "hr", "super_admin"]}>
                      <AdminHRPortal />
                    </RequireAuth>
                  }
                />

                {/* ── Marketing ── */}
                <Route
                  path="/marketing/*"
                  element={
                    <RequireAuth allowedRoles={["marketing", "marketer", "super_admin"]}>
                      <MarketingPortal />
                    </RequireAuth>
                  }
                />

                {/* ── Supervisor ── */}
                <Route
                  path="/supervisor/*"
                  element={
                    <RequireAuth allowedRoles={["supervisor", "manager", "super_admin"]}>
                      <SupervisorPortal />
                    </RequireAuth>
                  }
                />

                {/* ── Data Entry ── */}
                <Route
                  path="/data-entry/*"
                  element={
                    <RequireAuth allowedRoles={["data_entry", "supervisor", "super_admin"]}>
                      <DataEntryPortal />
                    </RequireAuth>
                  }
                />

                {/* ── Customer Service ── */}
                <Route
                  path="/customer-service/*"
                  element={
                    <RequireAuth allowedRoles={["customer_service", "supervisor", "super_admin"]}>
                      <CSPortal />
                    </RequireAuth>
                  }
                />

                {/* ── Merchant ── */}
                <Route
                  path="/merchant/*"
                  element={
                    <RequireAuth allowedRoles={["merchant", "super_admin"]}>
                      <MerchantPortal />
                    </RequireAuth>
                  }
                />

                {/* ── Branch Office ── */}
                <Route
                  path="/branch-office/*"
                  element={
                    <RequireAuth allowedRoles={["branch", "supervisor", "super_admin"]}>
                      <BranchOfficePortal />
                    </RequireAuth>
                  }
                />

                {/* ── Customer (self-service) ── */}
                <Route
                  path="/customer/*"
                  element={
                    <RequireAuth allowedRoles={["customer", "super_admin"]}>
                      <CustomerPortal />
                    </RequireAuth>
                  }
                />

                {/* ── Rider / Driver ── */}
                <Route
                  path="/rider/*"
                  element={
                    <RequireAuth allowedRoles={["rider", "driver", "super_admin"]}>
                      <RiderPortal />
                    </RequireAuth>
                  }
                />

                {/* ── 404 ── */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
