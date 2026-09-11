const MAX_PROOF_BYTES = 950_000;

type CompressionRequest = {
  id: string;
  buffer: ArrayBuffer;
  mimeType: string;
};

self.onmessage = async (event: MessageEvent<CompressionRequest>) => {
  const { id, buffer, mimeType } = event.data;
  try {
    const bitmap = await createImageBitmap(new Blob([buffer], { type: mimeType }));
    let scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    let quality = 0.88;

    try {
      for (let pass = 0; pass < 10; pass += 1) {
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Photo compression is unavailable on this device.");
        context.drawImage(bitmap, 0, 0, width, height);
        const output = await canvas.convertToBlob({ type: "image/jpeg", quality });
        if (output.size < MAX_PROOF_BYTES) {
          const compressed = await output.arrayBuffer();
          self.postMessage({ id, ok: true, buffer: compressed, size: output.size }, [compressed]);
          return;
        }
        quality = Math.max(0.45, quality - 0.07);
        scale *= 0.82;
      }
    } finally {
      bitmap.close();
    }
    throw new Error("The photo could not be compressed below 1 MB. Retake it at a lower resolution.");
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : "Photo compression failed.",
    });
  }
};

export {};
