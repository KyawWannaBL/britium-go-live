import React, { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function AppInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
      const mediaStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
      setStandalone(iosStandalone || mediaStandalone);
    };
    checkStandalone();

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const installed = () => {
      setStandalone(true);
      setInstallEvent(null);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (standalone || !installEvent) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await installEvent.prompt();
        const choice = await installEvent.userChoice;
        if (choice.outcome === "accepted") setInstallEvent(null);
      }}
      aria-label="Install Britium Enterprise app"
      style={{
        position: "fixed",
        right: 16,
        bottom: "calc(16px + env(safe-area-inset-bottom))",
        zIndex: 9999,
        border: 0,
        borderRadius: 999,
        padding: "11px 16px",
        background: "#0f172a",
        color: "#fff",
        fontWeight: 800,
        fontSize: 13,
        boxShadow: "0 8px 24px rgba(15,23,42,.28)",
        cursor: "pointer",
      }}
    >
      Install Britium App
    </button>
  );
}
