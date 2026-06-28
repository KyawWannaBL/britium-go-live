import React, { useState } from 'react';
import { 
  Package, 
  Truck, 
  ArrowLeftRight, 
  CheckCircle2, 
  Search, 
  Filter,
  RefreshCw,
  ScanLine
} from 'lucide-react';

// လိုအပ်နေသော LanguageContext အစား အစားထိုးအသုံးပြုရန် (Mock)
const useLanguage = () => ({
  t: (en: string, mm?: string) => mm || en
});

const mockBranchParcels = [
  { id: 'D0627-BBG-015', merchant: 'Baby Genius', recipient: 'Ma Htet Htet', status: 'ARRIVED_AT_BRANCH', cod: 79000 },
  { id: 'D0627-BCA-100', merchant: 'Beauty Cos', recipient: 'Phyu Thwe', status: 'OUT_FOR_DELIVERY', cod: 180000 },
  { id: 'D0627-TZ-022', merchant: 'TZ-5 Fashion', recipient: 'Khaing Thazin', status: 'ARRIVED_AT_BRANCH', cod: 45000 },
  { id: 'D0627-ALN-005', merchant: 'Alnoor', recipient: 'Gon Gon', status: 'RETURNED_TO_BRANCH', cod: 0 },
  { id: 'D0627-KWY-011', merchant: 'Kyal Win Yan', recipient: 'Win Win May', status: 'DELIVERED', cod: 115000 },
];

export default function BranchOfficeProcessPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [parcels, setParcels] = useState(mockBranchParcels);

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 600);
  };

  const handleUpdateStatus = (id: string, newStatus: string) => {
    setParcels(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));
  };

  const filteredParcels = parcels.filter(p => 
    p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.merchant.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.recipient.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-[#1a3a5c] pb-4 flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="text-[#f6b84b] uppercase mb-1 text-[16px] tracking-widest">
            {t('BRANCH OFFICE PROCESSES', 'ရုံးခွဲ လုပ်ငန်းစဉ်များ')}
          </h1>
          <p className="text-[#4d7a9b] text-[13px]">
            {t(
              'Manage incoming HQ parcels, assign to branch riders, and handle local returns.',
              'ရုံးချုပ်မှရောက်ရှိလာသော ပါဆယ်များကို စီမံ၍ ပို့ဆောင်ရန် စီစဉ်ပါ။'
            )}
          </p>
        </div>
        <button onClick={handleRefresh} className="bg-[#1a3a5c] text-[#eef8ff] px-4 py-2 rounded-xl border border-[#1a3a5c] hover:border-[#f6b84b] flex items-center gap-2 text-[12px] uppercase tracking-wider transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('Refresh', 'ပြန်လည်စတင်မည်')}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-[#4ea8de] uppercase text-[11px] tracking-widest mb-1">{t('Arrived Today', 'ယနေ့ရောက်ရှိ')}</div>
            <div className="text-[24px] text-[#eef8ff] font-bold">142</div>
          </div>
          <Package size={32} className="text-[#1a3a5c]" />
        </div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-[#f6b84b] uppercase text-[11px] tracking-widest mb-1">{t('Out for Delivery', 'ပို့ဆောင်နေဆဲ')}</div>
            <div className="text-[24px] text-[#eef8ff] font-bold">89</div>
          </div>
          <Truck size={32} className="text-[#1a3a5c]" />
        </div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-emerald-400 uppercase text-[11px] tracking-widest mb-1">{t('Delivered', 'ပို့ဆောင်ပြီး')}</div>
            <div className="text-[24px] text-[#eef8ff] font-bold">45</div>
          </div>
          <CheckCircle2 size={32} className="text-[#1a3a5c]" />
        </div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-rose-400 uppercase text-[11px] tracking-widest mb-1">{t('Returns', 'ပြန်အမ်း')}</div>
            <div className="text-[24px] text-[#eef8ff] font-bold">8</div>
          </div>
          <ArrowLeftRight size={32} className="text-[#1a3a5c]" />
        </div>
      </div>

      {/* Toolbar & Search */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] p-4 rounded-2xl flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-[#4d7a9b]" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Waybill, Merchant, Recipient..." 
            className="w-full pl-10 pr-4 py-2.5 bg-[#061524] border border-[#1a3a5c] rounded-xl text-[#eef8ff] text-[13px] outline-none focus:border-[#f6b84b] transition-colors"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button className="flex-1 md:flex-none bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] px-4 py-2.5 rounded-xl text-[12px] uppercase tracking-wider flex items-center justify-center gap-2 hover:border-[#4ea8de]">
            <Filter size={14} /> {t('Filter', 'စစ်ထုတ်မည်')}
          </button>
          <button className="flex-1 md:flex-none bg-[#f6b84b] text-[#061524] px-4 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#e5a93a]">
            <ScanLine size={14} /> {t('Scan Arrival', 'စကင်ဖတ်မည်')}
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-[#061524] border-b border-[#1a3a5c]">
              <tr className="text-[#4ea8de] uppercase tracking-widest text-[11px]">
                <th className="p-4 font-semibold">Waybill No.</th>
                <th className="p-4 font-semibold">Merchant / Sender</th>
                <th className="p-4 font-semibold">Recipient</th>
                <th className="p-4 font-semibold">COD Amount</th>
                <th className="p-4 font-semibold">Current Status</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a3a5c]/50">
              {filteredParcels.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[#4d7a9b]">
                    No parcels found matching your search.
                  </td>
                </tr>
              ) : (
                filteredParcels.map((row) => (
                  <tr key={row.id} className="hover:bg-[#061524]/50 transition-colors">
                    <td className="p-4 font-bold text-[#f6b84b]">{row.id}</td>
                    <td className="p-4 text-[#eef8ff]">{row.merchant}</td>
                    <td className="p-4 text-[#eef8ff]">{row.recipient}</td>
                    <td className="p-4 text-emerald-400 font-mono">
                      {row.cod.toLocaleString()} Ks
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        row.status === 'ARRIVED_AT_BRANCH' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' :
                        row.status === 'OUT_FOR_DELIVERY' ? 'bg-[#f6b84b]/20 text-[#f6b84b] border border-[#f6b84b]/30' :
                        row.status === 'DELIVERED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}>
                        {row.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {row.status === 'ARRIVED_AT_BRANCH' && (
                        <button 
                          onClick={() => handleUpdateStatus(row.id, 'OUT_FOR_DELIVERY')}
                          className="bg-[#1a3a5c] text-[#eef8ff] px-3 py-1.5 rounded-lg text-[11px] hover:border-[#4ea8de] border border-transparent transition-colors"
                        >
                          Dispatch to Rider
                        </button>
                      )}
                      {row.status === 'OUT_FOR_DELIVERY' && (
                        <span className="text-[#4d7a9b] text-[11px]">With Rider</span>
                      )}
                      {row.status === 'DELIVERED' && (
                        <span className="text-emerald-400 text-[11px] flex items-center justify-end gap-1"><CheckCircle2 size={12}/> Completed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}