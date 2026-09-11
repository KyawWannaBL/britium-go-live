/** Render an authorized release without reopening the popup's document stream. */
export async function renderAuthorizedPrint(
  win: Window,
  html: string,
  expectedLabels: number,
  assetTimeoutMs = 15000,
) {
  if (win.closed) throw new Error("The print window was closed. Check release history before retrying.");
  const doc = win.document;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  if (parsed.querySelectorAll(".be-label").length !== expectedLabels || expectedLabels < 1) {
    throw new Error("The print preview is incomplete. Check release history before retrying.");
  }
  doc.head.replaceChildren(...Array.from(parsed.head.childNodes).map(node => doc.importNode(node, true)));
  doc.body.replaceChildren(...Array.from(parsed.body.childNodes).map(node => doc.importNode(node, true)));
  const style = doc.createElement("style");
  style.textContent = "@media screen{body{background:#e2e8f0!important}.sheet{margin:16px auto}.print-controls{position:sticky;top:0;padding:16px;background:#fff;color:#111;z-index:10;font:16px Arial}.print-controls button{padding:12px;margin-right:12px}}@media print{.print-controls{display:none!important}}";
  doc.head.append(style);
  const controls = doc.createElement("div");
  controls.className = "print-controls";
  const button = doc.createElement("button");
  button.textContent = "Print / Save PDF";
  button.disabled = true;
  const status = doc.createElement("span");
  status.textContent = "Preparing labels and barcodes…";
  controls.append(button, status);
  doc.body.prepend(controls);

  let used = false;
  button.addEventListener("click", () => {
    if (used || button.disabled || win.closed) return;
    used = true;
    button.disabled = true;
    status.textContent = "Choose your printer or Save as PDF in the print dialog. This release can be used once.";
    try { win.focus(); win.print(); }
    catch {
      status.textContent = "The browser could not open printing. This release was already authorized; request a reprint with the failure reason.";
    }
  });
  win.addEventListener("afterprint", () => {
    doc.querySelectorAll(".sheet").forEach(sheet => sheet.remove());
    button.disabled = true;
    status.textContent = "Print dialog closed. If printing or saving failed, request a reprint with the reason in Waybill Studio.";
  }, { once: true });

  const images = Array.from(doc.images);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cleanups: Array<() => void> = [];
  try {
    await Promise.race([
      Promise.all([
        doc.fonts?.ready ?? Promise.resolve(),
        ...images.map(image => new Promise<void>(resolve => {
          if (image.complete) { resolve(); return; }
          const done = () => { image.removeEventListener("load", done); image.removeEventListener("error", done); resolve(); };
          cleanups.push(done);
          image.addEventListener("load", done);
          image.addEventListener("error", done);
        })),
      ]),
      new Promise<void>(resolve => { timer = setTimeout(resolve, assetTimeoutMs); }),
    ]);
    if (win.closed) return;
    const failed = images.filter(image => !image.complete || image.naturalWidth === 0);
    if (failed.length) {
      status.textContent = failed.length + " barcode/QR image(s) could not load. Printing is blocked to avoid unusable labels. Check the connection and request a reprint with this reason.";
      return;
    }
    status.textContent = expectedLabels + " label(s) ready. Click Print / Save PDF, then choose Save as PDF or your printer.";
    button.disabled = false;
  } finally {
    if (timer) clearTimeout(timer);
    cleanups.forEach(cleanup => cleanup());
  }
}
