// Britium Pickup Request submit guard.
// Prevents fast duplicate clicks from firing duplicate notification inserts.
let lastSubmitKey = "";
let lastSubmitAt = 0;

function isPickupRequestRoute() {
  return String(window.location.hash || window.location.pathname || "")
    .toLowerCase()
    .includes("pickup-requests");
}

function formKey() {
  const text = document.body?.innerText || "";
  const pickup =
    text.match(/\b(P\d{4,}-[A-Z0-9]+-\d{3,})\b/i)?.[1] ||
    String((document.querySelector("input,select,textarea") as HTMLInputElement | null)?.value || "");
  return pickup || "pickup-request-submit";
}

document.addEventListener(
  "click",
  (event: any) => {
    if (!isPickupRequestRoute()) return;

    const el = event.target?.closest?.("button, a, [role='button']");
    const label = String(el?.innerText || el?.textContent || "").toLowerCase();

    if (!label) return;

    const looksSubmit =
      label.includes("submit") ||
      label.includes("send") ||
      label.includes("create") ||
      label.includes("save") ||
      label.includes("တင်") ||
      label.includes("ပို့") ||
      label.includes("သိမ်း");

    if (!looksSubmit) return;

    const key = formKey();
    const now = Date.now();

    if (lastSubmitKey === key && now - lastSubmitAt < 3500) {
      event.preventDefault();
      event.stopPropagation();
      alert("This pickup request is already being submitted. Please wait.");
      return;
    }

    lastSubmitKey = key;
    lastSubmitAt = now;
  },
  true,
);
