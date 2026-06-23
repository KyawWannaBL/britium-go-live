import { useEffect, useMemo, useState } from "react";
import {
  grantWaybillReprintPermission,
  loadWaybillPrintSnapshot,
  printWaybillAudit,
  formatMMK,
} from "@/lib/printStudioApi";
import "@/styles/printStudios.css";

function qrUrl(value: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(value)}`;
}

export default function WaybillPrintStudioPage() {
  const [search, setSearch] = useState("");
  const [merchantCode, setMerchantCode] = useState("");
  const [pickupId, setPickupId] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selectedRows = useMemo(
    () => rows.filter((row) => selected[row.waybill_no]),
    [rows, selected]
  );

  async function load() {
    setBusy(true);
    setMessage("");

    try {
      const snap = await loadWaybillPrintSnapshot({
        search,
        merchantCode,
        pickupId,
      });

      setRows(snap.rows);
      setStats(snap.stats);
    } catch (error: any) {
      setMessage(error?.message || "Unable to load waybill printing data.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function toggleAll(value: boolean) {
    const next: Record<string, boolean> = {};
    rows.forEach((row) => {
      if (row.can_print) next[row.waybill_no] = value;
    });
    setSelected(next);
  }

  async function printSelected() {
    if (selectedRows.length === 0) {
      setMessage("Select at least one printable waybill.");
      return;
    }

    setBusy(true);

    try {
      for (const row of selectedRows) {
        await printWaybillAudit({
          waybillNo: row.waybill_no,
          batchKey: row.pickup_id || row.pickup_way_id,
        });
      }

      document.body.classList.add("waybill-printing");
      setTimeout(() => {
        window.print();
        document.body.classList.remove("waybill-printing");
        void load();
      }, 350);
    } catch (error: any) {
      setMessage(error?.message || "Waybill print blocked.");
    } finally {
      setBusy(false);
    }
  }

  async function grantBatchPermission() {
    const batch = pickupId || window.prompt("Enter batch / pickup ID to grant reprint permission:");
    if (!batch) return;

    const reason = window.prompt("Reason for batch reprint permission:") || "Batch reprint permission";

    try {
      await grantWaybillReprintPermission({
        scope: "BATCH",
        batchKey: batch,
        reason,
      });

      setMessage(`Superadmin permission granted for batch ${batch}.`);
      await load();
    } catch (error: any) {
      setMessage(error?.message || "Unable to grant batch permission.");
    }
  }

  async function grantOnePermission(row: any) {
    const reason = window.prompt(`Reason to reprint ${row.waybill_no}:`) || "Individual reprint permission";

    try {
      await grantWaybillReprintPermission({
        scope: "WAYBILL",
        waybillNo: row.waybill_no,
        batchKey: row.pickup_id || row.pickup_way_id,
        reason,
      });

      setMessage(`Superadmin permission granted for ${row.waybill_no}.`);
      await load();
    } catch (error: any) {
      setMessage(error?.message || "Unable to grant waybill permission.");
    }
  }

  return (
    <main className="print-studio-shell">
      <section className="print-controls no-print">
        <h1>Waybill Printing Studio</h1>
        <p>
          First print is allowed once. Reprint requires Superadmin permission by batch or individual waybill number.
        </p>

        <div className="print-row">
          <input
            className="print-input"
            placeholder="Search waybill / pickup / merchant / receiver"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            className="print-input"
            placeholder="Merchant Code"
            value={merchantCode}
            onChange={(e) => setMerchantCode(e.target.value)}
          />
          <input
            className="print-input"
            placeholder="Pickup / Batch ID"
            value={pickupId}
            onChange={(e) => setPickupId(e.target.value)}
          />
          <button className="print-btn" disabled={busy} onClick={load}>
            Load
          </button>
        </div>

        <div className="print-row">
          <button className="print-btn secondary" onClick={() => toggleAll(true)}>
            Select Printable
          </button>
          <button className="print-btn secondary" onClick={() => toggleAll(false)}>
            Clear
          </button>
          <button className="print-btn" disabled={busy || selectedRows.length === 0} onClick={printSelected}>
            Print Selected ({selectedRows.length})
          </button>
          <button className="print-btn warning" onClick={grantBatchPermission}>
            Superadmin Batch Reprint Permission
          </button>
        </div>

        {message ? <p><strong>{message}</strong></p> : null}

        <div className="print-row">
          <span>Total: {stats.total || 0}</span>
          <span>First print available: {stats.first_print_available || 0}</span>
          <span>Locked: {stats.locked || 0}</span>
          <span>Permission granted: {stats.permission_granted || 0}</span>
        </div>

        <table className="print-table">
          <thead>
            <tr>
              <th>Select</th>
              <th>Waybill</th>
              <th>Pickup/Batch</th>
              <th>Merchant</th>
              <th>Receiver</th>
              <th>COD</th>
              <th>Status</th>
              <th>Print</th>
              <th>Permission</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.waybill_no}>
                <td>
                  <input
                    type="checkbox"
                    disabled={!row.can_print}
                    checked={Boolean(selected[row.waybill_no])}
                    onChange={(e) =>
                      setSelected((old) => ({
                        ...old,
                        [row.waybill_no]: e.target.checked,
                      }))
                    }
                  />
                </td>
                <td><strong>{row.waybill_no}</strong></td>
                <td>{row.pickup_id || row.pickup_way_id}</td>
                <td>{row.merchant_code} {row.merchant_name}</td>
                <td>{row.receiver_name}</td>
                <td>{formatMMK(row.cod_amount)}</td>
                <td>{row.status}</td>
                <td>
                  <span className={`print-status ${row.can_print ? "ok" : "locked"}`}>
                    {row.print_status}
                  </span>
                </td>
                <td>
                  <button className="print-btn warning" onClick={() => grantOnePermission(row)}>
                    Grant One
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="waybill-print-area">
        {selectedRows.map((row) => {
          const payload = JSON.stringify({
            type: "BRITIUM_WAYBILL",
            waybill_no: row.waybill_no,
            pickup_id: row.pickup_id,
            delivery_way_id: row.delivery_way_id,
          });

          return (
            <article className="waybill-label" key={row.waybill_no}>
              <div className="wb-head">
                <div>
                  <div className="wb-brand">BRITIUM EXPRESS</div>
                  <div>Delivery Services & Logistics</div>
                </div>
                <div className="wb-code">{row.waybill_no}</div>
              </div>

              <div className="wb-grid">
                <div className="wb-box">
                  <h4>Merchant</h4>
                  <strong>{row.merchant_code} {row.merchant_name}</strong>
                  <div>Pickup: {row.pickup_id || row.pickup_way_id}</div>
                </div>

                <div className="wb-box">
                  <h4>Receiver</h4>
                  <strong>{row.receiver_name}</strong>
                  <div>{row.receiver_phone}</div>
                </div>
              </div>

              <div className="wb-box">
                <h4>Delivery Address</h4>
                <div className="wb-address">
                  {row.receiver_address}
                  {row.township ? ` · ${row.township}` : ""}
                  {row.city ? ` · ${row.city}` : ""}
                </div>
              </div>

              <div className="wb-footer">
                <div>
                  <div className="wb-cod">COD: {formatMMK(row.cod_amount)} MMK</div>
                  <div>Fee: {formatMMK(row.delivery_fee)} MMK</div>
                  <div>Status: {row.status}</div>
                </div>
                <img className="wb-qr" src={qrUrl(payload)} />
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
