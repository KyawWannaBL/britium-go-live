export type DraftSaveInput = {
  draftId?: string | null;
  merchantCode?: string | null;
  merchantName?: string | null;
  payload?: Record<string, unknown>;
};

function normalizeRole(role: unknown) {
  return String(role ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/^superadmin$/, "super_admin");
}

export function canAccessInvoices(role: unknown) {
  const normalized = normalizeRole(role);
  return normalized === "finance" || normalized === "super_admin";
}

export function buildDraftSaveRequest({
  draftId = null,
  merchantCode = "",
  merchantName = "",
  payload = {},
}: DraftSaveInput = {}) {
  return {
    draftId,
    merchantCode: String(merchantCode || "").trim() || null,
    merchantName: String(merchantName || "").trim() || null,
    payload,
    status: "DRAFT" as const,
    submit: false,
    generateWaybill: false,
  };
}

export function buildBatchSubmission(
  drafts: Array<{ id?: string | null; status?: string | null; merchantCode?: string | null }> = []
) {
  const eligible = drafts.filter(
    (draft) => String(draft?.status || "").toUpperCase() === "DRAFT" && draft?.id
  );
  const draftIds = eligible.map((draft) => String(draft.id));
  const merchants = new Set(
    eligible.map((draft) => String(draft?.merchantCode || "").trim()).filter(Boolean)
  );
  return {
    draftIds,
    merchantCount: merchants.size,
    draftCount: draftIds.length,
  };
}
