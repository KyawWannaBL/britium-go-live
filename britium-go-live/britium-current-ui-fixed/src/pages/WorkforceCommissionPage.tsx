import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  RefreshCw,
  Search,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

import { useLanguage } from "@/contexts/LanguageContext";
import {
  loadDriverHelperCommissionSettlement,
  loadRiderCommissionSettlement,
} from "@/lib/commissionApi";

type CommissionOperation =
  | "PICKUP"
  | "DELIVERY"
  | "HIGHWAY_DROPOFF"
  | "MERCHANT_REFERRAL"
  | string;

type CommissionRow = {
  work_date?: string;
  assignee_name?: string;
  assignee_email?: string;
  role_code?: string;
  operation_type?: CommissionOperation;
  unit_type?: string;
  total_units?: number;
  rate_mmk?: number;
  commission_mmk?: number;
  merchant_count?: number;
  merchant_summary?: string;
};

type CommissionStats = {
  total_commission: number;
  total_jobs: number;
  merchant_referral_commission: number;
  merchant_referral_ways: number;
  merchant_referrers: number;
};

const numberValue = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMmk = (value: unknown): string =>
  `${numberValue(value).toLocaleString()} MMK`;

const operationLabel = (operation?: string): string => {
  switch (operation) {
    case "PICKUP":
      return "Parcel Pickup";
    case "DELIVERY":
      return "Parcel Delivery";
    case "HIGHWAY_DROPOFF":
      return "Highway Drop-off";
    case "MERCHANT_REFERRAL":
      return "Merchant Referral";
    default:
      return operation || "Unknown";
  }
};

const rowKey = (row: CommissionRow): string =>
  [
    row.work_date,
    row.assignee_email,
    row.role_code,
    row.operation_type,
    row.unit_type,
  ]
    .map((value) => String(value || ""))
    .join("|");

export default function WorkforceCommissionPage() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [operationFilter, setOperationFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [ledger, setLedger] = useState<CommissionRow[]>([]);
  const [stats, setStats] = useState<CommissionStats>({
    total_commission: 0,
    total_jobs: 0,
    merchant_referral_commission: 0,
    merchant_referral_ways: 0,
    merchant_referrers: 0,
  });

  const fetchPayouts = async () => {
    setLoading(true);

    try {
      const [riderData, driverData] = await Promise.all([
        loadRiderCommissionSettlement(null),
        loadDriverHelperCommissionSettlement("finance@britiumexpress.com"),
      ]);

      const combinedRows: CommissionRow[] = [
        ...((riderData?.rows || []) as CommissionRow[]),
        ...((driverData?.rows || []) as CommissionRow[]),
      ];

      // Some API implementations return overlapping unified snapshots.
      // Deduplicate rows before displaying or totaling them.
      const uniqueRows = Array.from(
        new Map(combinedRows.map((row) => [rowKey(row), row])).values(),
      );

      const referralRows = uniqueRows.filter(
        (row) => row.operation_type === "MERCHANT_REFERRAL",
      );

      setLedger(uniqueRows);
      setStats({
        total_commission: uniqueRows.reduce(
          (sum, row) => sum + numberValue(row.commission_mmk),
          0,
        ),
        total_jobs: uniqueRows.reduce(
          (sum, row) => sum + numberValue(row.total_units),
          0,
        ),
        merchant_referral_commission: referralRows.reduce(
          (sum, row) => sum + numberValue(row.commission_mmk),
          0,
        ),
        merchant_referral_ways: referralRows.reduce(
          (sum, row) => sum + numberValue(row.total_units),
          0,
        ),
        merchant_referrers: new Set(
          referralRows
            .map((row) => row.assignee_email)
            .filter((email): email is string => Boolean(email)),
        ).size,
      });
    } catch (error) {
      console.error(error);
      alert("Failed to sync payouts from backend.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPayouts();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return ledger.filter((row) => {
      const matchesOperation =
        operationFilter === "ALL" || row.operation_type === operationFilter;

      const searchableText = [
        row.assignee_name,
        row.assignee_email,
        row.role_code,
        row.operation_type,
        row.merchant_summary,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesOperation && (!query || searchableText.includes(query));
    });
  }, [ledger, operationFilter, search]);

  const exportCsv = () => {
    const headers = [
      "Name",
      "Email",
      "Role",
      "Operation Type",
      "Merchants",
      "Total Units",
      "Unit Type",
      "Rate MMK",
      "Commission MMK",
    ];

    const rows = filtered.map((row) => [
      row.assignee_name || "",
      row.assignee_email || "",
      row.role_code || "",
      operationLabel(row.operation_type),
      row.merchant_summary || "",
      numberValue(row.total_units),
      row.unit_type || "",
      numberValue(row.rate_mmk),
      numberValue(row.commission_mmk),
    ]);

    const csv = [headers, ...rows]
      .map((line) =>
        line
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "workforce-commission.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#061524] p-6 text-[#eef8ff] md:p-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="flex flex-col items-start justify-between gap-6 rounded-[2rem] border border-[#1a3a5c] bg-[#0b2236] p-8 shadow-xl md:flex-row md:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#22c55e]">
              <Wallet className="h-3.5 w-3.5" />
              <span>{t("Finance", "Finance")}</span>
            </div>

            <h1 className="m-0 text-3xl font-black tracking-tight text-white">
              {t("Workforce Commission", "Workforce Commission")}
            </h1>

            <p className="mt-2 max-w-4xl text-[14px] font-semibold leading-relaxed text-[#4d7a9b]">
              Total commission: {" "}
              <span className="text-[#f6b84b]">
                {formatMmk(stats.total_commission)}
              </span>
              . Merchant referrers earn 100 MMK for each successfully delivered
              way while both their employment period and merchant-referral
              assignment are active.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={exportCsv}
              className="flex h-12 items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#081b2e] px-5 text-[12px] font-black uppercase tracking-wider text-white transition-colors hover:border-[#38bdf8]"
            >
              <Download size={16} />
              Export
            </button>

            <button
              type="button"
              onClick={fetchPayouts}
              disabled={loading}
              className="flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-[#f6b84b] px-6 text-[12px] font-black uppercase tracking-wider text-[#061524] transition-colors hover:bg-[#e5a93a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              <span>{t("Sync Payouts", "Sync Payouts")}</span>
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-wider text-[#4d7a9b]">
                Total Commission
              </p>
              <Wallet className="h-5 w-5 text-[#f6b84b]" />
            </div>
            <p className="mt-3 text-2xl font-black text-white">
              {formatMmk(stats.total_commission)}
            </p>
          </div>

          <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-wider text-[#4d7a9b]">
                Referral Commission
              </p>
              <UserPlus className="h-5 w-5 text-[#22c55e]" />
            </div>
            <p className="mt-3 text-2xl font-black text-[#22c55e]">
              {formatMmk(stats.merchant_referral_commission)}
            </p>
          </div>

          <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-wider text-[#4d7a9b]">
                Referral Ways
              </p>
              <CheckCircle2 className="h-5 w-5 text-[#38bdf8]" />
            </div>
            <p className="mt-3 text-2xl font-black text-white">
              {stats.merchant_referral_ways.toLocaleString()}
            </p>
            <p className="mt-1 text-xs font-bold text-[#4d7a9b]">
              100 MMK per delivered way
            </p>
          </div>

          <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-wider text-[#4d7a9b]">
                Eligible Referrers
              </p>
              <Users className="h-5 w-5 text-[#a78bfa]" />
            </div>
            <p className="mt-3 text-2xl font-black text-white">
              {stats.merchant_referrers.toLocaleString()}
            </p>
          </div>
        </section>

        <section className="flex min-h-[500px] flex-col overflow-hidden rounded-3xl border border-[#1a3a5c] bg-[#0b2236] shadow-xl">
          <div className="flex flex-col justify-between gap-4 border-b border-[#1a3a5c] bg-[#081b2e] p-6 lg:flex-row lg:items-center">
            <div>
              <h2 className="m-0 text-[16px] font-bold text-white">
                {t("Earnings Ledger", "Earnings Ledger")}
              </h2>
              <p className="mt-1 text-xs font-semibold text-[#4d7a9b]">
                Referral commission is generated only for completed delivery
                ways. Cancelled, failed and returned-before-completion ways are
                excluded.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                value={operationFilter}
                onChange={(event) => setOperationFilter(event.target.value)}
                className="h-11 rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 text-[13px] font-bold text-white outline-none focus:border-[#f6b84b]"
              >
                <option value="ALL">All Commission Types</option>
                <option value="PICKUP">Parcel Pickup</option>
                <option value="DELIVERY">Parcel Delivery</option>
                <option value="HIGHWAY_DROPOFF">Highway Drop-off</option>
                <option value="MERCHANT_REFERRAL">Merchant Referral</option>
              </select>

              <label className="relative block">
                <Search className="absolute left-3 top-3.5 h-4 w-4 text-[#4d7a9b]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search employee or merchant..."
                  className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] py-3 pl-10 pr-4 text-[13px] text-white outline-none focus:border-[#f6b84b] sm:w-[320px]"
                />
              </label>
            </div>
          </div>

          <div className="flex-1 overflow-x-auto bg-[#061524]">
            <table className="w-full min-w-[1180px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-[#081b2e] shadow-sm">
                <tr>
                  <th className="border-b border-[#1a3a5c] p-4 text-[11px] font-bold uppercase text-[#4d7a9b]">
                    Name / Email
                  </th>
                  <th className="border-b border-[#1a3a5c] p-4 text-[11px] font-bold uppercase text-[#4d7a9b]">
                    Role
                  </th>
                  <th className="border-b border-[#1a3a5c] p-4 text-[11px] font-bold uppercase text-[#4d7a9b]">
                    Commission Type
                  </th>
                  <th className="border-b border-[#1a3a5c] p-4 text-[11px] font-bold uppercase text-[#4d7a9b]">
                    Merchant(s)
                  </th>
                  <th className="border-b border-[#1a3a5c] p-4 text-right text-[11px] font-bold uppercase text-[#4d7a9b]">
                    Total Units
                  </th>
                  <th className="border-b border-[#1a3a5c] p-4 text-right text-[11px] font-bold uppercase text-[#4d7a9b]">
                    Rate
                  </th>
                  <th className="border-b border-[#1a3a5c] p-4 text-right text-[11px] font-bold uppercase text-[#22c55e]">
                    Total Commission
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((row) => {
                  const isReferral =
                    row.operation_type === "MERCHANT_REFERRAL";

                  return (
                    <tr
                      key={rowKey(row)}
                      className="border-b border-[#1a3a5c]/50 hover:bg-[#1a3a5c]/30"
                    >
                      <td className="p-4 text-[13px] font-bold text-white">
                        {row.assignee_name || "-"}
                        <br />
                        <span className="text-xs text-[#4d7a9b]">
                          {row.assignee_email || "-"}
                        </span>
                      </td>

                      <td className="p-4 text-[12px] font-bold text-[#c8dff0]">
                        {row.role_code || "-"}
                      </td>

                      <td className="p-4 text-[12px] font-bold text-[#c8dff0]">
                        <span
                          className={
                            isReferral
                              ? "rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-1 text-[#22c55e]"
                              : ""
                          }
                        >
                          {operationLabel(row.operation_type)}
                        </span>
                      </td>

                      <td className="max-w-[320px] p-4 text-[12px] font-semibold text-[#c8dff0]">
                        {isReferral
                          ? row.merchant_summary ||
                            `${numberValue(row.merchant_count)} merchant(s)`
                          : "-"}
                      </td>

                      <td className="p-4 text-right font-mono text-[13px] text-white">
                        {numberValue(row.total_units).toLocaleString()} {" "}
                        {(row.unit_type || "unit").toLowerCase()}(s)
                      </td>

                      <td className="p-4 text-right font-mono text-[13px] text-[#38bdf8]">
                        {formatMmk(row.rate_mmk)}
                      </td>

                      <td className="p-4 text-right font-mono text-[14px] font-black text-[#22c55e]">
                        {formatMmk(row.commission_mmk)}
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-16 text-center font-medium text-[#4d7a9b]"
                    >
                      No ledger records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}