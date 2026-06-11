import React from "react";

type State = {
  error: Error | null;
};

export default class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[Britium App Error]", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#061524",
          color: "#eef8ff",
          display: "grid",
          placeItems: "center",
          padding: 24,
          fontFamily: "Poppins, Inter, system-ui, sans-serif",
        }}
      >
        <section
          style={{
            width: "min(720px, 100%)",
            border: "1px solid #ff4f8655",
            background: "#0b2236",
            borderRadius: 20,
            padding: 22,
          }}
        >
          <div style={{ color: "#ff4f86", fontWeight: 950, fontSize: 18 }}>
            Enterprise Portal Runtime Error
          </div>

          <pre
            style={{
              whiteSpace: "pre-wrap",
              color: "#a8c4da",
              marginTop: 14,
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>

          <button
            type="button"
            onClick={() => {
              localStorage.clear();
              sessionStorage.clear();
              location.href = "/#/";
            }}
            style={{
              marginTop: 14,
              border: "none",
              borderRadius: 12,
              background: "#ff8a4c",
              color: "#1b0b05",
              padding: "10px 16px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Clear session and return to login
          </button>
        </section>
      </main>
    );
  }
}
