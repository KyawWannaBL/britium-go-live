// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckSquare,
  Eye,
  Headphones,
  RefreshCw,
  Search,
  Send,
  Square,
} from "lucide-react";

const C = {
  bg: "#061524",
  panel: "#0b2236",
  border: "#1a3a5c",
  text: "#eef8ff",
  sub: "#9cc2d9",
  gold: "#f6b84b",
  green: "#34d399",
  red: "#f87171",
};

function money(v: any) {
  return `${Number(v || 0).toLocaleString()} Ks`;
}

function safe(v: any, fallback = "-") {
  const out = String(v ?? "").trim();
  return out || fallback;
}

export default function CustomerServicePortalPage() {
  const [data, setData] = useState<any>({});
  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setErr("");

    try {
      const { data, error } = await supabase.rpc("be_enterprise_control_tower", {
        p_limit: 300,
      });

      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.error || "Customer service data failed.");

      setData(data || {});
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setErr(e?.message || "Could not load customer service data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [
        r.pickup_id,
        r.delivery_way_id,
        r.waybill_no,
        r.recipient_name,
        r.recipient_phone,
        r.township,
        r.address,
        r.rider_code,
        r.rider_name,
        r.enterprise_status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, query]);

  const s = data?.summary || {};

  function rowKey(row: any, index: number) {
    return String(
      row.delivery_way_id ||
        row.waybill_no ||
        row.pickup_id ||
        index,
    );
  }

  function getDraft(key: string) {
    return (
      drafts[key] || {
        details: "",
        issueType: "INQUIRY",
        priority: "medium",
        targetRole: "operations",
      }
    );
  }

  function updateDraft(
    key: string,
    field: string,
    value: string,
  ) {
    setDrafts((current) => ({
      ...current,
      [key]: {
        ...getDraft(key),
        [field]: value,
      },
    }));
  }

  async function submitTask(
    row: any,
    index: number,
  ) {
    const key = rowKey(row, index);
    const draft = getDraft(key);

    if (!draft.details.trim()) {
      setErr(
        `Enter Things to Do for ${key}.`,
      );
      return;
    }

    setSubmitting(key);
    setErr("");
    setNotice("");

    try {
      const wayId =
        row.delivery_way_id ||
        row.waybill_no;

      const { data, error } =
        await supabase.rpc(
          "be_cs_create_ticket",
          {
            p_payload: {
              way_id: wayId,
              delivery_way_id:
                row.delivery_way_id,
              pickup_id: row.pickup_id,
              customer_name:
                row.recipient_name,
              customer_phone:
                row.recipient_phone,
              issue_type:
                draft.issueType,
              title: `${draft.issueType} - ${wayId}`,
              description:
                draft.details.trim(),
              priority:
                draft.priority,
              target_role:
                draft.targetRole,
              responsible_role:
                draft.targetRole,
              source: "customer_service_portal",
              parcel_status:
                row.enterprise_status,
              rider_code:
                row.rider_code,
              rider_name:
                row.rider_name,
              township:
                row.township,
            },
          },
        );

      if (error) throw error;

      if (data?.ok !== true) {
        throw new Error(
          data?.message ||
            data?.error ||
            "Task submission failed.",
        );
      }

      setNotice(
        `${data.ticket_no} submitted to ${draft.targetRole}.`,
      );

      setSelected((current) => ({
        ...current,
        [key]: false,
      }));

      setDrafts((current) => ({
        ...current,
        [key]: {
          ...getDraft(key),
          details: "",
        },
      }));
    } catch (error: any) {
      setErr(
        error?.message ||
          "Could not submit CS task.",
      );
    } finally {
      setSubmitting("");
    }
  }

  return (
    <main
  data-be-page="cs-portal"
  style={{
    minHeight: "100vh",
    background: C.bg,
    color: C.text,
    padding: 20,
    overflow: "auto",
  }}
>
      <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 18, marginBottom: 16 }}>
        <div style={{ color: C.gold, fontWeight: 900, letterSpacing: "0.22em", fontSize: 12 }}>CUSTOMER SERVICE</div>
        <h1 style={{ display: "flex", gap: 10, alignItems: "center", margin: "8px 0" }}>
          <Headphones size={22} /> Customer Service Portal
        </h1>
        <p style={{ color: C.sub, margin: 0 }}>
          Live parcel support queue from enterprise control tower.
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button
            onClick={load}
            disabled={loading}
            style={{ background: C.gold, border: 0, borderRadius: 12, padding: "10px 14px", fontWeight: 900, cursor: "pointer" }}
          >
            <RefreshCw size={15} /> {loading ? "Loading..." : "Refresh"}
          </button>

          <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: C.sub }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pickup, waybill, customer, rider..."
              style={{
                width: "100%",
                padding: "11px 12px 11px 36px",
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: "#061524",
                color: C.text,
              }}
            />
          </div>
        </div>
      </section>

      {err && <div style={{ color: C.red, marginBottom: 12, border: `1px solid ${C.red}`, borderRadius: 12, padding: 12 }}>{err}</div>}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
        {[
          ["Total Records", s.total_records || 0],
          ["Handed To Rider", s.handed_to_rider || 0],
          ["Finance Settled", s.finance_settled || 0],
          ["COD Collected", money(s.total_cod_collected)],
        ].map(([a, b]) => (
          <div key={a as string} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
            <div style={{ color: C.sub, fontSize: 12 }}>{a}</div>
            <strong style={{ color: C.gold, fontSize: 20 }}>{b}</strong>
          </div>
        ))}
      </section>

      <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 16, overflowX: "auto" }}>

        {notice && (
          <div
            style={{
              color: C.green,
              marginBottom: 12,
              border: `1px solid ${C.green}`,
              background: "rgba(52,211,153,0.08)",
              borderRadius: 12,
              padding: 12,
            }}
          >
            {notice}
          </div>
        )}

        <table
          style={{
            width: "100%",
            minWidth: 1700,
            borderCollapse: "collapse",
          }}>
          <thead>
            <tr
              style={{
                background: C.gold,
                color: C.bg,
              }}
            >
              <th style={{ padding: 10 }}>
                Select
              </th>
              <th style={{ padding: 10, textAlign: "left" }}>
                Pickup ID
              </th>
              <th style={{ padding: 10, textAlign: "left" }}>
                Waybill
              </th>
              <th style={{ padding: 10, textAlign: "left" }}>
                Status
              </th>
              <th style={{ padding: 10, textAlign: "left" }}>
                Recipient
              </th>
              <th style={{ padding: 10, textAlign: "left" }}>
                Phone
              </th>
              <th style={{ padding: 10, textAlign: "left" }}>
                Township
              </th>
              <th style={{ padding: 10, textAlign: "left" }}>
                Rider
              </th>
              <th style={{ padding: 10, textAlign: "left" }}>
                Things to Do
              </th>
              <th style={{ padding: 10, textAlign: "left" }}>
                Type
              </th>
              <th style={{ padding: 10, textAlign: "left" }}>
                Priority
              </th>
              <th style={{ padding: 10, textAlign: "left" }}>
                Department
              </th>
              <th style={{ padding: 10, textAlign: "left" }}>
                Action
              </th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((row, index) => {
              const key = rowKey(row, index);
              const draft = getDraft(key);
              const isSelected =
                Boolean(selected[key]);

              return (
                <tr
                  key={key}
                  style={{
                    borderTop: `1px solid ${C.border}`,
                    background: isSelected
                      ? "rgba(78,168,222,0.08)"
                      : "transparent",
                  }}
                >
                  <td
                    style={{
                      padding: 10,
                      textAlign: "center",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSelected((current) => ({
                          ...current,
                          [key]: !current[key],
                        }))
                      }
                      style={{
                        border: 0,
                        background: "transparent",
                        color: isSelected
                          ? C.blue
                          : C.sub,
                        cursor: "pointer",
                      }}
                    >
                      {isSelected ? (
                        <CheckSquare size={18} />
                      ) : (
                        <Square size={18} />
                      )}
                    </button>
                  </td>

                  <td style={{ padding: 10 }}>
                    {safe(row.pickup_id)}
                  </td>

                  <td
                    style={{
                      padding: 10,
                      color: C.gold,
                      fontWeight: 800,
                    }}
                  >
                    {safe(
                      row.delivery_way_id ||
                        row.waybill_no,
                    )}
                  </td>

                  <td
                    style={{
                      padding: 10,
                      color: C.green,
                      fontWeight: 800,
                    }}
                  >
                    {safe(row.enterprise_status)}
                  </td>

                  <td style={{ padding: 10 }}>
                    {safe(row.recipient_name)}
                  </td>

                  <td style={{ padding: 10 }}>
                    {safe(row.recipient_phone)}
                  </td>

                  <td style={{ padding: 10 }}>
                    {safe(row.township)}
                  </td>

                  <td style={{ padding: 10 }}>
                    {safe(row.rider_code)} /{" "}
                    {safe(row.rider_name)}
                  </td>

                  <td style={{ padding: 10 }}>
                    <textarea
                      value={draft.details}
                      onChange={(event) =>
                        updateDraft(
                          key,
                          "details",
                          event.target.value,
                        )
                      }
                      placeholder="Customer requirement, complaint, address correction, COD issue..."
                      rows={3}
                      style={{
                        width: 300,
                        resize: "vertical",
                        borderRadius: 10,
                        border: `1px solid ${C.border}`,
                        background: C.bg,
                        color: C.text,
                        padding: 10,
                      }}
                    />
                  </td>

                  <td style={{ padding: 10 }}>
                    <select
                      value={draft.issueType}
                      onChange={(event) =>
                        updateDraft(
                          key,
                          "issueType",
                          event.target.value,
                        )
                      }
                      style={{
                        background: C.bg,
                        color: C.text,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: 8,
                      }}
                    >
                      <option value="INQUIRY">
                        Inquiry
                      </option>
                      <option value="REQUEST">
                        Request
                      </option>
                      <option value="COMPLAINT">
                        Complaint
                      </option>
                      <option value="REDELIVERY">
                        Redelivery
                      </option>
                      <option value="ADDRESS_CORRECTION">
                        Address correction
                      </option>
                      <option value="COD_ISSUE">
                        COD issue
                      </option>
                      <option value="OTHER">
                        Other
                      </option>
                    </select>
                  </td>

                  <td style={{ padding: 10 }}>
                    <select
                      value={draft.priority}
                      onChange={(event) =>
                        updateDraft(
                          key,
                          "priority",
                          event.target.value,
                        )
                      }
                      style={{
                        background: C.bg,
                        color: C.text,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: 8,
                      }}
                    >
                      <option value="low">Low</option>
                      <option value="medium">
                        Medium
                      </option>
                      <option value="high">High</option>
                      <option value="urgent">
                        Urgent
                      </option>
                    </select>
                  </td>

                  <td style={{ padding: 10 }}>
                    <select
                      value={draft.targetRole}
                      onChange={(event) =>
                        updateDraft(
                          key,
                          "targetRole",
                          event.target.value,
                        )
                      }
                      style={{
                        background: C.bg,
                        color: C.text,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: 8,
                      }}
                    >
                      <option value="operations">
                        Operations
                      </option>
                      <option value="dispatch">
                        Dispatch
                      </option>
                      <option value="warehouse">
                        Warehouse
                      </option>
                      <option value="supervisor">
                        Supervisor
                      </option>
                      <option value="finance">
                        Finance
                      </option>
                    </select>
                  </td>

                  <td style={{ padding: 10 }}>
                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <button
                        type="button"
                        disabled={
                          submitting === key ||
                          !draft.details.trim()
                        }
                        onClick={() =>
                          void submitTask(
                            row,
                            index,
                          )
                        }
                        style={{
                          border: 0,
                          borderRadius: 9,
                          padding: "9px 12px",
                          background: C.gold,
                          color: C.bg,
                          fontWeight: 900,
                          cursor: "pointer",
                        }}
                      >
                        <Send size={14} />{" "}
                        {submitting === key
                          ? "Submitting..."
                          : "Submit"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          window.location.hash =
                            `#/cs-command?search=${encodeURIComponent(
                              row.delivery_way_id ||
                                row.waybill_no ||
                                row.pickup_id,
                            )}`
                        }
                        style={{
                          border: `1px solid ${C.border}`,
                          borderRadius: 9,
                          padding: "8px 12px",
                          background: C.bg,
                          color: C.sub,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        <Eye size={14} /> Previous Cases
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {!filtered.length && (
              <tr>
                <td
                  colSpan={13}
                  style={{
                    padding: 30,
                    textAlign: "center",
                    color: C.sub,
                  }}
                >
                  No customer service rows found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}