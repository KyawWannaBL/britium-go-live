import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import QRCode from 'react-qr-code';
import Barcode from 'react-barcode';
import { Printer, RefreshCw, Layers } from 'lucide-react';

const FF = { body: "'Poppins', sans-serif" };

export default function WaybillStudioPage() {
  const { lang } = useLanguage();
  const [format, setFormat] = useState<'4x6' | '2x3' | '4x2'>('4x6');
  const [pickups, setPickups] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('be_portal_pickup_requests').select('*').limit(12).order('created_at', { ascending: false });
      setPickups(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const handlePrint = () => { window.print(); };

  // Generate chunks based on format
  const getChunks = () => {
    if (format === '4x6') return pickups.map(p => [p]);
    if (format === '2x3') {
      const chunks = [];
      for (let i = 0; i < pickups.length; i += 4) chunks.push(pickups.slice(i, i + 4));
      return chunks;
    }
    if (format === '4x2') {
      const chunks = [];
      for (let i = 0; i < pickups.length; i += 3) chunks.push(pickups.slice(i, i + 3));
      return chunks;
    }
    return [];
  };

  const chunks = getChunks();

  return (
    <div style={{ background: '#e0e0e0', minHeight: '100vh', padding: 24, fontFamily: FF.body, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* ─── STRICT THERMAL PRINT CSS ─── */}
      <style dangerouslySetInnerHTML={{__html: `
        @page { size: 4in 6in; margin: 0; }
        @media print {
            body { background: white !important; margin: 0; padding: 0; }
            #portal-sidebar, header, .no-print { display: none !important; }
            .print-page { margin: 0 !important; box-shadow: none !important; border: none !important; page-break-after: always; }
            .bg-grey { background-color: #d0d0d0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .print-page { width: 4in; height: 6in; background: white; margin-bottom: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); display: flex; flex-wrap: wrap; overflow: hidden; box-sizing: border-box; }
        svg { width: 100% !important; height: 100% !important; }
      `}} />

      {/* Control Panel */}
      <div className="no-print" style={{ width: '100%', maxWidth: 800, background: '#0b2236', border: '1px solid #1a3a5c', borderRadius: 16, padding: 20, marginBottom: 24, color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#f6b84b' }}>Unified Waybill Studio</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#4d7a9b' }}>Select layout and print exactly to 4x6 thermal printers.</p>
          </div>
          <button onClick={loadData} style={{ background: '#1a3a5c', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}><RefreshCw size={14}/> Sync Data</button>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {(['4x6', '4x2', '2x3'] as const).map(f => (
            <button key={f} onClick={() => setFormat(f)} style={{ background: format === f ? '#f6b84b' : '#061524', color: format === f ? '#000' : '#fff', border: `1px solid ${format === f ? '#f6b84b' : '#1a3a5c'}`, padding: '8px 16px', borderRadius: 8, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={14}/> 1 Sheet = {f === '4x6' ? '1 Label' : f === '4x2' ? '3 Labels' : '4 Labels'}
            </button>
          ))}
          <button onClick={handlePrint} style={{ marginLeft: 'auto', background: '#22c55e', color: '#000', border: 'none', padding: '10px 24px', borderRadius: 8, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}><Printer size={16}/> Print Now</button>
        </div>
      </div>

      {loading ? <div style={{ padding: 40, color: '#000', fontWeight: 800 }}>Loading waybills...</div> : chunks.map((chunk, chunkIdx) => (
        <div key={chunkIdx} className="print-page">
          
          {/* FORMAT 1: 4x6 (1 Label per sheet) */}
          {format === '4x6' && chunk.map((p, i) => {
            const id = p.pickup_id || `D-${Date.now()}`;
            return (
              <div key={i} style={{ width: '100%', height: '100%', padding: 12, border: '1px solid #000', fontSize: 12, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', color: '#000', fontFamily: 'Arial, sans-serif' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #000', paddingBottom: 12, marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 45, height: 45, borderRadius: '50%', background: '#2c3e50', color: 'white', fontSize: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>B</div>
                    <div style={{ lineHeight: 1 }}>
                      <div style={{ fontWeight: 'bold', fontSize: 20, marginBottom: 4 }}>BRITIUM EXPRESS</div>
                      <div style={{ fontSize: 15, marginBottom: 6 }}>DELIVERY SERVICE</div>
                      <div style={{ fontWeight: 'bold', fontSize: 13 }}>HotLine: 09 - 897 44 77 44</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <div style={{ fontSize: 12 }}>{new Date().toISOString().slice(0,10)}</div>
                    <div style={{ margin: '6px 0', width: 80, height: 80 }}><QRCode value={id} size={80} /></div>
                    <div style={{ fontSize: 12, fontWeight: 'bold' }}>{id}</div>
                  </div>
                </div>
                <div style={{ borderBottom: '1px solid #000', paddingBottom: 12, marginBottom: 12 }}>
                  <table style={{ width: '100%', fontSize: 13, lineHeight: 1.5 }}>
                    <tbody><tr><td style={{ width: 90, verticalAlign: 'top', fontWeight: 'bold' }}>Merchant :</td><td>{p.merchant_name}<br/>{p.merchant_code}<br/>Yangon</td></tr></tbody>
                  </table>
                </div>
                <div style={{ borderBottom: '1px solid #000', paddingBottom: 12, marginBottom: 12, flex: 1 }}>
                  <table style={{ width: '100%', fontSize: 13 }}>
                    <tbody><tr>
                      <td style={{ width: 90, verticalAlign: 'top', fontWeight: 'bold' }}>Recipient :</td>
                      <td>
                        <b style={{ fontSize: 20, display: 'block', marginBottom: 8 }}>{p.recipient_name || p.contact_person || 'Customer'}</b>
                        <b style={{ fontSize: 15, display: 'block', marginBottom: 8 }}>{p.phone_primary || p.phone || '09-XXXXXXX'}</b>
                        <span style={{ lineHeight: 1.5, display: 'block' }}>{p.pickup_address || p.address || p.township}</span>
                      </td>
                    </tr></tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', borderBottom: '1px solid #000', paddingBottom: 12, marginBottom: 12 }}>
                  <div style={{ flex: 1, borderRight: '1px solid #000' }}>
                    <div>CBM :<br/><b style={{ fontSize: 14 }}>1</b></div>
                    <div style={{ marginTop: 12 }}>Weight (kg) :<br/><b style={{ fontSize: 14 }}>{p.expected_parcels || 1}</b></div>
                  </div>
                  <div style={{ flex: 1.2, paddingLeft: 12 }}>
                    <div>Item Price :<br/><span style={{ fontSize: 14 }}>{Number(p.cod_amount || 0).toLocaleString()}</span></div>
                    <div style={{ marginTop: 12 }}>Deli Fee :<br/><span style={{ fontSize: 14 }}>{Number(p.delivery_fee || 4000).toLocaleString()}</span></div>
                  </div>
                  <div style={{ flex: 1.5, paddingLeft: 12, display: 'flex', alignItems: 'center' }}>
                    <div className="bg-grey" style={{ width: '100%', border: '1px solid #000', borderRadius: 4, padding: '15px 10px', textAlign: 'right', fontSize: 24, fontWeight: 'bold', position: 'relative' }}>
                      <span style={{ position: 'absolute', top: 5, left: 5, fontSize: 10, fontWeight: 'normal' }}>COD</span><br/>
                      {Number(p.cod_amount || 0).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 12, paddingTop: 12, borderTop: '1px dashed #000', lineHeight: 1.5 }}>
                  အောက်ချာပါ ငွေပမာဏထက် ပိုမိုတောင်းခံပါက အထက်ပါ<br/>Hotline သို့ ဆက်သွယ် တိုင်ကြားနိုင်ပါသည်။
                </div>
              </div>
            );
          })}

          {/* FORMAT 2: 4x2 (3 Labels per sheet) */}
          {format === '4x2' && chunk.map((p, i) => {
            const id = p.pickup_id || `D-${Date.now()}`;
            return (
              <div key={i} style={{ width: '100%', height: '33.333%', display: 'flex', border: '1px solid #000', fontSize: 9, boxSizing: 'border-box', color: '#000', fontFamily: 'Arial, sans-serif' }}>
                <div style={{ width: 20, textAlign: 'center', fontWeight: 'bold', borderRight: '1px solid #000', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                  {p.township || 'YGN'}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 4, boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #000', paddingBottom: 4, marginBottom: 4, alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <div style={{ fontWeight: 'bold', fontSize: 12, marginTop: 4 }}>4D</div>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#2c3e50', color: 'white', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', marginTop: 2 }}>B</div>
                      <div style={{ lineHeight: 1.1 }}>
                        <div style={{ fontWeight: 'bold', fontSize: 9, marginBottom: 2 }}>BRITIUM EXPRESS</div>
                        <div style={{ fontSize: 8 }}>09 - 897447744</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, textAlign: 'right', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <div style={{ height: 18, width: 90, overflow: 'hidden', display: 'flex', justifyContent: 'flex-end' }}><Barcode value={id} format="CODE128" displayValue={false} height={18} width={1} margin={0} background="transparent" /></div>
                        <div style={{ fontWeight: 'bold', fontSize: 8, marginTop: 1 }}>{id}</div>
                      </div>
                      <div style={{ width: 32, height: 32 }}><QRCode value={id} size={32} /></div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flex: 1 }}>
                    <div style={{ flex: 1.5, borderRight: '1px solid #000', paddingRight: 4, boxSizing: 'border-box' }}>
                      <div style={{ fontWeight: 'bold', fontSize: 11, marginBottom: 2 }}>{p.recipient_name || 'Customer'}</div>
                      <div style={{ fontWeight: 'bold', fontSize: 9, marginBottom: 3 }}>{p.phone_primary || '09-XXXXXXX'}</div>
                      <div style={{ fontSize: 8, lineHeight: 1.3 }}>{p.pickup_address || p.township}</div>
                    </div>
                    <div style={{ flex: 1, paddingLeft: 4, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span>Item:</span> <span>{Number(p.cod_amount || 0).toLocaleString()}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span>Deli:</span> <span>{Number(p.delivery_fee || 4000).toLocaleString()}</span></div>
                      </div>
                      <div className="bg-grey" style={{ border: '1px solid #000', textAlign: 'right', fontSize: 14, fontWeight: 'bold', padding: 4, marginTop: 'auto', position: 'relative' }}>
                        <span style={{ position: 'absolute', top: 2, left: 2, fontSize: 6, fontWeight: 'normal' }}>COD</span>
                        {Number(p.cod_amount || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* FORMAT 3: 2x3 (4 Labels per sheet) */}
          {format === '2x3' && chunk.map((p, i) => {
            const id = p.pickup_id || `D-${Date.now()}`;
            return (
              <div key={i} style={{ width: '50%', height: '50%', padding: 4, border: '1px solid #000', display: 'flex', flexDirection: 'column', fontSize: 8, boxSizing: 'border-box', color: '#000', fontFamily: 'Arial, sans-serif' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #000', paddingBottom: 4, marginBottom: 4, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#2c3e50', color: 'white', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>B</div>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: 7, marginBottom: 2 }}>BRITIUM EXPRESS</div>
                      <div style={{ fontWeight: 'bold', fontSize: 7 }}>09-897447744</div>
                    </div>
                  </div>
                  <QRCode value={id} size={32} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div><b>To:</b> {p.recipient_name || 'Customer'}</div>
                  <div><b>Ph:</b> {p.phone_primary || '09-XXXXXXX'}</div>
                  <div style={{ fontSize: 7, lineHeight: 1.2 }}>{p.pickup_address || p.township}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
                  <div style={{ lineHeight: 1.4 }}>
                    <div>Item: {Number(p.cod_amount || 0).toLocaleString()}</div>
                    <div>Deli: {Number(p.delivery_fee || 4000).toLocaleString()}</div>
                  </div>
                  <div className="bg-grey" style={{ border: '1px solid #000', borderRadius: 2, textAlign: 'right', fontSize: 11, fontWeight: 'bold', padding: 4, position: 'relative', width: 75 }}>
                    <span style={{ position: 'absolute', top: 2, left: 2, fontSize: 6, fontWeight: 'normal' }}>COD</span><br/>
                    <div style={{ marginTop: 2 }}>{Number(p.cod_amount || 0).toLocaleString()}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'center', borderTop: '1px solid #000', paddingTop: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ height: 18, width: '100%', overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
                    <Barcode value={id} format="CODE128" displayValue={false} height={18} width={1} margin={0} background="transparent" />
                  </div>
                  <div style={{ fontSize: 6, marginTop: 1 }}>{id}</div>
                </div>
              </div>
            );
          })}

        </div>
      ))}
    </div>
  );
}