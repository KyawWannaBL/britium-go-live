const fs = require('fs');
const path = require('path');

const required = [
  'package.json',
  'index.html',
  'vite.config.ts',
  'src/App.tsx',
  'src/main.tsx',
  'src/lib/supabaseClient.ts',
  'src/contexts/AuthContext.tsx',
  'src/styles/enterprise.css',
  'supabase/sql/00-bootstrap-core-schema.sql',
  'supabase/sql/99-run-all-clean-enterprise-portal.sql'
];

const pages = [
  'DashboardPage.tsx',
  'CreateDeliveryPage.tsx',
  'WayManagementPage.tsx',
  'DataEntryPage.tsx',
  'WarehousePage.tsx',
  'WaybillInvoicePage.tsx',
  'ReportingPage.tsx',
  'DispatchCenterPage.tsx',
  'BranchOfficePage.tsx',
  'SettingsPage.tsx',
  'LoginPage.tsx'
];

for (const p of required) {
  if (!fs.existsSync(path.join(process.cwd(), p))) {
    console.error('Missing required file:', p);
    process.exit(1);
  }
}
for (const p of pages) {
  if (!fs.existsSync(path.join(process.cwd(), 'src/pages', p))) {
    console.error('Missing page:', p);
    process.exit(1);
  }
}
console.log('Britium clean enterprise portal package verified.');
