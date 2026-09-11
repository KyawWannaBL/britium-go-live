import { lazy, Suspense, useState, FormEvent, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, Smartphone, LogOut, Package, Database, HeadphonesIcon, Truck, Map as MapIcon, Settings, Briefcase, Users, FileText,
  Activity, AlertTriangle, QrCode, Edit3, PackageSearch, Send, ShieldCheck, UserCheck, CheckSquare,
  Command, TrendingUp, DollarSign, Coins, Receipt, Wallet, Banknote, Store, Building2, Building, PieChart,
  Megaphone, Calculator, Bike, Car, User, LineChart, ClipboardList, FileSpreadsheet, Printer, Globe
} from "lucide-react";
import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';

// FIXED IMPORT: Using the exact filename to prevent duplicate context instances
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

import AppErrorBoundary from '@/components/system/AppErrorBoundary';
import EnvironmentBadge from '@/components/system/EnvironmentBadge';

// STRICT TYPOGRAPHY ENFORCEMENT
const GLOBAL_FONT = "font-['Inter','Poppins',sans-serif] antialiased";

// EXPLICIT SAFE LAZY LOAD (WITH VERCEL CACHE BUSTING)
const safeLazy = (importFunc: any) => lazy(() =>
  importFunc().catch((err: any) => {
    console.error("Module load error", err);
    const isChunkError = err.message && err.message.includes('Failed to fetch dynamically imported module');
    const hasReloaded = sessionStorage.getItem('vite_chunk_reload');
    if (isChunkError && !hasReloaded) {
      sessionStorage.setItem('vite_chunk_reload', 'true');
      window.location.reload();
      return { default: () => null };
    }
    sessionStorage.removeItem('vite_chunk_reload');
    return { default: () => <div className={`flex h-screen w-full items-center justify-center bg-[#061524] text-[#ff4f86] text-[12px] font-bold tracking-widest uppercase ${GLOBAL_FONT}`}>Failed to load module. Please refresh your browser.</div> };
  })
);

// ALL PAGES REGISTRY
const LoginPage = lazy(() => import("@/pages/Login"));
const DashboardPage = safeLazy(() => import('@/pages/DashboardPage'));
const AccountsPage = safeLazy(() => import('@/pages/AccountsPage'));
const AdminHRPage = safeLazy(() => import('@/pages/AdminHRPage'));
const AnalyticsPage = safeLazy(() => import('@/pages/AnalyticsPage'));
const AuditLogsPage = safeLazy(() => import('@/pages/AuditLogsPage'));
const BizDevPage = safeLazy(() => import('@/pages/BizDevPage'));
const BranchAdminPage = safeLazy(() => import('@/pages/BranchAdminPage'));
const BranchOfficePage = safeLazy(() => import('@/pages/BranchOfficePage'));
const CODSettlementPage = safeLazy(() => import('@/pages/CODSettlementPage'));
const CustomerPortalPage = safeLazy(() => import('@/pages/CustomerPortalPage'));
const CustomerServiceCommandCenterPage = safeLazy(() => import('@/pages/CustomerServiceCommandCenterPage'));
const CustomerServicePortalPage = safeLazy(() => import('@/pages/CustomerServicePortalPage'));
const DataEntryPage = safeLazy(() => import('@/pages/DataEntryPage'));
const DispatchCommandCenterPage = safeLazy(() => import('@/pages/DispatchCommandCenterPage'));
const DocumentPrintRoomPage = safeLazy(() => import('@/pages/DocumentPrintRoomPage'));
const DocumentPrintStudioPage = safeLazy(() => import('@/pages/DocumentPrintStudioPage'));
const DriverPage = safeLazy(() => import('@/pages/DriverPage'));
const ExceptionsPage = safeLazy(() => import('@/pages/ExceptionsPage'));
const ExecutiveOpsPage = safeLazy(() => import('@/pages/ExecutiveOpsPage'));
const FinancePortalPage = safeLazy(() => import('@/pages/FinancePortalPage'));
const ForgotPasswordPage = safeLazy(() => import('@/pages/ForgotPasswordPage'));
const GoLiveControlPanel = safeLazy(() => import('@/pages/GoLiveControlPanel'));
const GoLiveTemplateCenterPage = safeLazy(() => import('@/pages/GoLiveTemplateCenterPage'));
const InvoicePrintStudioPage = safeLazy(() => import('@/pages/InvoicePrintStudioPage'));
const InvoiceStudioPage = safeLazy(() => import('@/pages/InvoiceStudioPage'));
const ManifestPrintStudioPage = safeLazy(() => import('@/pages/ManifestPrintStudioPage'));
const MarketingPage = safeLazy(() => import('@/pages/MarketingPage'));
const MarketingPortalPage = safeLazy(() => import('@/pages/MarketingPortalPage'));
const MasterDataPage = safeLazy(() => import('@/pages/MasterDataPage'));
const MerchantPortalPage = safeLazy(() => import('@/pages/MerchantPortalPage'));
const PickupFormPage = safeLazy(() => import('@/pages/PickupFormPage'));
const ProfilePage = safeLazy(() => import('@/pages/ProfilePage'));
const RiderPage = safeLazy(() => import('@/pages/RiderPage'));
const RiderAppPage = safeLazy(() => import('@/pages/RiderAppPage'));
const RiderSettlementPage = safeLazy(() => import('@/pages/RiderSettlementPage'));
const SettingsPage = safeLazy(() => import('@/pages/SettingsPage'));
const SignupPage = safeLazy(() => import('@/pages/SignupPage'));
const SupervisorPickupAssignmentGoLivePage = safeLazy(() => import('@/pages/SupervisorPickupAssignmentGoLivePage'));
const SupervisorPortalPage = safeLazy(() => import('@/pages/SupervisorPortalPage'));
const SupervisorWayplanReviewPage = safeLazy(() => import('@/pages/SupervisorWayplanReviewPage'));
const TariffPage = safeLazy(() => import('@/pages/TariffPage'));
const UATGoLiveCommandCenterPage = safeLazy(() => import('@/pages/UATGoLiveCommandCenterPage'));
const UnifiedOperationsWorkflowPage = safeLazy(() => import('@/pages/UnifiedOperationsWorkflowPage'));
const WarehouseOperationPage = safeLazy(() => import('@/pages/WarehouseOperationPage'));
const WarehousePage = safeLazy(() => import('@/pages/WarehousePage'));
const WaybillStudioPage = safeLazy(() => import('@/pages/WaybillStudioPage'));
const WayplanCommandCenterPage = safeLazy(() => import('@/pages/WayplanCommandCenterPage'));
const WorkforceCommissionPage = safeLazy(() => import('@/pages/WorkforceCommissionPage'));

// Auxiliary Pages
const DataEntryExcelRegisterPage = safeLazy(() => import('@/pages/DataEntryExcelRegisterPage'));
const DataEntryPhotoCheckPage = safeLazy(() => import('@/pages/DataEntryPhotoCheckPage'));
const DataEntrySynchronizedPage = safeLazy(() => import('@/pages/DataEntrySynchronizedPage'));
const DataEntryUATUploadPage = safeLazy(() => import('@/pages/DataEntryUATUploadPage'));
const DataEntryWaybillStudio = safeLazy(() => import('@/pages/DataEntryWaybillStudio'));
const ProofGalleryPortalPage = safeLazy(() => import('@/pages/ProofGalleryPortalPage'));
const ReportingPage = safeLazy(() => import('@/pages/ReportingPage'));
const WarehouseOperations = safeLazy(() => import('@/pages/WarehouseOperations'));
const WarehouseRegistrationTemplatePage = safeLazy(() => import('@/pages/WarehouseRegistrationTemplatePage'));
const WarehouseUATUploadPage = safeLazy(() => import('@/pages/WarehouseUATUploadPage'));
const WaybillInvoicePage = safeLazy(() => import('@/pages/WaybillInvoicePage'));
const WayplanDetailPage = safeLazy(() => import('@/pages/WayplanDetailPage'));

// UI COMPONENTS
const PageLoader = () => (
  <div className={`flex h-screen w-full flex-col items-center justify-center bg-[#061524] gap-5 notranslate ${GLOBAL_FONT}`} translate="no">
    <div className="w-14 h-14 border-4 border-[#1a3a5c] border-t-[#f6b84b] rounded-full animate-spin"></div>
    <div className="text-[#4d7a9b] text-[12px] font-bold tracking-widest uppercase flex flex-col items-center gap-2">
      <span> ...</span>
      <span className="text-[#1a3a5c]">LOADING MODULE</span>
    </div>
  </div>
);

// THE FULL ENTERPRISE SIDEBAR
export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const NAV_GROUPS = [
    {
      title: "Overview",
      links: [
        { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
        { name: "Go-Live Readiness", path: "/go-live-readiness", icon: Activity },
        { name: "Analytics", path: "/analytics", icon: LineChart },
      ]
    },
    {
      title: "Customer Service",
      links: [
        { name: "CS Command", path: "/cs-command", icon: HeadphonesIcon },
        { name: "CS Portal", path: "/cs-portal", icon: HeadphonesIcon },
        { name: "Exceptions", path: "/exceptions", icon: AlertTriangle },
      ]
    },
    {
      title: "Data Entry & Forms",
      links: [
        { name: "Data Entry", path: "/data-entry", icon: FileText },
        { name: "Waybill Studio", path: "/waybill-studio", icon: QrCode },
        { name: "Pickup Form", path: "/pickup-form", icon: Edit3 },
        { name: "Doc Print Room", path: "/doc-print-room", icon: Printer },
      ]
    },
    {
      title: "Warehouse",
      links: [
        { name: "Warehouse", path: "/warehouse", icon: Package },
        { name: "Warehouse Ops", path: "/warehouse-operations", icon: PackageSearch },
      ]
    },
    {
      title: "Dispatch & Routing",
      links: [
        { name: "Ops Workflow", path: "/ops-workflow", icon: Activity },
        { name: "Dispatch Command", path: "/dispatch-command", icon: Truck },
        { name: "Wayplan Command", path: "/wayplan-command", icon: MapIcon },
      ]
    },
    {
      title: "Management",
      links: [
        { name: "Supervisor", path: "/supervisor", icon: ShieldCheck },
        { name: "Supervisor Pickup", path: "/supervisor-pickup", icon: UserCheck },
        { name: "Supervisor Wayplan", path: "/supervisor-wayplan", icon: CheckSquare },
        { name: "Exec Ops", path: "/exec-ops", icon: Command },
      ]
    },
    {
      title: "Finance & Accounts",
      links: [
        { name: "Finance Portal", path: "/finance", icon: DollarSign },
        { name: "Invoice Studio", path: "/invoice-studio", icon: Receipt },
        { name: "COD Settlement", path: "/cod-settlement", icon: Coins },
        { name: "Workforce Commission", path: "/workforce-commission", icon: Wallet },
        { name: "Rider Settlement", path: "/rider-settlement", icon: Banknote },
      ]
    },
    {
      title: "Client Portals",
      links: [
        { name: "Merchant Portal", path: "/merchant-portal", icon: Store },
        { name: "Customer Portal", path: "/customer-portal", icon: User },
        { name: "Branch Office", path: "/branch-office", icon: Building2 },
        { name: "Branch Admin", path: "/branch-admin", icon: Building },
      ]
    },
    {
      title: "Growth & Master Data",
      links: [
        { name: "Master Data", path: "/master-data", icon: Database },
        { name: "Biz Dev", path: "/biz-dev", icon: PieChart },
        { name: "Marketing", path: "/marketing", icon: Megaphone },
        { name: "Marketing Portal", path: "/marketing-portal", icon: Megaphone },
        { name: "Tariff", path: "/tariff", icon: Calculator },
      ]
    },
    {
      title: "Field Operations",
      links: [
        { name: "Rider Management", path: "/rider", icon: Bike },
        { name: "Mobile Sandbox", path: "/rider-app", icon: Smartphone },
        { name: "Driver Management", path: "/driver", icon: Car },
      ]
    },
    {
      title: "System & HR",
      links: [
        { name: "Admin / HR", path: "/admin-hr", icon: Users },
        { name: "Accounts", path: "/accounts", icon: Users },
        { name: "Profile", path: "/profile", icon: User },
        { name: "Audit Logs", path: "/audit-logs", icon: ClipboardList },
        { name: "Templates", path: "/templates", icon: FileSpreadsheet },
        { name: "Settings", path: "/settings", icon: Settings },
        { name: "Go-Live Control", path: "/go-live-control", icon: ShieldCheck },
      ]
    }
  ];

  return (
    <aside className={`w-64 bg-[#0a1628] border-r border-[#1a3a5c] flex flex-col h-screen shrink-0 ${GLOBAL_FONT}`}>
      <div className="p-6 border-b border-[#1a3a5c] shrink-0">
        <h1 className="!text-[20px] !font-black tracking-wider !text-[#f6b84b] !mb-0 uppercase">Britium Ventures</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar pb-24">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="text-[10px] font-black uppercase tracking-widest text-[#4d7a9b] mb-2 px-3">{group.title}</div>
            <div className="space-y-1">
              {group.links.map((link) => {
                const isActive = location.pathname === link.path || location.pathname.startsWith(`${link.path}/`);
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-200 text-[13px] font-semibold tracking-wide ${isActive ? 'bg-[#1a3a5c] text-[#f6b84b] shadow-md' : 'text-[#c8dff0] hover:bg-[#0f243b] hover:text-white'}`}
                  >
                    <link.icon size={16} strokeWidth={isActive ? 2.5 : 2} /> <span>{link.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-[#1a3a5c] shrink-0 bg-[#0a1628]">
        <button onClick={() => { supabase.auth.signOut(); navigate("/", { replace: true }); }} className="w-full flex items-center gap-3 p-3 text-[#ff4f86] font-bold text-[13px] tracking-wide hover:bg-[#ff4f86]/10 rounded-xl transition-colors cursor-pointer">
          <LogOut size={18}/> <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

// APPSHELL WITH LANGUAGE TOGGLE & UNIFORM LAYOUT WRAPPER
function AppShell({ children }: { children: React.ReactNode }) {
  const { toggleLang, lang } = useLanguage();

  return (
    <div className={`flex h-screen w-full bg-[#061524] overflow-hidden ${GLOBAL_FONT}`}>
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
        <header className="h-14 bg-[#0a1628] border-b border-[#1a3a5c] flex items-center justify-end px-6 shrink-0 z-50 shadow-md w-full">
          <button
            onClick={toggleLang}
            className="flex items-center gap-2 bg-[#1a3a5c] text-[#f6b84b] px-4 py-1.5 rounded-lg text-[12px] font-bold tracking-wider hover:bg-[#0f243b] transition-colors shadow-sm cursor-pointer border border-[#1a3a5c] hover:border-[#f6b84b]"
          >
            <Globe size={14} />
            <span>{lang === 'en' ? 'မြန်မာ' : 'English'}</span>
          </button>
        </header>
        <main className="flex-1 overflow-auto relative custom-scrollbar">
          <div className="min-w-[1200px] h-full p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// PRODUCTION SECURE LAYOUT & AUTH
function AuthLayout() {
  const auth = useAuth() as any;

  if (auth?.loading) return <PageLoader />;
  if (!auth?.session) return <Navigate to="/" replace />;

  return (
    <AppShell>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </AppShell>
  );
}

// ROUTING MODULE
function AppRoutes() {
  const location = useLocation();

  return (
    <AppErrorBoundary pathname={location.pathname}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public Access & Login */}
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          {/* Protected Enterprise Routes */}
          <Route element={<AuthLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/branch-office" element={<BranchOfficePage />} />
            <Route path="/cs-command" element={<CustomerServiceCommandCenterPage />} />
            <Route path="/cs-portal" element={<CustomerServicePortalPage />} />
            <Route path="/data-entry" element={<DataEntryPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/admin-hr" element={<AdminHRPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/audit-logs" element={<AuditLogsPage />} />
            <Route path="/biz-dev" element={<BizDevPage />} />
            <Route path="/branch-admin" element={<BranchAdminPage />} />
            <Route path="/cod-settlement" element={<CODSettlementPage />} />
            <Route path="/customer-portal" element={<CustomerPortalPage />} />
            <Route path="/doc-print-room" element={<DocumentPrintRoomPage />} />
            <Route path="/doc-print" element={<DocumentPrintStudioPage />} />
            <Route path="/driver" element={<DriverPage />} />
            <Route path="/exceptions" element={<ExceptionsPage />} />
            <Route path="/exec-ops" element={<ExecutiveOpsPage />} />
            <Route path="/finance" element={<FinancePortalPage />} />
            <Route path="/go-live-control" element={<GoLiveControlPanel />} />
            <Route path="/invoice-studio" element={<InvoiceStudioPage />} />
            <Route path="/manifest-print" element={<ManifestPrintStudioPage />} />
            <Route path="/marketing" element={<MarketingPage />} />
            <Route path="/marketing-portal" element={<MarketingPortalPage />} />
            <Route path="/master-data" element={<MasterDataPage />} />
            <Route path="/merchant-portal" element={<MerchantPortalPage />} />
            <Route path="/pickup-form" element={<PickupFormPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/rider" element={<RiderPage />} />
            <Route path="/rider-app" element={<RiderAppPage />} />
            <Route path="/rider-settlement" element={<RiderSettlementPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/supervisor-pickup" element={<SupervisorPickupAssignmentGoLivePage />} />
            <Route path="/supervisor-portal" element={<SupervisorPickupAssignmentGoLivePage />} />
            <Route path="/supervisor" element={<SupervisorPickupAssignmentGoLivePage />} />
            <Route path="/supervisor-wayplan" element={<SupervisorWayplanReviewPage />} />
            <Route path="/tariff" element={<TariffPage />} />
            <Route path="/warehouse" element={<WarehousePage />} />
            <Route path="/warehouse-operations" element={<WarehouseOperationPage />} />
            <Route path="/waybill-studio" element={<WaybillStudioPage />} />
            <Route path="/wayplan-command" element={<WayplanCommandCenterPage />} />
            <Route path="/workforce-commission" element={<WorkforceCommissionPage />} />
            <Route path="/templates" element={<GoLiveTemplateCenterPage />} />
            <Route path="/go-live-readiness" element={<UATGoLiveCommandCenterPage />} />
            <Route path="/ops-workflow" element={<UnifiedOperationsWorkflowPage />} />
            <Route path="/dispatch-command" element={<DispatchCommandCenterPage />} />

            {/* Auxiliary Routes */}
            <Route path="/data-entry-excel" element={<DataEntryExcelRegisterPage />} />
            <Route path="/data-entry-photo" element={<DataEntryPhotoCheckPage />} />
            <Route path="/data-entry-sync" element={<DataEntrySynchronizedPage />} />
            <Route path="/data-entry-uat" element={<DataEntryUATUploadPage />} />
            <Route path="/data-entry-waybill" element={<DataEntryWaybillStudio />} />
            <Route path="/proof-gallery" element={<ProofGalleryPortalPage />} />
            <Route path="/reporting" element={<ReportingPage />} />
            <Route path="/warehouse-ops-alt" element={<WarehouseOperations />} />
            <Route path="/warehouse-reg" element={<WarehouseRegistrationTemplatePage />} />
            <Route path="/warehouse-uat" element={<WarehouseUATUploadPage />} />
            <Route path="/waybill-invoice" element={<WaybillInvoicePage />} />
            <Route path="/wayplan-detail" element={<WayplanDetailPage />} />
          </Route>

          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  );
}

// APP ROOT
export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <HashRouter>
          <EnvironmentBadge />
          <AppRoutes />
        </HashRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}