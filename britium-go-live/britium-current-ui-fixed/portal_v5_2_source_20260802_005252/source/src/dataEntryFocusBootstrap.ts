import "@/styles/dataEntryFocus.css";

let scheduled = false;
let applying = false;

function cleanText(v: any) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function bodyText() {
  return cleanText(document.body?.innerText || "");
}

function isDataEntryPage() {
  return `${location.pathname} ${location.hash}`.toLowerCase().includes("data-entry");
}

function hasSelectedPickup() {
  return /P\d{4,}-[A-Z0-9]+-\d+/i.test(bodyText());
}

function hasRegistrationWorkspace() {
  const t = bodyText();
  return /RIDER/i.test(t) && /DATA ENTRY TEMPLATE/i.test(t);
}

function isFocusEnabled() {
  return sessionStorage.getItem("be_data_entry_focus_enabled") === "1";
}

function setFocusEnabled(value: boolean) {
  if (value) {
    sessionStorage.setItem("be_data_entry_focus_enabled", "1");
  } else {
    sessionStorage.removeItem("be_data_entry_focus_enabled");
  }
}

function getDeliveryWayCount() {
  const t = bodyText();

  const patterns = [
    /Photos:\s*(\d+)\s*\/\s*(\d+)/i,
    /(\d+)\s*\/\s*(\d+)\s*rider\s+photos\s+checked/i,
    /(\d+)\s*\/\s*(\d+)\s*Parcels/i,
    /\b(\d+)\s*Parcels\b/i,
  ];

  for (const p of patterns) {
    const m = t.match(p);
    if (m?.[2]) return Number(m[2]);
    if (m?.[1]) return Number(m[1]);
  }

  return 0;
}

function ensureToggleBar() {
  if (!isDataEntryPage()) return;

  let bar = document.querySelector(".be-data-entry-toggle-bar") as HTMLElement | null;

  if (!bar) {
    bar = document.createElement("div");
    bar.className = "be-data-entry-toggle-bar";

    const enter = document.createElement("button");
    enter.type = "button";
    enter.className = "be-data-entry-enter-btn";
    enter.textContent = "Enter Full Screen Data Entry";
    enter.onclick = () => {
      setFocusEnabled(true);
      apply();
    };

    const exit = document.createElement("button");
    exit.type = "button";
    exit.className = "be-data-entry-exit-btn";
    exit.textContent = "Exit / Select Pickup";
    exit.onclick = () => {
      setFocusEnabled(false);
      document.body.classList.remove("be-data-entry-focus-mode");
      document.querySelectorAll("[data-be-hide-during-registration='true']").forEach((el) => {
        delete (el as HTMLElement).dataset.beHideDuringRegistration;
      });
      apply();
    };

    bar.appendChild(enter);
    bar.appendChild(exit);
    document.body.appendChild(bar);
  }

  const enterBtn = bar.querySelector(".be-data-entry-enter-btn") as HTMLButtonElement | null;
  const exitBtn = bar.querySelector(".be-data-entry-exit-btn") as HTMLButtonElement | null;

  const ready = hasSelectedPickup() && hasRegistrationWorkspace();

  if (enterBtn) {
    enterBtn.disabled = !ready;
    enterBtn.textContent = ready
      ? "Enter Full Screen Data Entry"
      : "Select pickup first";
  }

  if (exitBtn) {
    exitBtn.style.display = isFocusEnabled() ? "inline-flex" : "none";
  }
}

function findBlocks() {
  const root = document.querySelector("main") || document.querySelector("#root") || document.body;
  return Array.from(root.querySelectorAll("section, form, article, div")) as HTMLElement[];
}

function findSmallestBlock(patterns: RegExp[]) {
  return findBlocks()
    .filter((el) => {
      const t = cleanText(el.innerText);
      if (!t) return false;
      return patterns.every((p) => p.test(t));
    })
    .sort((a, b) => cleanText(a.innerText).length - cleanText(b.innerText).length)[0] || null;
}

function findPhotoZone() {
  return (
    findSmallestBlock([/RIDER/i, /Photos:\s*\d+\s*\/\s*\d+|rider\s+photos|Open rider photo|No rider photo/i])
  );
}

function findTemplateZone() {
  return (
    findSmallestBlock([/DATA ENTRY TEMPLATE/i, /HORIZONTAL SCROLL|RECIPIENT NAME|CONTACT NO|TOWNSHIP/i])
  );
}

function findFooterZone() {
  return (
    findSmallestBlock([/WAYBILL/i, /rider photos checked|CONFIRM|Create/i])
  );
}

function markZones() {
  const main = document.querySelector("main") as HTMLElement | null;
  if (main) main.dataset.beDataEntryWorkspace = "true";

  const photo = findPhotoZone();
  const template = findTemplateZone();
  const footer = findFooterZone();

  if (photo) photo.dataset.bePhotoZone = "true";
  if (template) template.dataset.beTemplateZone = "true";
  if (footer) footer.dataset.beDataEntryFooter = "true";

  return { main, photo, template, footer };
}

function hideBlocksBeforePhoto(photo: HTMLElement | null) {
  if (!photo) return;

  const main = photo.closest("main") as HTMLElement | null;
  if (!main) return;

  const directChildren = Array.from(main.children) as HTMLElement[];

  for (const child of directChildren) {
    if (child === photo || child.contains(photo)) break;

    const t = cleanText(child.innerText);

    if (
      /mm\/dd\/yyyy|REGISTER TEMPLATE|PICKUP|REGISTER NOW|LOAD RIDER|RIDER/i.test(t) ||
      child.querySelector("input[type='date'], select")
    ) {
      child.dataset.beHideDuringRegistration = "true";
    }
  }
}

function forceTemplateOpen(template: HTMLElement | null) {
  if (!template) return;

  const count = getDeliveryWayCount();
  const minHeight = count > 0 ? Math.max(900, count * 96 + 260) : 1000;

  template.classList.add("be-template-zone-open");
  template.style.setProperty("width", "calc(100vw - 20px)", "important");
  template.style.setProperty("max-width", "calc(100vw - 20px)", "important");
  template.style.setProperty("height", "auto", "important");
  template.style.setProperty("min-height", `${minHeight}px`, "important");
  template.style.setProperty("max-height", "none", "important");
  template.style.setProperty("overflow-x", "auto", "important");
  template.style.setProperty("overflow-y", "visible", "important");

  const descendants = Array.from(template.querySelectorAll("*")) as HTMLElement[];

  descendants.forEach((el) => {
    el.style.setProperty("max-height", "none", "important");

    if (el.scrollHeight > el.clientHeight + 10 && el.clientHeight < minHeight) {
      el.style.setProperty("overflow-y", "visible", "important");
      el.style.setProperty("height", "auto", "important");
    }
  });

  const rows = Array.from(
    template.querySelectorAll("tr, [role='row'], [data-row], [class*='row']")
  ) as HTMLElement[];

  rows.forEach((row) => {
    row.classList.add("be-data-entry-force-row");
    row.style.setProperty("visibility", "visible", "important");
    row.style.setProperty("opacity", "1", "important");
    row.style.setProperty("height", "auto", "important");
    row.style.setProperty("min-height", "82px", "important");
    row.style.setProperty("max-height", "none", "important");
    row.style.setProperty("overflow", "visible", "important");
  });
}

function moveFooterAfterTemplate(template: HTMLElement | null, footer: HTMLElement | null) {
  if (!template || !footer) return;
  footer.classList.add("be-data-entry-footer-final");

  if (template.nextElementSibling !== footer) {
    template.insertAdjacentElement("afterend", footer);
  }
}

function apply() {
  if (applying) return;
  if (!isDataEntryPage()) return;

  applying = true;

  try {
    ensureToggleBar();

    const active = isFocusEnabled() && hasSelectedPickup() && hasRegistrationWorkspace();

    document.body.classList.toggle("be-data-entry-focus-mode", active);

    if (!active) {
      // Very important: keep pickup selector selectable.
      document.querySelectorAll("[data-be-hide-during-registration='true']").forEach((el) => {
        delete (el as HTMLElement).dataset.beHideDuringRegistration;
      });
      return;
    }

    const { photo, template, footer } = markZones();

    hideBlocksBeforePhoto(photo);
    forceTemplateOpen(template);
    moveFooterAfterTemplate(template, footer);
  } finally {
    applying = false;
  }
}

function scheduleApply() {
  if (scheduled) return;
  scheduled = true;

  window.setTimeout(() => {
    scheduled = false;
    apply();
  }, 250);
}

function start() {
  // Start with focus OFF so user can select pickup without flashing.
  setFocusEnabled(false);
  apply();

  const observer = new MutationObserver(() => {
    scheduleApply();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.addEventListener("hashchange", () => {
    setFocusEnabled(false);
    scheduleApply();
  });

  window.addEventListener("resize", scheduleApply);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
