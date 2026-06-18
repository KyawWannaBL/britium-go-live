import React, { useEffect, useState } from "react";

type TemplateItem = {
  title: string;
  file: string;
  uploadRoute: string;
};

const templates: TemplateItem[] = [
  {
    title: "Data Entry Upload Template",
    file: "/templates/Britium_Data_Entry_UAT_GoLive_Template.xlsx",
    uploadRoute: "/data-entry/upload",
  },
  {
    title: "Merchant / Customer Upload Template",
    file: "/templates/Britium_Merchant_Customer_Upload_UAT_Template.xlsx",
    uploadRoute: "/merchant/upload",
  },
  {
    title: "Warehouse Scan Template",
    file: "/templates/Britium_Warehouse_Scan_UAT_GoLive_Template.xlsx",
    uploadRoute: "/warehouse/upload",
  },
];

const nav = [
  ["/go-live-readiness", "Go-Live Readiness"],
  ["/templates", "Template Center"],
  ["/data-entry/upload", "Data Entry Upload"],
  ["/merchant/upload", "Merchant Upload"],
  ["/customer/upload", "Customer Upload"],
  ["/warehouse/upload", "Warehouse Upload"],
  ["/warehouse/scan", "Warehouse Scan"],
];

function getRoute() {
  const raw = window.location.hash.replace("#", "") || "/go-live-readiness";

  if (
    raw === "/" ||
    raw === "/login" ||
    raw === "/dashboard" ||
    raw === "login" ||
    raw === "dashboard"
  ) {
    return "/go-live-readiness";
  }

  return raw.startsWith("/") ? raw : `/${raw}`;
}

export default function App() {
  const [route, setRoute] = useState(getRoute());

  function go(nextRoute: string) {
    window.location.hash = nextRoute;
    setRoute(nextRoute);
  }

  useEffect(() => {
    const initialRoute = getRoute();

    if (window.location.hash === "#/login" || window.location.hash === "#/dashboard") {
      window.location.hash = "/go-live-readiness";
      setRoute("/go-live-readiness");
    } else {
      setRoute(initialRoute);
    }

    const handler = () => setRoute(getRoute());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  return (
    <div style={styles.app}>
      <aside style={styles.sidebar}>
        <h2 style={styles.brand}>Britium UAT</h2>
        <p style={styles.note}>Login bypassed for UAT smoke testing.</p>

        {nav.map(([path, label]) => (
          <button
            key={path}
            type="button"
            onClick={() => go(path)}
            style={{
              ...styles.nav,
              background:
                route === path
                  ? "rgba(255,255,255,0.22)"
                  : "rgba(255,255,255,0.08)",
            }}
          >
            {label}
          </button>
        ))}
      </aside>

      <main style={styles.main}>
        {route === "/templates" ? (
          <TemplateCenter go={go} />
        ) : route === "/data-entry/upload" ? (
          <UploadPage title="Data Entry Upload" template={templates[0].file} />
        ) : route === "/merchant/upload" ? (
          <UploadPage title="Merchant Upload" template={templates[1].file} />
        ) : route === "/customer/upload" ? (
          <UploadPage title="Customer Upload" template={templates[1].file} />
        ) : route === "/warehouse/upload" ? (
          <UploadPage title="Warehouse Upload" template={templates[2].file} />
        ) : route === "/warehouse/scan" ? (
          <WarehouseScan />
        ) : (
          <Readiness />
        )}
      </main>
    </div>
  );
}

function Readiness() {
  return (
    <section>
      <h1>Go-Live Readiness Center</h1>
      <p style={styles.muted}>
        Use this screen for UAT smoke testing before reconnecting live auth and backend cleanup RPCs.
      </p>

      <div style={styles.grid}>
        <StatusCard title="Mock / Demo Runtime Data" value="Must be zero" />
        <StatusCard title="Dispatch Routes" value="Zero until generated" />
        <StatusCard title="Warehouse Manifests" value="Real records only" />
        <StatusCard title="Template Uploads" value="Ready for UAT" />
      </div>

      <div style={styles.card}>
        <h2>UAT Dry Run Flow</h2>
        <ol>
          <li>Download the needed template.</li>
          <li>Upload Data Entry, Merchant/Customer, or Warehouse file.</li>
          <li>Confirm row validation result.</li>
          <li>Create one real pickup request.</li>
          <li>
            Verify one canonical Pickup ID flows through supervisor, warehouse, dispatch,
            rider, tracking, and finance.
          </li>
        </ol>
      </div>
    </section>
  );
}

function TemplateCenter({ go }: { go: (route: string) => void }) {
  return (
    <section>
      <h1>Template Download Center</h1>
      <p style={styles.muted}>Header-only UAT templates. No mock/sample/demo rows.</p>

      <div style={styles.grid}>
        {templates.map((item) => (
          <div key={item.title} style={styles.card}>
            <h2>{item.title}</h2>
            <p>Download the approved upload format.</p>

            <a href={item.file} download style={styles.button}>
              Download XLSX
            </a>

            <button
              type="button"
              onClick={() => go(item.uploadRoute)}
              style={styles.secondaryButton}
            >
              Open Upload Screen
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function UploadPage({ title, template }: { title: string; template: string }) {
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("No file selected.");

  return (
    <section>
      <h1>{title}</h1>
      <p style={styles.muted}>Upload CSV/XLSX for UAT validation. This screen does not load mock data.</p>

      <div style={styles.card}>
        <a href={template} download style={styles.button}>
          Download Template
        </a>

        <div style={{ marginTop: 24 }}>
          <label style={styles.label}>
            Select upload file
            <input
              style={styles.input}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  setFileName("");
                  setMessage("No file selected.");
                  return;
                }

                setFileName(file.name);
                setMessage(`Selected ${file.name}. Ready for backend validation/import.`);
              }}
            />
          </label>
        </div>

        <div style={styles.result}>
          <strong>File:</strong> {fileName || "None"}
          <br />
          <strong>Status:</strong> {message}
        </div>
      </div>
    </section>
  );
}

function WarehouseScan() {
  const [scan, setScan] = useState("");

  return (
    <section>
      <h1>Warehouse Scan</h1>
      <p style={styles.muted}>
        Scan or enter Pickup ID, Deliver ID, Invoice No, Waybill No, or Bag Code.
      </p>

      <div style={styles.card}>
        <label style={styles.label}>
          Scan value
          <input
            style={styles.input}
            value={scan}
            onChange={(event) => setScan(event.target.value)}
            placeholder="Example: W0525-BBK-015"
            autoFocus
          />
        </label>

        <div style={styles.result}>
          <strong>Current Scan:</strong> {scan || "Waiting for scan..."}
          <br />
          <strong>Status:</strong> Ready for backend lookup / warehouse intake validation.
        </div>
      </div>
    </section>
  );
}

function StatusCard({ title, value }: { title: string; value: string }) {
  return (
    <div style={styles.card}>
      <h2>{title}</h2>
      <p style={styles.status}>{value}</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "270px 1fr",
    background: "#f8fafc",
    color: "#0f172a",
    fontFamily: "Arial, sans-serif",
  },
  sidebar: {
    background: "#0f172a",
    color: "white",
    padding: 20,
  },
  brand: {
    margin: "0 0 8px",
  },
  note: {
    color: "#cbd5e1",
    fontSize: 12,
    marginBottom: 20,
  },
  nav: {
    display: "block",
    width: "100%",
    color: "white",
    border: 0,
    textAlign: "left",
    padding: "14px 16px",
    borderRadius: 10,
    marginBottom: 8,
    fontWeight: 800,
    cursor: "pointer",
    pointerEvents: "auto",
  },
  main: {
    padding: 32,
    overflow: "auto",
  },
  muted: {
    color: "#64748b",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 16,
    marginTop: 20,
  },
  card: {
    background: "white",
    borderRadius: 18,
    padding: 24,
    boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
  },
  status: {
    color: "#065f46",
    fontWeight: 800,
  },
  button: {
    display: "inline-block",
    background: "#0f172a",
    color: "white",
    textDecoration: "none",
    padding: "12px 16px",
    borderRadius: 10,
    fontWeight: 800,
    marginRight: 10,
    marginBottom: 10,
  },
  secondaryButton: {
    display: "inline-block",
    background: "#e2e8f0",
    color: "#0f172a",
    border: 0,
    textDecoration: "none",
    padding: "12px 16px",
    borderRadius: 10,
    fontWeight: 800,
    cursor: "pointer",
  },
  label: {
    display: "grid",
    gap: 8,
    fontWeight: 800,
  },
  input: {
    height: 48,
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "0 14px",
    fontSize: 16,
    background: "white",
    color: "#0f172a",
  },
  result: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    background: "#ecfdf5",
    color: "#065f46",
    lineHeight: 1.7,
  },
};
