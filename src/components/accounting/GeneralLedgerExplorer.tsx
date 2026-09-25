import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useGeneralLedger } from "@/hooks/useAccounting";

function money(value: unknown) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

export function GeneralLedgerExplorer() {
  const [search, setSearch] = useState("");
  const ledger = useGeneralLedger(1000);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return ledger.data ?? [];
    return (ledger.data ?? []).filter((row) => {
      const journal = row.journal?.journal_number ?? "";
      const account = row.account ? `${row.account.account_code} ${row.account.account_name}` : row.account_id;
      return [journal, account, row.source_reference ?? "", row.description ?? ""]
        .some((value) => value.toLowerCase().includes(term));
    });
  }, [ledger.data, search]);

  const totals = useMemo(() => ({
    debit: rows.reduce((sum, row) => sum + Number(row.debit_amount || 0), 0),
    credit: rows.reduce((sum, row) => sum + Number(row.credit_amount || 0), 0),
  }), [rows]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">General Ledger</h2>
        <p className="mt-1 text-sm text-muted-foreground">Posted journal lines only. Source documents remain immutable and traceable.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search journal, account, Way ID or description…" />
          </div>
        </CardContent>
      </Card>

      {ledger.error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{ledger.error.message}</div> : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Posted ledger lines</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Journal</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Loading General Ledger…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No posted ledger lines.</TableCell></TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.journal?.accounting_date ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{row.journal?.journal_number ?? row.journal_id}</TableCell>
                  <TableCell>{row.account ? `${row.account.account_code} · ${row.account.account_name}` : row.account_id}</TableCell>
                  <TableCell className="font-mono text-xs">{row.source_reference ?? "—"}</TableCell>
                  <TableCell>{row.description ?? row.journal?.description ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.debit_amount ? money(row.debit_amount) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.credit_amount ? money(row.credit_amount) : "—"}</TableCell>
                  <TableCell><Badge variant="outline">{row.journal?.status ?? "POSTED"}</Badge></TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell colSpan={5}>Visible totals</TableCell>
                <TableCell className="text-right">{money(totals.debit)}</TableCell>
                <TableCell className="text-right">{money(totals.credit)}</TableCell>
                <TableCell>{Math.abs(totals.debit - totals.credit) < 0.005 ? "Balanced" : "Filtered view"}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
