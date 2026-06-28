import { useState, FormEvent, lazy, Suspense, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, Outlet } from 'react-router-dom';
import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';
import { AuthProvider, useAuth } from '@/contexts/auth';
import AppShell from '@/components/AppShell';
import AppErrorBoundary from '@/components/system/AppErrorBoundary';
import EnvironmentBadge from '@/components/system/EnvironmentBadge';

// --- CORE GO-LIVE PAGES ---
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const MasterDataPage = lazy(() => import('@/pages/MasterDataPage'));

// --- OPERATIONS & DISPATCH ---
const WarehousePage = lazy(() => import('@/pages/WarehouseOperations'));
const DispatchCenterGoLivePage = lazy(() => import('@/pages/dispatch/DispatchCenterGoLivePage')); 
const SupervisorPickupAssignmentGoLivePage = lazy(() => import('@/pages/SupervisorPickupAssignmentGoLivePage'));

// --- FINANCE & CS ---
const FinancePortalPage = lazy(() => import('@/pages/FinancePortalPage'));
const CustomerServicePortalPage = lazy(() => import('@/pages/CustomerServicePortalPage'));
const ExceptionsPage = lazy(() => import('@/pages/ExceptionsPage'));

// --- ADMIN & CORPORATE ---
const AdminHRPage = lazy(() => import('@/pages/AdminHRPage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));
const MarketingPage = lazy(() => import('@/pages/MarketingPage'));
const TariffPage = lazy(() => import('@/pages/TariffPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const SignupPage = lazy(() => import('@/pages/SignupPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'));

// --- BRANDING ---
const VIDEO_URL = 'https://skyagent-artifacts.skywork.ai/router/agent/2026-06-09/prod_agent_73dcc7b2-6a06-4769-ba6f-a24e8e15113e/background_a93e0a05bfce4d5fa60d226584905742.mp4';
const LOGO_URL  = 'https://skyagent-artifacts.skywork.ai/router/agent/2026-06-09/prod_agent_73dcc7b2-6a06-4769-ba6f-a24e8e15113e/logo_869b883bce9e40f59d6394b5f754ef08.png';
const YEAR = new Date().getFullYear();

type L = 'en' | 'my';

const LT: Record<L, Record<string, string>> = {
  en: {
    title: 'BRITIUM EXPRESS', 
    tagline: 'Enterprise Management Portal',
    login: 'Sign In', 
    signup: 'Request Access', 
    reset: 'Recover Password',
    email: 'Email Address', 
    pw: 'Password', 
    btnLogin: 'Sign In to Portal', 
    btnSignup: 'Request Access', 
    btnReset: 'Send Reset Link',
    forgot: 'Forgot password?', 
    createAcc: 'Request portal access →',
    backLogin: '← Back to Sign In', 
    footer: 'Authorised personnel only',
    phEmail: 'you@britiumexpress.com', 
    phPw: '••••••••',
    phName: 'Full Name', 
    phPhone: 'Phone (09-XXXXXXX)',
    processing: 'Authenticating…', 
    success: '✅ Access granted — redirecting…',
    errEmail: 'Email is required', 
    errPw: 'Password is required',
    portal: 'ENTERPRISE PORTAL', 
    version: 'v2026',
  },
  my: {
    title: 'BRITIUM EXPRESS', 
    tagline: 'စီမံခန့်ခွဲမှု Enterprise Portal',
    login: 'ဝင်ရောက်', 
    signup: 'ဝင်ခွင့်တောင်းဆို', 
    reset: 'စကားဝှက်ပြန်ရယူ',
    email: 'အီးမေးလ်လိပ်စာ', 
    pw: 'စကားဝှက်', 
    btnLogin: 'Portal ဝင်ရောက်', 
    btnSignup: 'ဝင်ခွင့်တောင်းဆိုရန်', 
    btnReset: 'Link ပို့မည်',
    forgot: 'မေ့သွားသလား?', 
    createAcc: 'Portal ဝင်ခွင့်တောင်းဆို →',
    backLogin: '← ဝင်ရောက်မှုသို့', 
    footer: 'ခွင့်ပြုထားသောဝန်ထမ်းများသာ',
    phEmail: 'you@britiumexpress.com', 
    phPw: '••••••••',
    phName: 'အမည်အပြည့်အစုံ', 
    phPhone: 'ဖုန်း (09-XXXXXXX)',
    processing: 'အတည်ပြုနေသည်…', 
    success: '✅ ဝင်ခွင့်ရပြီ — ဆောင်ရွက်နေသည်…',
    errEmail: 'အီးမေးလ် လိုအပ်သည်', 
    errPw: 'စကားဝှက် လိုအပ်သည်',
    portal: 'ENTERPRISE PORTAL', 
    version: 'v2026',
  },
};

function LoginPage() {
  const [lang, setLang] = useState<L>('en');
  const [tab, setTab]   = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail]   = useState('');
  const [pw, setPw]         = useState('');
  const [name, setName]     = useState('');
  const [phone, setPhone]   = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState('');
  const [errs, setErrs]       = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const t = LT[lang];

  useEffect(() => {
    import('@/integrations/supabase/client').then(({ supabase: sb }) => {
      sb.auth.getSession().then(({ data }) => {
        if (data.session) navigate('/dashboard', { replace: true });
      });
    });
  }, [navigate]);

  const inp: React.CSSProperties = {
    width: '100%', padding: '12px 14px',
    border: '1.5px solid #e4e4e7', borderRadius: 10,
    background: '#fafafa', color: '#18181b',
    fontSize: 14, fontWeight: 500, outline: 'none',
    fontFamily: "'Poppins', sans-serif",
    transition: 'border-color 0.15s',
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const e2: Record<string, string> = {};
    if (!email.trim()) e2.email = t.errEmail;
    if (tab !== 'reset' && !pw.trim()) e2.pw = t.errPw;
    if (Object.keys(e2).length) { setErrs(e2); return; }
    
    setLoading(true); setErrs({});
    try {
      const { supabase: sb } = await import('@/integrations/supabase/client');
      if (tab === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pw });
        if (error) throw error;
        setMsg(t.success);
        setTimeout(() => navigate('/dashboard', { replace: true }), 700);
      } else if (tab === 'signup') {
        // Backend handles role provisioning mapping based on user_registry, so frontend role isn't passed
        const { error } = await sb.auth.signUp({ email: email.trim(), password: pw, options: { data: { full_name: name, phone } } });
        if (error) throw error;
        setMsg(lang === 'en' ? '✅ Request submitted. Await admin approval.' : '✅ တောင်းဆိုချက် ပို့ပြီး — Admin ခွင့်ပြုချက် စောင့်ဆိုင်းနေသည်');
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim());
        if (error) throw error;
        setMsg(lang === 'en' ? '📧 Reset link sent to your email.' : '📧 Reset link ကို email သို့ ပို့ပြီးပါပြီ');
      }
    } catch (err: any) { setErrs({ g: err.message || 'Authentication error' }); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', width: '100%', overflow: 'hidden', fontFamily: "'Poppins', sans-serif" }}>
      <video style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} src={VIDEO_URL} autoPlay muted loop playsInline/>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(140deg,rgba(4,14,28,0.90) 0%,rgba(8,22,45,0.78) 50%,rgba(6,12,24,0.88) 100%)' }}/>

      <button onClick={() => setLang(l => l === 'en' ? 'my' : 'en')} style={{ position: 'absolute', top: 18, right: 18, zIndex: 30, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(8px)', fontFamily: "'Poppins', sans-serif" }}>
        🌐 {lang === 'en' ? 'မြန်မာ' : 'EN'}
      </button>

      <div style={{ position: 'relative', zIndex: 10, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          
          {/* Header Branding */}
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <div style={{ width: 66, height: 66, borderRadius: 16, overflow: 'hidden', background: '#fff', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 30px rgba(0,0,0,0.35)' }}>
              <img src={LOGO_URL} alt="Britium Express" style={{ width: '100%', height: '100%', objectFit: 'contain' }}/>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '0.1em', margin: 0, fontFamily: "'Poppins', sans-serif" }}>{t.title}</h1>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.2em', marginTop: 8, textTransform: 'uppercase', fontFamily: "'Poppins', sans-serif" }}>{t.tagline}</p>
          </div>

          <div style={{ background: '#fff', borderRadius: 22, boxShadow: '0 24px 70px rgba(0,0,0,0.50)', overflow: 'hidden' }}>
            {/* Tab Switcher */}
            <div style={{ display: 'flex', background: '#f4f4f5', margin: '20px 20px 0', borderRadius: 14, padding: 4 }}>
              {(['login', 'signup', 'reset'] as const).map(m => (
                <button key={m} onClick={() => { setTab(m); setMsg(''); setErrs({}); }} style={{ flex: 1, padding: '10px 4px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: "'Poppins', sans-serif", background: tab === m ? '#fff' : 'transparent', color: tab === m ? '#18181b' : '#71717a', boxShadow: tab === m ? '0 1px 4px rgba(0,0,0,0.12)' : 'none', transition: 'all 0.15s' }}>
                  {m === 'login' ? t.login : m === 'signup' ? t.signup : t.reset}
                </button>
              ))}
            </div>

            <div style={{ padding: '24px 24px 20px' }}>
              {msg && <div style={{ padding: '12px 14px', marginBottom: 16, borderRadius: 10, fontSize: 13, fontWeight: 600, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontFamily: "'Poppins', sans-serif" }}>{msg}</div>}
              {errs.g && <div style={{ padding: '12px 14px', marginBottom: 16, borderRadius: 10, fontSize: 13, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontFamily: "'Poppins', sans-serif" }}>{errs.g}</div>}

              <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
                {tab === 'signup' && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, fontFamily: "'Poppins', sans-serif" }}>{t.phName}</label>
                      <input value={name} onChange={e => setName(e.target.value)} placeholder={t.phName} style={inp}/>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, fontFamily: "'Poppins', sans-serif" }}>{t.phPhone}</label>
                      <input value={phone} onChange={e => setPhone(e.target.value)} placeholder={t.phPhone} style={inp}/>
                    </div>
                  </>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, fontFamily: "'Poppins', sans-serif" }}>{t.email}</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t.phEmail} style={inp}/>
                  {errs.email && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 4, fontFamily: "'Poppins', sans-serif" }}>{errs.email}</p>}
                </div>

                {tab !== 'reset' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: "'Poppins', sans-serif" }}>{t.pw}</label>
                      {tab === 'login' && <button type="button" onClick={() => setTab('reset')} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: "'Poppins', sans-serif" }}>{t.forgot}</button>}
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input type={showPw ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} placeholder={t.phPw} style={inp}/>
                      <button type="button" onClick={() => setShowPw(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#71717a', padding: '2px 4px' }}>
                        {showPw ? '🙈' : '👁'}
                      </button>
                    </div>
                    {errs.pw && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 4, fontFamily: "'Poppins', sans-serif" }}>{errs.pw}</p>}
                  </div>
                )}

                <button type="submit" disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', background: loading ? '#d4a438' : '#f59e0b', color: '#1c1917', fontSize: 14, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4, boxShadow: '0 4px 18px rgba(245,158,11,0.32)', fontFamily: "'Poppins', sans-serif", transition: 'all 0.15s' }}>
                  {loading ? t.processing : tab === 'login' ? t.btnLogin : tab === 'signup' ? t.btnSignup : t.btnReset}
                </button>
              </form>

              <div style={{ textAlign: 'center', marginTop: 20 }}>
                {tab === 'login'
                  ? <button onClick={() => setTab('signup')} style={{ fontSize: 13, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: "'Poppins', sans-serif" }}>{t.createAcc}</button>
                  : <button onClick={() => setTab('login')} style={{ fontSize: 13, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: "'Poppins', sans-serif" }}>{t.backLogin}</button>}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)', textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)', margin: 0, fontFamily: "'Poppins', sans-serif", fontWeight: 500 }}>{t.footer}</p>
          </div>
          <p style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: 'rgba(255,255,255,0.20)', fontFamily: "'Poppins', sans-serif" }}>
            © {YEAR} Britium Express · Britium Ventures Co., Ltd
          </p>
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div style={{ minHeight: '100vh', background: '#061524', display: 'grid', placeItems: 'center', fontFamily: "'Poppins', sans-serif" }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 44, height: 44, border: '3px solid #1a3a5c', borderTopColor: '#f6b84b', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }}/>
        <p style={{ color: '#4d7a9b', fontSize: 13, fontWeight: 700, letterSpacing: '0.08em' }}>BRITIUM ENTERPRISE</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function AuthLayout() {
  const auth = useAuth() as any;
  const session = auth?.session;
  const loading = Boolean(auth?.loading || auth?.isLoading || auth?.initializing);

  if (loading) return <Loading />;
  if (!session) return <Navigate to="/" replace />;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <HashRouter>
          <EnvironmentBadge />
          <AppErrorBoundary>
            <Suspense fallback={<Loading />}>
            <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            {/* ══ CONSOLIDATED GO-LIVE ROUTES ══ */}
            <Route element={<AuthLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/master-data" element={<MasterDataPage />} />
              
              {/* Operations Unified Core */}
              <Route path="/warehouse" element={<WarehousePage />} />
              <Route path="/dispatch" element={<DispatchCenterGoLivePage />} />
              <Route path="/supervisor-pickup" element={<SupervisorPickupAssignmentGoLivePage />} />
              <Route path="/exceptions" element={<ExceptionsPage />} />
              <Route path="/tariff" element={<TariffPage />} />

              {/* Finance & Customer Service */}
              <Route path="/finance" element={<FinancePortalPage />} />
              <Route path="/cs-portal" element={<CustomerServicePortalPage />} />
              
              {/* Corporate */}
              <Route path="/admin-hr" element={<AdminHRPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/marketing" element={<MarketingPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          </AppErrorBoundary>
        </HashRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}