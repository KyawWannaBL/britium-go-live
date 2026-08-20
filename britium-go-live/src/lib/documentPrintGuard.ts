import { supabase } from "@/lib/supabase/client";

type PrintGuardInput = {
  documentType: "WAYBILL" | "INVOICE" | "MANIFEST";
  documentNo: string;
  actorEmail?: string | null;
  actorRole?: string | null;
  reason?: string | null;
};

export async function guardedBrowserPrint(input: PrintGuardInput) {
  const { data, error } = await supabase.rpc("be_document_print_guard", {
    p_payload: {
      document_type: input.documentType,
      document_no: input.documentNo,
      actor_email: input.actorEmail,
      actor_role: input.actorRole,
      reason: input.reason || "Browser print from portal",
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = data as any;

  if (!result?.allowed) {
    throw new Error(
      result?.message ||
      result?.reason ||
      "Print blocked. Superadmin approval is required."
    );
  }

  window.print();

  return result;
}
