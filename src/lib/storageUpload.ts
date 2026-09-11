import { supabase } from '@/integrations/supabase/client';

function fileExt(name: string) {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop() : 'bin';
}

export async function uploadFileToBucket(bucket: string, file: File, folder = 'uploads') {
  const ext = fileExt(file.name);
  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  });

  if (error) throw error;
  return path;
}

export async function uploadDataUrlToBucket(bucket: string, dataUrl: string, folder = 'uploads', filename = 'signature.png') {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const file = new File([blob], filename, { type: blob.type || 'image/png' });
  return uploadFileToBucket(bucket, file, folder);
}

export async function createSignedPreviewUrl(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
