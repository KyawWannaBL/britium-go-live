import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  UploadCloud,
  Plus,
  Send,
  Camera,
  Image as ImageIcon,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Maximize2,
  Minimize2,
  Save,
  FileSpreadsheet,
  Wand2,
  Loader2,
  Calendar,
  Filter,
  LayoutGrid,
  Focus,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

// --- MOCKS TO FIX IMPORT ERRORS IN SANDBOX ---
const useLanguage = () => ({ t: (en: string, mm?: string) => mm || en });
const supabase: any = {
  from: (table: string) => ({
    select: (cols: string) => ({
      order: (col: string, opts: any) => Promise.resolve({ data: [] }),
      eq: () => ({ order: () => Promise.resolve({ data: [] }) })
    }),
    upsert: () => Promise.resolve({ error: null })
  }),
  rpc: () => Promise.resolve({ data: {}, error: null }),
  channel: () => ({ on: () => ({ on: () => ({ subscribe: () => {} }) }) }),
  removeChannel: () => {},
  storage: { from: () => ({ createSignedUrl: () => Promise.resolve({}), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  auth: { getUser: () => Promise.resolve({ data: { user: { email: 'test@test.com' } } }) }
};
const XLSX: any = {
  utils: { json_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {}, sheet_to_json: () => [] },
  writeFile: () => {},
  read: () => ({ SheetNames: ['Sheet1'], Sheets: { 'Sheet1': {} } })
};
// ----------------------------------

const apiKey = ""; // Keep this empty; Canvas will provide it automatically

const FALLBACK_TOWNSHIPS = [
  "Ahlone", "Bahan", "Botataung", "Cocokyun", "Dagon", "Dagon Myothit East", "Dagon Myothit North",
  "Dagon Myothit Seikkan", "Dagon Myothit South", "Dala", "Dawbon", "East Dagon", "Hlaing",
  "Hlaing Thar Yar", "Insein", "Kamayut", "Kyauktada", "Kyimyindaing",
  "Lanmadaw", "Latha", "Mayangon", "Mingaladon", "Mingala Taung Nyunt", "North Dagon",
  "North Okkalapa", "Pabedan", "Pazundaung", "Sanchaung", "Seikkan", "Shwe Pyi Thar",
  "South Dagon", "South Okkalapa", "Tamwe", "Thaketa", "Thingangyun",
  "Yankin", "Mandalay", "Naypyidaw"
];

type TownshipOption = {
  township: string;
  township_mm?: string | null;
  city?: string | null;
  region_state?: string | null;
  zone?: string | null;
  branch_code?: string | null;
  label?: string | null;
  search_text?: string | null;
};

const MYANMAR_TOWNSHIP_OPTIONS: TownshipOption[] = [
  { township: "အလုံ", township_mm: "အလုံ", city: "Yangon", region_state: "Yangon Region", label: "Ahlone" },
  { township: "ဗဟန်း", township_mm: "ဗဟန်း", city: "Yangon", region_state: "Yangon Region", label: "Bahan" },
  { township: "မြောက်ဥက္ကလာပ", township_mm: "မြောက်ဥက္ကလာပ", city: "Yangon", region_state: "Yangon Region", label: "North Okkalapa" },
  { township: "တောင်ဥက္ကလာပ", township_mm: "တောင်ဥက္ကလာပ", city: "Yangon", region_state: "Yangon Region", label: "South Okkalapa" },
  { township: "စမ်းချောင်း", township_mm: "စမ်းချောင်း", city: "Yangon", region_state: "Yangon Region", label: "Sanchaung" },
];

function normalizeTownship(value?: string | null) {
  return String(value || "").trim().toLowerCase().replace(/[\u200b\u200c\u200d\s\-_()၊,.]+/g, "");
}

type PickupQueueRow = {
  pickup_id: string;
  merchant_code?: string | null;
  merchant_name?: string | null;
  pickup_date?: string | null;
  township?: string | null;
  city?: string | null;
  expected_parcels?: number | null;
  verified_parcels?: number | null;
};

type ParcelProofRow = {
  id?: string | number | null;
  pickup_id: string;
  parcel_sequence: number;
  delivery_way_id: string;
  parcel_weight_kg?: number | null;
  proof_photo_path?: string | null;
  photo_url?: string | null;
  status?: string | null;
};

type DataEntryRow = {
  id: number;
  status: string;
  date: string;
  way_id: string;
  merchant: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_phone_2: string;
  town: string;
  tier: string;
  address: string;
  item_price: number;
  weight: number;
  base_fee: number;
  surcharge: number;
  deli_fee: number;
  cod: number;
  actual_collect: number;
  destination: string;
  pickup_by: string;
  remarks: string;
  proof_photo_path?: string | null;
  photo_url?: string | null;
  saved?: boolean;
  isExtracting?: boolean; // Track AI loading state per row
};

const REGISTER_NOW_TEMPLATE_HEADERS = [
  'Recipient Name', 'Contact No. (1)', 'Contact No. (2)', 'Township',
  'Recipient Address', 'Customer Tier', 'Item Price', 'Weight KG', 'Remark / Special Instruction',
];

export default function DataEntryPage() {
  const { t } = useLanguage();

  const [isFullScreen, setIsFullScreen] = useState(false);
  const [viewMode, setViewMode] = useState<'GRID' | 'FOCUS'>('GRID');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [aiErrorMessage, setAiErrorMessage] = useState('');
  
  // Mocking the pickup selection for UI demonstration based on screenshot
  const [pickupQueue, setPickupQueue] = useState<PickupQueueRow[]>([
    { pickup_id: 'P0624-BBG-010', merchant_code: 'BBG', merchant_name: 'Baby Genius', expected_parcels: 10, verified_parcels: 10 }
  ]);
  const [selectedPickupId, setSelectedPickupId] = useState('P0624-BBG-010');
  
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  // Mocking proofs based on screenshot (horizontal strip)
  const [parcelProofs, setParcelProofs] = useState<ParcelProofRow[]>(Array.from({length: 10}, (_, i) => ({
    pickup_id: 'P0624-BBG-010',
    parcel_sequence: i + 1,
    delivery_way_id: `Delivery Way Parcel: ${i + 1}`,
    proof_photo_path: 'mock',
    photo_url: `https://picsum.photos/seed/${i+100}/800/600`, // Mock images
    status: 'VERIFIED'
  })));

  const [rows, setRows] = useState<DataEntryRow[]>(Array.from({length: 10}, (_, i) => ({
      id: i + 1, status: 'PENDING', date: '2026-06-24', way_id: `WAY-${i+1}`, merchant: 'Baby Genius',
      recipient_name: '', recipient_phone: '', recipient_phone_2: '', town: '',
      tier: 'STANDARD', address: '', item_price: 0, weight: 1, base_fee: 0, surcharge: 0, deli_fee: 0, cod: 0, actual_collect: 0,
      destination: 'Yangon', pickup_by: 'DATA_ENTRY', remarks: '', saved: false, isExtracting: false
  })));

  const [townshipOptions, setTownshipOptions] = useState<TownshipOption[]>([
      ...MYANMAR_TOWNSHIP_OPTIONS,
      ...FALLBACK_TOWNSHIPS.map((township) => ({ township, city: "Yangon", region_state: "Yangon Region" })),
  ]);
  
  const [activeTownshipRow, setActiveTownshipRow] = useState<number | null>(null);

  const selectedPickup = pickupQueue.find((p) => p.pickup_id === selectedPickupId) || null;

  // --- UI TOGGLES & ACTIONS ---
  const toggleFullScreen = () => setIsFullScreen(!isFullScreen);

  const handleUpdate = (index: number, field: string, value: any) => {
    setRows((currentRows) => {
      const nextRows = [...currentRows];
      nextRows[index] = { ...nextRows[index], [field]: value, saved: false };
      return nextRows;
    });
  };

  const handleSaveAndNext = () => {
    // Logic to mark as saved would go here.
    // For now, just advance the index to the next parcel.
    if (focusedIndex < rows.length - 1) {
      setFocusedIndex(focusedIndex + 1);
    }
  };

  const downloadTemplate = () => {
    const sampleRows = Array.from({ length: 10 }, () => ({
      'Recipient Name': '', 'Contact No. (1)': '', 'Contact No. (2)': '', Township: '',
      'Recipient Address': '', 'Customer Tier': 'STANDARD', 'Item Price': '0', 'Weight KG': '1', 'Remark / Special Instruction': '',
    }));
    const worksheet = XLSX.utils.json_to_sheet(sampleRows, { header: REGISTER_NOW_TEMPLATE_HEADERS, skipHeader: false });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    XLSX.writeFile(workbook, 'Britium_DataEntry_Template.xlsx');
  };

  // Township Autocomplete Logic
  const getTownshipSuggestions = (input: string) => {
    const key = normalizeTownship(input);
    if (!key) return townshipOptions.slice(0, 5);
    return townshipOptions.filter(opt => 
      normalizeTownship(opt.township).includes(key) || 
      (opt.township_mm && normalizeTownship(opt.township_mm).includes(key))
    ).slice(0, 5);
  };

  // --- AI INTEGRATION ---
  const handleAutoFill = async (proofIndex: number, imageUrl: string) => {
    setAiErrorMessage('');
    if (!imageUrl || imageUrl.includes('picsum')) {
        // Fallback for demo mock images since they aren't real waybills
        setRows(currentRows => {
            const nextRows = [...currentRows];
            if (nextRows[proofIndex]) {
                nextRows[proofIndex].isExtracting = true;
            }
            return nextRows;
        });

        setTimeout(() => {
            setRows(currentRows => {
                const nextRows = [...currentRows];
                if (nextRows[proofIndex]) {
                    nextRows[proofIndex] = {
                        ...nextRows[proofIndex],
                        recipient_name: "Mock Customer " + (proofIndex + 1),
                        recipient_phone: "0912345678" + proofIndex,
                        address: "No. 123, Bogyoke Road, Yangon",
                        isExtracting: false
                    };
                }
                return nextRows;
            });
        }, 1500);
        return;
    }

    // Actual AI Logic
    setRows(currentRows => {
      const nextRows = [...currentRows];
      if (nextRows[proofIndex]) {
          nextRows[proofIndex].isExtracting = true;
      }
      return nextRows;
    });

    try {
        const imageResponse = await fetch(imageUrl);
        const blob = await imageResponse.blob();
        
        const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                const base64 = base64String.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        const prompt = `You are a data entry assistant for a logistics company in Myanmar.
        Please extract the following information from the provided waybill/parcel image:
        1. Recipient Name
        2. Recipient Phone Number 1
        3. Recipient Phone Number 2 (if present)
        4. Full Delivery Address

        Return ONLY a JSON object with the following keys. If a value is not found, return an empty string.
        {
          "recipientName": "...",
          "phone1": "...",
          "phone2": "...",
          "address": "..."
        }`;

        const payload = {
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: blob.type || "image/jpeg",
                                data: base64Data
                            }
                        }
                    ]
                }
            ],
            generationConfig: { responseMimeType: "application/json" }
        };

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        
        if (result.candidates && result.candidates.length > 0) {
            const jsonText = result.candidates[0].content.parts[0].text;
            const extractedData = JSON.parse(jsonText);

            setRows(currentRows => {
                const nextRows = [...currentRows];
                if (nextRows[proofIndex]) {
                    nextRows[proofIndex] = {
                        ...nextRows[proofIndex],
                        recipient_name: extractedData.recipientName || nextRows[proofIndex].recipient_name,
                        recipient_phone: extractedData.phone1 || nextRows[proofIndex].recipient_phone,
                        recipient_phone_2: extractedData.phone2 || nextRows[proofIndex].recipient_phone_2,
                        address: extractedData.address || nextRows[proofIndex].address,
                        isExtracting: false
                    };
                }
                return nextRows;
            });
        } else {
             throw new Error("No data extracted.");
        }
    } catch (error) {
        console.error("AI Extraction failed:", error);
        setAiErrorMessage("Failed to extract data using AI. Please try again or enter manually.");
        setRows(currentRows => {
            const nextRows = [...currentRows];
            if (nextRows[proofIndex]) {
                nextRows[proofIndex].isExtracting = false;
            }
            return nextRows;
        });
    }
  };

  const currentRow = rows[focusedIndex];
  const currentProof = parcelProofs[focusedIndex];

  return (
    <div className={`font-['Poppins',sans-serif] ${isFullScreen ? 'fixed inset-0 z-50 bg-[#061524] overflow-y-auto' : 'bg-[#061524] min-h-screen'}`}>
      
      {/* 1. TOP CONTROL BAR */}
      <div className="bg-[#0b2236] border-b border-[#1a3a5c] p-4 sticky top-0 z-40">
        <div className="max-w-[1920px] mx-auto flex flex-wrap gap-4 items-center justify-between">
            
            {/* Left Side: Title & Pickup Info */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                    <h1 className="text-white font-bold text-lg tracking-wide">Production Data Entry v29</h1>
                    <select 
                      className="bg-[#061524] text-white border border-[#1a3a5c] rounded px-3 py-1 text-sm outline-none"
                      value={selectedPickupId}
                      onChange={(e) => setSelectedPickupId(e.target.value)}
                    >
                        {pickupQueue.map(p => <option key={p.pickup_id} value={p.pickup_id}>Pickup: {p.pickup_id}</option>)}
                    </select>
                    <span className="text-[#8ab0c9] text-sm">Lines: {rows.length}</span>
                </div>
                <div className="text-[#8ab0c9] text-sm">Proof records: {parcelProofs.length}</div>
            </div>

            {/* Right Side: Action Buttons */}
            <div className="flex flex-wrap gap-2 items-center">
                
                {/* View Toggle */}
                <div className="flex bg-[#061524] border border-[#1a3a5c] rounded p-1 mr-2">
                  <button 
                    onClick={() => setViewMode('GRID')} 
                    className={`px-3 py-1.5 rounded flex items-center gap-2 text-sm transition-all ${viewMode === 'GRID' ? 'bg-[#f6b84b] text-[#061524] font-bold' : 'text-[#8ab0c9] hover:text-white'}`}
                  >
                    <LayoutGrid size={14} /> Grid
                  </button>
                  <button 
                    onClick={() => setViewMode('FOCUS')} 
                    className={`px-3 py-1.5 rounded flex items-center gap-2 text-sm transition-all ${viewMode === 'FOCUS' ? 'bg-[#f6b84b] text-[#061524] font-bold' : 'text-[#8ab0c9] hover:text-white'}`}
                  >
                    <Focus size={14} /> Focus
                  </button>
                </div>

                <button className="bg-[#061524] text-white border border-[#1a3a5c] hover:border-[#4ea8de] px-4 py-2 rounded flex items-center gap-2 text-sm transition-colors">
                    <RefreshCw size={14} /> Refresh Rider Proofs
                </button>
                <button onClick={() => uploadInputRef.current?.click()} className="bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#061524] font-bold px-4 py-2 rounded flex items-center gap-2 text-sm transition-colors">
                    <UploadCloud size={14} /> Bulk Upload Excel / CSV
                </button>
                <input ref={uploadInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" />
                <button className="bg-[#061524] text-white border border-[#1a3a5c] hover:border-gray-400 px-4 py-2 rounded flex items-center gap-2 text-sm transition-colors">
                    <FileSpreadsheet size={14} /> Export CSV
                </button>
                <button className="bg-[#22c55e] hover:bg-[#16a34a] text-white font-bold px-4 py-2 rounded flex items-center gap-2 text-sm transition-colors">
                    <Save size={14} /> Save Registration Draft
                </button>
                <button className="bg-[#f6b84b] hover:bg-[#e5a93a] text-[#061524] font-bold px-4 py-2 rounded flex items-center gap-2 text-sm transition-colors">
                    <Send size={14} /> Save Data & Generate Waybill
                </button>
                <button onClick={toggleFullScreen} className="bg-[#f6b84b] hover:bg-[#e5a93a] text-[#061524] font-bold px-4 py-2 rounded flex items-center gap-2 text-sm transition-colors">
                    {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />} 
                    {isFullScreen ? 'Exit Full Screen' : 'Full Screen Data Entry'}
                </button>
            </div>
        </div>
      </div>

      <div className="max-w-[1920px] mx-auto p-4 space-y-4">
        
        {/* REPORT GENERATION BAR */}
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-xl p-4 flex flex-wrap gap-6 items-end shadow-sm">
            <div>
                <label className="text-[#8ab0c9] text-xs flex items-center gap-1 mb-1.5"><Filter size={12}/> မှ (ရက်စွဲ)</label>
                <div className="relative">
                  <input type="date" className="bg-[#061524] text-white border border-[#1a3a5c] pl-3 pr-10 py-2.5 rounded-lg outline-none focus:border-[#f6b84b] text-sm w-44 transition-colors" />
                </div>
            </div>
            <div>
                <label className="text-[#8ab0c9] text-xs flex items-center gap-1 mb-1.5"><Filter size={12}/> ထိ (ရက်စွဲ)</label>
                <div className="relative">
                  <input type="date" className="bg-[#061524] text-white border border-[#1a3a5c] pl-3 pr-10 py-2.5 rounded-lg outline-none focus:border-[#f6b84b] text-sm w-44 transition-colors" />
                </div>
            </div>
            <div className="flex-1 flex justify-end gap-3 border-l border-[#1a3a5c] pl-6 ml-2">
                <button className="bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] hover:border-[#f6b84b] px-5 py-2.5 rounded-lg flex items-center gap-2 text-sm transition-colors shadow-sm">
                    <Download size={16} className="text-[#f6b84b]" /> အစီရင်ခံစာ
                </button>
                <button onClick={downloadTemplate} className="bg-[#061524] text-[#4ea8de] border border-[#4ea8de] hover:bg-[#4ea8de] hover:text-[#061524] px-5 py-2.5 rounded-lg flex items-center gap-2 text-sm font-bold transition-all shadow-sm">
                    <Download size={16} /> Register Template
                </button>
            </div>
        </div>

        {/* AI Error Message */}
        {aiErrorMessage && (
            <div className="bg-rose-500/20 border border-rose-500/50 text-rose-400 p-3 rounded-lg flex items-center gap-2 text-sm">
                <AlertTriangle size={16} /> {aiErrorMessage}
            </div>
        )}

        {/* ========================================= */}
        {/* VIEW MODE 1: SINGLE-RECORD FOCUS MODE     */}
        {/* ========================================= */}
        {viewMode === 'FOCUS' && currentRow && (
          <div className="flex flex-col xl:flex-row gap-6">
            
            {/* Left: Large Image Preview */}
            <div className="w-full xl:w-[45%] bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-4 flex flex-col gap-4 shadow-lg">
               <div className="flex justify-between items-center bg-[#061524] p-3 rounded-xl border border-[#1a3a5c]">
                  <div>
                    <h3 className="text-[#f6b84b] font-bold text-sm">Parcel Proof {focusedIndex + 1} of {rows.length}</h3>
                    <div className="text-[#8ab0c9] text-xs mt-0.5">{currentProof?.delivery_way_id}</div>
                  </div>
                  <button 
                    onClick={() => handleAutoFill(focusedIndex, currentProof?.photo_url || '')}
                    disabled={currentRow.isExtracting}
                    className="bg-[#f6b84b] hover:bg-[#e5a93a] text-[#061524] font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {currentRow.isExtracting ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    {currentRow.isExtracting ? 'Extracting...' : 'AI Magic Fill'}
                  </button>
               </div>
               
               <div className="flex-1 bg-[#061524] border border-[#1a3a5c] rounded-xl overflow-hidden relative min-h-[400px] xl:min-h-[600px] flex items-center justify-center">
                  {currentProof?.photo_url ? (
                    <img src={currentProof.photo_url} alt="Waybill Proof" className="object-contain w-full h-full max-h-[700px] hover:scale-150 transition-transform duration-300 origin-top-left cursor-zoom-in" />
                  ) : (
                    <div className="text-[#4d7a9b] flex flex-col items-center">
                      <ImageIcon size={48} className="mb-2 opacity-50" />
                      No Image Available
                    </div>
                  )}
               </div>
            </div>

            {/* Right: Registration Form Template */}
            <div className="w-full xl:w-[55%] bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-6 flex flex-col shadow-lg">
               <h3 className="text-white font-bold text-lg mb-6 border-b border-[#1a3a5c] pb-4 flex items-center gap-2">
                 <LayoutGrid size={18} className="text-[#4ea8de]" /> Registration Template
               </h3>
               
               <div className="space-y-5 flex-1">
                 {/* Row 1 */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                   <div>
                     <label className="block text-[#8ab0c9] text-xs font-bold uppercase tracking-wider mb-1.5">Recipient Name</label>
                     <div className="relative">
                       <input value={currentRow.recipient_name} onChange={(e) => handleUpdate(focusedIndex, 'recipient_name', e.target.value)} className="w-full bg-[#061524] text-white border border-[#1a3a5c] px-4 py-3 rounded-xl outline-none focus:border-[#f6b84b] transition-colors" placeholder="Enter name" />
                       {currentRow.isExtracting && <Loader2 size={16} className="absolute right-3 top-3.5 text-[#4ea8de] animate-spin" />}
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                       <label className="block text-[#8ab0c9] text-xs font-bold uppercase tracking-wider mb-1.5">Contact (1)</label>
                       <div className="relative">
                         <input value={currentRow.recipient_phone} onChange={(e) => handleUpdate(focusedIndex, 'recipient_phone', e.target.value)} className="w-full bg-[#061524] text-white border border-[#1a3a5c] px-4 py-3 rounded-xl outline-none focus:border-[#f6b84b] transition-colors" placeholder="09xxxxxxxxx" />
                         {currentRow.isExtracting && <Loader2 size={16} className="absolute right-3 top-3.5 text-[#4ea8de] animate-spin" />}
                       </div>
                     </div>
                     <div>
                       <label className="block text-[#8ab0c9] text-xs font-bold uppercase tracking-wider mb-1.5">Contact (2)</label>
                       <input value={currentRow.recipient_phone_2} onChange={(e) => handleUpdate(focusedIndex, 'recipient_phone_2', e.target.value)} className="w-full bg-[#061524] text-white border border-[#1a3a5c] px-4 py-3 rounded-xl outline-none focus:border-[#f6b84b] transition-colors" placeholder="Optional" />
                     </div>
                   </div>
                 </div>

                 {/* Row 2 */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                   <div className="relative">
                      <label className="block text-[#8ab0c9] text-xs font-bold uppercase tracking-wider mb-1.5">Township (EN/MM)</label>
                      <input 
                          value={currentRow.town} 
                          onFocus={() => setActiveTownshipRow(focusedIndex)} 
                          onChange={(e) => handleUpdate(focusedIndex, 'town', e.target.value)} 
                          onBlur={() => setTimeout(() => setActiveTownshipRow(null), 200)}
                          placeholder="Type EN/MM towns"
                          className="w-full bg-[#061524] text-white border border-[#1a3a5c] px-4 py-3 rounded-xl outline-none focus:border-[#f6b84b] transition-colors" 
                      />
                      {activeTownshipRow === focusedIndex && (
                          <div className="absolute left-0 right-0 top-[65px] z-30 max-h-48 overflow-y-auto rounded-xl border border-[#4ea8de] bg-[#0b2236] shadow-2xl custom-scrollbar">
                              {getTownshipSuggestions(currentRow.town).map((opt, idx) => (
                                  <button 
                                      key={idx} type="button" 
                                      onClick={() => handleUpdate(focusedIndex, 'town', opt.township)} 
                                      className="w-full px-4 py-2.5 text-left hover:bg-[#1a3a5c] border-b border-[#1a3a5c]/40 text-white text-sm"
                                  >
                                      {opt.township} {opt.township_mm && opt.township_mm !== opt.township ? `· ${opt.township_mm}` : ''}
                                  </button>
                              ))}
                          </div>
                      )}
                   </div>
                   <div>
                      <label className="block text-[#8ab0c9] text-xs font-bold uppercase tracking-wider mb-1.5">Customer Tier</label>
                      <select value={currentRow.tier} onChange={(e) => handleUpdate(focusedIndex, 'tier', e.target.value)} className="w-full bg-[#061524] text-white border border-[#1a3a5c] px-4 py-3 rounded-xl outline-none focus:border-[#f6b84b] transition-colors">
                          <option value="STANDARD">STANDARD</option>
                          <option value="ROYAL">ROYAL</option>
                          <option value="COMMITMENT_1">COMMITMENT 1 (500Ks payback, 5kg max, &gt;1.5K/mo)</option>
                          <option value="COMMITMENT_2">COMMITMENT 2 (700Ks payback, 6kg max, &gt;3K/mo)</option>
                      </select>
                   </div>
                 </div>

                 {/* Row 3 */}
                 <div>
                    <label className="block text-[#8ab0c9] text-xs font-bold uppercase tracking-wider mb-1.5">Recipient Address</label>
                    <div className="relative">
                      <textarea rows={3} value={currentRow.address} onChange={(e) => handleUpdate(focusedIndex, 'address', e.target.value)} className="w-full bg-[#061524] text-white border border-[#1a3a5c] px-4 py-3 rounded-xl outline-none focus:border-[#f6b84b] resize-y custom-scrollbar transition-colors" placeholder="Full delivery address" />
                      {currentRow.isExtracting && <Loader2 size={16} className="absolute right-3 top-3 text-[#4ea8de] animate-spin" />}
                    </div>
                 </div>

                 {/* Row 4: Pricing */}
                 <div className="grid grid-cols-3 gap-4 bg-[#061524] p-4 rounded-xl border border-[#1a3a5c]">
                   <div>
                     <label className="block text-[#8ab0c9] text-[10px] font-bold uppercase tracking-wider mb-1">Item Price</label>
                     <input type="number" value={currentRow.item_price || ''} onChange={(e) => handleUpdate(focusedIndex, 'item_price', Number(e.target.value))} className="w-full bg-transparent text-white border-b border-[#1a3a5c] pb-1 outline-none focus:border-[#f6b84b]" />
                   </div>
                   <div>
                     <label className="block text-[#8ab0c9] text-[10px] font-bold uppercase tracking-wider mb-1">Weight KG</label>
                     <input type="number" value={currentRow.weight} onChange={(e) => handleUpdate(focusedIndex, 'weight', Number(e.target.value))} className="w-full bg-transparent text-white border-b border-[#1a3a5c] pb-1 outline-none focus:border-[#f6b84b]" />
                   </div>
                   <div>
                     <label className="block text-[#8ab0c9] text-[10px] font-bold uppercase tracking-wider mb-1">Surcharge</label>
                     <input type="number" value={currentRow.surcharge || ''} onChange={(e) => handleUpdate(focusedIndex, 'surcharge', Number(e.target.value))} className="w-full bg-transparent text-white border-b border-[#1a3a5c] pb-1 outline-none focus:border-[#f6b84b]" />
                   </div>
                 </div>

                 {/* Row 5: Calculations */}
                 <div className="grid grid-cols-3 gap-4">
                   <div className="bg-[#1a3a5c]/30 p-3 rounded-xl border border-[#1a3a5c]/50">
                     <label className="block text-[#4ea8de] text-[10px] font-bold uppercase tracking-wider mb-1">Total Deli Fee</label>
                     <div className="text-white font-bold text-lg">{currentRow.deli_fee || 0} Ks</div>
                   </div>
                   <div className="bg-[#1a3a5c]/30 p-3 rounded-xl border border-[#1a3a5c]/50">
                     <label className="block text-[#4ea8de] text-[10px] font-bold uppercase tracking-wider mb-1">COD</label>
                     <div className="text-white font-bold text-lg">{currentRow.cod || 0} Ks</div>
                   </div>
                   <div className="bg-[#f6b84b]/10 p-3 rounded-xl border border-[#f6b84b]/30">
                     <label className="block text-[#f6b84b] text-[10px] font-bold uppercase tracking-wider mb-1">Actual Collect</label>
                     <div className="text-[#f6b84b] font-bold text-lg">{currentRow.actual_collect || 0} Ks</div>
                   </div>
                 </div>

                 {/* Row 6 */}
                 <div>
                    <label className="block text-[#8ab0c9] text-xs font-bold uppercase tracking-wider mb-1.5">Remarks / Special Instructions</label>
                    <input type="text" value={currentRow.remarks} onChange={(e) => handleUpdate(focusedIndex, 'remarks', e.target.value)} className="w-full bg-[#061524] text-white border border-[#1a3a5c] px-4 py-3 rounded-xl outline-none focus:border-[#f6b84b] transition-colors" placeholder="Optional notes" />
                 </div>
               </div>

               {/* Focus Mode Navigation Actions */}
               <div className="mt-8 pt-6 border-t border-[#1a3a5c] flex justify-between items-center">
                  <button 
                    onClick={() => setFocusedIndex(Math.max(0, focusedIndex - 1))} 
                    disabled={focusedIndex === 0}
                    className="text-[#8ab0c9] hover:text-white flex items-center gap-2 px-4 py-2 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={18} /> Previous
                  </button>
                  <div className="text-[#4d7a9b] text-sm font-mono">{focusedIndex + 1} / {rows.length}</div>
                  <button 
                    onClick={handleSaveAndNext}
                    className="bg-[#22c55e] hover:bg-[#16a34a] text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-green-900/20 transition-all transform hover:scale-105"
                  >
                    Save & Next Parcel <ChevronRight size={18} />
                  </button>
               </div>
            </div>
          </div>
        )}

        {/* ========================================= */}
        {/* VIEW MODE 2: GRID VIEW (Classic Table)    */}
        {/* ========================================= */}
        {viewMode === 'GRID' && (
          <>
            {/* HORIZONTAL RIDER PROOF STRIP */}
            <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-xl p-3 overflow-x-auto custom-scrollbar flex gap-3">
                {parcelProofs.length === 0 ? (
                     <div className="w-[180px] h-[120px] bg-[#061524] border border-[#1a3a5c] rounded-lg flex flex-col items-center justify-center text-[#4d7a9b] text-xs p-4 text-center shrink-0">
                        <ImageIcon size={24} className="mb-2" />
                        Rider proof pending
                     </div>
                ) : (
                    parcelProofs.map((proof, idx) => (
                        <div key={idx} className="w-[180px] bg-[#061524] border border-[#1a3a5c] rounded-lg overflow-hidden shrink-0 flex flex-col transition-colors group">
                            <div className="h-[100px] bg-black relative overflow-hidden cursor-pointer group-hover:border-[#4ea8de] border-b-0 border-transparent transition-colors">
                                <img src={proof.photo_url || ''} alt="Proof" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                
                                {/* Auto-Fill Button Overlay */}
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleAutoFill(idx, proof.photo_url || ''); }}
                                      disabled={rows[idx]?.isExtracting}
                                      className="bg-[#f6b84b] hover:bg-[#e5a93a] text-[#061524] font-bold px-3 py-1.5 rounded text-xs flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {rows[idx]?.isExtracting ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                                      {rows[idx]?.isExtracting ? 'Extracting...' : 'Auto-Fill'}
                                    </button>
                                </div>
                            </div>
                            <div className="p-2 text-[10px] leading-tight bg-[#0b2236] border-t border-[#1a3a5c] group-hover:border-[#4ea8de] transition-colors">
                                <div className="text-white truncate">{proof.delivery_way_id}</div>
                                <div className="text-[#22c55e] font-bold mt-1 tracking-wide">{proof.status}</div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* MAIN DATA ENTRY TABLE */}
            <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-xl overflow-hidden pb-10 shadow-sm">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-max min-w-full text-left whitespace-nowrap text-xs border-collapse">
                        <thead className="bg-[#f6b84b] sticky top-0 z-20">
                            <tr className="text-[#061524] uppercase tracking-widest text-[10px] font-bold">
                                <th className="p-2 min-w-[150px]">Recipient Name</th>
                                <th className="p-2 min-w-[120px]">Contact No. (1)</th>
                                <th className="p-2 min-w-[120px]">Contact No. (2)</th>
                                <th className="p-2 min-w-[200px]">Township (EN/MM)</th>
                                <th className="p-2 min-w-[250px]">Recipient Address</th>
                                <th className="p-2 min-w-[120px]">Customer Tier</th>
                                <th className="p-2 min-w-[100px]">Item Price</th>
                                <th className="p-2 min-w-[80px]">Weight KG</th>
                                <th className="p-2 min-w-[100px]">Surcharge</th>
                                <th className="p-2 min-w-[120px]">Total Deli Fee</th>
                                <th className="p-2 min-w-[100px]">COD</th>
                                <th className="p-2 min-w-[100px]">Actual Collect</th>
                                <th className="p-2 min-w-[200px]">Remark / Special Instruction</th>
                            </tr>
                        </thead>
                        <tbody className="bg-[#061524]">
                            {rows.map((row, i) => (
                                <tr key={i} className="border-b border-[#1a3a5c]/50 hover:bg-[#0b2236] transition-colors align-top">
                                    <td className="p-1.5">
                                      <div className="relative">
                                        <input value={row.recipient_name} onChange={(e) => handleUpdate(i, 'recipient_name', e.target.value)} className="w-full bg-[#061524] text-white border border-[#1a3a5c] p-2 rounded outline-none focus:border-[#f6b84b]" />
                                        {row.isExtracting && <div className="absolute inset-y-0 right-2 flex items-center"><Loader2 size={14} className="text-[#4ea8de] animate-spin" /></div>}
                                      </div>
                                    </td>
                                    <td className="p-1.5">
                                      <div className="relative">
                                        <input value={row.recipient_phone} onChange={(e) => handleUpdate(i, 'recipient_phone', e.target.value)} className="w-full bg-[#061524] text-white border border-[#1a3a5c] p-2 rounded outline-none focus:border-[#f6b84b]" />
                                         {row.isExtracting && <div className="absolute inset-y-0 right-2 flex items-center"><Loader2 size={14} className="text-[#4ea8de] animate-spin" /></div>}
                                      </div>
                                    </td>
                                    <td className="p-1.5">
                                      <div className="relative">
                                         <input value={row.recipient_phone_2} onChange={(e) => handleUpdate(i, 'recipient_phone_2', e.target.value)} className="w-full bg-[#061524] text-white border border-[#1a3a5c] p-2 rounded outline-none focus:border-[#f6b84b]" />
                                         {row.isExtracting && <div className="absolute inset-y-0 right-2 flex items-center"><Loader2 size={14} className="text-[#4ea8de] animate-spin" /></div>}
                                      </div>
                                    </td>
                                    
                                    <td className="p-1.5 relative">
                                        <input 
                                            value={row.town} 
                                            onFocus={() => setActiveTownshipRow(i)} 
                                            onChange={(e) => handleUpdate(i, 'town', e.target.value)} 
                                            onBlur={() => setTimeout(() => setActiveTownshipRow(null), 200)}
                                            placeholder="Type EN/MM towns"
                                            className="w-full bg-[#061524] text-white border border-[#1a3a5c] p-2 rounded outline-none focus:border-[#f6b84b]" 
                                        />
                                        <div className="text-[10px] text-[#4ea8de] mt-1 px-1">English/Myanmar supported</div>
                                        
                                        {/* Autocomplete Dropdown */}
                                        {activeTownshipRow === i && (
                                            <div className="absolute left-1.5 right-1.5 top-[38px] z-30 max-h-48 overflow-y-auto rounded-lg border border-[#4ea8de] bg-[#0b2236] shadow-2xl custom-scrollbar">
                                                {getTownshipSuggestions(row.town).map((opt, idx) => (
                                                    <button 
                                                        key={idx} 
                                                        type="button" 
                                                        onClick={() => handleUpdate(i, 'town', opt.township)} 
                                                        className="w-full px-3 py-2 text-left hover:bg-[#1a3a5c] border-b border-[#1a3a5c]/40 text-white text-xs"
                                                    >
                                                        {opt.township} {opt.township_mm && opt.township_mm !== opt.township ? `· ${opt.township_mm}` : ''}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </td>

                                    <td className="p-1.5">
                                      <div className="relative h-full">
                                        <textarea rows={2} value={row.address} onChange={(e) => handleUpdate(i, 'address', e.target.value)} className="w-full h-full min-h-[40px] bg-[#061524] text-white border border-[#1a3a5c] p-2 rounded outline-none focus:border-[#f6b84b] resize-y custom-scrollbar" />
                                        {row.isExtracting && <div className="absolute top-2 right-2"><Loader2 size={14} className="text-[#4ea8de] animate-spin" /></div>}
                                      </div>
                                    </td>
                                    
                                    <td className="p-1.5">
                                        <select value={row.tier} onChange={(e) => handleUpdate(i, 'tier', e.target.value)} className="w-full bg-[#061524] text-white border border-[#1a3a5c] p-2 rounded outline-none focus:border-[#f6b84b]">
                                            <option value="STANDARD">STANDARD</option>
                                            <option value="ROYAL">ROYAL</option>
                                            <option value="COMMITMENT_1">COMMITMENT 1 (500Ks payback, 5kg max, &gt;1.5K/mo)</option>
                                            <option value="COMMITMENT_2">COMMITMENT 2 (700Ks payback, 6kg max, &gt;3K/mo)</option>
                                        </select>
                                    </td>

                                    <td className="p-1.5"><input type="number" value={row.item_price || ''} onChange={(e) => handleUpdate(i, 'item_price', Number(e.target.value))} className="w-full bg-[#061524] text-white border border-[#1a3a5c] p-2 rounded outline-none focus:border-[#f6b84b]" /></td>
                                    <td className="p-1.5"><input type="number" value={row.weight} onChange={(e) => handleUpdate(i, 'weight', Number(e.target.value))} className="w-full bg-[#061524] text-white border border-[#1a3a5c] p-2 rounded outline-none focus:border-[#f6b84b]" /></td>
                                    <td className="p-1.5"><input type="number" value={row.surcharge || ''} onChange={(e) => handleUpdate(i, 'surcharge', Number(e.target.value))} className="w-full bg-[#061524] text-white border border-[#1a3a5c] p-2 rounded outline-none focus:border-[#f6b84b]" /></td>
                                    <td className="p-1.5"><input type="number" value={row.deli_fee || ''} readOnly className="w-full bg-[#061524] text-[#f6b84b] border border-[#1a3a5c] p-2 rounded outline-none font-bold" /></td>
                                    <td className="p-1.5"><input type="number" value={row.cod || ''} readOnly className="w-full bg-[#061524] text-white border border-[#1a3a5c] p-2 rounded outline-none" /></td>
                                    <td className="p-1.5"><input type="number" value={row.actual_collect || ''} readOnly className="w-full bg-[#061524] text-[#f6b84b] border border-[#1a3a5c] p-2 rounded outline-none font-bold" /></td>
                                    <td className="p-1.5"><textarea rows={2} value={row.remarks} onChange={(e) => handleUpdate(i, 'remarks', e.target.value)} className="w-full min-h-[40px] bg-[#061524] text-white border border-[#1a3a5c] p-2 rounded outline-none focus:border-[#f6b84b] resize-y custom-scrollbar" /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
                {/* Add Row Button */}
                <div className="p-3 bg-[#061524] border-t border-[#1a3a5c]">
                    <button 
                        onClick={() => setRows([...rows, { id: rows.length + 1, status: 'PENDING', date: '2026-06-24', way_id: `WAY-${rows.length+1}`, merchant: 'Baby Genius', recipient_name: '', recipient_phone: '', recipient_phone_2: '', town: '', tier: 'STANDARD', address: '', item_price: 0, weight: 1, base_fee: 0, surcharge: 0, deli_fee: 0, cod: 0, actual_collect: 0, destination: 'Yangon', pickup_by: 'DATA_ENTRY', remarks: '', saved: false }])}
                        className="flex items-center gap-2 text-[#4ea8de] hover:text-[#eef8ff] text-xs uppercase tracking-widest font-bold transition-colors"
                    >
                        <Plus size={14} /> Add Extra Row
                    </button>
                </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}