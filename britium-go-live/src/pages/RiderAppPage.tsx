import React, { useState } from "react";
import { Route } from "lucide-react";
import RiderFieldPortalApp from "./RiderFieldPortalApp";
import RiderOperationalRoutePage from "./RiderOperationalRoutePage";

export default function RiderAppPage() {
  const [operationalRoute, setOperationalRoute] = useState(false);

  if (operationalRoute) {
    return (
      <div style={{ minHeight: "100vh", background: "#061524" }}>
        <button
          type="button"
          onClick={() => setOperationalRoute(false)}
          style={{
            position: "fixed",
            right: 16,
            top: 16,
            zIndex: 120,
            border: "1px solid #f6b84b",
            borderRadius: 12,
            background: "#f6b84b",
            color: "#061524",
            padding: "10px 14px",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Back to Rider Wall
        </button>
        <RiderOperationalRoutePage />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <RiderFieldPortalApp />
      <button
        type="button"
        onClick={() => setOperationalRoute(true)}
        aria-label="Open active Wayplan route"
        style={{
          position: "fixed",
          right: 18,
          bottom: 76,
          zIndex: 120,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          border: "1px solid #f6b84b",
          borderRadius: 999,
          background: "#f6b84b",
          color: "#061524",
          padding: "12px 16px",
          fontWeight: 900,
          boxShadow: "0 12px 32px rgba(0,0,0,.35)",
          cursor: "pointer",
        }}
      >
        <Route size={18} /> Active Wayplan Route
      </button>
    </div>
  );
}
