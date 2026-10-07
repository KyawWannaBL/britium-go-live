import { supabase } from "@/integrations/supabase/client";

const bucket = "merchant-settlement-receipts";
const marker = `/storage/v1/object/authenticated/${bucket}/`;
const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

export async function uploadSettlementReceipt(file: File) {
  const extension = extensions[file.type];
  if (!extension) throw new Error("Choose a JPG, PNG or PDF receipt.");
  if (!file.size) throw new Error("The receipt file is empty.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Receipt must be 10 MB or smaller.");
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("Please sign in again before uploading a receipt.");
  const path = `${auth.user.id}/${crypto.randomUUID()}.${extension}`;
  const storage = supabase.storage.from(bucket);
  const { error } = await storage.upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error(error.message);
  // Store the permanent object locator. Generate a fresh, short-lived viewing URL on demand.
  const url = storage.getPublicUrl(path).data.publicUrl.replace(`/object/public/${bucket}/`, `/object/authenticated/${bucket}/`);
  return { url, filename: file.name };
}

export async function resolveSettlementReceipt(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Receipt must use HTTPS.");
  const index = parsed.pathname.indexOf(marker);
  if (index < 0) return url;
  const path = decodeURIComponent(parsed.pathname.slice(index + marker.length));
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Unable to open receipt.");
  return data.signedUrl;
}
