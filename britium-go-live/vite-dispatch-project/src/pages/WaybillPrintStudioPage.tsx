// @ts-nocheck
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { Printer, RefreshCw, Search, Barcode, QrCode } from "lucide-react";

const WAYBILL_SERVICE_NOTICE = "သတ်မှတ်ကျသင့်ဝန်ဆောင်ခထက်ပိုမိုကောက်ခံပါက အထက်ပါ Hotline ဖုန်းနံပါတ် 09897447744 သို့ဆက်သွယ်တိုင်ကြားနိုင်ပါသည်။";

const C = {
  bg: "#061524",
  panel: "#0b2236",
  border: "#1a3a5c",
  text: "#eef8ff",
  sub: "#9cc2d9",
  gold: "#f6b84b",
  red: "#f87171",
};

type PaperSize = "4x6" | "A5" | "A4";
type LabelSize = "4x6" | "4x3" | "2x3";

const PAPER_SIZES: Record<
  PaperSize,
  { label: string; page: string; width: string; height: string }
> = {
  "4x6": {
    label: "4 × 6 inch sheet",
    page: "4in 6in",
    width: "4in",
    height: "6in",
  },
  A5: {
    label: "A5 sheet",
    page: "148mm 210mm",
    width: "148mm",
    height: "210mm",
  },
  A4: {
    label: "A4 sheet",
    page: "210mm 297mm",
    width: "210mm",
    height: "297mm",
  },
};

const LABEL_SIZES: Record<
  LabelSize,
  {
    label: string;
    width: string;
    height: string;
    screenWidth: number;
    screenHeight: number;
  }
> = {
  "4x6": {
    label: "4 × 6 main sticker",
    width: "4in",
    height: "6in",
    screenWidth: 384,
    screenHeight: 576,
  },
  "4x3": {
    label: "4 × 3 half sticker",
    width: "4in",
    height: "3in",
    screenWidth: 384,
    screenHeight: 288,
  },
  "2x3": {
    label: "2 × 3 small sticker",
    width: "2in",
    height: "3in",
    screenWidth: 192,
    screenHeight: 288,
  },
};

type PrintLayout = {
  columns: number;
  rows: number;
  perPage: number;
};

const PRINT_LAYOUTS: Record<
  PaperSize,
  Record<LabelSize, PrintLayout>
> = {
  "4x6": {
    "4x6": { columns: 1, rows: 1, perPage: 1 },
    "4x3": { columns: 1, rows: 2, perPage: 2 },
    "2x3": { columns: 2, rows: 2, perPage: 4 },
  },
  A5: {
    "4x6": { columns: 1, rows: 1, perPage: 1 },
    "4x3": { columns: 1, rows: 2, perPage: 2 },
    "2x3": { columns: 2, rows: 2, perPage: 4 },
  },
  A4: {
    "4x6": { columns: 2, rows: 1, perPage: 2 },
    "4x3": { columns: 2, rows: 3, perPage: 6 },
    "2x3": { columns: 4, rows: 3, perPage: 12 },
  },
};

function chunkRows<T>(rows: T[], size: number): T[][] {
  const pages: T[][] = [];

  for (let index = 0; index < rows.length; index += size) {
    pages.push(rows.slice(index, index + size));
  }

  return pages;
}

function first(row: any, keys: string[], fallback = "") {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() && String(v).toLowerCase() !== "null") {
      return String(v).trim();
    }
  }
  return fallback;
}

function money(v: any) {
  return Number(v || 0).toLocaleString();
}

function waybillNo(row: any) {
  return first(row, [
    "waybill_no",
    "waybill_number",
    "tracking_no",
    "delivery_way_id",
    "delivery_waybill_id",
    "pickup_way_id",
    "pickup_id",
  ], "UNASSIGNED");
}

function qrSrc(value: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(value)}`;
}

function barcodeSrc(value: string) {
  return `https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(value)}&code=Code128&translate-esc=on&imagetype=Png&dpi=96`;
}

function cleanRemark(row: any) {
  const v = first(row, [
    "remarks",
    "remark",
    "customer_remark",
    "customer_remarks",
    "delivery_remark",
    "delivery_remarks",
    "special_instruction",
    "special_instructions",
    "notes",
    "note",
  ]);

  const text = String(v || "").trim();

  if (!text) return WAYBILL_SERVICE_NOTICE;
  if (text.toLowerCase().includes("rider photo verified")) return WAYBILL_SERVICE_NOTICE;
  if (text.includes("Rider Photo Verified")) return WAYBILL_SERVICE_NOTICE;

  return text;
}

function normalizeRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.waybills)) return payload.waybills;
  return [];
}

async function waitForPrintAssets(root: HTMLElement) {
  await document.fonts?.ready.catch(() => undefined);

  const images = Array.from(root.querySelectorAll("img"));

  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }

          const finish = () => resolve();

          image.addEventListener("load", finish, {
            once: true,
          });

          image.addEventListener("error", finish, {
            once: true,
          });

          window.setTimeout(finish, 8000);
        }),
    ),
  );

  fitAllLabels(root);

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function fitLabelElement(frame: HTMLElement | null) {
  if (!frame) return;

  const content = frame.querySelector(
    ".waybill-label-content",
  ) as HTMLElement | null;

  if (!content) return;

  content.style.transform = "scale(1)";

  const computed = window.getComputedStyle(frame);

  const availableWidth =
    frame.clientWidth -
    parseFloat(computed.paddingLeft || "0") -
    parseFloat(computed.paddingRight || "0");

  const availableHeight =
    frame.clientHeight -
    parseFloat(computed.paddingTop || "0") -
    parseFloat(computed.paddingBottom || "0");

  const requiredWidth = Math.max(
    content.scrollWidth,
    content.offsetWidth,
  );

  const requiredHeight = Math.max(
    content.scrollHeight,
    content.offsetHeight,
  );

  const scale = Math.min(
    1,
    availableWidth / Math.max(requiredWidth, 1),
    availableHeight / Math.max(requiredHeight, 1),
  );

  content.style.transform = `scale(${Math.max(
    0.1,
    scale * 0.985,
  )})`;
}

function fitAllLabels(root?: HTMLElement | null) {
  const scope = root || document;

  scope
    .querySelectorAll<HTMLElement>(".waybill-label")
    .forEach((label) => fitLabelElement(label));
}

function AutoFitLabel({
  children,
  labelSize,
  style,
}: {
  children: React.ReactNode;
  labelSize: LabelSize;
  style: React.CSSProperties;
}) {
  const frameRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    let animationFrame = 0;

    const fit = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        fitLabelElement(frame);
      });
    };

    fit();

    const observer = new ResizeObserver(fit);
    observer.observe(frame);

    const images = Array.from(
      frame.querySelectorAll("img"),
    );

    images.forEach((image) => {
      image.addEventListener("load", fit);
      image.addEventListener("error", fit);
    });

    document.fonts?.ready.then(fit).catch(() => undefined);
    window.addEventListener("beforeprint", fit);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();

      images.forEach((image) => {
        image.removeEventListener("load", fit);
        image.removeEventListener("error", fit);
      });

      window.removeEventListener("beforeprint", fit);
    };
  }, [labelSize, children]);

  return (
    <div
      ref={frameRef}
      className="waybill-label"
      style={style}
    >
      <div
        className="waybill-label-content"
        style={{
          width: "100%",
          transformOrigin: "top left",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function WaybillLabel({
  row,
  labelSize,
}: {
  row: any;
  labelSize: LabelSize;
}) {
  const wb = waybillNo(row);

  const merchant = first(
    row,
    ["merchant_name", "merchant", "merchant_code"],
    "-",
  );

  const recipient = first(
    row,
    [
      "recipient_name",
      "receiver_name",
      "receiver",
      "customer_name",
    ],
    "-",
  );

  const phone = first(
    row,
    [
      "recipient_phone",
      "receiver_phone",
      "phone",
      "customer_phone",
    ],
    "-",
  );

  const address = first(
    row,
    [
      "recipient_address",
      "delivery_address",
      "address",
      "township",
    ],
    "-",
  );

  const itemPrice = Number(
    first(
      row,
      ["item_price", "item_value", "cod_amount", "cod"],
      "0",
    ),
  );

  const fee = Number(
    first(
      row,
      ["delivery_fee", "delivery_charges", "deli_fee", "fee"],
      "0",
    ),
  );

  const prepaid = Number(
    first(
      row,
      ["prepaid_amount", "prepaid"],
      "0",
    ),
  );

  const cod = Number(
    first(
      row,
      ["actual_collect", "final_cod", "cod_amount", "cod"],
      "0",
    ),
  );

  const remark = cleanRemark(row);
  const labelSpec = LABEL_SIZES[labelSize];

  const small = labelSize === "2x3";
  const half = labelSize === "4x3";

  const baseFont = small ? 8 : half ? 10 : 13;
  const detailFont = small ? 7 : half ? 9 : 12;
  const spacing = small ? 3 : half ? 5 : 7;
  const qrSize = small ? 36 : half ? 48 : 58;
  const barcodeHeight = small ? 25 : half ? 34 : 42;

  return (
    <AutoFitLabel
      labelSize={labelSize}
      style={{
        width: labelSpec.screenWidth,
        height: labelSpec.screenHeight,
        background: "#ffffff",
        color: "#000000",
        padding: small ? 5 : half ? 7 : 10,
        fontFamily:
          "'Pyidaungsu','Noto Sans Myanmar','Myanmar Text',Arial,sans-serif",
        border: "1px solid #222222",
        boxSizing: "border-box",
        overflow: "hidden",
        fontSize: baseFont,
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: spacing,
          borderBottom: "1px solid #444",
          paddingBottom: spacing,
        }}
      >
        <div>
          <div
            style={{
              fontWeight: 900,
              fontSize: small ? 10 : half ? 12 : 15,
            }}
          >
            BRITIUM EXPRESS
          </div>

          <div style={{ fontSize: detailFont }}>
            DELIVERY SERVICE
          </div>

          <div style={{ fontSize: detailFont }}>
            Hotline: 09 - 897 44 77 44
          </div>
        </div>

        <img
          src={qrSrc(wb)}
          alt={`QR ${wb}`}
          style={{
            width: qrSize,
            height: qrSize,
            flexShrink: 0,
            objectFit: "contain",
          }}
        />
      </header>

      <div
        style={{
          textAlign: "center",
          padding: `${spacing}px 0`,
        }}
      >
        <img
          src={barcodeSrc(wb)}
          alt={`Barcode ${wb}`}
          style={{
            display: "block",
            width: "100%",
            maxWidth: small ? 155 : half ? 250 : 285,
            height: barcodeHeight,
            margin: "0 auto",
            objectFit: "contain",
          }}
        />

        <div
          style={{
            fontSize: small ? 8 : half ? 10 : 12,
            fontWeight: 900,
            letterSpacing: small ? 0.2 : 1,
          }}
        >
          {wb}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: small
            ? "1fr"
            : "minmax(0,1.25fr) minmax(0,0.8fr)",
          gap: spacing,
          borderTop: "1px solid #444",
          paddingTop: spacing,
        }}
      >
        <div
          style={{
            minWidth: 0,
            fontSize: baseFont,
            lineHeight: small ? 1.15 : 1.35,
          }}
        >
          <div>
            <b>Merchant:</b> {merchant}
          </div>

          <div>
            <b>Recipient:</b> {recipient}
          </div>

          <div>
            <b>Phone:</b> {phone}
          </div>

          <div
            style={{
              marginTop: spacing,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              wordBreak: "break-word",
            }}
          >
            {address}
          </div>
        </div>

        <div
          style={{
            minWidth: 0,
            borderLeft: small
              ? "none"
              : "1px solid #444",
            borderTop: small
              ? "1px solid #444"
              : "none",
            paddingLeft: small ? 0 : spacing,
            paddingTop: small ? spacing : 0,
            fontSize: baseFont,
            lineHeight: small ? 1.15 : 1.4,
          }}
        >
          <div style={{ display: "flex", gap: 4 }}>
            <b style={{ flex: 1 }}>Item Price:</b>
            <span>{money(itemPrice)}</span>
          </div>

          <div style={{ display: "flex", gap: 4 }}>
            <b style={{ flex: 1 }}>Deli Fee:</b>
            <span>{money(fee)}</span>
          </div>

          <div style={{ display: "flex", gap: 4 }}>
            <b style={{ flex: 1 }}>Prepaid:</b>
            <span>{money(prepaid)}</span>
          </div>

          <div
            style={{
              marginTop: spacing,
              border: "1px solid #777",
              padding: small ? 3 : 5,
              fontWeight: 900,
              display: "flex",
              justifyContent: "space-between",
              gap: 5,
            }}
          >
            <span>COD</span>
            <span>{money(cod || Math.max(itemPrice + fee - prepaid, 0))}</span>
          </div>
        </div>
      </div>

      <footer
        style={{
          borderTop: "1px solid #444",
          marginTop: spacing,
          paddingTop: spacing,
          fontSize: detailFont,
          lineHeight: 1.2,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        <b>Remarks:</b> {remark || WAYBILL_SERVICE_NOTICE}
      </footer>
    </AutoFitLabel>
  );
}

export default function WaybillPrintStudioPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [paperSize, setPaperSize] =
    useState<PaperSize>("4x6");
  const [labelSize, setLabelSize] =
    useState<LabelSize>("4x6");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const args: any = {};
      if (date) args.p_date = date;

      let res = await supabase.rpc("be_get_waybill_print_queue", args);
      if (res.error) {
        res = await supabase.rpc("be_get_waybill_print_queue");
      }
      if (res.error) throw res.error;

      const next = normalizeRows(res.data);
      setRows(next);
      const picked: Record<string, boolean> = {};
      next.forEach((r) => { picked[waybillNo(r)] = true; });
      setSelected(picked);
    } catch (e: any) {
      setErr(e?.message || "Failed to load waybill print queue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!q) return true;
      return JSON.stringify(r).toLowerCase().includes(q);
    });
  }, [rows, query]);

  const printable = filtered.filter(
    (r) => selected[waybillNo(r)],
  );

  const labelSpec = LABEL_SIZES[labelSize];
  const paperSpec = PAPER_SIZES[paperSize];

  const printLayout = PRINT_LAYOUTS[paperSize][labelSize];

  const printPages = useMemo(
    () => chunkRows(printable, printLayout.perPage),
    [printable, printLayout.perPage],
  );

  function selectAll() {
    const next = { ...selected };
    filtered.forEach((r) => { next[waybillNo(r)] = true; });
    setSelected(next);
  }

  function clearAll() {
    const next = { ...selected };
    filtered.forEach((r) => { next[waybillNo(r)] = false; });
    setSelected(next);
  }

  async function printNow() {
    setErr("");

    if (printable.length === 0) {
      setErr("Select at least one Waybill before printing.");
      return;
    }

    const root = document.getElementById(
      "waybill-print-area",
    );

    if (!root) {
      setErr("Waybill print area could not be prepared.");
      return;
    }

    await waitForPrintAssets(root);
    window.print();
  }

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20, overflow: "auto" }}>
      <style>{`
        #waybill-print-area .print-grid {
          align-items: start;
        }

        #waybill-print-area .waybill-label {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        @media print {
          @page {
            size: ${paperSpec.page};
            margin: 0;
          }

          html,
          body,
          #root {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
          }

          body * {
            visibility: hidden !important;
          }

          #waybill-print-area,
          #waybill-print-area * {
            visibility: visible !important;
          }

          #waybill-print-area {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: auto !important;
            background: #ffffff !important;
          }

          .no-print {
            display: none !important;
          }

          .print-sheet {
            width: ${paperSpec.width} !important;
            height: ${paperSpec.height} !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #ffffff !important;
            break-after: page !important;
            page-break-after: always !important;
          }

          .print-sheet:last-child {
            break-after: auto !important;
            page-break-after: auto !important;
          }

          .print-grid {
            display: grid !important;
            grid-template-columns:
              repeat(${printLayout.columns}, ${labelSpec.width}) !important;
            grid-template-rows:
              repeat(${printLayout.rows}, ${labelSpec.height}) !important;
            grid-auto-flow: row !important;
            gap: 0 !important;
            width: max-content !important;
            height: max-content !important;
            align-content: start !important;
            justify-content: start !important;
          }

          .waybill-label {
            width: ${labelSpec.width} !important;
            height: ${labelSpec.height} !important;
            max-width: ${labelSpec.width} !important;
            max-height: ${labelSpec.height} !important;
            margin: 0 !important;
            box-shadow: none !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      <section className="no-print" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 22, padding: 20, marginBottom: 16 }}>
        <div style={{ color: C.gold, fontWeight: 900, letterSpacing: "0.22em", fontSize: 12 }}>WAYBILL PRINT STUDIO</div>
        <h1 style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0" }}>
          <Barcode size={24} /> Live Waybill Print Studio
        </h1>
        <p style={{ color: C.sub, margin: 0 }}>
          Prints Code128 barcode, QR code, live recipient data, COD, delivery fee, and correct remarks.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button onClick={load} disabled={loading} style={{ background: C.gold, border: 0, borderRadius: 12, padding: "10px 14px", fontWeight: 900 }}>
            <RefreshCw size={15} /> {loading ? "Loading..." : "Refresh"}
          </button>

          <button
            onClick={() => void printNow()}
            style={{
              background: C.gold,
              border: 0,
              borderRadius: 12,
              padding: "10px 14px",
              fontWeight: 900,
            }}>
            <Printer size={15} /> Print Selected
          </button>

          <button onClick={selectAll} style={{ background: C.panel, color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", fontWeight: 800 }}>
            Select All Visible
          </button>
          <button onClick={clearAll} style={{ background: C.panel, color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", fontWeight: 800 }}>
            Clear
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
            marginTop: 14,
          }}
        >
          <label
            style={{
              display: "grid",
              gap: 6,
              color: C.sub,
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            PRINT DOCUMENT SIZE
            <select
              value={paperSize}
              onChange={(event) =>
                setPaperSize(
                  event.target.value as PaperSize,
                )
              }
              style={{
                padding: "11px 12px",
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: C.bg,
                color: C.text,
                fontWeight: 800,
              }}
            >
              {Object.entries(PAPER_SIZES).map(
                ([value, option]) => (
                  <option key={value} value={value}>
                    {option.label}
                  </option>
                ),
              )}
            </select>
          </label>

          <label
            style={{
              display: "grid",
              gap: 6,
              color: C.sub,
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            PRINTING / LABEL SIZE
            <select
              value={labelSize}
              onChange={(event) =>
                setLabelSize(
                  event.target.value as LabelSize,
                )
              }
              style={{
                padding: "11px 12px",
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: C.bg,
                color: C.text,
                fontWeight: 800,
              }}
            >
              {Object.entries(LABEL_SIZES).map(
                ([value, option]) => (
                  <option key={value} value={value}>
                    {option.label}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <div style={{ position: "relative", minWidth: 280, flex: 1 }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: C.sub }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search waybill, merchant, recipient, phone..."
              style={{ width: "100%", padding: "11px 12px 11px 36px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}
            />
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ padding: "11px 12px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}
          />
        </div>

        {err && <div style={{ marginTop: 12, color: C.red }}>{err}</div>}
        <div style={{ marginTop: 12, color: C.sub }}>{printable.length} selected / {filtered.length} visible / {rows.length} loaded</div>
      </section>

      <section className="no-print" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, marginBottom: 16 }}>
        {filtered.map((r) => {
          const wb = waybillNo(r);
          return (
            <label key={wb} style={{ background: C.panel, border: `1px solid ${selected[wb] ? C.gold : C.border}`, borderRadius: 14, padding: 12, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!selected[wb]}
                onChange={(e) => setSelected((x) => ({ ...x, [wb]: e.target.checked }))}
                style={{ marginRight: 8 }}
              />
              <b style={{ color: C.gold }}>{wb}</b>
              <div style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>
                {first(r, ["merchant_name", "merchant", "merchant_code"], "-")} → {first(r, ["recipient_name", "receiver_name", "receiver"], "-")}
              </div>
            </label>
          );
        })}
      </section>

      <section
        id="waybill-print-area"
        data-paper-size={paperSize}
        data-label-size={labelSize}
        style={{
          display: "grid",
          gap: 24,
          justifyContent: "start",
        }}>
        {printPages.map((pageRows, pageIndex) => (
          <div
            key={`page-${pageIndex}`}
            className="print-sheet"
            style={{
              width: paperSpec.width,
              height: paperSpec.height,
              overflow: "hidden",
              background: "#ffffff",
              boxSizing: "border-box",
            }}
          >
            <div
              className="print-grid"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${printLayout.columns}, ${labelSpec.width})`,
                gridTemplateRows: `repeat(${printLayout.rows}, ${labelSpec.height})`,
                gap: 0,
                alignContent: "start",
                justifyContent: "start",
              }}
            >
              {pageRows.map((row) => (
                <WaybillLabel
                  key={waybillNo(row)}
                  row={row}
                  labelSize={labelSize}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}