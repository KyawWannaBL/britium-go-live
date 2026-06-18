// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import {
  assignLiveDispatchWayplan,
  getLiveDispatchWayplanBoard,
} from "@/lib/liveDispatchWayplan";

function pick(row: any, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
  }
  return fallback;
}

function money(value: any) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

export default function LiveDispatchWayplanBoard() {
  const [branch, setBranch] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [board, setBoard] = useState({ pickups: [], workforce: [], assignments: [] });
  const [selected, setSelected] = useState({});

  async function loadBoard() {
    setLoading(true);
    setError("");
    try {
      const data = await getLiveDispatchWayplanBoard({
        branch_code: branch === "ALL" ? "" : branch,
        limit: 500,
      });

      if (!data?.ok) throw new Error(data?.error || "Unable to load dispatch board.");

      setBoard({
        pickups: Array.isArray(data.pickups) ? data.pickups : [],
        workforce: Array.isArray(data.workforce) ? data.workforce : [],
        assignments: Array.isArray(data.assignments) ? data.assignments : [],
      });
    } catch (err: any) {
      setError(err?.message || "Failed to load live dispatch board.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBoard();
  }, [branch]);

  const riders = useMemo(() => {
    return board.workforce.filter((w: any) => {
      const role = pick(w, ["role_type", "workforce_type", "role"], "").toLowerCase();
      return ["rider", "mobile"].includes(role);
    });
  }, [board.workforce]);

  const drivers = useMemo(() => {
    return board.workforce.filter((w: any) => {
      const role = pick(w, ["role_type", "workforce_type", "role"], "").toLowerCase();
      return ["driver", "mobile"].includes(role);
    });
  }, [board.workforce]);

  const helpers = useMemo(() => {
    return board.workforce.filter((w: any) => {
      const role = pick(w, ["role_type", "workforce_type", "role"], "").toLowerCase();
      return ["helper", "mobile"].includes(role);
    });
  }, [board.workforce]);

  const assignedPickupIds = useMemo(() => {
    return new Set(board.assignments.map((a: any) => pick(a, ["pickup_id"])));
  }, [board.assignments]);

  const unassignedPickups = useMemo(() => {
    return board.pickups.filter((p: any) => {
      const pickupId = pick(p, ["pickup_id", "canonical_pickup_id", "id"]);
      return pickupId && !assignedPickupIds.has(pickupId);
    });
  }, [board.pickups, assignedPickupIds]);

  function updateSelection(pickupId: string, patch: any) {
    setSelected((old: any) => ({
      ...old,
      [pickupId]: {
        ...(old[pickupId] || {}),
        ...patch,
      },
    }));
  }

  async function assignPickup(pickup: any) {
    const pickupId = pick(pickup, ["pickup_id", "canonical_pickup_id", "id"]);
    const wayId = pick(pickup, ["way_id", "waybill_no", "pickup_way_id"]);
    const current = selected[pickupId] || {};

    if (!pickupId) {
      setError("Missing pickup_id.");
      return;
    }

    if (!current.rider_code && !current.driver_code) {
      setError("Select rider or driver before assigning.");
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");

    try {
      const result = await assignLiveDispatchWayplan({
        pickup_id: pickupId,
        way_id: wayId,
        rider_code: current.rider_code || "",
        driver_code: current.driver_code || "",
        helper_code: current.helper_code || "",
        fleet_code: current.fleet_code || "",
        vehicle_plate: current.vehicle_plate || "",
        branch_code: branch === "ALL" ? pick(pickup, ["branch_code"], "HQ") : branch,
        actor_email: localStorage.getItem("be_user_email") || "sai@britiumexpress.com",
        supervisor_note: current.supervisor_note || "",
      });

      if (!result?.ok) throw new Error(result?.error || "Assignment failed.");

      setNotice(`Assigned ${pickupId}`);
      await loadBoard();
    } catch (err: any) {
      setError(err?.message || "Assignment failed.");
    } finally {
      setLoading(false);
    }
  }

  const page: any = {
    minHeight: "100vh",
    background: "#061524",
    color: "#eaf6ff",
    fontFamily: "Inter, system-ui, sans-serif",
    padding: 20,
  };

  const panel: any = {
    background: "rgba(8, 20, 36, .88)",
    border: "1px solid rgba(56,189,248,.22)",
    borderRadius: 18,
    padding: 16,
    minHeight: 420,
  };

  const title: any = {
    color: "#fbbf24",
    fontWeight: 900,
    letterSpacing: 1,
    marginBottom: 12,
  };

  const card: any = {
    background: "rgba(15,23,42,.82)",
    border: "1px solid rgba(148,163,184,.22)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  };

  const input: any = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(148,163,184,.35)",
    background: "#0f172a",
    color: "#fff",
    marginTop: 8,
  };

  const button: any = {
    border: 0,
    borderRadius: 10,
    background: "#f59e0b",
    color: "#111827",
    fontWeight: 900,
    padding: "10px 12px",
    cursor: "pointer",
    marginTop: 10,
  };

  return (
    <main style={page}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 18 }}>
        <div>
          <div style={{ color: "#f59e0b", fontWeight: 900, letterSpacing: 2, fontSize: 12 }}>
            BRITIUM EXPRESS
          </div>
          <h1 style={{ margin: "4px 0", fontSize: 30 }}>Live Dispatch Wayplan Board</h1>
          <p style={{ color: "#a8c4da", margin: 0 }}>
            Backend-first assignment board. No mock data, no localStorage dispatch board.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select value={branch} onChange={(e) => setBranch(e.target.value)} style={input}>
            <option value="ALL">All Branches</option>
            <option value="HQ">HQ</option>
            <option value="YGN">YGN</option>
            <option value="MDY">MDY</option>
          </select>

          <button type="button" onClick={loadBoard} style={button}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </header>

      {error ? <div style={{ ...card, color: "#fecaca", borderColor: "rgba(239,68,68,.45)" }}>{error}</div> : null}
      {notice ? <div style={{ ...card, color: "#bbf7d0", borderColor: "rgba(34,197,94,.45)" }}>{notice}</div> : null}

      <section style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr 1fr", gap: 14 }}>
        <div style={panel}>
          <div style={title}>Unassigned Pickups ({unassignedPickups.length})</div>

          {unassignedPickups.length === 0 ? (
            <div style={{ color: "#94a3b8" }}>No unassigned live pickups found.</div>
          ) : (
            unassignedPickups.map((p: any) => {
              const pickupId = pick(p, ["pickup_id", "canonical_pickup_id", "id"]);
              const wayId = pick(p, ["way_id", "waybill_no", "pickup_way_id"]);
              return (
                <div key={pickupId} style={card}>
                  <div style={{ color: "#fbbf24", fontWeight: 900 }}>{pickupId}</div>
                  <div style={{ color: "#cbd5e1", fontSize: 13, marginTop: 6 }}>
                    <b>Merchant:</b> {pick(p, ["merchant_name", "merchant", "merchant_code"], "-")}
                  </div>
                  <div style={{ color: "#cbd5e1", fontSize: 13 }}>
                    <b>Pickup:</b> {pick(p, ["pickup_address", "address"], "-")}
                  </div>
                  <div style={{ color: "#cbd5e1", fontSize: 13 }}>
                    <b>Township:</b> {pick(p, ["township", "pickup_township"], "-")}
                  </div>
                  <div style={{ color: "#cbd5e1", fontSize: 13 }}>
                    <b>Way:</b> {wayId || "-"} · <b>Parcels:</b> {pick(p, ["parcel_count", "parcels", "qty"], "0")}
                  </div>

                  <select
                    style={input}
                    value={(selected[pickupId] || {}).rider_code || ""}
                    onChange={(e) => updateSelection(pickupId, { rider_code: e.target.value })}
                  >
                    <option value="">Select rider...</option>
                    {riders.map((r: any) => {
                      const code = pick(r, ["rider_code", "worker_id", "workforce_code", "code"]);
                      const name = pick(r, ["full_name", "name", "display_name"], code);
                      return <option key={code} value={code}>{code} - {name}</option>;
                    })}
                  </select>

                  <select
                    style={input}
                    value={(selected[pickupId] || {}).driver_code || ""}
                    onChange={(e) => updateSelection(pickupId, { driver_code: e.target.value })}
                  >
                    <option value="">Select driver...</option>
                    {drivers.map((d: any) => {
                      const code = pick(d, ["driver_code", "worker_id", "workforce_code", "code"]);
                      const name = pick(d, ["full_name", "name", "display_name"], code);
                      return <option key={code} value={code}>{code} - {name}</option>;
                    })}
                  </select>

                  <select
                    style={input}
                    value={(selected[pickupId] || {}).helper_code || ""}
                    onChange={(e) => updateSelection(pickupId, { helper_code: e.target.value })}
                  >
                    <option value="">Helper optional...</option>
                    {helpers.map((h: any) => {
                      const code = pick(h, ["helper_code", "worker_id", "workforce_code", "code"]);
                      const name = pick(h, ["full_name", "name", "display_name"], code);
                      return <option key={code} value={code}>{code} - {name}</option>;
                    })}
                  </select>

                  <input
                    style={input}
                    placeholder="Vehicle plate optional"
                    value={(selected[pickupId] || {}).vehicle_plate || ""}
                    onChange={(e) => updateSelection(pickupId, { vehicle_plate: e.target.value })}
                  />

                  <button type="button" style={button} onClick={() => assignPickup(p)}>
                    Assign Pickup
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div style={panel}>
          <div style={title}>Fleet / Workforce ({board.workforce.length})</div>

          {board.workforce.map((w: any, idx: number) => {
            const code = pick(w, ["rider_code", "driver_code", "helper_code", "worker_id", "workforce_code", "code"], `WF-${idx}`);
            return (
              <div key={code + idx} style={card}>
                <div style={{ fontWeight: 900 }}>{code}</div>
                <div style={{ color: "#cbd5e1", fontSize: 13 }}>
                  {pick(w, ["full_name", "name", "display_name"], "-")}
                </div>
                <div style={{ color: "#93c5fd", fontSize: 12 }}>
                  {pick(w, ["role_type", "workforce_type", "role"], "mobile")}
                </div>
              </div>
            );
          })}
        </div>

        <div style={panel}>
          <div style={title}>Assignments / Status ({board.assignments.length})</div>

          {board.assignments.length === 0 ? (
            <div style={{ color: "#94a3b8" }}>No dispatch assignments yet.</div>
          ) : (
            board.assignments.map((a: any, idx: number) => (
              <div key={pick(a, ["id"], String(idx))} style={card}>
                <div style={{ color: "#fbbf24", fontWeight: 900 }}>{pick(a, ["pickup_id"], "-")}</div>
                <div style={{ color: "#cbd5e1", fontSize: 13 }}>
                  <b>Rider:</b> {pick(a, ["rider_code"], "-")}
                </div>
                <div style={{ color: "#cbd5e1", fontSize: 13 }}>
                  <b>Driver:</b> {pick(a, ["driver_code"], "-")} · <b>Helper:</b> {pick(a, ["helper_code"], "-")}
                </div>
                <div style={{ color: "#93c5fd", fontSize: 12 }}>
                  {pick(a, ["workflow_status"], "PICKUP_ASSIGNED")} · {pick(a, ["branch_code"], "-")}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
