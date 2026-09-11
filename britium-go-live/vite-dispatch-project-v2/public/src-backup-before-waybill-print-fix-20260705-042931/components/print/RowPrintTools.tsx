import { useEffect } from "react";

type RowPrintToolsProps = {
  pageType: "waybill" | "invoice";
  size: string;
};

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function pageCss(size: string) {
  const map: Record<string, string> = {
    "a4-portrait": "size: A4 portrait;",
    "a4-landscape": "size: A4 landscape;",
    "a5": "size: A5 portrait;",
    "sticker-100x150": "size: 100mm 150mm;",
    "label-4x6": "size: 4in 6in;",
    "thermal-80": "size: 80mm auto;",
  };

  return `
    @page { ${map[size] || map["a4-portrait"]} margin: 8mm; }
    body { font-family: Inter, Arial, sans-serif; color: #061524; margin: 0; padding: 12px; background: white; }
    .print-title { font-size: 15px; font-weight: 800; margin-bottom: 10px; letter-spacing: .08em; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    th, td { border: 1px solid #222; padding: 6px; font-size: 10px; word-break: break-word; vertical-align: top; }
    th { background: #f2f2f2; font-weight: 800; }
    .row-print-action-col, .be-row-print-cell, .be-row-print-head { display: none !important; }
    @media print {
      .no-print { display: none !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}

function openPrintWindow(html: string, pageType: string, size: string) {
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) {
    alert("Popup blocked. Please allow popups for this site.");
    return;
  }
  w.document.open();
  w.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${pageType.toUpperCase()} PRINT</title>
        <style>${pageCss(size)}</style>
      </head>
      <body>
        ${html}
        <script>
          window.onload = function() {
            setTimeout(function(){ window.focus(); window.print(); }, 250);
          };
        <\/script>
      </body>
    </html>
  `);
  w.document.close();
}

function cloneTableForRow(row: HTMLTableRowElement, pageType: string) {
  const table = row.closest("table");
  const head = table?.querySelector("thead")?.cloneNode(true) as HTMLElement | null;
  const clonedRow = row.cloneNode(true) as HTMLTableRowElement;

  clonedRow.querySelectorAll(".be-row-print-cell,.row-print-action-col,.be-row-print-head").forEach((n) => n.remove());
  head?.querySelectorAll(".be-row-print-cell,.row-print-action-col,.be-row-print-head").forEach((n) => n.remove());

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `<div class="print-title">BRITIUM EXPRESS — ${escapeHtml(pageType.toUpperCase())}</div>`;
  const outTable = document.createElement("table");
  if (head) outTable.appendChild(head);
  const body = document.createElement("tbody");
  body.appendChild(clonedRow);
  outTable.appendChild(body);
  wrapper.appendChild(outTable);
  return wrapper.outerHTML;
}

function cloneAllTables(pageType: string) {
  const content = document.querySelector("[data-print-studio-content]") || document.querySelector("main") || document.body;
  const clone = content.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("button,select,input,.no-print,.be-row-print-cell,.row-print-action-col,.be-row-print-head").forEach((n) => n.remove());
  return `<div class="print-title">BRITIUM EXPRESS — ${escapeHtml(pageType.toUpperCase())} BATCH</div>${clone.innerHTML}`;
}

export function printStudioAll(pageType: "waybill" | "invoice", size: string) {
  openPrintWindow(cloneAllTables(pageType), pageType, size);
}

export default function RowPrintTools({ pageType, size }: RowPrintToolsProps) {
  useEffect(() => {
    const addButtons = () => {
      const root = document.querySelector("[data-print-studio-content]") || document;
      const tables = Array.from(root.querySelectorAll("table"));
      tables.forEach((table) => {
        if ((table as HTMLElement).dataset.rowPrintBound === "true") return;
        const rows = Array.from(table.querySelectorAll("tbody tr")) as HTMLTableRowElement[];
        if (rows.length === 0) return;

        (table as HTMLElement).dataset.rowPrintBound = "true";

        const headerRow = table.querySelector("thead tr");
        if (headerRow && !headerRow.querySelector(".be-row-print-head")) {
          const th = document.createElement("th");
          th.className = "be-row-print-head no-print";
          th.textContent = "PRINT";
          th.style.minWidth = "160px";
          th.style.position = "sticky";
          th.style.right = "0";
          th.style.background = "#0b2236";
          th.style.color = "#f6b84b";
          th.style.zIndex = "5";
          headerRow.appendChild(th);
        }

        rows.forEach((row, idx) => {
          if (row.querySelector(".be-row-print-cell")) return;
          const td = document.createElement("td");
          td.className = "be-row-print-cell no-print";
          td.style.position = "sticky";
          td.style.right = "0";
          td.style.background = "#071a2b";
          td.style.zIndex = "4";
          td.innerHTML = `
            <div style="display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap">
              <button type="button" class="be-row-print-one">Print</button>
              <button type="button" class="be-row-pdf-one">PDF</button>
            </div>
          `;
          row.appendChild(td);

          const printBtn = td.querySelector(".be-row-print-one") as HTMLButtonElement | null;
          const pdfBtn = td.querySelector(".be-row-pdf-one") as HTMLButtonElement | null;

          [printBtn, pdfBtn].forEach((btn) => {
            if (!btn) return;
            btn.style.border = "1px solid #1a3a5c";
            btn.style.borderRadius = "8px";
            btn.style.padding = "6px 10px";
            btn.style.fontSize = "11px";
            btn.style.fontWeight = "800";
            btn.style.cursor = "pointer";
            btn.style.background = btn === printBtn ? "#f6b84b" : "#102b44";
            btn.style.color = btn === printBtn ? "#061524" : "#eef8ff";
          });

          printBtn?.addEventListener("click", () => openPrintWindow(cloneTableForRow(row, `${pageType} #${idx + 1}`), pageType, size));
          pdfBtn?.addEventListener("click", () => openPrintWindow(cloneTableForRow(row, `${pageType} PDF #${idx + 1}`), pageType, size));
        });
      });
    };

    addButtons();
    const id = window.setInterval(addButtons, 1200);
    return () => window.clearInterval(id);
  }, [pageType, size]);

  return null;
}
