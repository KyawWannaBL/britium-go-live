import { lazy, Suspense, useState, FormEvent, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { LayoutDashboard, Smartphone, LogOut, Package, Database, HeadphonesIcon, Truck, Map, Settings, Briefcase, Users, FileText } from "lucide-react";
import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';
import { AuthProvider, useAuth } from '@/contexts/auth';
import { supabase } from '@/integrations/supabase/client'; 
import AppErrorBoundary from '@/components/system/AppErrorBoundary';
import EnvironmentBadge from '@/components/system/EnvironmentBadge';

// ─── FONT & GLOBAL STYLES ───
// Enforces font consistency across the entire application shell
const GLOBAL_FONT = "font-['Inter','Poppins',sans-serif]";

// ─── SAFE LAZY LOAD ───
const safeLazy = (importFunc: any) => lazy(() => 
  importFunc().catch((err: any) => {
    console.error("Module load error", err);
    return { default: () => <div className={`flex h-screen items-center justify-center bg-[#061524] text-[#ff4f86] text-[12px] font-bold tracking-widest uppercase ${GLOBAL_FONT}`}>စနစ် အချက်အလက်များ ချိတ်ဆက်နေပါသည်... (Syncing Module...)</div> };
  })
);

// ─── PAGES REGISTRY ───
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
const DeliveryDispatchPage = safeLazy(() => import('@/pages/DeliveryDispatchPage'));
const DeliveryWorkflowPage = safeLazy(() => import('@/pages/DeliveryWorkflowPage'));
const DispatchCenterPage = safeLazy(() => import('@/pages/DispatchCenterPage'));
const DocumentPrintStudioPage = safeLazy(() => import('@/pages/DocumentPrintStudioPage'));
const DriverPage = safeLazy(() => import('@/pages/DriverPage'));
const ExceptionsPage = safeLazy(() => import('@/pages/ExceptionsPage'));
const ExecutiveOpsPage = safeLazy(() => import('@/pages/ExecutiveOpsPage'));
const FinancePortalPage = safeLazy(() => import('@/pages/FinancePortalPage'));
const ForgotPasswordPage = safeLazy(() => import('@/pages/ForgotPasswordPage'));
const GoLiveTemplateCenterPage = safeLazy(() => import('@/pages/GoLiveTemplateCenterPage'));
const InvoiceStudioPage = safeLazy(() => import('@/pages/InvoiceStudioPage'));
const LiveDispatchWayplanBoard = safeLazy(() => import('@/pages/LiveDispatchWayplanBoard'));
const MarketingPage = safeLazy(() => import('@/pages/MarketingPage'));
const MarketingPortalPage = safeLazy(() => import('@/pages/MarketingPortalPage'));
const MasterDataPage = safeLazy(() => import('@/pages/MasterDataPage'));
const MerchantPortalPage = safeLazy(() => import('@/pages/MerchantPortalPage'));
const OpsCommandPage = safeLazy(() => import('@/pages/OpsCommandPage'));
const OpsManagerPage = safeLazy(() => import('@/pages/OpsManagerPage'));
const PickupFormPage = safeLazy(() => import('@/pages/PickupFormPage'));
const ProfilePage = safeLazy(() => import('@/pages/ProfilePage'));
const RiderPage = safeLazy(() => import('@/pages/RiderPage'));
const RiderSettlementPage = safeLazy(() => import('@/pages/RiderSettlementPage'));
const SettingsPage = safeLazy(() => import('@/pages/SettingsPage'));
const SignupPage = safeLazy(() => import('@/pages/SignupPage'));
const SupervisorPickupAssignmentGoLivePage = safeLazy(() => import('@/pages/SupervisorPickupAssignmentGoLivePage'));
const SupervisorPortalPage = safeLazy(() => import('@/pages/SupervisorPortalPage'));
const SupervisorWayplanReviewPage = safeLazy(() => import('@/pages/SupervisorWayplanReviewPage'));
const TariffPage = safeLazy(() => import('@/pages/TariffPage'));
const UATGoLiveCommandCenterPage = safeLazy(() => import('@/pages/UATGoLiveCommandCenterPage'));
const WarehouseOperationPage = safeLazy(() => import('@/pages/WarehouseOperationPage'));
const WarehousePage = safeLazy(() => import('@/pages/WarehousePage'));
const WaybillStudioPage = safeLazy(() => import('@/pages/WaybillStudioPage'));
const WayplanCommandCenterPage = safeLazy(() => import('@/pages/WayplanCommandCenterPage'));
const WayplanZonePage = safeLazy(() => import('@/pages/WayplanZonePage'));
const WorkforceCommissionPage = safeLazy(() => import('@/pages/WorkforceCommissionPage'));
const DispatchPage = safeLazy(() => import('@/pages/DispatchPage'));

// ─── UI COMPONENTS ───
const PageLoader = () => (
  <div className={`flex h-screen w-full flex-col items-center justify-center bg-[#061524] gap-5 notranslate ${GLOBAL_FONT}`} translate="no">
    <div className="w-14 h-14 border-4 border-[#1a3a5c] border-t-[#f6b84b] rounded-full animate-spin"></div>
    <div className="text-[#4d7a9b] text-[12px] font-bold tracking-widest uppercase flex flex-col items-center gap-2">
      <span>စနစ်သို့ ဝင်ရောက်နေပါသည်...</span>
      <span className="text-[#1a3a5c]">LOADING MODULE</span>
    </div>
  </div>
);

// ─── SIDEBAR & APP SHELL ───
export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  // Unified navigation links so all screens can be accessed
  const navLinks = [
    { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { name: "Data Entry", path: "/data-entry", icon: FileText },
    { name: "CS Command", path: "/cs-command", icon: HeadphonesIcon },
    { name: "Dispatch", path: "/dispatch", icon: Truck },
    { name: "Warehouse", path: "/warehouse", icon: Package },
    { name: "Wayplan Command", path: "/wayplan-command", icon: Map },
    { name: "Master Data", path: "/master-data", icon: Database },
    { name: "Finance", path: "/finance", icon: Briefcase },
    { name: "Admin / HR", path: "/admin-hr", icon: Users },
    { name: "Settings", path: "/settings", icon: Settings },
    { name: "Mobile Sandbox", path: "/rider", icon: Smartphone }, // Re-routed to rider for sandbox testing
  ];

  return (
    <aside className={`w-64 bg-[#0a1628] border-r border-[#1a3a5c] flex flex-col h-screen shrink-0 ${GLOBAL_FONT}`}>
      <div className="p-6 border-b border-[#1a3a5c]">
        <h1 className="text-[20px] font-black text-[#f6b84b] tracking-wider uppercase mb-0">Britium Ops</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
        {navLinks.map((link) => {
          const isActive = location.pathname.startsWith(link.path);
          return (
            <Link 
              key={link.path} 
              to={link.path} 
              className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-200 text-[13px] font-semibold tracking-wide ${isActive ? 'bg-[#1a3a5c] text-[#f6b84b] shadow-md' : 'text-[#c8dff0] hover:bg-[#0f243b] hover:text-white'}`}
            >
              <link.icon size={18}/> <span>{link.name}</span>
            </Link>
          );
        })}
      </div>
      <div className="p-4 border-t border-[#1a3a5c]">
        <button onClick={() => { supabase.auth.signOut(); navigate("/", { replace: true }); }} className="w-full flex items-center gap-3 p-3 text-[#ff4f86] font-bold text-[13px] tracking-wide hover:bg-[#ff4f86]/10 rounded-xl transition-colors cursor-pointer">
          <LogOut size={18}/> <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`flex h-screen w-full bg-[#061524] overflow-hidden ${GLOBAL_FONT}`}>
      <Sidebar />
      <main className="flex-1 overflow-auto relative">
        {children}
      </main>
    </div>
  );
}

// ─── LAYOUT & AUTH ───
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

// ─── LOGIN SCREEN ───
function LoginPageComponent() {
  const auth = useAuth() as any;
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { t, toggleLang, lang } = useLanguage();

  useEffect(() => {
    if (auth?.session) navigate('/dashboard', { replace: true });
  }, [auth?.session, navigate]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) throw error;
      navigate('/dashboard', { replace: true });
    } catch (err: any) { 
      alert(t('Authentication failed. Check credentials.', 'အချက်အလက်များ မှားယွင်းနေပါသည်။ ပြန်လည်စစ်ဆေးပါ။')); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <div className={`flex min-h-screen items-center justify-center bg-[#061524] p-4 relative overflow-hidden notranslate ${GLOBAL_FONT}`} translate="no">
      <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(4,14,28,0.90),rgba(8,22,45,0.78),rgba(6,12,24,0.88))] z-0" />
      <button onClick={toggleLang} type="button" className="absolute top-6 right-6 z-20 bg-[#081b2e] border border-[#1a3a5c] text-[#eef8ff] px-4 py-2 rounded-xl text-[12px] font-bold tracking-wider cursor-pointer hover:border-[#f6b84b] transition-colors shadow-lg">
        <span>{lang === 'en' ? 'မြန်မာဘာသာ' : 'English'}</span>
      </button>

      <div className="w-full max-w-md p-10 bg-[#0b2236] border border-[#1a3a5c] rounded-3xl shadow-2xl z-10 relative">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto bg-[#f6b84b] text-[#061524] rounded-2xl flex items-center justify-center text-3xl font-black mb-4 shadow-lg shadow-[#f6b84b]/20">BE</div>
          <h1 className="text-2xl font-black text-[#eef8ff] tracking-widest uppercase"><span>BRITIUM EXPRESS</span></h1>
          <p className="text-[#f6b84b] text-[11px] font-bold tracking-[0.16em] uppercase mt-2">
            <span>{t('Enterprise Management Portal', 'လုပ်ငန်းစီမံခန့်ခွဲမှု ဗဟိုစနစ်')}</span>
          </p>
        </div>
        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          <div>
            <label className="block text-[12px] font-bold tracking-wider uppercase mb-2 text-[#4d7a9b]"><span>{t('Business Email', 'လုပ်ငန်းသုံး အီးမေးလ်လိပ်စာ')}</span></label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-[#081b2e] border border-[#1a3a5c] text-white p-4 rounded-xl outline-none focus:border-[#f6b84b] transition-colors text-[14px]" />
          </div>
          <div>
            <label className="block text-[12px] font-bold tracking-wider uppercase mb-2 text-[#4d7a9b]"><span>{t('Password', 'စကားဝှက်')}</span></label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} required className="w-full bg-[#081b2e] border border-[#1a3a5c] text-white p-4 rounded-xl outline-none focus:border-[#f6b84b] transition-colors text-[14px]" />
          </div>
          <button type="submit" disabled={loading} className="mt-4 bg-[#f6b84b] text-[#061524] py-4 rounded-xl font-bold text-[14px] uppercase tracking-wider hover:bg-[#e5a93a] transition-colors disabled:opacity-50 cursor-pointer shadow-xl shadow-[#f6b84b]/10">
            <span>{loading ? '...' : t('Secure Sign In', 'စနစ်သို့ ဝင်ရောက်မည်')}</span>
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── ROUTING MODULE ───
function AppRoutes() {
  const location = useLocation();
  return (
    <AppErrorBoundary pathname={location.pathname}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public Access */}
          <Route path="/" element={<LoginPageComponent />} />
          <Route path="/login" element={<LoginPageComponent />} />
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
            <Route path="/delivery-dispatch" element={<DeliveryDispatchPage />} />
            <Route path="/delivery-workflow" element={<DeliveryWorkflowPage />} />
            <Route path="/dispatch" element={<DispatchPage />} />
            <Route path="/dispatch-center" element={<DispatchCenterPage />} />
            <Route path="/live-dispatch" element={<LiveDispatchWayplanBoard />} />
            <Route path="/doc-print" element={<DocumentPrintStudioPage />} />
            <Route path="/driver" element={<DriverPage />} />
            <Route path="/exceptions" element={<ExceptionsPage />} />
            <Route path="/exec-ops" element={<ExecutiveOpsPage />} />
            <Route path="/finance" element={<FinancePortalPage />} />
            <Route path="/invoice-studio" element={<InvoiceStudioPage />} />
            <Route path="/marketing" element={<MarketingPage />} />
            <Route path="/marketing-portal" element={<MarketingPortalPage />} />
            <Route path="/master-data" element={<MasterDataPage />} />
            <Route path="/merchant-portal" element={<MerchantPortalPage />} />
            <Route path="/ops-command" element={<OpsCommandPage />} />
            <Route path="/ops-manager" element={<OpsManagerPage />} />
            <Route path="/pickup-form" element={<PickupFormPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/rider" element={<RiderPage />} />
            <Route path="/rider-settlement" element={<RiderSettlementPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/supervisor-pickup" element={<SupervisorPickupAssignmentGoLivePage />} />
            <Route path="/supervisor" element={<SupervisorPortalPage />} />
            <Route path="/supervisor-wayplan" element={<SupervisorWayplanReviewPage />} />
            <Route path="/tariff" element={<TariffPage />} />
            <Route path="/warehouse" element={<WarehousePage />} />
            <Route path="/warehouse-operations" element={<WarehouseOperationPage />} />
            <Route path="/waybill-studio" element={<WaybillStudioPage />} />
            <Route path="/wayplan-command" element={<WayplanCommandCenterPage />} />
            <Route path="/wayplan-zone" element={<WayplanZonePage />} />
            <Route path="/workforce-commission" element={<WorkforceCommissionPage />} />
            <Route path="/templates" element={<GoLiveTemplateCenterPage />} />
            <Route path="/go-live-readiness" element={<UATGoLiveCommandCenterPage />} />
          </Route>

          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  );
}

// ─── APP ROOT ───
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