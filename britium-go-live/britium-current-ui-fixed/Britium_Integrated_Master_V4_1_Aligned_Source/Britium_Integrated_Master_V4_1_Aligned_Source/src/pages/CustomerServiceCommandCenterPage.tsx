import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import CustomerClosureV49 from "@/components/customer-service/CustomerClosureV49";
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clock3,
  Headset,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  Square,
  TicketCheck,
} from "lucide-react";

type Row = Record<string, any>;

type WaybillRow = {
  key: string;
  waybillNo: string;
  deliveryWayId: string;
  trackingNo: string;
  pickupId: string;
  merchantName: string;
  merchantCode: string;
  customerName: string;
  customerPhone: string;
  township: string;
  status: string;
  createdAt: string;
};

type TicketRow = Row & {
  id: string;
  ticket_no?: string;
  way_id?: string;
  pickup_id?: string;
  title?: string;
  issue_type?: string;
  priority?: string;
  status?: string;
  customer_name?: string;
  customer_phone?: string;
  created_at?: string;
  updated_at?: string;
};

type MessageRow = Row & {
  id: string;
  ticket_id: string;
  sender_role?: string;
  target_role?: string;
  message_type?: string;
  message?: string;
  is_internal?: boolean;
  created_at?: string;
};

const ISSUE_TYPES = [
  "INQUIRY",
  "REQUEST",
  "COMPLAINT",
  "FOLLOW_UP",
];

const TARGET_ROLES = [
  "operations",
  "dispatch",
  "warehouse",
  "supervisor",
  "finance",
];

function value(...options: unknown[]): string {
  for (const option of options) {
    if (
      option !== null &&
      option !== undefined &&
      String(option).trim()
    ) {
      return String(option).trim();
    }
  }

  return "";
}

function array(valueToCheck: unknown): Row[] {
  return Array.isArray(valueToCheck)
    ? (valueToCheck as Row[])
    : [];
}

function formatDate(raw: unknown): string {
  const input = value(raw);

  if (!input) return "-";

  const parsed = new Date(input);

  return Number.isNaN(parsed.getTime())
    ? input
    : parsed.toLocaleString();
}

function generatedDocuments(pickup: Row): Row[] {
  const candidates = [
    pickup?.metadata?.generated_documents,
    pickup?.payload?.generated_documents,
    pickup?.payload?.metadata?.generated_documents,
    pickup?.generated_documents,
    pickup?.metadata?.parcel_bulk_loaded_rows,
    pickup?.payload?.parcel_bulk_loaded_rows,
  ];

  for (const candidate of candidates) {
    if (
      Array.isArray(candidate) &&
      candidate.length > 0
    ) {
      return candidate;
    }
  }

  const fallbackWaybill = value(
    pickup?.waybill_no,
    pickup?.waybill_id,
  );

  const fallbackDelivery = value(
    pickup?.delivery_way_id,
    pickup?.deliver_id,
  );

  if (fallbackWaybill || fallbackDelivery) {
    return [
      {
        waybill_no: fallbackWaybill,
        delivery_way_id: fallbackDelivery,
        tracking_no: value(
          pickup?.tracking_no,
          pickup?.tracking_number,
        ),
      },
    ];
  }

  return [];
}

function flattenWaybills(pickups: Row[]): WaybillRow[] {
  const results = new Map<string, WaybillRow>();

  pickups.forEach((pickup) => {
    const pickupId = value(
      pickup.pickup_way_id,
      pickup.pickup_id,
      pickup.request_code,
    );

    const merchantName = value(
      pickup.merchant_name,
      pickup.metadata?.merchant_name,
      pickup.payload?.merchant_name,
      pickup.sender_name,
    );

    const merchantCode = value(
      pickup.merchant_code,
      pickup.metadata?.merchant_code,
      pickup.payload?.merchant_code,
    );

    const customerName = value(
      pickup.customer_name,
      pickup.recipient_name,
      pickup.contact_person,
      pickup.sender_name,
    );

    const customerPhone = value(
      pickup.customer_phone,
      pickup.recipient_phone,
      pickup.sender_phone,
      pickup.phone,
    );

    const township = value(
      pickup.delivery_township,
      pickup.pickup_township,
      pickup.metadata?.pickup_township,
      pickup.township,
    );

    const status = value(
      pickup.delivery_status,
      pickup.dispatch_status,
      pickup.workflow_stage,
      pickup.pickup_status,
      pickup.status,
      "PENDING",
    );

    generatedDocuments(pickup).forEach(
      (document, index) => {
        const waybillNo = value(
          document.waybill_no,
          document.waybill_id,
          document.delivery_way_id,
        );

        if (!waybillNo) return;

        const key = `${pickupId}|${waybillNo}|${index}`;

        results.set(key, {
          key,
          waybillNo,
          deliveryWayId: value(
            document.delivery_way_id,
            pickup.delivery_way_id,
          ),
          trackingNo: value(
            document.tracking_no,
            document.tracking_code,
            pickup.tracking_no,
          ),
          pickupId,
          merchantName,
          merchantCode,
          customerName,
          customerPhone,
          township,
          status,
          createdAt: value(
            pickup.created_at,
            pickup.updated_at,
          ),
        });
      },
    );
  });

  return Array.from(results.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

function statusStyle(status: unknown): string {
  const normalized = value(status).toLowerCase();

  if (
    ["resolved", "closed", "delivered"].includes(
      normalized,
    )
  ) {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  }

  if (
    ["urgent", "critical", "cancelled"].includes(
      normalized,
    )
  ) {
    return "border-rose-400/30 bg-rose-400/10 text-rose-300";
  }

  return "border-amber-400/30 bg-amber-400/10 text-amber-300";
}

export default function CustomerServiceCommandCenterPage() {
  const { t } = useLanguage();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [snapshot, setSnapshot] = useState<Row>({});
  const [pickups, setPickups] = useState<Row[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);

  const [queueSearch, setQueueSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [selectedTicket, setSelectedTicket] =
    useState<TicketRow | null>(null);

  const [issueType, setIssueType] =
    useState("INQUIRY");
  const [priority, setPriority] = useState("medium");
  const [targetRole, setTargetRole] =
    useState("operations");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [caseDescription, setCaseDescription] =
    useState("");

  const [operationsMessage, setOperationsMessage] =
    useState("");
  const [customerLog, setCustomerLog] = useState("");
  const [internalNote, setInternalNote] = useState("");

  const [banner, setBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const waybills = useMemo(
    () => flattenWaybills(pickups),
    [pickups],
  );

  const filteredWaybills = useMemo(() => {
    const query = queueSearch.trim().toLowerCase();

    if (!query) return waybills;

    return waybills.filter((row) =>
      [
        row.waybillNo,
        row.deliveryWayId,
        row.trackingNo,
        row.pickupId,
        row.merchantName,
        row.merchantCode,
        row.customerName,
        row.customerPhone,
        row.township,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [queueSearch, waybills]);

  const selectedRows = useMemo(
    () =>
      waybills.filter((row) =>
        selectedKeys.includes(row.key),
      ),
    [selectedKeys, waybills],
  );

  const filteredTickets = useMemo(() => {
    const query = historySearch.trim().toLowerCase();

    if (!query) return tickets;

    return tickets.filter((ticket) =>
      [
        ticket.ticket_no,
        ticket.way_id,
        ticket.pickup_id,
        ticket.customer_name,
        ticket.customer_phone,
        ticket.title,
        ticket.issue_type,
        ticket.status,
        JSON.stringify(ticket.payload ?? {}),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [historySearch, tickets]);

  const selectedMessages = useMemo(
    () =>
      messages
        .filter(
          (message) =>
            message.ticket_id === selectedTicket?.id,
        )
        .sort((a, b) =>
          value(a.created_at).localeCompare(
            value(b.created_at),
          ),
        ),
    [messages, selectedTicket?.id],
  );

  async function loadData(showSpinner = true) {
    if (showSpinner) setLoading(true);

    try {
      const { data, error } = await supabase.rpc(
        "be_customer_service_snapshot",
      );

      if (error) throw error;

      const response = (data ?? {}) as Row;

      if (response.ok !== true) {
        throw new Error(
          response.message ||
            response.error ||
            "Customer Service snapshot failed.",
        );
      }

      setSnapshot(response);
      setPickups(array(response.pickups));
      setTickets(array(response.tickets) as TicketRow[]);
      setMessages(
        array(response.messages) as MessageRow[],
      );
    } catch (error) {
      setBanner({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to load CS data.",
      });
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  async function openTicket(ticket: TicketRow) {
    setSelectedTicket(ticket);

    try {
      const { data, error } = await supabase.rpc(
        "be_cs_ticket_detail",
        {
          p_ticket_id: ticket.id,
        },
      );

      if (error) throw error;

      const response = (data ?? {}) as Row;

      if (response.ticket) {
        setSelectedTicket(
          response.ticket as TicketRow,
        );
      }

      const ticketMessages =
        array(response.messages) as MessageRow[];

      setMessages((current) => [
        ...current.filter(
          (message) =>
            message.ticket_id !== ticket.id,
        ),
        ...ticketMessages,
      ]);
    } catch (error) {
      setBanner({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to load ticket history.",
      });
    }
  }

  useEffect(() => {
    void loadData();

    const channel = supabase
      .channel("cs-command-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "be_cs_tickets",
        },
        () => void loadData(false),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "be_cs_messages",
        },
        () => void loadData(false),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const firstRow = selectedRows[0];

    if (!firstRow) return;

    setCustomerName(
      (current) =>
        current || firstRow.customerName,
    );

    setCustomerPhone(
      (current) =>
        current || firstRow.customerPhone,
    );

    setCaseTitle(
      (current) =>
        current ||
        `${issueType.replace(/_/g, " ")} - ${
          firstRow.waybillNo
        }`,
    );
  }, [selectedRows, issueType]);

  function toggleWaybill(key: string) {
    setSelectedKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  function toggleAllVisible() {
    const visibleKeys = filteredWaybills.map(
      (row) => row.key,
    );

    const allSelected =
      visibleKeys.length > 0 &&
      visibleKeys.every((key) =>
        selectedKeys.includes(key),
      );

    setSelectedKeys((current) =>
      allSelected
        ? current.filter(
            (key) => !visibleKeys.includes(key),
          )
        : Array.from(
            new Set([...current, ...visibleKeys]),
          ),
    );
  }

  async function createCase() {
    if (selectedRows.length === 0) {
      setBanner({
        type: "error",
        text: "Select at least one Waybill.",
      });
      return;
    }

    if (!caseTitle.trim()) {
      setBanner({
        type: "error",
        text: "Case title is required.",
      });
      return;
    }

    const primary = selectedRows[0];

    setSaving(true);
    setBanner(null);

    try {
      const { data, error } = await supabase.rpc(
        "be_cs_create_ticket",
        {
          p_payload: {
            way_id: primary.waybillNo,
            delivery_way_id:
              primary.deliveryWayId,
            pickup_id: primary.pickupId,
            customer_name:
              customerName.trim() ||
              primary.customerName,
            customer_phone:
              customerPhone.trim() ||
              primary.customerPhone,
            issue_type: issueType,
            title: caseTitle.trim(),
            description: caseDescription.trim(),
            priority,
            target_role: targetRole,
            responsible_role: targetRole,
            source: "cs_command",
            selected_waybills: selectedRows.map(
              (row) => row.waybillNo,
            ),
            selected_pickup_ids: Array.from(
              new Set(
                selectedRows
                  .map((row) => row.pickupId)
                  .filter(Boolean),
              ),
            ),
          },
        },
      );

      if (error) throw error;

      const response = (data ?? {}) as Row;

      if (response.ok !== true) {
        throw new Error(
          response.message ||
            response.error ||
            "Case creation failed.",
        );
      }

      setBanner({
        type: "success",
        text: `Case ${
          response.ticket_no || ""
        } created and routed to ${targetRole}.`,
      });

      setCaseDescription("");
      setSelectedKeys([]);

      await loadData(false);

      if (response.ticket) {
        await openTicket(
          response.ticket as TicketRow,
        );
      }
    } catch (error) {
      setBanner({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to create case.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveMessage(
    message: string,
    messageType: string,
    destinationRole: string,
    internal: boolean,
  ) {
    if (!selectedTicket) {
      setBanner({
        type: "error",
        text: "Select a previous inquiry first.",
      });
      return;
    }

    if (!message.trim()) {
      setBanner({
        type: "error",
        text: "Enter a message.",
      });
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await supabase.rpc(
        "be_cs_add_message",
        {
          p_ticket_id: selectedTicket.id,
          p_message: message.trim(),
          p_sender_role: "customer_service",
          p_target_role: destinationRole,
          p_metadata: {
            message_type: messageType,
            is_internal: internal,
          },
        },
      );

      if (error) throw error;

      const response = (data ?? {}) as Row;

      if (response.ok !== true) {
        throw new Error(
          response.message ||
            response.error ||
            "Message could not be saved.",
        );
      }

      if (messageType === "operations_comment") {
        setOperationsMessage("");
      }

      if (messageType === "customer_contact_log") {
        setCustomerLog("");
      }

      if (messageType === "internal_note") {
        setInternalNote("");
      }

      setBanner({
        type: "success",
        text:
          messageType === "operations_comment"
            ? `Message sent to ${destinationRole}.`
            : "Conversation entry saved.",
      });

      await openTicket(selectedTicket);
      await loadData(false);
    } catch (error) {
      setBanner({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to save message.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(status: string) {
    if (!selectedTicket) return;

    setSaving(true);

    try {
      const { data, error } = await supabase.rpc(
        "be_cs_update_ticket_status",
        {
          p_ticket_id: selectedTicket.id,
          p_status: status,
          p_resolution_note: null,
          p_target_role: "customer_service",
        },
      );

      if (error) throw error;

      const response = (data ?? {}) as Row;

      if (response.ok !== true) {
        throw new Error(
          response.error ||
            "Status update failed.",
        );
      }

      setSelectedTicket(
        response.ticket as TicketRow,
      );

      await loadData(false);
      await openTicket(
        response.ticket as TicketRow,
      );
    } catch (error) {
      setBanner({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to update status.",
      });
    } finally {
      setSaving(false);
    }
  }

  const stats = snapshot.stats ?? {};

  return (
    <div
      className="mx-auto max-w-[1800px] space-y-6 p-5 md:p-8 notranslate"
      translate="no"
    >
      <header className="flex flex-col gap-4 rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6 shadow-xl xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#38bdf8]">
            <Headset size={14} />
            {t(
              "Customer Service",
              "ဖောက်သည်ဝန်ဆောင်မှု",
            )}
          </div>

          <h1 className="text-2xl font-bold text-white">
            {t(
              "CS Command Center",
              "စောင့်ကြည့်ရေး စင်တာ",
            )}
          </h1>

          <p className="mt-1 text-sm text-[#7ca5c3]">
            Select Waybills, manage inquiries and
            complaints, and communicate with responsible
            operations teams.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {[
            [
              "Open Requests",
              stats.open_requests ?? 0,
            ],
            [
              "Open Tickets",
              stats.open_tickets ?? 0,
            ],
            ["Urgent", stats.urgent_open ?? 0],
          ].map(([label, count]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-2"
            >
              <div className="text-[10px] uppercase text-[#5f86a5]">
                {label}
              </div>

              <div className="text-lg font-black text-white">
                {count}
              </div>
            </div>
          ))}

          <button
            type="button"
            disabled={loading}
            onClick={() => void loadData()}
            className="flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#1a3a5c]/50 px-4 py-3 text-xs font-bold text-[#c8dff0]"
          >
            <RefreshCw
              size={14}
              className={
                loading ? "animate-spin" : ""
              }
            />
            Refresh
          </button>
        </div>
      </header>

      {banner && (
        <div
          className={`flex items-center gap-2 rounded-2xl border px-5 py-4 text-sm font-bold ${
            banner.type === "success"
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-rose-400/30 bg-rose-400/10 text-rose-300"
          }`}
        >
          {banner.type === "success" ? (
            <CheckCircle2 size={18} />
          ) : (
            <AlertTriangle size={18} />
          )}

          {banner.text}
        </div>
      )}

      <CustomerClosureV49 />

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
        <section className="flex min-h-[720px] flex-col overflow-hidden rounded-3xl border border-[#1a3a5c] bg-[#0b2236]">
          <div className="border-b border-[#1a3a5c] bg-[#081b2e] p-5">
            <div className="flex justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Selectable Waybill Queue
                </h2>

                <p className="text-xs text-[#6f96b4]">
                  {waybills.length} Waybills ·{" "}
                  {selectedRows.length} selected
                </p>
              </div>

              <button
                type="button"
                onClick={toggleAllVisible}
                className="flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-2 text-xs text-white"
              >
                <CheckSquare size={16} />
                Select visible
              </button>
            </div>

            <div className="relative mt-4">
              <Search
                className="absolute left-4 top-3.5 text-[#4d7a9b]"
                size={18}
              />

              <input
                value={queueSearch}
                onChange={(event) =>
                  setQueueSearch(event.target.value)
                }
                placeholder="Search Waybill, DeliveryWayID, PickupWayID, merchant or phone..."
                className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] py-3 pl-12 pr-4 text-sm text-white"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-[#061524]">
            <table className="w-full min-w-[1050px] text-left">
              <thead className="sticky top-0 bg-[#081b2e]">
                <tr>
                  {[
                    "",
                    "Waybill",
                    "DeliveryWayID",
                    "PickupWayID",
                    "Merchant",
                    "Township",
                    "Status",
                  ].map((heading) => (
                    <th
                      key={heading || "select"}
                      className="border-b border-[#1a3a5c] p-4 text-[11px] uppercase text-[#4d7a9b]"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredWaybills.map((row) => {
                  const selected =
                    selectedKeys.includes(row.key);

                  return (
                    <tr
                      key={row.key}
                      onClick={() =>
                        toggleWaybill(row.key)
                      }
                      className={`cursor-pointer border-b border-[#1a3a5c]/50 ${
                        selected
                          ? "bg-[#123456]"
                          : "hover:bg-[#1a3a5c]/30"
                      }`}
                    >
                      <td className="p-4">
                        {selected ? (
                          <CheckSquare
                            size={17}
                            className="text-[#38bdf8]"
                          />
                        ) : (
                          <Square
                            size={17}
                            className="text-[#5d7890]"
                          />
                        )}
                      </td>

                      <td className="p-4 font-mono font-black text-[#f6b84b]">
                        {row.waybillNo}
                      </td>

                      <td className="p-4 font-mono text-[#74c9ff]">
                        {row.deliveryWayId || "-"}
                      </td>

                      <td className="p-4 font-mono text-[#c8dff0]">
                        {row.pickupId || "-"}
                      </td>

                      <td className="p-4">
                        <div className="font-bold text-white">
                          {row.merchantName || "-"}
                        </div>

                        <div className="text-xs text-[#5f86a5]">
                          {row.customerPhone ||
                            row.merchantCode}
                        </div>
                      </td>

                      <td className="p-4 text-[#c8dff0]">
                        {row.township || "-"}
                      </td>

                      <td className="p-4">
                        <span
                          className={`rounded border px-2 py-1 text-[10px] font-bold uppercase ${statusStyle(
                            row.status,
                          )}`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white">
              <TicketCheck className="text-[#38bdf8]" />
              Create CS Case
            </h2>

            <div className="mt-4 rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-xs text-[#7ca5c3]">
              {selectedRows.length
                ? `${selectedRows.length} selected: ${selectedRows
                    .map((row) => row.waybillNo)
                    .slice(0, 4)
                    .join(", ")}`
                : "Select one or more Waybills."}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3">
              <select
                value={issueType}
                onChange={(event) =>
                  setIssueType(event.target.value)
                }
                className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-sm text-white"
              >
                {ISSUE_TYPES.map((option) => (
                  <option key={option}>
                    {option}
                  </option>
                ))}
              </select>

              <select
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value)
                }
                className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-sm text-white"
              >
                {["low", "medium", "high", "urgent"].map(
                  (option) => (
                    <option key={option}>
                      {option}
                    </option>
                  ),
                )}
              </select>

              <select
                value={targetRole}
                onChange={(event) =>
                  setTargetRole(event.target.value)
                }
                className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-sm text-white"
              >
                {TARGET_ROLES.map((option) => (
                  <option key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <input
                value={customerName}
                onChange={(event) =>
                  setCustomerName(event.target.value)
                }
                placeholder="Customer name"
                className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-sm text-white"
              />

              <input
                value={customerPhone}
                onChange={(event) =>
                  setCustomerPhone(event.target.value)
                }
                placeholder="Customer phone"
                className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-sm text-white"
              />
            </div>

            <input
              value={caseTitle}
              onChange={(event) =>
                setCaseTitle(event.target.value)
              }
              placeholder="Case title"
              className="mt-3 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-sm text-white"
            />

            <textarea
              value={caseDescription}
              onChange={(event) =>
                setCaseDescription(event.target.value)
              }
              rows={4}
              placeholder="Inquiry, request or complaint details..."
              className="mt-3 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-sm text-white"
            />

            <button
              type="button"
              disabled={
                saving || selectedRows.length === 0
              }
              onClick={() => void createCase()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#38bdf8] px-4 py-3 text-sm font-black text-[#061524] disabled:opacity-40"
            >
              {saving ? (
                <Loader2
                  className="animate-spin"
                  size={17}
                />
              ) : (
                <Send size={17} />
              )}
              Create and route case
            </button>
          </section>

          <section className="overflow-hidden rounded-3xl border border-[#1a3a5c] bg-[#0b2236]">
            <div className="border-b border-[#1a3a5c] bg-[#081b2e] p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                <Clock3 className="text-[#f6b84b]" />
                Previous Inquiries
              </h2>

              <input
                value={historySearch}
                onChange={(event) =>
                  setHistorySearch(event.target.value)
                }
                placeholder="Search ticket, Waybill, customer or phone..."
                className="mt-3 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-sm text-white"
              />
            </div>

            <div className="max-h-[320px] overflow-auto">
              {filteredTickets.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#6f96b4]">
                  No previous inquiries found.
                </div>
              ) : (
                filteredTickets.map((ticket) => (
                  <button
                    type="button"
                    key={ticket.id}
                    onClick={() =>
                      void openTicket(ticket)
                    }
                    className={`flex w-full items-center justify-between border-b border-[#1a3a5c]/50 p-4 text-left ${
                      selectedTicket?.id === ticket.id
                        ? "bg-[#123456]"
                        : "hover:bg-[#123456]/40"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-white">
                        {ticket.ticket_no ||
                          ticket.title}
                      </div>

                      <div className="mt-1 text-xs text-[#7ca5c3]">
                        {ticket.way_id || "-"} ·{" "}
                        {ticket.issue_type || "CASE"} ·{" "}
                        {formatDate(
                          ticket.updated_at ||
                            ticket.created_at,
                        )}
                      </div>
                    </div>

                    <ChevronRight
                      size={16}
                      className="text-[#5f86a5]"
                    />
                  </button>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      <section className="overflow-hidden rounded-3xl border border-[#1a3a5c] bg-[#0b2236]">
        <div className="border-b border-[#1a3a5c] bg-[#081b2e] p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <MessageSquareText className="text-[#38bdf8]" />
            Case Conversation
          </h2>

          <p className="mt-1 text-xs text-[#6f96b4]">
            {selectedTicket
              ? `${selectedTicket.ticket_no} · ${selectedTicket.way_id}`
              : "Select a previous inquiry."}
          </p>

          {selectedTicket && (
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                "open",
                "in_progress",
                "waiting_operations",
                "resolved",
              ].map((status) => (
                <button
                  type="button"
                  key={status}
                  onClick={() =>
                    void updateStatus(status)
                  }
                  className="rounded-lg border border-[#1a3a5c] bg-[#061524] px-3 py-2 text-[10px] font-bold uppercase text-[#7ca5c3]"
                >
                  {status.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2">
          <div className="max-h-[600px] min-h-[400px] overflow-auto border-r border-[#1a3a5c] bg-[#061524] p-5">
            {selectedMessages.map((message) => (
              <article
                key={message.id}
                className={`mb-3 rounded-2xl border p-4 ${
                  message.is_internal
                    ? "border-violet-400/30 bg-violet-400/10"
                    : "border-[#1a3a5c] bg-[#0b2236]"
                }`}
              >
                <div className="text-xs font-bold uppercase text-[#7ca5c3]">
                  {message.sender_role || "system"} →{" "}
                  {message.target_role || "-"}
                </div>

                <p className="mt-2 whitespace-pre-wrap text-sm text-white">
                  {message.message}
                </p>

                <div className="mt-2 text-[10px] text-[#5f86a5]">
                  {message.message_type} ·{" "}
                  {formatDate(message.created_at)}
                </div>
              </article>
            ))}
          </div>

          <div className="space-y-4 p-5">
            <MessageBox
              title={`Operations instruction → ${targetRole}`}
              value={operationsMessage}
              onChange={setOperationsMessage}
              disabled={!selectedTicket || saving}
              onSend={() =>
                void saveMessage(
                  operationsMessage,
                  "operations_comment",
                  targetRole,
                  false,
                )
              }
            />

            <MessageBox
              title="Customer communication log"
              value={customerLog}
              onChange={setCustomerLog}
              disabled={!selectedTicket || saving}
              onSend={() =>
                void saveMessage(
                  customerLog,
                  "customer_contact_log",
                  "customer_service",
                  false,
                )
              }
            />

            <MessageBox
              title="Internal CS note"
              value={internalNote}
              onChange={setInternalNote}
              disabled={!selectedTicket || saving}
              onSend={() =>
                void saveMessage(
                  internalNote,
                  "internal_note",
                  "customer_service",
                  true,
                )
              }
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function MessageBox({
  title,
  value: messageValue,
  onChange,
  onSend,
  disabled,
}: {
  title: string;
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4">
      <h3 className="text-sm font-bold text-white">
        {title}
      </h3>

      <textarea
        value={messageValue}
        onChange={(event) =>
          onChange(event.target.value)
        }
        rows={3}
        className="mt-3 w-full rounded-xl border border-[#1a3a5c] bg-[#0b2236] p-3 text-sm text-white"
      />

      <button
        type="button"
        disabled={disabled}
        onClick={onSend}
        className="mt-3 flex items-center gap-2 rounded-xl bg-[#38bdf8] px-4 py-2.5 text-xs font-black text-[#061524] disabled:opacity-40"
      >
        <Send size={15} />
        Save / Send
      </button>
    </div>
  );
}