import { lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Globe } from "lucide-react";
import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';

// FIXED IMPORT: Using the exact filename to prevent duplicate context instances
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

import AppErrorBoundary from '@/components/system/AppErrorBoundary';
import EnvironmentBadge from '@/components/system/EnvironmentBadge';
import Sidebar from '@/components/Sidebar';

// STRICT TYPOGRAPHY ENFORCEMENT
const GLOBAL_FONT = "font-['Poppins','Noto_Sans_Myanmar',sans-serif] antialiased";

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
const DataEntryPage = safeLazy(() => import('@/pages/DataEntryFinancialV2Page'));
const DispatchCommandCenterPage = safeLazy(() => import('@/pages/DispatchCommandCenterPage'));
const DocumentPrintRoomPage = safeLazy(() => import('@/pages/DocumentPrintRoomPage'));
const DocumentPrintStudioPage = safeLazy(() => import('@/pages/DocumentPrintStudioPage'));
const DriverPage = safeLazy(() => import('@/pages/DriverPage'));
const ExceptionsPage = safeLazy(() => import('@/pages/ExceptionsPage'));
const ExecutiveOpsPage = safeLazy(() => import('@/pages/ExecutiveOpsPage'));
const FinancePortalPage = safeLazy(() => import('@/pages/FinancePortalPage'));
const FinanceMerchantSettlementPage = safeLazy(() => import('@/pages/FinanceMerchantSettlementPage'));
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
const MobileOperationsPage = safeLazy(() => import('@/pages/MobileOperationsPage'));
const RiderSettlementPage = safeLazy(() => import('@/pages/RiderSettlementPage'));
const SettingsPage = safeLazy(() => import('@/pages/SettingsPage'));
const SignupPage = safeLazy(() => import('@/pages/SignupPage'));
const SupervisorPickupAssignmentGoLivePage = safeLazy(() => import('@/pages/SupervisorPickupAssignmentGoLivePage'));
const SupervisorPortalPage = safeLazy(() => import('@/pages/SupervisorPortalPage'));
const SupervisorWayplanReviewPage = safeLazy(() => import('@/pages/SupervisorWayplanReviewPage'));
const TariffPage = safeLazy(() => import('@/pages/TariffPage'));
const ProductionReadinessPage = safeLazy(() => import('@/pages/ProductionReadinessPage'));
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
const DataEntryWaybillStudio = safeLazy(() => import('@/pages/DataEntryWaybillStudio'));
const ProofGalleryPortalPage = safeLazy(() => import('@/pages/ProofGalleryPortalPage'));
const ReportingPage = safeLazy(() => import('@/pages/ReportingPage'));
const WarehouseOperations = safeLazy(() => import('@/pages/WarehouseOperations'));
const WarehouseRegistrationTemplatePage = safeLazy(() => import('@/pages/WarehouseRegistrationTemplatePage'));
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

// ENTERPRISE SIDEBAR IS MAINTAINED IN src/components/layout/Sidebar.tsx

// APPSHELL WITH LANGUAGE TOGGLE & UNIFORM LAYOUT WRAPPER
function AppShell({ children }: { children: ReactNode }) {
  const { toggleLang, lang } = useLanguage();

  return (
    <div
      data-be-app-shell="true"
      className={`flex h-screen w-full bg-[#061524] overflow-hidden ${GLOBAL_FONT}`}
    >
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
        <main
          data-be-main="true"
          className="flex-1 overflow-auto relative custom-scrollbar"
        >
          <div
            data-be-content="true"
            className="min-w-[1200px] h-full p-4 md:p-6"
          >
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
            <Route path="/finance-merchant-settlement" element={<FinanceMerchantSettlementPage />} />
            <Route path="/merchant-settlement" element={<Navigate to="/finance-merchant-settlement" replace />} />
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
            <Route path="/mobile-operations" element={<MobileOperationsPage />} />
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
            <Route path="/go-live-readiness" element={<ProductionReadinessPage />} />
            <Route path="/ops-workflow" element={<UnifiedOperationsWorkflowPage />} />
            <Route path="/dispatch-command" element={<DispatchCommandCenterPage />} />

            {/* Auxiliary Routes */}
            <Route path="/data-entry-excel" element={<DataEntryExcelRegisterPage />} />
            <Route path="/data-entry-photo" element={<DataEntryPhotoCheckPage />} />
            <Route path="/data-entry-sync" element={<DataEntrySynchronizedPage />} />
            <Route path="/data-entry-waybill" element={<DataEntryWaybillStudio />} />
            <Route path="/proof-gallery" element={<ProofGalleryPortalPage />} />
            <Route path="/reporting" element={<ReportingPage />} />
            <Route path="/warehouse-ops-alt" element={<WarehouseOperations />} />
            <Route path="/warehouse-reg" element={<WarehouseRegistrationTemplatePage />} />
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
