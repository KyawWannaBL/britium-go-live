import { useMemo, useState } from "react";
import { ShieldAlert, ShieldCheck, ToggleLeft, ToggleRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAccountingAudit,
  useAccountingFlags,
  useAccountingPeriods,
  useCloseAccountingPeriod,
  useJournalHeaders,
  useReverseAccountingJournal,
  useSetAccountingFlag,
} from "@/hooks/useAccounting";

type FlagKey =
  | "ERP_UI_ENABLED"
  | "ACCOUNTING_SYNC_ENABLED"
  | "GL_POSTING_ENABLED"
  | "FINANCIAL_REPORTS_ENABLED";

type PendingAction =
  | { type: "flag"; key: FlagKey; value: boolean }
  | { type: "reverse"; journalId: string; journalNumber: string }
  | { type: "close"; periodId: string; periodCode: string }
  | null;

function normalizeRole(role?: string) {
  return String(role ?? "").toLowerCase().replaceAll("-", "_");
}

function prettyJson(value: unknown) {
  if (!value) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function SuperadminAccountingControl() {
  const { role, profile } = useAuth();
  const normalizedRole = normalizeRole(profile?.role || role);
  const allowed = ["super_admin", "superadmin"].includes(normalizedRole);

  const flags = useAccountingFlags();
  const periods = useAccountingPeriods();
  const journals = useJournalHeaders(300);
  const audit = useAccountingAudit(300);
  const setFlag = useSetAccountingFlag();
  const reverse = useReverseAccountingJournal();
  const closePeriod = useCloseAccountingPeriod();

  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");

  const flagRows = useMemo(() => {
    const current = flags.data;
    return [
      { key: "ERP_UI_ENABLED" as const, label: "ERP UI", value: Boolean(current?.erpUiEnabled), description: "Expose Finance/Admin/Superadmin accounting screens." },
      { key: "ACCOUNTING_SYNC_ENABLED" as const, label: "Operational Sync", value: Boolean(current?.syncEnabled), description: "Allow operational adapters to create accounting review events." },
      { key: "GL_POSTING_ENABLED" as const, label: "General Ledger Posting", value: Boolean(current?.postingEnabled), description: "Allow approved events to create posted journal entries." },
      { key: "FINANCIAL_REPORTS_ENABLED" as const, label: "Financial Reports", value: Boolean(current?.reportsEnabled), description: "Expose ledger-backed production financial statements." },
    ];
  }, [flags.data]);

  if (!allowed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <ShieldAlert className="h-5 w-5" />
            Accounting Control access denied
          </CardTitle>
          <CardDescription>Only Superadmin can manage ERP activation, periods, reversals and audit controls.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function executePending() {
    if (!pending || !reason.trim()) return;
    setNotice("");
    try {
      if (pending.type === "flag") {
        await setFlag.mutateAsync({ key: pending.key, value: pending.value, reason: reason.trim() });
        setNotice(`${pending.key} set to ${pending.value ? "ON" : "OFF"}.`);
      } else if (pending.type === "reverse") {
        const result = await reverse.mutateAsync({ journalId: pending.journalId, reason: reason.trim() });
        setNotice(`Reversal created: ${String(result.journal_number ?? result.reversal_journal_number ?? "journal")}.`);
      } else {
        await closePeriod.mutateAsync({ periodId: pending.periodId, reason: reason.trim() });
        setNotice(`Accounting period ${pending.periodCode} closed.`);
      }
      setPending(null);
      setReason("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Accounting control action failed.");
    }
  }

  const busy = setFlag.isPending || reverse.isPending || closePeriod.isPending;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Accounting Control</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Superadmin-only control plane for ERP activation, period close, immutable journal reversals and audit history.
        </p>
      </div>

      {notice ? <div className="rounded-md border bg-muted/40 p-3 text-sm">{notice}</div> : null}

      <Tabs defaultValue="rollout">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="rollout">Rollout Gates</TabsTrigger>
          <TabsTrigger value="periods">Accounting Periods</TabsTrigger>
          <TabsTrigger value="journals">Journals & Reversals</TabsTrigger>
          <TabsTrigger value="audit">Audit Ledger</TabsTrigger>
        </TabsList>

        <TabsContent value="rollout" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {flagRows.map((flag) => (
              <Card key={flag.key}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{flag.label}</span>
                    <Badge variant={flag.value ? "default" : "outline"}>{flag.value ? "ON" : "OFF"}</Badge>
                  </CardTitle>
                  <CardDescription>{flag.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant={flag.value ? "outline" : "default"}
                    onClick={() => setPending({ type: "flag", key: flag.key, value: !flag.value })}
                  >
                    {flag.value ? <ToggleLeft className="h-4 w-4" /> : <ToggleRight className="h-4 w-4" />}
                    Turn {flag.value ? "OFF" : "ON"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-4 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            Runtime gates are enforced in PostgreSQL. Hiding a button in the browser cannot bypass posting or synchronization controls.
          </div>
        </TabsContent>

        <TabsContent value="periods" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Status</TableHead><TableHead>Closed At</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(periods.data ?? []).map((period) => (
                    <TableRow key={period.id}>
                      <TableCell className="font-medium">{period.period_code}</TableCell>
                      <TableCell>{period.period_start}</TableCell>
                      <TableCell>{period.period_end}</TableCell>
                      <TableCell><Badge variant="outline">{period.status}</Badge></TableCell>
                      <TableCell>{period.closed_at ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {period.status !== "CLOSED" ? (
                          <Button size="sm" variant="outline" onClick={() => setPending({ type: "close", periodId: period.id, periodCode: period.period_code })}>
                            Close Period
                          </Button>
                        ) : "Closed"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!periods.isLoading && !(periods.data ?? []).length ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No accounting periods configured.</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="journals" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Journal</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead><TableHead>Reversal Of</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(journals.data ?? []).map((journal) => (
                    <TableRow key={journal.id}>
                      <TableCell>{journal.accounting_date}</TableCell>
                      <TableCell className="font-mono text-xs">{journal.journal_number}</TableCell>
                      <TableCell>{journal.description ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline">{journal.status}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{journal.reversal_of_journal_id ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {journal.status === "POSTED" && !journal.reversal_of_journal_id ? (
                          <Button size="sm" variant="destructive" onClick={() => setPending({ type: "reverse", journalId: journal.id, journalNumber: journal.journal_number })}>Reverse</Button>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead>Timestamp</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Record</TableHead><TableHead>Reason</TableHead><TableHead>Change</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(audit.data ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.timestamp ?? row.created_at ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline">{row.action}</Badge></TableCell>
                      <TableCell>{row.table_name ?? row.entity_type ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.record_id ?? row.entity_id ?? "—"}</TableCell>
                      <TableCell>{row.reason ?? row.notes ?? "—"}</TableCell>
                      <TableCell>
                        <details>
                          <summary className="cursor-pointer text-xs font-medium">View diff</summary>
                          <pre className="mt-2 max-w-md overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-[11px]">
                            {prettyJson({ before: row.old_data ?? row.before_data, after: row.new_data ?? row.after_data })}
                          </pre>
                        </details>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(pending)} onOpenChange={(open) => { if (!open) { setPending(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.type === "flag" ? "Change ERP rollout gate" : pending?.type === "reverse" ? "Reverse posted journal" : "Close accounting period"}
            </DialogTitle>
            <DialogDescription>
              This is a privileged accounting action. A reason is mandatory and will be stored in the audit ledger.
            </DialogDescription>
          </DialogHeader>
          <textarea className="min-h-28 rounded-md border border-input bg-background p-3 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for this accounting control action" />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPending(null); setReason(""); }}>Cancel</Button>
            <Button disabled={!reason.trim() || busy} variant={pending?.type === "reverse" ? "destructive" : "default"} onClick={executePending}>
              {busy ? "Applying…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
