import { useEffect, useMemo, useState } from "react";
import {
  formatMMK,
  loadInvoicePrintSnapshot,
  makeInvoiceNo,
  printInvoiceAudit,
  todayInvoiceDate,
} from "@/lib/printStudioApi";
import "@/styles/printStudios.css";

export default function InvoicePrintStudioPage() {
  const [merchantCode, setMerchantCode] = useState("");
  const [pickupId, setPickupId] = useState("");
  const [merchants, setMerchants] = useState<any[]>([]);
  const [pickups, setPickups] = useState<any[]>([]);
  const [waybills, setWaybills] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedMerchant = useMemo(
    () => merchants.find((m) => m.merchant_code === merchantCode) || merchants[0] || {},
    [merchants, merchantCode]
  );

  const selectedPickup = useMemo(
    () => pickups.find((p) => p.pickup_id === pickupId || p.pickup_way_id === pickupId) || pickups[0] || {},
    [pickups, pickupId]
  );

  const invoiceNo = useMemo(
    () => makeInvoiceNo(selectedMerchant.merchant_code, selectedPickup.pickup_id || selectedPickup.pickup_way_id),
    [selectedMerchant, selectedPickup]
  );

  const totals = useMemo(() => {
    const cod = waybills.reduce((sum, row) => sum + Number(row.cod_amount || 0), 0);
    const fee = waybills.reduce((sum, row) => sum + Number(row.delivery_fee || 0), 0);
    return {
      cod,
      fee,
      net: cod - fee,
    };
  }, [waybills]);

  async function load(inputMerchant = merchantCode, inputPickup = pickupId) {
    setBusy(true);
    setMessage("");

    try {
      const snap = await loadInvoicePrintSnapshot({
        merchantCode: inputMerchant,
        pickupId: inputPickup,
      });

      setMerchants(snap.merchants);
      setPickups(snap.pickups);
      setWaybills(snap.waybills);

      if (!inputMerchant && snap.merchants[0]?.merchant_code) {
        setMerchantCode(snap.merchants[0].merchant_code);
      }

      if (!inputPickup && snap.pickups[0]?.pickup_id) {
        setPickupId(snap.pickups[0].pickup_id);
      }
    } catch (error: any) {
      setMessage(error?.message || "Unable to load invoice data.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function printInvoice() {
    if (!selectedMerchant.merchant_code || !selectedPickup.pickup_id) {
      setMessage("Select merchant and pickup first.");
      return;
    }

    try {
      await printInvoiceAudit({
        invoiceKey: invoiceNo,
        merchantCode: selectedMerchant.merchant_code,
        pickupId: selectedPickup.pickup_id || selectedPickup.pickup_way_id,
        payload: {
          total_cod: totals.cod,
          total_fee: totals.fee,
          net_settlement: totals.net,
          waybill_count: waybills.length,
        },
      });

      document.body.classList.add("invoice-printing");
      setTimeout(() => {
        window.print();
        document.body.classList.remove("invoice-printing");
      }, 300);
    } catch (error: any) {
      setMessage(error?.message || "Unable to print invoice.");
    }
  }

  return (
    <main className="print-studio-shell">
      <section className="print-controls no-print">
        <h1>Settlement Invoice Printing Studio</h1>
        <p>Real merchant, pickup, waybill and settlement data. No demo/mock/sample data.</p>

        <div className="print-row">
          <select
            className="print-select"
            value={merchantCode}
            onChange={(e) => {
              setMerchantCode(e.target.value);
              setPickupId("");
              void load(e.target.value, "");
            }}
          >
            {merchants.map((m) => (
              <option key={m.merchant_code} value={m.merchant_code}>
                {m.merchant_name} ({m.merchant_code})
              </option>
            ))}
          </select>

          <select
            className="print-select"
            value={pickupId}
            onChange={(e) => {
              setPickupId(e.target.value);
              void load(merchantCode, e.target.value);
            }}
          >
            {pickups.map((p) => (
              <option key={`${p.pickup_id}-${p.pickup_way_id}`} value={p.pickup_id || p.pickup_way_id}>
                {p.pickup_id || p.pickup_way_id} · {p.parcel_count} parcels
              </option>
            ))}
          </select>

          <button className="print-btn" disabled={busy} onClick={() => load()}>
            Refresh
          </button>

          <button className="print-btn" disabled={busy || waybills.length === 0} onClick={printInvoice}>
            Print Invoice
          </button>
        </div>

        {message ? <p><strong>{message}</strong></p> : null}
      </section>

      <div id="invoice-area">
        <div className="inv-header">
          <div className="inv-logo-box">
            <img src="/images/logo.jpg" alt="Britium Logo" />
            <div className="inv-company-details">
              <h1>BRITIUM EXPRESS</h1>
              <p>Delivery Services & Logistics</p>
              <p>Hotline: 09XXXXXXX | Email: accounts@britiumexpress.com</p>
            </div>
          </div>

          <div className="inv-meta">
            <h2>SETTLEMENT INVOICE</h2>
            <p>Invoice No: {invoiceNo}</p>
            <p>Date: {todayInvoiceDate()}</p>
          </div>
        </div>

        <div className="inv-parties">
          <div className="party-box">
            <h3>Billed To (Merchant)</h3>
            <p><strong>{selectedMerchant.merchant_name}</strong></p>
            <p>ID: {selectedMerchant.merchant_code}</p>
            <p>Phone: {selectedMerchant.merchant_phone || "-"}</p>
            <p>Address: {selectedMerchant.merchant_address || "-"}</p>
          </div>

          <div className="party-box">
            <h3>Reference Details</h3>
            <p><strong>PickupWay ID:</strong> {selectedPickup.pickup_id || selectedPickup.pickup_way_id}</p>
            <p><strong>Total Parcels:</strong> {waybills.length}</p>
            <p><strong>Settlement Type:</strong> Auto-deduct Delivery Fees from COD</p>
          </div>
        </div>

        <table className="invoice-table">
          <thead>
            <tr>
              <th className="text-center" width="5%">#</th>
              <th width="20%">Tracking No.</th>
              <th width="15%">Recipient</th>
              <th className="text-center" width="15%">Status</th>
              <th className="text-right" width="15%">COD Collected</th>
              <th className="text-right" width="15%">Delivery Fee</th>
              <th className="text-right" width="15%">Net Amount</th>
            </tr>
          </thead>

          <tbody>
            {waybills.map((wb, index) => {
              const cod = Number(wb.cod_amount || 0);
              const fee = Number(wb.delivery_fee || 0);
              return (
                <tr key={wb.tracking_no}>
                  <td className="text-center">{index + 1}</td>
                  <td><strong>{wb.tracking_no}</strong></td>
                  <td>{wb.recipient}</td>
                  <td className="text-center">{wb.status}</td>
                  <td className="text-right">{formatMMK(cod)}</td>
                  <td className="text-right">{formatMMK(fee)}</td>
                  <td className="text-right"><strong>{formatMMK(cod - fee)}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="inv-summary">
          <div className="summary-row">
            <span>Total COD Collected:</span>
            <span>{formatMMK(totals.cod)} MMK</span>
          </div>
          <div className="summary-row">
            <span>Total Delivery Fees:</span>
            <span>- {formatMMK(totals.fee)} MMK</span>
          </div>
          <div className="summary-row total">
            <span>NET SETTLEMENT DUE:</span>
            <span>{formatMMK(totals.net)} MMK</span>
          </div>
        </div>

        <div className="clear" />

        <div className="signatures">
          <div className="sig-line">Prepared By (Britium Finance)</div>
          <div className="sig-line">Merchant Acknowledgement</div>
        </div>

        <div className="inv-footer">
          <p>
            Thank you for partnering with Britium Express. If you have any discrepancies regarding this settlement report,
            please contact the Hotline within 3 working days.
          </p>
        </div>
      </div>
    </main>
  );
}
