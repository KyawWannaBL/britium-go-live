import "./styles/enterpriseFinalTouch.css";

function addGoLiveWatermark() {
  if (document.querySelector(".be-golive-watermark")) return;
  const node = document.createElement("div");
  node.className = "be-golive-watermark";
  node.textContent = "Britium Go-Live UAT";
  document.body.appendChild(node);
}

function normalizeSignOut() {
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const text = target?.textContent?.toLowerCase() || "";
    if (!text.includes("sign out") && !text.includes("logout")) return;

    localStorage.removeItem("be_enterprise_session");
    sessionStorage.removeItem("be_enterprise_session");
    localStorage.removeItem("be_enterprise_identifier");
    sessionStorage.removeItem("be_enterprise_identifier");
  }, true);
}

function boot() {
  addGoLiveWatermark();
  normalizeSignOut();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
