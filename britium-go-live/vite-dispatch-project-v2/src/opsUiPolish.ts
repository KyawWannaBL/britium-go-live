function routeName() {
  return window.location.hash
    .replace(/^#\/?/, "")
    .split(/[/?]/)[0]
    .trim();
}

function findText(text: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(
    "h1,h2,h3,h4,div,span,label",
  );

  for (const node of nodes) {
    if (node.textContent?.trim() === text) {
      return node;
    }
  }

  return null;
}

function cardFor(node: HTMLElement | null): HTMLElement | null {
  if (!node) return null;

  return (
    node.closest<HTMLElement>("section") ||
    node.closest<HTMLElement>("article") ||
    node.closest<HTMLElement>('[class*="rounded-"]') ||
    node.parentElement?.parentElement ||
    null
  );
}

function commonParent(
  elements: Array<HTMLElement | null>,
): HTMLElement | null {
  const valid = elements.filter(Boolean) as HTMLElement[];
  if (!valid.length) return null;

  let candidate: HTMLElement | null = valid[0].parentElement;

  while (candidate) {
    if (valid.every((element) => candidate?.contains(element))) {
      return candidate;
    }

    candidate = candidate.parentElement;
  }

  return null;
}

function applyUiMarkers() {
  document.body.dataset.beRoute = routeName();

  const warehouseScan = cardFor(findText("Scan Control"));
  const warehouseClose = cardFor(
    findText("End Day Close / Auto Drop-off"),
  );
  const warehouseRows = cardFor(
    findText("Warehouse Queue Rows"),
  );

  if (warehouseScan) {
    warehouseScan.dataset.bePanel = "warehouse-scan";
  }

  if (warehouseClose) {
    warehouseClose.dataset.bePanel = "warehouse-close";
  }

  if (warehouseRows) {
    warehouseRows.dataset.bePanel = "warehouse-rows";
  }

  const parcelPool = cardFor(findText("Parcel Pool"));
  const fleetBoard = cardFor(
    findText("Fleet Assignment Board"),
  );
  const statusBoard = cardFor(findText("Status Board"));

  if (parcelPool) parcelPool.dataset.bePanel = "parcel-pool";
  if (fleetBoard) fleetBoard.dataset.bePanel = "fleet-board";
  if (statusBoard) statusBoard.dataset.bePanel = "status-board";

  const dispatchLayout = commonParent([
    parcelPool,
    fleetBoard,
    statusBoard,
  ]);

  if (dispatchLayout) {
    dispatchLayout.dataset.beLayout = "dispatch-board";
  }

  const liveRecords = cardFor(findText("Live Records"));

  if (liveRecords) {
    liveRecords.dataset.bePanel = "live-records";
  }
}

let observer: MutationObserver | null = null;

function start() {
  applyUiMarkers();

  observer?.disconnect();
  observer = new MutationObserver(() => applyUiMarkers());

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

window.addEventListener("hashchange", start);
window.addEventListener("load", start);

queueMicrotask(start);
