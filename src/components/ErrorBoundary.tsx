// ─────────────────────────────────────────────────────────────────────────────
// ErrorBoundary.tsx — Britium Express React Error Boundary
// Catches render-time JS errors and shows a graceful recovery screen.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In production you'd send this to Sentry / LogRocket / Datadog
    console.error("[ErrorBoundary] Uncaught render error:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return <>{this.props.fallback}</>;

      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            gap: 16,
            background: "#f8fafc",
            padding: 24,
          }}
        >
          <div style={{ fontSize: 52 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1e293b", margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#64748b", fontSize: 14, textAlign: "center", maxWidth: 440 }}>
            An unexpected error occurred. If this keeps happening, please contact support.
          </p>
          {this.state.error && (
            <pre
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 8,
                padding: 12,
                fontSize: 11,
                color: "#991b1b",
                maxWidth: 600,
                overflowX: "auto",
                width: "100%",
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={this.handleReset}
              style={{
                background: "#1a56db",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 24px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              style={{
                background: "none",
                color: "#1a56db",
                border: "1px solid #1a56db",
                borderRadius: 8,
                padding: "10px 24px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Go to Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
