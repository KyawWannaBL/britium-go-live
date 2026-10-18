export const MAX_PROOF_BYTES = 950_000;
export const PROOF_UPLOAD_TIMEOUT_MS = 30_000;

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Photo compression failed."))),
      "image/jpeg",
      quality,
    ),
  );
}

function decodePhotoWithImage(file: File): Promise<{ image: HTMLImageElement; dispose: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        URL.revokeObjectURL(url);
        reject(new Error("Camera photo is empty or unreadable."));
        return;
      }
      resolve({ image, dispose: () => URL.revokeObjectURL(url) });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Cannot open the camera photo. Try a JPEG photo or choose from Gallery."));
    };
    image.src = url;
  });
}

/** Compress camera photos below the storage limit, yielding between passes to keep the UI responsive. */
export async function compressProofPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Only image proof files are allowed.");
  await yieldToUi();
  // Older Android WebViews (including Android 8 devices) may not implement
  // createImageBitmap or may reject images returned by the native camera.
  // Use an HTMLImageElement fallback without losing the selected photo.
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let dispose = () => {};
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      source = bitmap;
      width = bitmap.width;
      height = bitmap.height;
      dispose = () => bitmap.close();
    } catch {
      const fallback = await decodePhotoWithImage(file);
      source = fallback.image;
      width = fallback.image.naturalWidth;
      height = fallback.image.naturalHeight;
      dispose = fallback.dispose;
    }
  } else {
    const fallback = await decodePhotoWithImage(file);
    source = fallback.image;
    width = fallback.image.naturalWidth;
    height = fallback.image.naturalHeight;
    dispose = fallback.dispose;
  }
  let scale = Math.min(1, 2048 / Math.max(width, height));
  let quality = 0.86;
  try {
    for (let pass = 0; pass < 8; pass += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Photo compression is unavailable on this device.");
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const blob = await canvasBlob(canvas, quality);
      if (blob.size < MAX_PROOF_BYTES) {
        const basename = file.name.replace(/\.[^.]+$/, "") || "proof";
        return new File([blob], `${basename}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
      }
      quality = Math.max(0.52, quality - 0.08);
      scale *= 0.82;
      await yieldToUi();
    }
  } finally {
    dispose();
  }
  throw new Error("The photo could not be compressed below 1 MB. Please retake it at a lower resolution.");
}

export async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = PROOF_UPLOAD_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Photo upload timed out. Check your connection and retry; the delivery was not saved.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
