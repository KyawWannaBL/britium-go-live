const fs = require('fs');

const appPath = 'src/App.tsx';
if (!fs.existsSync(appPath)) {
  console.error('src/App.tsx not found');
  process.exit(1);
}

let s = fs.readFileSync(appPath, 'utf8');

const defs = [
  { file: 'src/pages/DataEntryPortal.tsx', importLine: "import DataEntryPortal from './pages/DataEntryPortal';", routes: ['/data-entry', '/data-entry/manual', '/data-entry/bulk', '/data-entry/templates', '/data-entry/records'], component: 'DataEntryPortal' },
  { file: 'src/pages/CustomerServicePortal.tsx', importLine: "import CustomerServicePortal from './pages/CustomerServicePortal';", routes: ['/customer-service', '/customer-service/requests', '/customer-service/chat'], component: 'CustomerServicePortal' },
  { file: 'src/pages/MerchantPortal.tsx', importLine: "import MerchantPortal from './pages/MerchantPortal';", routes: ['/merchant', '/merchant/deliveries', '/merchant/create', '/merchant/reports'], component: 'MerchantPortal' },
  { file: 'src/pages/CustomerPortal.tsx', importLine: "import CustomerPortal from './pages/CustomerPortal';", routes: ['/customer', '/customer/track', '/customer/orders', '/customer/support'], component: 'CustomerPortal' },
  { file: 'src/pages/FinancePortal.tsx', importLine: "import FinancePortal from './pages/FinancePortal';", routes: ['/finance', '/finance/transactions', '/finance/cod', '/finance/invoices'], component: 'FinancePortal' },
  { file: 'src/pages/HRPortal.tsx', importLine: "import HRPortal from './pages/HRPortal';", routes: ['/hr', '/hr/employees', '/hr/attendance', '/hr/leave'], component: 'HRPortal' },
  { file: 'src/pages/MarketingPortal.tsx', importLine: "import MarketingPortal from './pages/MarketingPortal';", routes: ['/marketing', '/marketing/overview', '/marketing/campaigns', '/marketing/merchants'], component: 'MarketingPortal' },
  { file: 'src/pages/BranchOfficePortal.tsx', importLine: "import BranchOfficePortal from './pages/BranchOfficePortal';", routes: ['/branch-office', '/branch-office/overview', '/branch-office/shipments', '/branch-office/team', '/branch-office/finance'], component: 'BranchOfficePortal' },
  { file: 'src/pages/AnalyticsPortal.tsx', importLine: "import AnalyticsPortal from './pages/AnalyticsPortal';", routes: ['/analytics', '/analytics/overview', '/analytics/revenue', '/analytics/drivers'], component: 'AnalyticsPortal' },
  { file: 'src/pages/SettingsPortal.tsx', importLine: "import SettingsPortal from './pages/SettingsPortal';", routes: ['/settings'], component: 'SettingsPortal' },
  { file: 'src/pages/master-data/MasterDataPortal.tsx', importLine: "import MasterDataPortal from './pages/master-data/MasterDataPortal';", routes: ['/master-data', '/master-data/staff', '/master-data/vehicles', '/master-data/assets', '/master-data/assignments', '/master-data/scans', '/master-data/acknowledgements'], component: 'MasterDataPortal' },
];

for (const def of defs) {
  if (!fs.existsSync(def.file)) continue;

  if (!s.includes(def.importLine)) {
    s = `${def.importLine}\n${s}`;
  }

  for (const route of def.routes) {
    if (!s.includes(`path="${route}"`) && !s.includes(`path='${route}'`)) {
      s = s.replace(
        '</Routes>',
        `  <Route path="${route}" element={<${def.component} />} />\n</Routes>`
      );
    }
  }
}

fs.writeFileSync(appPath, s);
console.log('App.tsx route patch complete');
