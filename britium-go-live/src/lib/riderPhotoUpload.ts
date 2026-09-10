export const MAX_RIDER_PROOF_BYTES = 950_000;
export const RIDER_UPLOAD_TIMEOUT_MS = 120_000;

type WorkerResponse = {
  id: string;
  ok: boolean;
  buffer?: ArrayBuffer;
  error?: string;
};

export async function compressRiderPhoto(file: File, signal?: AbortSignal): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed.");
  const worker = new Worker(new URL("../workers/photoCompression.worker.ts", import.meta.url), { type: "module" });
  const id = crypto.randomUUID();
  try {
    const buffer = await file.arrayBuffer();
    const response = await new Promise<WorkerResponse>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        callback();
      };
      const abort = () => finish(() => reject(new DOMException("Photo operation cancelled.", "AbortError")));
      const timer = window.setTimeout(() => finish(() => reject(new Error("Photo compression timed out. Please retry."))), 60_000);
      if (signal?.aborted) return abort();
      signal?.addEventListener("abort", abort, { once: true });
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.id !== id) return;
        finish(() => resolve(event.data));
      };
      worker.onerror = () => {
        finish(() => reject(new Error("Photo compression worker failed. Please retry or capture a new photo.")));
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
        timer = setTimeout(() => reject(new Error("Upload confirmation timed out. The upload may have completed. Check its status before retrying.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function confirmRiderStorageUpload<T extends { error?: unknown }>(options: {
  path: string;
  pending: Map<string, PromiseLike<T>>;
  objectExists: () => Promise<boolean>;
  upload: () => PromiseLike<T>;
  timeoutMs?: number;
}) {
  if (await options.objectExists()) return;
  let request = options.pending.get(options.path);
  if (!request) {
    request = options.upload();
    options.pending.set(options.path, request);
    void Promise.resolve(request).then(
      () => { if (options.pending.get(options.path) === request) options.pending.delete(options.path); },
      () => { if (options.pending.get(options.path) === request) options.pending.delete(options.path); },
    );
  }
  try {
    const result = await withRiderUploadTimeout(request, options.timeoutMs);
    if (result.error && !(await options.objectExists())) throw result.error;
  } catch (error) {
    if (!(await options.objectExists())) throw error;
  }
}
