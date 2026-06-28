import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: React.ReactNode; pathname?: string; }
interface State { hasError: boolean; error: Error | null; }

export default class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidUpdate(prevProps: Props) {
    // Clear error if the user navigates to a new page via the sidebar
    if (this.props.pathname !== prevProps.pathname && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || 'Unknown Error';
      
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-[#061524] p-6 text-center z-[9999] relative notranslate" translate="no">
          <div className="bg-[#0b2236] border border-[#ff4f86] p-8 rounded-3xl max-w-lg shadow-2xl">
            <AlertTriangle className="mx-auto text-[#ff4f86] mb-4" size={56} />
            <h2 className="text-[#ff4f86] text-xl font-bold mb-2 uppercase tracking-widest">စနစ်ချို့ယွင်းမှု အမှားအယွင်း</h2>
            <h3 className="text-[#c8dff0] text-sm font-bold mb-4 uppercase tracking-widest">System Error Encountered</h3>
            
            <div className="bg-[#061524] p-4 rounded-xl mb-6 border border-[#1a3a5c] max-h-32 overflow-y-auto">
               <p className="text-[#ff4f86] text-[12px] font-mono text-left break-words">{msg}</p>
            </div>
            
            {(msg.includes('removeChild') || msg.includes('Node') || msg.includes('insertBefore')) && (
              <div className="text-[#f6b84b] text-[13px] font-bold mb-6 bg-[#f6b84b]/10 p-4 rounded-lg border border-[#f6b84b]/30 text-left">
                <span>မှတ်ချက်။ ။ ကျေးဇူးပြု၍ Browser ၏ Auto-Translate (ဘာသာပြန်စနစ်) ကို ပိတ်ပေးပါ။</span><br/><br/>
                <span>Please disable Google Translate extension for this portal to prevent React DOM conflicts.</span>
              </div>
            )}

            <button onClick={() => window.location.reload()} className="bg-[#f6b84b] text-[#061524] px-6 py-4 rounded-xl font-bold hover:bg-[#e5a93a] transition-colors cursor-pointer flex items-center justify-center gap-2 w-full uppercase tracking-wider text-[13px]">
              <RefreshCw size={18} /> <span>စနစ်အား ပြန်လည်စတင်မည် (RESTART SESSION)</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}