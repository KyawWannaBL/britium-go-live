// @ts-nocheck
import { useState, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, PackagePlus, Send, Truck, Route, AlertTriangle,
  Shield, ClipboardCheck, Bike, Car, BadgeDollarSign,
  Command, Gauge, Star, Map, MapPin,
  DollarSign, Banknote, BookOpen, Tag, FileText, Wallet,
  FileCheck, Printer,
  Store, Users, Headphones, Radio,
  Building, Building2, UserCog, Database, Server,
  BarChart3, ScrollText,
  Megaphone, Globe, TrendingUp,
  User, Settings, LogOut, Bell, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Menu, X
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/auth';
import { supabase } from '@/integrations/supabase/client';

/* ── Brand ─────────────────────────────────────────────────── */
const LOGO = 'https://skyagent-artifacts.skywork.ai/router/agent/2026-06-09/prod_agent_73dcc7b2-6a06-4769-ba6f-a24e8e15113e/logo_869b883bce9e40f59d6394b5f754ef08.png';
const C = {
  bg:       '#061524',
  panel:    '#081b2e',
  header:   '#040e1a',
  active:   '#0f2a42',
  hover:    '#0c2235',
  border:   '#1a3a5c',
  gold:     '#f6b84b',
  text:     '#c8dff0',
  muted:    '#4d7a9b',
  white:    '#eef8ff',
  accent:   '#ff8a4c',
  green:    '#22c55e',
  red:      '#ff4f86',
};

/* ── Nav Definition ─────────────────────────────────────────── */
type NavItem = { path: string; Icon: any; en: string; my: string; badge?: string; };
type Section  = { en: string; my: string; items: NavItem[]; };

const NAV: Section[] = [
  {
    en: 'Overview', my: 'ခြုံငုံကြည့်',
    items: [
      { path: '/dashboard',         Icon: LayoutDashboard, en: 'Dashboard',          my: 'ဒက်ရှ်ဘုတ်' },
    ],
  },
  {
    en: 'Operations', my: 'လုပ်ငန်းဆောင်ရွက်မှု',
    items: [
      { path: '/warehouse',         Icon: Package,         en: 'Warehouse',           my: 'သိုလှောင်ရုံ' },
      { path: '/pickup-form',       Icon: PackagePlus,     en: 'Pickup Entry',        my: 'ကုန်မှတ်ပုံတင်' },
      { path: '/dispatch',          Icon: Send,            en: 'Dispatch',            my: 'ပေးပို့စတင်' },
      { path: '/delivery-dispatch', Icon: Truck,           en: 'Delivery Dispatch',   my: 'ပေးပို့စီမံ' },
      { path: '/delivery-workflow', Icon: Route,           en: 'Delivery Workflow',   my: 'ပေးပို့လုပ်ငန်းစဉ်' },
      { path: '/exceptions',        Icon: AlertTriangle,   en: 'Exceptions',          my: 'ချွေလျင်မှု' },
    ],
  },
  {
    en: 'Workforce', my: 'လုပ်သားအင်အား',
    items: [
      { path: '/supervisor',        Icon: Shield,          en: 'Supervisor Portal',   my: 'ကြီးကြပ်ရေး' },
      { path: '/supervisor-pickup', Icon: ClipboardCheck,  en: 'Pickup Assignment',   my: 'ကြိုဆောင်ရွက်' },
      { path: '/rider',             Icon: Bike,            en: 'Rider Management',    my: 'ရိုက်ဒါစီမံ' },
      { path: '/driver',            Icon: Car,             en: 'Driver Management',   my: 'ဒရိုင်ဘာစီမံ' },
      { path: '/workforce-commission', Icon: BadgeDollarSign, en: 'Workforce Commission', my: 'ကော်မရှင်' },
    ],
  },
  {
    en: 'Command Center', my: 'ကွပ်ကဲမှုစင်တာ',
    items: [
      { path: '/ops-command',       Icon: Command,         en: 'Ops Command',         my: 'လုပ်ငန်းကွပ်ကဲ' },
      { path: '/ops-manager',       Icon: Gauge,           en: 'Ops Manager',         my: 'မန်နေဂျာဒက်ရှ်' },
      { path: '/executive-ops',     Icon: Star,            en: 'Executive Ops',       my: 'အမှုဆောင်ဒက်ရှ်' },
      { path: '/wayplan-command',   Icon: Map,             en: 'Wayplan Command',     my: 'ကားလမ်းစီမံ' },
      { path: '/wayplan-zone',      Icon: MapPin,          en: 'Wayplan Zone',        my: 'ဇုန်စီမံ' },
    ],
  },
  {
    en: 'Finance', my: 'ဘဏ္ဍာရေး',
    items: [
      { path: '/finance',           Icon: DollarSign,      en: 'Finance Portal',      my: 'ဘဏ္ဍာရေးစင်တာ' },
      { path: '/cod-settlement',    Icon: Banknote,        en: 'COD Settlement',      my: 'COD ဆပ်ငွေ' },
      { path: '/accounts',          Icon: BookOpen,        en: 'Accounts',            my: 'ငွေစာရင်း' },
      { path: '/tariff',            Icon: Tag,             en: 'Tariff',              my: 'ကုန်ခနှုန်း' },
      { path: '/invoice-studio',    Icon: FileText,        en: 'Invoice Studio',      my: 'ငွေတောင်းခံ' },
      { path: '/rider-settlement',  Icon: Wallet,          en: 'Rider Settlement',    my: 'ရိုက်ဒါဆပ်ငွေ' },
    ],
  },
  {
    en: 'Documents', my: 'စာရွက်စာတမ်း',
    items: [
      { path: '/waybill-studio',    Icon: FileCheck,       en: 'Waybill Studio',      my: 'ကုန်တင်လက်မှတ်' },
      { path: '/document-studio',   Icon: Printer,         en: 'Document Studio',     my: 'စာရွက်ပုံနှိပ်' },
    ],
  },
  {
    en: 'Portals', my: 'ဝဝ်ဘ်ပေါ်တယ်',
    items: [
      { path: '/merchant-portal',   Icon: Store,           en: 'Merchant Portal',     my: 'ကုန်သည်ပေါ်တယ်' },
      { path: '/customer-portal',   Icon: Users,           en: 'Customer Portal',     my: 'ဖောက်သည်ပေါ်တယ်' },
      { path: '/cs-portal',         Icon: Headphones,      en: 'CS Portal',           my: 'CS ဝန်ဆောင်မှု' },
      { path: '/cs-command',        Icon: Radio,           en: 'CS Command',          my: 'CS ကွပ်ကဲ' },
    ],
  },
  {
    en: 'Branch & Admin', my: 'ဌာနခွဲနှင့်စီမံ',
    items: [
      { path: '/branch-admin',      Icon: Building,        en: 'Branch Admin',        my: 'ဌာနခွဲစီမံ' },
      { path: '/branch-office',     Icon: Building2,       en: 'Branch Office',       my: 'ဌာနခွဲရုံး' },
      { path: '/admin-hr',          Icon: UserCog,         en: 'Admin / HR',          my: 'HR စီမံ' },
      { path: '/data-entry',        Icon: Database,        en: 'Data Entry',          my: 'ဒေတာသွင်း' },
      { path: '/master-data',       Icon: Server,          en: 'Master Data',         my: 'မာစတာဒေတာ' },
    ],
  },
  {
    en: 'Analytics', my: 'ခွဲခြမ်းစိတ်ဖြာ',
    items: [
      { path: '/analytics',         Icon: BarChart3,       en: 'Analytics',           my: 'ခွဲခြမ်းစိတ်ဖြာ' },
      { path: '/audit-logs',        Icon: ScrollText,      en: 'Audit Logs',          my: 'စစ်ဆေးမှတ်တမ်း' },
    ],
  },
  {
    en: 'Growth', my: 'ကုမ္ပဏီတိုးတက်မှု',
    items: [
      { path: '/marketing',         Icon: Megaphone,       en: 'Marketing',           my: 'မားကတ်တင်း' },
      { path: '/marketing-portal',  Icon: Globe,           en: 'Marketing Portal',    my: 'မားကတ်တင်းပေါ်တယ်' },
      { path: '/biz-dev',           Icon: TrendingUp,      en: 'Business Dev',        my: 'စီးပွားဖွံ့ဖြိုး' },
    ],
  },
];

const BOTTOM_NAV: NavItem[] = [
  { path: '/profile',  Icon: User,     en: 'Profile',  my: 'ကိုယ်ရေး' },
  { path: '/settings', Icon: Settings, en: 'Settings', my: 'ဆက်တင်' },
];

/* ── Props ──────────────────────────────────────────────────── */
interface AppShellProps {
  children: ReactNode;
  role?: string;
  onOpenProfile?: () => void;
}

/* ── Component ──────────────────────────────────────────────── */
export default function AppShell({ children, role, onOpenProfile }: AppShellProps) {
  const { lang, toggle: toggleLang } = useLanguage();
  const { session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen]         = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [collapsed, setCollapsed]             = useState<Record<string, boolean>>({});

  const L = (item: { en: string; my: string }) => lang === 'my' ? item.my : item.en;

  const isActive = (path: string) =>
    path === '/dashboard'
      ? location.pathname === path
      : location.pathname.startsWith(path);

  const toggleSection = (key: string) =>
    setCollapsed(p => ({ ...p, [key]: !p[key] }));

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const userEmail = session?.user?.email ?? 'staff@britiumexpress.com';
  const userInitial = userEmail.charAt(0).toUpperCase();
  const displayRole = role ?? session?.user?.user_metadata?.role ?? 'staff';

  /* Sidebar inner ─────────────────────────────────────────── */
  const SidebarContent = () => (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Logo */}
      <div style={{ padding: sidebarOpen ? '20px 20px 16px' : '20px 10px 16px', display:'flex', alignItems:'center', gap:10, borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        <div style={{ width:34, height:34, borderRadius:8, overflow:'hidden', flexShrink:0, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <img src={LOGO} alt="Britium" style={{ width:'100%', height:'100%', objectFit:'contain' }}/>
        </div>
        {sidebarOpen && (
          <div style={{ overflow:'hidden', lineHeight:1 }}>
            <div style={{ fontSize:13, fontWeight:900, color:C.white, letterSpacing:'0.06em', whiteSpace:'nowrap' }}>BRITIUM</div>
            <div style={{ fontSize:9, fontWeight:700, color:C.gold, letterSpacing:'0.14em', marginTop:2, whiteSpace:'nowrap' }}>EXPRESS ENTERPRISE</div>
          </div>
        )}
      </div>

      {/* Scrollable nav */}
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'8px 0' }}>
        {NAV.map(section => {
          const secKey = section.en;
          const isCollapsed = collapsed[secKey];
          return (
            <div key={secKey} style={{ marginBottom:2 }}>
              {/* Section header */}
              {sidebarOpen ? (
                <button
                  onClick={() => toggleSection(secKey)}
                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'5px 16px', background:'none', border:'none', cursor:'pointer', gap:6 }}
                >
                  <span style={{ fontSize:10, fontWeight:800, color:C.muted, letterSpacing:'0.10em', textTransform:'uppercase', fontFamily:'Pyidaungsu,Inter,sans-serif' }}>
                    {L(section)}
                  </span>
                  {isCollapsed
                    ? <ChevronDown size={12} color={C.muted}/>
                    : <ChevronUp   size={12} color={C.muted}/>}
                </button>
              ) : (
                <div style={{ margin:'4px 0 2px', borderTop:`1px solid ${C.border}22` }}/>
              )}

              {/* Items */}
              {!isCollapsed && section.items.map(item => {
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileSidebarOpen(false)}
                    style={{
                      display:'flex', alignItems:'center',
                      gap: sidebarOpen ? 10 : 0,
                      justifyContent: sidebarOpen ? 'flex-start' : 'center',
                      padding: sidebarOpen ? '7px 16px' : '8px',
                      margin:'1px 6px',
                      borderRadius:8,
                      textDecoration:'none',
                      background: active ? C.active : 'transparent',
                      borderLeft: active ? `3px solid ${C.gold}` : '3px solid transparent',
                      transition:'all 0.15s',
                    }}
                    onMouseEnter={e => { if(!active)(e.currentTarget as HTMLElement).style.background=C.hover; }}
                    onMouseLeave={e => { if(!active)(e.currentTarget as HTMLElement).style.background='transparent'; }}
                    title={sidebarOpen ? undefined : (lang==='my' ? item.my : item.en)}
                  >
                    <item.Icon
                      size={15}
                      color={active ? C.gold : C.text}
                      strokeWidth={active ? 2.2 : 1.6}
                      style={{ flexShrink:0 }}
                    />
                    {sidebarOpen && (
                      <span style={{
                        fontSize:12.5, fontWeight: active ? 700 : 500,
                        color: active ? C.white : C.text,
                        fontFamily:'Pyidaungsu,Inter,sans-serif',
                        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                      }}>
                        {L(item)}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Bottom nav */}
      <div style={{ borderTop:`1px solid ${C.border}`, padding:'8px 0', flexShrink:0 }}>
        {BOTTOM_NAV.map(item => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display:'flex', alignItems:'center',
                gap: sidebarOpen ? 10 : 0,
                justifyContent: sidebarOpen ? 'flex-start' : 'center',
                padding: sidebarOpen ? '7px 16px' : '8px',
                margin:'1px 6px',
                borderRadius:8,
                textDecoration:'none',
                background: active ? C.active : 'transparent',
                borderLeft: active ? `3px solid ${C.gold}` : '3px solid transparent',
              }}
              onMouseEnter={e => { if(!active)(e.currentTarget as HTMLElement).style.background=C.hover; }}
              onMouseLeave={e => { if(!active)(e.currentTarget as HTMLElement).style.background='transparent'; }}
            >
              <item.Icon size={15} color={active ? C.gold : C.text} strokeWidth={active ? 2.2 : 1.6} style={{ flexShrink:0 }}/>
              {sidebarOpen && (
                <span style={{ fontSize:12.5, fontWeight: active ? 700 : 500, color: active ? C.white : C.text, fontFamily:'Pyidaungsu,Inter,sans-serif' }}>
                  {L(item)}
                </span>
              )}
            </Link>
          );
        })}

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          style={{
            display:'flex', alignItems:'center',
            gap: sidebarOpen ? 10 : 0,
            justifyContent: sidebarOpen ? 'flex-start' : 'center',
            width:'100%', padding: sidebarOpen ? '7px 16px' : '8px',
            margin:'1px 6px', width:'calc(100% - 12px)',
            borderRadius:8, border:'none', cursor:'pointer',
            background:'transparent',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background=C.hover}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}
          title={sidebarOpen ? undefined : 'Sign Out'}
        >
          <LogOut size={15} color={C.red} strokeWidth={1.8} style={{ flexShrink:0 }}/>
          {sidebarOpen && (
            <span style={{ fontSize:12.5, fontWeight:500, color:C.red, fontFamily:'Pyidaungsu,Inter,sans-serif' }}>
              {lang==='my' ? 'ထွက်သွား' : 'Sign Out'}
            </span>
          )}
        </button>

        {/* User info */}
        {sidebarOpen && (
          <div style={{ margin:'8px 10px 4px', padding:'8px 10px', borderRadius:8, background:C.active, border:`1px solid ${C.border}` }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:28, height:28, borderRadius:7, background:`linear-gradient(135deg,${C.gold},#e07a20)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:12, fontWeight:800, color:'#1a0a00' }}>
                {userInitial}
              </div>
              <div style={{ overflow:'hidden' }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.white, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{userEmail}</div>
                <div style={{ fontSize:10, color:C.gold, fontWeight:700, textTransform:'capitalize', marginTop:1 }}>{displayRole}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  /* ── Layout ─────────────────────────────────────────────── */
  const sidebarW = sidebarOpen ? 260 : 64;

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#040f1c', fontFamily:"'Pyidaungsu','Poppins',Inter,system-ui,sans-serif" }}>

      {/* Desktop sidebar */}
      <aside style={{
        width: sidebarW, flexShrink:0, background:C.bg,
        borderRight:`1px solid ${C.border}`,
        display:'flex', flexDirection:'column',
        position:'fixed', top:0, left:0, bottom:0, zIndex:50,
        transition:'width 0.22s cubic-bezier(.4,0,.2,1)',
        overflowX:'hidden',
      }}>
        <SidebarContent/>
      </aside>

      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:99, display:'flex' }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(2px)' }} onClick={() => setMobileSidebarOpen(false)}/>
          <aside style={{ position:'relative', zIndex:100, width:260, background:C.bg, borderRight:`1px solid ${C.border}`, display:'flex', flexDirection:'column' }}>
            <button onClick={() => setMobileSidebarOpen(false)} style={{ position:'absolute', top:8, right:8, background:'none', border:'none', cursor:'pointer', color:C.muted, zIndex:10 }}><X size={18}/></button>
            <SidebarContent/>
          </aside>
        </div>
      )}

      {/* Main area */}
      <div style={{ flex:1, marginLeft:sidebarW, display:'flex', flexDirection:'column', minHeight:'100vh', transition:'margin-left 0.22s cubic-bezier(.4,0,.2,1)' }}>

        {/* Header */}
        <header style={{
          height:52, background:C.header, borderBottom:`1px solid ${C.border}`,
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'0 20px', position:'sticky', top:0, zIndex:40, flexShrink:0,
        }}>
          {/* Left: collapse toggle + breadcrumb */}
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {/* Desktop collapse */}
            <button
              onClick={() => setSidebarOpen(p => !p)}
              style={{ display:'none', background:'none', border:`1px solid ${C.border}`, borderRadius:7, padding:'5px 7px', cursor:'pointer', color:C.muted }}
              className="desktop-toggle"
            >
              {sidebarOpen ? <ChevronLeft size={15}/> : <ChevronRight size={15}/>}
            </button>
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileSidebarOpen(true)}
              style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:7, padding:'5px 7px', cursor:'pointer', color:C.muted }}
            >
              <Menu size={15}/>
            </button>

            <div style={{ height:20, width:1, background:C.border }}/>
            <div style={{ fontSize:11, fontWeight:700, color:C.muted, fontFamily:'Pyidaungsu,Inter,sans-serif' }}>
              {lang === 'my' ? 'ဘရစ်တီယမ် Express စီမံခန့်ခွဲမှုစနစ်' : 'Britium Express · Enterprise Management System'}
            </div>
          </div>

          {/* Right: controls */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {/* Sidebar collapse (desktop, always visible) */}
            <button
              onClick={() => setSidebarOpen(p => !p)}
              style={{ background:`${C.border}55`, border:`1px solid ${C.border}`, borderRadius:7, padding:'5px 8px', cursor:'pointer', display:'flex', alignItems:'center', gap:5, color:C.text, fontSize:11, fontWeight:700 }}
            >
              {sidebarOpen ? <ChevronLeft size={13}/> : <ChevronRight size={13}/>}
            </button>

            {/* Language toggle */}
            <button
              onClick={toggleLang}
              style={{ background:`${C.border}55`, border:`1px solid ${C.border}`, borderRadius:7, padding:'5px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:5, color:C.text, fontSize:11, fontWeight:800, letterSpacing:'0.04em' }}
            >
              🌐 {lang === 'en' ? 'မြန်မာ' : 'EN'}
            </button>

            {/* Notification bell */}
            <button style={{ position:'relative', background:`${C.border}55`, border:`1px solid ${C.border}`, borderRadius:7, padding:'5px 8px', cursor:'pointer', color:C.text }}>
              <Bell size={14}/>
              <span style={{ position:'absolute', top:3, right:3, width:6, height:6, borderRadius:'50%', background:C.red, border:`1.5px solid ${C.header}` }}/>
            </button>

            {/* Avatar */}
            <button
              onClick={onOpenProfile}
              style={{ width:30, height:30, borderRadius:8, background:`linear-gradient(135deg,${C.gold},#e07a20)`, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#1a0a00' }}
              title={userEmail}
            >
              {userInitial}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex:1, overflow:'auto' }}>
          {children}
        </main>
      </div>

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#040f1c;font-family:'Poppins',Inter,system-ui,sans-serif;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px;}
        ::-webkit-scrollbar-thumb:hover{background:${C.muted};}
        a{text-decoration:none;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
    </div>
  );
}
