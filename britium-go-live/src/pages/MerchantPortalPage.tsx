import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Barcode, Calculator, CircleHelp, Download, LayoutDashboard, Package, RefreshCw, Search, Truck, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import SettlementReceiptLink from "@/components/SettlementReceiptLink";

const tabs = [
  { key: "overview", title: "Overview", icon: LayoutDashboard },
  { key: "pickups", title: "Pickups", icon: Truck },
  { key: "shipments", title: "Shipments", icon: Package },
  { key: "tracking", title: "Tracking & waybills", icon: Barcode },
  { key: "statements", title: "COD & statements", icon: Wallet },
  { key: "rates", title: "Rate calculator", icon: Calculator },
  { key: "support", title: "Support", icon: CircleHelp },
] as const;

type Tab = typeof tabs[number]["key"];
type RecordRow = Record<string, string | number | boolean | null | undefined>;
type ShipmentDraft = Pick<Record<string, string>, typeof shipmentFields[number][0]>;
type Snapshot = {
  merchant_code: string;
  merchant_name: string;
  pickups: RecordRow[];
  shipments: RecordRow[];
  settlements: RecordRow[];
  payments: RecordRow[];
  wallet: RecordRow;
  tickets: RecordRow[];
};
type Tracking = { shipment: RecordRow | null; events: RecordRow[] };
type Quote = { available: boolean; fee?: number; provider?: string; township?: string };

const panel = "rounded-2xl border border-[#dce6ef] bg-white p-5 shadow-sm sm:p-6";
const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#c9d7e5] bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#e9be55] px-4 py-2 text-sm font-bold text-[#10213a] hover:bg-[#f1cd77] disabled:opacity-50";
const input = "min-h-10 w-full rounded-lg border border-[#bfcfde] bg-white px-3 py-2 text-sm text-[#10213a] outline-offset-2";
const money = (value: unknown) => value == null || value === "" ? "—" : Number(value).toLocaleString("en-MM") + " MMK";
const date = (value: unknown) => value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Yangon" }).format(new Date(String(value))) : "—";
const dateTime = (value: unknown) => value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Yangon" }).format(new Date(String(value))) : "—";
const statusText = (value: unknown) => value ? String(value).replaceAll("_", " ").toLowerCase().replace(/^./, letter => letter.toUpperCase()) : "—";
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Yangon" }).format(new Date());
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Britium could not complete the request. Try again.";

const shipmentFields = [
  ["recipient_name", "Recipient name", "text", 150],
  ["recipient_phone", "Recipient phone", "tel", 30],
  ["township", "Destination township", "text", 100],
  ["delivery_address", "Delivery address", "text", 500],
  ["weight_kg", "Weight (kg)", "number", undefined],
  ["cod_amount", "Exact amount to collect (MMK)", "number", undefined],
] as const;
const shipmentsPerPage = 10;
const blankShipment = (): ShipmentDraft => ({
  recipient_name: "", recipient_phone: "", township: "", delivery_address: "", weight_kg: "", cod_amount: "",
});

async function merchantCall<T>(action: string, payload: object = {}): Promise<T> {
  const { data, error } = await supabase.rpc("be_merchant_portal_workflow", { p_action: action, p_payload: payload });
  if (error) throw new Error(error.message);
  return data as T;
}

function shipmentStatus(row: RecordRow) {
  if (row.last_return_scanned_at) return "Returned";
  if (row.provider_outcome) return statusText(row.provider_outcome);
  if (row.delivered_at) return "Delivered";
  const states = [row.rider_status, row.dispatch_status, row.warehouse_status, row.status];
  const current = states.find(value => value && !/^(pending|not_assigned|waiting)/i.test(String(value)));
  return statusText(current || states.find(Boolean));
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-[#28425e]">{label}{children}</label>;
}

type Column = { title: string; value: (row: RecordRow) => ReactNode };
const column = (title: string, key: string, format: (v: unknown) => ReactNode = value => String(value ?? "—")): Column =>
  ({ title, value: row => format(row[key]) });

function Records({ columns, rows, empty }: { columns: Column[]; rows: RecordRow[]; empty: string }) {
  if (!rows.length) return <p className="rounded-lg bg-[#f5f8fc] px-4 py-6 text-sm text-[#465f7a]">{empty}</p>;
  return <div className="overflow-x-auto rounded-xl border border-[#dce6ef]" tabIndex={0} aria-label="Scrollable records table">
    <table className="w-full text-left text-sm">
      <thead className="bg-[#eef4f9] text-[#334d68]"><tr>{columns.map(c => <th key={c.title} scope="col" className="px-4 py-3">{c.title}</th>)}</tr></thead>
      <tbody className="divide-y divide-[#e2eaf1]">{rows.map((row, index) =>
        <tr key={String(row.id || row.delivery_way_id || row.pickup_id || row.ticket_id || index)}>
          {columns.map(c => <td key={c.title} className="px-4 py-3">{c.value(row)}</td>)}
        </tr>)}</tbody>
    </table>
  </div>;
}

const pickupColumns = [column("Pickup ID", "pickup_id"), column("Date", "pickup_date", date), column("Time", "pickup_time"),
  column("Parcels", "parcel_count"), column("Address", "pickup_address"), column("Status", "status", statusText)];
const settlementColumns = [column("Batch", "batch_number"), column("Status", "status", statusText),
  column("Payable", "batch_net_payable", money), column("Paid", "paid_amount", money), column("Outstanding", "outstanding_amount", money)];
const paymentColumns = [column("Date", "confirmed_at", date), column("Reference", "payment_reference"),
  column("Method", "payment_method", statusText), column("Amount", "amount", money),
  { title: "Receipt", value: (row: RecordRow) => <span className="font-semibold"><SettlementReceiptLink url={String(row.evidence_url || "")} /></span> }];
const ticketColumns = [column("Subject", "subject"), column("Details", "description"), column("Status", "status", statusText), column("Created", "created_at", date)];

async function exportStatement(snapshot: Snapshot) {
  const xlsx = await import("xlsx");
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([
    ["Batch", "Status", "Payable (MMK)", "Paid (MMK)", "Outstanding (MMK)"],
    ...snapshot.settlements.map(row => [row.batch_number, row.status, row.batch_net_payable, row.paid_amount, row.outstanding_amount]),
  ]), "Settlement batches");
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([
    ["Date", "Reference", "Method", "Amount (MMK)"],
    ...snapshot.payments.map(row => [row.confirmed_at, row.payment_reference, row.payment_method, row.amount]),
  ]), "Confirmed payments");
  xlsx.writeFile(workbook, `Britium-${snapshot.merchant_code}-COD-${today()}.xlsx`);
}

export default function MerchantPortalPage() {
  const [active, setActive] = useState<Tab>("overview");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [reference, setReference] = useState("");
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [drafts, setDrafts] = useState<ShipmentDraft[]>([]);
  const [draftPage, setDraftPage] = useState(0);
  const [showPickup, setShowPickup] = useState(false);
  const pickupToken = useRef("");
  const actionLock = useRef(false);
  const snapshotLock = useRef(false);

  const load = useCallback(async () => {
    if (snapshotLock.current) return;
    snapshotLock.current = true;
    setLoadError("");
    try { setSnapshot(await merchantCall<Snapshot>("snapshot")); }
    catch (error) { setLoadError(errorMessage(error)); }
    finally { setLoading(false); snapshotLock.current = false; }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  function navigate(next: Tab) {
    setActive(next);
    setActionError("");
    setNotice("");
  }

  async function run(action: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setActionError("");
    setNotice("");
    try { await action(); }
    catch (error) { setActionError(errorMessage(error)); }
    finally { actionLock.current = false; setBusy(false); }
  }

  async function findShipment(value: string) {
    setTracking(null);
    setReference(value);
    navigate("tracking");
    await run(async () => setTracking(await merchantCall<Tracking>("track", { reference: value })));
  }

  function startPickup(withShipment: boolean) {
    pickupToken.current = crypto.randomUUID();
    setDrafts(withShipment ? [blankShipment()] : []);
    setDraftPage(0);
    setShowPickup(true);
    navigate("pickups");
  }

  function submitPickup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    void run(async () => {
      const result = await merchantCall<{ pickup_id: string }>("pickup", {
        ...values, parcel_count: drafts.length || values.parcel_count, shipments: drafts, request_token: pickupToken.current,
      });
      setShowPickup(false);
      setDrafts([]);
      setNotice(`Pickup ${result.pickup_id} is in Britium’s assignment queue.`);
      await load();
    });
  }

  async function downloadTemplate() {
    const xlsx = await import("xlsx");
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([shipmentFields.map(([key]) => key)]), "Shipments");
    xlsx.writeFile(workbook, "Britium-Shipment-Template.xlsx");
  }

  async function importShipments(file: File) {
    if (file.size > 5_000_000 || !/\.(xlsx|csv)$/i.test(file.name)) throw new Error("Choose an Excel or CSV file under 5 MB.");
    const xlsx = await import("xlsx");
    const workbook = xlsx.read(await file.arrayBuffer(), { type: "array", sheetRows: 502, raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("The file has no shipment sheet.");
    const rows = xlsx.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false, defval: "" });
    if (!rows.length || rows.length > 500 || shipmentFields.some(([key]) => !Object.prototype.hasOwnProperty.call(rows[0], key))) {
      throw new Error("Use the shipment template and include between 1 and 500 rows.");
    }
    setDrafts(rows.map(row => Object.fromEntries(shipmentFields.map(([key]) => [key, String(row[key]).trim()])) as ShipmentDraft));
    setDraftPage(0);
    setNotice(`${rows.length} shipment rows imported. Review them before submitting.`);
  }

  if (!snapshot) return <div className="rounded-2xl bg-[#102746] p-8 text-white">
    <h1 className="text-2xl font-bold">Britium Merchant Portal</h1>
    <p className="mt-3" role={loadError ? "alert" : "status"}>{loadError || "Loading your merchant account…"}</p>
    {loadError && <button type="button" className={`${primary} mt-4`} onClick={() => void load()}>Retry</button>}
  </div>;

  const shipmentColumns: Column[] = [
    { title: "Delivery Way ID", value: row => <button type="button" disabled={busy} className="font-bold text-[#095785] underline" onClick={() => void findShipment(String(row.delivery_way_id))}>{row.delivery_way_id}</button> },
    column("Recipient", "recipient_name"), column("Township", "township"),
    { title: "Status", value: shipmentStatus }, column("COD", "cod_amount", money), column("Updated", "updated_at", date),
  ];
  const shipments = snapshot.shipments.filter(row => [row.delivery_way_id, row.waybill_no, row.recipient_name, row.township, shipmentStatus(row)]
    .some(value => String(value ?? "").toLowerCase().includes(search.trim().toLowerCase())));
  const lastDraftPage = Math.max(0, Math.ceil(drafts.length / shipmentsPerPage) - 1);
  const visibleDraftPage = Math.min(draftPage, lastDraftPage);
  const draftOffset = visibleDraftPage * shipmentsPerPage;
  const tracked = tracking?.shipment;
  const finished = snapshot.shipments.filter(row => ["Delivered", "Returned"].includes(shipmentStatus(row)));

  return <div data-merchant-portal className="space-y-5 rounded-2xl bg-[#f1f5fa] p-3 text-[#10213a] sm:p-6 print:bg-white print:p-0">
    <style>{`@media print {
      body:has([data-merchant-portal]) [data-be-app-shell],
      body:has([data-merchant-portal]) [data-be-workspace],
      body:has([data-merchant-portal]) [data-be-main],
      body:has([data-merchant-portal]) [data-be-content] { display: block; height: auto; overflow: visible; background: white; padding: 0; }
      body:has([data-merchant-portal]) [data-be-app-shell] > :not([data-be-workspace]),
      body:has([data-merchant-portal]) [data-be-workspace] > :not([data-be-main]) { display: none; }
    }`}</style>
    <p className="hidden text-sm font-semibold print:block">Britium Express · {snapshot.merchant_name} ({snapshot.merchant_code})</p>
    <header className="print:hidden overflow-hidden rounded-2xl bg-gradient-to-br from-[#091a30] via-[#102a49] to-[#1d4868] p-6 text-white sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src="/favicon.ico" alt="" width="46" height="46" className="rounded-lg bg-white" />
          <div><p className="text-sm font-semibold text-[#e9be55]">Britium Express Merchant Portal</p>
            <h1 className="text-2xl font-bold sm:text-3xl">{snapshot.merchant_name}</h1>
            <p className="text-sm text-[#c7d8ec]">{snapshot.merchant_code}</p></div>
        </div>
        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-[#6c86a0] px-3 py-2 text-sm text-white hover:bg-white/10" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Refresh</button>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" disabled={busy} className={primary} onClick={() => startPickup(true)}><Package size={17} /> Create shipment</button>
        <button type="button" disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-[#6c86a0] px-4 py-2 text-sm font-semibold hover:bg-white/10" onClick={() => startPickup(false)}><Truck size={17} /> Request pickup</button>
      </div>
    </header>
    <nav aria-label="Merchant workflows" className="flex gap-2 overflow-x-auto rounded-xl border border-[#dce6ef] bg-white p-2 print:hidden">
      {tabs.map(({ key, title, icon: Icon }) => <button key={key} type="button" onClick={() => navigate(key)}
        aria-current={active === key ? "page" : undefined}
        className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${active === key ? "bg-[#102a49] text-white" : "text-[#36526b] hover:bg-[#edf3f9]"}`}>
        <Icon size={17} />{title}</button>)}
    </nav>
    {(loadError || actionError) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{actionError || loadError}</p>}
    {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">{notice}</p>}

    {active === "overview" && <>
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Merchant summary">
        {[
          ["Recent pickups", snapshot.pickups.length], ["Recent shipments", snapshot.shipments.length],
          ["Delivered or returned", finished.length], ["Outstanding merchant payable", money(snapshot.wallet?.britium_owes)],
        ].map(([label, value]) => <div className={panel} key={label}><h2 className="text-sm font-semibold text-[#465f7a]">{label}</h2><p className="mt-2 text-xl font-bold tabular-nums sm:text-2xl">{value}</p></div>)}
      </section>
      <section className={`${panel} space-y-4`}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Latest shipments</h2><button type="button" className={button} onClick={() => navigate("shipments")}>View shipments</button></div>
        <Records rows={snapshot.shipments.slice(0, 6)} columns={shipmentColumns} empty="Shipments will appear here after Britium registers them." />
      </section>
    </>}

    <div hidden={active !== "pickups"} className="space-y-5">
      {showPickup && <form onSubmit={submitPickup} className={`${panel} grid gap-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{drafts.length ? "Create shipments and request pickup" : "Request a pickup"}</h2>
          <button type="button" className={button} disabled={busy} onClick={() => setShowPickup(false)}>Close form</button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Contact person"><input className={input} name="contact_person" minLength={2} maxLength={100} required /></Field>
          <Field label="Pickup phone"><input className={input} name="phone" type="tel" maxLength={30} required /></Field>
          <Field label="Pickup township"><input className={input} name="township" minLength={2} maxLength={100} required /></Field>
          <Field label="Pickup address"><input className={input} name="pickup_address" minLength={5} maxLength={500} required /></Field>
          <Field label="City"><input className={input} name="city" maxLength={100} required /></Field>
          <Field label="Pickup date"><input className={input} name="pickup_date" type="date" min={today()} defaultValue={today()} required /></Field>
          <Field label="Preferred pickup time"><input className={input} name="pickup_time" type="time" /></Field>
          <Field label="Parcel count"><input className={input} name="parcel_count" type="number" min="1" max="500" key={drafts.length} defaultValue={drafts.length || 1} readOnly={drafts.length > 0} required /></Field>
          <Field label="Pickup instructions"><input className={input} name="special_instructions" maxLength={500} /></Field>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <button type="button" className={button} disabled={busy || drafts.length >= 500} onClick={() => setDrafts(current => [...current, blankShipment()])}>Add shipment</button>
          <button type="button" className={button} disabled={busy} onClick={() => void run(downloadTemplate)}>Download Excel template</button>
          <Field label="Import Excel or CSV"><input className={input} type="file" accept=".xlsx,.csv" disabled={busy} onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void run(() => importShipments(file));
          }} /></Field>
        </div>
        {drafts.length > 0 && <p className="text-sm text-[#465f7a]">Enter 0 if the recipient has already paid. Britium reviews shipment details before issuing waybills.</p>}
        {lastDraftPage > 0 && <div className="flex flex-wrap items-center gap-3 text-sm">
          <button type="button" className={button} disabled={visibleDraftPage === 0} onClick={() => setDraftPage(visibleDraftPage - 1)}>Previous rows</button>
          <span>Rows {draftOffset + 1}–{Math.min(drafts.length, draftOffset + shipmentsPerPage)} of {drafts.length}</span>
          <button type="button" className={button} disabled={visibleDraftPage === lastDraftPage} onClick={() => setDraftPage(visibleDraftPage + 1)}>Next rows</button>
        </div>}
        <div className="grid max-h-[32rem] gap-3 overflow-y-auto">
          {drafts.slice(draftOffset, draftOffset + shipmentsPerPage).map((draft, offset) => {
            const index = draftOffset + offset;
            return <fieldset key={index} className="grid min-w-0 gap-3 rounded-xl border border-[#dce6ef] p-3 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="px-2 text-sm font-bold">Shipment {index + 1}</legend>
            {shipmentFields.map(([key, label, type, maxLength]) => <Field key={key} label={label}>
              <input className={input} type={type} maxLength={maxLength} value={draft[key]} required
                min={key === "weight_kg" ? "0.001" : "0"} max={key === "weight_kg" ? "999.999" : "999999999"} step={key === "weight_kg" ? "0.001" : "1"}
                onChange={event => setDrafts(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: event.target.value } : row))} />
            </Field>)}
            <button type="button" className={`${button} justify-self-start`} disabled={busy} onClick={() => setDrafts(current => current.filter((_, i) => i !== index))}>Remove shipment {index + 1}</button>
          </fieldset>})}
        </div>
        <button type="submit" disabled={busy} className={`${primary} justify-self-start`}>{busy ? "Submitting…" : "Submit pickup request"}</button>
      </form>}
      <section className={`${panel} space-y-4`}><h2 className="text-lg font-bold">Pickup history</h2>
        <Records columns={pickupColumns} rows={snapshot.pickups} empty="There are no pickup requests for this merchant." /></section>
    </div>

    {active === "shipments" && <section className={`${panel} space-y-4`}>
      <h2 className="text-lg font-bold">Recent registered shipments</h2>
      <div className="max-w-md"><Field label="Search recent shipments"><input className={input} value={search} onChange={event => setSearch(event.target.value)} placeholder="Way ID, recipient, township or status" /></Field></div>
      <Records rows={shipments} columns={shipmentColumns} empty={search ? "No matching shipment." : "Shipments will appear here after Britium registers them."} />
    </section>}

    {active === "tracking" && <>
      <section className={`${panel} print:hidden`}><h2 className="text-lg font-bold">Track a shipment</h2>
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void findShipment(reference.trim()); }}>
          <Field label="Delivery Way ID or waybill number"><input className={input} value={reference} onChange={event => setReference(event.target.value)} minLength={3} maxLength={80} required /></Field>
          <button className={primary} disabled={busy}><Search size={17} />{busy ? "Searching…" : "Track shipment"}</button>
        </form>
        {tracking && !tracked && <p className="mt-4 text-sm" role="status">No shipment matched that reference for this merchant.</p>}
      </section>
      {tracked && <section className={`${panel} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-[#465f7a]">Britium Express · {snapshot.merchant_name}</p><h2 className="text-xl font-bold">{tracked.delivery_way_id}</h2></div>
          <button className={`${button} print:hidden`} type="button" onClick={() => window.print()}>Print {tracked.waybill_published ? "waybill" : "shipment"} summary</button></div>
        <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
          {[
            ["Waybill", tracked.waybill_no], ["Pickup ID", tracked.pickup_id], ["Status", shipmentStatus(tracked)],
            ["Recipient", tracked.recipient_name], ["Phone", tracked.recipient_phone], ["Township", tracked.township],
            ["Address", tracked.recipient_address], ["COD", money(tracked.cod_amount)], ["Confirmed provider", tracked.provider],
          ].map(([label, value]) => <div key={label}><dt className="font-semibold text-[#465f7a]">{label}</dt><dd className="mt-0.5 break-words">{value || "—"}</dd></div>)}
        </dl>
        {/ROYAL/i.test(String(tracked.provider || "")) && <p className="print:hidden"><a href="https://www.royalx.net/tracking" rel="noreferrer" target="_blank" className="text-sm font-bold text-[#095785] underline">Open Royal Express tracking</a></p>}
        <div className="print:hidden"><h3 className="mb-3 font-bold">Tracking history</h3>
          {tracked.provider_updated_at && <p className="mb-3 text-sm text-[#465f7a]">{tracked.provider} updated this shipment on {dateTime(tracked.provider_updated_at)}.</p>}
          <Records rows={tracking?.events || []} columns={[{ title: "Event", value: row => String(row.status_label || statusText(row.status_code)) }, column("Recorded (Myanmar time)", "created_at", dateTime)]} empty="No shipment events have been recorded." />
        </div>
      </section>}
    </>}

    {active === "statements" && <section className={`${panel} space-y-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">COD and settlements</h2>
        <div className="flex flex-wrap gap-2 print:hidden"><button type="button" className={button} disabled={busy} onClick={() => void run(() => exportStatement(snapshot))}><Download size={17} /> Export Excel</button>
          <button type="button" className={button} onClick={() => window.print()}>Print / PDF</button></div></div>
      <dl className="grid gap-3 rounded-xl bg-[#eef4f9] p-4 sm:grid-cols-3">
        {[["Britium owes you", snapshot.wallet?.britium_owes], ["Confirmed payments", snapshot.wallet?.paid_amount], ["You owe Britium", snapshot.wallet?.owes_britium]].map(([label, value]) =>
          <div key={label}><dt className="text-sm font-semibold text-[#465f7a]">{label}</dt><dd className="mt-1 text-xl font-bold">{money(value)}</dd></div>)}
      </dl>
      <h3 className="font-bold">Settlement batches</h3><Records columns={settlementColumns} rows={snapshot.settlements || []} empty="No settlement batches are available." />
      <h3 className="font-bold">Confirmed payments</h3><Records columns={paymentColumns} rows={snapshot.payments || []} empty="No confirmed payments are available." />
    </section>}

    {active === "rates" && <section className={`${panel} space-y-4`}><h2 className="text-lg font-bold">Rate calculator</h2>
      <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
        event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); setQuote(null);
        void run(async () => setQuote(await merchantCall<Quote>("quote", values)));
      }}>
        <Field label="Destination township"><input className={input} name="township" minLength={2} maxLength={100} required /></Field>
        <Field label="Parcel weight (kg)"><input className={input} type="number" name="weight_kg" min="0.001" max="999.999" step="0.001" required /></Field>
        <button className={primary} disabled={busy}><Calculator size={17} /> Calculate</button>
      </form>
      {quote && <p role="status" className="rounded-xl bg-[#eef4f9] p-4 text-sm">{quote.available
        ? <><strong>Estimated delivery fee {money(quote.fee)}</strong>{quote.provider ? ` · ${quote.provider}` : ""}<br />Britium confirms the charge after weighing and reviewing the parcel.</>
        : "A published rate could not be calculated for this destination and weight. Contact Britium Support for a quote."}</p>}
    </section>}

    {active === "support" && <section className={`${panel} space-y-4`}><h2 className="text-lg font-bold">Customer Service</h2>
      <form className="grid max-w-2xl gap-3" onSubmit={event => {
        event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
        void run(async () => { await merchantCall("support", values); form.reset(); setNotice("Your request was sent to Customer Service."); await load(); });
      }}>
        <Field label="Subject"><input className={input} name="subject" minLength={3} maxLength={150} required /></Field>
        <Field label="Message"><textarea className={input} name="description" minLength={5} maxLength={2000} rows={4} required /></Field>
        <button className={`${primary} justify-self-start`} disabled={busy}>Send request</button>
      </form>
      <h3 className="font-bold">Request history</h3><Records columns={ticketColumns} rows={snapshot.tickets} empty="No support requests have been submitted." />
    </section>}
  </div>;
}
