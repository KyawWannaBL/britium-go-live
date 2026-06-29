import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Database, Store, Users, Truck, Settings2, Plus, Edit2, Save, X, ShieldAlert, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

// Define the Master Tables and their visible columns based on your uploaded CSV templates
const MASTER_CONFIGS = {
  merchants: {
    table: 'be_merchants',
    icon: Store,
    title: 'Merchant Master',
    columns: ['merchant_code', 'merchant_name', 'business_type', 'phone_primary', 'township', 'contract_status', 'is_active']
  },
  workforce: {
    table: 'be_mobile_workforce_accounts',
    icon: Users,
    title: 'Workforce (Riders/Drivers)',
    columns: ['workforce_code', 'name', 'workforce_role', 'phone_primary', 'assigned_zone', 'is_active']
  },
  fleet: {
    table: 'be_fleet_master',
    icon: Truck,
    title: 'Fleet & Vehicles',
    columns: ['fleet_id', 'vehicle_no', 'vehicle_type', 'capacity_kg', 'status']
  },
  dropdowns: {
    table: 'be_master_data_options',
    icon: Settings2,
    title: 'Global Dropdown Preferences',
    columns: ['dropdown_name', 'value', 'label_mm', 'sort_order', 'is_active']
  }
};

type ConfigKey = keyof typeof MASTER_CONFIGS;

export default function MasterDataControlCenter({ currentUser }: { currentUser: any }) {
  const [activeTab, setActiveTab] = useState<ConfigKey>('merchants');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Inline Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});

  const config = MASTER_CONFIGS[activeTab];

  // RBAC Frontend Guard
  const hasAccess = ['Super Admin', 'System Administrator'].includes(currentUser?.role);

  const fetchData = async () => {
    setLoading(true);
    const { data: records, error } = await supabase
      .from(config.table)
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && records) {
      setData(records);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  // Keep data fresh if another admin edits it
  useRealtimeSync(config.table, fetchData);

  const handleEditClick = (row: any) => {
    setEditingId(row.id || row.merchant_code || row.workforce_code);
    setEditFormData(row);
  };

  const handleSave = async () => {
    const pkColumn = config.table === 'be_merchants' ? 'merchant_code' 
                   : config.table === 'be_mobile_workforce_accounts' ? 'workforce_code' 
                   : 'id';

    try {
      const { error } = await supabase
        .from(config.table)
        .update(editFormData)
        .eq(pkColumn, editingId);

      if (error) throw error;
      
      toast({ title: "Success", description: "Master record updated and synced globally." });
      setEditingId(null);
      fetchData();
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    }
  };

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[600px] text-gray-500">
        <ShieldAlert className="w-16 h-16 text-red-400 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900">Access Restricted</h2>
        <p>Only Super Admins possess the authority to modify global Master Data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center">
            <Database className="mr-3 text-blue-600"/> Master Data Control Center
          </h2>
          <p className="text-sm text-gray-500 mt-1">Authorized modifications here instantly sync to all Portals and Rider Apps.</p>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center hover:bg-blue-700 transition">
          <Plus className="w-4 h-4 mr-2"/> Add New Record
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {(Object.keys(MASTER_CONFIGS) as ConfigKey[]).map((key) => {
          const TabIcon = MASTER_CONFIGS[key].icon;
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2.5 rounded-t-lg font-bold flex items-center gap-2 transition-colors ${
                isActive ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 border-b-0'
              }`}
            >
              <TabIcon className="w-4 h-4" /> {MASTER_CONFIGS[key].title}
            </button>
          );
        })}
      </div>

      {/* Dynamic Data Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-blue-600"><Loader2 className="w-8 h-8 animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider font-bold">
                <tr>
                  {config.columns.map(col => (
                    <th key={col} className="p-4">{col.replace(/_/g, ' ')}</th>
                  ))}
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((row) => {
                  const isEditing = editingId === (row.id || row.merchant_code || row.workforce_code);
                  return (
                    <tr key={row.id || row.merchant_code || row.workforce_code} className={isEditing ? 'bg-blue-50/50' : 'hover:bg-gray-50'}>
                      {config.columns.map(col => (
                        <td key={col} className="p-4">
                          {isEditing ? (
                            <input
                              type={typeof row[col] === 'boolean' ? 'checkbox' : 'text'}
                              checked={typeof row[col] === 'boolean' ? editFormData[col] : undefined}
                              value={typeof row[col] !== 'boolean' ? editFormData[col] || '' : undefined}
                              onChange={(e) => setEditFormData({
                                ...editFormData, 
                                [col]: e.target.type === 'checkbox' ? e.target.checked : e.target.value
                              })}
                              className={`border border-gray-300 rounded px-2 py-1 ${typeof row[col] === 'boolean' ? 'w-5 h-5' : 'w-full'}`}
                            />
                          ) : (
                            <span className={typeof row[col] === 'boolean' ? (row[col] ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold') : 'text-gray-800'}>
                              {String(row[col] ?? '-')}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="p-4 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={handleSave} className="text-emerald-600 hover:bg-emerald-50 p-1.5 rounded"><Save className="w-4 h-4"/></button>
                            <button onClick={() => setEditingId(null)} className="text-red-600 hover:bg-red-50 p-1.5 rounded"><X className="w-4 h-4"/></button>
                          </div>
                        ) : (
                          <button onClick={() => handleEditClick(row)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded">
                            <Edit2 className="w-4 h-4"/>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {data.length === 0 && (
                  <tr><td colSpan={config.columns.length + 1} className="p-8 text-center text-gray-500">No active records found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}