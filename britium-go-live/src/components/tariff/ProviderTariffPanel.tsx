import { useState } from "react";
import { TariffExportButtons } from "./TariffExportButtons";
import type { ReportColumn } from "@/lib/financeReportExports";

export type ProviderTariff = {
  destination_key: string;
  destination_name: string;
  provider_code: string;
  standard_rate_mmk: number | null;
  special_rate_mmk: number | null;
  rack_code: string | null;
  is_active: boolean;
};

const columns: ReportColumn[] = [
  { key: "provider_code", label: "Provider" },
  { key: "destination_name", label: "Destination" },
  { key: "standard_rate_mmk", label: "Standard rate (MMK)", kind: "number" },
  { key: "special_rate_mmk", label: "Special rate (MMK)", kind: "number" },
  { key: "rack_code", label: "Rack" },
  { key: "status", label: "Status" },
];

export function ProviderTariffPanel({ rows, loading, error }: { rows: ProviderTariff[]; loading: boolean; error: string }) {
  const [selectedProvider, setSelectedProvider] = useState("DK DELIVERY");
  const [search, setSearch] = useState("");
  const providers = [...new Set(rows.map(row => row.provider_code))].sort();
  const provider = providers.includes(selectedProvider) ? selectedProvider : providers[0] ?? "";
  const query = search.trim().normalize("NFC").toLowerCase();
  const matching = rows.filter(row => row.provider_code === provider &&
    [row.destination_name, row.destination_key, row.rack_code].some(value => value?.normalize("NFC").toLowerCase().includes(query)));
  const exported = matching.map(row => ({ ...row, status: row.is_active ? "Active" : "Inactive" }));
  const money = (value: number | null) => value == null ? "—" : value.toLocaleString();

  return <section className="space-y-4 rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
    <h2 className="text-xl font-black text-white">Other Provider Tariffs</h2>
    <div className="flex flex-wrap items-center gap-3">
      <select aria-label="Tariff provider" value={provider} onChange={event => setSelectedProvider(event.target.value)}
        disabled={loading || !providers.length} className="rounded-lg bg-white px-3 py-2 text-[#061524]">
        {!providers.length && <option value="">No providers available</option>}
        {providers.map(code => <option key={code} value={code}>{code}</option>)}
      </select>
      <input aria-label="Search provider destinations" placeholder="Search destination or rack" value={search}
        onChange={event => setSearch(event.target.value)} className="rounded-lg bg-white px-3 py-2 text-[#061524]" />
      <TariffExportButtons title={`${provider} Destination Tariffs`} columns={columns} rows={exported}
        filters={{ Provider: provider, Search: search.trim() }} disabled={loading || Boolean(error)}
        note="Destination rates from the provider tariff catalog. Rates are in MMK." />
    </div>
    {error ? <p role="alert" className="text-rose-200">{error}</p> : loading ? <p role="status">Loading provider tariffs…</p> :
      <div className="max-h-[620px] overflow-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-[#f6b84b]"><tr>{columns.slice(1).map(column => <th key={column.key} className="p-3">{column.label}</th>)}</tr></thead>
          <tbody>{exported.map(row => <tr className="border-t border-[#1a3a5c]" key={row.destination_key}>
            <td className="p-3">{row.destination_name}</td>
            <td className="p-3">{money(row.standard_rate_mmk)}</td>
            <td className="p-3">{money(row.special_rate_mmk)}</td>
            <td className="p-3">{row.rack_code || "—"}</td>
            <td className="p-3">{row.status}</td>
          </tr>)}
          {!matching.length && <tr><td colSpan={5} className="p-5">No rates match the selected provider and search.</td></tr>}</tbody>
        </table>
      </div>}
  </section>;
}
