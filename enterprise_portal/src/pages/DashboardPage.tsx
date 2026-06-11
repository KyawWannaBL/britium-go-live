import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, Zap, AlertTriangle, Truck, Package,
  Users, GitBranch, Clock, DollarSign, Activity,
  TrendingUp, Bell, Route, Shield, FileText, BarChart2,
  type LucideIcon
} from 'lucide-react'

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' }
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" }

type MilestoneStatus = 'pass' | 'partial' | 'empty' | 'checking'
type Language = 'EN' | 'MM'
type SystemStatus = 'LIVE' | 'STANDBY' | 'MAINTENANCE'
type HealthTranslationKey = 'hcPickup' | 'hcTariff' | 'hcWorkforce' | 'hcBranch' | 'hcMasterData'

interface MilestoneResult {
  status: MilestoneStatus
  detail: string
}

interface KpiData {
  totalPickupRequests: number
  activeCargoEvents: number
  workforceAccounts: number
  activeBranches: number
  exceptionsToday: number
  codPending: number
  fleetAvailable: number
  userAccounts: number
}

interface HealthCheck {
  table: string
  key: HealthTranslationKey
  count: number
  ok: boolean
  error: boolean
}

const TRANSLATIONS = {
  EN: {
    dashboardTitle: 'Dashboard',
    dashboardDesc: 'Unified readiness dashboard with go-live milestones, health checks, and operational KPIs.',
    refresh: 'Refresh',
    goLiveReadiness: 'Go-Live Readiness',
    progress: 'Progress',
    milestonesPassing: 'milestones passing',
    synced: 'Synced',
    backendHealth: 'Backend Health Checks',
    lastSync: 'Last sync:',
    postGoLive: 'Post-Go-Live Monitoring',
    dailyMetrics: 'Daily Metrics',
    monitor: 'MONITOR',
    postGoLiveDesc: 'Post-go-live monitoring activates once M9 (Dry Run Passed) is confirmed. All metrics feed into the operations analytics pipeline.',
    footerTitle: 'BRITIUM EXPRESS · GO-LIVE CONTROL DASHBOARD · v2.0',
    
    // Status
    statusPass: 'PASS',
    statusPartial: 'PARTIAL',
    statusEmpty: 'EMPTY',
    statusChecking: 'CHECKING',
    statusLive: 'LIVE',
    statusStandby: 'STANDBY',
    statusMaintenance: 'MAINTENANCE',
    sysOk: 'OK',
    sysFail: 'FAIL',
    sysErr: 'ERR',

    // Milestones
    m1Label: 'Master Data Ready',
    m1Criteria: 'Dropdowns and master records load from backend',
    m2Label: 'Runtime Cleanup Complete',
    m2Criteria: 'Operations, Dispatch, Delivery, Warehouse, Supervisor show no sample rows',
    m3Label: 'Account Provisioning Complete',
    m3Criteria: '182 accounts active and role-mapped',
    m4Label: 'Portal Submission Ready',
    m4Criteria: 'Merchant/Customer/CS submit to same backend pickup workflow',
    m5Label: 'Assignment Ready',
    m5Criteria: 'Supervisor can assign real pickups to workforce users',
    m6Label: 'Tracking Ready',
    m6Criteria: 'Cargo events update Merchant/Customer/CS tracking',
    m7Label: 'Branch Ready',
    m7Criteria: 'MDY/NPT branch screens load and filter correctly',
    m8Label: 'Tariff Ready',
    m8Criteria: 'Tariff calculation matches approved logic',
    m9Label: 'Go-Live Dry Run Passed',
    m9Criteria: 'One complete pickup lifecycle succeeds end-to-end',

    // Detail Strings
    m1DetailPass: (n: number) => `${n} master records`,
    m1DetailEmpty: 'No master records found',
    m2DetailPass: 'All operational tables clean — ready for go-live',
    m2DetailPartial: (n: number) => `${n} sample rows remain`,
    m2DetailEmpty: (n: number) => `${n} rows to clean`,
    m3DetailPass: (n: number) => `${n} accounts provisioned`,
    m3DetailPartial: (n: number) => `${n}/182 accounts active`,
    m3DetailEmpty: (n: number) => `${n}/182 accounts found`,
    m4DetailPass: (n: number) => `Table active (${n} records)`,
    m5DetailPass: (n: number) => `${n} workforce accounts`,
    m5DetailEmpty: 'No workforce accounts',
    m6DetailPass: (n: number) => `${n} cargo events logged`,
    m6DetailPartial: 'No cargo events yet',
    m7DetailPass: (n: number) => `${n} branches registered`,
    m7DetailPartial: (n: number) => `${n}/2 branches registered`,
    m7DetailEmpty: 'No branch nodes found',
    m8DetailPass: (n: number) => `${n} tariff rules loaded`,
    m8DetailEmpty: 'No tariff rules found',
    m9DetailPartial: 'Prerequisites met — dry run pending',
    m9DetailEmptyIncomplete: 'Pre-requisites incomplete',
    m9DetailEmptyNotReady: 'System not ready for dry run',
    unreachable: (t: string) => `${t} unreachable`,

    // KPIs
    kpiPickup: 'PICKUP REQUESTS',
    kpiCargo: 'ACTIVE CARGO EVENTS',
    kpiWorkforce: 'WORKFORCE ACCOUNTS',
    kpiBranches: 'ACTIVE BRANCHES',
    kpiExceptions: 'EXCEPTIONS TODAY',
    kpiCod: 'COD PENDING',
    kpiFleet: 'FLEET AVAILABLE',
    kpiUsers: 'USER ACCOUNTS',

    // Health Checks
    hcPickup: 'Pickup Requests Table',
    hcTariff: 'Tariff Master',
    hcWorkforce: 'Workforce Accounts',
    hcBranch: 'Branch Registry',
    hcMasterData: 'Master Data Options',

    // Post Go-Live
    pgPickup: 'Pickup Requests Created',
    pgNotif: 'Notifications Delivered/Read',
    pgAssign: 'Assignment Time',
    pgRoute: 'Route Generation Count',
    pgLatency: 'Rider Status Update Latency',
    pgFail: 'Failed/Exception Pickups',
    pgVolume: 'Branch-Specific Volume',
    pgCodAmount: 'COD Settlement Pending Amount',
    pgCsResponse: 'Customer Service Response Time',
  },
  MM: {
    dashboardTitle: 'အဓိက မျက်နှာပြင်',
    dashboardDesc: 'စနစ်စတင်ရန် အသင့်ဖြစ်မှု အဆင့်များ၊ ကျန်းမာရေး စစ်ဆေးမှုများနှင့် လုပ်ငန်းလည်ပတ်မှုဆိုင်ရာ အဓိကစွမ်းဆောင်ရည်ပြ ညွှန်းကိန်းများ (KPIs) ပါဝင်သော ဘက်စုံစောင့်ကြည့်ရေး မျက်နှာပြင်။',
    refresh: 'ပြန်လည်ဆန်းသစ်ရန်',
    goLiveReadiness: 'စနစ်စတင်ရန် အသင့်ဖြစ်မှု',
    progress: 'တိုးတက်မှု အခြေအနေ',
    milestonesPassing: 'အဆင့်များ အောင်မြင်မှု',
    synced: 'ချိတ်ဆက်ပြီးချိန်',
    backendHealth: 'နောက်ခံစနစ် ကျန်းမာရေး စစ်ဆေးမှုများ',
    lastSync: 'နောက်ဆုံးချိတ်ဆက်ချိန်:',
    postGoLive: 'စနစ်လည်ပတ်ပြီးနောက် စောင့်ကြည့်လေ့လာမှု',
    dailyMetrics: 'နေ့စဉ် တိုင်းတာချက်များ',
    monitor: 'စောင့်ကြည့်ရန်',
    postGoLiveDesc: 'အစမ်းလည်ပတ်မှု အောင်မြင်သည်နှင့် စနစ်လည်ပတ်ပြီးနောက် စောင့်ကြည့်ခြင်းကို စတင်ပါမည်။ တိုင်းတာချက်အားလုံးကို လုပ်ငန်းလည်ပတ်မှုဆိုင်ရာ ခွဲခြမ်းစိတ်ဖြာမှုစနစ်သို့ ပေးပို့မည်ဖြစ်သည်။',
    footerTitle: 'BRITIUM EXPRESS · စနစ်စတင်မှု ထိန်းချုပ်ရေး မျက်နှာပြင် · v2.0',
    
    // Status
    statusPass: 'အောင်မြင်သည်',
    statusPartial: 'တစ်စိတ်တစ်ပိုင်း',
    statusEmpty: 'အလွတ်ဖြစ်နေသည်',
    statusChecking: 'စစ်ဆေးနေဆဲ',
    statusLive: 'လည်ပတ်နေသည်',
    statusStandby: 'အသင့်အနေအထား',
    statusMaintenance: 'ပြုပြင်ထိန်းသိမ်းမှု',
    sysOk: 'ကောင်းမွန်',
    sysFail: 'ချို့ယွင်း',
    sysErr: 'ချို့ယွင်း',

    // Milestones
    m1Label: 'အခြေခံအချက်အလက်များ အဆင်သင့်ဖြစ်မှု',
    m1Criteria: 'ရွေးချယ်စရာများနှင့် အခြေခံမှတ်တမ်းများကို နောက်ခံစနစ်မှ ဆွဲယူမှု',
    m2Label: 'လုပ်ငန်းလည်ပတ်ချိန် ရှင်းလင်းမှု ပြီးစီးခြင်း',
    m2Criteria: 'လုပ်ငန်းလည်ပတ်မှု၊ စေလွှတ်မှု၊ ပို့ဆောင်မှု၊ ကုန်လှောင်ရုံ၊ ကြီးကြပ်သူ အစရှိသည်တို့တွင် နမူနာစာကြောင်းများ မပြသခြင်း',
    m3Label: 'အကောင့်များ စီမံဖန်တီးမှု ပြီးစီးခြင်း',
    m3Criteria: 'အကောင့် ၁၈၂ ခု သက်ဝင်လှုပ်ရှားပြီး တာဝန်များ သတ်မှတ်ပေးပြီးဖြစ်ခြင်း',
    m4Label: 'Portal မှတဆင့် တင်သွင်းရန် အဆင်သင့်ဖြစ်မှု',
    m4Criteria: 'ကုန်သည်/ဖောက်သည်/CS တို့မှ တူညီသော နောက်ခံလုပ်ငန်းစဉ်သို့ တင်သွင်းနိုင်မှု',
    m5Label: 'တာဝန်ချထားရန် အဆင်သင့်ဖြစ်မှု',
    m5Criteria: 'ကြီးကြပ်သူမှ တကယ့် လာယူမည့်လုပ်ငန်းများကို ဝန်ထမ်းများထံ တာဝန်ချထားနိုင်မှု',
    m6Label: 'ခြေရာခံရန် အဆင်သင့်ဖြစ်မှု',
    m6Criteria: 'ကုန်စည်ဖြစ်စဉ်များက ကုန်သည်/ဖောက်သည်/CS ခြေရာခံခြင်းကို အဆင့်မြှင့်တင်ပေးမှု',
    m7Label: 'ရုံးခွဲ အဆင်သင့်ဖြစ်မှု',
    m7Criteria: 'မန္တလေး/နေပြည်တော် ရုံးခွဲ မျက်နှာပြင်များ မှန်ကန်စွာ ပေါ်လာပြီး စစ်ထုတ်နိုင်မှု',
    m8Label: 'နှုန်းထားများ အဆင်သင့်ဖြစ်မှု',
    m8Criteria: 'နှုန်းထား တွက်ချက်မှုများသည် အတည်ပြုထားသော တွက်နည်းများနှင့် ကိုက်ညီမှု',
    m9Label: 'အစမ်းလည်ပတ်မှု အောင်မြင်ခြင်း',
    m9Criteria: 'ပစ္စည်းလာယူမှု လုပ်ငန်းစဉ်တစ်ခုလုံး အစအဆုံး အောင်မြင်ခြင်း',

    // Detail Strings
    m1DetailPass: (n: number) => `အခြေခံမှတ်တမ်း ${n} ခု တွေ့ရှိသည်`,
    m1DetailEmpty: 'အခြေခံမှတ်တမ်း မတွေ့ရှိပါ',
    m2DetailPass: 'လုပ်ငန်းဇယားများအားလုံး ရှင်းလင်းပြီးပါပြီ — စနစ်စတင်ရန် အသင့်ဖြစ်နေပါပြီ',
    m2DetailPartial: (n: number) => `နမူနာစာကြောင်း ${n} ကြောင်း ကျန်ရှိနေပါသေးသည်`,
    m2DetailEmpty: (n: number) => `ရှင်းလင်းရန် စာကြောင်း ${n} ကြောင်း ရှိပါသည်`,
    m3DetailPass: (n: number) => `အကောင့် ${n} ခု စီမံဖန်တီးပြီးပါပြီ`,
    m3DetailPartial: (n: number) => `အကောင့် ၁၈၂ ခုအနက် ${n} ခု သက်ဝင်လှုပ်ရှားနေပါသည်`,
    m3DetailEmpty: (n: number) => `အကောင့် ၁၈၂ ခုအနက် ${n} ခု တွေ့ရှိပါသည်`,
    m4DetailPass: (n: number) => `ဇယား အသက်ဝင်နေပါသည် (မှတ်တမ်း ${n} ခု)`,
    m5DetailPass: (n: number) => `ဝန်ထမ်းအကောင့် ${n} ခု တွေ့ရှိသည်`,
    m5DetailEmpty: 'ဝန်ထမ်းအကောင့်များ မရှိပါ',
    m6DetailPass: (n: number) => `ကုန်စည်ဖြစ်စဉ် ${n} ခု မှတ်တမ်းတင်ထားပါသည်`,
    m6DetailPartial: 'ကုန်စည်ဖြစ်စဉ်များ မရှိသေးပါ',
    m7DetailPass: (n: number) => `ရုံးခွဲ ${n} ခု မှတ်ပုံတင်ထားပါသည်`,
    m7DetailPartial: (n: number) => `ရုံးခွဲ ၂ ခုအနက် ${n} ခု မှတ်ပုံတင်ထားပါသည်`,
    m7DetailEmpty: 'ရုံးခွဲများ မတွေ့ရှိပါ',
    m8DetailPass: (n: number) => `နှုန်းထားစည်းမျဉ်း ${n} ခု ထည့်သွင်းထားပါသည်`,
    m8DetailEmpty: 'နှုန်းထားစည်းမျဉ်းများ မတွေ့ရှိပါ',
    m9DetailPartial: 'လိုအပ်ချက်များ ပြည့်စုံပါသည် — အစမ်းလည်ပတ်ရန် စောင့်ဆိုင်းနေပါသည်',
    m9DetailEmptyIncomplete: 'လိုအပ်ချက်များ မပြည့်စုံသေးပါ',
    m9DetailEmptyNotReady: 'အစမ်းလည်ပတ်ရန် စနစ်အသင့်မဖြစ်သေးပါ',
    unreachable: (t: string) => `${t} သို့ ဝင်ရောက်၍မရပါ`,

    // KPIs
    kpiPickup: 'ပစ္စည်းလာယူရန် တောင်းဆိုမှုများ',
    kpiCargo: 'လက်ရှိ ကုန်စည်ဖြစ်စဉ်များ',
    kpiWorkforce: 'ဝန်ထမ်း အကောင့်များ',
    kpiBranches: 'ဖွင့်လှစ်ထားသော ရုံးခွဲများ',
    kpiExceptions: 'ယနေ့ ချွင်းချက်ဖြစ်စဉ်များ',
    kpiCod: 'ကောက်ခံရန်ကျန်ရှိသော ငွေပမာဏ',
    kpiFleet: 'ရရှိနိုင်သော ယာဉ်များ',
    kpiUsers: 'အသုံးပြုသူ အကောင့်များ',

    // Health Checks
    hcPickup: 'ပစ္စည်းလာယူရန် တောင်းဆိုမှု ဇယား',
    hcTariff: 'အခြေခံ နှုန်းထားများ',
    hcWorkforce: 'ဝန်ထမ်း အကောင့်များ',
    hcBranch: 'ရုံးခွဲ မှတ်ပုံတင်စာရင်း',
    hcMasterData: 'အခြေခံ အချက်အလက် ရွေးချယ်စရာများ',

    // Post Go-Live
    pgPickup: 'ဖန်တီးပြီးသော ပစ္စည်းလာယူရန် တောင်းဆိုမှုများ',
    pgNotif: 'ပို့ဆောင်/ဖတ်ရှုပြီးသော အသိပေးချက်များ',
    pgAssign: 'တာဝန်ချထားချိန်',
    pgRoute: 'လမ်းကြောင်း ရေးဆွဲမှု အရေအတွက်',
    pgLatency: 'ပို့ဆောင်သူ အခြေအနေ ပြောင်းလဲမှု နှောင့်နှေးချိန်',
    pgFail: 'မအောင်မြင်/ချွင်းချက် ပစ္စည်းလာယူမှုများ',
    pgVolume: 'ရုံးခွဲအလိုက် ပမာဏ',
    pgCodAmount: 'ရှင်းလင်းရန်ကျန်ရှိသော COD ငွေပမာဏ',
    pgCsResponse: 'ဖောက်သည်ဝန်ဆောင်မှု တုံ့ပြန်ချိန်',
  }
}

export default function DashboardPage() {
  const [lang, setLang] = useState<Language>('EN')
  const [milestones, setMilestones] = useState<Record<string, MilestoneResult>>({})
  const [kpis, setKpis] = useState<KpiData | null>(null)
  const [health, setHealth] = useState<HealthCheck[]>([])
  const [sysStatus, setSysStatus] = useState<SystemStatus>('STANDBY')
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState(new Date())

  const t = TRANSLATIONS[lang]

  const getMilestonesList = () => [
    { id: 'M1', label: t.m1Label, criteria: t.m1Criteria },
    { id: 'M2', label: t.m2Label, criteria: t.m2Criteria },
    { id: 'M3', label: t.m3Label, criteria: t.m3Criteria },
    { id: 'M4', label: t.m4Label, criteria: t.m4Criteria },
    { id: 'M5', label: t.m5Label, criteria: t.m5Criteria },
    { id: 'M6', label: t.m6Label, criteria: t.m6Criteria },
    { id: 'M7', label: t.m7Label, criteria: t.m7Criteria },
    { id: 'M8', label: t.m8Label, criteria: t.m8Criteria },
    { id: 'M9', label: t.m9Label, criteria: t.m9Criteria },
  ]

  const checkMilestones = useCallback(async (): Promise<Record<string, MilestoneResult>> => {
    const results: Record<string, MilestoneResult> = {}
    const tx = TRANSLATIONS[lang]

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 600))

    results['M1'] = { status: 'empty', detail: tx.m1DetailEmpty }
    results['M2'] = { status: 'empty', detail: tx.m2DetailEmpty(126) }
    results['M3'] = { status: 'empty', detail: tx.m3DetailEmpty(58) }
    results['M4'] = { status: 'pass', detail: tx.m4DetailPass(0) }
    results['M5'] = { status: 'pass', detail: tx.m5DetailPass(20) }
    results['M6'] = { status: 'partial', detail: tx.m6DetailPartial }
    results['M7'] = { status: 'pass', detail: tx.m7DetailPass(3) }
    results['M8'] = { status: 'pass', detail: tx.m8DetailPass(3) }
    results['M9'] = { status: 'empty', detail: tx.m9DetailEmptyIncomplete }

    return results
  }, [lang])

  const loadKpis = useCallback(async (): Promise<KpiData> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 600))

    return {
      totalPickupRequests: 0,
      activeCargoEvents: 0,
      workforceAccounts: 20,
      activeBranches: 3,
      exceptionsToday: 0,
      codPending: 0,
      fleetAvailable: 0,
      userAccounts: 58,
    }
  }, [])

  const loadHealth = useCallback(async (): Promise<HealthCheck[]> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 600))

    return [
      { table: 'be_portal_pickup_requests', key: 'hcPickup', count: 0, ok: true, error: false },
      { table: 'be_tariff_master', key: 'hcTariff', count: 3, ok: true, error: false },
      { table: 'be_mobile_workforce_accounts', key: 'hcWorkforce', count: 20, ok: true, error: false },
      { table: 'be_branch_nodes', key: 'hcBranch', count: 3, ok: true, error: false },
      { table: 'be_master_data_options', key: 'hcMasterData', count: 0, ok: true, error: false },
    ]
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ms, kd, hc] = await Promise.all([checkMilestones(), loadKpis(), loadHealth()])
      setMilestones(ms)
      setKpis(kd)
      setHealth(hc)

      const passCount = Object.values(ms).filter(m => m.status === 'pass').length
      if (passCount >= 8) setSysStatus('LIVE')
      else if (passCount >= 4) setSysStatus('STANDBY')
      else setSysStatus('MAINTENANCE')
    } catch {
    } finally {
      setLoading(false)
      setLastSync(new Date())
    }
  }, [checkMilestones, loadKpis, loadHealth])

  useEffect(() => { void load() }, [load])

  const fmtNum = (n?: number) => loading ? '—' : (n ?? 0).toLocaleString()
  const passCount = Object.values(milestones).filter(m => m.status === 'pass').length
  const milestonesList = getMilestonesList()
  const totalM = milestonesList.length

  const milestoneStatusStyle = (status: MilestoneStatus) => {
    if (status === 'pass') return { bg: '#052e16', border: '#166534', color: C.success, label: t.statusPass }
    if (status === 'partial') return { bg: '#451a03', border: '#92400e', color: C.warning, label: t.statusPartial }
    if (status === 'checking') return { bg: '#082f49', border: '#0c4a6e', color: C.info, label: t.statusChecking }
    return { bg: C.panel2, border: C.border, color: C.muted, label: t.statusEmpty }
  }

  const systemStatusStyle = (status: SystemStatus) => {
    let label = t.statusStandby
    if (status === 'LIVE') label = t.statusLive
    if (status === 'MAINTENANCE') label = t.statusMaintenance

    if (status === 'LIVE') return { bg: '#052e16', border: '#166534', color: C.success, label }
    if (status === 'STANDBY') return { bg: '#451a03', border: '#92400e', color: C.warning, label }
    return { bg: '#4a0521', border: '#831843', color: C.error, label }
  }

  const sysSty = systemStatusStyle(sysStatus)

  const KPI_CARDS: Array<{ label: string; value?: number; color: string; icon: LucideIcon }> = [
    { label: t.kpiPickup, value: kpis?.totalPickupRequests, color: '#60a5fa', icon: Package },
    { label: t.kpiCargo, value: kpis?.activeCargoEvents, color: '#a78bfa', icon: Activity },
    { label: t.kpiWorkforce, value: kpis?.workforceAccounts, color: '#34d399', icon: Users },
    { label: t.kpiBranches, value: kpis?.activeBranches, color: '#38bdf8', icon: GitBranch },
    { label: t.kpiExceptions, value: kpis?.exceptionsToday, color: (kpis?.exceptionsToday ?? 0) > 0 ? '#f87171' : '#34d399', icon: AlertTriangle },
    { label: t.kpiCod, value: kpis?.codPending, color: '#F5C842', icon: DollarSign },
    { label: t.kpiFleet, value: kpis?.fleetAvailable, color: '#fb923c', icon: Truck },
    { label: t.kpiUsers, value: kpis?.userAccounts, color: '#c084fc', icon: Shield },
  ]

  const POST_GO_LIVE_METRICS: Array<{ icon: LucideIcon; label: string; color: string }> = [
    { icon: Package, label: t.pgPickup, color: '#60a5fa' },
    { icon: Bell, label: t.pgNotif, color: '#a78bfa' },
    { icon: Clock, label: t.pgAssign, color: '#f59e0b' },
    { icon: Route, label: t.pgRoute, color: '#34d399' },
    { icon: Activity, label: t.pgLatency, color: '#38bdf8' },
    { icon: AlertTriangle, label: t.pgFail, color: '#f87171' },
    { icon: GitBranch, label: t.pgVolume, color: '#fb923c' },
    { icon: DollarSign, label: t.pgCodAmount, color: '#F5C842' },
    { icon: Shield, label: t.pgCsResponse, color: '#c084fc' },
  ]

  return (
    <div style={{ background: C.bg, padding: 24, minHeight: '100%', fontFamily: FF.body }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        input:focus,select:focus,textarea:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important}
        input::placeholder,textarea::placeholder{color:#4d7a9b}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}
        tr:hover td{background:#0f2a42!important}
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: FF.body, fontSize: 20, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.gold, margin: 0, lineHeight: 1.2 }}>{t.dashboardTitle}</h1>
          <p style={{ fontFamily: FF.body, fontSize: 14, color: C.muted, marginTop: 4, marginBottom: 0 }}>{t.dashboardDesc}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          
          {/* Language Toggle */}
          <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: '1px solid ' + C.border }}>
            <button
              onClick={() => setLang('EN')}
              style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'EN' ? C.panelHover : 'transparent', color: lang === 'EN' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.2s' }}
            >
              EN
            </button>
            <button
              onClick={() => setLang('MM')}
              style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'MM' ? C.panelHover : 'transparent', color: lang === 'MM' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.2s' }}
            >
              မြန်မာ
            </button>
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: sysSty.bg, border: '1px solid ' + sysSty.border, borderRadius: 999, color: sysSty.color, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: sysSty.color, display: 'inline-block' }} />
            {sysSty.label}
          </div>
          <button onClick={() => void load()} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'transparent', border: '1px solid ' + C.border, borderRadius: 8, color: C.text2, fontSize: 13, fontFamily: FF.body, fontWeight: 600, cursor: 'pointer' }}>
            <RefreshCw size={14} /> {t.refresh}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <div style={{ width: 32, height: 32, border: '3px solid ' + C.border, borderTopColor: C.gold, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      )}

      <div style={{ background: C.panel, border: '1px solid ' + C.border, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontFamily: FF.sub, fontSize: 18, fontWeight: 600, color: C.text2, margin: '0 0 4px' }}>{t.goLiveReadiness}</h2>
            <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>{passCount}/{totalM} {t.milestonesPassing} · {t.synced} {lastSync.toLocaleTimeString()}</p>
          </div>
          <div style={{ minWidth: 220, flex: 1, maxWidth: 360 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted }}>{t.progress}</span>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.gold }}>{passCount}/{totalM}</span>
            </div>
            <div style={{ height: 8, background: C.panel2, borderRadius: 999, overflow: 'hidden', border: '1px solid ' + C.border }}>
              <div style={{ width: ((passCount / totalM) * 100) + '%', height: '100%', background: 'linear-gradient(90deg,#f6b84b,#ff8a4c)' }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
          {milestonesList.map(item => {
            const result = milestones[item.id] ?? { status: loading ? 'checking' : 'empty', detail: '' }
            const s = milestoneStatusStyle(result.status)
            return (
              <div key={item.id} style={{ background: C.panel2, border: '1px solid ' + C.border, borderRadius: 12, padding: 16, animation: 'fadeIn 0.25s ease' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 999, background: s.bg, border: '1px solid ' + s.border, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, fontSize: 11, fontWeight: 700 }}>
                    {item.id.replace('M', '')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{item.label}</div>
                  </div>
                  <span style={{ background: s.bg, color: s.color, border: '1px solid ' + s.border, display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: FF.body, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{s.label}</span>
                </div>
                <p style={{ fontSize: 13.5, color: C.text2, margin: '0 0 8px', lineHeight: 1.5 }}>{item.criteria}</p>
                <p style={{ fontSize: 12, color: s.color, margin: 0 }}>{result.detail || '—'}</p>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 20 }}>
        {KPI_CARDS.map(({ label, value, color, icon: Icon }) => (
          <div key={label} style={{ background: C.panel, border: '1px solid ' + C.border, borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted }}>{label}</div>
              <Icon size={16} color={color} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.gold }}>{fmtNum(value)}</div>
          </div>
        ))}
      </div>

      <div style={{ background: C.panel, border: '1px solid ' + C.border, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <h2 style={{ fontFamily: FF.sub, fontSize: 18, fontWeight: 600, color: C.text2, margin: 0 }}>{t.backendHealth}</h2>
          <div style={{ fontSize: 12, color: C.muted }}>{t.lastSync} {lastSync.toLocaleString()}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
          {(health ?? []).map((item, i) => (
            <div key={item.table ?? i} style={{ background: C.panel2, border: '1px solid ' + (item.ok ? '#166534' : '#831843'), borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted }}>
                  {t[item.key]}
                </div>
                <span style={{ background: item.ok ? '#052e16' : '#4a0521', color: item.ok ? C.success : C.error, border: '1px solid ' + (item.ok ? '#166534' : '#831843'), display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: FF.body, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                  {item.ok ? t.sysOk : t.sysFail}
                </span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: item.ok ? C.success : C.error, marginBottom: 4 }}>
                {item.error ? t.sysErr : String(item.count ?? 0)}
              </div>
              <div style={{ fontSize: 12, color: C.muted, wordBreak: 'break-all' }}>{item.table}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: C.panel, border: '1px solid ' + C.border, borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <TrendingUp size={16} color={C.gold} />
          <h2 style={{ fontFamily: FF.sub, fontSize: 18, fontWeight: 600, color: C.text2, margin: 0 }}>{t.postGoLive}</h2>
          <span style={{ background: '#451a03', color: C.gold, border: '1px solid #92400e', display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: FF.body, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{t.dailyMetrics}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 16 }}>
          {POST_GO_LIVE_METRICS.map(({ icon: Icon, label, color }) => (
            <div key={label} style={{ background: C.panel2, border: '1px solid ' + C.border, borderRadius: 10, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: color + '18', border: '1px solid ' + color + '30', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} color={color} />
              </div>
              <div>
                <div style={{ fontSize: 13.5, color: C.text2 }}>{label}</div>
                <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{t.monitor}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ background: C.panel2, border: '1px solid ' + C.border, borderRadius: 10, padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Zap size={14} color={C.gold} />
          <p style={{ fontSize: 13.5, color: C.text2, margin: 0 }}>{t.postGoLiveDesc}</p>
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: C.muted }}>{t.footerTitle}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.muted, fontSize: 12 }}>
          <BarChart2 size={12} />
          <FileText size={12} />
          <span>{t.lastSync} {lastSync.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}