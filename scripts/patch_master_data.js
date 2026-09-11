const fs = require('fs');

function patchApp() {
  const path = 'src/App.tsx';
  if (!fs.existsSync(path)) {
    console.log('App.tsx not found, skip route patch');
    return;
  }

  let s = fs.readFileSync(path, 'utf8');

  if (!s.includes("import MasterDataPortal from './pages/master-data/MasterDataPortal';")) {
    if (s.includes("from './pages/")) {
      s = `import MasterDataPortal from './pages/master-data/MasterDataPortal';\n` + s;
    }
  }

  if (!s.includes('/master-data/staff') && s.includes('</Routes>')) {
    s = s.replace(
      '</Routes>',
`  <Route path="/master-data" element={<MasterDataPortal />} />
  <Route path="/master-data/staff" element={<MasterDataPortal />} />
  <Route path="/master-data/vehicles" element={<MasterDataPortal />} />
  <Route path="/master-data/assets" element={<MasterDataPortal />} />
  <Route path="/master-data/assignments" element={<MasterDataPortal />} />
  <Route path="/master-data/scans" element={<MasterDataPortal />} />
  <Route path="/master-data/acknowledgements" element={<MasterDataPortal />} />
</Routes>`
    );
  }

  fs.writeFileSync(path, s);
  console.log('App.tsx patched');
}

function patchLayout() {
  const path = 'src/components/Layout.tsx';
  if (!fs.existsSync(path)) {
    console.log('Layout.tsx not found, skip nav patch');
    return;
  }

  let s = fs.readFileSync(path, 'utf8');

  if (s.includes('/master-data/staff')) {
    fs.writeFileSync(path, s);
    console.log('Layout.tsx already patched');
    return;
  }

  s = s.replace(
    /from 'lucide-react';/,
    (m) => m
  );

  if (s.includes("path: '/settings'")) {
    s = s.replace(
      "path: '/settings'",
`path: '/master-data/staff',
    label: 'Master Data / မူလအချက်အလက်',
    icon: Database,
    subItems: [
      { label: 'Staff / ဝန်ထမ်း', path: '/master-data/staff', icon: Users2 },
      { label: 'Vehicles / ယာဉ်များ', path: '/master-data/vehicles', icon: CarFront },
      { label: 'Assets / ပစ္စည်းများ', path: '/master-data/assets', icon: PackageSearch },
      { label: 'Assignments / ခန့်ထားမှုများ', path: '/master-data/assignments', icon: ClipboardList },
      { label: 'QR Scans / QR Scans', path: '/master-data/scans', icon: ScanLine },
      { label: 'Acknowledgements / လက်ခံအတည်ပြုမှုများ', path: '/master-data/acknowledgements', icon: ShieldCheck },
    ]
  },
  {
    path: '/settings'`
    );

    if (!s.includes('Database') && s.includes('from \'lucide-react\'')) {
      s = s.replace(
        /import\s*\{([^}]+)\}\s*from\s*'lucide-react';/,
        (full, inner) => {
          const extra = ['Database', 'Users2', 'CarFront', 'PackageSearch', 'ClipboardList', 'ScanLine', 'ShieldCheck']
            .filter((name) => !inner.includes(name))
            .join(', ');
          return `import {${inner.trim().replace(/\s+$/,'')}${extra ? ', ' + extra : ''}} from 'lucide-react';`;
        }
      );
    }

    fs.writeFileSync(path, s);
    console.log('Layout.tsx patched');
  } else {
    console.log('Layout.tsx nav insertion pattern not found; add Master Data menu manually if needed');
  }
}

function patchWayplanPortal() {
  const path = 'src/pages/WayplanPortal.tsx';
  if (!fs.existsSync(path)) {
    console.log('WayplanPortal.tsx not found, skip waybill crash patch');
    return;
  }

  let s = fs.readFileSync(path, 'utf8');

  if (!s.includes("import { addressText, safeText } from '@/lib/displayValue';")) {
    s = s.replace(
      "import { Input } from '@/components/ui/input';",
      "import { Input } from '@/components/ui/input';\nimport { addressText, safeText } from '@/lib/displayValue';"
    );
  }

  s = s.replace(
    /selectedWaybill\.sender\?\.\s*address\?\.street \|\| selectedWaybill\.sender\?\.address \|\| '—'/g,
    "addressText(selectedWaybill.sender?.address)"
  );

  s = s.replace(
    /selectedWaybill\.recipient\?\.\s*address\?\.street \|\| selectedWaybill\.recipient\?\.address \|\| '—'/g,
    "addressText(selectedWaybill.recipient?.address)"
  );

  s = s.replace(/selectedWaybill\.sender\?\.name \|\| '—'/g, "safeText(selectedWaybill.sender?.name)");
  s = s.replace(/selectedWaybill\.sender\?\.phone \|\| '—'/g, "safeText(selectedWaybill.sender?.phone)");
  s = s.replace(/selectedWaybill\.recipient\?\.name \|\| '—'/g, "safeText(selectedWaybill.recipient?.name)");
  s = s.replace(/selectedWaybill\.recipient\?\.phone \|\| '—'/g, "safeText(selectedWaybill.recipient?.phone)");

  fs.writeFileSync(path, s);
  console.log('WayplanPortal.tsx patched');
}

patchApp();
patchLayout();
patchWayplanPortal();
