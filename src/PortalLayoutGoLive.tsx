import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Truck, 
  Map, 
  Scan, 
  Banknote, 
  Building2, 
  UserCircle, 
  LogOut, 
  Printer, 
  Database,
  Calculator,
  FileText
} from 'lucide-react';

// --- OPERATIONAL PAGES ---
import SupervisorPickupAssignmentGoLivePage from '@/pages/supervisor/SupervisorPickupAssignmentGoLivePage';
import DispatchCenterGoLivePage from '@/pages/dispatch/DispatchCenterGoLivePage';
import BranchOfficeGoLivePage from '@/pages/branch/BranchOfficeGoLivePage';
import WarehouseScannerGoLivePage from '@/pages/warehouse/WarehouseScannerGoLivePage';
import FinanceSettlementGoLivePage from '@/pages/finance/FinanceSettlementGoLivePage';
import UnifiedPickupFormGoLive from '@/pages/portal/UnifiedPickupFormGoLive';

// --- DATA & CONFIG PAGES ---
import MasterDataManagementPage from '@/pages/master/MasterDataManagementPage';
import TariffMasterGoLivePage from '@/pages/master/TariffMasterGoLivePage';

// --- PRINTING PAGES ---
import DocumentPrintRoomPage from '@/pages/printing/DocumentPrintRoomPage';
import WaybillPrintStudioPage from '@/pages/printing/WaybillPrintStudioPage';
import InvoicePrintStudioPage from '@/pages/printing/InvoicePrintStudioPage';

export default function PortalLayoutGoLive({ currentUser, onLogout }: { currentUser: any, onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState('dashboard');

  // RBAC Navigation Configuration
  // 'hidden: true' keeps the item out of the sidebar while still allowing routing via the Print Room
  const navConfig = {
    "Super Admin": [
      { id: 'assignment', label: 'Dispatch Assignment', icon: UserCircle, component: <SupervisorPickupAssignmentGoLivePage /> },
      { id: 'pickup', label: 'Log Pickup', icon: Truck, component: <UnifiedPickupFormGoLive role="Super Admin" merchantCode="WALKIN" /> },
      { id: 'routing', label: 'Route Command', icon: Map, component: <DispatchCenterGoLivePage /> },
      { id: 'branch', label: 'Branch Snapshot', icon: Building2, component: <BranchOfficeGoLivePage /> },
      { id: 'scanner', label: 'Intake Scanner', icon: Scan, component: <WarehouseScannerGoLivePage /> },
      { id: 'settlement', label: 'COD Reconciliation', icon: Banknote, component: <FinanceSettlementGoLivePage /> },
      { id: 'master-data', label: 'Master Data', icon: Database, component: <MasterDataManagementPage /> },
      { id: 'tariffs', label: 'Tariff Rules', icon: Calculator, component: <TariffMasterGoLivePage /> },
      { id: 'print-room', label: 'Print Room', icon: Printer, component: <DocumentPrintRoomPage setActiveTab={setActiveTab} /> },
      { id: 'waybills', label: 'Waybill Studio', icon: FileText, component: <WaybillPrintStudioPage />, hidden: true },
      { id: 'invoices', label: 'Invoice Studio', icon: FileText, component: <InvoicePrintStudioPage />, hidden: true }
    ],
    Supervisor: [
      { id: 'assignment', label: 'Dispatch Assignment', icon: UserCircle, component: <SupervisorPickupAssignmentGoLivePage /> },
      { id: 'pickup', label: 'Log Pickup', icon: Truck, component: <UnifiedPickupFormGoLive role="Supervisor" merchantCode="WALKIN" /> },
      { id: 'master-data', label: 'Master Data', icon: Database, component: <MasterDataManagementPage /> },
      { id: 'print-room', label: 'Print Room', icon: Printer, component: <DocumentPrintRoomPage setActiveTab={setActiveTab} /> },
      { id: 'waybills', label: 'Waybill Studio', icon: FileText, component: <WaybillPrintStudioPage />, hidden: true },
      { id: 'invoices', label: 'Invoice Studio', icon: FileText, component: <InvoicePrintStudioPage />, hidden: true }
    ],
    Dispatch: [
      { id: 'routing', label: 'Route Command', icon: Map, component: <DispatchCenterGoLivePage /> },
      { id: 'branch', label: 'Branch Snapshot', icon: Building2, component: <BranchOfficeGoLivePage /> },
      { id: 'print-room', label: 'Print Room', icon: Printer, component: <DocumentPrintRoomPage setActiveTab={setActiveTab} /> },
      { id: 'waybills', label: 'Waybill Studio', icon: FileText, component: <WaybillPrintStudioPage />, hidden: true }
    ],
    Warehouse: [
      { id: 'scanner', label: 'Intake Scanner', icon: Scan, component: <WarehouseScannerGoLivePage /> }
    ],
    Finance: [
      { id: 'settlement', label: 'COD Reconciliation', icon: Banknote, component: <FinanceSettlementGoLivePage /> },
      { id: 'tariffs', label: 'Tariff Rules', icon: Calculator, component: <TariffMasterGoLivePage /> },
      { id: 'print-room', label: 'Print Room', icon: Printer, component: <DocumentPrintRoomPage setActiveTab={setActiveTab} /> },
      { id: 'invoices', label: 'Invoice Studio', icon: FileText, component: <InvoicePrintStudioPage />, hidden: true }
    ]
  };

  // Safe fallback resolver for roles
  const getRoleNav = (role: string) => {
    if (!role) return [];
    const normalizedRole = role.trim();
    return navConfig[normalizedRole as keyof typeof navConfig] || [];
  }

  const allowedNavs = getRoleNav(currentUser?.role);
  
  // Default to the first allowed tab on load
  useEffect(() => {
    if (allowedNavs.length > 0 && activeTab === 'dashboard') {
      setActiveTab(allowedNavs[0].id);
    }
  }, [currentUser?.role, allowedNavs, activeTab]);

  const renderActiveComponent = () => {
    const navItem = allowedNavs.find(nav => nav.id === activeTab);
    return navItem ? navItem.component : <div className="p-8 text-center text-gray-500">Access Restricted. Contact Administrator.</div>;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar - hidden during printing via "print:hidden" */}
      <div className="w-64 bg-blue-900 text-white flex-col shadow-lg hidden md:flex print:hidden">
        <div className="p-6 border-b border-blue-800">
          <h2 className="text-2xl font-bold tracking-wider">BRITIUM</h2>
          <p className="text-blue-300 text-xs mt-1">Enterprise Portal v1.0</p>
        </div>
        
        <div className="flex-1 py-6 px-4 space-y-2 overflow-y-auto custom-scrollbar">
          <div className="mb-6 px-2">
            <p className="text-xs text-blue-400 uppercase tracking-widest font-semibold">Active Role</p>
            <p className="font-medium text-lg">{currentUser?.role}</p>
            <p className="text-sm text-blue-300">{currentUser?.branch_code} Branch</p>
          </div>

          {/* Filter out hidden navigation items from the sidebar */}
          {allowedNavs.filter(nav => !nav.hidden).map(nav => {
            const Icon = nav.icon;
            const isActive = activeTab === nav.id;
            return (
              <button
                key={nav.id}
                onClick={() => setActiveTab(nav.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive ? 'bg-blue-800 text-white' : 'text-blue-200 hover:bg-blue-800/50 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="font-medium text-left">{nav.label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-blue-800">
          <Button variant="ghost" onClick={onLogout} className="w-full justify-start text-blue-200 hover:text-white hover:bg-blue-800">
            <LogOut className="w-5 h-5 mr-3 shrink-0" /> Sign Out
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden print:h-auto print:overflow-visible">
        
        {/* Mobile Header - hidden during printing */}
        <header className="bg-white border-b p-4 flex justify-between items-center md:hidden shadow-sm print:hidden">
          <h2 className="font-bold text-xl text-blue-900">BRITIUM</h2>
          <span className="text-xs font-semibold bg-blue-100 text-blue-800 px-3 py-1 rounded-full border border-blue-200">
            {currentUser?.role}
          </span>
        </header>

        {/* Dynamic Page Rendering - removes padding overflow constraints during print */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 print:p-0 print:overflow-visible">
          {renderActiveComponent()}
        </main>
      </div>
    </div>
  );
}