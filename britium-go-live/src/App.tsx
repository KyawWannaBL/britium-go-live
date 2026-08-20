import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { LiveDispatchBoard } from './components/LiveDispatchBoard';
import { WarehouseScannerPage } from './components/WarehouseScannerPage';
import { LabelBatchPrinter } from './components/LabelBatchPrinter';

// Dummy data for the printer route
const dummyOrders = [
  { trackingNumber: 'YGN-100293', recipientName: 'U Aung Myo', address: 'Bahan Township, Yangon', routeCode: 'YGN-BAH', codAmount: 25000 },
  { trackingNumber: 'YGN-100294', recipientName: 'Daw Su Su', address: 'Tarmwe Township, Yangon', routeCode: 'YGN-TWE', codAmount: 15000 }
];

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-100 flex flex-col">
        {/* Navigation Bar - Hidden during printing */}
        <nav className="no-print bg-blue-900 text-white p-4 shadow-md flex gap-6">
          <div className="font-bold text-xl mr-4">Logistics Hub</div>
          <Link to="/" className="hover:text-blue-300 transition-colors">Dispatch Board</Link>
          <Link to="/scanner" className="hover:text-blue-300 transition-colors">Warehouse Intake</Link>
          <Link to="/print" className="hover:text-blue-300 transition-colors">Batch Printer</Link>
        </nav>

        {/* Main Content Area */}
        <main className="flex-1 w-full relative">
          <Routes>
            <Route path="/" element={<LiveDispatchBoard />} />
            <Route path="/scanner" element={<WarehouseScannerPage />} />
            <Route path="/print" element={<LabelBatchPrinter orders={dummyOrders} />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
