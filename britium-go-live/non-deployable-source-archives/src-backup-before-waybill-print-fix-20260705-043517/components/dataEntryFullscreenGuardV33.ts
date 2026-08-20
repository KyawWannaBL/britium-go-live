const FULL_CLASS = "be-data-entry-fullscreen-v33";
const EXIT_ID = "be-data-entry-exit-fullscreen-v33";

function isDataEntry() {
  return `${location.hash} ${location.pathname}`.toLowerCase().includes("data-entry");
}

function textOf(target: EventTarget | null) {
  const el = (target as HTMLElement | null)?.closest?.("button, a, [role='button']") as HTMLElement | null;
  return { el, text: String(el?.innerText || el?.textContent || "").toLowerCase() };
}

function style() {
  if (document.getElementById("be-data-entry-style-v33")) return;
  const s = document.createElement("style");
  s.id = "be-data-entry-style-v33";
  s.textContent = `
    html.${FULL_CLASS}, html.${FULL_CLASS} body { overflow:hidden !important; background:#061525 !important; }
    html.${FULL_CLASS} #root { position:fixed !important; inset:0 !important; z-index:2147483000 !important; overflow:auto !important; background:#061525 !important; }
    #${EXIT_ID} { position:fixed!important; top:14px!important; right:18px!important; z-index:2147483647!important; padding:12px 18px!important; border:0!important; border-radius:14px!important; background:#ffbd3f!important; color:#061524!important; font-weight:900!important; cursor:pointer!important; }
  `;
  document.head.appendChild(s);
}

async function exit() {
  document.getElementById(EXIT_ID)?.remove();
  document.documentElement.classList.remove(FULL_CLASS);
  document.body.classList.remove(FULL_CLASS);
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
}

function exitButton() {
  if (document.getElementById(EXIT_ID)) return;
  const b = document.createElement("button");
  b.id = EXIT_ID;
  b.type = "button";
  b.textContent = "Exit Full Screen";
  b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); void exit(); };
  document.body.appendChild(b);
}

async function enter() {
  style();
  document.documentElement.classList.add(FULL_CLASS);
  document.body.classList.add(FULL_CLASS);
  exitButton();
  try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen(); } catch {}
}

document.addEventListener("click", (e) => {
  if (!isDataEntry()) return;
  const { el, text } = textOf(e.target);
  if (!el) return;
  if (text.includes("full screen data entry") || text.includes("fullscreen data entry")) {
    e.preventDefault(); e.stopPropagation(); (e as any).stopImmediatePropagation?.(); void enter();
  }
  if (text.includes("exit full screen") || text.includes("exit fullscreen")) {
    e.preventDefault(); e.stopPropagation(); (e as any).stopImmediatePropagation?.(); void exit();
  }
}, true);

document.addEventListener("keydown", (e) => { if (e.key === "Escape") void exit(); });
export {};
