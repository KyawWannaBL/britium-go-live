import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  DollarSign, 
  Users, 
  Store,
  Truck,
  Plus, 
  Edit, 
  Trash2, 
  Save, 
  X,
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  Ban,
  ShieldCheck
} from 'lucide-react';

// --- NATIVE FETCH SUPABASE CLIENT ---
// To avoid compilation/bundler errors with external imports in this environment,
// we use a lightweight, native fetch wrapper that connects directly to the Supabase REST API.
const createClient = (url, key) => {
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  return {
    from: (table) => {
      const baseUrl = `${url}/rest/v1/${table}`;
      return {
        select: (columns = '*') => ({
          order: async (column, { ascending = true } = {}) => {
            try {
              const res = await fetch(`${baseUrl}?select=${columns}&order=${column}.${ascending ? 'asc' : 'desc'}`, { headers });
              if (!res.ok) throw await res.json();
              const data = await res.json();
              return { data, error: null };
            } catch (error) {
              return { data: null, error };
            }
          }
        }),
        insert: (payload) => ({
          select: async () => {
            try {
              const res = await fetch(baseUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
              });
              if (!res.ok) throw await res.json();
              const data = await res.json();
              return { data, error: null };
            } catch (error) {
              return { data: null, error };
            }
          }
        }),
        update: (payload) => ({
          eq: async (column, value) => {
            try {
              const res = await fetch(`${baseUrl}?${column}=eq.${value}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify(payload)
              });
              if (!res.ok) throw await res.json();
              const data = await res.json();
              return { data, error: null };
            } catch (error) {
              return { data: null, error };
            }
          }
        }),
        delete: () => ({
          eq: async (column, value) => {
            try {
              const res = await fetch(`${baseUrl}?${column}=eq.${value}`, {
                method: 'DELETE',
                headers
              });
              if (!res.ok) throw await res.json();
              return { data: null, error: null };
            } catch (error) {
              return { data: null, error };
            }
          }
        })
      };
    }
  };
};

// --- REAL SUPABASE CONNECTION ---
// Paste your actual Supabase URL and Anon Key here:
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY';

const supabase = createClient(supabaseUrl, supabaseKey);

// --- REFERENCE DATA (Extracted from Dropdown_Reference.csv) ---
const dropdownOptions = {
  businessTypes: ['Retail', 'Wholesale', 'E-commerce', 'Marketplace', 'Corporate', 'SME', 'Individual Seller', 'Online Shop', 'Book Store', 'Branch Office'],
  roles: ['customer_service', 'marketing', 'business_development_manager', 'supervisor', 'operation_manager', 'warehouse', 'finance', 'finance_manager', 'admin', 'superadmin', 'data_entry', 'RIDER', 'DRIVER', 'HELPER'],
  vehicleTypes: ['Bike', 'Van', 'Truck', 'Mini Truck', 'Car'],
  regions: ['Yangon Region', 'Mandalay Region', 'Naypyidaw Union Territory', 'Bago Region', 'Ayeyarwady Region', 'Mon State', 'Shan State', 'Rakhine State', 'Kachin State', 'Sagaing Region', 'Magway Region'],
  cities: ['Yangon', 'Mandalay', 'Naypyidaw', 'Mawlamyine', 'Bago', 'Pathein', 'Taunggyi', 'Sittwe', 'Myitkyina', 'Lashio'],
  serviceTypes: ['STANDARD', 'EXPRESS', 'SAME_DAY', 'CARGO']
};

// --- REALISTIC MOCK DATA (Fallback if DB connection fails) ---
const mockTownships = [
  { id: 'MMR013012', township_name: 'North Okkalapa', city: 'Yangon', region: 'Yangon Region', active: true },
  { id: 'MMR013011', township_name: 'South Okkalapa', city: 'Yangon', region: 'Yangon Region', active: true },
  { id: 'MMR013039', township_name: 'Sanchaung', city: 'Yangon', region: 'Yangon Region', active: true },
  { id: 'MMR013007', township_name: 'Shwepyithar', city: 'Yangon', region: 'Yangon Region', active: true },
];

const mockWorkforce = [
  { id: 'RID001', workforce_code: 'RID001', name: 'Ko Kyaw Zin Khant', role: 'RIDER', branch_code: 'YGN', phone: '09-779 052 872', status: 'Active' },
  { id: 'DRV001', workforce_code: 'DRV001', name: 'U Wai Phyo Lwin', role: 'DRIVER', branch_code: 'YGN', phone: '09-260 741 691', status: 'Active' },
  { id: 'EMP001', workforce_code: 'EMP001', name: 'Daw Aye Pwint Phyu', role: 'operation_manager', branch_code: 'HQ', phone: '09-740 908 663', status: 'Active' },
  { id: 'EMP002', workforce_code: 'EMP002', name: 'U Nay Soe', role: 'supervisor', branch_code: 'YGN', phone: '09-424 399 126', status: 'Suspended' },
];

const mockMerchants = [
  { id: 'ALN', merchant_name: 'Alnoor', business_type: 'Online Shop', contact: 'Gon Gon', phone: '09448088835', township: 'North Dagon', active: false },
  { id: 'APA', merchant_name: 'APAC', business_type: 'Online Shop', contact: 'Ma Wai Zin Phyo', phone: '09888867040', township: 'Tamwe', active: true },
  { id: 'TZ', merchant_name: 'TZ-5 Fashion Shop', business_type: 'Online Shop', contact: 'Khaing Thazin Han', phone: '09-981381635', township: 'South Okkalapa', active: true },
];

const mockFleet = [
  { id: 'FLT001', vehicle_no: '6H-7397', vehicle_type: 'Van', capacity: '700', driver: 'DRV001', status: 'Assigned' },
  { id: 'FLT002', vehicle_no: '4S-1626', vehicle_type: 'Mini Truck', capacity: '850', driver: '', status: 'Available' },
];

const mockTariffs = [
  { id: 'TRF01', tariff_code: 'YGN-LOCAL-STANDARD', tariff_name: 'Yangon Local Std', zone_code: 'YGN_LOCAL', service_type: 'STANDARD', base_fee: 7500, active: true },
  { id: 'TRF02', tariff_code: 'YGN-OUTER-EXPRESS', tariff_name: 'Yangon Outer Exp', zone_code: 'YGN_OUTER', service_type: 'EXPRESS', base_fee: 12000, active: true },
];

const getTableName = (tabId) => {
  const map = {
    townships: 'be_township_master',
    workforce: 'be_mobile_workforce_accounts',
    merchants: 'be_merchant_master',
    fleet: 'be_fleet_master',
    tariffs: 'be_tariff_master'
  };
  return map[tabId];
};

export default function MasterDataScreen() {
  const [activeTab, setActiveTab] = useState('merchants');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [backendStatus, setBackendStatus] = useState('connected'); 

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});

  // State for data
  const [data, setData] = useState({
    townships: [],
    workforce: [],
    merchants: [],
    fleet: [],
    tariffs: []
  });

  useEffect(() => {
    fetchMasterData();
  }, [activeTab]);

  const fetchMasterData = async () => {
    setLoading(true);
    setSearchQuery('');
    
    try {
      if (supabaseUrl === 'YOUR_SUPABASE_URL') {
        throw new Error("Supabase credentials not configured.");
      }

      const { data: dbData, error } = await supabase.from(getTableName(activeTab)).select('*').order('id', { ascending: false });
      
      if (error) throw error;
      
      if (dbData) {
        setData(prev => ({ ...prev, [activeTab]: dbData }));
        setBackendStatus('connected');
      }
    } catch (err) {
      console.warn("Backend fetch failed, falling back to mock data:", err.message);
      setBackendStatus('fallback');
      
      // Inject mock data if connection fails
      if (activeTab === 'townships') setData(prev => ({ ...prev, townships: mockTownships }));
      if (activeTab === 'workforce') setData(prev => ({ ...prev, workforce: mockWorkforce }));
      if (activeTab === 'merchants') setData(prev => ({ ...prev, merchants: mockMerchants }));
      if (activeTab === 'fleet') setData(prev => ({ ...prev, fleet: mockFleet }));
      if (activeTab === 'tariffs') setData(prev => ({ ...prev, tariffs: mockTariffs }));
    } finally {
      setLoading(false);
    }
  };

  // --- REAL SUPABASE CRUD HANDLERS ---

  const openAddModal = () => {
    setEditingId(null);
    setFormData({
      status: activeTab === 'workforce' ? 'Active' : 'Available',
      active: true
    });
    setIsModalOpen(true);
  };

  const openEditModal = (row) => {
    setEditingId(row.id);
    setFormData({ ...row });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData({});
    setEditingId(null);
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const table = getTableName(activeTab);
    
    try {
      const payload = { ...formData };
      
      // Strip mock IDs for new inserts so DB auto-generates them
      if (!editingId && payload.id && payload.id.startsWith('NEW-')) {
          delete payload.id;
      }
      
      if (editingId) {
        // UPDATE Record
        const { error } = await supabase.from(table).update(payload).eq('id', editingId);
        if (error) throw error;
        
        setData(prev => ({
          ...prev,
          [activeTab]: prev[activeTab].map(item => item.id === editingId ? { ...item, ...payload } : item)
        }));
      } else {
        // INSERT New Record
        const { data: insertedData, error } = await supabase.from(table).insert([payload]).select();
        if (error) throw error;

        const newRecord = insertedData && insertedData.length > 0 
          ? insertedData[0] 
          : { ...payload, id: `NEW-${Math.floor(Math.random() * 10000)}` };

        setData(prev => ({
          ...prev,
          [activeTab]: [newRecord, ...prev[activeTab]]
        }));
      }
      closeModal();
    } catch (error) {
      console.error("Save failed:", error);
      const msg = error.message || error.details || JSON.stringify(error);
      
      // If it's an RLS error, provide clear instructions
      if (msg.toLowerCase().includes("row-level security") || msg.toLowerCase().includes("rls")) {
        alert(`ACCESS DENIED: Row-Level Security (RLS) is blocking this action.\n\nTo fix this, go to your Supabase SQL Editor and run:\n\nALTER TABLE public.${table} DISABLE ROW LEVEL SECURITY;\n\n(Or add a valid RLS Insert/Update Policy)`);
      } else {
        alert(`Failed to save record: ${msg}`);
      }
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to completely remove this record?")) {
      const table = getTableName(activeTab);
      
      try {
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) throw error;
        
        setData(prev => ({
          ...prev,
          [activeTab]: prev[activeTab].filter(item => item.id !== id)
        }));
      } catch (error) {
        console.error("Delete failed:", error);
        const msg = error.message || error.details || JSON.stringify(error);
        if (msg.toLowerCase().includes("row-level security")) {
            alert(`ACCESS DENIED: RLS is blocking deletion on ${table}. Disable it via Supabase SQL Editor.`);
        } else {
            alert(`Failed to delete record: ${msg}`);
        }
      }
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const table = getTableName(activeTab);
    const isWorkforceTab = activeTab === 'workforce';
    
    // Determine new status based on tab type
    let payload = {};
    if (isWorkforceTab) {
      payload.status = currentStatus === 'Active' ? 'Suspended' : 'Active';
    } else {
      payload.active = !currentStatus;
    }

    try {
      const { error } = await supabase.from(table).update(payload).eq('id', id);
      if (error) throw error;

      setData(prev => ({
        ...prev,
        [activeTab]: prev[activeTab].map(item => {
          if (item.id === id) {
            return { ...item, ...payload };
          }
          return item;
        })
      }));
    } catch (error) {
      console.error("Status toggle failed:", error);
      alert(`Failed to update status: ${error.message || error.details || 'Unknown error'}`);
    }
  };

  const navItems = [
    { id: 'merchants', label: 'Merchants / Shops', icon: Store, singular: 'Merchant' },
    { id: 'workforce', label: 'Users & Workforce', icon: Users, singular: 'User/Workforce' },
    { id: 'fleet', label: 'Fleet & Vehicles', icon: Truck, singular: 'Vehicle' },
    { id: 'townships', label: 'Townships & Zones', icon: MapPin, singular: 'Township' },
    { id: 'tariffs', label: 'Delivery Tariffs', icon: DollarSign, singular: 'Tariff' },
  ];

  // Filtering Logic
  const getFilteredData = () => {
    const currentData = data[activeTab] || [];
    if (!searchQuery) return currentData;
    const lowerQuery = searchQuery.toLowerCase();
    return currentData.filter(item => Object.values(item).join(' ').toLowerCase().includes(lowerQuery));
  };

  const filteredData = getFilteredData();
  const currentTabInfo = navItems.find(i => i.id === activeTab);

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-slate-800">
      
      {/* Sidebar Navigation */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm z-20">
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-xl font-bold text-indigo-700 tracking-tight flex items-center">
            <ShieldCheck className="w-6 h-6 mr-2" /> Britium Admin
          </h1>
          <p className="text-xs text-gray-500 mt-1">Master Data Management</p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-150 ${
                activeTab === item.id 
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100' 
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent'
              }`}
            >
              <item.icon className={`w-5 h-5 mr-3 ${activeTab === item.id ? 'text-indigo-600' : 'text-gray-400'}`} />
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200 px-8 py-5 flex justify-between items-center z-10 shadow-sm">
          <div className="flex items-center space-x-4">
            <h2 className="text-2xl font-semibold text-gray-800">
              {currentTabInfo?.label}
            </h2>
            {backendStatus === 'fallback' ? (
              <span className="flex items-center text-xs font-medium bg-amber-100 text-amber-800 px-3 py-1 rounded-full border border-amber-200">
                <AlertCircle className="w-3 h-3 mr-1.5" />
                Offline Mode (Local Mock Sync)
              </span>
            ) : (
               <span className="flex items-center text-xs font-medium bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full border border-emerald-200">
                <CheckCircle className="w-3 h-3 mr-1.5" />
                Live Supabase Connection
              </span>
            )}
          </div>
          <button 
            onClick={openAddModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add New {currentTabInfo?.singular}
          </button>
        </header>

        {/* Data Container */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-8">
          
          <div className="mb-6 flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${currentTabInfo?.label.toLowerCase()}...`} 
                className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white w-96 transition-all"
              />
            </div>
            <div className="text-sm text-gray-600 font-medium bg-gray-100 px-4 py-2 rounded-lg">
              Total Count: <span className="text-indigo-700 font-bold">{filteredData.length}</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="p-16 text-center text-gray-500 flex flex-col items-center">
                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                Syncing with Database...
              </div>
            ) : filteredData.length === 0 ? (
              <div className="p-16 text-center text-gray-500">
                <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Search className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-lg font-medium text-gray-900">No records found</p>
                <p className="text-sm mt-1">Try adjusting your search filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                {activeTab === 'townships' && <TownshipsTable data={filteredData} onEdit={openEditModal} onDelete={handleDelete} onToggleStatus={handleToggleStatus} />}
                {activeTab === 'workforce' && <WorkforceTable data={filteredData} onEdit={openEditModal} onDelete={handleDelete} onToggleStatus={handleToggleStatus} />}
                {activeTab === 'merchants' && <MerchantsTable data={filteredData} onEdit={openEditModal} onDelete={handleDelete} onToggleStatus={handleToggleStatus} />}
                {activeTab === 'fleet' && <FleetTable data={filteredData} onEdit={openEditModal} onDelete={handleDelete} />}
                {activeTab === 'tariffs' && <TariffsTable data={filteredData} onEdit={openEditModal} onDelete={handleDelete} onToggleStatus={handleToggleStatus} />}
              </div>
            )}
          </div>
          
        </main>

        {/* Dynamic Add/Edit Record Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900 bg-opacity-60 backdrop-blur-sm transition-opacity">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
              
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <h3 className="text-lg font-bold text-gray-900">
                  {editingId ? 'Edit' : 'Add New'} {currentTabInfo?.singular}
                </h3>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 bg-gray-200 hover:bg-gray-300 rounded-full p-1 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleFormSubmit} className="overflow-y-auto p-6 space-y-4">
                
                {/* MERCHANTS */}
                {activeTab === 'merchants' && (
                  <>
                    <InputField label="Shop / Merchant Name" name="merchant_name" value={formData.merchant_name} onChange={handleFormChange} required />
                    <InputField label="Merchant Code (Optional)" name="merchant_code" value={formData.merchant_code} onChange={handleFormChange} placeholder="Auto-generated if left blank" />
                    
                    <DropdownField label="Business Type" name="business_type" value={formData.business_type} options={dropdownOptions.businessTypes} onChange={handleFormChange} required />
                    
                    <div className="grid grid-cols-2 gap-4">
                      <InputField label="Contact Person" name="contact" value={formData.contact} onChange={handleFormChange} />
                      <InputField label="Phone Number" name="phone_primary" value={formData.phone_primary || formData.phone} onChange={handleFormChange} required />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <DropdownField label="City" name="city" value={formData.city} options={dropdownOptions.cities} onChange={handleFormChange} />
                      <InputField label="Township" name="township" value={formData.township} onChange={handleFormChange} required />
                    </div>
                  </>
                )}

                {/* WORKFORCE / USERS */}
                {activeTab === 'workforce' && (
                  <>
                    <InputField label="Workforce ID / Code" name="workforce_code" value={formData.workforce_code} onChange={handleFormChange} placeholder="e.g. RID003" required />
                    <InputField label="Full Name" name="name" value={formData.name} onChange={handleFormChange} required />
                    
                    <DropdownField label="Role / Authorization Level" name="role" value={formData.role} options={dropdownOptions.roles} onChange={handleFormChange} required />

                    <div className="grid grid-cols-2 gap-4">
                      <InputField label="Phone Number" name="phone" value={formData.phone} onChange={handleFormChange} required />
                      <InputField label="Branch Code" name="branch_code" value={formData.branch_code} onChange={handleFormChange} placeholder="e.g. YGN" required />
                    </div>
                  </>
                )}

                {/* FLEET */}
                {activeTab === 'fleet' && (
                  <>
                    <InputField label="Vehicle Number (Plate)" name="vehicle_no" value={formData.vehicle_no} onChange={handleFormChange} placeholder="e.g. 6H-7397" required />
                    
                    <DropdownField label="Vehicle Type" name="vehicle_type" value={formData.vehicle_type} options={dropdownOptions.vehicleTypes} onChange={handleFormChange} required />
                    
                    <div className="grid grid-cols-2 gap-4">
                      <InputField label="Capacity Payload (kg)" name="capacity_kg" type="number" value={formData.capacity_kg || formData.capacity} onChange={handleFormChange} required />
                      <InputField label="Assigned Driver ID" name="driver" value={formData.driver} onChange={handleFormChange} placeholder="e.g. DRV001 (Optional)" />
                    </div>
                  </>
                )}

                {/* TOWNSHIPS */}
                {activeTab === 'townships' && (
                  <>
                    <InputField label="Township Name" name="township_name" value={formData.township_name} onChange={handleFormChange} required />
                    <DropdownField label="City" name="city" value={formData.city} options={dropdownOptions.cities} onChange={handleFormChange} required />
                    <DropdownField label="Region / State" name="region" value={formData.region} options={dropdownOptions.regions} onChange={handleFormChange} required />
                  </>
                )}

                {/* TARIFFS */}
                {activeTab === 'tariffs' && (
                  <>
                    <InputField label="Tariff Code (Unique)" name="tariff_code" value={formData.tariff_code} onChange={handleFormChange} placeholder="e.g. YGN-LOCAL-STANDARD" required />
                    <InputField label="Display Name" name="tariff_name" value={formData.tariff_name} onChange={handleFormChange} required />
                    
                    <div className="grid grid-cols-2 gap-4">
                      <InputField label="Target Zone Code" name="zone_code" value={formData.zone_code} onChange={handleFormChange} placeholder="e.g. YGN_LOCAL" required />
                      <DropdownField label="Service Type" name="service_type" value={formData.service_type} options={dropdownOptions.serviceTypes} onChange={handleFormChange} required />
                    </div>

                    <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 mt-2">
                      <InputField label="Base Delivery Fee (MMK)" name="base_fee" type="number" value={formData.base_fee} onChange={handleFormChange} required />
                      <p className="text-xs text-indigo-600 mt-1">This fee acts as the background calculation base for delivery charges.</p>
                    </div>
                  </>
                )}

                <div className="pt-6 pb-2 flex justify-end space-x-3 border-t border-gray-100 mt-6">
                  <button 
                    type="button" 
                    onClick={closeModal}
                    className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2.5 bg-indigo-600 rounded-lg text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm flex items-center"
                  >
                    <Save className="w-4 h-4 mr-2" /> {editingId ? 'Update Record' : 'Save Record'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// --- SHARED UI COMPONENTS ---

function InputField({ label, name, type = "text", value, onChange, placeholder, required }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all text-sm"
      />
    </div>
  );
}

function DropdownField({ label, name, value, options, onChange, required }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        name={name}
        value={value || ''}
        onChange={onChange}
        required={required}
        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all text-sm capitalize"
      >
        <option value="" disabled>Select {label}...</option>
        {options.map((opt, idx) => (
          <option key={idx} value={opt}>{opt.replace(/_/g, ' ')}</option>
        ))}
      </select>
    </div>
  );
}

function StatusBadge({ active, text }) {
  const isActive = text ? text === 'Active' : active;
  const isSuspended = text === 'Suspended';

  if (isSuspended) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200">
        <Ban className="w-3 h-3 mr-1.5" /> Suspended
      </span>
    );
  }

  return isActive ? (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
      <CheckCircle className="w-3 h-3 mr-1.5" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-red-100 text-red-800 border border-red-200">
      <XCircle className="w-3 h-3 mr-1.5" /> Inactive
    </span>
  );
}

function ActionButtons({ row, onEdit, onDelete, onToggleStatus, statusKey = 'active' }) {
  const isCurrentlyActive = statusKey === 'status' ? row.status === 'Active' : row.active;

  return (
    <div className="flex justify-end items-center space-x-1">
      {onToggleStatus && (
        <button 
          onClick={() => onToggleStatus(row.id, row[statusKey])}
          title={isCurrentlyActive ? "Block / Deactivate" : "Activate"}
          className={`p-2 rounded hover:bg-gray-100 transition-colors ${isCurrentlyActive ? 'text-amber-600' : 'text-emerald-600'}`}
        >
          {isCurrentlyActive ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
        </button>
      )}
      <button 
        onClick={() => onEdit(row)}
        title="Edit Record"
        className="p-2 rounded text-indigo-600 hover:bg-indigo-50 transition-colors"
      >
        <Edit className="w-4 h-4" />
      </button>
      <button 
        onClick={() => onDelete(row.id)}
        title="Delete Record"
        className="p-2 rounded text-red-500 hover:bg-red-50 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// --- TABLE SUB-COMPONENTS ---

function MerchantsTable({ data, onEdit, onDelete, onToggleStatus }) {
  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Merchant Code</th>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Shop Name & Type</th>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Contact</th>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Location</th>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Auth Status</th>
          <th className="px-6 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {data.map((row) => (
          <tr key={row.id || row.merchant_code} className="hover:bg-gray-50 transition-colors">
            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-600">{row.merchant_code || row.id}</td>
            <td className="px-6 py-4 whitespace-nowrap">
              <div className="text-sm font-bold text-gray-900">{row.merchant_name}</div>
              <div className="text-xs text-gray-500 capitalize">{row.business_type}</div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
              {row.contact_person || row.contact} <br />
              <span className="text-xs text-gray-400 font-mono">{row.phone_primary || row.phone}</span>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {row.township} {row.city && `, ${row.city}`}
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
              <StatusBadge active={row.active !== undefined ? row.active : row.is_active} />
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-right">
              <ActionButtons row={row} onEdit={onEdit} onDelete={onDelete} onToggleStatus={onToggleStatus} statusKey="active" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WorkforceTable({ data, onEdit, onDelete, onToggleStatus }) {
  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">ID</th>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Role & Access</th>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Phone</th>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
          <th className="px-6 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {data.map((row) => (
          <tr key={row.id || row.workforce_code} className="hover:bg-gray-50 transition-colors">
            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-600">{row.workforce_code}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{row.name || row.full_name}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm">
              <span className="bg-gray-100 text-gray-800 px-2.5 py-1 rounded-md text-xs font-bold border border-gray-200 uppercase tracking-wide">
                {(row.role || '').replace(/_/g, ' ')}
              </span>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{row.phone || row.phone_primary}</td>
            <td className="px-6 py-4 whitespace-nowrap">
              <StatusBadge text={row.status} />
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
              <ActionButtons row={row} onEdit={onEdit} onDelete={onDelete} onToggleStatus={onToggleStatus} statusKey="status" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FleetTable({ data, onEdit, onDelete }) {
  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Vehicle No.</th>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Capacity</th>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Assigned Driver</th>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">State</th>
          <th className="px-6 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {data.map((row) => (
          <tr key={row.id || row.vehicle_no} className="hover:bg-gray-50 transition-colors">
            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
              {row.vehicle_no} <br />
              <span className="text-xs font-normal text-gray-400">ID: {row.id}</span>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-medium">{row.vehicle_type}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{row.capacity_kg || row.capacity} kg</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-600">{row.driver || row.assigned_driver_id || 'Unassigned'}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.status}</td>
            <td className="px-6 py-4 whitespace-nowrap text-right">
              <ActionButtons row={row} onEdit={onEdit} onDelete={onDelete} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TownshipsTable({ data, onEdit, onDelete, onToggleStatus }) {
  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Township</th>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">City</th>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Region</th>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Serving Status</th>
          <th className="px-6 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {data.map((row) => (
          <tr key={row.id || row.township_name} className="hover:bg-gray-50 transition-colors">
            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
              {row.township_name}
              <br/><span className="text-xs font-normal text-gray-400">{row.id}</span>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{row.city}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{row.region}</td>
            <td className="px-6 py-4 whitespace-nowrap">
              <StatusBadge active={row.active} />
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-right">
              <ActionButtons row={row} onEdit={onEdit} onDelete={onDelete} onToggleStatus={onToggleStatus} statusKey="active" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TariffsTable({ data, onEdit, onDelete, onToggleStatus }) {
  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Tariff Code</th>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Calculation Base</th>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Zone & Service</th>
          <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
          <th className="px-6 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {data.map((row) => (
          <tr key={row.id || row.tariff_code} className="hover:bg-gray-50 transition-colors">
            <td className="px-6 py-4 whitespace-nowrap">
              <div className="text-sm font-bold font-mono text-indigo-700">{row.tariff_code}</div>
              <div className="text-xs text-gray-500 mt-0.5">{row.tariff_name}</div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm">
              <span className="font-bold text-gray-900 bg-green-50 px-2 py-1 rounded text-base border border-green-200">
                {Number(row.base_fee).toLocaleString()} <span className="text-xs font-normal text-gray-500">MMK</span>
              </span>
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
              <div className="text-sm font-bold text-gray-700">{row.zone_code}</div>
              <div className="text-xs text-gray-500 mt-0.5">{row.service_type}</div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
              <StatusBadge active={row.active} />
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-right">
              <ActionButtons row={row} onEdit={onEdit} onDelete={onDelete} onToggleStatus={onToggleStatus} statusKey="active" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}