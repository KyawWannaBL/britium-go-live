import "./styles/enterpriseFinalTouch.css";

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
  normalizeSignOut();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
