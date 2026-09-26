// @ts-nocheck
import React, { useMemo, useRef, useState } from "react";
import {
  useShipments,
  useCreateShipment,
  usePickups,
  useCreatePickup,
  useTrackShipment,
  useSettlements,
  useTickets,
  useCreateTicket,
  useNotifications,
  useMarkRead,
  useMarkAllRead,
} from "../hooks/useApi";
import { useAuth } from "../contexts/AuthContext";

type Tab =
  | "dashboard"
  | "shipments"
  | "pickups"
  | "tracking"
  | "settlements"
  | "support"
  | "terms"
  | "notifications"
  | "profile";

const EMPTY_SHIPMENT = {
  receiver_name: "",
  receiver_phone: "",
  receiver_address: "",
  receiver_township: "",
  receiver_city: "",
  cod_amount: "",
  service_type: "standard",
  notes: "",
};

const EMPTY_PICKUP = {
  pickup_date: "",
  pickup_window: "morning",
  parcel_count: "",
  pickup_address: "",
  contact_name: "",
  contact_phone: "",
  notes: "",
};

const EMPTY_TICKET = {
  subject: "",
  issue_type: "inquiry",
  shipment_awb: "",
  priority: "medium",
  notes: "",
  department: "customer_service",
};

const TABS: { id: Tab; label: string; short: string }[] = [
  { id: "dashboard", label: "Dashboard", short: "⌂" },
  { id: "shipments", label: "Orders & Shipments", short: "▣" },
  { id: "pickups", label: "Pickup Requests", short: "↥" },
  { id: "tracking", label: "Cargo Tracking", short: "⌖" },
  { id: "settlements", label: "Financial Settlement", short: "₭" },
  { id: "support", label: "Customer Service", short: "?" },
  { id: "terms", label: "Marketing & T&C", short: "✦" },
  { id: "notifications", label: "Notifications", short: "●" },
  { id: "profile", label: "Company Profile", short: "◉" },
];

export default function MerchantPortal() {
  const { profile, user, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [shipmentForm, setShipmentForm] = useState(EMPTY_SHIPMENT);
  const [pickupForm, setPickupForm] = useState(EMPTY_PICKUP);
  const [trackInput, setTrackInput] = useState("");
  const [trackAWB, setTrackAWB] = useState("");
  const [settlementSearch, setSettlementSearch] = useState("");
  const [ticketForm, setTicketForm] = useState(EMPTY_TICKET);
  const [termsMessage, setTermsMessage] = useState("");
  const [profileDraft, setProfileDraft] = useState(() => {
    const saved = localStorage.getItem("britium_merchant_profile");
    return saved
      ? JSON.parse(saved)
      : {
          company_name: profile?.full_name || "",
          contact_name: profile?.full_name || "",
          contact_phone: "",
          contact_email: profile?.email || user?.email || "",
          address: "",
          logo_data_url: "",
        };
  });
  const logoRef = useRef<HTMLInputElement>(null);

  const shipments = useShipments({ limit: "100" });
  const createShipment = useCreateShipment();
  const pickups = usePickups({ limit: "100" });
  const createPickup = useCreatePickup();
  const tracking = useTrackShipment(trackAWB);
  const settlements = useSettlements();
  const tickets = useTickets({ status: "all" });
  const createTicket = useCreateTicket();
  const notifications = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const shipmentRows = (shipments.data as Record<string, unknown>[]) || [];
  const pickupRows = (pickups.data as Record<string, unknown>[]) || [];
  const settlementRows = (settlements.data as Record<string, unknown>[]) || [];
  const ticketRows = (tickets.data as Record<string, unknown>[]) || [];
  const notificationRows = (notifications.data as Record<string, unknown>[]) || [];

  const unreadCount = notificationRows.filter((n) => !n.read_at && !n.is_read).length;
  const delivered = shipmentRows.filter((s) => String(s.status || "").toLowerCase() === "delivered").length;
  const activeShipments = shipmentRows.filter((s) => !["delivered", "cancelled"].includes(String(s.status || "").toLowerCase())).length;
  const openTickets = ticketRows.filter((t) => !["resolved", "closed"].includes(String(t.status || "").toLowerCase())).length;

  const filteredSettlements = useMemo(() => {
    const q = settlementSearch.trim().toLowerCase();
    if (!q) return settlementRows;
    return settlementRows.filter((r) =>
      [
        r.awb,
        r.way_id,
        r.shipment_awb,
        r.batch_no,
        r.reference_no,
        r.transfer_status,
      ]
        .map((v) => String(v || "").toLowerCase())
        .some((v) => v.includes(q))
    );
  }, [settlementRows, settlementSearch]);

  async function submitTicket(department = ticketForm.department, override?: Partial<typeof EMPTY_TICKET>) {
    const payload = { ...ticketForm, ...override, department };
    await createTicket.mutateAsync(payload);
    setTicketForm(EMPTY_TICKET);
  }

  function saveProfile() {
    localStorage.setItem("britium_merchant_profile", JSON.stringify(profileDraft));
  }

  function onLogo(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const next = { ...profileDraft, logo_data_url: String(reader.result || "") };
      setProfileDraft(next);
      localStorage.setItem("britium_merchant_profile", JSON.stringify(next));
    };
    reader.readAsDataURL(file);
  }

  return (
    <div style={S.app}>
      <aside style={S.sidebar}>
        <div style={S.brandBlock}>
          <div style={S.brandMark}>BE</div>
          <div>
            <div style={S.brand}>Britium Express</div>
            <div style={S.brandSub}>Merchant Workspace</div>
          </div>
        </div>

        <div style={S.companyMini}>
          <div style={S.logoWrap}>
            {profileDraft.logo_data_url ? (
              <img src={profileDraft.logo_data_url} alt="Company logo" style={S.logoImg} />
            ) : (
              <span style={{ fontWeight: 900 }}>{initials(profileDraft.company_name || profile?.full_name || "Merchant")}</span>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={S.companyName}>{profileDraft.company_name || profile?.full_name || "Merchant Company"}</div>
            <div style={S.companyEmail}>{profileDraft.contact_email || profile?.email || user?.email || "Merchant account"}</div>
          </div>
        </div>

        <nav style={S.nav}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={tab === t.id ? S.navActive : S.navItem}>
              <span style={S.navIcon}>{t.short}</span>
              <span>{t.label}</span>
              {t.id === "notifications" && unreadCount > 0 ? <span style={S.count}>{unreadCount}</span> : null}
            </button>
          ))}
        </nav>

        <div style={S.sideFoot}>
          <button onClick={() => signOut()} style={S.signOut}>Sign out</button>
        </div>
      </aside>

      <section style={S.shell}>
        <header style={S.topbar}>
          <div>
            <div style={S.eyebrow}>MERCHANT PORTAL</div>
            <h1 style={S.pageTitle}>{TABS.find((x) => x.id === tab)?.label}</h1>
          </div>
          <div style={S.topActions}>
            <button style={S.quickBtn} onClick={() => setTab("pickups")}>+ Request Pickup</button>
            <button style={S.bellBtn} onClick={() => setTab("notifications")}>
              Notifications {unreadCount ? <span style={S.bellCount}>{unreadCount}</span> : null}
            </button>
          </div>
        </header>

        <main style={S.main}>
          {tab === "dashboard" && (
            <>
              <section style={S.hero}>
                <div>
                  <div style={S.heroKicker}>Welcome back</div>
                  <h2 style={S.heroTitle}>{profileDraft.company_name || profile?.full_name || "Merchant Partner"}</h2>
                  <p style={S.heroText}>Manage pickup requests, parcel movement, settlements, support cases and commercial matters with Britium Express from one workspace.</p>
                </div>
                <div style={S.heroButtons}>
                  <button style={S.primaryBtn} onClick={() => setTab("shipments")}>Book shipment</button>
                  <button style={S.secondaryBtn} onClick={() => setTab("tracking")}>Track cargo</button>
                </div>
              </section>

              <section style={S.stats}>
                <Stat label="Active shipments" value={activeShipments} note="In progress" />
                <Stat label="Delivered" value={delivered} note="Latest 100 records" />
                <Stat label="Open service cases" value={openTickets} note="Customer Service" />
                <Stat label="Unread notifications" value={unreadCount} note="Requires attention" />
              </section>

              <div style={S.twoCol}>
                <Card title="Recent shipments" action={<button style={S.linkBtn} onClick={() => setTab("tracking")}>Track a shipment →</button>}>
                  <SimpleTable
                    cols={["Way / AWB", "Receiver", "Township", "COD", "Status"]}
                    rows={shipmentRows.slice(0, 6)}
                    render={(r) => [
                      r.awb || r.way_id || "—",
                      r.receiver_name || "—",
                      r.receiver_township || r.receiver_city || "—",
                      mmk(r.cod_amount),
                      <Badge key="status" value={String(r.status || "pending")} />,
                    ]}
                  />
                </Card>

                <Card title="Attention center">
                  <div style={S.attentionList}>
                    <Attention title="Customer Service" value={openTickets} text="Open inquiry / complaint cases" onClick={() => setTab("support")} />
                    <Attention title="Pickup requests" value={pickupRows.length} text="Submitted pickup requests" onClick={() => setTab("pickups")} />
                    <Attention title="Notifications" value={unreadCount} text="Messages and clarifications" onClick={() => setTab("notifications")} />
                  </div>
                </Card>
              </div>
            </>
          )}

          {tab === "shipments" && (
            <div style={S.twoColWide}>
              <Card title="Book a new shipment">
                {createShipment.isError && <Banner kind="error" text={createShipment.error?.message || "Unable to create shipment."} />}
                {createShipment.isSuccess && <Banner kind="success" text="Shipment submitted successfully." />}
                <form style={S.formGrid} onSubmit={async (e) => {
                  e.preventDefault();
                  await createShipment.mutateAsync({
                    ...shipmentForm,
                    cod_amount: Number(shipmentForm.cod_amount || 0),
                  });
                  setShipmentForm(EMPTY_SHIPMENT);
                }}>
                  <Field label="Receiver name *"><input required style={S.input} value={shipmentForm.receiver_name} onChange={(e) => setShipmentForm({ ...shipmentForm, receiver_name: e.target.value })} /></Field>
                  <Field label="Receiver phone *"><input required style={S.input} value={shipmentForm.receiver_phone} onChange={(e) => setShipmentForm({ ...shipmentForm, receiver_phone: e.target.value })} /></Field>
                  <Field label="Township *"><input required style={S.input} value={shipmentForm.receiver_township} onChange={(e) => setShipmentForm({ ...shipmentForm, receiver_township: e.target.value })} /></Field>
                  <Field label="City *"><input required style={S.input} value={shipmentForm.receiver_city} onChange={(e) => setShipmentForm({ ...shipmentForm, receiver_city: e.target.value })} /></Field>
                  <Field label="COD amount (MMK)"><input type="number" min="0" style={S.input} value={shipmentForm.cod_amount} onChange={(e) => setShipmentForm({ ...shipmentForm, cod_amount: e.target.value })} /></Field>
                  <Field label="Service type">
                    <select style={S.input} value={shipmentForm.service_type} onChange={(e) => setShipmentForm({ ...shipmentForm, service_type: e.target.value })}>
                      <option value="standard">Standard</option>
                      <option value="express">Express</option>
                      <option value="same_day">Same Day</option>
                      <option value="cod_express">COD Express</option>
                    </select>
                  </Field>
                  <Field label="Full delivery address *" wide><textarea required style={{ ...S.input, minHeight: 72 }} value={shipmentForm.receiver_address} onChange={(e) => setShipmentForm({ ...shipmentForm, receiver_address: e.target.value })} /></Field>
                  <Field label="Notes" wide><textarea style={{ ...S.input, minHeight: 72 }} value={shipmentForm.notes} onChange={(e) => setShipmentForm({ ...shipmentForm, notes: e.target.value })} /></Field>
                  <div style={{ gridColumn: "1/-1" }}><button disabled={createShipment.isPending} style={S.primaryBtn}>{createShipment.isPending ? "Submitting..." : "Submit shipment"}</button></div>
                </form>
              </Card>

              <Card title="Shipment register">
                <SimpleTable
                  cols={["Way / AWB", "Receiver", "Amount", "Status", "Created"]}
                  rows={shipmentRows}
                  render={(r) => [r.awb || r.way_id || "—", r.receiver_name || "—", mmk(r.cod_amount), <Badge key="s" value={String(r.status || "pending")} />, date(r.created_at)]}
                />
              </Card>
            </div>
          )}

          {tab === "pickups" && (
            <div style={S.twoColWide}>
              <Card title="Submit order picking request">
                {createPickup.isError && <Banner kind="error" text={createPickup.error?.message || "Unable to submit pickup request."} />}
                {createPickup.isSuccess && <Banner kind="success" text="Pickup request submitted to Britium Express." />}
                <form style={S.formGrid} onSubmit={async (e) => {
                  e.preventDefault();
                  await createPickup.mutateAsync({ ...pickupForm, parcel_count: Number(pickupForm.parcel_count || 0) });
                  setPickupForm(EMPTY_PICKUP);
                }}>
                  <Field label="Pickup date *"><input required type="date" style={S.input} value={pickupForm.pickup_date} onChange={(e) => setPickupForm({ ...pickupForm, pickup_date: e.target.value })} /></Field>
                  <Field label="Pickup time window">
                    <select style={S.input} value={pickupForm.pickup_window} onChange={(e) => setPickupForm({ ...pickupForm, pickup_window: e.target.value })}>
                      <option value="morning">Morning</option>
                      <option value="afternoon">Afternoon</option>
                      <option value="evening">Evening</option>
                    </select>
                  </Field>
                  <Field label="Number of parcels *"><input required type="number" min="1" style={S.input} value={pickupForm.parcel_count} onChange={(e) => setPickupForm({ ...pickupForm, parcel_count: e.target.value })} /></Field>
                  <Field label="Contact name"><input style={S.input} value={pickupForm.contact_name} onChange={(e) => setPickupForm({ ...pickupForm, contact_name: e.target.value })} /></Field>
                  <Field label="Contact phone"><input style={S.input} value={pickupForm.contact_phone} onChange={(e) => setPickupForm({ ...pickupForm, contact_phone: e.target.value })} /></Field>
                  <Field label="Pickup address" wide><textarea style={{ ...S.input, minHeight: 72 }} value={pickupForm.pickup_address} onChange={(e) => setPickupForm({ ...pickupForm, pickup_address: e.target.value })} /></Field>
                  <Field label="Pickup notes" wide><textarea style={{ ...S.input, minHeight: 72 }} value={pickupForm.notes} onChange={(e) => setPickupForm({ ...pickupForm, notes: e.target.value })} /></Field>
                  <div style={{ gridColumn: "1/-1" }}><button disabled={createPickup.isPending} style={S.primaryBtn}>{createPickup.isPending ? "Submitting..." : "Send pickup request"}</button></div>
                </form>
              </Card>

              <Card title="Pickup request history">
                <SimpleTable
                  cols={["Request", "Date", "Parcels", "Window", "Status"]}
                  rows={pickupRows}
                  render={(r) => [String(r.pickup_no || r.id || "—").slice(0, 14), date(r.pickup_date), String(r.parcel_count || "—"), r.pickup_window || "—", <Badge key="p" value={String(r.status || "submitted")} />]}
                />
              </Card>
            </div>
          )}

          {tab === "tracking" && (
            <Card title="Cargo tracking">
              <form style={S.searchRow} onSubmit={(e) => { e.preventDefault(); setTrackAWB(trackInput.trim()); }}>
                <input style={{ ...S.input, flex: 1 }} placeholder="Enter Way ID / AWB / tracking number" value={trackInput} onChange={(e) => setTrackInput(e.target.value)} />
                <button style={S.primaryBtn}>Track cargo</button>
              </form>
              {tracking.isLoading && <div style={S.muted}>Searching shipment...</div>}
              {tracking.isError && <Banner kind="error" text="Shipment could not be found with the entered reference." />}
              {tracking.data && <TrackingCard data={tracking.data as Record<string, unknown>} />}
            </Card>
          )}

          {tab === "settlements" && (
            <Card title="Financial settlement by Way / AWB">
              <p style={S.helper}>Search a dedicated Way ID, AWB, settlement batch or reference to review COD, service fee, net payable and transfer status.</p>
              <div style={S.searchRow}>
                <input style={{ ...S.input, flex: 1 }} placeholder="Search Way ID / AWB / batch / reference" value={settlementSearch} onChange={(e) => setSettlementSearch(e.target.value)} />
              </div>
              <SimpleTable
                cols={["Way / AWB", "Batch / Ref", "Gross COD", "Service Fee", "Net Payable", "Status", "Date"]}
                rows={filteredSettlements}
                render={(r) => [
                  r.awb || r.way_id || r.shipment_awb || "—",
                  r.batch_no || r.reference_no || "—",
                  mmk(r.gross_amount || r.cod_amount),
                  mmk(r.fee_amount || r.service_fee),
                  mmk(r.net_amount || r.net_payable),
                  <Badge key="st" value={String(r.transfer_status || r.status || "pending")} />,
                  date(r.created_at || r.settlement_date),
                ]}
              />
            </Card>
          )}

          {tab === "support" && (
            <div style={S.twoColWide}>
              <Card title="Inquiry, complaint & work matters">
                {createTicket.isError && <Banner kind="error" text={createTicket.error?.message || "Unable to submit the case."} />}
                {createTicket.isSuccess && <Banner kind="success" text="Your message has been submitted. The responsible team can respond through the case and notification flow." />}
                <form style={S.formGrid} onSubmit={async (e) => { e.preventDefault(); await submitTicket("customer_service"); }}>
                  <Field label="Subject *" wide><input required style={S.input} value={ticketForm.subject} onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })} /></Field>
                  <Field label="Matter type">
                    <select style={S.input} value={ticketForm.issue_type} onChange={(e) => setTicketForm({ ...ticketForm, issue_type: e.target.value })}>
                      <option value="inquiry">General inquiry</option>
                      <option value="complaint">Complaint</option>
                      <option value="failed_delivery">Delivery issue</option>
                      <option value="cod_dispute">COD / settlement dispute</option>
                      <option value="damaged_parcel">Damaged parcel</option>
                      <option value="lost_parcel">Lost parcel</option>
                      <option value="reattempt_request">Delivery reattempt request</option>
                      <option value="work_related">Work-related matter</option>
                    </select>
                  </Field>
                  <Field label="Priority">
                    <select style={S.input} value={ticketForm.priority} onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value })}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </Field>
                  <Field label="Related Way / AWB" wide><input style={S.input} value={ticketForm.shipment_awb} onChange={(e) => setTicketForm({ ...ticketForm, shipment_awb: e.target.value })} /></Field>
                  <Field label="Message *" wide><textarea required style={{ ...S.input, minHeight: 120 }} value={ticketForm.notes} onChange={(e) => setTicketForm({ ...ticketForm, notes: e.target.value })} /></Field>
                  <div style={{ gridColumn: "1/-1" }}><button disabled={createTicket.isPending} style={S.primaryBtn}>{createTicket.isPending ? "Submitting..." : "Send to Customer Service"}</button></div>
                </form>
              </Card>

              <Card title="My cases">
                <SimpleTable
                  cols={["Case", "Subject", "Type", "Priority", "Status"]}
                  rows={ticketRows}
                  render={(r) => [String(r.ticket_no || r.id || "—").slice(0, 12), r.subject || "—", r.issue_type || "—", r.priority || "—", <Badge key="c" value={String(r.status || "open")} />]}
                />
              </Card>
            </div>
          )}

          {tab === "terms" && (
            <div style={S.twoColWide}>
              <Card title="Commercial relationship & Terms / Conditions">
                <div style={S.infoBox}>
                  <strong>Direct Marketing Desk</strong>
                  <span>Use this channel for Terms & Conditions, rate review, merchant tier, campaign participation, partnership and commercial arrangements.</span>
                </div>
                <textarea
                  style={{ ...S.input, width: "100%", minHeight: 150, marginTop: 16 }}
                  placeholder="Write your request to the Marketing team..."
                  value={termsMessage}
                  onChange={(e) => setTermsMessage(e.target.value)}
                />
                <button
                  style={{ ...S.primaryBtn, marginTop: 12 }}
                  disabled={createTicket.isPending || !termsMessage.trim()}
                  onClick={async () => {
                    setTicketForm({ ...EMPTY_TICKET, subject: "Merchant commercial / T&C request", issue_type: "marketing_terms", department: "marketing", notes: termsMessage, priority: "medium" });
                    await createTicket.mutateAsync({
                      subject: "Merchant commercial / T&C request",
                      issue_type: "marketing_terms",
                      department: "marketing",
                      notes: termsMessage,
                      priority: "medium",
                      shipment_awb: "",
                    });
                    setTermsMessage("");
                  }}
                >
                  {createTicket.isPending ? "Sending..." : "Send to Marketing"}
                </button>
              </Card>

              <Card title="Commercial service shortcuts">
                <div style={S.shortcutGrid}>
                  {[
                    ["T&C clarification", "marketing_terms"],
                    ["Rate review", "rate_review"],
                    ["Merchant tier / contract", "merchant_contract"],
                    ["Promotion participation", "promotion"],
                    ["Partnership proposal", "partnership"],
                    ["Account / onboarding support", "merchant_onboarding"],
                  ].map(([label, type]) => (
                    <button key={type} style={S.shortcut} onClick={() => {
                      setTicketForm({ ...EMPTY_TICKET, issue_type: type, department: "marketing", subject: label });
                      setTab("support");
                    }}>
                      <strong>{label}</strong>
                      <span>Open request →</span>
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {tab === "notifications" && (
            <Card
              title="Merchant notifications"
              action={<button style={S.linkBtn} disabled={!unreadCount} onClick={() => markAllRead.mutate()}>Mark all read</button>}
            >
              <div style={S.notificationList}>
                {notificationRows.length === 0 ? <Empty text="No notifications." /> : notificationRows.map((n, i) => {
                  const read = Boolean(n.read_at || n.is_read);
                  return (
                    <button key={String(n.id || i)} style={{ ...S.notification, opacity: read ? 0.65 : 1 }} onClick={() => !read && n.id && markRead.mutate(String(n.id))}>
                      <div style={S.notificationDot}>{read ? "" : "•"}</div>
                      <div style={{ flex: 1 }}>
                        <div style={S.notificationTitle}>{String(n.title || n.subject || "Britium Express update")}</div>
                        <div style={S.notificationBody}>{String(n.message || n.body || n.notes || "")}</div>
                        <div style={S.notificationDate}>{date(n.created_at)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {tab === "profile" && (
            <div style={S.profileGrid}>
              <Card title="Company profile">
                <div style={S.profileHeader}>
                  <div style={S.profileLogo}>
                    {profileDraft.logo_data_url ? <img src={profileDraft.logo_data_url} alt="Company logo" style={S.logoImgLarge} /> : initials(profileDraft.company_name || "Merchant")}
                  </div>
                  <div>
                    <button style={S.secondaryBtn} onClick={() => logoRef.current?.click()}>Upload logo / photo</button>
                    <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => onLogo(e.target.files?.[0])} />
                    <div style={S.helper}>Merchant can choose the company logo or preferred profile image.</div>
                  </div>
                </div>
                <div style={S.formGrid}>
                  <Field label="Company name" wide><input style={S.input} value={profileDraft.company_name} onChange={(e) => setProfileDraft({ ...profileDraft, company_name: e.target.value })} /></Field>
                  <Field label="Contact person"><input style={S.input} value={profileDraft.contact_name} onChange={(e) => setProfileDraft({ ...profileDraft, contact_name: e.target.value })} /></Field>
                  <Field label="Contact phone"><input style={S.input} value={profileDraft.contact_phone} onChange={(e) => setProfileDraft({ ...profileDraft, contact_phone: e.target.value })} /></Field>
                  <Field label="Email" wide><input style={S.input} value={profileDraft.contact_email} onChange={(e) => setProfileDraft({ ...profileDraft, contact_email: e.target.value })} /></Field>
                  <Field label="Company address" wide><textarea style={{ ...S.input, minHeight: 90 }} value={profileDraft.address} onChange={(e) => setProfileDraft({ ...profileDraft, address: e.target.value })} /></Field>
                </div>
                <button style={{ ...S.primaryBtn, marginTop: 16 }} onClick={saveProfile}>Save profile</button>
              </Card>

              <Card title="Account information">
                <KeyValue label="Login email" value={profile?.email || user?.email || "—"} />
                <KeyValue label="Account role" value={profile?.role || "merchant"} />
                <KeyValue label="Branch code" value={profile?.branch_code || "—"} />
                <KeyValue label="Account status" value={profile?.status || "active"} />
                <div style={S.securityNote}>The portal displays only the merchant's permitted operational information. Access continues to be controlled by the authenticated Britium Express account and backend role permissions.</div>
              </Card>
            </div>
          )}
        </main>
      </section>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section style={S.card}><div style={S.cardHead}><h3 style={S.cardTitle}>{title}</h3>{action}</div>{children}</section>;
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return <div style={S.stat}><div style={S.statValue}>{value}</div><div style={S.statLabel}>{label}</div><div style={S.statNote}>{note}</div></div>;
}

function Attention({ title, value, text, onClick }: { title: string; value: number; text: string; onClick: () => void }) {
  return <button style={S.attention} onClick={onClick}><div><strong>{title}</strong><div style={S.attentionText}>{text}</div></div><span style={S.attentionValue}>{value}</span></button>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label style={{ ...S.field, ...(wide ? { gridColumn: "1/-1" } : {}) }}><span>{label}</span>{children}</label>;
}

function SimpleTable({ cols, rows, render }: { cols: string[]; rows: Record<string, unknown>[]; render: (r: Record<string, unknown>) => React.ReactNode[] }) {
  return <div style={S.tableWrap}><table style={S.table}><thead><tr>{cols.map((c) => <th key={c} style={S.th}>{c}</th>)}</tr></thead><tbody>{!rows?.length ? <tr><td colSpan={cols.length} style={S.emptyCell}>No records.</td></tr> : rows.map((r, i) => <tr key={String(r.id || r.awb || i)}>{render(r).map((v, j) => <td key={j} style={S.td}>{v}</td>)}</tr>)}</tbody></table></div>;
}

function TrackingCard({ data }: { data: Record<string, unknown> }) {
  return <div style={S.trackingCard}>
    <div style={S.trackingTop}><div><div style={S.eyebrow}>TRACKING RESULT</div><div style={S.trackingId}>{String(data.awb || data.way_id || data.tracking_no || "—")}</div></div><Badge value={String(data.status || "in_transit")} /></div>
    <div style={S.trackingGrid}>
      {[
        ["Receiver", data.receiver_name],
        ["Phone", data.receiver_phone],
        ["Township / City", data.receiver_township || data.receiver_city],
        ["Current location", data.current_location],
        ["COD", mmk(data.cod_amount)],
        ["Last updated", date(data.updated_at || data.created_at)],
      ].map(([k, v]) => <KeyValue key={String(k)} label={String(k)} value={String(v || "—")} />)}
    </div>
  </div>;
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return <div style={S.kv}><div style={S.kvLabel}>{label}</div><div style={S.kvValue}>{value}</div></div>;
}

function Badge({ value }: { value: string }) {
  const v = value.toLowerCase();
  const palette = v.includes("deliver") || v.includes("resolve") || v.includes("transfer")
    ? ["#dcfce7", "#166534"]
    : v.includes("fail") || v.includes("cancel") || v.includes("urgent")
      ? ["#fee2e2", "#991b1b"]
      : v.includes("progress") || v.includes("transit") || v.includes("pending") || v.includes("open")
        ? ["#fef3c7", "#92400e"]
        : ["#e0e7ff", "#3730a3"];
  return <span style={{ background: palette[0], color: palette[1], borderRadius: 999, padding: "4px 9px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>{value.replaceAll("_", " ")}</span>;
}

function Banner({ kind, text }: { kind: "success" | "error"; text: string }) {
  return <div style={{ ...S.banner, background: kind === "success" ? "#ecfdf5" : "#fef2f2", color: kind === "success" ? "#166534" : "#991b1b", borderColor: kind === "success" ? "#a7f3d0" : "#fecaca" }}>{text}</div>;
}

function Empty({ text }: { text: string }) { return <div style={S.emptyCell}>{text}</div>; }

function mmk(v: unknown) { return `${Number(v || 0).toLocaleString()} MMK`; }
function date(v: unknown) { if (!v) return "—"; const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }); }
function initials(v: string) { return v.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("") || "M"; }

const S: Record<string, React.CSSProperties> = {
  app: { minHeight: "100vh", display: "flex", background: "#f4f7fb", color: "#132238", fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" },
  sidebar: { width: 258, background: "#0c2f4f", color: "#fff", padding: "22px 16px 18px", display: "flex", flexDirection: "column", gap: 18, position: "sticky", top: 0, height: "100vh", boxSizing: "border-box", overflowY: "auto" },
  brandBlock: { display: "flex", alignItems: "center", gap: 11, padding: "0 6px" },
  brandMark: { width: 38, height: 38, borderRadius: 12, background: "#1ab1a7", display: "grid", placeItems: "center", fontWeight: 900, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.2)" },
  brand: { fontWeight: 900, fontSize: 17, letterSpacing: ".1px" },
  brandSub: { fontSize: 11, opacity: .72, marginTop: 2 },
  companyMini: { display: "flex", gap: 10, alignItems: "center", padding: 12, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14 },
  logoWrap: { width: 42, height: 42, borderRadius: 12, flex: "0 0 42px", overflow: "hidden", background: "#fff", color: "#0c2f4f", display: "grid", placeItems: "center" },
  logoImg: { width: "100%", height: "100%", objectFit: "cover" },
  companyName: { fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  companyEmail: { fontSize: 10.5, opacity: .7, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  nav: { display: "flex", flexDirection: "column", gap: 5 },
  navItem: { border: 0, background: "transparent", color: "#d8e5f0", display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 11px", borderRadius: 10, cursor: "pointer", textAlign: "left", fontSize: 12.5, fontWeight: 600 },
  navActive: { border: 0, background: "#fff", color: "#0c2f4f", display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 11px", borderRadius: 10, cursor: "pointer", textAlign: "left", fontSize: 12.5, fontWeight: 800, boxShadow: "0 8px 20px rgba(0,0,0,.12)" },
  navIcon: { width: 22, height: 22, borderRadius: 7, display: "grid", placeItems: "center", background: "rgba(26,177,167,.14)", fontSize: 12 },
  count: { marginLeft: "auto", background: "#ef4444", color: "#fff", borderRadius: 999, minWidth: 20, height: 20, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 900 },
  sideFoot: { marginTop: "auto" },
  signOut: { width: "100%", border: "1px solid rgba(255,255,255,.18)", background: "transparent", color: "#fff", padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 700 },
  shell: { flex: 1, minWidth: 0 },
  topbar: { minHeight: 82, padding: "16px 28px", background: "#fff", borderBottom: "1px solid #e5edf5", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, boxSizing: "border-box" },
  eyebrow: { fontSize: 10, fontWeight: 900, letterSpacing: "1.5px", color: "#7190a9" },
  pageTitle: { margin: "3px 0 0", fontSize: 23, lineHeight: 1.1, color: "#102a43" },
  topActions: { display: "flex", gap: 9, alignItems: "center" },
  quickBtn: { border: 0, background: "#1ab1a7", color: "#fff", padding: "10px 14px", borderRadius: 10, cursor: "pointer", fontWeight: 800, fontSize: 12 },
  bellBtn: { border: "1px solid #d8e4ee", background: "#fff", color: "#34516b", padding: "9px 12px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 12 },
  bellCount: { background: "#e11d48", color: "#fff", borderRadius: 999, padding: "1px 6px", marginLeft: 5, fontSize: 10 },
  main: { padding: 28, maxWidth: 1500, margin: "0 auto" },
  hero: { background: "linear-gradient(115deg,#0c2f4f 0%,#135a6d 58%,#1ab1a7 120%)", borderRadius: 20, padding: "30px 32px", color: "#fff", display: "flex", justifyContent: "space-between", gap: 24, alignItems: "center", boxShadow: "0 18px 40px rgba(12,47,79,.18)" },
  heroKicker: { fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "1.6px", opacity: .72 },
  heroTitle: { margin: "6px 0 8px", fontSize: 29, lineHeight: 1.1 },
  heroText: { margin: 0, maxWidth: 700, fontSize: 13, lineHeight: 1.7, opacity: .84 },
  heroButtons: { display: "flex", gap: 9, flexWrap: "wrap" },
  primaryBtn: { border: 0, background: "#1ab1a7", color: "#fff", padding: "10px 16px", borderRadius: 10, cursor: "pointer", fontWeight: 800, fontSize: 12 },
  secondaryBtn: { border: "1px solid #cbd9e6", background: "#fff", color: "#173b56", padding: "10px 16px", borderRadius: 10, cursor: "pointer", fontWeight: 800, fontSize: 12 },
  stats: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 14, marginTop: 18 },
  stat: { background: "#fff", border: "1px solid #e4edf5", borderRadius: 15, padding: "17px 18px", boxShadow: "0 4px 12px rgba(16,42,67,.04)" },
  statValue: { fontSize: 25, fontWeight: 900, color: "#0c2f4f" },
  statLabel: { fontSize: 12, fontWeight: 800, marginTop: 3 },
  statNote: { fontSize: 10.5, color: "#7b93a8", marginTop: 4 },
  twoCol: { display: "grid", gridTemplateColumns: "minmax(0,1.65fr) minmax(310px,.75fr)", gap: 16, marginTop: 16 },
  twoColWide: { display: "grid", gridTemplateColumns: "minmax(360px,.85fr) minmax(520px,1.15fr)", gap: 16 },
  profileGrid: { display: "grid", gridTemplateColumns: "minmax(520px,1.2fr) minmax(320px,.8fr)", gap: 16 },
  card: { background: "#fff", border: "1px solid #e4edf5", borderRadius: 16, padding: 20, boxShadow: "0 4px 14px rgba(16,42,67,.045)", minWidth: 0 },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 },
  cardTitle: { margin: 0, fontSize: 15, color: "#173b56" },
  linkBtn: { border: 0, background: "transparent", color: "#0d9488", fontSize: 11.5, fontWeight: 800, cursor: "pointer" },
  tableWrap: { overflowX: "auto", width: "100%" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 11.5 },
  th: { textAlign: "left", color: "#607d95", background: "#f7fafc", borderBottom: "1px solid #dfe9f2", padding: "9px 10px", fontWeight: 800, whiteSpace: "nowrap" },
  td: { borderBottom: "1px solid #edf2f7", padding: "10px", color: "#29485f", whiteSpace: "nowrap", verticalAlign: "middle" },
  emptyCell: { padding: 24, textAlign: "center", color: "#90a4b5", fontSize: 12 },
  attentionList: { display: "flex", flexDirection: "column", gap: 9 },
  attention: { border: "1px solid #e3edf5", background: "#f9fbfd", borderRadius: 12, padding: 13, display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", cursor: "pointer", color: "#173b56" },
  attentionText: { color: "#8195a7", fontSize: 10.5, marginTop: 3 },
  attentionValue: { width: 34, height: 34, borderRadius: 10, background: "#e6f7f5", color: "#0f766e", display: "grid", placeItems: "center", fontWeight: 900 },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 },
  field: { display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5, fontWeight: 800, color: "#49677e" },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid #cfdce7", borderRadius: 9, padding: "9px 11px", fontSize: 12.5, color: "#19354b", background: "#fff", outline: "none", fontFamily: "inherit" },
  searchRow: { display: "flex", gap: 10, marginBottom: 18, maxWidth: 760 },
  helper: { color: "#7a91a5", fontSize: 11.5, lineHeight: 1.55 },
  muted: { color: "#8396a7", fontSize: 12, padding: "12px 0" },
  banner: { border: "1px solid", borderRadius: 10, padding: "10px 12px", fontSize: 11.5, marginBottom: 13, lineHeight: 1.5 },
  trackingCard: { border: "1px solid #dce7f0", borderRadius: 14, background: "#fbfdff", padding: 18, maxWidth: 900 },
  trackingTop: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e6eef5", paddingBottom: 14, marginBottom: 14 },
  trackingId: { fontWeight: 900, fontSize: 20, color: "#0c2f4f", marginTop: 3 },
  trackingGrid: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 11 },
  kv: { background: "#f7fafc", border: "1px solid #e5edf4", borderRadius: 10, padding: 11 },
  kvLabel: { color: "#7a91a5", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px" },
  kvValue: { color: "#1f4058", fontSize: 12.5, fontWeight: 700, marginTop: 4, wordBreak: "break-word" },
  infoBox: { display: "flex", flexDirection: "column", gap: 7, padding: 16, borderRadius: 12, background: "#eef9f8", border: "1px solid #cceeea", color: "#175e59", fontSize: 12, lineHeight: 1.5 },
  shortcutGrid: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 },
  shortcut: { border: "1px solid #dfebf3", borderRadius: 12, padding: 14, background: "#fbfdff", textAlign: "left", cursor: "pointer", color: "#21445d", display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5 },
  notificationList: { display: "flex", flexDirection: "column", gap: 9 },
  notification: { border: "1px solid #e3ebf2", background: "#fff", borderRadius: 12, padding: 13, width: "100%", textAlign: "left", display: "flex", gap: 9, cursor: "pointer" },
  notificationDot: { color: "#1ab1a7", fontWeight: 900, fontSize: 18, lineHeight: 1 },
  notificationTitle: { fontWeight: 900, color: "#1e3d55", fontSize: 12.5 },
  notificationBody: { color: "#637e93", fontSize: 11.5, lineHeight: 1.5, marginTop: 3 },
  notificationDate: { color: "#9aabba", fontSize: 10, marginTop: 5 },
  profileHeader: { display: "flex", alignItems: "center", gap: 16, marginBottom: 20 },
  profileLogo: { width: 84, height: 84, borderRadius: 18, overflow: "hidden", display: "grid", placeItems: "center", background: "#e8f4f3", color: "#0f766e", fontSize: 26, fontWeight: 900 },
  logoImgLarge: { width: "100%", height: "100%", objectFit: "cover" },
  securityNote: { marginTop: 14, padding: 13, borderRadius: 10, background: "#f8fafc", color: "#71879a", fontSize: 11, lineHeight: 1.6 },
};
