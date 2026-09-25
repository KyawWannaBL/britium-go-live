import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, PauseCircle, Search, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  useAccountingEventLines,
  useAccountingEvents,
  useAccountingFlags,
  usePostAccountingEvent,
  useReviewAccountingEvent,
} from "@/hooks/useAccounting";
import type { AccountingEvent, AccountingReviewAction, AccountingReviewStatus } from "@/types/accounting";

function money(value: unknown) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function statusVariant(status: AccountingReviewStatus) {
  if (status === "POSTED" || status === "APPROVED") return "default" as const;
  if (status === "REJECTED" || status === "SYNC_FAILED") return "destructive" as const;
  return "outline" as const;
}

function classification(event: AccountingEvent): "Clean" | "Warning" | "Blocked" | "Posted" {
  if (event.review_status === "POSTED") return "Posted";
  if (event.review_status === "REVIEW_PENDING") return "Clean";
  if (event.review_status === "NEEDS_REVIEW" || event.review_status === "HELD") return "Warning";
  return "Blocked";
}

export function FinanceReviewQueue() {
  const [status, setStatus] = useState<AccountingReviewStatus | "">("REVIEW_PENDING");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AccountingEvent | null>(null);
  const [pendingAction, setPendingAction] = useState<AccountingReviewAction | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");

  const flags = useAccountingFlags();
  const events = useAccountingEvents({ status, dateFrom, dateTo, search, limit: 500 });
  const lines = useAccountingEventLines(selected?.id);
  const review = useReviewAccountingEvent();
  const post = usePostAccountingEvent();

  const selectedTotals = useMemo(() => {
    const rows = lines.data ?? [];
    return {
      debit: rows.reduce((sum, row) => sum + Number(row.debit_amount || 0), 0),
      credit: rows.reduce((sum, row) => sum + Number(row.credit_amount || 0), 0),
    };
  }, [lines.data]);

  async function approveAndMaybePost(event: AccountingEvent) {
    setNotice("");
    try {
      if (event.review_status !== "APPROVED") {
        await review.mutateAsync({
          eventId: event.id,
          action: "APPROVE",
          reason: "Finance Review Queue approval",
        });
      }

      if (flags.data?.postingEnabled) {
        const result = await post.mutateAsync(event.id);
        setNotice(result.code === "ALREADY_POSTED"
          ? `Already posted as ${result.journal_number ?? "existing journal"}.`
          : `Posted as ${result.journal_number ?? "journal"}.`);
      } else {
        setNotice("Approved. General Ledger posting remains disabled by the rollout gate.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Accounting approval failed.");
    }
  }

  async function applyReasonAction() {
    if (!selected || !pendingAction || !reason.trim()) return;
    try {
      await review.mutateAsync({
        eventId: selected.id,
        action: pendingAction,
        reason: reason.trim(),
      });
      setNotice(`${pendingAction} saved for ${selected.source_reference || selected.source_record_id}.`);
      setPendingAction(null);
      setReason("");
      setSelected(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Review action failed.");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Finance Review Queue</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Operational events are reviewed here before they affect the General Ledger.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-5">
            <label className="grid gap-1 text-xs font-medium">
              Date From
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Date To
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Status
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value as AccountingReviewStatus | "")}>
                <option value="">All</option>
                {["REVIEW_PENDING","NEEDS_REVIEW","HELD","APPROVED","POSTED","REJECTED","SYNC_FAILED"].map((value) => (
                  <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium md:col-span-2">
              Way ID / source reference
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search source reference…" />
              </div>
            </label>
          </div>
        </CardContent>
      </Card>

      {notice ? <div className="rounded-md border bg-muted/40 p-3 text-sm">{notice}</div> : null}
      {events.error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{events.error.message}</div> : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Accounting events</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Event</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Class</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Loading accounting events…</TableCell></TableRow>
              ) : !(events.data ?? []).length ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No events match the current filters.</TableCell></TableRow>
              ) : (events.data ?? []).map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{event.event_date}</TableCell>
                  <TableCell>{event.source_system}</TableCell>
                  <TableCell className="font-mono text-xs">{event.source_reference || event.source_record_id}</TableCell>
                  <TableCell>{event.event_type.replaceAll("_", " ")}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(event.total_amount)}</TableCell>
                  <TableCell><Badge variant={statusVariant(event.review_status)}>{event.review_status}</Badge></TableCell>
                  <TableCell>
                    <Badge variant="outline">{classification(event)}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelected(event)}>View</Button>
                      {["REVIEW_PENDING","NEEDS_REVIEW","APPROVED"].includes(event.review_status) ? (
                        <Button
                          size="sm"
                          disabled={review.isPending || post.isPending || event.review_status === "NEEDS_REVIEW"}
                          onClick={() => approveAndMaybePost(event)}
                        >
                          {flags.data?.postingEnabled ? "Approve & Post" : "Approve"}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Accounting Event</DialogTitle>
            <DialogDescription>
              {selected?.source_reference || selected?.source_record_id} · {selected?.event_type.replaceAll("_", " ")}
            </DialogDescription>
          </DialogHeader>

          {selected ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-md border p-4 text-sm md:grid-cols-3">
                <div><span className="text-muted-foreground">Source</span><div className="font-medium">{selected.source_system}</div></div>
                <div><span className="text-muted-foreground">Date</span><div className="font-medium">{selected.event_date}</div></div>
                <div><span className="text-muted-foreground">Status</span><div><Badge variant={statusVariant(selected.review_status)}>{selected.review_status}</Badge></div></div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(lines.data ?? []).map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.account ? `${line.account.account_code} · ${line.account.account_name}` : line.account_id}</TableCell>
                      <TableCell>{line.description || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{line.debit_amount ? money(line.debit_amount) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{line.credit_amount ? money(line.credit_amount) : "—"}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell colSpan={2}>Totals</TableCell>
                    <TableCell className="text-right">{money(selectedTotals.debit)}</TableCell>
                    <TableCell className="text-right">{money(selectedTotals.credit)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              {selectedTotals.debit !== selectedTotals.credit ? (
                <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Journal proposal is not balanced. Posting is blocked.
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {selected && ["REVIEW_PENDING","NEEDS_REVIEW"].includes(selected.review_status) ? (
                <>
                  <Button variant="outline" onClick={() => setPendingAction("HOLD")}>
                    <PauseCircle className="h-4 w-4" /> Hold
                  </Button>
                  <Button variant="destructive" onClick={() => setPendingAction("REJECT")}>
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                  <Button variant="outline" onClick={() => setPendingAction("INVESTIGATE")}>
                    <AlertTriangle className="h-4 w-4" /> Investigate
                  </Button>
                </>
              ) : null}
            </div>
            {selected && ["REVIEW_PENDING","APPROVED"].includes(selected.review_status) ? (
              <Button onClick={() => approveAndMaybePost(selected)} disabled={review.isPending || post.isPending || selectedTotals.debit !== selectedTotals.credit}>
                <CheckCircle2 className="h-4 w-4" />
                {flags.data?.postingEnabled ? "Approve & Post" : "Approve"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingAction)} onOpenChange={(open) => { if (!open) { setPendingAction(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingAction ? pendingAction.charAt(0) + pendingAction.slice(1).toLowerCase() : "Review"} accounting event</DialogTitle>
            <DialogDescription>A reason is required and will be stored in the audit ledger.</DialogDescription>
          </DialogHeader>
          <textarea
            className="min-h-28 rounded-md border border-input bg-background p-3 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason / investigation note"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPendingAction(null); setReason(""); }}>Cancel</Button>
            <Button disabled={!reason.trim() || review.isPending} onClick={applyReasonAction}>Save action</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
