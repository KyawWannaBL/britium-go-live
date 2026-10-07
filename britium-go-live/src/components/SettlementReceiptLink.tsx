import { useState } from "react";
import { resolveSettlementReceipt } from "@/lib/merchantSettlementReceipt";

export default function SettlementReceiptLink({ url, label = "Receipt" }: { url: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!/^https:\/\//.test(url || "")) return <span>—</span>;
  async function open() {
    if (busy) return;
    const tab = window.open("", "_blank");
    if (!tab) { setError("Allow popups to view this receipt."); return; }
    tab.opener = null;
    setBusy(true); setError("");
    try { tab.location.href = await resolveSettlementReceipt(url); }
    catch (e) { tab.close(); setError(e instanceof Error ? e.message : "Unable to open receipt."); }
    finally { setBusy(false); }
  }
  return <span><button type="button" disabled={busy} onClick={() => void open()} className="text-sky-300 underline disabled:opacity-40">{busy ? "Opening receipt…" : label}</button>{error && <span role="alert" className="ml-2 text-red-300">{error}</span>}</span>;
}
