import "@/styles/dataEntryFocus.css";

const PHOTO_CHECK_PREFIX = "be_data_entry_photo_checked:";
let rowSyncBusy = false;

function txt(value: any) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pageText() {
  return txt(document.body?.innerText || "");
}

function isDataEntryPage() {
  const url = `${location.pathname} ${location.hash}`.toLowerCase();
  const body = pageText().toLowerCase();

  return (
    url.includes("data-entry") ||
    body.includes("data entry template") ||
    body.includes("confirm") && body.includes("waybill")
  );
}

function hasSelectedPickup() {
  const body = pageText();

  const hasPickupCode = /P\d{4,}-[A-Z0-9]+-\d+/i.test(body);
  const hasTemplate = /DATA ENTRY TEMPLATE/i.test(body);
  const hasPhotos = /RIDER/i.test(body) && /PHOTO/i.test(body);

  return isDataEntryPage() && hasPickupCode && hasTemplate && hasPhotos;
}

function selectedPickupId() {
  const match = pageText().match(/P\d{4,}-[A-Z0-9]+-\d+/i);
  return match?.[0] || "selected-pickup";
}

function parseTargetLineCount() {
  const body = pageText();

  const m1 = body.match(/(\d+)\s*\/\s*(\d+)\s*rider\s+photos\s+checked/i);
  if (m1?.[2]) return Number(m1[2]);

  const m2 = body.match(/Photos:\s*(\d+)\s*\/\s*(\d+)/i);
  if (m2?.[2]) return Number(m2[2]);

  const m3 = body.match(/(\d+)\s*\/\s*(\d+)\s*Parcels/i);
  if (m3?.[2]) return Number(m3[2]);

  const m4 = body.match(/Parcels:\s*(\d+)/i);
  if (m4?.[1]) return Number(m4[1]);

  const m5 = body.match(/PARCELS\s+(\d+)/i);
  if (m5?.[1]) return Number(m5[1]);

  return 0;
}

function closestBlockByText(patterns: RegExp[]) {
  const blocks = Array.from(document.querySelectorAll("section, form, header, div")) as HTMLElement[];

  return blocks
    .filter((el) => {
      const t = txt(el.innerText);
      if (!t) return false;
      return patterns.every((p) => p.test(t));
    })
    .sort((a, b) => a.innerText.length - b.innerText.length)[0] || null;
}

function markZones() {
  const workspace =
    document.querySelector("main") ||
    document.querySelector("#root") ||
    document.body;

  if (workspace instanceof HTMLElement) {
    workspace.dataset.beDataEntryWorkspace = "true";
  }

  const topDateTools = closestBlockByText([
    /FROM DATE|TO DATE|REGISTER TEMPLATE|UPLOAD|REPORT|mm\/dd\/yyyy|တင်/i,
  ]);

  const pickupSelector = closestBlockByText([
    /SELECT VERIFIED PICKUP REQUEST|PICKUP|REGISTER NOW|LOAD RIDER|RIDER/i,
  ]);

  if (topDateTools) topDateTools.dataset.beHideDuringDataEntry = "true";
  if (pickupSelector) pickupSelector.dataset.beHideDuringDataEntry = "true";

  const photoZone = closestBlockByText([/RIDER/i, /PHOTO/i, /Open rider photo|Photos:/i]);
  if (photoZone) photoZone.dataset.bePhotoZone = "true";

  const templateZone = closestBlockByText([/DATA ENTRY TEMPLATE/i, /RECIPIENT NAME|CONTACT NO|TOWNSHIP/i]);
  if (templateZone) templateZone.dataset.beTemplateZone = "true";

  const footer = closestBlockByText([
    /rider photos checked|CONFIRM|WAYBILL|CREATE/i,
  ]);

  if (footer) footer.dataset.beDataEntryFooter = "true";
}

function templateZone() {
  return document.querySelector("[data-be-template-zone='true']") as HTMLElement | null;
}

function photoZone() {
  return document.querySelector("[data-be-photo-zone='true']") as HTMLElement | null;
}

function footerBlock() {
  return document.querySelector("[data-be-data-entry-footer='true']") as HTMLElement | null;
}

function countTemplateRows() {
  const zone = templateZone();
  if (!zone) return 0;

  const nameInputs = Array.from(zone.querySelectorAll("input, textarea")).filter((el) => {
    const input = el as HTMLInputElement;
    const placeholder = txt(input.placeholder).toLowerCase();
    const aria = txt(input.getAttribute("aria-label")).toLowerCase();
    return placeholder.includes("name") || aria.includes("recipient name");
  });

  if (nameInputs.length) return nameInputs.length;

  const rows = Array.from(zone.querySelectorAll("tr, [data-row], [class*='row']")) as HTMLElement[];
  return rows.filter((row) => /Name|09|Full recipient address|Township/i.test(row.innerText || "")).length;
}

function findAddExtraRowButton() {
  const nodes = Array.from(document.querySelectorAll("button, a, [role='button'], div")) as HTMLElement[];

  return nodes
    .filter((node) => {
      const t = txt(node.innerText).toLowerCase();
      if (!t) return false;
      if (t.includes("add extra row")) return true;
      if (t.startsWith("+") && t.length < 80) return true;
      if (t.includes("အတန်း") || t.includes("ထပ်")) return true;
      return false;
    })
    .sort((a, b) => a.innerText.length - b.innerText.length)[0] || null;
}

function expandAllTemplateFrames() {
  const zone = templateZone();
  if (!zone) return;

  const target = parseTargetLineCount();
  const expectedHeight = target > 0 ? Math.max(520, target * 92 + 170) : 900;

  zone.style.width = "100%";
  zone.style.maxWidth = "none";
  zone.style.height = "auto";
  zone.style.minHeight = `${expectedHeight}px`;
  zone.style.maxHeight = "none";
  zone.style.overflowY = "visible";
  zone.style.overflowX = "auto";

  const candidates = Array.from(zone.querySelectorAll("div, section, article, tbody, table")) as HTMLElement[];

  candidates.forEach((el) => {
    const isScrollable = el.scrollHeight > el.clientHeight + 12;
    const isNarrowFrame = el.clientHeight > 0 && el.clientHeight < expectedHeight;

    el.style.maxHeight = "none";

    if (isScrollable && isNarrowFrame) {
      el.style.height = `${Math.max(el.scrollHeight + 20, expectedHeight)}px`;
      el.style.overflowY = "visible";
    }
  });

  const rows = Array.from(zone.querySelectorAll("tr, [class*='row'], [data-row]")) as HTMLElement[];
  rows.forEach((row) => {
    row.classList.add("be-data-entry-row-expanded");
    row.style.maxHeight = "none";
    row.style.overflow = "visible";
  });
}

async function ensureRowCountEqualsDeliveryWays() {
  if (rowSyncBusy) return;
  if (!hasSelectedPickup()) return;

  const target = parseTargetLineCount();
  if (!target || target < 1) return;

  rowSyncBusy = true;

  try {
    for (let i = 0; i < target + 2; i += 1) {
      markZones();
      expandAllTemplateFrames();

      const current = countTemplateRows();
      if (current >= target) break;

      const addBtn = findAddExtraRowButton();
      if (!addBtn) break;

      addBtn.click();
      await new Promise((resolve) => window.setTimeout(resolve, 140));
    }

    expandAllTemplateFrames();
    moveFooterToEnd();
  } finally {
    rowSyncBusy = false;
  }
}

function moveFooterToEnd() {
  const workspace = document.querySelector("[data-be-data-entry-workspace='true']") as HTMLElement | null;
  const footer = footerBlock();
  const zone = templateZone();

  if (!workspace || !footer || !zone) return;

  footer.classList.add("be-data-entry-footer-final");
  workspace.appendChild(footer);
}

function showToast(message: string) {
  let toast = document.querySelector(".be-photo-check-toast") as HTMLElement | null;

  if (!toast) {
    toast = document.createElement("div");
    toast.className = "be-photo-check-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");

  window.setTimeout(() => {
    toast?.classList.remove("show");
  }, 1300);
}

function findPhotoCards() {
  const links = Array.from(document.querySelectorAll("a, button")) as HTMLElement[];

  const photoLinks = links.filter((el) => /open rider photo/i.test(el.innerText || ""));

  const cards: HTMLElement[] = [];

  photoLinks.forEach((link) => {
    const card =
      link.closest("article") ||
      link.closest("[class*='card']") ||
      link.closest("[class*='job']") ||
      link.parentElement?.parentElement;

    if (card instanceof HTMLElement && !cards.includes(card)) {
      card.dataset.beRiderPhotoCard = "true";
      cards.push(card);
    }
  });

  return cards;
}

function attachPhotoCheckedUX() {
  const pickup = selectedPickupId();

  findPhotoCards().forEach((card) => {
    const text = txt(card.innerText);
    const photoId = text.match(/D\d{4,}-[A-Z0-9]+-\d+/i)?.[0] || text.slice(0, 60);
    const key = `${PHOTO_CHECK_PREFIX}${pickup}:${photoId}`;

    if (localStorage.getItem(key) === "1") {
      card.classList.add("be-photo-checked");
    }

    if (card.dataset.bePhotoClickBound === "true") return;
    card.dataset.bePhotoClickBound = "true";

    card.addEventListener(
      "click",
      () => {
        localStorage.setItem(key, "1");
        card.classList.add("be-photo-checked");
        showToast(`Photo checked · ${photoId}`);
      },
      true,
    );
  });
}

function syncHorizontalScrollbars() {
  const zone = templateZone();
  if (!zone || zone.dataset.beScrollSyncBound === "true") return;

  zone.dataset.beScrollSyncBound = "true";

  const scrollers = Array.from(zone.querySelectorAll("div")) as HTMLElement[];
  const horizontal = scrollers.filter((el) => el.scrollWidth > el.clientWidth + 80);

  horizontal.forEach((el) => {
    el.addEventListener("scroll", () => {
      horizontal.forEach((other) => {
        if (other !== el && Math.abs(other.scrollLeft - el.scrollLeft) > 3) {
          other.scrollLeft = el.scrollLeft;
        }
      });
    });
  });
}

function setFocusMode(active: boolean) {
  document.body.classList.toggle("be-data-entry-focus-mode", active);

  let pill = document.querySelector(".be-data-entry-wide-pill") as HTMLElement | null;

  if (!active) {
    pill?.remove();
    return;
  }

  if (!pill) {
    pill = document.createElement("div");
    pill.className = "be-data-entry-wide-pill";
    pill.textContent = "Full Screen Data Entry";
    document.body.appendChild(pill);
  }
}

function updateDataEntryMode() {
  const active = hasSelectedPickup();

  setFocusMode(active);

  if (!active) return;

  markZones();
  expandAllTemplateFrames();
  attachPhotoCheckedUX();
  syncHorizontalScrollbars();
  moveFooterToEnd();

  window.setTimeout(() => {
    void ensureRowCountEqualsDeliveryWays();
  }, 160);
}

function start() {
  updateDataEntryMode();

  const observer = new MutationObserver(() => {
    window.setTimeout(updateDataEntryMode, 80);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.addEventListener("hashchange", () => window.setTimeout(updateDataEntryMode, 160));
  window.addEventListener("resize", () => window.setTimeout(updateDataEntryMode, 160));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
