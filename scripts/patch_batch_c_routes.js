const fs = require('fs');

function ensureImport(source, importLine) {
  return source.includes(importLine) ? source : `${importLine}\n${source}`;
}

function replaceOrInjectRoute(source, path, component) {
  const patterns = [
    new RegExp(`<Route\\s+path=["']${path.replace(/\//g, '\\/')}["'][\\s\\S]*?\\/?>`, 'g'),
  ];

  let found = false;
  for (const pattern of patterns) {
    if (pattern.test(source)) {
      found = true;
      source = source.replace(pattern, `<Route path="${path}" element={<${component} />} />`);
    }
  }
  return { source, found };
}

function patchApp() {
  const path = 'src/App.tsx';
  if (!fs.existsSync(path)) return;

  let s = fs.readFileSync(path, 'utf8');

  s = ensureImport(s, "import HRPortal from './pages/HRPortal';");
  s = ensureImport(s, "import MarketingPortal from './pages/MarketingPortal';");
  s = ensureImport(s, "import BranchOfficePortal from './pages/BranchOfficePortal';");
  s = ensureImport(s, "import AnalyticsPortal from './pages/AnalyticsPortal';");
  s = ensureImport(s, "import SettingsPortal from './pages/SettingsPortal';");

  const routeDefs = [
    ['/hr', 'HRPortal'],
    ['/hr/employees', 'HRPortal'],
    ['/hr/attendance', 'HRPortal'],
    ['/hr/leave', 'HRPortal'],
    ['/marketing', 'MarketingPortal'],
    ['/marketing/overview', 'MarketingPortal'],
    ['/marketing/campaigns', 'MarketingPortal'],
    ['/marketing/merchants', 'MarketingPortal'],
    ['/branch-office', 'BranchOfficePortal'],
    ['/branch-office/overview', 'BranchOfficePortal'],
    ['/branch-office/shipments', 'BranchOfficePortal'],
    ['/branch-office/team', 'BranchOfficePortal'],
    ['/branch-office/finance', 'BranchOfficePortal'],
    ['/analytics', 'AnalyticsPortal'],
    ['/analytics/overview', 'AnalyticsPortal'],
    ['/analytics/revenue', 'AnalyticsPortal'],
    ['/analytics/drivers', 'AnalyticsPortal'],
    ['/settings', 'SettingsPortal'],
  ];

  const toInsert = [];
  for (const [routePath, component] of routeDefs) {
    const res = replaceOrInjectRoute(s, routePath, component);
    s = res.source;
    if (!res.found && !s.includes(`path="${routePath}"`)) {
      toInsert.push(`  <Route path="${routePath}" element={<${component} />} />`);
    }
  }

  if (toInsert.length && s.includes('</Routes>')) {
    s = s.replace('</Routes>', `${toInsert.join('\n')}\n</Routes>`);
  }

  fs.writeFileSync(path, s);
  console.log('App.tsx patched for Batch C routes');
}

patchApp();
