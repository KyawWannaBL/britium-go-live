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
  EyeOff,
  Ban
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

// --- MOCK INVOICE PAYLOAD DATA ---
const mockInvoices = [
  { 
    id: "INV-20260627-001", merchant: "Baby Genius", date: "2026-06-27", 
    customer: "Ma Htet Htet", phone: "09794665120", address: "No. 115/2nd Floor, Magalar Thiri St, Dagon Seikkan", 
    items: [
      { desc: "Baby Formula", qty: 2, price: 30000, total: 60000 },
      { desc: "Diapers (Large)", qty: 1, price: 16000, total: 16000 }
    ],
    subtotal: 76000, discount: 0, deliFee: 3000, total: 79000, isPrinted: false 
  },
  { 
    id: "INV-20260627-002", merchant: "Beauty Cos", date: "2026-06-27", 
    customer: "Phyu Thwe", phone: "09790210771", address: "Royal Rosy Hardware Store, 62nd St, Mandalay", 
    items: [
      { desc: "Skincare Set", qty: 1, price: 160000, total: 160000 }
    ],
    subtotal: 160000, discount: 0, deliFee: 20000, total: 180000, isPrinted: true 
  },
  { 
    id: "INV-20260627-003", merchant: "TZ-5 Fashion", date: "2026-06-27", 
    customer: "Khaing Thazin", phone: "09981381635", address: "South Okkalapa, Yangon", 
    items: [
      { desc: "Summer Dress", qty: 2, price: 20000, total: 40000 },
      { desc: "Accessories", qty: 1, price: 5000, total: 5000 }
    ],
    subtotal: 45000, discount: 0, deliFee: 4000, total: 49000, isPrinted: false 
  }
];

const TRANSLATIONS = {
  EN: {
    studioTitle: "Invoice Print Studio",
    superAdminLogin: "SuperAdmin Login",
    pendingApproval: "Pending Approval",
    formatLabel: "Format",
    dateLabel: "Date",
    searchLabel: "Search",
    searchPlaceholder: "Search Invoice / Merchant...",
    invoicesTitle: "Invoices",
    selectAll: "Select All",
    invoiceId: "Invoice ID",
    merchantCustomer: "Merchant / Customer",
    status: "Status",
    printed: "Printed",
    ready: "Ready",
    noInvoices: "No invoices found for this date.",
    reprintReasonRequired: "Reprint Reason Required",
    reasonPlaceholder: "Type specific reason...",
    batchActions: "Batch Actions",
    selected: "Selected:",
    printPreview: "Print Preview",
    hidePreview: "Hide Preview",
    requestReprint: "Request Reprint",
    mixedSelection: "Mixed Selection",
    printNow: "Print Now",
    reprintWarning: "Selected invoices have already been printed. Submit a request to the Super Admin for a reprint.",
    mixedWarning: "You have selected both new and previously printed invoices. Please select them separately.",
    printAreaPreview: "Print Area Preview (Hidden normally)",
    superAdminCenter: "SuperAdmin Reprint Approval Center",
    superAdminDesc: "Review and authorize requests to reprint invoices to prevent fraud and duplication.",
    switchToFinance: "Switch to Finance Dept View",
    noPendingRequests: "No pending reprint requests at this moment.",
    requestedBy: "Requested by",
    requestedInvoices: "Requested Invoices",
    reason: "Reason",
    approveReprint: "Approve Reprint",
    rejectRequest: "Reject Request",
    adminPending: "Pending Admin Approval",
    adminPendingDesc: "Your request to reprint has been sent. Waiting for Super Admin authorization...",
    // Invoice Content
    invoice: "INVOICE",
    date: "Date",
    billTo: "Bill To",
    shipTo: "Ship To",
    description: "Description",
    qty: "Qty",
    unitPrice: "Unit Price",
    amount: "Amount",
    subtotal: "Subtotal",
    discount: "Discount",
    shipping: "Shipping",
    total: "TOTAL",
    thankYou: "Thank you for your business!"
  },
  MM: {
    studioTitle: "ငွေတောင်းခံလွှာ ပရင့်စတူဒီယို",
    superAdminLogin: "အက်ဒမင် ဝင်ရောက်ရန်",
    pendingApproval: "ခွင့်ပြုချက် စောင့်ဆိုင်းနေသည်",
    formatLabel: "ပုံစံ",
    dateLabel: "ရက်စွဲ",
    searchLabel: "ရှာဖွေရန်",
    searchPlaceholder: "ဘောက်ချာ / ကုန်သည် ရှာဖွေရန်...",
    invoicesTitle: "ငွေတောင်းခံလွှာများ",
    selectAll: "အားလုံးရွေးချယ်မည်",
    invoiceId: "ဘောက်ချာ နံပါတ်",
    merchantCustomer: "ကုန်သည် / ဝယ်ယူသူ",
    status: "အခြေအနေ",
    printed: "ထုတ်ပြီး",
    ready: "အသင့်",
    noInvoices: "ယနေ့အတွက် ဘောက်ချာများ မတွေ့ရှိပါ။",
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
    switchToFinance: "ငွေစာရင်းဌာန အမြင်သို့ ပြောင်းမည်",
    noPendingRequests: "ယခုအချိန်တွင် တောင်းဆိုထားသော စာရင်းမရှိပါ။",
    requestedBy: "တောင်းဆိုသူ",
    requestedInvoices: "တောင်းဆိုထားသော ဘောက်ချာများ",
    reason: "အကြောင်းရင်း",
    approveReprint: "ခွင့်ပြုမည်",
    rejectRequest: "ငြင်းပယ်မည်",
    adminPending: "Admin ၏ ခွင့်ပြုချက်ကို စောင့်ဆိုင်းနေပါသည်",
    adminPendingDesc: "ထပ်မံထုတ်ရန် တောင်းဆိုချက်ကို ပို့လိုက်ပါပြီ။ Super Admin ၏ ခွင့်ပြုချက်ကို စောင့်ဆိုင်းနေပါသည်...",
    // Invoice Content
    invoice: "ငွေတောင်းခံလွှာ",
    date: "ရက်စွဲ",
    billTo: "ငွေပေးချေရမည့်သူ",
    shipTo: "ပို့ဆောင်ရမည့် နေရာ",
    description: "အကြောင်းအရာ",
    qty: "အရေအတွက်",
    unitPrice: "တစ်ခုချင်းဈေး",
    amount: "ကျသင့်ငွေ",
    subtotal: "စုစုပေါင်း (မလျှော့မီ)",
    discount: "လျှော့ငွေ",
    shipping: "ပို့ဆောင်ခ",
    total: "စုစုပေါင်း",
    thankYou: "ဝယ်ယူအားပေးမှုကို ကျေးဇူးတင်ပါသည်!"
  }
};

const REASON_OPTIONS_EN = [
  "Printer Jammed",
  "Ink Smudged",
  "Paper Torn",
  "Incorrect Details",
  "Other"
];

const REASON_OPTIONS_MM = [
  "စက္ကူညပ်သွား၍",
  "မှင်ပွသွား၍",
  "စက္ကူပြဲသွား၍",
  "အချက်အလက် မှားယွင်းနေ၍",
  "အခြား"
];

// --- REUSABLE PAGE CONTAINER ---
const PrintPage = ({ children, format }: { children: React.ReactNode, format: PrintFormat }) => {
  const isA5 = format.includes('A5');
  const isThermal = format.includes('THERMAL');
  return (
    <div 
      className={`${isA5 ? 'w-[148mm] h-[210mm]' : isThermal ? 'w-[4in] h-[6in]' : 'w-[210mm] h-[297mm]'} bg-white mb-6 shadow-xl print:shadow-none print:mb-0 flex flex-col box-border border print:border-none relative mx-auto`} 
      style={{ pageBreakAfter: 'always' }}
    >
      {children}
    </div>
  );
};

type PrintFormat = 'A4_FULL' | 'A5_HALF' | 'THERMAL_4x6';
type Role = 'FINANCE' | 'SUPER_ADMIN' | 'OTHER_DEPT';
type ReprintRequest = {
  reqId: string;
  requester: string;
  date: string;
  items: { id: string; reason: string }[];
  status: 'PENDING' | 'APPROVE' | 'REJECT';
};

export default function InvoicePrintStudioPage() {
  const [lang, setLang] = useState<'EN' | 'MM'>('EN');
  const t = TRANSLATIONS[lang];
  const currentReasons = lang === 'EN' ? REASON_OPTIONS_EN : REASON_OPTIONS_MM;

  // UI State - Default to Finance Dept
  const [role, setRole] = useState<Role>('FINANCE');
  const [format, setFormat] = useState<PrintFormat>('A4_FULL');
  const [selectedDate, setSelectedDate] = useState('2026-06-27');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  
  // Selection State
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [reprintReasons, setReprintReasons] = useState<{ [id: string]: { type: string, detail: string } }>({});
  
  // Mock Backend State
  const [invoiceData, setInvoiceData] = useState(mockInvoices);
  const [adminQueue, setAdminQueue] = useState<ReprintRequest[]>([]);

  // Filtering
  const filteredInvoices = useMemo(() => {
    return invoiceData.filter(inv => {
      const matchDate = inv.date === selectedDate;
      const matchSearch = inv.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          inv.merchant.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          inv.customer.toLowerCase().includes(searchQuery.toLowerCase());
      return matchDate && matchSearch;
    });
  }, [invoiceData, selectedDate, searchQuery]);

  const toggleSelectInvoice = (id: string, isPrinted: boolean) => {
    if (selectedInvoices.includes(id)) {
      setSelectedInvoices(prev => prev.filter(invId => invId !== id));
      if (isPrinted) {
        const newReasons = { ...reprintReasons };
        delete newReasons[id];
        setReprintReasons(newReasons);
      }
    } else {
      setSelectedInvoices(prev => [...prev, id]);
      if (isPrinted) {
        setReprintReasons(prev => ({ ...prev, [id]: { type: currentReasons[0], detail: '' } }));
      }
    }
  };

  const handleSelectAll = () => {
    if (selectedInvoices.length === filteredInvoices.length) {
      setSelectedInvoices([]);
      setReprintReasons({});
    } else {
      const allIds = filteredInvoices.map(w => w.id);
      setSelectedInvoices(allIds);
      
      const newReasons: any = {};
      filteredInvoices.forEach(w => {
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
    if (selectedInvoices.length === 0) {
      alert(lang === 'EN' ? "Please select invoices to print." : "ကျေးဇူးပြု၍ ပရင့်ထုတ်မည့် ဘောက်ချာများကို ရွေးချယ်ပါ။");
      return;
    }
    
    const needsApproval = selectedInvoices.some(id => invoiceData.find(w => w.id === id)?.isPrinted);
    
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
        setInvoiceData(prev => prev.map(w => selectedInvoices.includes(w.id) ? { ...w, isPrinted: true } : w));
        setSelectedInvoices([]);
        setShowPreview(false); // Hide preview after printing
      }, 2000);
    }, 500); // Give DOM a moment to render preview
  };

  const handleSubmitReprintRequest = () => {
    const lockedSelected = selectedInvoices.filter(id => invoiceData.find(w => w.id === id)?.isPrinted);

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
      requester: 'Finance_Dept_User',
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
    setSelectedInvoices([]);
    setReprintReasons({});
  };

  const handleAdminAction = (reqId: string, action: 'APPROVE' | 'REJECT') => {
    setAdminQueue(prev => prev.map(req => req.reqId === reqId ? { ...req, status: action } : req));
    
    if (action === 'APPROVE') {
      const request = adminQueue.find(r => r.reqId === reqId);
      if (request) {
        const approvedIds = request.items.map(i => i.id);
        setInvoiceData(prev => prev.map(w => approvedIds.includes(w.id) ? { ...w, isPrinted: false } : w));
      }
    }
  };

  const pendingCount = adminQueue.filter(r => r.status === 'PENDING').length;

  const hasLockedSelection = selectedInvoices.some(id => invoiceData.find(w => w.id === id)?.isPrinted);
  const hasUnlockedSelection = selectedInvoices.some(id => !invoiceData.find(w => w.id === id)?.isPrinted);

  // --- ACCESS CONTROL GUARD ---
  if (role === 'OTHER_DEPT') {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-8">
        <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md text-center border-t-4 border-rose-600">
          <Ban className="w-16 h-16 text-rose-500 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-gray-800 uppercase tracking-widest mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-6">
            Access to the Invoice Print Studio is strictly restricted to the <strong>Finance Department</strong> and <strong>Super Admin</strong>.
          </p>
          <button 
            onClick={() => setRole('FINANCE')} 
            className="text-sm font-bold text-blue-600 underline"
          >
            (Dev) Switch back to Finance
          </button>
        </div>
      </div>
    );
  }

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
          <div className="flex gap-3">
            <button 
              onClick={() => setRole('OTHER_DEPT')}
              className="bg-rose-900 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-rose-800 transition-colors"
            >
              Test Access Denied
            </button>
            <button 
              onClick={() => setRole('FINANCE')}
              className="bg-[#1a3a5c] text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-[#254b73] transition-colors"
            >
              <UserCog size={16} /> {t.switchToFinance}
            </button>
          </div>
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
                    <p className="text-sm text-[#8ab0c9] mb-3 font-semibold">{t.requestedInvoices} ({req.items.length}):</p>
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

  // --- RENDER FINANCE VIEW (Invoice Print Studio) ---
  return (
    <div className="min-h-screen bg-[#f3f4f6] text-black font-['Poppins',sans-serif] flex flex-col items-center pb-8 print:py-0 print:bg-white relative">
      
      {/* GLOBAL PRINT STYLES */}
      <style dangerouslySetInnerHTML={{__html: `
        @page { size: ${format === 'A4_FULL' ? '210mm 297mm' : format === 'A5_HALF' ? '148mm 210mm' : '4in 6in'}; margin: 0; }
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
          <h1 className="text-xl font-bold uppercase tracking-widest text-[#f6b84b]">{t.studioTitle} <span className="text-xs text-[#4ea8de] bg-[#1a3a5c] px-2 py-1 rounded ml-2">Finance Dept</span></h1>
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
              <option value="A4_FULL">A4 (Full Page)</option>
              <option value="A5_HALF">A5 (Half Page)</option>
              <option value="THERMAL_4x6">Thermal (4x6 Receipt)</option>
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
            <h3 className="font-bold text-gray-700 uppercase tracking-wider text-sm">{t.invoicesTitle} ({filteredInvoices.length})</h3>
            <button onClick={handleSelectAll} className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
              {selectedInvoices.length > 0 && selectedInvoices.length === filteredInvoices.length ? <CheckSquare size={16}/> : <Square size={16}/>} {t.selectAll}
            </button>
          </div>
          
          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="p-3 w-10 text-center"></th>
                  <th className="p-3 font-semibold text-gray-600">{t.invoiceId}</th>
                  <th className="p-3 font-semibold text-gray-600">{t.merchantCustomer}</th>
                  <th className="p-3 font-semibold text-gray-600 text-center">{t.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredInvoices.length === 0 ? (
                  <tr><td colSpan={4} className="p-6 text-center text-gray-500 italic">{t.noInvoices}</td></tr>
                ) : (
                  filteredInvoices.map(inv => {
                    const isSelected = selectedInvoices.includes(inv.id);
                    return (
                      <React.Fragment key={inv.id}>
                        <tr className={`${isSelected ? 'bg-blue-50/50' : 'hover:bg-gray-50'} transition-colors cursor-pointer`} onClick={() => toggleSelectInvoice(inv.id, inv.isPrinted)}>
                          <td className="p-3 text-center align-middle">
                            {isSelected ? <CheckSquare size={18} className="text-blue-600 mx-auto"/> : <Square size={18} className="text-gray-300 mx-auto"/>}
                          </td>
                          <td className="p-3 font-bold text-gray-800 align-middle">{inv.id}</td>
                          <td className="p-3 align-middle">
                            <div className="font-semibold text-gray-700">{inv.merchant}</div>
                            <div className="text-xs text-gray-500">{inv.customer}</div>
                          </td>
                          <td className="p-3 text-center align-middle">
                            {inv.isPrinted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-bold border border-gray-200"><Lock size={12}/> {t.printed}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-600 rounded text-xs font-bold border border-emerald-200"><Printer size={12}/> {t.ready}</span>
                            )}
                          </td>
                        </tr>
                        {isSelected && inv.isPrinted && (
                          <tr className="bg-rose-50/30">
                            <td colSpan={4} className="p-3 border-t border-rose-100">
                              <div className="flex gap-2 max-w-lg mx-auto">
                                <ShieldAlert size={18} className="text-rose-500 shrink-0 mt-2"/>
                                <div className="flex-1 space-y-2">
                                  <div className="text-xs font-bold text-rose-700 uppercase tracking-wider">{t.reprintReasonRequired}</div>
                                  <select 
                                    value={reprintReasons[inv.id]?.type || ''}
                                    onChange={(e) => updateReason(inv.id, 'type', e.target.value)}
                                    className="w-full bg-white border border-rose-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {currentReasons.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                  {(reprintReasons[inv.id]?.type === "Other" || reprintReasons[inv.id]?.type === "အခြား") && (
                                    <input 
                                      type="text" 
                                      placeholder={t.reasonPlaceholder} 
                                      value={reprintReasons[inv.id]?.detail || ''}
                                      onChange={(e) => updateReason(inv.id, 'detail', e.target.value)}
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
              <span className="text-lg text-blue-600 font-bold">{selectedInvoices.length}</span>
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
                  disabled={selectedInvoices.length === 0}
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

      {/* --- INVOICE RENDERING AREA --- */}
      <div className={`mt-12 w-full flex flex-col items-center pb-12 ${showPreview ? 'block' : 'hidden print:block'}`}>
        <div className="no-print w-full text-center border-t border-gray-300 pt-8 opacity-50 mb-8 max-w-5xl">
          <p className="text-sm font-bold uppercase tracking-widest text-gray-500">{t.printAreaPreview}</p>
        </div>
        
        {selectedInvoices.length > 0 && !hasLockedSelection && (
          selectedInvoices.map(id => {
            const invData = invoiceData.find(i => i.id === id) || invoiceData[0];
            
            return (
              <PrintPage key={id} format={format}>
                <div className={`w-full h-full ${format === 'THERMAL_4x6' ? 'p-4 text-xs' : 'p-8 text-sm'} flex flex-col box-border font-sans`}>
                  
                  {/* INVOICE HEADER */}
                  <div className={`flex justify-between items-start border-b-2 border-gray-800 pb-4 mb-4 ${format === 'THERMAL_4x6' ? 'flex-col gap-4' : 'flex-row'}`}>
                    <div className="flex gap-3 items-start max-w-full">
                      <img 
                        src="/logo.jpg" 
                        alt="Britium Express" 
                        className="w-12 h-12 md:w-16 md:h-16 object-contain rounded bg-white print-exact shrink-0"
                      />
                      <div className="flex-1 pr-2">
                        <h2 className="font-bold text-lg md:text-xl tracking-wide text-gray-800 leading-tight">BRITIUM EXPRESS</h2>
                        <p className="text-gray-500 text-[9px] md:text-[10px] mt-1 leading-snug">
                          No.227, Anawrahta Road, Ward 9, East Dagon Tsp., Yangon, Myanmar. 11451.
                        </p>
                        <p className="text-gray-500 text-[9px] md:text-[10px] leading-snug break-words whitespace-pre-line">
                          <span className="font-semibold">Phone:</span> +95-9-897 44 77 11, +95-9-897 44 77 22, +95-9-897 44 77 33, +95-9-897 44 77 44, +95-9-897 44 77 55,{"\n"}+95-9-897 44 77 66.
                        </p>
                        <p className="text-gray-500 text-[9px] md:text-[10px] leading-snug mt-0.5">
                          <span className="font-semibold">Email:</span> info@britiumexpress.com | <span className="font-semibold">Website:</span> www.britiumventures.com
                        </p>
                      </div>
                    </div>
                    <div className={`${format === 'THERMAL_4x6' ? 'text-left w-full border-t border-gray-100 pt-3' : 'text-right'} shrink-0`}>
                      <h1 className="text-xl md:text-2xl font-black text-gray-300 uppercase tracking-widest">{t.invoice}</h1>
                      <div className="mt-1 font-bold text-gray-800">{invData.id}</div>
                      <div className="text-gray-500 text-xs">{t.date}: {invData.date}</div>
                    </div>
                  </div>

                  {/* BILLING INFO */}
                  <div className="flex justify-between mb-6">
                    <div className="w-1/2 pr-4">
                      <h3 className="font-bold text-gray-600 uppercase text-xs mb-1 border-b border-gray-200 pb-1">{t.billTo}</h3>
                      <p className="font-bold text-gray-800 mt-2">{invData.merchant}</p>
                      <p className="text-gray-600 text-xs">Merchant Account</p>
                    </div>
                    <div className="w-1/2 pl-4">
                      <h3 className="font-bold text-gray-600 uppercase text-xs mb-1 border-b border-gray-200 pb-1">{t.shipTo}</h3>
                      <p className="font-bold text-gray-800 mt-2">{invData.customer}</p>
                      <p className="text-gray-600 text-xs">{invData.phone}</p>
                      <p className="text-gray-600 text-xs mt-1">{invData.address}</p>
                    </div>
                  </div>

                  {/* INVOICE ITEMS */}
                  <div className="flex-1">
                    <table className="w-full text-left">
                      <thead className="bg-gray-100 border-y-2 border-gray-800 print-exact">
                        <tr>
                          <th className="p-2 font-bold text-gray-700 text-xs">{t.description}</th>
                          <th className="p-2 font-bold text-gray-700 text-xs text-center w-16">{t.qty}</th>
                          <th className="p-2 font-bold text-gray-700 text-xs text-right w-24">{t.unitPrice}</th>
                          <th className="p-2 font-bold text-gray-700 text-xs text-right w-24">{t.amount}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {invData.items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="p-2 text-gray-800">{item.desc}</td>
                            <td className="p-2 text-gray-800 text-center">{item.qty}</td>
                            <td className="p-2 text-gray-800 text-right">{item.price.toLocaleString()}</td>
                            <td className="p-2 text-gray-800 text-right">{item.total.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* TOTALS */}
                  <div className="mt-4 flex justify-end">
                    <div className="w-64">
                      <div className="flex justify-between p-1.5 text-gray-600 text-sm border-b border-gray-200">
                        <span>{t.subtotal}:</span>
                        <span>{invData.subtotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between p-1.5 text-gray-600 text-sm border-b border-gray-200">
                        <span>{t.shipping}:</span>
                        <span>{invData.deliFee.toLocaleString()}</span>
                      </div>
                      {invData.discount > 0 && (
                         <div className="flex justify-between p-1.5 text-red-500 text-sm border-b border-gray-200">
                          <span>{t.discount}:</span>
                          <span>-{invData.discount.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between p-2 mt-2 bg-gray-100 text-gray-900 font-bold text-lg border-2 border-gray-800 print-exact">
                        <span>{t.total}:</span>
                        <span>{invData.total.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* FOOTER */}
                  <div className="mt-auto pt-6 flex justify-between items-end">
                    <div className="text-gray-500 text-xs italic">
                      {t.thankYou}
                    </div>
                    <div className="flex flex-col items-center">
                       <Barcode value={invData.id} format="CODE128" displayValue={false} height={24} width={1.5} />
                       <span className="text-[10px] text-gray-500 mt-1">{invData.id}</span>
                    </div>
                  </div>

                </div>
              </PrintPage>
            );
          })
        )}
      </div>

    </div>
  );
}