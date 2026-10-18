export const MAX_RIDER_PROOF_BYTES = 950_000;
export const RIDER_UPLOAD_TIMEOUT_MS = 120_000;

type WorkerResponse = {
  id: string;
  ok: boolean;
  buffer?: ArrayBuffer;
  error?: string;
};

async function compressOnMainThread(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Cannot read camera photo. Please retake or select from Gallery."));
      image.src = url;
    });
    const maxEdge = Math.max(image.naturalWidth, image.naturalHeight);
    if (!maxEdge) throw new Error("The captured photo is empty.");
    let scale = Math.min(1, 1600 / maxEdge);
    let quality = 0.8;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This device cannot process the photo.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error("Photo conversion failed.")), "image/jpeg", quality);
      });
      canvas.width = 1;
      canvas.height = 1;
      if (blob.size < MAX_RIDER_PROOF_BYTES) {
        const basename = file.name.replace(/\.[^.]+$/, "") || "proof";
        return new File([blob], basename + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
      }
      quality = Math.max(0.42, quality - 0.06);
      scale *= 0.78;
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    throw new Error("Photo exceeds upload limit. Please retake it at a lower resolution.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressRiderPhoto(file: File, signal?: AbortSignal): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed.");
  if (signal?.aborted) throw new DOMException("Photo operation cancelled.", "AbortError");
  // Android 8 / Redmi 9A WebViews can lack module workers, OffscreenCanvas or createImageBitmap.
  // Fall back to DOM canvas, preserving the selected camera image and the current screen.
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") {
    return compressOnMainThread(file);
  }
  let worker: Worker;
  try {
    worker = new Worker(new URL("../workers/photoCompression.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return compressOnMainThread(file);
  }
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random();
  try {
    const buffer = await file.arrayBuffer();
    const response = await new Promise<WorkerResponse>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        callback();
      };
      const abort = () => finish(() => reject(new DOMException("Photo operation cancelled.", "AbortError")));
      timer = setTimeout(() => finish(() => reject(new Error("Photo compression timed out."))), 30000);
      if (signal?.aborted) return abort();
      signal?.addEventListener("abort", abort, { once: true });
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.id !== id) return;
        finish(() => resolve(event.data));
      };
      worker.onerror = () => finish(() => reject(new Error("Photo compression worker failed.")));
      worker.postMessage({ id, buffer, mimeType: file.type }, [buffer]);
    });
    if (!response.ok || !response.buffer) return compressOnMainThread(file);
    if (response.buffer.byteLength >= MAX_RIDER_PROOF_BYTES) return compressOnMainThread(file);
    const basename = file.name.replace(/\.[^.]+$/, "") || "proof";
    return new File([response.buffer], basename + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
  } catch (error) {
    if (signal?.aborted) throw error;
    return compressOnMainThread(file);
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

function isDuplicateStorageObjectError(error: unknown) {
  const candidate = error as { status?: number | string; statusCode?: number | string; message?: string } | null | undefined;
  const status = Number(candidate?.statusCode ?? candidate?.status ?? 0);
  const message = String(candidate?.message ?? error ?? "").toLowerCase();
  return status === 409 || message.includes("already exists") || message.includes("duplicate");
}

export async function confirmRiderStorageUpload<T extends { error?: unknown }>(options: {
  path: string;
  pending: Map<string, PromiseLike<T>>;
  objectExists: () => Promise<boolean>;
  upload: () => PromiseLike<T>;
  timeoutMs?: number;
}) {
  // Rider storage policy grants INSERT but intentionally does not grant bucket listing.
  // Never make list()/SELECT a prerequisite for a valid upload. Existence checks are
  // best-effort reconciliation only after an upload error or timeout.
  const objectExistsIfReadable = async () => {
    try {
      return await options.objectExists();
    } catch {
      return false;
    }
  };

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
    if (result.error) {
      if (isDuplicateStorageObjectError(result.error) || await objectExistsIfReadable()) return;
      throw result.error;
    }
  } catch (error) {
    if (isDuplicateStorageObjectError(error) || await objectExistsIfReadable()) return;
    throw error;
  }
}
