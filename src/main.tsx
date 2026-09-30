import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Global font & reset (no Tailwind dependency in this file)
const style = document.createElement("style");
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #root {
    margin: 0;
    padding: 0;
    min-height: 100%;
    width: 100%;
  }
  html { min-height: 100dvh; background: #f0f4f8; }
  body {
    min-height: 100dvh;
    padding-top: env(safe-area-inset-top);
    padding-right: env(safe-area-inset-right);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    overscroll-behavior-y: none;
  }
  @media (display-mode: standalone) {
    body { user-select: none; -webkit-tap-highlight-color: transparent; }
    input, textarea { user-select: text; }
  }
  @media (max-width: 768px) {
    button, input, select, textarea { min-height: 42px; }
    table { font-size: 12px; }
  }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: #f0f4f8;
    color: #1e293b;
    -webkit-font-smoothing: antialiased;
  }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: #f1f5f9; }
  ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
  a { color: inherit; }
  input, button, textarea, select { font-family: inherit; }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);


if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Britium Enterprise service worker registration failed", error);
    });
  });
}
