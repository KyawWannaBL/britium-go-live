import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Calculator, Database, Edit2, Save, X, Search, Plus, Loader2, Sparkles, Copy, Check } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

type TariffRow = {
  id: string;
  township: string;
  zone: string;
  customer_tier: 'STANDARD' | 'ROYAL';
  base_fee: number;
  included_kg: number;
  extra_kg_fee: number;
  highway_dropoff_fee: number;
  is_active: boolean;
};

export default function TariffMasterControlPage({ currentUser }: { currentUser: any }) {
  const [tariffs, setTariffs] = useState<TariffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Calculator State
  const [calcTownship, setCalcTownship] = useState('');
  const [calcTier, setCalcTier] = useState<'STANDARD' | 'ROYAL'>('STANDARD');
  const [calcWeight, setCalcWeight] = useState(1.5);
  const [calcHighway, setCalcHighway] = useState(false);

  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<TariffRow>>({});

  // Gemini AI State
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // RBAC Guard
  const isSuperAdmin = ['Super Admin', 'System Administrator', 'Finance Manager'].includes(currentUser?.role);

  const fetchTariffs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('be_tariff_master')
      .select('*')
      .order('zone', { ascending: true })
      .order('township', { ascending: true });

    if (!error && data) {
      setTariffs(data);
      if (data.length > 0 && !calcTownship) setCalcTownship(data[0].township);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTariffs(); }, []);
  useRealtimeSync('be_tariff_master', fetchTariffs);

  // --- Calculator Logic ---
  const uniqueTownships = useMemo(() => Array.from(new Set(tariffs.map(t => t.township))), [tariffs]);

  const selectedTariff = useMemo(() => {
    return tariffs.find(t => t.township === calcTownship && t.customer_tier === calcTier) 
        || tariffs.find(t => t.township === calcTownship) 
        || tariffs[0];
  }, [tariffs, calcTownship, calcTier]);

  const quote = useMemo(() => {
    if (!selectedTariff) return { chargeableWeight: 0, extraKg: 0, weightSurcharge: 0, highwayFee: 0, total: 0 };
    const chargeableWeight = Math.ceil(Math.max(0, calcWeight || 0));
    const extraKg = Math.max(0, chargeableWeight - selectedTariff.included_kg);
    const weightSurcharge = extraKg * selectedTariff.extra_kg_fee;
    const highwayFee = calcHighway ? selectedTariff.highway_dropoff_fee : 0;
    
    return {
      chargeableWeight,
      extraKg,
      weightSurcharge,
      highwayFee,
      total: selectedTariff.base_fee + weightSurcharge + highwayFee
    };
  }, [selectedTariff, calcWeight, calcHighway]);

  const filteredTariffs = useMemo(() => {
    const q = search.toLowerCase();
    return tariffs.filter(t => 
      t.township.toLowerCase().includes(q) || 
      t.zone.toLowerCase().includes(q) || 
      t.customer_tier.toLowerCase().includes(q)
    );
  }, [tariffs, search]);

  // --- CRUD Logic ---
  const handleEditClick = (row: TariffRow) => {
    setEditingId(row.id);
    setEditFormData(row);
  };

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from('be_tariff_master')
        .update({
          base_fee: Number(editFormData.base_fee),
          included_kg: Number(editFormData.included_kg),
          extra_kg_fee: Number(editFormData.extra_kg_fee),
          highway_dropoff_fee: Number(editFormData.highway_dropoff_fee),
          is_active: Boolean(editFormData.is_active)
        })
        .eq('id', editingId);

      if (error) throw error;
      toast({ title: "Tariff Updated", description: "Global pricing synchronized." });
      setEditingId(null);
      fetchTariffs();
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    }
  };

  // --- Gemini AI Actions ---
  const handleGenerateQuoteExplanation = async () => {
    if (!selectedTariff) return;
    setIsAiLoading(true); setAiMessage(null); setCopied(false);
    try {
      const { data, error } = await supabase.functions.invoke('tariff-ai-assistant', {
        body: { 
          action: 'explain_quote', 
          data: { township: selectedTariff.township, tier: selectedTariff.customer_tier, total: quote.total, base: selectedTariff.base_fee, extraWeightFee: quote.weightSurcharge, dropoffFee: quote.highwayFee } 
        }
      });
      if (error) throw error;
      setAiMessage(data.suggestion);
    } catch (e: any) {
      toast({ title: "AI Error", description: "Could not reach Gemini.", variant: "destructive" });
    } finally { setIsAiLoading(false); }
  };

  const handleAnalyzePricing = async () => {
    setIsAiLoading(true); setAiMessage(null); setCopied(false);
    try {
      // Send a lightweight version of the table to save tokens
      const subset = tariffs.map(t => ({ town: t.township, zone: t.zone, tier: t.customer_tier, base: t.base_fee }));
      const { data, error } = await supabase.functions.invoke('tariff-ai-assistant', {
        body: { action: 'analyze_pricing', data: subset }
      });
      if (error) throw error;
      setAiMessage(data.suggestion);
    } catch (e: any) {
      toast({ title: "AI Error", description: "Could not reach Gemini.", variant: "destructive" });
    } finally { setIsAiLoading(false); }
  };

  const copyToClipboard = () => {
    if (aiMessage) {
      navigator.clipboard.writeText(aiMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-start">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 ring-1 ring-blue-100 uppercase tracking-widest">
            <Database className="h-3.5 w-3.5" /> Live Master Data
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Tariff Control Center</h1>
          <p className="mt-2 text-sm text-gray-500 max-w-2xl">
            {isSuperAdmin 
              ? "Super Admin Access: You can modify active delivery tariffs globally. Changes affect the API immediately." 
              : "Read-Only Access: Use the calculator to quote customers based on live backend pricing rules."}
          </p>
        </div>
        {isSuperAdmin && (
          <button className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold flex items-center hover:bg-emerald-700 transition">
            <Plus className="w-4 h-4 mr-2"/> Add Tariff Rule
          </button>
        )}
      </div>

      {/* AI Assistant Output Box */}
      {aiMessage && (
        <div className="bg-gradient-to-r from-indigo-900 to-blue-900 text-blue-50 p-6 rounded-2xl shadow-md relative">
          <button onClick={() => setAiMessage(null)} className="absolute top-4 right-4 text-blue-300 hover:text-white"><X size={20}/></button>
          <div className="flex items-center gap-2 font-bold text-amber-400 mb-2"><Sparkles size={18}/> Gemini Insights</div>
          <div className="text-sm whitespace-pre-wrap leading-relaxed pr-8">{aiMessage}</div>
          <button onClick={copyToClipboard} className="mt-4 flex items-center gap-2 bg-blue-800 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition">
            {copied ? <Check size={14} className="text-emerald-400"/> : <Copy size={14}/>} {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
        </div>
      )}

      {/* Calculator Section */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-black flex items-center"><Calculator className="h-5 w-5 mr-2 text-blue-600" /> Quick Quote Calculator</h2>
          <button 
            onClick={handleGenerateQuoteExplanation} 
            disabled={isAiLoading || !selectedTariff}
            className="flex items-center gap-2 text-sm font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg border border-amber-200 transition"
          >
            {isAiLoading ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16}/>} Draft Customer Message
          </button>
        </div>
        
        <div className="grid gap-4 lg:grid-cols-5 items-end">
          <div>
            <label className="text-xs font-black uppercase text-gray-500 mb-1 block">Township</label>
            <select value={calcTownship} onChange={(e) => setCalcTownship(e.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:bg-white outline-none">
              {uniqueTownships.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-black uppercase text-gray-500 mb-1 block">Tier</label>
            <select value={calcTier} onChange={(e) => setCalcTier(e.target.value as 'STANDARD'|'ROYAL')} className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:bg-white outline-none">
              <option value="STANDARD">Standard</option>
              <option value="ROYAL">Royal</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-black uppercase text-gray-500 mb-1 block">Weight (KG)</label>
            <input type="number" min="0" step="0.1" value={calcWeight} onChange={(e) => setCalcWeight(Number(e.target.value))} className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:bg-white outline-none" />
          </div>
          <div className="flex items-center h-11 border border-gray-200 rounded-xl px-4 bg-gray-50 hover:bg-gray-100 transition">
            <label className="flex items-center gap-2 text-sm font-bold w-full cursor-pointer">
              <input type="checkbox" checked={calcHighway} onChange={(e) => setCalcHighway(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" /> Highway Drop-off
            </label>
          </div>
          <div className="rounded-xl bg-blue-900 p-3 text-white shadow-inner flex flex-col justify-center">
            <p className="text-[10px] font-black uppercase opacity-70">Total Quote</p>
            <p className="text-2xl font-black">{quote.total.toLocaleString()} MMK</p>
          </div>
        </div>

        {selectedTariff && (
          <div className="mt-4 flex flex-wrap gap-4 text-xs bg-blue-50/50 p-3 rounded-lg border border-blue-100 text-blue-800 font-medium">
            <span>Base: {selectedTariff.base_fee.toLocaleString()}</span> • 
            <span>Allowance: {selectedTariff.included_kg}kg</span> • 
            <span>Extra Kg: {quote.extraKg}kg × {selectedTariff.extra_kg_fee}</span> • 
            <span>Dropoff: {quote.highwayFee.toLocaleString()}</span>
          </div>
        )}
      </section>

      {/* Data Table Section */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-gray-800">Tariff Registry ({filteredTariffs.length})</h2>
            {isSuperAdmin && (
              <button 
                onClick={handleAnalyzePricing} 
                disabled={isAiLoading || tariffs.length === 0}
                className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded border border-indigo-200 transition"
              >
                {isAiLoading ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>} Analyze Pricing
              </button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search township..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-64 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white text-gray-500 uppercase tracking-wider font-bold text-[11px] border-b border-gray-200">
                <tr>
                  <th className="p-4">Township</th>
                  <th className="p-4">Zone</th>
                  <th className="p-4">Tier</th>
                  <th className="p-4 text-right">Base Fee</th>
                  <th className="p-4 text-center">Inc. KG</th>
                  <th className="p-4 text-right">Extra / KG</th>
                  <th className="p-4 text-right">Drop-off Fee</th>
                  <th className="p-4 text-center">Status</th>
                  {isSuperAdmin && <th className="p-4 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTariffs.map(row => {
                  const isEditing = editingId === row.id;
                  return (
                    <tr key={row.id} className={isEditing ? 'bg-blue-50' : 'hover:bg-gray-50 transition-colors'}>
                      <td className="p-4 font-bold text-gray-900">{row.township}</td>
                      <td className="p-4 text-gray-600 text-xs">{row.zone}</td>
                      <td className="p-4 font-semibold text-xs text-gray-700">{row.customer_tier}</td>
                      
                      {/* Editable Numeric Fields */}
                      {['base_fee', 'included_kg', 'extra_kg_fee', 'highway_dropoff_fee'].map(col => (
                        <td key={col} className={`p-4 ${col === 'included_kg' ? 'text-center' : 'text-right'} font-mono`}>
                          {isEditing ? (
                            <input 
                              type="number" 
                              value={(editFormData as any)[col]} 
                              onChange={e => setEditFormData({...editFormData, [col]: Number(e.target.value)})}
                              className="w-20 border border-blue-300 rounded px-2 py-1 text-right text-sm shadow-inner"
                            />
                          ) : (
                            <span className={col === 'included_kg' ? 'text-gray-500' : 'font-bold text-gray-800'}>
                              {(row as any)[col].toLocaleString()}
                            </span>
                          )}
                        </td>
                      ))}

                      <td className="p-4 text-center">
                        {isEditing ? (
                          <input type="checkbox" checked={editFormData.is_active} onChange={e => setEditFormData({...editFormData, is_active: e.target.checked})} className="w-4 h-4 text-blue-600 rounded"/>
                        ) : (
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-widest ${row.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {row.is_active ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        )}
                      </td>

                      {isSuperAdmin && (
                        <td className="p-4 text-center">
                          {isEditing ? (
                            <div className="flex justify-center gap-1.5">
                              <button onClick={handleSave} className="text-white bg-emerald-500 hover:bg-emerald-600 p-1.5 rounded shadow-sm"><Save size={14}/></button>
                              <button onClick={() => setEditingId(null)} className="text-gray-600 bg-gray-200 hover:bg-gray-300 p-1.5 rounded shadow-sm"><X size={14}/></button>
                            </div>
                          ) : (
                            <button onClick={() => handleEditClick(row)} className="text-blue-600 bg-blue-50 hover:bg-blue-100 p-1.5 rounded transition-colors">
                              <Edit2 size={14}/>
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}