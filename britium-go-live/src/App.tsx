import { lazy, Suspense, type ReactNode } from "react";
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Globe } from "lucide-react";
import GlobalNextProcessGuide from "@/components/GlobalNextProcessGuide";
import Sidebar from "@/components/Sidebar";
import AppErrorBoundary from "@/components/system/AppErrorBoundary";
import EnvironmentBadge from "@/components/system/EnvironmentBadge";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LanguageProvider, useLanguage } from "@/contexts/LanguageContext";

const GLOBAL_FONT = "font-['Poppins','Noto_Sans_Myanmar',sans-serif] antialiased";

const safeLazy = (importPage: () => Promise<{ default: React.ComponentType }>) =>
  lazy(() =>
    importPage().catch((error: Error) => {
      console.error("Module load error", error);
      const isChunkError = error.message?.includes("Failed to fetch dynamically imported module");
      const hasReloaded = sessionStorage.getItem("vite_chunk_reload");

      if (isChunkError && !hasReloaded) {
        sessionStorage.setItem("vite_chunk_reload", "true");
        window.location.reload();
        return { default: () => null };
      }

      sessionStorage.removeItem("vite_chunk_reload");
      return {
        default: () => (
          <div className={`flex h-screen w-full items-center justify-center bg-[#061524] text-[12px] font-bold uppercase tracking-widest text-[#ff4f86] ${GLOBAL_FONT}`}>
            Failed to load module. Please refresh your browser.
          </div>
        ),
      };
    }),
  );

const LoginPage = lazy(() => import("@/pages/Login"));
const DashboardPage = safeLazy(() => import("@/pages/DashboardPage"));
const AccountsPage = safeLazy(() => import("@/pages/AccountsPage"));
const AdminHRPage = safeLazy(() => import("@/pages/AdminHRPage"));
const AnalyticsPage = safeLazy(() => import("@/pages/AnalyticsPage"));
const AuditLogsPage = safeLazy(() => import("@/pages/AuditLogsPage"));
const BizDevPage = safeLazy(() => import("@/pages/BizDevPage"));
const BranchAdminPage = safeLazy(() => import("@/pages/BranchAdminPage"));
const BranchOfficePage = safeLazy(() => import("@/pages/BranchOfficePage"));
const CODSettlementPage = safeLazy(() => import("@/pages/CODSettlementPage"));
const CustomerPortalPage = safeLazy(() => import("@/pages/CustomerPortalPage"));
const CustomerServiceCommandCenterPage = safeLazy(() => import("@/pages/CustomerServiceCommandCenterPage"));
const CustomerServicePortalPage = safeLazy(() => import("@/pages/CustomerServicePortalPage"));
const DataEntryFinancialV2Page = safeLazy(() => import("@/pages/DataEntryFinancialV2Page"));
const FinanceDataEntryReviewPage = safeLazy(() => import("@/pages/FinanceDataEntryReviewPage"));
const DispatchCommandCenterPage = safeLazy(() => import("@/pages/DispatchCommandCenterPage"));
const DocumentPrintRoomPage = safeLazy(() => import("@/pages/DocumentPrintRoomPage"));
const DocumentPrintStudioPage = safeLazy(() => import("@/pages/DocumentPrintStudioPage"));
const DriverPage = safeLazy(() => import("@/pages/DriverPage"));
const ExceptionsPage = safeLazy(() => import("@/pages/ExceptionsPage"));
const ExecutiveOpsPage = safeLazy(() => import("@/pages/ExecutiveOpsPage"));
const FinancePortalPage = safeLazy(() => import("@/pages/FinancePortalPage"));
const ForgotPasswordPage = safeLazy(() => import("@/pages/ForgotPasswordPage"));
const GoLiveControlPanel = safeLazy(() => import("@/pages/GoLiveControlPanel"));
const GoLiveTemplateCenterPage = safeLazy(() => import("@/pages/GoLiveTemplateCenterPage"));
const InvoiceStudioPage = safeLazy(() => import("@/pages/InvoiceStudioPage"));
const ManifestPrintStudioPage = safeLazy(() => import("@/pages/ManifestPrintStudioPage"));
const MarketingPage = safeLazy(() => import("@/pages/MarketingPage"));
const MarketingPortalPage = safeLazy(() => import("@/pages/MarketingPortalPage"));
const MasterDataPage = safeLazy(() => import("@/pages/MasterDataPage"));
const MerchantPortalPage = safeLazy(() => import("@/pages/MerchantPortalPage"));
const PickupFormPage = safeLazy(() => import("@/pages/PickupFormPage"));
const ProfilePage = safeLazy(() => import("@/pages/ProfilePage"));
const RiderPage = safeLazy(() => import("@/pages/RiderPage"));
const RiderAppPage = safeLazy(() => import("@/pages/RiderAppPage"));
const RiderSettlementPage = safeLazy(() => import("@/pages/RiderSettlementPage"));
const SettingsPage = safeLazy(() => import("@/pages/SettingsPage"));
const SignupPage = safeLazy(() => import("@/pages/SignupPage"));
const SupervisorPickupAssignmentGoLivePage = safeLazy(() => import("@/pages/SupervisorPickupAssignmentGoLivePage"));
const SupervisorWayplanReviewPage = safeLazy(() => import("@/pages/SupervisorWayplanReviewPage"));
const TariffPage = safeLazy(() => import("@/pages/TariffPage"));
const UATGoLiveCommandCenterPage = safeLazy(() => import("@/pages/UATGoLiveCommandCenterPage"));
const UnifiedOperationsWorkflowPage = safeLazy(() => import("@/pages/UnifiedOperationsWorkflowPage"));
const WarehouseOperationPage = safeLazy(() => import("@/pages/WarehouseOperationPage"));
const WarehousePage = safeLazy(() => import("@/pages/WarehousePage"));
const WaybillStudioPage = safeLazy(() => import("@/pages/WaybillStudioPage"));
const WayplanCreatePage = safeLazy(() => import("@/pages/WayplanCreatePage"));
const WayplanCommandCenterPage = safeLazy(() => import("@/pages/WayplanCommandCenterPage"));
const WorkforceCommissionPage = safeLazy(() => import("@/pages/WorkforceCommissionPage"));

const DataEntryExcelRegisterPage = safeLazy(() => import("@/pages/DataEntryExcelRegisterPage"));
const DataEntryPhotoCheckPage = safeLazy(() => import("@/pages/DataEntryPhotoCheckPage"));
const DataEntrySynchronizedPage = safeLazy(() => import("@/pages/DataEntrySynchronizedPage"));
const DataEntryUATUploadPage = safeLazy(() => import("@/pages/DataEntryUATUploadPage"));
const DataEntryWaybillStudio = safeLazy(() => import("@/pages/DataEntryWaybillStudio"));
const ProofGalleryPortalPage = safeLazy(() => import("@/pages/ProofGalleryPortalPage"));
const ReportingPage = safeLazy(() => import("@/pages/ReportingPage"));
const WarehouseOperations = safeLazy(() => import("@/pages/WarehouseOperations"));
const WarehouseRegistrationTemplatePage = safeLazy(() => import("@/pages/WarehouseRegistrationTemplatePage"));
const WarehouseUATUploadPage = safeLazy(() => import("@/pages/WarehouseUATUploadPage"));
const WaybillInvoicePage = safeLazy(() => import("@/pages/WaybillInvoicePage"));
const WayplanDetailPage = safeLazy(() => import("@/pages/WayplanDetailPage"));

function PageLoader() {
  return (
    <div className={`notranslate flex h-screen w-full flex-col items-center justify-center gap-5 bg-[#061524] ${GLOBAL_FONT}`} translate="no">
      <div className="h-14 w-14 animate-spin rounded-full border-4 border-[#1a3a5c] border-t-[#f6b84b]" />
      <div className="text-[12px] font-bold uppercase tracking-widest text-[#4d7a9b]">Loading module</div>
    </div>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const { toggleLang, lang } = useLanguage();

  return (
    <div data-be-app-shell="true" className={`flex h-screen w-full overflow-hidden bg-[#061524] ${GLOBAL_FONT}`}>
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-50 flex h-14 w-full shrink-0 items-center justify-end border-b border-[#1a3a5c] bg-[#0a1628] px-6 shadow-md">
          <button
            type="button"
            onClick={toggleLang}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#1a3a5c] bg-[#1a3a5c] px-4 py-1.5 text-[12px] font-bold tracking-wider text-[#f6b84b] shadow-sm transition-colors hover:border-[#f6b84b] hover:bg-[#0f243b]"
          >
            <Globe size={14} />
            <span>{lang === "en" ? "မြန်မာ" : "English"}</span>
          </button>
        </header>
        <main data-be-main="true" className="custom-scrollbar relative flex-1 overflow-auto">
          <div data-be-content="true" className="h-full min-w-[1200px] p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function AuthLayout() {
  const { loading, session } = useAuth();

  if (loading) return <PageLoader />;
  if (!session) return <Navigate to="/" replace />;

  return (
    <AppShell>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </AppShell>
  );
}

function AppRoutes() {
  const location = useLocation();

  return (
    <AppErrorBoundary pathname={location.pathname}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          <Route element={<AuthLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/branch-office" element={<BranchOfficePage />} />
            <Route path="/cs-command" element={<CustomerServiceCommandCenterPage />} />
            <Route path="/cs-portal" element={<CustomerServicePortalPage />} />
            <Route path="/data-entry" element={<DataEntryFinancialV2Page />} />
            <Route path="/finance/data-entry-review" element={<FinanceDataEntryReviewPage />} />
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
            <Route path="/wayplan/create" element={<WayplanCreatePage />} />
            <Route path="/wayplan-command" element={<WayplanCommandCenterPage />} />
            <Route path="/workforce-commission" element={<WorkforceCommissionPage />} />
            <Route path="/templates" element={<GoLiveTemplateCenterPage />} />
            <Route path="/go-live-readiness" element={<UATGoLiveCommandCenterPage />} />
            <Route path="/ops-workflow" element={<UnifiedOperationsWorkflowPage />} />
            <Route path="/dispatch-command" element={<DispatchCommandCenterPage />} />

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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <GlobalNextProcessGuide />
      </Suspense>
    </AppErrorBoundary>
  );
}

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
