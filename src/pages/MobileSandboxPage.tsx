import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Camera, CheckCircle2, UploadCloud, MapPin, Scale, Smartphone } from 'lucide-react';

export default function MobileSandboxPage() {
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [scanned, setScanned] = useState(0);

  return (
    <div className="space-y-6 max-w-sm mx-auto mt-10">
      <div className="text-center mb-6">
        <div className="inline-flex bg-[#1a3a5c] p-4 rounded-full mb-4"><Smartphone className="text-[#4ea8de]" size={32}/></div>
        <h1 className="text-[#eef8ff] text-[16px] uppercase tracking-widest mb-1">{t('RIDER APP SIMULATOR', 'Rider App ပုံစံ')}</h1>
        <p className="text-[#4d7a9b] text-[13px]">{t('Order picking process with verification system.', 'ပစ္စည်းကောက်ယူမှုနှင့် အတည်ပြုစနစ်။')}</p>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 bg-[#061524] text-[#eef8ff] text-center py-2 text-[10px] tracking-widest uppercase border-b border-[#1a3a5c]">RIDER MOBILE VIEW</div>

        <div className="mt-8 space-y-6">
          <div className="bg-[#061524] border border-[#1a3a5c] rounded-xl p-4">
            <p className="text-[#4ea8de] text-[11px] uppercase tracking-widest mb-1">PICKUP_ASSIGNED</p>
            <p className="text-[#eef8ff] text-[14px]">PRQ-20260619-001 (ALN - Alnoor)</p>
            <p className="text-[#4d7a9b] text-[12px] mt-1">{t('Expected: 5 Parcels', 'မျှော်မှန်း ပါဆယ် ၅ ထုပ်')}</p>
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-[#1a3a5c]/30 border border-[#1a3a5c] p-4 rounded-2xl">
                 <div className="flex items-center gap-2 text-[#eef8ff] mb-2 text-[13px]"><MapPin size={14} className="text-[#f6b84b]"/> {t('Alnoor (North Dagon)', 'Alnoor (မြောက်ဒဂုံ)')}</div>
                 <p className="text-[#4d7a9b] text-[12px]">No. (1526), Ward (45), Zawgyi Road</p>
              </div>
              <button onClick={() => setStep(2)} className="w-full bg-[#f6b84b] text-[#061524] py-3 rounded-xl uppercase tracking-wider hover:bg-[#e5a93a] transition-colors cursor-pointer text-[12px]">
                {t('Arrived at Location', 'နေရာသို့ ရောက်ရှိပါပြီ')}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <label className="block text-[#4d7a9b] text-[10px] uppercase tracking-widest mb-2 flex items-center gap-2"><Scale size={12} className="text-[#4ea8de]"/> {t(`Enter Weight for Parcel ${scanned + 1} (KG)`, `ပါဆယ် ${scanned + 1} ၏ အလေးချိန် (ကီလို)`)}</label>
                <input type="number" placeholder="0.0" className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-center" />
              </div>
              <div>
                <label className="block text-[#4d7a9b] text-[10px] uppercase tracking-widest mb-2 flex items-center gap-2"><Camera size={12} className="text-[#4ea8de]"/> {t(`Take Picture of Parcel ${scanned + 1}`, `ပါဆယ် ${scanned + 1} ဓာတ်ပုံရိုက်ပါ`)}</label>
                <div className="border-2 border-dashed border-[#1a3a5c] bg-[#061524] h-32 rounded-2xl flex flex-col items-center justify-center text-[#4d7a9b] hover:border-[#f6b84b] transition-colors cursor-pointer">
                   <Camera size={24} className="mb-2"/><span className="text-[11px] uppercase tracking-widest mt-2">{t('Tap to open camera', 'ကင်မရာဖွင့်ရန် နှိပ်ပါ')}</span>
                </div>
              </div>
              <div className="flex justify-between items-center bg-[#061524] p-3 rounded-xl border border-[#1a3a5c]">
                 <span className="text-[#4d7a9b] text-[10px] uppercase tracking-widest">{t('Parcels Scanned', 'စကင်ဖတ်ပြီးသော ပါဆယ်')}</span>
                 <span className="text-[#f6b84b] text-[16px]">{scanned} / 5</span>
              </div>
              <div className="flex gap-2">
                 <button onClick={() => setScanned(scanned + 1)} disabled={scanned >= 5} className="flex-1 bg-[#1a3a5c] text-[#eef8ff] py-3 rounded-xl uppercase tracking-wider hover:border-[#f6b84b] border border-[#1a3a5c] transition-colors cursor-pointer text-[11px] disabled:opacity-50">{t('Next Parcel', 'နောက်တစ်ခု')}</button>
                 <button onClick={() => setStep(3)} disabled={scanned < 5} className="flex-1 bg-[#f6b84b] text-[#061524] py-3 rounded-xl uppercase tracking-wider hover:bg-[#e5a93a] transition-colors flex justify-center items-center gap-2 cursor-pointer text-[11px] disabled:opacity-50">
                   <UploadCloud size={14}/> {t('Submit', 'ပေးပို့မည်')}
                 </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center justify-center space-y-4 text-center py-6">
              <CheckCircle2 size={48} className="text-emerald-400" />
              <h2 className="text-[#eef8ff] text-[14px] uppercase tracking-widest">{t('Submitted Successfully', 'အောင်မြင်စွာ ပေးပို့ပြီးပါပြီ')}</h2>
              <p className="text-[#4d7a9b] text-[12px]">{t('Data entry staff can now review the photos and register the waybills.', 'ဒေတာသွင်းသူများမှ ဓာတ်ပုံများကို စစ်ဆေး၍ Waybill စာရင်းသွင်းနိုင်ပါပြီ။')}</p>
              <button onClick={() => {setStep(1); setScanned(0);}} className="mt-4 bg-[#1a3a5c] text-[#eef8ff] border border-[#1a3a5c] px-6 py-3 rounded-xl uppercase tracking-wider hover:border-[#f6b84b] transition-colors cursor-pointer text-[11px]">
                {t('Back to Dashboard', 'ပင်မစာမျက်နှာသို့')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}