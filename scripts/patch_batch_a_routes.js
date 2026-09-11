const fs = require('fs');

function patchApp() {
  const path = 'src/App.tsx';
  if (!fs.existsSync(path)) return;

  let s = fs.readFileSync(path, 'utf8');

  if (!s.includes("import DataEntryPortal from './pages/DataEntryPortal';")) {
    s = `import DataEntryPortal from './pages/DataEntryPortal';\n` + s;
  }

  if (!s.includes("/data-entry/manual")) {
    s = s.replace(
      '</Routes>',
`  <Route path="/data-entry" element={<DataEntryPortal />} />
  <Route path="/data-entry/manual" element={<DataEntryPortal />} />
  <Route path="/data-entry/bulk" element={<DataEntryPortal />} />
  <Route path="/data-entry/templates" element={<DataEntryPortal />} />
  <Route path="/data-entry/records" element={<DataEntryPortal />} />
</Routes>`
    );
  }

  fs.writeFileSync(path, s);
  console.log('App.tsx patched for Data Entry routes');
}

patchApp();
