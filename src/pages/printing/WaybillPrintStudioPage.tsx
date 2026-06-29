import React, { useState, useMemo } from 'react';
import { 
  Printer, 
  Lock, 
  Send, 
  Clock, 
  CheckCircle2, 
  ShieldAlert, 
  CheckSquare, 
  XCircle, 
  UserCog,
  Square,
  Search,
  Filter,
  Eye,
  AlertCircle,
  EyeOff
} from 'lucide-react';

// --- CUSTOM INLINE COMPONENTS TO REPLACE EXTERNAL PACKAGES ---
const QRCode = ({ value, size }: { value: string, size: number }) => (
  <img 
    src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`} 
    alt={`QR-${value}`} 
    style={{ width: size, height: size }} 
    crossOrigin="anonymous"
  />
);

const Barcode = ({ value, height }: { value: string, height: number }) => (
  <img 
    src={`https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(value)}&includetext=false`} 
    alt={`Barcode-${value}`} 
    style={{ height: height, maxWidth: '100%', objectFit: 'contain' }} 
    crossOrigin="anonymous"
  />
);

// --- MOCK PAYLOAD DATA ---
const mockData = {
  p1: { merchant: "Baby Genius", date: "0627", seq: 15, recipient: "Ma Htet Htet", phone: "09794665120", address: "အမှတ် ၁၁၅/ဒုတိယထပ်, မဂ်လာသီရိလမ်း, မြို့သစ်ရပ်ကွက်, ဒေါပုံ", itemPrice: "76,000", deliFee: "3,000", total: "79,000" }
};

// ID GENERATOR
function generateID(dateStr: string, mName: string, seq: number) {
  let mCode = "XXX";
  if (mName.toLowerCase().includes("baby genius")) mCode = "BBG";
  else if (mName.toLowerCase().includes("beauty cos") || mName.toLowerCase().includes("bca")) mCode = "BCA";
  else {
    let alpha = mName.replace(/[^a-zA-Z]/g, '');
    if (alpha.length >= 3) mCode = alpha.substring(0, 3).toUpperCase();
    else mCode = alpha.toUpperCase().padEnd(3, 'X');
  }
  const s = seq.toString().padStart(3, '0');
  return `D${dateStr}-${mCode}-${s}`;
}

// BATCH LIST FOR REPRINT SELECTION
const ALL_WAYBILLS = [
  { id: generateID("0627", "Baby Genius", 1), merchant: "Baby Genius", recipient: "Ma Htet Htet", date: '2026-06-27', isPrinted: false },
  { id: generateID("0627", "Baby Genius", 2), merchant: "Baby Genius", recipient: "Ma Htet Htet", date: '2026-06-27', isPrinted: true },
  { id: generateID("0627", "Baby Genius", 3), merchant: "Baby Genius", recipient: "Ma Htet Htet", date: '2026-06-27', isPrinted: false },
  { id: generateID("0627", "Baby Genius", 4), merchant: "Baby Genius", recipient: "Ma Htet Htet", date: '2026-06-27', isPrinted: true },
  { id: generateID("0625", "Beauty Cos", 100), merchant: "Beauty Cos", recipient: "Phyu Thwe", date: '2026-06-25', isPrinted: false },
  { id: generateID("0625", "Beauty Cos", 112), merchant: "Beauty Cos", recipient: "ချစ်ချစ်အိမ်", date: '2026-06-25', isPrinted: false },
  { id: generateID("0625", "Beauty Cos", 117), merchant: "Beauty Cos", recipient: "Khin Win Mar", date: '2026-06-25', isPrinted: true },
  { id: generateID("0627", "Baby Genius", 15), merchant: "Baby Genius", recipient: "Ma Htet Htet", date: '2026-06-27', isPrinted: false },
  { id: generateID("0627", "Baby Genius", 21), merchant: "Baby Genius", recipient: "Ma Htet Htet", date: '2026-06-27', isPrinted: false },
  { id: generateID("0627", "Baby Genius", 22), merchant: "Baby Genius", recipient: "Ma Htet Htet", date: '2026-06-27', isPrinted: false },
];

const TRANSLATIONS = {
  EN: {
    studioTitle: "Waybill Print Studio",
    superAdminLogin: "SuperAdmin Login",
    pendingApproval: "Pending Approval",
    formatLabel: "Format",
    dateLabel: "Date",
    searchLabel: "Search",
    searchPlaceholder: "Search Waybill / Merchant...",
    waybillsTitle: "Waybills",
    selectAll: "Select All",
    waybillId: "Waybill ID",
    merchantRecipient: "Merchant / Recipient",
    status: "Status",
    printed: "Printed",
    ready: "Ready",
    noWaybills: "No waybills found for this date.",
    reprintReasonRequired: "Reprint Reason Required",
    reasonPlaceholder: "Type specific reason...",
    batchActions: "Batch Actions",
    selected: "Selected:",
    printPreview: "Print Preview",
    hidePreview: "Hide Preview",
    requestReprint: "Request Reprint",
    mixedSelection: "Mixed Selection",
    printNow: "Print Now",
    reprintWarning: "Selected waybills have already been printed. Submit a request to the Super Admin for a reprint.",
    mixedWarning: "You have selected both new and previously printed waybills. Please select them separately.",
    printAreaPreview: "Print Area Preview (Hidden normally)",
    superAdminCenter: "SuperAdmin Reprint Approval Center",
    superAdminDesc: "Review and authorize requests to reprint waybills to prevent fraud and duplication.",
    switchToStaff: "Switch to Branch Staff View",
    noPendingRequests: "No pending reprint requests at this moment.",
    requestedBy: "Requested by",
    requestedWaybills: "Requested Waybills",
    reason: "Reason",
    approveReprint: "Approve Reprint",
    rejectRequest: "Reject Request",
    adminPending: "Pending Admin Approval",
    adminPendingDesc: "Your request to reprint has been sent. Waiting for Super Admin authorization...",
    // Waybill Content
    merchant: "Merchant",
    recipient: "Recipient",
    remarks: "Remarks",
    itemPrice: "Item Price",
    deliFee: "Deli Fee",
    prepaid: "Prepaid",
    delivery: "Delivery",
    normal: "Normal",
    hotline: "HotLine",
    warningText: "If charged more than the amount below, please contact the Hotline above."
  },
  MM: {
    studioTitle: "ကုန်အမှတ်အသား ပရင့်စတူဒီယို",
    superAdminLogin: "အက်ဒမင် ဝင်ရောက်ရန်",
    pendingApproval: "ခွင့်ပြုချက် စောင့်ဆိုင်းနေသည်",
    formatLabel: "ပုံစံ",
    dateLabel: "ရက်စွဲ",
    searchLabel: "ရှာဖွေရန်",
    searchPlaceholder: "ဘောက်ချာ / ကုန်သည် ရှာဖွေရန်...",
    waybillsTitle: "ကုန်အမှတ်အသားများ",
    selectAll: "အားလုံးရွေးချယ်မည်",
    waybillId: "ဘောက်ချာ နံပါတ်",
    merchantRecipient: "ကုန်သည် / လက်ခံမည့်သူ",
    status: "အခြေအနေ",
    printed: "ထုတ်ပြီး",
    ready: "အသင့်",
    noWaybills: "ယနေ့အတွက် ဘောက်ချာများ မတွေ့ရှိပါ။",
    reprintReasonRequired: "အကြောင်းရင်း ထည့်သွင်းရန် လိုအပ်သည်",
    reasonPlaceholder: "တိကျသော အကြောင်းရင်းကို ရေးသားပါ...",
    batchActions: "စုပေါင်း လုပ်ဆောင်ချက်များ",
    selected: "ရွေးချယ်ထားသော အရေအတွက်:",
    printPreview: "နမူနာ ကြည့်ရှုမည်",
    hidePreview: "နမူနာ ပိတ်မည်",
    requestReprint: "ပြန်ထုတ်ရန် တောင်းဆိုမည်",
    mixedSelection: "ရောနှော ရွေးချယ်ထားသည်",
    printNow: "ယခု ပရင့်ထုတ်မည်",
    reprintWarning: "ရွေးချယ်ထားသော ဘောက်ချာများကို ပရင့်ထုတ်ပြီးသွားပါပြီ။ ထပ်မံထုတ်ရန် Super Admin ထံသို့ ခွင့်ပြုချက် တောင်းခံပါ။",
    mixedWarning: "ပရင့်ထုတ်ပြီးသော ဘောက်ချာများနှင့် အသစ်များကို ရောနှောရွေးချယ်ထားပါသည်။ ကျေးဇူးပြု၍ သီးခြားစီ ခွဲ၍ ရွေးချယ်ပါ။",
    printAreaPreview: "ပရင့်ထုတ်မည့် နမူနာပုံစံ (ပုံမှန်အားဖြင့် မပြသပါ)",
    superAdminCenter: "SuperAdmin ပြန်လည်ထုတ်ဝေခွင့် ပြုလုပ်ရာ နေရာ",
    superAdminDesc: "လိမ်လည်မှုနှင့် အထပ်ထပ်ထုတ်ခြင်းကို ကာကွယ်ရန် ပြန်လည်ပရင့်ထုတ်ရန် တောင်းဆိုချက်များကို စစ်ဆေး၍ ခွင့်ပြုချက်ပေးပါ။",
    switchToStaff: "ရုံးခွဲ ဝန်ထမ်း အမြင်သို့ ပြောင်းမည်",
    noPendingRequests: "ယခုအချိန်တွင် တောင်းဆိုထားသော စာရင်းမရှိပါ။",
    requestedBy: "တောင်းဆိုသူ",
    requestedWaybills: "တောင်းဆိုထားသော ဘောက်ချာများ",
    reason: "အကြောင်းရင်း",
    approveReprint: "ခွင့်ပြုမည်",
    rejectRequest: "ငြင်းပယ်မည်",
    adminPending: "Admin ၏ ခွင့်ပြုချက်ကို စောင့်ဆိုင်းနေပါသည်",
    adminPendingDesc: "ထပ်မံထုတ်ရန် တောင်းဆိုချက်ကို ပို့လိုက်ပါပြီ။ Super Admin ၏ ခွင့်ပြုချက်ကို စောင့်ဆိုင်းနေပါသည်...",
    // Waybill Content
    merchant: "ကုန်သည်",
    recipient: "လက်ခံမည့်သူ",
    remarks: "မှတ်ချက်",
    itemPrice: "ပစ္စည်းတန်ဖိုး",
    deliFee: "ပို့ဆောင်ခ",
    prepaid: "ကြိုရှင်းပြီးငွေ",
    delivery: "ပို့ဆောင်မှု",
    normal: "ပုံမှန်",
    hotline: "Hotline",
    warningText: "အောက်ဖော်ပြပါ ငွေပမာဏထက် ပိုမိုတောင်းခံပါက အထက်ပါ Hotline သို့ ဆက်သွယ် တိုင်ကြားနိုင်ပါသည်။"
  }
};

const REASON_OPTIONS_EN = [
  "Printer Jammed",
  "Ink Smudged",
  "Paper Torn",
  "Barcode Not Scannable",
  "Other"
];

const REASON_OPTIONS_MM = [
  "စက္ကူညပ်သွား၍",
  "မှင်ပွသွား၍",
  "စက္ကူပြဲသွား၍",
  "Barcode ဖတ်မရ၍",
  "အခြား"
];

// --- REUSABLE PAGE CONTAINER ---
const PrintPage = ({ children, format }: { children: React.ReactNode, format: PrintFormat }) => {
  const isA5 = format.includes('A5');
  return (
    <div 
      className={`${isA5 ? 'w-[148mm] h-[210mm]' : 'w-[4in] h-[6in]'} bg-white mb-6 shadow-xl print:shadow-none print:mb-0 flex flex-wrap overflow-hidden box-border border print:border-none relative mx-auto`} 
      style={{ pageBreakAfter: 'always' }}
    >
      {children}
    </div>
  );
};

type PrintFormat = 'A5_4_UNITS' | 'A5_3_UNITS' | 'THERMAL_1_UNIT' | 'THERMAL_2_UNITS';
type Role = 'STAFF' | 'SUPER_ADMIN';
type ReprintRequest = {
  reqId: string;
  requester: string;
  date: string;
  items: { id: string; reason: string }[];
  status: 'PENDING' | 'APPROVE' | 'REJECT';
};

export default function WaybillPrintStudioPage() {
  const [lang, setLang] = useState<'EN' | 'MM'>('EN');
  const t = TRANSLATIONS[lang];
  const currentReasons = lang === 'EN' ? REASON_OPTIONS_EN : REASON_OPTIONS_MM;

  // UI State
  const [role, setRole] = useState<Role>('STAFF');
  const [format, setFormat] = useState<PrintFormat>('THERMAL_1_UNIT');
  const [selectedDate, setSelectedDate] = useState('2026-06-27');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  
  // Selection State
  const [selectedWaybills, setSelectedWaybills] = useState<string[]>([]);
  const [reprintReasons, setReprintReasons] = useState<{ [id: string]: { type: string, detail: string } }>({});
  
  // Mock Backend State
  const [waybillData, setWaybillData] = useState(ALL_WAYBILLS);
  const [adminQueue, setAdminQueue] = useState<ReprintRequest[]>([]);

  // Filtering
  const filteredWaybills = useMemo(() => {
    return waybillData.filter(wb => {
      const matchDate = wb.date === selectedDate;
      const matchSearch = wb.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          wb.merchant.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          wb.recipient.toLowerCase().includes(searchQuery.toLowerCase());
      return matchDate && matchSearch;
    });
  }, [waybillData, selectedDate, searchQuery]);

  const toggleSelectWaybill = (id: string, isPrinted: boolean) => {
    if (selectedWaybills.includes(id)) {
      setSelectedWaybills(prev => prev.filter(wId => wId !== id));
      if (isPrinted) {
        const newReasons = { ...reprintReasons };
        delete newReasons[id];
        setReprintReasons(newReasons);
      }
    } else {
      setSelectedWaybills(prev => [...prev, id]);
      if (isPrinted) {
        setReprintReasons(prev => ({ ...prev, [id]: { type: currentReasons[0], detail: '' } }));
      }
    }
  };

  const handleSelectAll = () => {
    if (selectedWaybills.length === filteredWaybills.length) {
      setSelectedWaybills([]);
      setReprintReasons({});
    } else {
      const allIds = filteredWaybills.map(w => w.id);
      setSelectedWaybills(allIds);
      
      const newReasons: any = {};
      filteredWaybills.forEach(w => {
        if (w.isPrinted) {
          newReasons[w.id] = { type: currentReasons[0], detail: '' };
        }
      });
      setReprintReasons(newReasons);
    }
  };

  const updateReason = (id: string, field: 'type' | 'detail', value: string) => {
    setReprintReasons(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }));
  };

  const handlePrint = () => {
    if (selectedWaybills.length === 0) {
      alert(lang === 'EN' ? "Please select waybills to print." : "ကျေးဇူးပြု၍ ပရင့်ထုတ်မည့် ဘောက်ချာများကို ရွေးချယ်ပါ။");
      return;
    }
    
    const needsApproval = selectedWaybills.some(id => waybillData.find(w => w.id === id)?.isPrinted);
    
    if (needsApproval) {
      alert(t.reprintWarning);
      return;
    }

    // Force preview to show before printing so the browser has content to print
    setShowPreview(true);
    
    setTimeout(() => {
      window.print();
      
      // Mark as printed after printing
      setTimeout(() => {
        setWaybillData(prev => prev.map(w => selectedWaybills.includes(w.id) ? { ...w, isPrinted: true } : w));
        setSelectedWaybills([]);
        setShowPreview(false); // Hide preview after printing
      }, 2000);
    }, 500); // Give DOM a moment to render preview
  };

  const handleSubmitReprintRequest = () => {
    const lockedSelected = selectedWaybills.filter(id => waybillData.find(w => w.id === id)?.isPrinted);

    if (lockedSelected.length === 0) return;

    // Validate reasons
    const otherType = lang === 'EN' ? "Other" : "အခြား";
    const missingReasons = lockedSelected.some(id => 
      reprintReasons[id]?.type === otherType && !reprintReasons[id]?.detail.trim()
    );

    if (missingReasons) {
      alert(lang === 'EN' ? "Please provide details for the 'Other' reason." : "ကျေးဇူးပြု၍ အခြား အကြောင်းရင်းအတွက် အသေးစိတ် ရေးသားပါ။");
      return;
    }

    const newRequest: ReprintRequest = {
      reqId: `REQ-${Math.floor(Math.random() * 10000)}`,
      requester: 'Branch_User_01',
      date: new Date().toLocaleString(),
      items: lockedSelected.map(id => ({
        id,
        reason: reprintReasons[id].type === otherType 
          ? reprintReasons[id].detail 
          : reprintReasons[id].type
      })),
      status: 'PENDING'
    };

    setAdminQueue(prev => [newRequest, ...prev]);
    alert(lang === 'EN' ? "Reprint request submitted successfully." : "ထပ်မံထုတ်ရန် တောင်းဆိုချက် အောင်မြင်စွာ ပို့ဆောင်ပြီးပါပြီ။");
    setSelectedWaybills([]);
    setReprintReasons({});
  };

  const handleAdminAction = (reqId: string, action: 'APPROVE' | 'REJECT') => {
    setAdminQueue(prev => prev.map(req => req.reqId === reqId ? { ...req, status: action } : req));
    
    if (action === 'APPROVE') {
      const request = adminQueue.find(r => r.reqId === reqId);
      if (request) {
        const approvedIds = request.items.map(i => i.id);
        setWaybillData(prev => prev.map(w => approvedIds.includes(w.id) ? { ...w, isPrinted: false } : w));
      }
    }
  };

  const pendingCount = adminQueue.filter(r => r.status === 'PENDING').length;

  const hasLockedSelection = selectedWaybills.some(id => waybillData.find(w => w.id === id)?.isPrinted);
  const hasUnlockedSelection = selectedWaybills.some(id => !waybillData.find(w => w.id === id)?.isPrinted);

  // --- RENDER SUPER ADMIN VIEW ---
  if (role === 'SUPER_ADMIN') {
    return (
      <div className="min-h-screen bg-[#061524] text-[#eef8ff] font-['Poppins',sans-serif] p-8">
        
        {/* ROLE SWITCHER */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex bg-[#1a3a5c] rounded-lg p-1 border border-[#254b73]">
            <button onClick={() => setLang('EN')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${lang === 'EN' ? 'bg-[#f6b84b] text-[#061524]' : 'text-[#8ab0c9] hover:text-white'}`}>EN</button>
            <button onClick={() => setLang('MM')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${lang === 'MM' ? 'bg-[#f6b84b] text-[#061524]' : 'text-[#8ab0c9] hover:text-white'}`}>MM</button>
          </div>
          <button 
            onClick={() => setRole('STAFF')}
            className="bg-[#1a3a5c] text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-[#254b73] transition-colors"
          >
            <UserCog size={16} /> {t.switchToStaff}
          </button>
        </div>

        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-8 border-b border-[#1a3a5c] pb-4">
            <ShieldAlert size={28} className="text-[#f6b84b]" />
            <div>
              <h1 className="text-2xl font-bold text-[#f6b84b] uppercase tracking-widest">{t.superAdminCenter}</h1>
              <p className="text-[#4d7a9b] text-sm">{t.superAdminDesc}</p>
            </div>
          </div>

          {adminQueue.length === 0 ? (
            <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-12 text-center text-[#4d7a9b]">
              <CheckCircle2 size={48} className="mx-auto mb-4 opacity-50" />
              <p>{t.noPendingRequests}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {adminQueue.map(req => (
                <div key={req.reqId} className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl overflow-hidden shadow-lg">
                  <div className="p-4 bg-[#071a2b] border-b border-[#1a3a5c] flex justify-between items-center">
                    <div>
                      <div className="font-bold text-[#4ea8de] text-lg">{req.reqId}</div>
                      <div className="text-[#4d7a9b] text-xs">{t.requestedBy}: <span className="text-[#eef8ff]">{req.requester}</span> • {req.date}</div>
                    </div>
                    <div>
                      <span className={`px-3 py-1 text-xs font-bold uppercase rounded-md ${
                        req.status === 'PENDING' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                        req.status === 'APPROVE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}>
                        {req.status}
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-sm text-[#8ab0c9] mb-3 font-semibold">{t.requestedWaybills} ({req.items.length}):</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                      {req.items.map((item: any) => (
                        <div key={item.id} className="bg-[#061524] border border-[#1a3a5c] p-3 rounded-lg flex flex-col gap-1">
                          <span className="font-bold text-[#f6b84b] text-sm">{item.id}</span>
                          <span className="text-xs text-rose-400 bg-rose-500/10 px-2 py-1 rounded inline-block w-max border border-rose-500/20">
                            {t.reason}: {item.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    {req.status === 'PENDING' && (
                      <div className="flex gap-3 pt-4 border-t border-[#1a3a5c]">
                        <button 
                          onClick={() => handleAdminAction(req.reqId, 'APPROVE')}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors uppercase tracking-widest text-sm"
                        >
                          <CheckSquare size={18} /> {t.approveReprint}
                        </button>
                        <button 
                          onClick={() => handleAdminAction(req.reqId, 'REJECT')}
                          className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors uppercase tracking-widest text-sm"
                        >
                          <XCircle size={18} /> {t.rejectRequest}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- RENDER STAFF VIEW (Waybill Print Studio) ---
  return (
    <div className="min-h-screen bg-[#f3f4f6] text-black font-['Poppins',sans-serif] flex flex-col items-center pb-8 print:py-0 print:bg-white relative">
      
      {/* GLOBAL PRINT STYLES */}
      <style dangerouslySetInnerHTML={{__html: `
        @page { size: ${format.includes('A5') ? '148mm 210mm' : '4in 6in'}; margin: 0; }
        @media print {
            body { background: white; margin: 0; padding: 0; }
            .no-print { display: none !important; }
            .print-exact { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}} />

      {/* TOP HEADER */}
      <div className="no-print w-full bg-[#0b2236] text-[#eef8ff] p-4 flex justify-between items-center shadow-md z-10 sticky top-0">
        <div className="flex items-center gap-3 ml-4">
          <Printer size={24} className="text-[#f6b84b]"/>
          <h1 className="text-xl font-bold uppercase tracking-widest text-[#f6b84b]">{t.studioTitle}</h1>
        </div>
        <div className="flex items-center gap-4 mr-4">
          {/* Language Toggle */}
          <div className="flex bg-[#1a3a5c] rounded-lg p-1 border border-[#254b73]">
            <button onClick={() => setLang('EN')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${lang === 'EN' ? 'bg-[#f6b84b] text-[#061524]' : 'text-[#8ab0c9] hover:text-white'}`}>EN</button>
            <button onClick={() => setLang('MM')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${lang === 'MM' ? 'bg-[#f6b84b] text-[#061524]' : 'text-[#8ab0c9] hover:text-white'}`}>MM</button>
          </div>
          <button 
            onClick={() => setRole('SUPER_ADMIN')}
            className="flex items-center gap-2 text-sm bg-[#1a3a5c] px-3 py-1.5 rounded-lg hover:bg-[#254b73] transition-colors"
          >
            <ShieldAlert size={16} className={pendingCount > 0 ? 'text-amber-400' : ''}/>
            {pendingCount > 0 ? `${pendingCount} ${t.pendingApproval}` : t.superAdminLogin}
          </button>
        </div>
      </div>

      {/* MAIN CONTROLS */}
      <div className="no-print w-full max-w-5xl mt-6 mb-6 px-4">
        
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex flex-wrap gap-4 items-end">
          
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Filter size={14}/> {t.formatLabel}</label>
            <select 
              value={format} 
              onChange={(e) => setFormat(e.target.value as PrintFormat)}
              className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-blue-500"
            >
              <option value="A5_4_UNITS">A5 / A4 (4 Units : 2x3 Formats)</option>
              <option value="A5_3_UNITS">A5 / A4 (3 Units : 4x2 Formats)</option>
              <option value="THERMAL_1_UNIT">Thermal (1 Unit : 4x6 Format)</option>
              <option value="THERMAL_2_UNITS">Thermal (2 Units : 4x3 Formats)</option>
            </select>
          </div>

          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Filter size={14}/> {t.dateLabel}</label>
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex-1 min-w-[200px]">
             <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Search size={14}/> {t.searchLabel}</label>
             <input 
              type="text" 
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-blue-500"
            />
          </div>

        </div>
      </div>

      {/* DATA TABLE & BATCH ACTIONS */}
      <div className="no-print w-full max-w-5xl px-4 flex flex-col md:flex-row gap-6 items-start">
        
        {/* Table */}
        <div className="flex-[2] bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-gray-700 uppercase tracking-wider text-sm">{t.waybillsTitle} ({filteredWaybills.length})</h3>
            <button onClick={handleSelectAll} className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
              {selectedWaybills.length > 0 && selectedWaybills.length === filteredWaybills.length ? <CheckSquare size={16}/> : <Square size={16}/>} {t.selectAll}
            </button>
          </div>
          
          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="p-3 w-10 text-center"></th>
                  <th className="p-3 font-semibold text-gray-600">{t.waybillId}</th>
                  <th className="p-3 font-semibold text-gray-600">{t.merchantRecipient}</th>
                  <th className="p-3 font-semibold text-gray-600 text-center">{t.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredWaybills.length === 0 ? (
                  <tr><td colSpan={4} className="p-6 text-center text-gray-500 italic">{t.noWaybills}</td></tr>
                ) : (
                  filteredWaybills.map(wb => {
                    const isSelected = selectedWaybills.includes(wb.id);
                    return (
                      <React.Fragment key={wb.id}>
                        <tr className={`${isSelected ? 'bg-blue-50/50' : 'hover:bg-gray-50'} transition-colors cursor-pointer`} onClick={() => toggleSelectWaybill(wb.id, wb.isPrinted)}>
                          <td className="p-3 text-center align-middle">
                            {isSelected ? <CheckSquare size={18} className="text-blue-600 mx-auto"/> : <Square size={18} className="text-gray-300 mx-auto"/>}
                          </td>
                          <td className="p-3 font-bold text-gray-800 align-middle">{wb.id}</td>
                          <td className="p-3 align-middle">
                            <div className="font-semibold text-gray-700">{wb.merchant}</div>
                            <div className="text-xs text-gray-500">{wb.recipient}</div>
                          </td>
                          <td className="p-3 text-center align-middle">
                            {wb.isPrinted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-bold border border-gray-200"><Lock size={12}/> {t.printed}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-600 rounded text-xs font-bold border border-emerald-200"><Printer size={12}/> {t.ready}</span>
                            )}
                          </td>
                        </tr>
                        {isSelected && wb.isPrinted && (
                          <tr className="bg-rose-50/30">
                            <td colSpan={4} className="p-3 border-t border-rose-100">
                              <div className="flex gap-2 max-w-lg mx-auto">
                                <ShieldAlert size={18} className="text-rose-500 shrink-0 mt-2"/>
                                <div className="flex-1 space-y-2">
                                  <div className="text-xs font-bold text-rose-700 uppercase tracking-wider">{t.reprintReasonRequired}</div>
                                  <select 
                                    value={reprintReasons[wb.id]?.type || ''}
                                    onChange={(e) => updateReason(wb.id, 'type', e.target.value)}
                                    className="w-full bg-white border border-rose-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {currentReasons.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                  {(reprintReasons[wb.id]?.type === "Other" || reprintReasons[wb.id]?.type === "အခြား") && (
                                    <input 
                                      type="text" 
                                      placeholder={t.reasonPlaceholder} 
                                      value={reprintReasons[wb.id]?.detail || ''}
                                      onChange={(e) => updateReason(wb.id, 'detail', e.target.value)}
                                      className="w-full bg-white border border-rose-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Panel */}
        <div className="flex-[1] flex flex-col gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <h3 className="font-bold text-gray-800 uppercase tracking-wider text-sm mb-4 border-b border-gray-100 pb-2">{t.batchActions}</h3>
            
            <div className="flex justify-between items-center text-sm font-semibold text-gray-600 mb-6 bg-gray-50 p-3 rounded-xl border border-gray-200">
              <span>{t.selected}</span>
              <span className="text-lg text-blue-600 font-bold">{selectedWaybills.length}</span>
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => setShowPreview(!showPreview)}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors border border-gray-200"
              >
                {showPreview ? <EyeOff size={18} /> : <Eye size={18} />} {showPreview ? t.hidePreview : t.printPreview}
              </button>

              {/* Conditional Action Button based on selection status */}
              {hasLockedSelection && !hasUnlockedSelection ? (
                 <button 
                  onClick={handleSubmitReprintRequest}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white px-4 py-3 rounded-xl text-sm font-bold shadow-lg flex items-center justify-center gap-2 transition-colors uppercase tracking-wider"
                >
                  <Send size={18} /> {t.requestReprint}
                </button>
              ) : hasUnlockedSelection && hasLockedSelection ? (
                 <button 
                  disabled
                  className="w-full bg-gray-300 text-gray-500 px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 uppercase tracking-wider cursor-not-allowed"
                >
                  <AlertCircle size={18} /> {t.mixedSelection}
                </button>
              ) : (
                <button 
                  onClick={handlePrint}
                  disabled={selectedWaybills.length === 0}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 text-white px-4 py-3 rounded-xl text-sm font-bold shadow-lg flex items-center justify-center gap-2 transition-colors uppercase tracking-wider"
                >
                  <Printer size={18} /> {t.printNow}
                </button>
              )}
            </div>

            {hasLockedSelection && !hasUnlockedSelection && (
               <p className="text-xs text-rose-600 mt-3 text-center leading-relaxed bg-rose-50 p-2 rounded-lg border border-rose-100">
                 {t.reprintWarning}
               </p>
            )}
             {hasUnlockedSelection && hasLockedSelection && (
               <p className="text-xs text-amber-600 mt-3 text-center leading-relaxed bg-amber-50 p-2 rounded-lg border border-amber-100">
                 {t.mixedWarning}
               </p>
            )}

          </div>
        </div>

      </div>

      {/* --- WAYBILL RENDERING AREA --- */}
      {/* Hidden normally, only shows if showPreview is true or during print window */}
      <div className={`mt-12 w-full flex flex-col items-center pb-12 ${showPreview ? 'block' : 'hidden print:block'}`}>
        <div className="no-print w-full text-center border-t border-gray-300 pt-8 opacity-50 mb-8 max-w-5xl">
          <p className="text-sm font-bold uppercase tracking-widest text-gray-500">{t.printAreaPreview}</p>
        </div>
        
        {selectedWaybills.length > 0 && !hasLockedSelection && (
          <PrintPage format={format}>
            {selectedWaybills.map(id => {
              const wbData = mockData.p1; // Using p1 as generic mock data for the layout
              
              // Determine size classes based on format
              let unitClass = "w-full h-full p-3 text-xs"; // Thermal 1 Unit (Default)
              let qrSize = 80;
              let bcHeight = 24;
              let titleSize = "text-[20px]";
              
              if (format === 'THERMAL_2_UNITS') {
                 unitClass = "w-full h-1/2 p-2 text-[10px]";
                 qrSize = 40;
                 titleSize = "text-[14px]";
              } else if (format === 'A5_4_UNITS') {
                 unitClass = "w-1/2 h-1/2 p-1 text-[8px]";
                 qrSize = 32;
                 bcHeight = 18;
                 titleSize = "text-[7px]";
              } else if (format === 'A5_3_UNITS') {
                 unitClass = "w-full h-1/3 p-1 text-[9px]";
                 qrSize = 32;
                 bcHeight = 18;
                 titleSize = "text-[9px]";
              }

              return (
                <div key={id} className={`${unitClass} border border-black flex flex-col box-border`}>
                  <div className="flex justify-between border-b border-black pb-2 mb-2">
                    <div className="flex gap-2 items-center">
                      <div className="w-[30px] h-[30px] rounded-full bg-[#2c3e50] text-white text-[16px] flex items-center justify-center font-bold print-exact">B</div>
                      <div className="leading-none">
                        <div className={`font-bold ${titleSize} mb-1`}>BRITIUM EXPRESS</div>
                        <div className="text-[10px] mb-1">{t.deliveryService}</div>
                        <div className="font-bold text-[9px]">{t.hotline}: 09 - 897 44 77 44</div>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <div className="text-[10px] mb-1">2026-06-27 14:28:13</div>
                      <div className="mb-1"><QRCode value={id} size={qrSize} /></div>
                      <div className="text-[10px] font-bold">{id}</div>
                    </div>
                  </div>
                  <div className="border-b border-black pb-2 mb-2">
                    <table className="w-full text-inherit leading-relaxed">
                      <tbody>
                        <tr><td className="w-[70px] align-top">{t.merchant} :</td><td>{wbData.merchant} Os<br/>09796239153</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="border-b border-black pb-2 mb-2 flex-1">
                    <table className="w-full text-inherit">
                      <tbody>
                        <tr>
                          <td className="w-[70px] align-top">{t.recipient} :</td>
                          <td>
                            <b className="text-[14px] block mb-1">{wbData.recipient}</b>
                            <b className="text-[11px] block mb-1">{wbData.phone}</b>
                            <span className="leading-relaxed block">{wbData.address}</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="flex border-b border-black pb-2 mb-2">
                    <div className="flex-1 border-r border-black">
                      <div>{t.cbmWt} :<br/><b className="text-[11px]">1</b></div>
                      <div className="mt-2">{t.weight} :<br/><b className="text-[11px]">5</b></div>
                      <div className="mt-2">{t.delivery} :<br/><b className="text-[11px]">{t.normal}</b></div>
                    </div>
                    <div className="flex-[1.2] pl-2">
                      <div>{t.itemPrice} :<br/><span className="text-[11px]">{wbData.itemPrice}</span></div>
                      <div className="mt-2">{t.deliFee} :<br/><span className="text-[11px]">{wbData.deliFee}</span></div>
                      <div className="mt-2">{t.prepaid} :<br/><span className="text-[11px]">0</span></div>
                    </div>
                    <div className="flex-[1.5] pl-2 flex items-center">
                      <div className="w-full border border-black rounded p-2 text-right text-[16px] font-bold relative bg-[#d0d0d0] print-exact">
                        <span className="absolute top-[2px] left-[4px] text-[8px] font-normal">COD</span><br/>
                        {wbData.total}
                      </div>
                    </div>
                  </div>
                  <div className="mb-2">{t.remarks} :</div>
                  <div className="text-center font-bold text-[9px] pt-2 border-t border-dashed border-black leading-relaxed">
                    {t.warningText}
                  </div>
                </div>
              );
            })}
          </PrintPage>
        )}
      </div>

    </div>
  );
}