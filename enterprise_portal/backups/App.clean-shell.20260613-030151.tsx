import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

import DashboardPage from '@/pages/DashboardPage';
import CreateDeliveryPage from '@/pages/CreateDeliveryPage';
import WayManagementPage from '@/pages/WayManagementPage';
import DataEntryPage from '@/pages/DataEntryPage';
import WarehousePage from '@/pages/WarehousePage';
import WaybillInvoicePage from '@/pages/WaybillInvoicePage';
import ReportingPage from '@/pages/ReportingPage';
import DispatchCenterPage from '@/pages/DispatchCenterPage';
import BranchOfficePage from '@/pages/BranchOfficePage';
import SettingsPage from '@/pages/SettingsPage';
import LoginPage from '@/pages/LoginPage';
import NotFoundPage from '@/pages/NotFoundPage';
import MarketingPortalPage from "./pages/MarketingPortalPage";
import BusinessDevelopmentPortalPage from "./pages/BusinessDevelopmentPortalPage";
import BranchOfficePortalPage from "./pages/BranchOfficePortalPage";
import StaffPortalPage from "./pages/StaffPortalPage";
import MerchantPortalPage from "./pages/MerchantPortalPage";
import CustomerPortalPage from "./pages/CustomerPortalPage";

const navItems = [
  { to: '/dashboard', label: 'Dashboard', emoji: '📊' },
  { to: '/create-delivery', label: 'Create Delivery', emoji: '📦' },
  { to: '/way-management', label: 'Way Management', emoji: '🗺️' },
  { to: '/data-entry', label: 'Data Entry', emoji: '📂' },
  { to: '/warehouse', label: 'Warehouse Ops', emoji: '🏭' },
  { to: '/dispatch-center', label: 'Dispatch Center', emoji: '🚚' },
  { to: '/waybill-invoice', label: 'Waybill & Invoice', emoji: '🏷️' },
  { to: '/reporting', label: 'Reporting', emoji: '📈' },
  { to: '/branch-office', label: 'Branch Office', emoji: '🏢' },
  { to: '/settings', label: 'Settings', emoji: '⚙️' }
];

function ProtectedLayout() {
  const { loading, user, profile, signOut } = useAuth();

  if (loading) {
    return <div className="be-loading">Loading Britium Enterprise Portal…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="be-shell">
      <aside className="be-sidebar">
        <Link to="/dashboard" className="be-brand">
          <span className="be-brand-mark">BE</span>
          <span>
            <strong>Britium Express</strong>
            <small>Enterprise Portal</small>
          </span>
        </Link>

        <nav className="be-nav">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'active' : ''}>
              <span>{item.emoji}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <section className="be-main">
        <header className="be-topbar">
          <div>
            <p className="be-eyebrow">Production clean portal</p>
            <h1>Britium Enterprise Operations</h1>
          </div>
          <div className="be-user-box">
            <span>{profile?.full_name || profile?.email || user.email}</span>
            <small>{profile?.role || 'guest'} · {profile?.branch_code || 'ALL'}</small>
            <button onClick={signOut}>Sign out</button>
          </div>
        </header>

        {profile?.status === 'unregistered' && (
          <div className="be-alert be-alert-warning">
            This user is authenticated but not mapped in be_user_account_registry. Run the bootstrap SQL or register the user before testing protected RPCs.
          </div>
        )}

        <main className="be-content">
          <Outlet />
        </main>
      </section>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/create-delivery" element={<CreateDeliveryPage />} />
        <Route path="/way-management" element={<WayManagementPage />} />
        <Route path="/data-entry" element={<DataEntryPage />} />
        <Route path="/warehouse" element={<WarehousePage />} />
        <Route path="/dispatch-center" element={<DispatchCenterPage />} />
        <Route path="/waybill-invoice" element={<WaybillInvoicePage />} />
        <Route path="/waybill-studio" element={<WaybillInvoicePage />} />
        <Route path="/invoice-studio" element={<WaybillInvoicePage />} />
        <Route path="/reporting" element={<ReportingPage />} />
        <Route path="/reports" element={<ReportingPage />} />
        <Route path="/branch-office" element={<BranchOfficePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
              <Route path="/marketing" element={<MarketingPortalPage />} />
          <Route path="/business-development" element={<BusinessDevelopmentPortalPage />} />
          <Route path="/staff" element={<StaffPortalPage />} />
          <Route path="/merchant-portal" element={<MerchantPortalPage />} />
          <Route path="/customer-portal" element={<CustomerPortalPage />} />
        </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}