const fs = require('fs');

function ensureImport(source, importLine) {
  return source.includes(importLine) ? source : `${importLine}\n${source}`;
}

function patchApp() {
  const path = 'src/App.tsx';
  if (!fs.existsSync(path)) return;

  let s = fs.readFileSync(path, 'utf8');

  s = ensureImport(s, "import CustomerServicePortal from './pages/CustomerServicePortal';");
  s = ensureImport(s, "import MerchantPortal from './pages/MerchantPortal';");
  s = ensureImport(s, "import CustomerPortal from './pages/CustomerPortal';");
  s = ensureImport(s, "import FinancePortal from './pages/FinancePortal';");

  const inserts = [
    `  <Route path="/customer-service" element={<CustomerServicePortal />} />`,
    `  <Route path="/customer-service/requests" element={<CustomerServicePortal />} />`,
    `  <Route path="/customer-service/chat" element={<CustomerServicePortal />} />`,
    `  <Route path="/merchant" element={<MerchantPortal />} />`,
    `  <Route path="/merchant/deliveries" element={<MerchantPortal />} />`,
    `  <Route path="/merchant/create" element={<MerchantPortal />} />`,
    `  <Route path="/merchant/reports" element={<MerchantPortal />} />`,
    `  <Route path="/customer" element={<CustomerPortal />} />`,
    `  <Route path="/customer/track" element={<CustomerPortal />} />`,
    `  <Route path="/customer/orders" element={<CustomerPortal />} />`,
    `  <Route path="/customer/support" element={<CustomerPortal />} />`,
    `  <Route path="/finance" element={<FinancePortal />} />`,
    `  <Route path="/finance/transactions" element={<FinancePortal />} />`,
    `  <Route path="/finance/cod" element={<FinancePortal />} />`,
    `  <Route path="/finance/invoices" element={<FinancePortal />} />`,
  ];

  if (!s.includes('/customer-service/requests') && s.includes('</Routes>')) {
    s = s.replace('</Routes>', `${inserts.join('\n')}\n</Routes>`);
  }

  fs.writeFileSync(path, s);
  console.log('App.tsx patched for Batch B routes');
}

patchApp();
