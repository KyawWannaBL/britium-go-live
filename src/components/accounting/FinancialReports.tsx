import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAccountingReconciliation,
  useBalanceSheet,
  useProfitLoss,
  useTrialBalance,
} from "@/hooks/useAccounting";

function isoDate(date: Date) {
  return date.toISOString().slice(0,10);
}

function defaultMonthRange() {
  const now = new Date();
  return {
    from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: isoDate(now),
  };
}

function mmk(value: unknown) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function Metric({ label, value, emphasize = false }: { label: string; value: number; emphasize?: boolean }) {
  return (
    <div className={`flex items-center justify-between border-b py-2 last:border-b-0 ${emphasize ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">MMK {mmk(value)}</span>
    </div>
  );
}

export function FinancialReports() {
  const initial = useMemo(defaultMonthRange, []);
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [asOf, setAsOf] = useState(initial.to);

  const pl = useProfitLoss(dateFrom, dateTo);
  const tb = useTrialBalance(dateFrom, dateTo);
  const bs = useBalanceSheet(asOf);
  const reconciliation = useAccountingReconciliation(asOf);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Financial Reports</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Statements are generated from posted General Ledger lines only.
        </p>
      </div>

      <Tabs defaultValue="profit-loss">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="profit-loss">Profit & Loss</TabsTrigger>
          <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
          <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
          <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
        </TabsList>

        <TabsContent value="profit-loss" className="mt-4 space-y-4">
          <PeriodFilters dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
          {pl.error ? <ErrorBox message={pl.error.message} /> : null}
          <Card>
            <CardHeader>
              <CardTitle>Profit & Loss</CardTitle>
              <CardDescription>{dateFrom} to {dateTo}</CardDescription>
            </CardHeader>
            <CardContent>
              {pl.isLoading ? <Loading /> : pl.data ? (
                <div className="space-y-1">
                  <Metric label="Revenue" value={pl.data.total_revenue} />
                  <Metric label="Direct Operating Costs / COGS" value={-pl.data.total_cogs} />
                  <Metric label="Gross Profit" value={pl.data.gross_profit} emphasize />
                  <Metric label="Operating Expenses before Depreciation" value={-pl.data.operating_expenses_before_depreciation} />
                  <Metric label="EBITDA" value={pl.data.ebitda} emphasize />
                  <Metric label="Depreciation & Amortization" value={-pl.data.depreciation} />
                  <Metric label="Operating Profit / EBIT" value={pl.data.ebit} emphasize />
                  <Metric label="Net Income" value={pl.data.net_income} emphasize />
                </div>
              ) : null}
            </CardContent>
          </Card>
          <AccountMovementTable rows={pl.data?.rows ?? []} />
        </TabsContent>

        <TabsContent value="balance-sheet" className="mt-4 space-y-4">
          <Card>
            <CardContent className="pt-6">
              <label className="grid max-w-xs gap-1.5 text-sm font-medium">As-of Date<Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
            </CardContent>
          </Card>
          {bs.error ? <ErrorBox message={bs.error.message} /> : null}
          {bs.data ? (
            <>
              <Card className={bs.data.balanced ? "border-emerald-200" : "border-red-300"}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Balance Sheet</span>
                    <Badge variant={bs.data.balanced ? "default" : "destructive"}>
                      {bs.data.balanced ? "BALANCED" : "OUT OF BALANCE"}
                    </Badge>
                  </CardTitle>
                  <CardDescription>As of {asOf}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                  <Metric label="Total Assets" value={bs.data.total_assets} emphasize />
                  <Metric label="Gross Fixed Assets" value={bs.data.gross_fixed_assets} />
                  <Metric label="Accumulated Depreciation" value={-bs.data.accumulated_depreciation} />
                  <Metric label="Net Fixed Assets" value={bs.data.net_fixed_assets} />
                  <Metric label="Total Liabilities" value={bs.data.total_liabilities} emphasize />
                  <Metric label="Equity Accounts" value={bs.data.equity_accounts} />
                  <Metric label="Current Period Earnings" value={bs.data.current_period_earnings} />
                  <Metric label="Total Equity" value={bs.data.total_equity} emphasize />
                  <div className={`mt-3 flex items-center gap-2 rounded-md p-3 text-sm ${bs.data.balanced ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                    {bs.data.balanced ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    Balance difference: MMK {mmk(bs.data.balance_difference)}
                  </div>
                </CardContent>
              </Card>
              <BalanceSheetAccounts rows={bs.data.rows} />
            </>
          ) : <Loading />}
        </TabsContent>

        <TabsContent value="trial-balance" className="mt-4 space-y-4">
          <PeriodFilters dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
          {tb.error ? <ErrorBox message={tb.error.message} /> : null}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Trial Balance</span>
                {tb.data ? <Badge variant={Number(tb.data.difference) === 0 ? "default" : "destructive"}>Difference MMK {mmk(tb.data.difference)}</Badge> : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Opening</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Closing</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(tb.data?.rows ?? []).map((row) => (
                    <TableRow key={row.account_id}>
                      <TableCell>{row.account_code} · {row.account_name}</TableCell>
                      <TableCell className="text-right">{mmk(row.opening_balance)}</TableCell>
                      <TableCell className="text-right">{mmk(row.period_debit)}</TableCell>
                      <TableCell className="text-right">{mmk(row.period_credit)}</TableCell>
                      <TableCell className="text-right">{mmk(row.closing_balance)}</TableCell>
                    </TableRow>
                  ))}
                  {tb.data ? <TableRow className="font-bold"><TableCell colSpan={2}>Period Totals</TableCell><TableCell className="text-right">{mmk(tb.data.period_debit)}</TableCell><TableCell className="text-right">{mmk(tb.data.period_credit)}</TableCell><TableCell /></TableRow> : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reconciliation" className="mt-4 space-y-4">
          <Card>
            <CardContent className="pt-6">
              <label className="grid max-w-xs gap-1.5 text-sm font-medium">As-of Date<Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
            </CardContent>
          </Card>
          {reconciliation.error ? <ErrorBox message={reconciliation.error.message} /> : null}
          {reconciliation.data ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[
                ["Duplicate source events", reconciliation.data.duplicate_source_events],
                ["Posted events without journal", reconciliation.data.posted_events_without_journal],
                ["Unbalanced journals", reconciliation.data.unbalanced_journals],
                ["Journal source exceptions", reconciliation.data.journals_without_authorized_source],
                ["Balance Sheet difference", reconciliation.data.balance_sheet_difference],
                ["Critical exceptions", reconciliation.data.critical_difference_count],
              ].map(([label, value]) => (
                <Card key={String(label)}>
                  <CardHeader className="pb-2"><CardDescription>{label}</CardDescription></CardHeader>
                  <CardContent className={`text-2xl font-bold ${Number(value) === 0 ? "text-emerald-700" : "text-red-700"}`}>{typeof value === "number" ? mmk(value) : String(value)}</CardContent>
                </Card>
              ))}
            </div>
          ) : <Loading />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PeriodFilters({ dateFrom, dateTo, setDateFrom, setDateTo }: { dateFrom: string; dateTo: string; setDateFrom: (value: string) => void; setDateTo: (value: string) => void }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap gap-4 pt-6">
        <label className="grid gap-1.5 text-sm font-medium">Date From<Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
        <label className="grid gap-1.5 text-sm font-medium">Date To<Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
      </CardContent>
    </Card>
  );
}

function AccountMovementTable({ rows }: { rows: Array<{ account_id: string; account_code: string; account_name: string; account_type: string; amount: number }> }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Account Detail</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Class</TableHead><TableHead className="text-right">Period Amount</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((row) => <TableRow key={row.account_id}><TableCell>{row.account_code} · {row.account_name}</TableCell><TableCell>{row.account_type}</TableCell><TableCell className="text-right">{mmk(row.amount)}</TableCell></TableRow>)}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function BalanceSheetAccounts({ rows }: { rows: Array<{ account_id: string; account_code: string; account_name: string; account_type: string; balance: number }> }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Balance Sheet Accounts</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Class</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((row) => <TableRow key={row.account_id}><TableCell>{row.account_code} · {row.account_name}</TableCell><TableCell>{row.account_type}</TableCell><TableCell className="text-right">{mmk(row.balance)}</TableCell></TableRow>)}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</div>;
}

function Loading() {
  return <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">Loading financial report…</div>;
}
