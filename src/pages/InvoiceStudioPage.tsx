import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Printer, RefreshCw, Receipt } from 'lucide-react';
import Barcode from 'react-barcode';

const FF = { body: "'Poppins', sans-serif" };

export default function InvoiceStudioPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('be_portal_pickup_requests').select('*').limit(3).order('created_at', { ascending: false });
      setInvoices(data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { void loadData(); }, []);

  const handlePrint = () => { window.print(); };

  return (
    <div style={{ background: '#e0e0e0', minHeight: '100vh', padding: 24, fontFamily: FF.body, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* ─── STRICT A4 PRINT CSS ─── */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
            body { background: white !important; margin: 0; padding: 0; }
            #portal-sidebar, header, .no-print { display: none !important; }
            .print-page { margin: 0 !important; box-shadow: none !important; border: none !important; page-break-after: always; width: 100%; max-width: 800px; }
            .bg-grey { background-color: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .print-page { width: 100%; max-width: 800px; background: white; margin-bottom: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); padding: 40px; box-sizing: border-box; color: #000; fontFamily: 'Arial', sans-serif; }
      `}} />

      <div className="no-print" style={{ width: '100%', maxWidth: 800, background: '#0b2236', border: '1px solid #1a3a5c', borderRadius: 16, padding: 20, marginBottom: 24, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#f6b84b' }}>Financial Invoice Studio</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#4d7a9b' }}>Print A4 commercial invoices for merchants.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={loadData} style={{ background: '#1a3a5c', border: 'none', color: '#fff', padding: '10px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}><RefreshCw size={14}/> Sync Data</button>
          <button onClick={handlePrint} style={{ background: '#22c55e', color: '#000', border: 'none', padding: '10px 24px', borderRadius: 8, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}><Printer size={16}/> Print Invoices</button>
        </div>
      </div>

      {loading ? <div style={{ padding: 40, color: '#000', fontWeight: 800 }}>Loading invoices...</div> : invoices.map((inv, i) => {
        const id = inv.pickup_id || `INV-${Date.now()}`;
        return (
        <div key={i} className="print-page">
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: 24, marginBottom: 24 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
               <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#2c3e50', color: 'white', fontSize: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>B</div>
               <div>
                  <div style={{ fontWeight: 'bold', fontSize: 24 }}>BRITIUM EXPRESS</div>
                  <div style={{ fontSize: 12, color: '#666' }}>No. 277, Anawrahta Road, East Dagon, Yangon</div>
                  <div style={{ fontSize: 12, color: '#666' }}>Hotline: 09-897447744</div>
               </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h2 style={{ fontSize: 32, fontWeight: 900, margin: '0 0 8px', color: '#000' }}>INVOICE</h2>
              <Barcode value={id} format="CODE128" displayValue={true} height={30} width={1.2} margin={0} background="transparent" />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32 }}>
             <div>
               <div style={{ fontSize: 12, color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>Bill To:</div>
               <div style={{ fontSize: 16, fontWeight: 'bold' }}>{inv.merchant_name || 'Customer Account'}</div>
               <div style={{ fontSize: 14 }}>{inv.merchant_code || 'N/A'}</div>
               <div style={{ fontSize: 14 }}>{inv.township || 'Yangon, Myanmar'}</div>
             </div>
             <div style={{ textAlign: 'right' }}>
               <div style={{ display: 'flex', gap: 16, marginBottom: 4 }}><span style={{ color: '#666' }}>Invoice Date:</span> <strong style={{ minWidth: 100 }}>{new Date().toLocaleDateString()}</strong></div>
               <div style={{ display: 'flex', gap: 16, marginBottom: 4 }}><span style={{ color: '#666' }}>Due Date:</span> <strong style={{ minWidth: 100 }}>{new Date(Date.now() + 86400000 * 7).toLocaleDateString()}</strong></div>
             </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 32 }}>
            <thead>
              <tr className="bg-grey" style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000' }}>
                <th style={{ padding: '12px 8px', textAlign: 'left' }}>Description</th>
                <th style={{ padding: '12px 8px', textAlign: 'center' }}>Qty</th>
                <th style={{ padding: '12px 8px', textAlign: 'right' }}>Unit Price</th>
                <th style={{ padding: '12px 8px', textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '16px 8px' }}>
                    <div style={{ fontWeight: 'bold' }}>Delivery Service Charge</div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Standard Tier Delivery (3kg included)</div>
                  </td>
                  <td style={{ padding: '16px 8px', textAlign: 'center' }}>{inv.expected_parcels || 1}</td>
                  <td style={{ padding: '16px 8px', textAlign: 'right' }}>4,000 MMK</td>
                  <td style={{ padding: '16px 8px', textAlign: 'right', fontWeight: 'bold' }}>{Number((inv.expected_parcels || 1) * 4000).toLocaleString()} MMK</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '16px 8px' }}>
                    <div style={{ fontWeight: 'bold' }}>COD Collection Surcharge</div>
                  </td>
                  <td style={{ padding: '16px 8px', textAlign: 'center' }}>1</td>
                  <td style={{ padding: '16px 8px', textAlign: 'right' }}>0 MMK</td>
                  <td style={{ padding: '16px 8px', textAlign: 'right', fontWeight: 'bold' }}>0 MMK</td>
                </tr>
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 14 }}>
            <div style={{ width: 300 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span>Subtotal</span>
                <span>{Number((inv.expected_parcels || 1) * 4000).toLocaleString()} MMK</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '2px solid #000' }}>
                <span>Tax (0%)</span>
                <span>0 MMK</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', fontSize: 18, fontWeight: 900 }}>
                <span>Total Due</span>
                <span>{Number((inv.expected_parcels || 1) * 4000).toLocaleString()} MMK</span>
              </div>
            </div>
          </div>
          
          <div style={{ marginTop: 60, fontSize: 12, color: '#666', borderTop: '1px solid #ccc', paddingTop: 16 }}>
            <p><strong>Payment Terms:</strong> Net 7 Days. Please remit payment to KBZ Bank Acct: 000-000-00000.</p>
            <p>Thank you for your business.</p>
          </div>
        </div>
      )})}
    </div>
  );
}