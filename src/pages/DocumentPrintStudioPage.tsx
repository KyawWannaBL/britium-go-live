import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Printer, RefreshCw, FileText } from 'lucide-react';
import Barcode from 'react-barcode';

const FF = { body: "'Poppins', sans-serif" };

export default function DocumentPrintStudioPage() {
  const [manifests, setManifests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('be_delivery_wayplans').select('*').order('created_at', { ascending: false }).limit(3);
      setManifests(data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { void loadData(); }, []);

  const handlePrint = () => { window.print(); };

  return (
    <div style={{ background: '#e0e0e0', minHeight: '100vh', padding: 24, fontFamily: FF.body, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* ─── STRICT A4/RECEIPT PRINT CSS ─── */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
            body { background: white !important; margin: 0; padding: 0; }
            #portal-sidebar, header, .no-print { display: none !important; }
            .print-page { margin: 0 !important; box-shadow: none !important; border: none !important; page-break-after: always; width: 100%; max-width: 800px; }
        }
        .print-page { width: 100%; max-width: 800px; background: white; margin-bottom: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); padding: 40px; box-sizing: border-box; color: #000; fontFamily: 'Arial', sans-serif; }
      `}} />

      <div className="no-print" style={{ width: '100%', maxWidth: 800, background: '#0b2236', border: '1px solid #1a3a5c', borderRadius: 16, padding: 20, marginBottom: 24, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#f6b84b' }}>Route Manifest Studio</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#4d7a9b' }}>Print A4 route sheets for drivers.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={loadData} style={{ background: '#1a3a5c', border: 'none', color: '#fff', padding: '10px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}><RefreshCw size={14}/> Sync Data</button>
          <button onClick={handlePrint} style={{ background: '#22c55e', color: '#000', border: 'none', padding: '10px 24px', borderRadius: 8, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}><Printer size={16}/> Print A4 Sheets</button>
        </div>
      </div>

      {loading ? <div style={{ padding: 40, color: '#000', fontWeight: 800 }}>Loading manifests...</div> : manifests.map((m, i) => (
        <div key={i} className="print-page">
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: 16, marginBottom: 24 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>DISPATCH MANIFEST</h2>
              <div style={{ fontSize: 14, marginTop: 4 }}>Date: {new Date(m.created_at || Date.now()).toLocaleDateString()}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Barcode value={m.wayplan_id || `W-${Date.now()}`} format="CODE128" displayValue={true} height={40} width={1.5} margin={0} background="transparent" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 40, marginBottom: 24, fontSize: 14 }}>
            <div>
              <div style={{ color: '#666', fontSize: 12, textTransform: 'uppercase' }}>Assigned Rider</div>
              <div style={{ fontWeight: 'bold', fontSize: 16 }}>{m.assigned_rider || 'Rider Not Assigned'}</div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 12, textTransform: 'uppercase' }}>Vehicle Plate</div>
              <div style={{ fontWeight: 'bold', fontSize: 16 }}>{m.assigned_vehicle || 'N/A'}</div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 12, textTransform: 'uppercase' }}>Total Parcels</div>
              <div style={{ fontWeight: 'bold', fontSize: 16 }}>{m.total_parcels || 0}</div>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f0f0f0', borderTop: '1px solid #000', borderBottom: '1px solid #000' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left' }}>No.</th>
                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Tracking ID</th>
                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Receiver</th>
                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Address</th>
                <th style={{ padding: '10px 8px', textAlign: 'right' }}>COD Amount</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>Signature</th>
              </tr>
            </thead>
            <tbody>
              {/* Simulate 10 rows for visual presentation */}
              {Array.from({length: 10}).map((_, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #ccc' }}>
                  <td style={{ padding: '12px 8px' }}>{idx + 1}</td>
                  <td style={{ padding: '12px 8px', fontFamily: 'monospace', fontWeight: 'bold' }}>P0629-M{idx}</td>
                  <td style={{ padding: '12px 8px' }}>Customer {idx}</td>
                  <td style={{ padding: '12px 8px' }}>Yangon, Block {idx}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 'bold' }}>25,000</td>
                  <td style={{ padding: '12px 8px', width: 100 }}></td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div style={{ marginTop: 40, borderTop: '1px solid #000', paddingTop: 16, display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <div>Dispatcher Sign: _______________________</div>
            <div>Rider Sign: _______________________</div>
          </div>
        </div>
      ))}
    </div>
  );
}