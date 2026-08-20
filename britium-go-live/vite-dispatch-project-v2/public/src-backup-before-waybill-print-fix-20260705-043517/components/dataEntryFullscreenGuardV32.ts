const CLASS_NAME = "be-data-entry-v32-fullscreen";
const EXIT_ID = "be-data-entry-v32-exit";
const STYLE_ID = "be-data-entry-v32-style";

function isDataEntryRoute() {
  return `${window.location.hash} ${window.location.pathname}`.toLowerCase().includes("data-entry");
}

function btn(target: EventTarget | null) {
  const el = (target as HTMLElement | null)?.closest?.("button, a, [role='button']") as HTMLElement | null;
  return { el, text: String(el?.innerText || el?.textContent || "").trim().toLowerCase() };
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    html.${CLASS_NAME}, html.${CLASS_NAME} body { overflow:hidden!important; background:#061525!important; }
    html.${CLASS_NAME} #root { position:fixed!important; inset:0!important; width:100vw!important; height:100vh!important; overflow:auto!important; z-index:2147483000!important; background:#061525!important; }
    #${EXIT_ID} { position:fixed!important; top:14px!important; right:18px!important; z-index:2147483647!important; border:0!important; border-radius:14px!important; padding:12px 18px!important; background:#ffbd3f!important; color:#061524!important; font-weight:900!important; box-shadow:0 16px 40px rgba(0,0,0,.35)!important; cursor:pointer!important; }
  `;
  document.head.appendChild(style);
}

async function exitFull() {
  document.getElementById(EXIT_ID)?.remove();
  document.documentElement.classList.remove(CLASS_NAME);
  document.body.classList.remove(CLASS_NAME);
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
  try {
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
  } catch {}
}

async function enterFull() {
  injectStyle();
  document.documentElement.classList.add(CLASS_NAME);
  document.body.classList.add(CLASS_NAME);
  let b = document.getElementById(EXIT_ID) as HTMLButtonElement | null;
  if (!b) {
    b = document.createElement("button");
    b.id = EXIT_ID;
    b.type = "button";
    b.textContent = "Exit Full Screen";
    b.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      void exitFull();
    };
    document.body.appendChild(b);
  }
  try {
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen();
  } catch {}
}

document.addEventListener("click", (event) => {
  if (!isDataEntryRoute()) return;
  const { el, text } = btn(event.target);
  if (!el || !text) return;
  const enter = text.includes("full screen data entry") || text.includes("fullscreen data entry");
  const exit = text.includes("exit full screen") || text.includes("exit fullscreen");
  if (!enter && !exit) return;
  event.preventDefault();
  event.stopPropagation();
  (event as any).stopImmediatePropagation?.();
  if (exit) void exitFull();
  else void enterFull();
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.documentElement.classList.contains(CLASS_NAME)) void exitFull();
});

export {};
