// App.tsx route check for current structure

// Import/lazy load should exist:
const MasterDataPage = safeLazy(() => import('@/pages/MasterDataPage'));

// Protected route should exist:
<Route path="/master-data" element={<MasterDataPage />} />

// Sidebar link should exist under Growth & Master Data:
{ name: "Master Data", path: "/master-data", icon: Database }
