import { useEffect } from "react";

function clearPortalAuthStorage() {
  const shouldClear = (key: string) => {
    const k = key.toLowerCase();
    return (
      key.startsWith("sb-") ||
      key.startsWith("be_") ||
      k.includes("supabase") ||
      k.includes("auth-token")
    );
  };

  Object.keys(localStorage).forEach((key) => {
    if (shouldClear(key)) localStorage.removeItem(key);
  });

  Object.keys(sessionStorage).forEach((key) => {
    if (shouldClear(key)) sessionStorage.removeItem(key);
  });
}

export default function SessionStuckRecovery() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const pageText = document.body?.innerText || "";
      const path = window.location.pathname;

      if (pageText.includes("Checking session") && !window.location.hash.includes("/login")) {
        clearPortalAuthStorage();
        window.location.replace("/#/login?session_recovered=1");
      }
    }, 4500);

    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
