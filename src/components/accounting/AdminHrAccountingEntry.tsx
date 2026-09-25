import { useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Building2, Calculator, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LockedSubmissionBanner } from "@/components/accounting/LockedSubmissionBanner";
import { useSubmitAdminHrLog } from "@/hooks/useAccounting";

const schema = z.object({
  entry_date: z.string().min(1),
  warehouse_overtime: z.coerce.number().min(0),
  base_payroll_accrual: z.coerce.number().min(0),
  facility_rent: z.coerce.number().min(0),
  utilities_admin_cost: z.coerce.number().min(0),
  asset_name: z.string().trim().optional(),
  asset_category: z.string().trim().optional(),
  acquisition_date: z.string().optional(),
  acquisition_cost: z.coerce.number().min(0),
  residual_value: z.coerce.number().min(0),
  useful_life_months: z.coerce.number().min(0),
  funding_account_code: z.enum(["1000","1010","1100","2000"]),
  reference: z.string().trim().min(2),
}).superRefine((value, ctx) => {
  const hasAsset = Boolean(value.asset_name?.trim()) || value.acquisition_cost > 0;
  if (hasAsset) {
    if (!value.asset_name?.trim()) ctx.addIssue({ code: "custom", path: ["asset_name"], message: "Asset name is required" });
    if (!value.asset_category?.trim()) ctx.addIssue({ code: "custom", path: ["asset_category"], message: "Asset category is required" });
    if (value.acquisition_cost <= 0) ctx.addIssue({ code: "custom", path: ["acquisition_cost"], message: "Acquisition cost must be greater than zero" });
    if (value.useful_life_months <= 0) ctx.addIssue({ code: "custom", path: ["useful_life_months"], message: "Useful life must be greater than zero" });
    if (value.residual_value > value.acquisition_cost) ctx.addIssue({ code: "custom", path: ["residual_value"], message: "Residual value cannot exceed acquisition cost" });
  }
});

type FormValues = z.infer<typeof schema>;
const today = () => new Date().toISOString().slice(0,10);

function mmk(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function AdminHrAccountingEntry() {
  const [submittedNo, setSubmittedNo] = useState<string | null>(null);
  const mutation = useSubmitAdminHrLog();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      entry_date: today(),
      warehouse_overtime: 0,
      base_payroll_accrual: 0,
      facility_rent: 0,
      utilities_admin_cost: 0,
      asset_name: "",
      asset_category: "",
      acquisition_date: today(),
      acquisition_cost: 0,
      residual_value: 0,
      useful_life_months: 0,
      funding_account_code: "1100",
      reference: "",
    },
  });

  const values = form.watch();
  const acquisitionCost = Number(values.acquisition_cost || 0);
  const residual = Number(values.residual_value || 0);
  const usefulLife = Number(values.useful_life_months || 0);
  const monthlyDepreciation = usefulLife > 0 ? Math.max(acquisitionCost - residual,0) / usefulLife : 0;
  const totalOverhead = Number(values.warehouse_overtime || 0)
    + Number(values.base_payroll_accrual || 0)
    + Number(values.facility_rent || 0)
    + Number(values.utilities_admin_cost || 0);

  async function onSubmit(input: FormValues) {
    const result = await mutation.mutateAsync({
      entry_date: input.entry_date,
      department_code: "ADMIN_HR",
      asset_name: input.asset_name?.trim() || null,
      asset_category: input.asset_category?.trim() || null,
      acquisition_date: input.asset_name?.trim() ? (input.acquisition_date || input.entry_date) : null,
      acquisition_cost: input.asset_name?.trim() ? input.acquisition_cost : null,
      residual_value: input.asset_name?.trim() ? input.residual_value : 0,
      useful_life_months: input.asset_name?.trim() ? input.useful_life_months : null,
      warehouse_overtime: input.warehouse_overtime,
      base_payroll_accrual: input.base_payroll_accrual,
      facility_rent: input.facility_rent,
      utilities_admin_cost: input.utilities_admin_cost,
      source_mode: "MANUAL",
      metadata: {
        funding_account_code: input.funding_account_code,
        reference: input.reference,
        capitalization_threshold_mmk: 500000,
      },
    });
    setSubmittedNo(String(result.submission_no ?? "Admin/HR submission"));
  }

  if (submittedNo) {
    return (
      <div className="space-y-4">
        <LockedSubmissionBanner submissionNo={submittedNo} />
        <Button variant="outline" onClick={() => {
          setSubmittedNo(null);
          form.reset({ ...form.getValues(), reference: "", warehouse_overtime: 0, base_payroll_accrual: 0, facility_rent: 0, utilities_admin_cost: 0, asset_name: "", asset_category: "", acquisition_cost: 0, residual_value: 0, useful_life_months: 0 });
        }}>Create another entry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Assets & HR Costs</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Submit payroll accruals, overhead and asset acquisitions. Finance reviews the resulting accounting events before posting.
        </p>
      </div>

      <form className="grid gap-5 xl:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily HR & overhead</CardTitle>
            <CardDescription>Accruals become locked source documents immediately.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="grid gap-1.5 text-sm font-medium">Entry date<Input type="date" {...form.register("entry_date")} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Warehouse Overtime" registration={form.register("warehouse_overtime")} />
              <Field label="Base Payroll Accrual" registration={form.register("base_payroll_accrual")} />
              <Field label="Facility Rent" registration={form.register("facility_rent")} />
              <Field label="Utilities / Admin" registration={form.register("utilities_admin_cost")} />
            </div>
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              Total HR/overhead source: <strong>MMK {mmk(totalOverhead)}</strong>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" /> Optional asset acquisition</CardTitle>
            <CardDescription>Leave blank if this submission contains HR/overhead only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">Asset name<Input {...form.register("asset_name")} placeholder="e.g. Delivery Van YGN-01" /></label>
              <label className="grid gap-1.5 text-sm font-medium">Category
                <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" {...form.register("asset_category")}>
                  <option value="">Select category</option>
                  <option value="FLEET_VEHICLE">Fleet Vehicle</option>
                  <option value="WAREHOUSE_MACHINERY">Warehouse Machinery</option>
                  <option value="IT_INFRASTRUCTURE">IT Infrastructure</option>
                  <option value="OFFICE_EQUIPMENT">Office Equipment</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">Acquisition date<Input type="date" {...form.register("acquisition_date")} /></label>
              <Field label="Acquisition Cost" registration={form.register("acquisition_cost")} />
              <Field label="Residual Value" registration={form.register("residual_value")} />
              <Field label="Useful Life (months)" registration={form.register("useful_life_months")} />
              <label className="grid gap-1.5 text-sm font-medium">Funding account
                <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" {...form.register("funding_account_code")}>
                  <option value="1100">1100 · Bank Accounts</option>
                  <option value="1000">1000 · Cash on Hand</option>
                  <option value="1010">1010 · Petty Cash</option>
                  <option value="2000">2000 · Accounts Payable</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">Invoice / reference<Input {...form.register("reference")} placeholder="Invoice or voucher" /></label>
            </div>
            {acquisitionCost > 0 ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium"><Calculator className="h-4 w-4" /> Straight-line preview</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-muted-foreground">
                  <span>Monthly depreciation</span><strong className="text-right text-foreground">MMK {mmk(monthlyDepreciation)}</strong>
                  <span>Capitalization rule</span><strong className="text-right text-foreground">{acquisitionCost >= 500000 ? "Fixed asset" : "Expense below MMK 500,000"}</strong>
                </div>
              </div>
            ) : null}
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
              Submitted Admin/HR source documents cannot be edited directly.
            </div>
            {mutation.error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{mutation.error.message}</div> : null}
            <Button type="submit" className="w-full" disabled={mutation.isPending || (totalOverhead <= 0 && acquisitionCost <= 0)}>
              {mutation.isPending ? "Submitting…" : "Submit to Finance Review"}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

function Field({ label, registration }: { label: string; registration: Record<string, unknown> }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <Input type="number" min="0" step="1" inputMode="numeric" {...registration} />
    </label>
  );
}
