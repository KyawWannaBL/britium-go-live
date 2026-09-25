import { LockKeyhole } from "lucide-react";

export function LockedSubmissionBanner({ submissionNo }: { submissionNo?: string }) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <div className="font-semibold">Entry Locked & Submitted to Vault</div>
        <div className="mt-1 text-sm text-amber-800">
          {submissionNo ? `${submissionNo} · ` : ""}
          This accounting source document is immutable. Contact Superadmin for a correction workflow.
        </div>
      </div>
    </div>
  );
}
