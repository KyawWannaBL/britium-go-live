import { FileText, Printer, QrCode } from "lucide-react";

type WaybillRow = {
  waybill: string;
  deliveryWay: string;
  pickup: string;
  merchant: string;
  recipient: string;
  township: string;
  deliveryFee: string;
  cod: string;
  warehouse: string;
  status: string;
};

function clean(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function qrUrl(payload: string, size = 140) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
}

function readWaybillRowsFromDom(): WaybillRow[] {
  const tables = Array.from(document.querySelectorAll("table"));
  const table =
    tables.find((node) => clean(node.textContent).toLowerCase().includes("waybill")) ||
    tables[0];

  if (!table) return [];

  const headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
    clean(th.textContent).toLowerCase(),
  );

  const bodyRows = Array.from(table.querySelectorAll("tbody tr"));

  function idx(...names: string[]) {
    return headers.findIndex((header) => names.some((name) => header.includes(name)));
  }

  const map = {
    waybill: idx("waybill"),
    deliveryWay: idx("deliveryway", "delivery way"),
    pickup: idx("pickup"),
    merchant: idx("merchant"),
    recipient: idx("recipient"),
    township: idx("township"),
    deliveryFee: idx("delivery fee", "fee"),
    cod: idx("cod"),
    warehouse: idx("warehouse"),
    status: idx("status"),
  };

  function cell(cells: string[], key: keyof typeof map, fallback: number) {
    const i = map[key] >= 0 ? map[key] : fallback;
    return clean(cells[i]);
  }

  return bodyRows
    .map((row) => {
      const cells = Array.from(row.querySelectorAll("td")).map((td) => clean(td.textContent));

      return {
        waybill: cell(cells, "waybill", 0),
        deliveryWay: cell(cells, "deliveryWay", 1),
        pickup: cell(cells, "pickup", 2),
        merchant: cell(cells, "merchant", 3),
        recipient: cell(cells, "recipient", 4),
        township: cell(cells, "township", 5),
        deliveryFee: cell(cells, "deliveryFee", 6),
        cod: cell(cells, "cod", 7),
        warehouse: cell(cells, "warehouse", 8),
        status: cell(cells, "status", 9),
      };
    })
    .filter((row) => row.waybill || row.deliveryWay || row.pickup);
}

function printHtml(title: string, body: string) {
  const html = `
    <!doctype html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 24px;
            font-family: Arial, sans-serif;
            color: #111827;
            background: #ffffff;
          }
          .print-head {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            border-bottom: 2px solid #111827;
            padding-bottom: 12px;
            margin-bottom: 18px;
          }
          .brand {
            font-size: 20px;
            font-weight: 900;
            letter-spacing: 0.08em;
          }
          .sub {
            font-size: 12px;
            color: #4b5563;
            margin-top: 4px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
          }
          th, td {
            border: 1px solid #d1d5db;
            padding: 7px;
            text-align: left;
            vertical-align: top;
          }
          th {
            background: #f3f4f6;
            font-weight: 900;
          }
          .label-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
          }
          .label {
            border: 2px solid #111827;
            border-radius: 10px;
            padding: 12px;
            min-height: 230px;
            page-break-inside: avoid;
          }
          .label-top {
            display: flex;
            justify-content: space-between;
            gap: 12px;
          }
          .label-title {
            font-size: 18px;
            font-weight: 900;
          }
          .label-code {
            font-size: 13px;
            color: #374151;
            margin-top: 4px;
          }
          .qr {
            width: 112px;
            height: 112px;
          }
          .label-meta {
            margin-top: 10px;
            font-size: 12px;
            line-height: 1.55;
          }
          @page { size: A4; margin: 10mm; }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>${body}</body>
    </html>
  `;

  const oldFrame = document.getElementById("waybill-print-frame");
  if (oldFrame) oldFrame.remove();

  const frame = document.createElement("iframe");
  frame.id = "waybill-print-frame";
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";

  document.body.appendChild(frame);

  const doc = frame.contentWindow?.document;
  if (!doc) {
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 500);
    }
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  }, 700);
}

function manifestHtml(rows: WaybillRow[]) {
  return `
    <div class="print-head">
      <div>
        <div class="brand">BRITIUM EXPRESS</div>
        <div class="sub">Waybill Studio Manifest</div>
      </div>
      <div class="sub">
        Printed: ${new Date().toLocaleString()}<br/>
        Rows: ${rows.length}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Waybill</th>
          <th>DeliveryWay</th>
          <th>Pickup</th>
          <th>Merchant</th>
          <th>Recipient</th>
          <th>Township</th>
          <th>Delivery Fee</th>
          <th>COD</th>
          <th>Warehouse</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                <td>${row.waybill}</td>
                <td>${row.deliveryWay}</td>
                <td>${row.pickup}</td>
                <td>${row.merchant}</td>
                <td>${row.recipient}</td>
                <td>${row.township}</td>
                <td>${row.deliveryFee}</td>
                <td>${row.cod}</td>
                <td>${row.warehouse}</td>
                <td>${row.status}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function labelHtml(rows: WaybillRow[]) {
  return `
    <div class="print-head">
      <div>
        <div class="brand">BRITIUM EXPRESS</div>
        <div class="sub">Waybill / DeliveryWay Labels</div>
      </div>
      <div class="sub">
        Printed: ${new Date().toLocaleString()}<br/>
        Labels: ${rows.length}
      </div>
    </div>

    <div class="label-grid">
      ${rows
        .map((row) => {
          const payload = JSON.stringify({
            type: "BRITIUM_WAYBILL_LABEL",
            waybill_no: row.waybill,
            delivery_way_id: row.deliveryWay,
            pickup_id: row.pickup,
            recipient: row.recipient,
            generated_at: new Date().toISOString(),
          });

          return `
            <div class="label">
              <div class="label-top">
                <div>
                  <div class="label-title">${row.waybill || row.deliveryWay}</div>
                  <div class="label-code">${row.deliveryWay}</div>
                  <div class="label-code">Pickup: ${row.pickup}</div>
                </div>
                <img class="qr" src="${qrUrl(payload, 140)}" />
              </div>

              <div class="label-meta">
                <strong>Merchant:</strong> ${row.merchant || "-"}<br/>
                <strong>Recipient:</strong> ${row.recipient || "-"}<br/>
                <strong>Township:</strong> ${row.township || "-"}<br/>
                <strong>Delivery Fee:</strong> ${row.deliveryFee || "-"}<br/>
                <strong>COD:</strong> ${row.cod || "-"}<br/>
                <strong>Status:</strong> ${row.status || "-"}
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

export default function WaybillStudioPrintPanel() {
  function getRowsOrAlert() {
    const rows = readWaybillRowsFromDom();

    if (!rows.length) {
      alert("No visible waybill rows found. Click Refresh View first, then try printing.");
      return [];
    }

    return rows;
  }

  return (
    <div
      data-print-hide="true"
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        justifyContent: "flex-end",
        marginTop: 16,
      }}
    >
      <button
        type="button"
        onClick={() => window.print()}
        style={buttonStyle("#102b45", "#eef8ff", "#1a3a5c")}
      >
        <Printer size={16} />
        Print View
      </button>

      <button
        type="button"
        onClick={() => {
          const rows = getRowsOrAlert();
          if (rows.length) printHtml("Britium Waybill Manifest", manifestHtml(rows));
        }}
        style={buttonStyle("#f6b84b", "#061524", "#f6b84b")}
      >
        <FileText size={16} />
        Print Manifest
      </button>

      <button
        type="button"
        onClick={() => {
          const rows = getRowsOrAlert();
          if (rows.length) printHtml("Britium Waybill Labels", labelHtml(rows));
        }}
        style={buttonStyle("#38bdf8", "#061524", "#38bdf8")}
      >
        <QrCode size={16} />
        Print Labels
      </button>
    </div>
  );
}

function buttonStyle(bg: string, color: string, border: string): React.CSSProperties {
  return {
    border: `1px solid ${border}`,
    background: bg,
    color,
    borderRadius: 14,
    padding: "12px 16px",
    fontWeight: 900,
    fontSize: 13,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 16px 40px rgba(0,0,0,0.3)",
  };
}
