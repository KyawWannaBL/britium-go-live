import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'mm';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Translation dictionary
const translations: Record<Language, Record<string, string>> = {
  en: {
    // Navigation
    'nav.dashboard': 'Dashboard',
    'nav.supervisor': 'Supervisor',
    'nav.wayplan': 'Wayplan Manager',
    'nav.driver': 'Driver/Rider',
    'nav.warehouse': 'Warehouse',
    'nav.dataEntry': 'Data Entry',
    'nav.customerService': 'Customer Service',
    'nav.marketing': 'Marketing',
    'nav.hr': 'HR Management',
    'nav.finance': 'Finance',
    'nav.merchant': 'Merchant Portal',
    'nav.customer': 'Customer Portal',
    'nav.createDelivery': 'Create Delivery',
    'nav.branchOffice': 'Branch Office',
    'nav.qrCode': 'QR Code',
    'nav.analytics': 'Analytics',
    'nav.settings': 'Settings',
    
    // Sub-navigation
    'nav.teamOverview': 'Team Overview',
    'nav.performance': 'Performance',
    'nav.exceptions': 'Exceptions',
    'nav.routeOptimization': 'Route Optimization',
    'nav.manifests': 'Manifests',
    'nav.vehicleAssignment': 'Vehicle Assignment',
    'nav.activeRoutes': 'Active Routes',
    'nav.deliveries': 'Deliveries',
    'nav.history': 'History',
    'nav.inbound': 'Inbound',
    'nav.sorting': 'Sorting',
    'nav.dispatch': 'Dispatch',
    'nav.bulkUpload': 'Bulk Upload',
    'nav.templates': 'Templates',
    'nav.requests': 'Requests',
    'nav.complaints': 'Complaints',
    'nav.liveChat': 'Live Chat',
    'nav.campaigns': 'Campaigns',
    'nav.customers': 'Customers',
    'nav.employees': 'Employees',
    'nav.attendance': 'Attendance',
    'nav.leaveRequests': 'Leave Requests',
    'nav.transactions': 'Transactions',
    'nav.codCollections': 'COD Collections',
    'nav.invoices': 'Invoices',
    'nav.myDeliveries': 'My Deliveries',
    'nav.createShipment': 'Create Shipment',
    'nav.reports': 'Reports',
    'nav.trackShipment': 'Track Shipment',
    'nav.myOrders': 'My Orders',
    'nav.support': 'Support',
    'nav.revenue': 'Revenue',
    'nav.overview': 'Overview',
    'nav.queueManagement': 'Queue Management',
    'nav.fleetMobility': 'Fleet Mobility',
    'nav.activeJobs': 'Active Jobs',
    'nav.route': 'Route',
    'nav.proofDelivery': 'Proof of Delivery',
    'nav.earnings': 'Earnings',
    'nav.manualEntry': 'Manual Entry',
    'nav.records': 'Records',
    'nav.merchants': 'Merchants',
    'nav.drivers': 'Drivers',
    'nav.shipments': 'Shipments',
    'nav.team': 'Team',
    
    // Common
    'common.logout': 'Logout',
    'common.myAccount': 'My Account',
    'common.language': 'Language',
    'common.english': 'English',
    'common.myanmar': 'မြန်မာ',
    'common.search': 'Search...',
    'common.loading': 'Loading...',
    'common.refresh': 'Refresh',
    
    // QR Code Management
    'qr.title': 'QR Code Management',
    'qr.generate': 'Generate QR Code',
    'qr.scan': 'Scan',
    'qr.manage': 'Manage',
    'qr.history': 'History',
    'qr.type': 'Type',
    'qr.shipment': 'Shipment',
    'qr.parcel': 'Parcel',
    'qr.vehicle': 'Vehicle',
    'qr.rider': 'Rider',
    'qr.warehouse': 'Warehouse',
    'qr.referenceId': 'Reference ID',
    'qr.enterReferenceId': 'Enter Reference ID',
    'qr.referenceType': 'Reference Type',
    'qr.enterReferenceType': 'Enter Reference Type',
    'qr.expiresInHours': 'Expires In (Hours)',
    'qr.generateButton': 'Generate QR Code',
    'qr.scanQRCode': 'Scan QR Code',
    'qr.scannerActive': 'Scanner is active. Scan or enter QR code.',
    'qr.enterQRCode': 'Enter QR code manually',
    'qr.closeScanner': 'Close Scanner',
    'qr.startScanning': 'Start Scanning',
    'qr.allTypes': 'All Types',
    'qr.allStatus': 'All Status',
    'qr.active': 'Active',
    'qr.scanned': 'Scanned',
    'qr.expired': 'Expired',
    'qr.scans': 'Scans',
    'qr.created': 'Created',
    'qr.expires': 'Expires',
    'qr.noQRCodes': 'No QR codes found',
    'qr.scanHistory': 'Scan History',
    'qr.noScanHistory': 'No scan history found',
    'qr.scannedBy': 'Scanned by',
    'qr.details': 'QR Code Details',
    'qr.scanCount': 'Scan Count',
    'qr.qrCodeData': 'QR Code Data',
  },
  mm: {
    // Navigation
    'nav.dashboard': 'ဒက်ရှ်ဘုတ်',
    'nav.supervisor': 'ကြီးကြပ်ရေးမှူး',
    'nav.wayplan': 'လမ်းကြောင်းစီမံခန့်ခွဲမှူ',
    'nav.driver': 'ယာဉ်မောင်း/ပို့ဆောင်သူ',
    'nav.warehouse': 'သိုလှောင်ရုံ',
    'nav.dataEntry': 'ဒေတာထည့်သွင်းခြင်း',
    'nav.customerService': 'ဖောက်သည်ဝန်ဆောင်မှု',
    'nav.marketing': 'စျေးကွက်ရှာဖွေရေး',
    'nav.hr': 'လူ့စွမ်းအားစီမံခန့်ခွဲမှု',
    'nav.finance': 'ဘဏ္ဍာရေး',
    'nav.merchant': 'ကုန်သည်ပေါ်တယ်',
    'nav.customer': 'ဖောက်သည်ပေါ်တယ်',
    'nav.createDelivery': 'ပို့ဆောင်မှုဖန်တီးရန်',
    'nav.branchOffice': 'ဌာနခွဲရုံး',
    'nav.qrCode': 'QR ကုဒ်',
    'nav.analytics': 'ခွဲခြမ်းစိတ်ဖြာမှု',
    'nav.settings': 'ဆက်တင်များ',
    
    // Sub-navigation
    'nav.teamOverview': 'အဖွဲ့ခြုံငုံသုံးသပ်ချက်',
    'nav.performance': 'စွမ်းဆောင်ရည်',
    'nav.exceptions': 'ခြွင်းချက်များ',
    'nav.routeOptimization': 'လမ်းကြောင်းအကောင်းဆုံးပြုလုပ်ခြင်း',
    'nav.manifests': 'ကုန်စာရင်းများ',
    'nav.vehicleAssignment': 'ယာဉ်သတ်မှတ်ခြင်း',
    'nav.activeRoutes': 'လက်ရှိလမ်းကြောင်းများ',
    'nav.deliveries': 'ပို့ဆောင်မှုများ',
    'nav.history': 'မှတ်တမ်း',
    'nav.inbound': 'အဝင်',
    'nav.sorting': 'ခွဲခြားခြင်း',
    'nav.dispatch': 'ပို့ဆောင်ခြင်း',
    'nav.bulkUpload': 'အစုလိုက်တင်ခြင်း',
    'nav.templates': 'နမူနာပုံစံများ',
    'nav.requests': 'တောင်းဆိုမှုများ',
    'nav.complaints': 'တိုင်ကြားမှုများ',
    'nav.liveChat': 'တိုက်ရိုက်စကားပြောခန်း',
    'nav.campaigns': 'ကမ်ပိန်းများ',
    'nav.customers': 'ဖောက်သည်များ',
    'nav.employees': 'ဝန်ထမ်းများ',
    'nav.attendance': 'တက်ရောက်မှု',
    'nav.leaveRequests': 'ခွင့်တောင်းခံမှုများ',
    'nav.transactions': 'ငွေသွင်းငွေထုတ်များ',
    'nav.codCollections': 'COD စုဆောင်းမှုများ',
    'nav.invoices': 'ငွေတောင်းခံလွှာများ',
    'nav.myDeliveries': 'ကျွန်ုပ်၏ပို့ဆောင်မှုများ',
    'nav.createShipment': 'ကုန်ပစ္စည်းပို့ဆောင်မှုဖန်တီးရန်',
    'nav.reports': 'အစီရင်ခံစာများ',
    'nav.trackShipment': 'ကုန်ပစ္စည်းခြေရာခံရန်',
    'nav.myOrders': 'ကျွန်ုပ်၏အော်ဒါများ',
    'nav.support': 'အကူအညီ',
    'nav.revenue': 'ဝင်ငွေ',
    
    // Common
    'common.logout': 'ထွက်ရန်',
    'common.myAccount': 'ကျွန်ုပ်၏အကောင့်',
    'common.language': 'ဘာသာစကား',
    'common.english': 'English',
    'common.myanmar': 'မြန်မာ',
    'common.search': 'ရှာဖွေရန်...',
    'common.loading': 'ရယူနေသည်...',
    'common.refresh': 'ပြန်လည်ရယူ',
    
    // QR Code Management
    'qr.title': 'QR ကုဒ် စီမံခန့်ခွဲမှု',
    'qr.generate': 'QR ကုဒ် ဖန်တီးရန်',
    'qr.scan': 'စကင်န်ဖတ်ရန်',
    'qr.manage': 'စီမံခန့်ခွဲရန်',
    'qr.history': 'မှတ်တမ်း',
    'qr.type': 'အမျိုးအစား',
    'qr.shipment': 'ပို့ဆောင်မှု',
    'qr.parcel': 'ပစ္စည်း',
    'qr.vehicle': 'ယာဉ်',
    'qr.rider': 'ပို့ဆောင်သူ',
    'qr.warehouse': 'ဂိုဒေါင်',
    'qr.referenceId': 'ရည်ညွှန်း ID',
    'qr.enterReferenceId': 'ရည်ညွှန်း ID ထည့်ပါ',
    'qr.referenceType': 'ရည်ညွှန်း အမျိုးအစား',
    'qr.enterReferenceType': 'ရည်ညွှန်း အမျိုးအစား ထည့်ပါ',
    'qr.expiresInHours': 'သက်တမ်း (နာရီ)',
    'qr.generateButton': 'QR ကုဒ် ဖန်တီးမည်',
    'qr.scanQRCode': 'QR ကုဒ် စကင်န်ဖတ်ရန်',
    'qr.scannerActive': 'စကင်နာ အသက်ဝင်နေသည်။ QR ကုဒ် စကင်န်ဖတ်ပါ သို့မဟုတ် ထည့်ပါ။',
    'qr.enterQRCode': 'QR ကုဒ် လက်ဖြင့်ထည့်ပါ',
    'qr.closeScanner': 'စကင်နာ ပိတ်မည်',
    'qr.startScanning': 'စကင်န်ဖတ်ရန် စတင်မည်',
    'qr.allTypes': 'အမျိုးအစားအားလုံး',
    'qr.allStatus': 'အခြေအနေအားလုံး',
    'qr.active': 'အသက်ဝင်နေ',
    'qr.scanned': 'စကင်န်ဖတ်ပြီး',
    'qr.expired': 'သက်တမ်းကုန်',
    'qr.scans': 'စကင်န်အကြိမ်',
    'qr.created': 'ဖန်တီးရက်',
    'qr.expires': 'သက်တမ်း',
    'qr.noQRCodes': 'QR ကုဒ် မရှိပါ',
    'qr.scanHistory': 'စကင်န်မှတ်တမ်း',
    'qr.noScanHistory': 'စကင်န်မှတ်တမ်း မရှိပါ',
    'qr.scannedBy': 'စကင်န်လုပ်သူ',
    'qr.details': 'QR ကုဒ် အသေးစိတ်',
    'qr.scanCount': 'စကင်န်အကြိမ်',
    'qr.qrCodeData': 'QR ကုဒ်ဒေတာ',
  },
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem('britium_language');
    return (stored === 'mm' ? 'mm' : 'en') as Language;
  });

  useEffect(() => {
    localStorage.setItem('britium_language', language);
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}