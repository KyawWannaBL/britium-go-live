import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Mail, Lock, User, ArrowLeft, Globe } from 'lucide-react';

export default function SignupPage() {
  const navigate = useNavigate();
  const { toggleLang, lang } = useLanguage();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      alert(lang === 'en' ? 'Access request submitted to L5 Command.' : 'အကောင့်ဖွင့်ရန် တောင်းဆိုမှု အောင်မြင်ပါသည်။');
      navigate('/login');
    }, 1500);
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#05080F] p-4">
      <video autoPlay muted loop playsInline className="absolute z-0 min-w-full min-h-full object-cover opacity-20 grayscale-[0.3]">
        <source src="/background.mp4" type="video/mp4" />
      </video>

      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        <div className="w-16 h-16 bg-[#0B101B]/80 backdrop-blur-md border border-white/5 rounded-2xl flex items-center justify-center mb-6 shadow-2xl">
          <ShieldCheck className="text-emerald-500 h-8 w-8" strokeWidth={2} />
        </div>

        <h1 className="text-4xl font-black text-white tracking-widest uppercase mb-3">
          REQUEST <span className="text-emerald-500">ACCESS</span>
        </h1>
        <p className="text-[10px] text-slate-400 font-mono tracking-[0.2em] uppercase mb-8 text-center">
          L1-L4 PERSONNEL REGISTRATION PORTAL
        </p>

        <div className="w-full bg-[#111622]/95 backdrop-blur-2xl rounded-3xl p-8 shadow-2xl border border-white/5 border-t-[6px] border-t-emerald-500 relative overflow-hidden">
          <form onSubmit={handleSignup} className="space-y-6">
            <div>
              <label className="text-[10px] font-black font-mono text-slate-400 tracking-widest uppercase mb-2 block">{lang === 'en' ? 'Full Legal Name' : 'အမည်အပြည့်အစုံ'}</label>
              <div className="relative group">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 group-focus-within:text-emerald-500 transition-colors" />
                <input type="text" required className="w-full bg-[#0B0E17] border border-white/5 rounded-xl h-14 pl-12 pr-4 text-white font-mono text-sm outline-none focus:border-emerald-500/50 transition-all" placeholder="John Doe" onChange={e => setName(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black font-mono text-slate-400 tracking-widest uppercase mb-2 block">{lang === 'en' ? 'Corporate Email' : 'အီးမေးလ်လိပ်စာ'}</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 group-focus-within:text-emerald-500 transition-colors" />
                <input type="email" required className="w-full bg-[#0B0E17] border border-white/5 rounded-xl h-14 pl-12 pr-4 text-white font-mono text-sm outline-none focus:border-emerald-500/50 transition-all" placeholder="user@britium.com" onChange={e => setEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black font-mono text-slate-400 tracking-widest uppercase mb-2 block">{lang === 'en' ? 'Desired Security Key' : 'လျှို့ဝှက်ကုဒ်'}</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 group-focus-within:text-emerald-500 transition-colors" />
                <input type="password" required className="w-full bg-[#0B0E17] border border-white/5 rounded-xl h-14 pl-12 pr-4 text-white font-mono text-lg tracking-widest outline-none focus:border-emerald-500/50 transition-all" placeholder="••••••••••••" onChange={e => setPassword(e.target.value)} />
              </div>
            </div>
            <Button type="submit" disabled={isLoading} className="w-full h-14 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-lg tracking-widest uppercase transition-all shadow-lg shadow-emerald-900/20 mt-2">
              {isLoading ? (lang === 'en' ? "SUBMITTING..." : "ပေးပို့နေပါသည်...") : (lang === 'en' ? 'SUBMIT REQUEST' : 'တောင်းဆိုမှုပေးပို့မည်')}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/5 space-y-4 text-center">
            <button type="button" onClick={() => navigate('/login')} className="text-[11px] font-mono text-slate-400 hover:text-emerald-400 flex items-center justify-center w-full transition-colors uppercase tracking-widest">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {lang === 'en' ? 'RETURN TO SECURE GATEWAY' : 'နောက်သို့ပြန်သွားမည်'}
            </button>
            <Button onClick={toggleLang} variant="ghost" className="w-full text-slate-500 hover:text-white flex items-center justify-center gap-2 text-[10px] font-bold font-mono uppercase tracking-widest h-8">
              <Globe size={14} /> {lang === 'en' ? "မြန်မာစာ" : "English"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}