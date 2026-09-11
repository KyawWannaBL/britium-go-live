// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// BranchOfficePortal.tsx — Britium Express Branch Office Portal
// Manifest receipt, parcel sorting, rider assignment, branch exceptions
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import PortalLayout, {
  StatCard, Card, DataTable, LoadingBlock, ErrorBlock,
  StatusPill, PrimaryBtn, NavItem,
} from "../components/PortalLayout";
import {
  useBranchOverview,
  useBranchManifests,
  useBranchShipments,
  useBranchRiders,
  useAssignRider,
  useConfirmManifest,
  useExceptions as useBranchExceptions,
} from "../hooks/useApi";
import type {
  BranchOverview, Manifest, RiderAssignment, Shipment, Exception,
} from "../types";

// ── Nav ───────────────────────────────────────────────────────────────────────
const NAV: NavItem[] = [
  { key: "overview",   label: "Branch Overview",    icon: "📊" },
  { key: "manifests",  label: "Incoming Manifests",  icon: "📋" },
  { key: "sorting",    label: "Parcel Sorting",      icon: "🗂️" },
  { key: "riders",     label: "Rider Assignment",    icon: "🛵" },
  { key: "exceptions", label: "Exceptions",          icon: "⚠️" },
];

// Alias: useBranchManifests exported as useIncomingManifests locally
const useIncomingManifests = useBranchManifests;
// Alias: useBranchRiders exported as useRiderAssignments locally
const useRiderAssignments = useBranchRiders;

// ── Sub-views ─────────────────────────────────────────────────────────────────
function OverviewView() {
  const { data, isLoading, error } = useBranchOverview();
  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error.message} />;
  const d = data as BranchOverview;

  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
        🏢 {d?.branch_name ?? "Branch"} — Overview
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard label="Pending Manifests"  value={d?.pending_manifests ?? 0}  icon="📋" color="#7c3aed" />
        <StatCard label="Parcels to Sort"    value={d?.parcels_to_sort ?? 0}    icon="🗂️" color="#1a56db" />
        <StatCard label="Riders Active"      value={d?.riders_active ?? 0}      icon="🛵" color="#059669" />
        <StatCard label="Riders Idle"        value={d?.riders_idle ?? 0}        icon="⏸️" color="#d97706" />
        <StatCard label="Deliveries Today"   value={d?.deliveries_today ?? 0}   icon="✅" color="#059669" />
        <StatCard label="Failed Today"       value={d?.failed_today ?? 0}       icon="❌" color="#dc2626" />
        <StatCard label="Open Exceptions"    value={d?.exceptions_open ?? 0}    icon="⚠️" color="#dc2626" />
      </div>
    </>
  );
}

function ManifestsView() {
  const { data, isLoading, error } = useIncomingManifests();
  const confirm = useConfirmManifest();
  const manifests = (data as Manifest[] | undefined) ?? [];

  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>📋 Incoming Manifests</h2>
      {isLoading ? <LoadingBlock /> : error ? <ErrorBlock message={error.message} /> : (
        <Card>
          <DataTable
            columns={[
              { key: "manifest",  label: "Manifest #" },
              { key: "origin",    label: "From" },
              { key: "count",     label: "Parcel Count" },
              { key: "received",  label: "Received" },
              { key: "status",    label: "Status" },
              { key: "actions",   label: "Actions" },
            ]}
            rows={manifests.map((m) => ({
              manifest: <span style={{ fontFamily: "monospace", fontSize: 12 }}>{m.manifest_no}</span>,
              origin:   m.origin_branch_name,
              count:    m.parcel_count,
              received: m.received_count ?? "—",
              status:   <StatusPill status={m.status} />,
              actions:  m.status === "dispatched" ? (
                <PrimaryBtn
                  color="#059669"
                  onClick={() => confirm.mutate(m.id)}
                  disabled={confirm.isPending}
                >
                  ✅ Confirm Receipt
                </PrimaryBtn>
              ) : (
                <span style={{ color: "#94a3b8", fontSize: 12 }}>
                  {m.status === "received" ? "Confirmed" : "N/A"}
                </span>
              ),
            }))}
            emptyMsg="No incoming manifests."
          />
        </Card>
      )}
    </>
  );
}

function SortingView() {
  const [township, setTownship] = useState("");
  const params: Record<string, string> = { status: "at_hub" };
  if (township) params.township = township;
  const { data, isLoading, error } = useBranchShipments(params);
  const shipments = (data as any)?.data ?? [];

  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>🗂️ Parcel Sorting</h2>
      <div style={{ marginBottom: 16 }}>
        <TextInput
          placeholder="Filter by township…"
          value={township}
          onChange={setTownship}
        />
      </div>
      {isLoading ? <LoadingBlock /> : error ? <ErrorBlock message={error.message} /> : (
        <Card>
          <DataTable
            columns={[
              { key: "awb",       label: "AWB" },
              { key: "receiver",  label: "Receiver" },
              { key: "township",  label: "Township" },
              { key: "cod",       label: "COD (MMK)" },
              { key: "status",    label: "Status" },
            ]}
            rows={shipments.map((s: Shipment) => ({
              awb:      <span style={{ fontFamily: "monospace", fontSize: 12 }}>{s.tracking_no}</span>,
              receiver: <div>{s.receiver_name}<br /><span style={{ fontSize: 11, color: "#94a3b8" }}>{s.receiver_phone}</span></div>,
              township: s.receiver_township,
              cod:      s.cod_amount > 0 ? s.cod_amount.toLocaleString() : <span style={{ color: "#94a3b8" }}>—</span>,
              status:   <StatusPill status={s.status} />,
            }))}
            emptyMsg="No parcels to sort."
          />
        </Card>
      )}
    </>
  );
}

function RidersView() {
  const { data: riderData, isLoading: ridersLoading } = useRiderAssignments();
  const { data: shipmentData, isLoading: shipmentsLoading } = useBranchShipments({ status: "at_hub" });
  const assignRider = useAssignRider();

  const riders = (riderData as RiderAssignment[] | undefined) ?? [];
  const shipments = ((shipmentData as any)?.data ?? []) as Shipment[];
  const [selectedShipments, setSelectedShipments] = useState<string[]>([]);
  const [selectedRider, setSelectedRider] = useState("");

  const toggleShipment = (id: string) => {
    setSelectedShipments((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAssign = () => {
    if (!selectedRider || selectedShipments.length === 0) return;
    assignRider.mutate({ shipment_ids: selectedShipments, rider_id: selectedRider });
    setSelectedShipments([]);
    setSelectedRider("");
  };

  if (ridersLoading || shipmentsLoading) return <LoadingBlock />;

  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>🛵 Rider Assignment</h2>

      {/* Rider status table */}
      <Card title="Rider Status Today">
        <DataTable
          columns={[
            { key: "rider",     label: "Rider" },
            { key: "phone",     label: "Phone" },
            { key: "assigned",  label: "Assigned" },
            { key: "delivered", label: "Delivered" },
            { key: "failed",    label: "Failed" },
            { key: "status",    label: "Status" },
          ]}
          rows={riders.map((r) => ({
            rider:     r.rider_name,
            phone:     r.phone,
            assigned:  r.assigned_count,
            delivered: <span style={{ color: "#059669", fontWeight: 700 }}>{r.delivered_count}</span>,
            failed:    <span style={{ color: r.failed_count > 0 ? "#dc2626" : "#94a3b8" }}>{r.failed_count}</span>,
            status:    <StatusPill status={r.status} />,
          }))}
          emptyMsg="No riders on duty."
        />
      </Card>

      {/* Assign parcels */}
      <Card title="Assign Parcels to Rider">
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <select
              value={selectedRider}
              onChange={(e) => setSelectedRider(e.target.value)}
              style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", minWidth: 200 }}
            >
              <option value="">Select a rider…</option>
              {riders.filter((r) => r.status === "available" || r.status === "on_route").map((r) => (
                <option key={r.rider_id} value={r.rider_id}>{r.rider_name}</option>
              ))}
            </select>
            <PrimaryBtn
              onClick={handleAssign}
              disabled={!selectedRider || selectedShipments.length === 0 || assignRider.isPending}
            >
              Assign {selectedShipments.length > 0 ? `(${selectedShipments.length})` : ""} Parcels
            </PrimaryBtn>
          </div>

          <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <th style={{ padding: "8px 12px", textAlign: "left", width: 32 }}>
                    <input type="checkbox"
                      checked={selectedShipments.length === shipments.length && shipments.length > 0}
                      onChange={(e) => setSelectedShipments(e.target.checked ? shipments.map((s) => s.id) : [])}
                    />
                  </th>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>AWB</th>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>Receiver</th>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>Township</th>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>COD</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s: Shipment) => (
                  <tr key={s.id} style={{ borderTop: "1px solid #f1f5f9", background: selectedShipments.includes(s.id) ? "#eff6ff" : "transparent" }}>
                    <td style={{ padding: "8px 12px" }}>
                      <input type="checkbox" checked={selectedShipments.includes(s.id)} onChange={() => toggleShipment(s.id)} />
                    </td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }}>{s.tracking_no}</td>
                    <td style={{ padding: "8px 12px" }}>{s.receiver_name}</td>
                    <td style={{ padding: "8px 12px" }}>{s.receiver_township}</td>
                    <td style={{ padding: "8px 12px" }}>{s.cod_amount > 0 ? `MMK ${s.cod_amount.toLocaleString()}` : "—"}</td>
                  </tr>
                ))}
                {shipments.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>No unassigned parcels.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </>
  );
}

function ExceptionsView() {
  const { data, isLoading, error } = useBranchExceptions();
  const exceptions = (data as Exception[] | undefined) ?? [];
  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>⚠️ Branch Exceptions</h2>
      {isLoading ? <LoadingBlock /> : error ? <ErrorBlock message={error.message} /> : (
        <Card>
          <DataTable
            columns={[
              { key: "awb",     label: "AWB" },
              { key: "type",    label: "Type" },
              { key: "status",  label: "Status" },
              { key: "desc",    label: "Description" },
              { key: "created", label: "Reported" },
            ]}
            rows={exceptions.map((e) => ({
              awb:     <span style={{ fontFamily: "monospace", fontSize: 12 }}>{e.tracking_no}</span>,
              type:    <StatusPill status={e.type} />,
              status:  <StatusPill status={e.status} />,
              desc:    e.description,
              created: new Date(e.created_at).toLocaleDateString(),
            }))}
            emptyMsg="No branch exceptions."
          />
        </Card>
      )}
    </>
  );
}

// ── Main Portal ───────────────────────────────────────────────────────────────
export default function BranchOfficePortal() {
  const [active, setActive] = useState("overview");
  const overviewData = useBranchOverview();
  const exceptions = ((overviewData.data as BranchOverview)?.exceptions_open) ?? 0;
  const manifests  = ((overviewData.data as BranchOverview)?.pending_manifests) ?? 0;

  const navWithBadges: NavItem[] = NAV.map((n) => {
    if (n.key === "exceptions" && exceptions > 0) return { ...n, badge: exceptions };
    if (n.key === "manifests" && manifests > 0)   return { ...n, badge: manifests };
    return n;
  });

  const viewMap: Record<string, React.ReactNode> = {
    overview:   <OverviewView />,
    manifests:  <ManifestsView />,
    sorting:    <SortingView />,
    riders:     <RidersView />,
    exceptions: <ExceptionsView />,
  };

  return (
    <PortalLayout
      title="Branch Office Portal"
      subtitle="Manifest · Sort · Assign"
      accentColor="#1e3a8a"
      navItems={navWithBadges}
      activeKey={active}
      onNav={setActive}
    >
      {viewMap[active] ?? <OverviewView />}
    </PortalLayout>
  );
}
