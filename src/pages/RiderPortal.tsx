import React, { useMemo, useState } from "react";
import {
  useRiderAction,
  useRiderTasks,
  useSubmitPickupVerification,
  useUploadRiderProof,
} from "../hooks/useApi";
import { useAuth } from "../contexts/AuthContext";
import { bi, workforceErrorMessage } from "../lib/workforceI18n";
import {
  RIDER_FAILURE_STATUS_MAP,
  type RiderActionRequest,
} from "../lib/riderWorkflow";
import type {
  FailureReason,
  RiderNextAction,
  RiderTask,
} from "../types";

const FAILURE_LABELS: Record<FailureReason, string> = {
  recipient_not_available: bi(
    "Recipient Not Available",
    "လက်ခံသူ မရှိပါ"
  ),
  address_not_found: bi(
    "Address Not Found",
    "လိပ်စာ မတွေ့ပါ"
  ),
  recipient_refused: bi(
    "Recipient Refused",
    "လက်ခံသူက ငြင်းဆိုပါသည်"
  ),
  cod_dispute: bi(
    "COD Amount Dispute",
    "COD ငွေပမာဏ မကိုက်ညီပါ"
  ),
  access_blocked: bi(
    "Access Blocked",
    "ဝင်ရောက်ခွင့် မရပါ"
  ),
  damaged: bi(
    "Parcel Damaged",
    "ပါဆယ် ပျက်စီးနေပါသည်"
  ),
  other: bi(
    "Other",
    "အခြားပြဿနာ"
  ),
};

const ACTION_LABELS: Partial<Record<RiderNextAction, string>> = {
  accept: bi(
    "Accept Task",
    "တာဝန် လက်ခံမည်"
  ),
  arrive: bi(
    "Mark Arrived",
    "ရောက်ရှိကြောင်း အတည်ပြုမည်"
  ),
  submit_pickup_verification: bi(
    "Submit Parcel Proofs",
    "ပါဆယ်အထောက်အထားများ ပို့မည်"
  ),
  collect: bi(
    "Confirm Collection",
    "ပါဆယ်လက်ခံယူပြီးကြောင်း အတည်ပြုမည်"
  ),
  delivered_to_warehouse: bi(
    "Hand Over to Warehouse",
    "ဂိုဒေါင်သို့ လွှဲပြောင်းမည်"
  ),
  start_delivery: bi(
    "Start Delivery",
    "ပို့ဆောင်မှု စတင်မည်"
  ),
  deliver: bi(
    "Confirm Delivered / ပို့ဆောင်ပြီးကြောင်း အတည်ပြုမည်",
    "ပို့ဆောင်ပြီးကြောင်း အတည်ပြုမည်"
  ),
};

const FILTER_LABELS = {
  all: bi("All", "အားလုံး"),
  pending: bi("Pending / လုပ်ဆောင်ရန်ကျန်", "လုပ်ဆောင်ရန်ကျန်"),
  done: bi("Done", "ပြီးစီး"),
} as const;

function errorText(error: unknown): string {
  return workforceErrorMessage(error);
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: 12,
        marginBottom: 14,
        background: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: 8,
        color: "#991b1b",
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}


function BilingualStatusPill({
  status,
}: {
  status: RiderTask["status"];
}) {
  const labels: Record<RiderTask["status"], string> = {
    assigned: bi(
      "Assigned",
      "တာဝန်ခွဲဝေထား"
    ),
    in_progress: bi(
      "In Progress",
      "လုပ်ဆောင်နေ"
    ),
    waiting_review: bi(
      "Waiting Review / စစ်ဆေးရန် စောင့်ဆိုင်းနေ",
      "စစ်ဆေးရန် စောင့်ဆိုင်းနေ"
    ),
    delivered: bi(
      "Completed / ပြီးစီး",
      "ပြီးစီး"
    ),
    failed: bi(
      "Exception",
      "ပြဿနာရှိ"
    ),
  };

  const styles: Record<
    RiderTask["status"],
    { background: string; color: string }
  > = {
    assigned: {
      background: "#f1f5f9",
      color: "#475569",
    },
    in_progress: {
      background: "#dbeafe",
      color: "#1d4ed8",
    },
    waiting_review: {
      background: "#fef3c7",
      color: "#92400e",
    },
    delivered: {
      background: "#d1fae5",
      color: "#047857",
    },
    failed: {
      background: "#fee2e2",
      color: "#b91c1c",
    },
  };

  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        ...styles[status],
      }}
    >
      {labels[status]}
    </span>
  );
}

function ModalFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          overflowY: "auto",
          padding: 24,
          background: "#fff",
          borderRadius: 14,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function locationText(task: RiderTask): string {
  if (task.task_type === "delivery") {
    return [
      task.receiver_address,
      task.receiver_township,
      task.receiver_city,
    ]
      .filter(Boolean)
      .join(", ");
  }

  return [
    task.pickup_address,
    task.pickup_township,
    task.pickup_city,
  ]
    .filter(Boolean)
    .join(", ");
}

function contactName(task: RiderTask): string {
  return task.task_type === "delivery"
    ? task.receiver_name || bi("Recipient not recorded", "လက်ခံသူအမည် မရှိသေးပါ")
    : task.sender_name ||
        task.merchant_name ||
        bi("Pickup contact not recorded", "ပစ္စည်းပေးသူအချက်အလက် မရှိသေးပါ");
}

function contactPhone(task: RiderTask): string {
  return task.task_type === "delivery"
    ? task.receiver_phone
    : task.sender_phone;
}

function TaskCard({
  task,
  busy,
  onPrimary,
  onFailure,
}: {
  task: RiderTask;
  busy: boolean;
  onPrimary: (task: RiderTask) => void;
  onFailure: (task: RiderTask) => void;
}) {
  const isDone = task.status === "delivered";
  const isFailed = task.status === "failed";
  const isActive = task.status === "in_progress";
  const location = locationText(task);

  return (
    <div
      style={{
        padding: "16px 18px",
        marginBottom: 12,
        background: "#fff",
        border: `1px solid ${
          isDone
            ? "#d1fae5"
            : isFailed
            ? "#fecaca"
            : "#e2e8f0"
        }`,
        borderLeft: `4px solid ${
          isDone
            ? "#059669"
            : isFailed
            ? "#dc2626"
            : isActive
            ? "#1a56db"
            : "#94a3b8"
        }`,
        borderRadius: 12,
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <span
            style={{
              marginRight: 8,
              padding: "2px 8px",
              background: "#f1f5f9",
              color: "#475569",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            #{task.sequence}
          </span>

          <span
            style={{
              fontFamily: "monospace",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {task.tracking_no}
          </span>
        </div>

        <BilingualStatusPill status={task.status} />
      </div>

      <div
        style={{
          marginBottom: 8,
          color: "#1e40af",
          fontSize: 11,
          fontWeight: 800,
          textTransform: "uppercase",
        }}
      >
        {task.task_type === "delivery"
          ? bi("Delivery Task", "ပစ္စည်းပို့ရန်တာဝန်")
          : bi("Pickup Task", "ပစ္စည်းသွားယူရန်တာဝန်")}
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>
          {contactName(task)}
        </div>

        {contactPhone(task) && (
          <div style={{ color: "#64748b", fontSize: 13 }}>
            {contactPhone(task)}
          </div>
        )}

        {location && (
          <div
            style={{
              marginTop: 3,
              color: "#64748b",
              fontSize: 12,
            }}
          >
            📍 {location}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            padding: "3px 8px",
            background: "#f8fafc",
            borderRadius: 6,
            color: "#475569",
            fontSize: 11,
          }}
        >
          Parcels / ပါဆယ်: {task.parcel_count}
        </span>

        <span
          style={{
            padding: "3px 8px",
            background: "#f8fafc",
            borderRadius: 6,
            color: "#475569",
            fontSize: 11,
          }}
        >
          Service / ဝန်ဆောင်မှု: {task.service_type}
        </span>
      </div>

      {task.cod_amount > 0 && (
        <div
          style={{
            display: "inline-block",
            padding: "3px 10px",
            marginBottom: 10,
            background: "#fff8ed",
            border: "1px solid #fbbf24",
            borderRadius: 8,
            color: "#92400e",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          💰 COD / ငွေကောက်ခံရန် MMK {task.cod_amount.toLocaleString()}
        </div>
      )}

      {task.notes && (
        <div
          style={{
            padding: "5px 10px",
            marginBottom: 10,
            background: "#f5f3ff",
            borderRadius: 6,
            color: "#7c3aed",
            fontSize: 12,
          }}
        >
          📝 {task.notes}
        </div>
      )}

      {task.status === "waiting_review" && (
        <div
          style={{
            padding: "8px 10px",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 8,
            color: "#92400e",
            fontSize: 12,
          }}
        >
          Parcel proofs are waiting for Data Entry review. / ပါဆယ်အထောက်အထားများကို စာရင်းသွင်းဌာနမှ စစ်ဆေးရန် စောင့်ဆိုင်းနေပါသည်။
        </div>
      )}

      {task.next_action && (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => onPrimary(task)}
            style={{
              padding: "8px 16px",
              background: "#1a56db",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              cursor: busy ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 700,
              opacity: busy ? 0.65 : 1,
            }}
          >
            {busy
              ? bi("Saving…", "သိမ်းဆည်းနေသည်…")
              : ACTION_LABELS[task.next_action] ||
                "Continue"}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => onFailure(task)}
            style={{
              padding: "8px 14px",
              background: "#fee2e2",
              border: "none",
              borderRadius: 8,
              color: "#991b1b",
              cursor: busy ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Report Exception / ပြဿနာတင်ပြမည်
          </button>
        </div>
      )}
    </div>
  );
}

function PickupVerificationModal({
  task,
  onClose,
}: {
  task: RiderTask;
  onClose: () => void;
}) {
  const upload = useUploadRiderProof();
  const submit = useSubmitPickupVerification();

  const parcelCount = Math.max(
    1,
    Math.min(task.parcel_count || 1, 20)
  );

  const [rows, setRows] = useState(() =>
    Array.from({ length: parcelCount }, () => ({
      weight: "",
      proofUrl: "",
    }))
  );

  const [remarks, setRemarks] = useState("");
  const [uploadingIndex, setUploadingIndex] =
    useState<number | null>(null);
  const [formError, setFormError] = useState("");

  const updateRow = (
    index: number,
    patch: Partial<(typeof rows)[number]>
  ) => {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? { ...row, ...patch }
          : row
      )
    );
  };

  const handleUpload = async (
    index: number,
    file?: File
  ) => {
    if (!file) return;

    setFormError("");
    setUploadingIndex(index);

    try {
      const url = await upload.mutateAsync({
        task_id: task.id,
        file,
      });

      updateRow(index, { proofUrl: url });
    } catch (error) {
      setFormError(errorText(error));
    } finally {
      setUploadingIndex(null);
    }
  };

  const handleSubmit = async () => {
    setFormError("");

    const parcels = rows.map((row) => ({
      actual_weight_kg: Number(row.weight),
      proof_url: row.proofUrl,
    }));

    if (
      parcels.some(
        (parcel) =>
          !Number.isFinite(parcel.actual_weight_kg) ||
          parcel.actual_weight_kg <= 0 ||
          !parcel.proof_url
      )
    ) {
      setFormError(
        bi("Every parcel requires a positive weight and an uploaded photo.", "ပါဆယ်တိုင်းအတွက် သုညထက်ကြီးသော အလေးချိန်နှင့် ဓာတ်ပုံ လိုအပ်ပါသည်။")
      );
      return;
    }

    try {
      await submit.mutateAsync({
        task_id: task.id,
        parcels,
        proof_url: parcels[0]?.proof_url,
        remarks: remarks.trim() || undefined,
      });

      onClose();
    } catch (error) {
      setFormError(errorText(error));
    }
  };

  return (
    <ModalFrame>
      <h3 style={{ marginBottom: 6, fontSize: 17 }}>
        Submit Pickup Verification / ပစ္စည်းယူမှုအတည်ပြုချက် ပို့မည်
      </h3>

      <div
        style={{
          marginBottom: 18,
          color: "#64748b",
          fontSize: 13,
        }}
      >
        {task.tracking_no} · {parcelCount}{" "}
        {bi("parcel(s)", "ပါဆယ်")}
      </div>

      {formError && <ErrorBox message={formError} />}

      {rows.map((row, index) => (
        <div
          key={index}
          style={{
            padding: 12,
            marginBottom: 12,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
          }}
        >
          <div
            style={{
              marginBottom: 8,
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {bi("Parcel", "ပါဆယ်")} {index + 1}
          </div>

          <label
            style={{
              display: "block",
              marginBottom: 4,
              color: "#475569",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Actual weight (kg) / အမှန်တကယ်အလေးချိန် (ကီလိုဂရမ်)
          </label>

          <input
            type="number"
            min="0.01"
            step="0.01"
            value={row.weight}
            onChange={(event) =>
              updateRow(index, {
                weight: event.target.value,
              })
            }
            style={{
              width: "100%",
              padding: "9px 10px",
              marginBottom: 10,
              border: "1px solid #cbd5e1",
              borderRadius: 8,
            }}
          />

          <label
            style={{
              display: "block",
              marginBottom: 4,
              color: "#475569",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Parcel photo / ပါဆယ်ဓာတ်ပုံ
          </label>

          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={uploadingIndex !== null}
            onChange={(event) =>
              handleUpload(
                index,
                event.target.files?.[0]
              )
            }
          />

          <div
            style={{
              marginTop: 6,
              color: row.proofUrl
                ? "#047857"
                : "#64748b",
              fontSize: 12,
            }}
          >
            {uploadingIndex === index
              ? bi("Uploading…", "ဓာတ်ပုံတင်နေသည်…")
              : row.proofUrl
              ? bi("Photo uploaded", "ဓာတ်ပုံ တင်ပြီးပါပြီ")
              : bi("Photo required", "ဓာတ်ပုံ လိုအပ်ပါသည်")}
          </div>

          {row.proofUrl && (
            <img
              src={row.proofUrl}
              alt={`Parcel ${index + 1} proof`}
              style={{
                width: "100%",
                maxHeight: 180,
                marginTop: 8,
                objectFit: "cover",
                borderRadius: 8,
              }}
            />
          )}
        </div>
      ))}

      <label
        style={{
          display: "block",
          marginBottom: 4,
          color: "#475569",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        Remarks / မှတ်ချက်
      </label>

      <textarea
        rows={2}
        value={remarks}
        onChange={(event) =>
          setRemarks(event.target.value)
        }
        style={{
          width: "100%",
          padding: 10,
          marginBottom: 18,
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          resize: "vertical",
        }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={
            submit.isPending ||
            uploadingIndex !== null
          }
          onClick={handleSubmit}
          style={{
            flex: 1,
            padding: 11,
            background: "#1a56db",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            fontWeight: 700,
          }}
        >
          {submit.isPending
            ? "Submitting…"
            : "Submit for Review / စစ်ဆေးရန် ပို့မည်"}
        </button>

        <button
          type="button"
          disabled={submit.isPending}
          onClick={onClose}
          style={{
            padding: "11px 16px",
            background: "#fff",
            border: "1px solid #cbd5e1",
            borderRadius: 8,
          }}
        >
          Cancel / မလုပ်တော့ပါ
        </button>
      </div>
    </ModalFrame>
  );
}

function DeliveryModal({
  task,
  onClose,
}: {
  task: RiderTask;
  onClose: () => void;
}) {
  const upload = useUploadRiderProof();
  const action = useRiderAction();

  const [recipientName, setRecipientName] = useState(
    task.receiver_name
  );
  const [recipientPhone, setRecipientPhone] = useState(
    task.receiver_phone
  );
  const [codCollected, setCodCollected] = useState(
    task.cod_amount
  );
  const [proofUrl, setProofUrl] = useState("");
  const [remarks, setRemarks] = useState("");
  const [formError, setFormError] = useState("");

  const handleUpload = async (file?: File) => {
    if (!file) return;

    setFormError("");

    try {
      const url = await upload.mutateAsync({
        task_id: task.id,
        file,
      });

      setProofUrl(url);
    } catch (error) {
      setFormError(errorText(error));
    }
  };

  const handleSubmit = async () => {
    setFormError("");

    if (!recipientName.trim()) {
      setFormError("Recipient name / လက်ခံသူအမည် is required.");
      return;
    }

    if (!proofUrl) {
      setFormError("Proof of delivery / ပို့ဆောင်မှုအထောက်အထား is required.");
      return;
    }

    try {
      await action.mutateAsync({
        task_id: task.id,
        action: "deliver",
        delivery_way_id:
          task.delivery_way_id || undefined,
        recipient_name: recipientName.trim(),
        recipient_phone:
          recipientPhone.trim() || undefined,
        proof_url: proofUrl,
        cod_collected_amount: codCollected,
        remarks: remarks.trim() || undefined,
      });

      onClose();
    } catch (error) {
      setFormError(errorText(error));
    }
  };

  return (
    <ModalFrame>
      <h3 style={{ marginBottom: 6, fontSize: 17 }}>
        Confirm Delivery / ပို့ဆောင်မှု အတည်ပြုမည်
      </h3>

      <div
        style={{
          marginBottom: 18,
          color: "#64748b",
          fontSize: 13,
        }}
      >
        {task.tracking_no}
      </div>

      {formError && <ErrorBox message={formError} />}

      <label style={{ fontSize: 12, fontWeight: 700 }}>
        Recipient name / လက်ခံသူအမည်
      </label>
      <input
        value={recipientName}
        onChange={(event) =>
          setRecipientName(event.target.value)
        }
        style={{
          width: "100%",
          padding: 10,
          margin: "4px 0 12px",
          border: "1px solid #cbd5e1",
          borderRadius: 8,
        }}
      />

      <label style={{ fontSize: 12, fontWeight: 700 }}>
        Recipient phone / လက်ခံသူဖုန်း
      </label>
      <input
        value={recipientPhone}
        onChange={(event) =>
          setRecipientPhone(event.target.value)
        }
        style={{
          width: "100%",
          padding: 10,
          margin: "4px 0 12px",
          border: "1px solid #cbd5e1",
          borderRadius: 8,
        }}
      />

      {task.cod_amount > 0 && (
        <>
          <label
            style={{ fontSize: 12, fontWeight: 700 }}
          >
            COD collected (MMK) / ကောက်ခံရရှိသော COD (ကျပ်)
          </label>
          <input
            type="number"
            min="0"
            value={codCollected}
            onChange={(event) =>
              setCodCollected(
                Number(event.target.value)
              )
            }
            style={{
              width: "100%",
              padding: 10,
              margin: "4px 0 12px",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
            }}
          />
        </>
      )}

      <label style={{ fontSize: 12, fontWeight: 700 }}>
        Proof of delivery / ပို့ဆောင်မှုအထောက်အထား
      </label>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        disabled={upload.isPending}
        onChange={(event) =>
          handleUpload(event.target.files?.[0])
        }
        style={{ margin: "8px 0" }}
      />

      <div
        style={{
          marginBottom: 12,
          color: proofUrl ? "#047857" : "#64748b",
          fontSize: 12,
        }}
      >
        {upload.isPending
          ? bi("Uploading…", "ဓာတ်ပုံတင်နေသည်…")
          : proofUrl
          ? bi("Photo uploaded", "ဓာတ်ပုံ တင်ပြီးပါပြီ")
          : bi("Photo required", "ဓာတ်ပုံ လိုအပ်ပါသည်")}
      </div>

      {proofUrl && (
        <img
          src={proofUrl}
          alt="Proof of delivery / ပို့ဆောင်မှုအထောက်အထား"
          style={{
            width: "100%",
            maxHeight: 200,
            marginBottom: 12,
            objectFit: "cover",
            borderRadius: 8,
          }}
        />
      )}

      <label style={{ fontSize: 12, fontWeight: 700 }}>
        Remarks / မှတ်ချက်
      </label>
      <textarea
        rows={2}
        value={remarks}
        onChange={(event) =>
          setRemarks(event.target.value)
        }
        style={{
          width: "100%",
          padding: 10,
          margin: "4px 0 18px",
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          resize: "vertical",
        }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={
            action.isPending || upload.isPending
          }
          onClick={handleSubmit}
          style={{
            flex: 1,
            padding: 11,
            background: "#059669",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            fontWeight: 700,
          }}
        >
          {action.isPending
            ? bi("Saving…", "သိမ်းဆည်းနေသည်…")
            : "Confirm Delivered / ပို့ဆောင်ပြီးကြောင်း အတည်ပြုမည်"}
        </button>

        <button
          type="button"
          disabled={action.isPending}
          onClick={onClose}
          style={{
            padding: "11px 16px",
            background: "#fff",
            border: "1px solid #cbd5e1",
            borderRadius: 8,
          }}
        >
          Cancel / မလုပ်တော့ပါ
        </button>
      </div>
    </ModalFrame>
  );
}

function FailureModal({
  task,
  onClose,
}: {
  task: RiderTask;
  onClose: () => void;
}) {
  const action = useRiderAction();
  const [reason, setReason] =
    useState<FailureReason>(
      "recipient_not_available"
    );
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");

  const handleSubmit = async () => {
    setFormError("");

    const mapping = RIDER_FAILURE_STATUS_MAP[reason];
    const readableReason = FAILURE_LABELS[reason];
    const remark =
      notes.trim() || readableReason;

    try {
      await action.mutateAsync({
        task_id: task.id,
        action: "exception",
        exception_code: mapping.exception_code,
        mapped_status: mapping.mapped_status,
        workflow_area: task.task_type,
        process_type: task.task_type,
        remarks: remark,
      });

      onClose();
    } catch (error) {
      setFormError(errorText(error));
    }
  };

  return (
    <ModalFrame>
      <h3 style={{ marginBottom: 6, fontSize: 17 }}>
        Report Rider Exception / Rider ပြဿနာတင်ပြမည်
      </h3>

      <div
        style={{
          marginBottom: 18,
          color: "#64748b",
          fontSize: 13,
        }}
      >
        {task.tracking_no}
      </div>

      {formError && <ErrorBox message={formError} />}

      {(Object.keys(
        FAILURE_LABELS
      ) as FailureReason[]).map((item) => (
        <label
          key={item}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 0",
            borderBottom: "1px solid #f1f5f9",
            cursor: "pointer",
          }}
        >
          <input
            type="radio"
            name="failure-reason"
            checked={reason === item}
            onChange={() => setReason(item)}
          />
          <span style={{ fontSize: 13 }}>
            {FAILURE_LABELS[item]}
          </span>
        </label>
      ))}

      <textarea
        rows={3}
        value={notes}
        placeholder="Add details for the supervisor… / ကြီးကြပ်သူအတွက် အသေးစိတ်ရေးပါ…"
        onChange={(event) =>
          setNotes(event.target.value)
        }
        style={{
          width: "100%",
          padding: 10,
          margin: "14px 0 18px",
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          resize: "vertical",
        }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={action.isPending}
          onClick={handleSubmit}
          style={{
            flex: 1,
            padding: 11,
            background: "#dc2626",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            fontWeight: 700,
          }}
        >
          {action.isPending
            ? "Submitting…"
            : "Submit Exception / ပြဿနာတင်ပြမည်"}
        </button>

        <button
          type="button"
          disabled={action.isPending}
          onClick={onClose}
          style={{
            padding: "11px 16px",
            background: "#fff",
            border: "1px solid #cbd5e1",
            borderRadius: 8,
          }}
        >
          Cancel / မလုပ်တော့ပါ
        </button>
      </div>
    </ModalFrame>
  );
}

export default function RiderPortal() {
  const { user, logout } = useAuth();
  const {
    data: tasks = [],
    isLoading,
    error,
  } = useRiderTasks();

  const action = useRiderAction();

  const [filter, setFilter] = useState<
    "all" | "pending" | "done"
  >("all");
  const [pickupTask, setPickupTask] =
    useState<RiderTask | null>(null);
  const [deliveryTask, setDeliveryTask] =
    useState<RiderTask | null>(null);
  const [failureTask, setFailureTask] =
    useState<RiderTask | null>(null);
  const [activeTaskId, setActiveTaskId] =
    useState("");
  const [actionError, setActionError] =
    useState("");
  const [notice, setNotice] = useState("");

  const filtered = useMemo(() => {
    return tasks.filter((task) => {
      if (filter === "pending") {
        return (
          task.status === "assigned" ||
          task.status === "in_progress" ||
          task.status === "waiting_review"
        );
      }

      if (filter === "done") {
        return (
          task.status === "delivered" ||
          task.status === "failed"
        );
      }

      return true;
    });
  }, [filter, tasks]);

  const pendingCount = tasks.filter(
    (task) =>
      task.status === "assigned" ||
      task.status === "in_progress" ||
      task.status === "waiting_review"
  ).length;

  const completedCount = tasks.filter(
    (task) => task.status === "delivered"
  ).length;

  const reviewCount = tasks.filter(
    (task) => task.status === "waiting_review"
  ).length;

  const handlePrimary = async (task: RiderTask) => {
    if (!task.next_action) return;

    setActionError("");
    setNotice("");

    if (
      task.next_action ===
      "submit_pickup_verification"
    ) {
      setPickupTask(task);
      return;
    }

    if (task.next_action === "deliver") {
      setDeliveryTask(task);
      return;
    }

    setActiveTaskId(task.id);

    try {
      await action.mutateAsync({
        task_id: task.id,
        action:
          task.next_action as RiderActionRequest["action"],
      });

      setNotice(
        bi(
          "Action completed successfully.",
          "လုပ်ဆောင်ချက် အောင်မြင်စွာ ပြီးစီးပါပြီ။"
        )
      );
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setActiveTaskId("");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f0f4f8",
        fontFamily:
          "'Noto Sans Myanmar', 'Pyidaungsu', 'Myanmar Text', 'Segoe UI', system-ui, sans-serif",
        lineHeight: 1.45,
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 20px",
          background: "#0f172a",
          color: "#fff",
        }}
      >
        <div>
          <div
            style={{
              fontWeight: 900,
              fontSize: 16,
            }}
          >
            🛵 Britium Express
          </div>
          <div
            style={{
              marginTop: 1,
              fontSize: 11,
              opacity: 0.55,
            }}
          >
            Rider App / ပို့ဆောင်ရေးဝန်ထမ်း အက်ပ် · {user?.full_name}
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          style={{
            padding: "6px 14px",
            background: "rgba(255,255,255,0.1)",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
          }}
        >
          Sign Out / ထွက်မည်
        </button>
      </header>

      <div
        style={{
          display: "flex",
          gap: 24,
          padding: "12px 20px",
          background: "#1e3a8a",
          color: "#fff",
          flexWrap: "wrap",
        }}
      >
        <div>
          <strong>{pendingCount}</strong>
          <div style={{ fontSize: 10, opacity: 0.7 }}>
            Pending / လုပ်ဆောင်ရန်ကျန်
          </div>
        </div>

        <div>
          <strong>{reviewCount}</strong>
          <div style={{ fontSize: 10, opacity: 0.7 }}>
            Waiting Review / စစ်ဆေးရန် စောင့်ဆိုင်းနေ
          </div>
        </div>

        <div>
          <strong>{completedCount}</strong>
          <div style={{ fontSize: 10, opacity: 0.7 }}>
            Completed / ပြီးစီး
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "0 20px",
          background: "#fff",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        {(["all", "pending", "done"] as const).map(
          (item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              style={{
                padding: "13px 16px",
                background: "none",
                border: "none",
                borderBottom:
                  filter === item
                    ? "3px solid #1a56db"
                    : "3px solid transparent",
                color:
                  filter === item
                    ? "#1a56db"
                    : "#64748b",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight:
                  filter === item ? 700 : 500,
              }}
            >
              {FILTER_LABELS[item]}
            </button>
          )
        )}
      </div>

      <main
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: "16px 16px 60px",
        }}
      >
        {notice && (
          <div
            style={{
              padding: 12,
              marginBottom: 14,
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              borderRadius: 8,
              color: "#047857",
              fontSize: 13,
            }}
          >
            {notice}
          </div>
        )}

        {actionError && (
          <ErrorBox message={actionError} />
        )}

        {isLoading && (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "#94a3b8",
            }}
          >
            Loading tasks… / တာဝန်များ ရယူနေသည်…
          </div>
        )}

        {error && (
          <ErrorBox message={errorText(error)} />
        )}

        {!isLoading && filtered.length === 0 && (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "#94a3b8",
              fontSize: 14,
            }}
          >
            No tasks in this view. / ယခုစာရင်းတွင် တာဝန်မရှိပါ။
          </div>
        )}

        {[...filtered]
          .sort((a, b) => a.sequence - b.sequence)
          .map((task) => (
            <TaskCard
              key={`${task.record_id}-${task.id}`}
              task={task}
              busy={
                action.isPending &&
                activeTaskId === task.id
              }
              onPrimary={handlePrimary}
              onFailure={setFailureTask}
            />
          ))}
      </main>

      {pickupTask && (
        <PickupVerificationModal
          task={pickupTask}
          onClose={() => setPickupTask(null)}
        />
      )}

      {deliveryTask && (
        <DeliveryModal
          task={deliveryTask}
          onClose={() => setDeliveryTask(null)}
        />
      )}

      {failureTask && (
        <FailureModal
          task={failureTask}
          onClose={() => setFailureTask(null)}
        />
      )}
    </div>
  );
}
