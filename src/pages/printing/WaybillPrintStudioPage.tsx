import React, { useState } from 'react';
import QRCode from 'react-qr-code';
import Barcode from 'react-barcode';
import { Printer } from 'lucide-react';

// --- MOCK PAYLOAD DATA ---
const mockData = {
  p1: { merchant: "Baby Genius", date: "0627", seq: 15, recipient: "Ma Htet Htet", phone: "09794665120", address: "အမှတ် ၁၁၅/ဒုတိယထပ်, မဂ်လာသီရိလမ်း, မြို့သစ်ရပ်ကွက်, ဒေါပုံ", itemPrice: "76,000", deliFee: "3,000", total: "79,000" },
  p2: { merchant: "Beauty Cos", date: "0625", seq: 100, recipient: "Phyu Thwe", phone: "09-790210771", address: "Royal Rosy အိမ်ဆောက်ပစ္စည်းဆိုင်၊ (၆၂) လမ်း၊ ၁၂၀ x ၁၂၁ လမ်းကြား၊ မန္တလေးမြို့", itemPrice: "160,000", deliFee: "-", total: "180,000", sidebar: "(1) - မန္တလေး" },
  p3: { merchant: "Beauty Cos", date: "0625", seq: 112, recipient: "ချစ်ချစ်အိမ်", phone: "09-972219164", address: "(၁၁၄) လမ်း၊ ၅၅ x ၅၆ လမ်းကြား၊ ချမ်းမြသာစည်မြို့နယ်၊ မန္တလေးမြို့", itemPrice: "95,000", deliFee: "-", total: "107,000", sidebar: "(17) - မန္တလေး" },
  p4: { merchant: "Beauty Cos", date: "0625", seq: 117, recipient: "Khin Win Mar", phone: "09-797490446", address: "(၆၂) လမ်း၊ ၂၉ x ၃၀ လမ်းကြား၊ ချမ်းအေးသာစံမြို့နယ်၊ မန္တလေးမြို့", itemPrice: "199,000", deliFee: "0", total: "215,000", sidebar: "မန္တလေး" }
};

// --- TRANSLATION DICTIONARY ---
const TRANSLATIONS = {
  EN: {
    title: "Waybill Print Studio",
    subtitle: "Ensure printer is set to 4x6 inches (100x150mm) with None margins. Enable Background graphics to print the shaded COD boxes.",
    btnPrint: "Print Waybills",
    deliveryService: "DELIVERY SERVICE",
    merchant: "Merchant",
    recipient: "Recipient",
    remarks: "Remarks",
    itemPrice: "Item Price",
    deliFee: "Deli Fee",
    surcharge: "Surcharge",
    prepaid: "Prepaid",
    cbmWt: "CBM/wt. (Kg)",
    weight: "Weight (kg)",
    delivery: "Delivery",
    normal: "Normal",
    hotline: "HotLine",
    warningText: "If charged more than the amount below, please contact the Hotline above."
  },
  MM: {
    title: "ပင်မ Waybill စတူဒီယို",
    subtitle: "ပရင်တာကို 4x6 လက်မ (100x150mm) တွင်ထားရှိရန်နှင့် Margin မထားရန် သေချာစေပါ။ နောက်ခံအရောင်များ (Background graphics) ကို ဖွင့်ထားပါ။",
    btnPrint: "Waybill များ ပရင့်ထုတ်ရန်",
    deliveryService: "ပို့ဆောင်ရေး ဝန်ဆောင်မှု",
    merchant: "ကုန်သည်",
    recipient: "လက်ခံမည့်သူ",
    remarks: "မှတ်ချက်",
    itemPrice: "ပစ္စည်းတန်ဖိုး",
    deliFee: "ပို့ဆောင်ခ",
    surcharge: "အပိုဆောင်းကြေး",
    prepaid: "ကြိုရှင်းပြီးငွေ",
    cbmWt: "ထုထည်/အလေးချိန် (Kg)",
    weight: "အလေးချိန် (Kg)",
    delivery: "ပို့ဆောင်မှု",
    normal: "ပုံမှန်",
    hotline: "Hotline",
    warningText: "အောက်ဖော်ပြပါ ငွေပမာဏထက် ပိုမိုတောင်းခံပါက အထက်ပါ Hotline သို့ ဆက်သွယ် တိုင်ကြားနိုင်ပါသည်။"
  }
};

// --- ID GENERATION LOGIC ---
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

// --- REUSABLE PAGE CONTAINER ---
const PrintPage = ({ children }: { children: React.ReactNode }) => (
  <div 
    className="w-[4in] h-[6in] bg-white mb-6 shadow-xl print:shadow-none print:mb-0 flex flex-wrap overflow-hidden box-border border print:border-none" 
    style={{ pageBreakAfter: 'always' }}
  >
    {children}
  </div>
);

// --- MAIN COMPONENT ---
export default function WaybillPrintStudioPage() {
  const [lang, setLang] = useState<'EN' | 'MM'>('EN');
  const t = TRANSLATIONS[lang];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-200 text-black font-['Poppins',sans-serif] flex flex-col items-center py-8 print:py-0">
      
      {/* GLOBAL PRINT STYLES - Protects the exact 4x6 thermal dimension mapping */}
      <style dangerouslySetInnerHTML={{__html: `
        @page { size: 4in 6in; margin: 0; }
        @media print {
            body { background: white; margin: 0; padding: 0; }
            .no-print { display: none !important; }
            .print-exact { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}} />

      {/* HEADER / CONTROLS (Hidden during printing) */}
      <div className="no-print w-full max-w-md mb-8 text-center bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
        
        {/* Language Toggle */}
        <div className="flex justify-center mb-6">
          <div className="flex bg-gray-100 rounded-lg p-1 border border-gray-200">
            <button onClick={() => setLang('EN')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${lang === 'EN' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>EN</button>
            <button onClick={() => setLang('MM')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${lang === 'MM' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>မြန်မာ</button>
          </div>
        </div>

        <h2 className="text-2xl font-black text-gray-800 mb-2 uppercase tracking-wide">{t.title}</h2>
        <p className="text-sm text-gray-600 mb-6 leading-relaxed">
          {t.subtitle}
        </p>
        <button 
          onClick={handlePrint} 
          className="bg-blue-600 text-white px-6 py-3.5 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-all w-full flex items-center justify-center gap-2 uppercase tracking-wider"
        >
          <Printer size={18} />
          {t.btnPrint}
        </button>
      </div>

      {/* --- PAGE 1: Format 1 (Four 2x3 Formats) --- */}
      <PrintPage>
        {[1, 2, 3, 4].map(i => {
          const id = generateID(mockData.p1.date, mockData.p1.merchant, i);
          return (
            <div key={i} className="w-1/2 h-1/2 p-1 border border-black flex flex-col text-[8px] leading-tight box-border">
              <div className="flex justify-between border-b border-black pb-1 mb-1 items-start">
                <div className="flex items-center gap-1">
                  <div className="w-[14px] h-[14px] rounded-full bg-[#2c3e50] text-white text-[9px] flex items-center justify-center font-bold print-exact">B</div>
                  <div>
                    <div className="font-bold text-[7px] leading-none mb-[2px]">BRITIUM EXPRESS</div>
                    <div className="text-[6px] leading-none mb-[2px]">{t.deliveryService}</div>
                    <div className="font-bold text-[7px] leading-none">09-897447744</div>
                  </div>
                </div>
                <QRCode value={id} size={32} level="L" />
              </div>
              <div className="flex-1 flex flex-col gap-[2px]">
                <div>{t.merchant} : {mockData.p1.merchant}</div>
                <div>{t.recipient} : {mockData.p1.recipient}</div>
                <div className="mt-1">{t.remarks} :</div>
              </div>
              <div className="flex justify-between items-end mb-1">
                <div className="leading-[1.4]">
                  <div>{t.itemPrice} : {mockData.p1.itemPrice}</div>
                  <div>{t.deliFee} : {mockData.p1.deliFee}</div>
                </div>
                <div className="border border-black rounded-[2px] text-right text-[11px] font-bold p-1 relative w-[75px] bg-[#d0d0d0] print-exact">
                  <span className="absolute top-[2px] left-[2px] text-[6px] font-normal">COD</span><br/>
                  <div className="mt-[2px]">{mockData.p1.total}</div>
                </div>
              </div>
              <div className="text-center border-t border-black pt-[2px] flex flex-col items-center">
                <div className="h-[18px] w-full overflow-hidden flex justify-center">
                    <Barcode value={id} format="CODE128" displayValue={false} height={18} width={1} margin={0} background="transparent" />
                </div>
                <div className="text-[6px] mt-[1px]">2026-06-27 14:26:41</div>
              </div>
            </div>
          );
        })}
      </PrintPage>

      {/* --- PAGE 2: Format 2 (Three 4x2 Formats) --- */}
      <PrintPage>
        {[mockData.p2, mockData.p3, mockData.p4].map((p, idx) => {
          const id = generateID(p.date, p.merchant, p.seq);
          return (
            <div key={idx} className="w-full h-1/3 flex border border-black text-[9px] leading-tight box-border">
              <div className="w-[20px] text-center font-bold border-r border-black text-[10px] py-1 flex items-center justify-center [writing-mode:vertical-rl] rotate-180">
                {p.sidebar}
              </div>
              <div className="flex-1 flex flex-col p-1 box-border">
                <div className="flex justify-between border-b border-black pb-1 mb-1 items-start">
                  <div className="flex gap-1">
                    <div className="font-bold text-xs leading-none mt-1">4D</div>
                    <div className="w-[14px] h-[14px] rounded-full bg-[#2c3e50] text-white text-[9px] flex items-center justify-center font-bold mt-[2px] print-exact">B</div>
                    <div className="leading-[1.1]">
                      <div className="font-bold text-[9px] mb-[2px]">BRITIUM EXPRESS {t.deliveryService}</div>
                      <div className="text-[8px] mb-[3px]">09 - 897447744</div>
                      <div className="text-[8px]">OS : BC လူသုံးကုန်</div>
                    </div>
                  </div>
                  <div className="flex gap-1 text-right items-center">
                    <div className="flex flex-col items-end">
                      <div className="h-[18px] w-[90px] overflow-hidden flex justify-end">
                          <Barcode value={id} format="CODE128" displayValue={false} height={18} width={1} margin={0} background="transparent" />
                      </div>
                      <div className="font-bold text-[8px] mt-[1px]">{id}</div>
                    </div>
                    <div className="w-8 h-8"><QRCode value={id} size={32} level="L" /></div>
                  </div>
                </div>
                <div className="flex flex-1">
                  <div className="w-[14px] text-[7px] [writing-mode:vertical-rl] rotate-180 flex items-center justify-center">{t.recipient} :</div>
                  <div className="flex-[1.5] border-r border-black pr-1 box-border">
                    <div className="font-bold text-[11px] leading-tight mb-[2px]">{p.recipient}</div>
                    <div className="font-bold text-[9px] leading-tight mb-[3px]">{p.phone}</div>
                    <div className="text-[8px] leading-[1.3]">{p.address}</div>
                  </div>
                  <div className="flex-1 pl-1 flex flex-col justify-between box-border">
                    <div>
                        <div className="flex justify-between mb-[2px]"><span>{t.itemPrice} :</span> <span>{p.itemPrice}</span></div>
                        <div className="flex justify-between mb-[2px]"><span>{t.deliFee} :</span> <span>{p.deliFee}</span></div>
                        <div className="flex justify-between mb-[2px]"><span>{t.surcharge} :</span> <span>20,000</span></div>
                        <div className="text-[7px] mt-[1px]">{t.cbmWt} :</div>
                    </div>
                    <div className="border border-black text-right text-[14px] font-bold p-1 bg-[#d0d0d0] print-exact mt-auto">
                      {p.total}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </PrintPage>

      {/* --- PAGE 3: Format 3 (One 4x6 Format) --- */}
      <PrintPage>
        {(() => {
          const id3 = generateID("0627", "Baby Genius", 15);
          return (
            <div className="w-full h-full p-3 border border-black text-xs flex flex-col box-border">
              <div className="flex justify-between border-b border-black pb-3 mb-3">
                <div className="flex gap-2.5 items-center">
                  <div className="w-[45px] h-[45px] rounded-full bg-[#2c3e50] text-white text-[24px] flex items-center justify-center font-bold print-exact">B</div>
                  <div className="leading-none">
                    <div className="font-bold text-[20px] mb-1">BRITIUM EXPRESS</div>
                    <div className="text-[15px] mb-1.5">{t.deliveryService}</div>
                    <div className="font-bold text-[13px]">{t.hotline}: 09 - 897 44 77 44</div>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end">
                  <div className="text-[12px]">2026-06-27 14:28:13</div>
                  <div className="my-1.5 w-[80px] h-[80px]"><QRCode value={id3} size={80} level="L" /></div>
                  <div className="text-[12px] font-bold">{id3}</div>
                </div>
              </div>
              <div className="border-b border-black pb-3 mb-3">
                <table className="w-full text-[13px] leading-relaxed">
                  <tbody>
                    <tr><td className="w-[90px] align-top">{t.merchant} :</td><td>{mockData.p1.merchant} Os<br/><br/>09796239153<br/>ဒဂုံမြို့သစ်အရှေ့ပိုင်း</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="border-b border-black pb-3 mb-3 flex-1">
                <table className="w-full text-[13px]">
                  <tbody>
                    <tr>
                      <td className="w-[90px] align-top">{t.recipient} :</td>
                      <td>
                        <b className="text-[20px] block mb-2">{mockData.p1.recipient}</b>
                        <b className="text-[15px] block mb-2">{mockData.p1.phone}, {mockData.p1.phone}</b>
                        <span className="leading-relaxed block">{mockData.p1.address}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="flex border-b border-black pb-3 mb-3">
                <div className="flex-1 border-r border-black">
                  <div>CBM :<br/><b className="text-[14px]">1</b></div>
                  <div className="mt-3">{t.weight} :<br/><b className="text-[14px]">5</b></div>
                  <div className="mt-3">{t.delivery} :<br/><b className="text-[14px]">{t.normal}</b></div>
                </div>
                <div className="flex-[1.2] pl-3">
                  <div>{t.itemPrice} :<br/><span className="text-[14px]">{mockData.p1.itemPrice}</span></div>
                  <div className="mt-3">{t.deliFee} :<br/><span className="text-[14px]">{mockData.p1.deliFee}</span></div>
                  <div className="mt-3">{t.prepaid} :<br/><span className="text-[14px]">0</span></div>
                </div>
                <div className="flex-[1.5] pl-3 flex items-center">
                  <div className="w-full border border-black rounded p-[15px_10px] text-right text-[24px] font-bold relative bg-[#d0d0d0] print-exact">
                    <span className="absolute top-[5px] left-[5px] text-[10px] font-normal">COD</span><br/>
                    {mockData.p1.total}
                  </div>
                </div>
              </div>
              <div className="mb-5">{t.remarks} :</div>
              <div className="text-center font-bold text-[12px] pt-3 border-t border-dashed border-black leading-relaxed">
                {t.warningText}
              </div>
            </div>
          );
        })()}
      </PrintPage>

      {/* --- PAGE 4: Format 4 (Two 4x3 Formats) --- */}
      <PrintPage>
        {[1, 2].map((i) => {
          const id = generateID("0627", "Baby Genius", i + 20);
          return (
            <div key={i} className="w-full h-1/2 p-2 border border-black text-[10px] flex flex-col leading-snug box-border">
              <div className="flex justify-between border-b border-black pb-2 mb-2 items-start">
                <div className="flex gap-2 items-center">
                  <div className="w-[30px] h-[30px] rounded-full bg-[#2c3e50] text-white text-[16px] flex items-center justify-center font-bold print-exact">B</div>
                  <div className="leading-none">
                    <div className="font-bold text-[14px] mb-[3px]">BRITIUM EXPRESS</div>
                    <div className="text-[10px]">{t.hotline}: 09-897447744</div>
                  </div>
                </div>
                <div className="flex gap-2.5 text-right items-center">
                  <div className="flex flex-col items-end">
                    <div className="h-[24px] w-[120px] overflow-hidden flex justify-end">
                      <Barcode value={id} format="CODE128" displayValue={false} height={24} width={1.2} margin={0} background="transparent" />
                    </div>
                    <div className="font-bold text-[10px] mt-[2px]">{id}</div>
                  </div>
                  <div className="w-10 h-10"><QRCode value={id} size={40} level="L" /></div>
                </div>
              </div>
              <div className="flex flex-1">
                <div className="flex-[1.5] border-r border-black pr-2 box-border">
                  <div className="mb-2"><span className="font-bold">{t.merchant}:</span> {mockData.p1.merchant} Os<br/>09796239153</div>
                  <div className="mb-1"><span className="font-bold">{t.recipient}:</span> <span className="font-bold text-[14px]">{mockData.p1.recipient}</span></div>
                  <div className="mb-1">{mockData.p1.phone}</div>
                  <div className="leading-[1.4]">{mockData.p1.address}</div>
                </div>
                <div className="flex-1 pl-2 flex flex-col justify-between box-border">
                  <div>
                    <div className="flex justify-between mb-1"><span>{t.itemPrice}:</span> <span>{mockData.p1.itemPrice}</span></div>
                    <div className="flex justify-between mb-1"><span>{t.deliFee}:</span> <span>{mockData.p1.deliFee}</span></div>
                    <div className="flex justify-between mb-1"><span>{t.prepaid}:</span> <span>0</span></div>
                  </div>
                  <div className="border border-black rounded-[3px] text-right text-[18px] font-bold p-[10px_5px_5px_5px] bg-[#d0d0d0] print-exact relative mt-auto">
                    <span className="absolute top-[2px] left-[4px] text-[8px] font-normal">COD</span><br/>
                    {mockData.p1.total}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </PrintPage>

    </div>
  );
}