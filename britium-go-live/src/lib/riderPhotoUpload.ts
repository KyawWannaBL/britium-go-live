export const MAX_RIDER_PROOF_BYTES = 950_000;
export const RIDER_UPLOAD_TIMEOUT_MS = 120_000;

type WorkerResponse = {
  id: string;
  ok: boolean;
  buffer?: ArrayBuffer;
  error?: string;
};

export async function compressRiderPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed.");
  const worker = new Worker(new URL("../workers/photoCompression.worker.ts", import.meta.url), { type: "module" });
  const id = crypto.randomUUID();
  try {
    const buffer = await file.arrayBuffer();
    const response = await new Promise<WorkerResponse>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Photo compression timed out. Please retry.")), 60_000);
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.id !== id) return;
        window.clearTimeout(timer);
        resolve(event.data);
      };
      worker.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("Photo compression worker failed. Please retry or capture a new photo."));
      };
      worker.postMessage({ id, buffer, mimeType: file.type }, [buffer]);
    });
    if (!response.ok || !response.buffer) throw new Error(response.error || "Photo compression failed.");
    if (response.buffer.byteLength >= MAX_RIDER_PROOF_BYTES) throw new Error("Photo must be below 1 MB.");
    const basename = file.name.replace(/\.[^.]+$/, "") || "proof";
    return new File([response.buffer], `${basename}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    worker.terminate();
  }
}

export async function withRiderUploadTimeout<T>(request: PromiseLike<T>, timeoutMs = RIDER_UPLOAD_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Photo upload timed out after 120 seconds. Check your connection and retry; nothing was saved.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
