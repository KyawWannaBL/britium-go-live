// components/layout/PortalLayoutGoLive.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Truck, Map, Scan, Banknote, Building2, UserCircle, LogOut } from 'lucide-react';

// Import our newly created pages
import SupervisorPickupAssignmentGoLivePage from '@/pages/supervisor/SupervisorPickupAssignmentGoLivePage';
import DispatchCenterGoLivePage from '@/pages/dispatch/DispatchCenterGoLivePage';
import BranchOfficeGoLivePage from '@/pages/branch/BranchOfficeGoLivePage';
import WarehouseScannerGoLivePage from '@/pages/warehouse/WarehouseScannerGoLivePage';
import FinanceSettlementGoLivePage from '@/pages/finance/FinanceSettlementGoLivePage';
import UnifiedPickupFormGoLive from '@/pages/portal/UnifiedPickupFormGoLive';

export default function PortalLayoutGoLive({ currentUser }: { currentUser: any }) {
  const [activeTab, setActiveTab] = useState('dashboard');

  const navConfig = {
    Supervisor: [
      { id: 'assignment', label: 'Dispatch Assignment', icon: UserCircle, component: <SupervisorPickupAssignmentGoLivePage /> },
      { id: 'pickup', label: 'Log Pickup', icon: Truck, component: <UnifiedPickupFormGoLive role="Supervisor" merchantCode="WALKIN" /> }
    ],
    Dispatch: [
      { id: 'routing', label: 'Route Command', icon: Map, component: <DispatchCenterGoLivePage /> },
      { id: 'branch', label: 'Branch Snapshot', icon: Building2, component: <BranchOfficeGoLivePage /> }
    ],
    Warehouse: [
      { id: 'scanner', label: 'Intake Scanner', icon: Scan, component: <WarehouseScannerGoLivePage /> }
    ],
    Finance: [
      { id: 'settlement', label: 'COD Reconciliation', icon: Banknote, component: <FinanceSettlementGoLivePage /> }
    ]
  };

  const allowedNavs = navConfig[currentUser.role as keyof typeof navConfig] || [];
  
  // Default to the first allowed tab on load
  useEffect(() => {
    if (allowedNavs.length > 0 && activeTab === 'dashboard') {
      setActiveTab(allowedNavs[0].id);
    }
  }, [currentUser.role]);

  const renderActiveComponent = () => {
    const navItem = allowedNavs.find(nav => nav.id === activeTab);
    return navItem ? navItem.component : <div className="p-8 text-center text-gray-500">Access Restricted</div>;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-blue-900 text-white flex flex-col shadow-lg hidden md:flex">
        <div className="p-6 border-b border-blue-800">
          <h2 className="text-2xl font-bold tracking-wider">BRITIUM</h2>
          <p className="text-blue-300 text-xs mt-1">Enterprise Portal v1.0</p>
        </div>
        
        <div className="flex-1 py-6 px-4 space-y-2">
          <div className="mb-6 px-2">
            <p className="text-xs text-blue-400 uppercase tracking-widest font-semibold">Active Role</p>
            <p className="font-medium text-lg">{currentUser.role}</p>
            <p className="text-sm text-blue-300">{currentUser.branch_code} Branch</p>
          </div>

          {allowedNavs.map(nav => {
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
                <Icon className="w-5 h-5" />
                <span className="font-medium">{nav.label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-blue-800">
          <Button variant="ghost" className="w-full justify-start text-blue-200 hover:text-white hover:bg-blue-800">
            <LogOut className="w-5 h-5 mr-3" /> Sign Out
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="bg-white border-b p-4 flex justify-between items-center md:hidden shadow-sm">
          <h2 className="font-bold text-xl text-blue-900">BRITIUM</h2>
          <span className="text-sm font-semibold bg-gray-100 px-3 py-1 rounded-full">{currentUser.role}</span>
        </header>

        {/* Dynamic Page Rendering */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {renderActiveComponent()}
        </main>
      </div>
    </div>
  );
}