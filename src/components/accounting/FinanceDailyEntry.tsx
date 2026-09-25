import { useMemo, useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CheckCircle2, Database, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AccountingPreview, type PreviewLine } from "@/components/accounting/AccountingPreview";
import { LockedSubmissionBanner } from "@/components/accounting/LockedSubmissionBanner";
import { useAccountingEvents, useSubmitFinanceDailyLog } from "@/hooks/useAccounting";
import type { FinanceDailyLog } from "@/types/accounting";

const schema = z.object({
  entry_date: z.string().min(1, "Entry date is required"),
  source_mode: z.enum(["MANUAL", "ADJUSTMENT"]),
  fuel_and_tolls_spent: z.coerce.number().min(0),
  packaging_supplies_spent: z.coerce.number().min(0),
  petty_cash_expenses: z.coerce.number().min(0),
  funding_account_code: z.enum(["1000", "1010", "1100"]),
  reference: z.string().trim().min(2, "Supporting reference is required"),
});

type FormValues = z.infer<typeof schema>;

const today = () => new Date().toISOString().slice(0, 10);

function mmk(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function FinanceDailyEntry() {
  const [submitted, setSubmitted] = useState<FinanceDailyLog | null>(null);
  const mutation = useSubmitFinanceDailyLog();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      entry_date: today(),
      source_mode: "MANUAL",
      fuel_and_tolls_spent: 0,
      packaging_supplies_spent: 0,
      petty_cash_expenses: 0,
      funding_account_code: "1010",
      reference: "",
    },
  });

  const values = form.watch();
  const events = useAccountingEvents({
    dateFrom: values.entry_date,
    dateTo: values.entry_date,
    limit: 250,
  });

  const preview = useMemo<PreviewLine[]>(() => {
    const lines: PreviewLine[] = [];
    const fuel = Number(values.fuel_and_tolls_spent || 0);
    const packaging = Number(values.packaging_supplies_spent || 0);
    const petty = Number(values.petty_cash_expenses || 0);
    const total = fuel + packaging + petty;

    if (fuel > 0) lines.push({ account: "5100 · Fuel & Tolls Expense", description: "Manual Finance source", debit: fuel, credit: 0 });
    if (packaging > 0) lines.push({ account: "5200 · Packaging Supplies Expense", description: "Manual Finance source", debit: packaging, credit: 0 });
    if (petty > 0) lines.push({ account: "6600 · Petty Cash Expense", description: "Manual Finance source", debit: petty, credit: 0 });
    if (total > 0) {
      const funding = values.funding_account_code === "1000"
        ? "1000 · Cash on Hand"
        : values.funding_account_code === "1100"
          ? "1100 · Bank Accounts"
          : "1010 · Petty Cash";
      lines.push({ account: funding, description: "Funding source", debit: 0, credit: total });
    }
    return lines;
  }, [values.fuel_and_tolls_spent, values.packaging_supplies_spent, values.petty_cash_expenses, values.funding_account_code]);

  const synchronized = useMemo(() => {
    const rows = events.data ?? [];
    return {
      deliveryRevenue: rows
        .filter((e) => e.event_type === "DELIVERY_REVENUE_RECOGNIZED")
        .reduce((sum, e) => sum + Number(e.total_amount || 0), 0),
      codCollected: rows
        .filter((e) => e.event_type === "COD_COLLECTED")
        .reduce((sum, e) => sum + Number(e.total_amount || 0), 0),
      pendingReview: rows.filter((e) => ["REVIEW_PENDING", "NEEDS_REVIEW", "HELD"].includes(e.review_status)).length,
    };
  }, [events.data]);

  async function onSubmit(input: FormValues) {
    const row = await mutation.mutateAsync({
      entry_date: input.entry_date,
      department_code: "FINANCE",
      delivery_fees_collected: 0,
      cod_handling_fees: 0,
      surcharges: 0,
      rider_commissions_accrued: 0,
      fuel_and_tolls_spent: input.fuel_and_tolls_spent,
      packaging_supplies_spent: input.packaging_supplies_spent,
      petty_cash_expenses: input.petty_cash_expenses,
      cod_cash_collected_in_hand: 0,
      accounts_receivable_invoiced: 0,
      accounts_payable_incurred: 0,
      source_mode: input.source_mode,
      metadata: {
        funding_account_code: input.funding_account_code,
        reference: input.reference,
      },
    });
    setSubmitted(row);
  }

  if (submitted) {
    return (
      <div className="space-y-4">
        <LockedSubmissionBanner submissionNo={submitted.submission_no} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Finance source document submitted
            </CardTitle>
            <CardDescription>
              Entry date {submitted.entry_date}. The source document is locked and will be synchronized into Finance Review when synchronization is enabled.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => {
              setSubmitted(null);
              form.reset({ ...form.getValues(), reference: "", fuel_and_tolls_spent: 0, packaging_supplies_spent: 0, petty_cash_expenses: 0 });
            }}>
              Create another entry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalManual = Number(values.fuel_and_tolls_spent || 0)
    + Number(values.packaging_supplies_spent || 0)
    + Number(values.petty_cash_expenses || 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Daily Finance Entry</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Operational revenue, COD, merchant, and rider transactions are synchronized separately. Enter only genuine manual expenses or adjustments here to prevent double counting.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>System-synced delivery economics</CardDescription></CardHeader>
          <CardContent className="text-xl font-bold">MMK {mmk(synchronized.deliveryRevenue)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>System-synced COD collected</CardDescription></CardHeader>
          <CardContent className="text-xl font-bold">MMK {mmk(synchronized.codCollected)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Events requiring Finance attention</CardDescription></CardHeader>
          <CardContent className="flex items-center gap-2 text-xl font-bold">
            {synchronized.pendingReview}
            <Badge variant="outline">Review Queue</Badge>
          </CardContent>
        </Card>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manual source document</CardTitle>
            <CardDescription>Submitted rows are locked at the database level.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="grid gap-1.5 text-sm font-medium">
              Entry date
              <Input type="date" {...form.register("entry_date")} />
              {form.formState.errors.entry_date ? <span className="text-xs text-red-600">{form.formState.errors.entry_date.message}</span> : null}
            </label>

            <label className="grid gap-1.5 text-sm font-medium">
              Entry type
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" {...form.register("source_mode")}>
                <option value="MANUAL">Manual</option>
                <option value="ADJUSTMENT">Adjustment</option>
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <MoneyField label="Fuel & Tolls" registration={form.register("fuel_and_tolls_spent")} />
              <MoneyField label="Packaging" registration={form.register("packaging_supplies_spent")} />
              <MoneyField label="Petty Cash Expense" registration={form.register("petty_cash_expenses")} />
            </div>

            <label className="grid gap-1.5 text-sm font-medium">
              Funding account
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" {...form.register("funding_account_code")}>
                <option value="1010">1010 · Petty Cash</option>
                <option value="1000">1000 · Cash on Hand</option>
                <option value="1100">1100 · Bank Accounts</option>
              </select>
            </label>

            <label className="grid gap-1.5 text-sm font-medium">
              Voucher / supporting reference
              <Input placeholder="e.g. FUEL-20260926-001" {...form.register("reference")} />
              {form.formState.errors.reference ? <span className="text-xs text-red-600">{form.formState.errors.reference.message}</span> : null}
            </label>

            <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <LockKeyhole className="h-4 w-4" />
                Immutable submission
              </div>
              Finance users cannot edit or delete this record after submission.
            </div>

            {mutation.error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{mutation.error.message}</div> : null}

            <Button type="submit" disabled={mutation.isPending || totalManual <= 0} className="w-full">
              {mutation.isPending ? "Submitting…" : "Submit to Accounting Vault"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <AccountingPreview lines={preview} />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4" />
                Source separation
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Delivery revenue, COD collection/remittance, merchant settlements and rider commissions are not re-entered here. They arrive through canonical operational adapters and retain their Way ID/source references.
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}

function MoneyField({ label, registration }: { label: string; registration: ReturnType<ReturnType<typeof useForm<FormValues>>["register"]> }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <Input type="number" min="0" step="1" inputMode="numeric" {...registration} />
    </label>
  );
}
