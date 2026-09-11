import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type Entry = {id: number; actor_email: string | null; actor_id: string | null; changed_at: string; source_table: string; before_values: Record<string, unknown>; after_values: Record<string, unknown>};
export default function DeliveryAddressHistory({wayId}: {wayId: string}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const operation = useRef(0);
  useEffect(() => { operation.current++; setOpen(false); setEntries([]); setBusy(false); return () => { operation.current++; }; }, [wayId]);
  async function load(older = false) {
    const id = ++operation.current;
    setOpen(true); setBusy(true); setError('');
    try {
      let query = (supabase as any).from('be_delivery_address_history')
        .select('id,actor_id,actor_email,changed_at,source_table,before_values,after_values')
        .eq('delivery_way_id', wayId).order('id', {ascending:false}).limit(50);
      if (older && entries.length) query = query.lt('id', entries[entries.length - 1].id);
      const result = await query;
      if (id !== operation.current) return;
      if (result.error) throw result.error;
      setEntries(previous => older ? [...previous, ...result.data] : result.data);
      setMore(result.data.length === 50);
    } catch (e: any) { if(id === operation.current) setError(e.message || 'Could not load address history.'); }
    finally { if(id === operation.current) setBusy(false); }
  }
  return <div className="w-full">
    <button type="button" className="rounded-lg border border-cyan-300/40 px-3 py-2 text-xs text-cyan-100" onClick={() => open ? setOpen(false) : void load()}>Address history / ပြင်ဆင်မှုမှတ်တမ်း</button>
    {open && <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-slate-600 p-3 text-xs text-slate-100">
      <p className="mb-2">Saved changes show the signed-in editor, time, and old/new values. Draft typing is recorded when saved.</p>
      {error && <p role="alert">{error}</p>}
      {!busy && !error && !entries.length && <p>No recorded changes since address history was enabled.</p>}
      {entries.map(entry => <div key={entry.id} className="mb-3 border-b border-slate-600 pb-2">
        <b>{entry.actor_email || entry.actor_id || 'System / database operation'}</b> · {new Date(entry.changed_at).toLocaleString()}
        {Object.keys(entry.after_values).filter(key => JSON.stringify(entry.before_values[key]) !== JSON.stringify(entry.after_values[key])).map(key => <div key={key} className="mt-1 break-words"><span className="text-cyan-200">{key.replaceAll('_',' ')}:</span> {String(entry.before_values[key] ?? '—')} → {String(entry.after_values[key] ?? '—')}</div>)}
      </div>)}
      {busy && <p role="status">Loading history…</p>}
      {!busy && more && <button type="button" onClick={() => void load(true)}>Load older changes</button>}
      {!busy && <button type="button" className="ml-3" onClick={() => void load()}>Refresh</button>}
    </div>}
  </div>;
}
