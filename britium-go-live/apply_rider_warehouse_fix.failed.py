from pathlib import Path
import re
import shutil

ROOT = Path.cwd()
RIDER = ROOT / "src/pages/RiderFieldPortalApp.tsx"
WAREHOUSE = ROOT / "src/pages/warehouse/WarehouseScannerGoLivePage.tsx"
MIGRATION = ROOT / "supabase/migrations/20260722150000_rider_warehouse_handoff.sql"

for required in (RIDER, WAREHOUSE):
    if not required.exists():
        raise SystemExit(f"Missing required file: {required}")

def replace_exact(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return source.replace(old, new, 1)

def replace_regex(source: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(
        pattern,
        lambda _: replacement,
        source,
        count=1,
        flags=re.DOTALL,
    )
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return updated

RIDER.parent.mkdir(parents=True, exist_ok=True)
WAREHOUSE.parent.mkdir(parents=True, exist_ok=True)
MIGRATION.parent.mkdir(parents=True, exist_ok=True)

shutil.copy2(RIDER, RIDER.with_suffix(".tsx.bak-rider-warehouse"))
shutil.copy2(WAREHOUSE, WAREHOUSE.with_suffix(".tsx.bak-rider-warehouse"))

rider = RIDER.read_text(encoding="utf-8")

if "const PICKUP_EXCEPTION_RULES" not in rider:
    rules_block = r'''
type RiderExceptionRule = {
  processType: "PICKUP" | "DELIVERY";
  code: string;
  nameEn: string;
  nameMm: string;
  mappedStatus: string;
  nextAction: string;
  requirePhoto: boolean;
  requireRemark: boolean;
};

const PICKUP_EXCEPTION_RULES: RiderExceptionRule[] = [
  {
    processType: "PICKUP",
    code: "CUSTOMER_NOT_AVAILABLE",
    nameEn: "Sender / customer not available",
    nameMm: "ပေးပို့သူ / Customer မရှိပါ",
    mappedStatus: "PICKUP_FAILED",
    nextAction: "RESCHEDULE_PICKUP",
    requirePhoto: false,
    requireRemark: true,
  },
  {
    processType: "PICKUP",
    code: "MERCHANT_CLOSED",
    nameEn: "Merchant location closed",
    nameMm: "ဆိုင် / ရုံး ပိတ်ထားသည်",
    mappedStatus: "PICKUP_FAILED",
    nextAction: "RESCHEDULE_PICKUP",
    requirePhoto: true,
    requireRemark: true,
  },
  {
    processType: "PICKUP",
    code: "PARCEL_NOT_READY",
    nameEn: "Parcel not ready",
    nameMm: "ပစ္စည်း မပြင်ဆင်ရသေးပါ",
    mappedStatus: "PICKUP_FAILED",
    nextAction: "RESCHEDULE_PICKUP",
    requirePhoto: false,
    requireRemark: true,
  },
  {
    processType: "PICKUP",
    code: "WRONG_PICKUP_ADDRESS",
    nameEn: "Wrong pickup address",
    nameMm: "Pickup လိပ်စာ မှားယွင်းသည်",
    mappedStatus: "ADDRESS_CORRECTION_REQUIRED",
    nextAction: "CS_ADDRESS_REVIEW",
    requirePhoto: true,
    requireRemark: true,
  },
  {
    processType: "PICKUP",
    code: "PAYMENT_ISSUE",
    nameEn: "Payment or account issue",
    nameMm: "ငွေပေးချေမှု / Account ပြဿနာ",
    mappedStatus: "PICKUP_ON_HOLD",
    nextAction: "FINANCE_REVIEW",
    requirePhoto: false,
    requireRemark: true,
  },
  {
    processType: "PICKUP",
    code: "OVERSIZED_PARCEL",
    nameEn: "Oversized or overweight parcel",
    nameMm: "အရွယ်အစား / အလေးချိန် ကျော်လွန်သည်",
    mappedStatus: "SPECIAL_HANDLING_REQUIRED",
    nextAction: "REASSIGN_VEHICLE",
    requirePhoto: true,
    requireRemark: true,
  },
  {
    processType: "PICKUP",
    code: "RESTRICTED_ITEM",
    nameEn: "Restricted or prohibited item",
    nameMm: "တားမြစ် / ကန့်သတ်ပစ္စည်း",
    mappedStatus: "PICKUP_REJECTED",
    nextAction: "COMPLIANCE_REVIEW",
    requirePhoto: true,
    requireRemark: true,
  },
  {
    processType: "PICKUP",
    code: "DUPLICATE_REQUEST",
    nameEn: "Duplicate pickup request",
    nameMm: "ထပ်နေသော Pickup Request",
    mappedStatus: "PICKUP_CANCELLED",
    nextAction: "CANCEL_DUPLICATE",
    requirePhoto: false,
    requireRemark: true,
  },
  {
    processType: "PICKUP",
    code: "OTHER_EXCEPTION",
    nameEn: "Other pickup exception",
    nameMm: "အခြား Pickup ပြဿနာ",
    mappedStatus: "EXCEPTION",
    nextAction: "MANUAL_REVIEW",
    requirePhoto: false,
    requireRemark: true,
  },
];

const DELIVERY_EXCEPTION_RULES: RiderExceptionRule[] = [
  {
    processType: "DELIVERY",
    code: "CUSTOMER_NOT_AVAILABLE",
    nameEn: "Receiver not available",
    nameMm: "လက်ခံသူ မရှိ / မရရှိနိုင်ပါ",
    mappedStatus: "DELIVERY_ATTEMPTED",
    nextAction: "RESCHEDULE_DELIVERY",
    requirePhoto: false,
    requireRemark: true,
  },
  {
    processType: "DELIVERY",
    code: "CUSTOMER_REFUSED",
    nameEn: "Receiver refused parcel",
    nameMm: "လက်ခံသူမှ ပစ္စည်းကို လက်မခံပါ",
    mappedStatus: "CUSTOMER_REFUSED",
    nextAction: "CS_REVIEW_OR_RTO",
    requirePhoto: true,
    requireRemark: true,
  },
  {
    processType: "DELIVERY",
    code: "WRONG_ADDRESS",
    nameEn: "Wrong or incomplete address",
    nameMm: "လိပ်စာ မှားယွင်း / မပြည့်စုံပါ",
    mappedStatus: "ADDRESS_ISSUE",
    nextAction: "CS_ADDRESS_REVIEW",
    requirePhoto: true,
    requireRemark: true,
  },
  {
    processType: "DELIVERY",
    code: "PHONE_UNREACHABLE",
    nameEn: "Receiver phone unreachable",
    nameMm: "လက်ခံသူ ဖုန်းဆက်မရပါ",
    mappedStatus: "DELIVERY_ATTEMPTED",
    nextAction: "RETRY_OR_CS_FOLLOWUP",
    requirePhoto: false,
    requireRemark: true,
  },
  {
    processType: "DELIVERY",
    code: "COD_NOT_READY",
    nameEn: "COD payment not ready",
    nameMm: "COD ငွေ မပြင်ဆင်ရသေးပါ",
    mappedStatus: "DELIVERY_RESCHEDULED",
    nextAction: "RESCHEDULE_DELIVERY",
    requirePhoto: false,
    requireRemark: true,
  },
  {
    processType: "DELIVERY",
    code: "CUSTOMER_REQUESTED_RESCHEDULE",
    nameEn: "Customer requested reschedule",
    nameMm: "Customer မှ ပြန်ချိန်းဆိုရန် တောင်းဆိုသည်",
    mappedStatus: "DELIVERY_RESCHEDULED",
    nextAction: "SET_NEXT_ATTEMPT_DATE",
    requirePhoto: false,
    requireRemark: true,
  },
  {
    processType: "DELIVERY",
    code: "NO_ACCESS_TO_BUILDING",
    nameEn: "No access to building or compound",
    nameMm: "အဆောက်အဦး / ဝင်းအတွင်း ဝင်ခွင့်မရပါ",
    mappedStatus: "DELIVERY_ATTEMPTED",
    nextAction: "CUSTOMER_ACCESS_REQUIRED",
    requirePhoto: true,
    requireRemark: true,
  },
  {
    processType: "DELIVERY",
    code: "PARCEL_DAMAGED",
    nameEn: "Parcel damaged",
    nameMm: "ပစ္စည်း ပျက်စီးနေသည်",
    mappedStatus: "DAMAGED",
    nextAction: "DAMAGE_REVIEW",
    requirePhoto: true,
    requireRemark: true,
  },
  {
    processType: "DELIVERY",
    code: "WEATHER_TRAFFIC_ISSUE",
    nameEn: "Weather, flood, road or traffic issue",
    nameMm: "ရာသီဥတု / ရေကြီး / လမ်းကြောင်း ပြဿနာ",
    mappedStatus: "DELIVERY_DELAYED",
    nextAction: "AUTO_RESCHEDULE",
    requirePhoto: false,
    requireRemark: true,
  },
  {
    processType: "DELIVERY",
    code: "RIDER_ISSUE",
    nameEn: "Rider, vehicle or operational issue",
    nameMm: "Rider / ယာဉ် / လုပ်ငန်းဆိုင်ရာ ပြဿနာ",
    mappedStatus: "REASSIGNMENT_REQUIRED",
    nextAction: "REASSIGN_RIDER",
    requirePhoto: false,
    requireRemark: true,
  },
  {
    processType: "DELIVERY",
    code: "OTHER_EXCEPTION",
    nameEn: "Other delivery exception",
    nameMm: "အခြား Delivery ပြဿနာ",
    mappedStatus: "EXCEPTION",
    nextAction: "MANUAL_REVIEW",
    requirePhoto: false,
    requireRemark: true,
  },
];

function exceptionRulesForJob(job: RiderJob) {
  return isDeliveryJob(job) || isOutForDelivery(job)
    ? DELIVERY_EXCEPTION_RULES
    : PICKUP_EXCEPTION_RULES;
}

function riderExceptionRule(job: RiderJob, code: string) {
  const rules = exceptionRulesForJob(job);
  return rules.find((rule) => rule.code === code) || rules[rules.length - 1];
}
'''

    rider = replace_exact(
        rider,
        "type NotificationRow = Record<string, any>;\n",
        "type NotificationRow = Record<string, any>;\n" + rules_block + "\n",
        "insert exception rules",
    )

status_helpers = r'''function jobStatusSet(job: RiderJob) {
  return new Set(
    [
      job.pickup_status,
      job.rider_status,
      job.rider_app_stage,
      job.workflow_stage,
      job.status,
      job.assignment_status,
      job.warehouse_status,
      job.delivery_status,
      job.dispatch_status,
      job.operation_status,
    ]
      .map(upper)
      .filter(Boolean)
  );
}

function hasJobStatus(job: RiderJob, ...statuses: string[]) {
  const values = jobStatusSet(job);
  return statuses.some((status) => values.has(upper(status)));
}

function isDeliveredToWarehouse(job: RiderJob) {
  return hasJobStatus(
    job,
    "DELIVERED_TO_WAREHOUSE",
    "WAITING_WAREHOUSE_ACCEPTANCE"
  );
}

function isWarehouseAccepted(job: RiderJob) {
  return hasJobStatus(
    job,
    "WAREHOUSE_ACCEPTED",
    "RECEIVED_AT_ORIGIN",
    "WAREHOUSE_ACCEPTED_WITH_CONDITION"
  );
}

function isDelivered(job: RiderJob) {
  return (
    !isDeliveredToWarehouse(job) &&
    hasJobStatus(job, "DELIVERED", "DELIVERY_COMPLETED", "POD_VERIFIED")
  );
}

function isException(job: RiderJob) {
  const values = Array.from(jobStatusSet(job));
  return values.some(
    (status) =>
      status.includes("EXCEPTION") ||
      status.includes("FAILED") ||
      status.includes("REJECTED") ||
      status === "WAREHOUSE_HOLD" ||
      status === "PICKUP_ON_HOLD" ||
      status === "ADDRESS_CORRECTION_REQUIRED" ||
      status === "SPECIAL_HANDLING_REQUIRED" ||
      status === "ADDRESS_ISSUE" ||
      status === "DAMAGED" ||
      status === "CUSTOMER_REFUSED" ||
      status === "REASSIGNMENT_REQUIRED"
  );
}

function isCollected(job: RiderJob) {
  return hasJobStatus(job, "PICKUP_COLLECTED");
}

function isOutForDelivery(job: RiderJob) {
  return hasJobStatus(job, "OUT_FOR_DELIVERY");
}

type PickupActionStage =
  | "assigned"
  | "accepted"
  | "arrived"
  | "verified"
  | "collected"
  | "handover"
  | "warehouse_accepted"
  | "exception";

function pickupActionStage(job: RiderJob): PickupActionStage {
  if (isException(job)) return "exception";
  if (isWarehouseAccepted(job)) return "warehouse_accepted";
  if (isDeliveredToWarehouse(job)) return "handover";
  if (hasJobStatus(job, "PICKUP_COLLECTED")) return "collected";
  if (hasJobStatus(job, "PICKUP_VERIFIED")) return "verified";
  if (hasJobStatus(job, "RIDER_ARRIVED", "ARRIVED_PICKUP", "ARRIVED_AT_PICKUP")) return "arrived";
  if (hasJobStatus(job, "ACCEPTED_BY_RIDER", "ACCEPTED_PICKUP", "ACCEPTED")) return "accepted";
  return "assigned";
}

function isPickupJob(job: RiderJob) {
  return (
    !isWarehouseAccepted(job) &&
    !isDeliveredToWarehouse(job) &&
    !isDelivered(job) &&
    !isException(job) &&
    !isOutForDelivery(job)
  );
}


'''

rider = replace_regex(
    rider,
    r"function isDelivered\(job: RiderJob\) \{.*?(?=type ParcelVerificationRow)",
    status_helpers,
    "replace status helpers",
)

rider = replace_regex(
    rider,
    r"function isDeliveryJob\(job: RiderJob\) \{.*?\n\}",
    r'''function isDeliveryJob(job: RiderJob) {
  return (
    hasJobStatus(
      job,
      "READY_FOR_DELIVERY",
      "ASSIGNED_FOR_DELIVERY",
      "DELIVERY_ASSIGNED",
      "OUT_FOR_DELIVERY"
    ) &&
    !isDelivered(job) &&
    !isException(job)
  );
}''',
    "replace delivery filter",
)

job_card = r'''type JobScreen = "jobs" | "pickup" | "delivery" | "cod";

function JobCard({
  job,
  onAction,
  onModal,
  busy,
  screen,
}: {
  job: RiderJob;
  onAction: (job: RiderJob, action: string, remark?: string) => void;
  onModal: (job: RiderJob, mode: ModalMode) => void;
  busy: boolean;
  screen: JobScreen;
}) {
  const id = pickupId(job);
  const status = statusLabel(job);
  const cod = Number(job.rider_cod_amount || job.cod_amount || job.item_price || 0);
  const delivered = isDelivered(job);
  const exception = isException(job);
  const stage = pickupActionStage(job);

  const deliveryMode =
    screen === "delivery" ||
    (screen === "jobs" &&
      hasJobStatus(
        job,
        "READY_FOR_DELIVERY",
        "ASSIGNED_FOR_DELIVERY",
        "DELIVERY_ASSIGNED",
        "OUT_FOR_DELIVERY"
      ));

  const pickupMode =
    screen === "pickup" ||
    (screen === "jobs" && !deliveryMode);

  const canReportPickupException =
    pickupMode &&
    !exception &&
    !delivered &&
    !isDeliveredToWarehouse(job) &&
    !isWarehouseAccepted(job);

  return (
    <Card style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{id}</div>
          <div style={{ color: C.sub, marginTop: 4 }}>
            {text(job.merchant_name || job.customer_name || job.sender_name, "Merchant / customer")}
          </div>
        </div>
        <Badge color={exception ? C.red : delivered || isWarehouseAccepted(job) ? C.green : C.gold}>
          {status}
        </Badge>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}
        className="be-three-grid"
      >
        <div><small>Township</small><strong>{text(job.township || job.pickup_township, "-")}</strong></div>
        <div><small>Parcels</small><strong>{text(job.expected_parcels || job.delivery_line_count || 1)}</strong></div>
        <div><small>COD</small><strong>{money(cod)}</strong></div>
      </div>

      <div style={{ color: C.sub, display: "flex", gap: 8, alignItems: "flex-start" }}>
        <MapPin size={17} style={{ marginTop: 2, flex: "0 0 auto" }} />
        <span>{text(job.pickup_address || job.delivery_address || job.address, "No address in backend record")}</span>
      </div>

      {pickupMode && isDeliveredToWarehouse(job) && (
        <div
          style={{
            border: `1px solid ${C.gold}`,
            background: "rgba(246,184,75,0.10)",
            color: C.gold,
            borderRadius: 14,
            padding: 12,
          }}
        >
          Delivered to Warehouse. Waiting for warehouse staff acceptance.
        </div>
      )}

      {pickupMode && isWarehouseAccepted(job) && (
        <div
          style={{
            border: `1px solid ${C.green}`,
            background: "rgba(52,211,153,0.10)",
            color: C.green,
            borderRadius: 14,
            padding: 12,
          }}
        >
          Accepted by Warehouse.
          {job.warehouse_remark || job.exception_reason
            ? ` Remark: ${job.warehouse_remark || job.exception_reason}`
            : ""}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {pickupMode && stage === "assigned" && (
          <button
            type="button"
            disabled={busy}
            style={buttonStyle("plain")}
            onClick={() => onAction(job, "ACCEPTED", "Rider accepted assignment")}
          >
            <CheckCircle2 size={16} /> Accept
          </button>
        )}

        {pickupMode && stage === "accepted" && (
          <button
            type="button"
            disabled={busy}
            style={buttonStyle("blue")}
            onClick={() => onAction(job, "ARRIVED_AT_PICKUP", "Rider arrived at pickup location")}
          >
            Arrived at Pickup
          </button>
        )}

        {pickupMode && stage === "arrived" && (
          <button
            type="button"
            disabled={busy}
            style={buttonStyle("gold")}
            onClick={() => onModal(job, "pickup")}
          >
            Verify Pickup
          </button>
        )}

        {pickupMode && stage === "verified" && (
          <button
            type="button"
            disabled={busy}
            style={buttonStyle("green")}
            onClick={() => onAction(job, "PICKUP_COLLECTED", "Pickup collected after parcel verification")}
          >
            Collected
          </button>
        )}

        {pickupMode && stage === "collected" && (
          <button
            type="button"
            disabled={busy}
            style={buttonStyle("green")}
            onClick={() =>
              onAction(
                job,
                "DELIVERED_TO_WAREHOUSE",
                "Rider handed the collected parcel to the origin warehouse"
              )
            }
          >
            <PackageCheck size={16} /> Delivered to Warehouse
          </button>
        )}

        {canReportPickupException && (
          <button
            type="button"
            disabled={busy}
            style={buttonStyle("red")}
            onClick={() => onModal(job, "exception")}
          >
            <AlertTriangle size={16} /> Pickup Exception
          </button>
        )}

        {deliveryMode && !delivered && !exception && !isOutForDelivery(job) && (
          <button
            type="button"
            disabled={busy}
            style={buttonStyle("blue")}
            onClick={() => onAction(job, "OUT_FOR_DELIVERY", "Rider started customer delivery")}
          >
            Start Delivery
          </button>
        )}

        {deliveryMode && !delivered && !exception && isOutForDelivery(job) && (
          <button
            type="button"
            disabled={busy}
            style={buttonStyle("green")}
            onClick={() => onModal(job, "delivery")}
          >
            Delivered
          </button>
        )}

        {deliveryMode && !delivered && !exception && (
          <button
            type="button"
            disabled={busy}
            style={buttonStyle("red")}
            onClick={() => onModal(job, "exception")}
          >
            <AlertTriangle size={16} /> Delivery Exception
          </button>
        )}
      </div>
    </Card>
  );
}

'''

rider = replace_regex(
    rider,
    r"function JobCard\(\{ job, onAction, onModal \}:.*?(?=function EmptyState)",
    job_card,
    "replace JobCard",
)

rider = replace_exact(
    rider,
    '  const [proofUrl, setProofUrl] = useState("");\n',
    '  const [proofUrl, setProofUrl] = useState("");\n'
    '  const [proofFile, setProofFile] = useState<File | null>(null);\n',
    "add proof file state",
)

rider = rider.replace(
    '  const [exceptionReason, setExceptionReason] = useState("CUSTOMER_UNREACHABLE");',
    '  const [exceptionReason, setExceptionReason] = useState("CUSTOMER_NOT_AVAILABLE");',
    1,
)

rider = replace_regex(
    rider,
    r"    const normalizedAction =.*?action\.toLowerCase\(\);",
    r'''    const normalizedAction =
      (
        {
          ACCEPTED: "accept",
          ARRIVED_AT_PICKUP: "arrive",
          PICKUP_VERIFIED: "verify_pickup",
          PICKUP_COLLECTED: "collect",
          DELIVERED_TO_WAREHOUSE: "delivered_to_warehouse",
          OUT_FOR_DELIVERY: "start_delivery",
          DELIVERED: "deliver",
        } as Record<string, string>
      )[action] ||
      (action.includes("EXCEPTION") ? "exception" : action.toLowerCase());''',
    "replace action mapping",
)

rider = replace_exact(
    rider,
    '    setProofUrl("");\n    setRemark("");\n    setExceptionReason("CUSTOMER_UNREACHABLE");',
    '    setProofUrl("");\n'
    '    setProofFile(null);\n'
    '    setRemark("");\n'
    '    setExceptionReason("CUSTOMER_NOT_AVAILABLE");',
    "reset modal state",
)

rider = replace_regex(
    rider,
    r"  function handleProof\(e: React\.ChangeEvent<HTMLInputElement>\) \{.*?\n  \}",
    r'''  function handleProof(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedJob) return;

    setProofFile(file);
    setProofUrl(URL.createObjectURL(file));
    setMessage(`Proof selected for ${pickupId(selectedJob)}. It will upload when submitted.`);
  }''',
    "replace proof handler",
)

upload_helper = r'''
  async function uploadWorkflowProof(
    pickupIdValue: string,
    workflowMode: string,
    file: File
  ) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath =
      `workflow-proofs/${pickupIdValue}/${workflowMode}-${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("rider-proofs")
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from("rider-proofs")
      .getPublicUrl(storagePath);

    return data.publicUrl;
  }

'''

rider = replace_exact(
    rider,
    "\n  async function submitModal() {",
    "\n" + upload_helper + "  async function submitModal() {",
    "insert proof uploader",
)


rider = replace_regex(
    rider,
    r'''    if \(modal === "exception"\) \{.*?\n    \}\n\n    setBusy\(true\);''',
    r'''    if (modal === "exception") {
      const rule = riderExceptionRule(selectedJob, exceptionReason);

      if (!rule) {
        setError("Select a valid exception reason.");
        return;
      }

      if (rule.requireRemark && !remark.trim()) {
        setError("Exception remark is required. State the actual issue in English or Myanmar.");
        return;
      }

      if (rule.requirePhoto && !proofFile && !proofUrl) {
        setError("Photo proof is required for the selected exception.");
        return;
      }

      action = "exception";
      payload = {
        process_type: rule.processType,
        workflow_area: rule.processType.toLowerCase(),
        exception_code: rule.code,
        exception_reason: rule.code,
        exception_name_en: rule.nameEn,
        exception_name_mm: rule.nameMm,
        mapped_status: rule.mappedStatus,
        next_action: rule.nextAction,
        reason: remark.trim(),
        proof_url: proof,
      };
      note = remark.trim();
    }

    setBusy(true);''',
    "replace exception submission",
)


rider = replace_exact(
    rider,
    '''      setMessage(`${id} updated: ${(data as any)?.action || action}`);
      setModal(null);
      setSelectedJob(null);''',
    '''      setMessage(`${id} updated: ${(data as any)?.action || action}`);
      setModal(null);
      setSelectedJob(null);
      setProofFile(null);
      setProofUrl("");''',
    "clear proof after success",
)

rider = replace_regex(
    rider,
    r'''  const renderJobs = \(rows: RiderJob\[\], emptyTitle: string, emptyBody: string\) => \(.*?\n  \);''',
    r'''  const renderJobs = (
    rows: RiderJob[],
    emptyTitle: string,
    emptyBody: string,
    screen: JobScreen
  ) => (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.length ? (
        rows.map((job) => (
          <JobCard
            key={pickupId(job)}
            job={job}
            onAction={runAction}
            onModal={openModal}
            busy={busy}
            screen={screen}
          />
        ))
      ) : (
        <EmptyState title={emptyTitle} body={emptyBody} />
      )}
    </div>
  );''',
    "replace renderJobs",
)

rider = rider.replace(
    'renderJobs(jobs, "No assigned jobs", "Supervisor assignment has not reached this rider account yet, or this rider code is not assigned to any real pickup.")',
    'renderJobs(jobs, "No assigned jobs", "Supervisor assignment has not reached this rider account yet, or this rider code is not assigned to any real pickup.", "jobs")',
)

rider = rider.replace(
    'renderJobs(pickupJobs, "No pickup jobs", "There are no active pickup tasks for this rider.")',
    'renderJobs(pickupJobs, "No pickup jobs", "There are no active pickup tasks for this rider.", "pickup")',
)

rider = rider.replace(
    'renderJobs(deliveryJobs, "No delivery jobs", "Collected parcels will appear here when ready for delivery.")',
    'renderJobs(deliveryJobs, "No delivery jobs", "Warehouse-released delivery assignments will appear here.", "delivery")',
)

rider = rider.replace(
    'renderJobs(codJobs, "No COD jobs", "COD records appear only when assigned pickups include COD/payment amount.")',
    'renderJobs(codJobs, "No COD jobs", "COD records appear only when assigned pickups include COD/payment amount.", "cod")',
)

rider = rider.replace(
    'title="Pickup workflow" subtitle="Accept, arrive, verify pickup, collect parcels, or log pickup exception."',
    'title="Pickup workflow" subtitle="Accept → Arrive → Verify Pickup → Collected → Delivered to Warehouse, or report an exception."',
)

rider = replace_regex(
    rider,
    r'''<select value=\{exceptionReason\} onChange=\{\(e\) => setExceptionReason\(e\.target\.value\)\} style=\{inputStyle\(\)\}>.*?</select>''',
    r'''<select
                      value={exceptionReason}
                      onChange={(e) => setExceptionReason(e.target.value)}
                      style={inputStyle()}
                    >
                      {exceptionRulesForJob(selectedJob).map((rule) => (
                        <option key={`${rule.processType}-${rule.code}`} value={rule.code}>
                          {rule.nameEn} / {rule.nameMm}
                        </option>
                      ))}
                    </select>
                    <div
                      style={{
                        marginTop: 10,
                        border: `1px solid ${C.border}`,
                        background: C.panel3,
                        borderRadius: 14,
                        padding: 12,
                      }}
                    >
                      <strong>{riderExceptionRule(selectedJob, exceptionReason).nameEn}</strong>
                      <div style={{ color: C.gold, marginTop: 4 }}>
                        {riderExceptionRule(selectedJob, exceptionReason).nameMm}
                      </div>
                      <div style={{ color: C.sub, fontSize: 12, marginTop: 6 }}>
                        Status: {riderExceptionRule(selectedJob, exceptionReason).mappedStatus}
                        {" · "}
                        Next: {riderExceptionRule(selectedJob, exceptionReason).nextAction}
                      </div>
                    </div>''',
    "replace exception dropdown",
)

rider = rider.replace(
    '<div><label>Required exception proof photo</label><input type="file" accept="image/*" capture="environment" onChange={handleProof} style={inputStyle()} /></div>',
    '''<div>
                  <label>
                    {riderExceptionRule(selectedJob, exceptionReason).requirePhoto
                      ? "Required exception proof photo"
                      : "Exception proof photo (optional)"}
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleProof}
                    style={inputStyle()}
                  />
                </div>''',
    1,
)

rider = rider.replace(
    '<div style={{ marginTop: 12 }}><label>Remark</label><textarea value={remark} onChange={(e) => setRemark(e.target.value)} style={{ ...inputStyle(), minHeight: 82 }} /></div>',
    '''<div style={{ marginTop: 12 }}>
              <label>
                {modal === "exception"
                  ? "Exception remark / unlisted issue details (required)"
                  : "Remark"}
              </label>
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder={
                  modal === "exception"
                    ? "State the actual issue in English or Myanmar..."
                    : "Optional operational remark..."
                }
                style={{ ...inputStyle(), minHeight: 82 }}
              />
            </div>''',
    1,
)

rider = rider.replace(
    '<button onClick={() => setModal(null)} style={buttonStyle("ghost")}>Cancel</button>',
    '<button type="button" disabled={busy} onClick={() => setModal(null)} style={buttonStyle("ghost")}>Cancel</button>',
    1,
)

rider = rider.replace(
    '<button onClick={submitModal} disabled={busy} style={buttonStyle(modal === "exception" ? "red" : "gold")}><UploadCloud size={16} /> Submit</button>',
    '<button type="button" onClick={submitModal} disabled={busy} style={buttonStyle(modal === "exception" ? "red" : "gold")}><UploadCloud size={16} /> {busy ? "Submitting..." : "Submit"}</button>',
    1,
)

RIDER.write_text(rider, encoding="utf-8")

warehouse_code = r'''// pages/warehouse/WarehouseScannerGoLivePage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  History,
  PackageCheck,
  Scan,
  ShieldCheck,
} from "lucide-react";

type IntakeAction = "accepted" | "accepted_condition" | "exception";

type WarehouseExceptionRule = {
  code: string;
  nameEn: string;
  nameMm: string;
  mappedStatus: string;
  nextAction: string;
  requirePhoto: boolean;
};

const WAREHOUSE_EXCEPTION_RULES: WarehouseExceptionRule[] = [
  {
    code: "WAYBILL_MISMATCH",
    nameEn: "Waybill mismatch",
    nameMm: "Waybill မကိုက်ညီပါ",
    mappedStatus: "WAREHOUSE_HOLD",
    nextAction: "DATA_CORRECTION",
    requirePhoto: true,
  },
  {
    code: "WEIGHT_MISMATCH",
    nameEn: "Weight mismatch",
    nameMm: "အလေးချိန် မကိုက်ညီပါ",
    mappedStatus: "QC_FAILED",
    nextAction: "RECALCULATE_TARIFF",
    requirePhoto: true,
  },
  {
    code: "DAMAGED_PARCEL",
    nameEn: "Damaged, wet, opened or broken parcel",
    nameMm: "ပစ္စည်း ပျက်စီး / စိုစွတ် / ဖွင့်ထားသည်",
    mappedStatus: "DAMAGED",
    nextAction: "DAMAGE_REVIEW",
    requirePhoto: true,
  },
  {
    code: "MISSING_INVOICE",
    nameEn: "Missing invoice or document",
    nameMm: "Invoice / စာရွက်စာတမ်း မပါရှိပါ",
    mappedStatus: "DOCUMENT_REQUIRED",
    nextAction: "REQUEST_DOCUMENT",
    requirePhoto: false,
  },
  {
    code: "UNIDENTIFIED_PARCEL",
    nameEn: "Unidentified parcel or unreadable label",
    nameMm: "မသိရှိနိုင်သော ပစ္စည်း / Label ဖတ်မရပါ",
    mappedStatus: "WAREHOUSE_HOLD",
    nextAction: "MANUAL_INVESTIGATION",
    requirePhoto: true,
  },
  {
    code: "WRONG_DESTINATION",
    nameEn: "Wrong branch, hub or destination",
    nameMm: "Branch / Hub / ဦးတည်ရာ မှားယွင်းသည်",
    mappedStatus: "MISROUTED",
    nextAction: "REROUTE",
    requirePhoto: true,
  },
  {
    code: "DUPLICATE_SCAN",
    nameEn: "Duplicate scan",
    nameMm: "Scan ထပ်နေသည်",
    mappedStatus: "SCAN_WARNING",
    nextAction: "IGNORE_OR_REVIEW",
    requirePhoto: false,
  },
  {
    code: "RESTRICTED_ITEM",
    nameEn: "Restricted or prohibited item",
    nameMm: "တားမြစ် / ကန့်သတ်ပစ္စည်း",
    mappedStatus: "WAREHOUSE_HOLD",
    nextAction: "COMPLIANCE_REVIEW",
    requirePhoto: true,
  },
  {
    code: "HOLD_BY_FINANCE",
    nameEn: "Finance hold",
    nameMm: "Finance မှ Hold ပြုလုပ်ထားသည်",
    mappedStatus: "FINANCE_HOLD",
    nextAction: "FINANCE_RELEASE_REQUIRED",
    requirePhoto: false,
  },
  {
    code: "HOLD_BY_CUSTOMER_SERVICE",
    nameEn: "Customer Service hold",
    nameMm: "Customer Service မှ Hold ပြုလုပ်ထားသည်",
    mappedStatus: "CS_HOLD",
    nextAction: "CS_RELEASE_REQUIRED",
    requirePhoto: false,
  },
  {
    code: "OTHER_EXCEPTION",
    nameEn: "Other warehouse exception",
    nameMm: "အခြား Warehouse ပြဿနာ",
    mappedStatus: "WAREHOUSE_HOLD",
    nextAction: "MANUAL_REVIEW",
    requirePhoto: false,
  },
];

function statusText(row: any) {
  return [
    row?.pickup_status,
    row?.rider_status,
    row?.rider_app_stage,
    row?.warehouse_status,
    row?.workflow_stage,
    row?.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
}

export default function WarehouseScannerGoLivePage() {
  const [scanInput, setScanInput] = useState("");
  const [pickup, setPickup] = useState<any>(null);
  const [action, setAction] = useState<IntakeAction>("accepted");
  const [remark, setRemark] = useState("");
  const [exceptionCode, setExceptionCode] = useState("WAYBILL_MISMATCH");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedRule = useMemo(
    () =>
      WAREHOUSE_EXCEPTION_RULES.find((rule) => rule.code === exceptionCode) ||
      WAREHOUSE_EXCEPTION_RULES[0],
    [exceptionCode]
  );

  useEffect(() => {
    if (!pickup) inputRef.current?.focus();
  }, [pickup, isProcessing]);

  async function lookupPickup(e: React.FormEvent) {
    e.preventDefault();
    const lookup = scanInput.trim().toUpperCase();
    if (!lookup || isProcessing) return;

    setIsProcessing(true);

    try {
      const { data, error } = await supabase
        .from("be_portal_pickup_requests")
        .select("*")
        .or(`pickup_id.eq.${lookup},pickup_way_id.eq.${lookup}`)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Pickup ID was not found.");

      const current = statusText(data);
      const eligible =
        current.includes("DELIVERED_TO_WAREHOUSE") ||
        current.includes("WAITING_WAREHOUSE_ACCEPTANCE") ||
        current.includes("RECEIVED_AT_ORIGIN") ||
        current.includes("WAREHOUSE_ACCEPTED");

      if (!eligible) {
        throw new Error(
          `Parcel is not ready for warehouse acceptance. Current status: ${
            data.pickup_status || data.rider_status || data.status || "UNKNOWN"
          }`
        );
      }

      setPickup(data);
      setAction("accepted");
      setRemark("");
      setProofFile(null);
      setExceptionCode("WAYBILL_MISMATCH");
    } catch (error: any) {
      toast({
        title: "Lookup Failed",
        description: error?.message || "Could not find the pickup.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }

  async function uploadWarehouseProof(pickupId: string) {
    if (!proofFile) return null;

    const safeName = proofFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath =
      `warehouse-intake/${pickupId}/${Date.now()}-${safeName}`;

    const { error } = await supabase.storage
      .from("rider-proofs")
      .upload(storagePath, proofFile, {
        cacheControl: "3600",
        upsert: true,
      });

    if (error) throw error;

    return supabase.storage
      .from("rider-proofs")
      .getPublicUrl(storagePath).data.publicUrl;
  }

  async function submitIntake() {
    if (!pickup || isProcessing) return;

    const pickupId = pickup.pickup_id || pickup.pickup_way_id;

    if (action === "accepted_condition" && !remark.trim()) {
      toast({
        title: "Remark Required",
        description: "State the parcel condition before accepting.",
        variant: "destructive",
      });
      return;
    }

    if (action === "exception" && !remark.trim()) {
      toast({
        title: "Exception Remark Required",
        description: "State the warehouse exception in English or Myanmar.",
        variant: "destructive",
      });
      return;
    }

    if (
      action === "exception" &&
      selectedRule.requirePhoto &&
      !proofFile
    ) {
      toast({
        title: "Photo Required",
        description: "Attach a photo for this warehouse exception.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const proofUrl = await uploadWarehouseProof(pickupId);

      const { data, error } = await supabase.rpc(
        "be_warehouse_intake_action",
        {
          p_payload: {
            pickup_id: pickupId,
            pickup_way_id: pickup.pickup_way_id,
            action,
            remark: remark.trim(),
            remarks: remark.trim(),
            exception_code:
              action === "exception" ? selectedRule.code : null,
            exception_name_en:
              action === "exception" ? selectedRule.nameEn : null,
            exception_name_mm:
              action === "exception" ? selectedRule.nameMm : null,
            mapped_status:
              action === "exception" ? selectedRule.mappedStatus : null,
            next_action:
              action === "exception" ? selectedRule.nextAction : null,
            proof_url: proofUrl,
            actor_code:
              localStorage.getItem("be_workforce_code") || "WAREHOUSE",
            actor_name:
              localStorage.getItem("be_display_name") || "Warehouse Staff",
            source: "warehouse_intake_terminal",
          },
        }
      );

      if (error) throw error;
      if (data?.ok === false) {
        throw new Error(data?.error || "Warehouse action failed.");
      }

      const label =
        action === "accepted"
          ? "Accepted by Warehouse"
          : action === "accepted_condition"
            ? "Accepted with Condition"
            : `${selectedRule.nameEn} / ${selectedRule.nameMm}`;

      setRecentScans((previous) =>
        [
          {
            id: pickupId,
            time: new Date().toLocaleTimeString(),
            status: "Success",
            action: label,
            remark: remark.trim(),
          },
          ...previous,
        ].slice(0, 10)
      );

      toast({
        title: label,
        description: `${pickupId} updated successfully.`,
      });

      setPickup(null);
      setScanInput("");
      setRemark("");
      setProofFile(null);
      setAction("accepted");
    } catch (error: any) {
      setRecentScans((previous) =>
        [
          {
            id: pickupId,
            time: new Date().toLocaleTimeString(),
            status: "Failed",
            action,
            remark: error?.message || "Unknown error",
          },
          ...previous,
        ].slice(0, 10)
      );

      toast({
        title: "Warehouse Action Failed",
        description: error?.message || "The parcel was not updated.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Scan className="w-8 h-8 text-blue-800" />
        <div>
          <h1 className="text-2xl font-bold">Warehouse Intake Terminal</h1>
          <p className="text-sm text-gray-500">
            Scan, inspect, accept, conditionally accept, or raise an exception.
          </p>
        </div>
      </div>

      <div className="bg-white p-8 border rounded-lg shadow-sm">
        <form
          onSubmit={lookupPickup}
          className="max-w-xl mx-auto space-y-4"
        >
          <label className="block text-sm font-semibold text-gray-700">
            Scan PickupWayID or enter Pickup ID
          </label>

          <input
            ref={inputRef}
            type="text"
            value={scanInput}
            onChange={(event) => setScanInput(event.target.value)}
            disabled={isProcessing}
            placeholder="e.g. P0627-BBG-015"
            className="w-full text-center text-2xl p-4 border-2 border-blue-200 rounded-md focus:border-blue-600 focus:outline-none"
            autoComplete="off"
          />

          <Button
            type="submit"
            disabled={isProcessing || !scanInput.trim()}
            className="w-full py-6 text-lg"
          >
            {isProcessing ? "Checking..." : "Find Parcel"}
          </Button>
        </form>
      </div>

      {pickup && (
        <div className="bg-white border rounded-lg shadow-sm p-6 space-y-5">
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <div className="font-mono text-xl font-bold text-blue-900">
                {pickup.pickup_way_id || pickup.pickup_id}
              </div>
              <div className="font-semibold mt-1">
                {pickup.merchant_name || "Merchant"}
              </div>
              <div className="text-sm text-gray-500 mt-1">
                {pickup.pickup_address || pickup.address || "No address"}
              </div>
            </div>

            <Badge>
              {pickup.pickup_status ||
                pickup.rider_status ||
                pickup.status}
            </Badge>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <Button
              type="button"
              disabled={isProcessing}
              variant={action === "accepted" ? "default" : "outline"}
              onClick={() => setAction("accepted")}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Accepted by Warehouse
            </Button>

            <Button
              type="button"
              disabled={isProcessing}
              variant={
                action === "accepted_condition" ? "default" : "outline"
              }
              onClick={() => setAction("accepted_condition")}
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              Accepted with Condition
            </Button>

            <Button
              type="button"
              disabled={isProcessing}
              variant={
                action === "exception" ? "destructive" : "outline"
              }
              onClick={() => setAction("exception")}
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Warehouse Exception
            </Button>
          </div>

          {action === "exception" && (
            <div className="space-y-3 border rounded-lg p-4 bg-red-50">
              <label className="block text-sm font-semibold">
                Exception Rule / ပြဿနာအမျိုးအစား
              </label>

              <select
                value={exceptionCode}
                onChange={(event) =>
                  setExceptionCode(event.target.value)
                }
                className="w-full border rounded-md p-3 bg-white"
              >
                {WAREHOUSE_EXCEPTION_RULES.map((rule) => (
                  <option key={rule.code} value={rule.code}>
                    {rule.nameEn} / {rule.nameMm}
                  </option>
                ))}
              </select>

              <div className="text-sm rounded-md border bg-white p-3">
                <div className="font-semibold">{selectedRule.nameEn}</div>
                <div className="text-amber-700 mt-1">
                  {selectedRule.nameMm}
                </div>
                <div className="text-gray-500 mt-1">
                  Status: {selectedRule.mappedStatus} · Next:{" "}
                  {selectedRule.nextAction}
                </div>
              </div>
            </div>
          )}

          {(action === "accepted_condition" ||
            action === "exception") && (
            <div>
              <label className="block text-sm font-semibold mb-2">
                {action === "accepted_condition"
                  ? "Parcel condition remark / လက်ခံသည့်အခြေအနေ"
                  : "Exception remark / အခြားအသေးစိတ်အချက်အလက်"}
              </label>
              <textarea
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
                placeholder="State the actual condition or exception in English or Myanmar..."
                className="w-full min-h-28 border rounded-md p-3"
              />
            </div>
          )}

          {action === "exception" && (
            <div>
              <label className="block text-sm font-semibold mb-2">
                {selectedRule.requirePhoto
                  ? "Required exception photo"
                  : "Exception photo (optional)"}
              </label>

              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-3 bg-white">
                <Camera className="w-4 h-4" />
                {proofFile ? proofFile.name : "Capture or attach photo"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(event) =>
                    setProofFile(event.target.files?.[0] || null)
                  }
                />
              </label>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={isProcessing}
              onClick={() => {
                setPickup(null);
                setRemark("");
                setProofFile(null);
              }}
            >
              Cancel
            </Button>

            <Button
              type="button"
              disabled={isProcessing}
              variant={
                action === "exception" ? "destructive" : "default"
              }
              onClick={submitIntake}
            >
              {isProcessing
                ? "Submitting..."
                : action === "accepted"
                  ? "Confirm Warehouse Acceptance"
                  : action === "accepted_condition"
                    ? "Accept with Remark"
                    : "Submit Warehouse Exception"}
            </Button>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-lg shadow-sm p-4">
        <h2 className="font-semibold text-lg flex items-center gap-2 mb-4">
          <History className="w-5 h-5" />
          Recent Warehouse Actions
        </h2>

        {recentScans.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            Awaiting the first warehouse action.
          </div>
        ) : (
          <div className="divide-y">
            {recentScans.map((scan, index) => (
              <div
                key={`${scan.id}-${scan.time}-${index}`}
                className="py-3 flex flex-wrap justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <PackageCheck
                    className={`w-5 h-5 mt-1 ${
                      scan.status === "Success"
                        ? "text-green-600"
                        : "text-red-500"
                    }`}
                  />
                  <div>
                    <div className="font-bold font-mono text-lg">
                      {scan.id}
                    </div>
                    <div className="text-sm text-gray-600">
                      {scan.action}
                    </div>
                    {scan.remark && (
                      <div className="text-sm text-gray-500 mt-1">
                        {scan.remark}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <Badge
                    variant={
                      scan.status === "Success"
                        ? "default"
                        : "destructive"
                    }
                  >
                    {scan.status}
                  </Badge>
                  <span className="text-sm text-gray-500">
                    {scan.time}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
'''

WAREHOUSE.write_text(warehouse_code, encoding="utf-8")

sql = r'''begin;

create or replace function public.be_rider_pickup_action(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_lookup text := coalesce(
    nullif(v_payload ->> 'pickup_id', ''),
    nullif(v_payload ->> 'pickup_way_id', '')
  );
  v_action text := lower(coalesce(nullif(v_payload ->> 'action', ''), ''));
  v_rider text := coalesce(
    nullif(v_payload ->> 'rider_code', ''),
    nullif(v_payload ->> 'rider_id', ''),
    'RID001'
  );
  v_rider_name text := coalesce(
    nullif(v_payload ->> 'rider_name', ''),
    nullif(v_payload ->> 'user_name', ''),
    'Rider'
  );
  v_remark text := coalesce(
    nullif(v_payload ->> 'remarks', ''),
    nullif(v_payload ->> 'remark', ''),
    nullif(v_payload ->> 'reason', '')
  );
  v_exception_code text := upper(coalesce(
    nullif(v_payload ->> 'exception_code', ''),
    nullif(v_payload ->> 'exception_reason', ''),
    'OTHER_EXCEPTION'
  ));
  v_process_type text := lower(coalesce(
    nullif(v_payload ->> 'workflow_area', ''),
    nullif(v_payload ->> 'process_type', ''),
    'pickup'
  ));
  v_mapped_status text := upper(coalesce(
    nullif(v_payload ->> 'mapped_status', ''),
    'EXCEPTION'
  ));
  v_verified_count integer := 0;
  v_weight numeric := 0;
  v_rec public.be_portal_pickup_requests%rowtype;
  v_record jsonb;
  v_event_status text;
  v_message text;
begin
  if v_lookup is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'PICKUP_ID_REQUIRED'
    );
  end if;

  if v_action not in (
    'accept',
    'arrive',
    'verify_pickup',
    'collect',
    'delivered_to_warehouse',
    'start_delivery',
    'deliver',
    'exception'
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_ACTION',
      'action', v_action
    );
  end if;

  select *
  into v_rec
  from public.be_portal_pickup_requests
  where pickup_id = v_lookup
     or pickup_way_id = v_lookup
  limit 1
  for update;

  if v_rec.id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'PICKUP_NOT_FOUND',
      'pickup_id', v_lookup
    );
  end if;

  if jsonb_typeof(coalesce(v_payload -> 'parcels', '[]'::jsonb)) = 'array' then
    select
      coalesce(jsonb_array_length(v_payload -> 'parcels'), 0),
      coalesce(sum(coalesce(nullif(x ->> 'actual_weight_kg', '')::numeric, 0)), 0)
    into v_verified_count, v_weight
    from jsonb_array_elements(coalesce(v_payload -> 'parcels', '[]'::jsonb)) x;
  end if;

  if v_action = 'accept' then
    if upper(coalesce(v_rec.pickup_status, '')) = 'ACCEPTED_BY_RIDER'
       or upper(coalesce(v_rec.rider_status, '')) = 'ACCEPTED' then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'action', v_action,
        'pickup_id', v_rec.pickup_id
      );
    end if;

    if not (
      upper(coalesce(v_rec.pickup_status, '')) in (
        'ASSIGNED',
        'PICKUP_ASSIGNED',
        'PICKUP_REQUESTED',
        'PENDING_ASSIGNMENT',
        'WAITING_ACCEPTANCE'
      )
      or upper(coalesce(v_rec.rider_status, '')) in (
        'ASSIGNED',
        'PENDING',
        'WAITING_ACCEPTANCE'
      )
      or upper(coalesce(v_rec.assignment_status, '')) = 'ASSIGNED'
      or lower(coalesce(v_rec.status, '')) in (
        'assigned',
        'pickup_requested',
        'pending_assignment'
      )
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'INVALID_STATUS_TRANSITION',
        'action', v_action,
        'current_status', coalesce(v_rec.pickup_status, v_rec.rider_status, v_rec.status)
      );
    end if;

    update public.be_portal_pickup_requests
    set
      accepted_at = now(),
      rider_status = 'ACCEPTED',
      rider_app_stage = 'ACCEPTED_PICKUP',
      pickup_status = 'ACCEPTED_BY_RIDER',
      status = 'accepted',
      assignment_status = 'accepted',
      rider_last_action = 'accept',
      rider_last_action_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'last_rider_payload', v_payload,
          'accepted_by_rider_at', now()
        ),
      updated_at = now()
    where id = v_rec.id;

    v_event_status := 'ACCEPTED_BY_RIDER';

  elsif v_action = 'arrive' then
    if upper(coalesce(v_rec.pickup_status, '')) = 'RIDER_ARRIVED'
       or upper(coalesce(v_rec.rider_status, '')) = 'ARRIVED_PICKUP' then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'action', v_action,
        'pickup_id', v_rec.pickup_id
      );
    end if;

    if not (
      upper(coalesce(v_rec.pickup_status, '')) = 'ACCEPTED_BY_RIDER'
      or upper(coalesce(v_rec.rider_status, '')) = 'ACCEPTED'
      or lower(coalesce(v_rec.status, '')) = 'accepted'
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'ACCEPT_REQUIRED_BEFORE_ARRIVAL',
        'current_status', coalesce(v_rec.pickup_status, v_rec.rider_status, v_rec.status)
      );
    end if;

    update public.be_portal_pickup_requests
    set
      arrived_pickup_at = now(),
      rider_status = 'ARRIVED_PICKUP',
      rider_app_stage = 'ARRIVED_PICKUP',
      pickup_status = 'RIDER_ARRIVED',
      status = 'arrived_pickup',
      assignment_status = 'in_progress',
      rider_last_action = 'arrived',
      rider_last_action_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'last_rider_payload', v_payload,
          'rider_arrived_at', now()
        ),
      updated_at = now()
    where id = v_rec.id;

    v_event_status := 'RIDER_ARRIVED';

  elsif v_action = 'verify_pickup' then
    if upper(coalesce(v_rec.pickup_status, '')) = 'PICKUP_VERIFIED'
       or upper(coalesce(v_rec.rider_status, '')) = 'PICKUP_VERIFIED' then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'action', v_action,
        'pickup_id', v_rec.pickup_id
      );
    end if;

    if not (
      upper(coalesce(v_rec.pickup_status, '')) = 'RIDER_ARRIVED'
      or upper(coalesce(v_rec.rider_status, '')) = 'ARRIVED_PICKUP'
      or lower(coalesce(v_rec.status, '')) = 'arrived_pickup'
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'ARRIVAL_REQUIRED_BEFORE_VERIFICATION',
        'current_status', coalesce(v_rec.pickup_status, v_rec.rider_status, v_rec.status)
      );
    end if;

    if v_verified_count <= 0 then
      return jsonb_build_object(
        'ok', false,
        'error', 'PARCEL_VERIFICATION_REQUIRED'
      );
    end if;

    update public.be_portal_pickup_requests
    set
      pickup_verified_at = now(),
      field_verified_at = now(),
      field_verified_by = v_rider,
      rider_status = 'PICKUP_VERIFIED',
      rider_app_stage = 'PICKUP_VERIFIED',
      pickup_status = 'PICKUP_VERIFIED',
      status = 'pickup_verified',
      assignment_status = 'pickup_verified',
      verified_parcels = greatest(
        coalesce(v_verified_count, 0),
        coalesce(verified_parcels, 0)
      ),
      total_weight_kg = case
        when v_weight > 0 then v_weight
        else coalesce(total_weight_kg, 0)
      end,
      pickup_proof_url = coalesce(
        nullif(v_payload ->> 'proof_url', ''),
        pickup_proof_url
      ),
      proof_url = coalesce(
        nullif(v_payload ->> 'proof_url', ''),
        proof_url
      ),
      warehouse_status = 'WAITING_DATA_ENTRY',
      data_entry_status = 'WAITING_DATA_ENTRY',
      rider_last_action = 'verify_pickup',
      rider_last_action_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'last_rider_payload', v_payload,
          'pickup_verified_at', now()
        ),
      updated_at = now()
    where id = v_rec.id;

    v_event_status := 'PICKUP_VERIFIED';

  elsif v_action = 'collect' then
    if upper(coalesce(v_rec.pickup_status, '')) = 'PICKUP_COLLECTED'
       or upper(coalesce(v_rec.rider_status, '')) = 'PICKUP_COLLECTED' then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'action', v_action,
        'pickup_id', v_rec.pickup_id
      );
    end if;

    if not (
      upper(coalesce(v_rec.pickup_status, '')) = 'PICKUP_VERIFIED'
      or upper(coalesce(v_rec.rider_status, '')) = 'PICKUP_VERIFIED'
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'VERIFICATION_REQUIRED_BEFORE_COLLECTION',
        'current_status', coalesce(v_rec.pickup_status, v_rec.rider_status, v_rec.status)
      );
    end if;

    update public.be_portal_pickup_requests
    set
      pickup_collected_at = now(),
      rider_status = 'PICKUP_COLLECTED',
      rider_app_stage = 'PICKUP_COLLECTED',
      pickup_status = 'PICKUP_COLLECTED',
      status = 'pickup_collected',
      assignment_status = 'collected',
      warehouse_status = 'IN_TRANSIT_TO_WAREHOUSE',
      data_entry_status = 'WAITING_DATA_ENTRY',
      rider_last_action = 'collected',
      rider_last_action_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'last_rider_payload', v_payload,
          'pickup_collected_at', now()
        ),
      updated_at = now()
    where id = v_rec.id;

    v_event_status := 'PICKUP_COLLECTED';

  elsif v_action = 'delivered_to_warehouse' then
    if upper(coalesce(v_rec.pickup_status, '')) = 'DELIVERED_TO_WAREHOUSE'
       or upper(coalesce(v_rec.rider_status, '')) = 'DELIVERED_TO_WAREHOUSE'
       or upper(coalesce(v_rec.warehouse_status, '')) = 'WAITING_WAREHOUSE_ACCEPTANCE' then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'action', v_action,
        'pickup_id', v_rec.pickup_id
      );
    end if;

    if not (
      upper(coalesce(v_rec.pickup_status, '')) = 'PICKUP_COLLECTED'
      or upper(coalesce(v_rec.rider_status, '')) = 'PICKUP_COLLECTED'
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'COLLECTION_REQUIRED_BEFORE_WAREHOUSE_HANDOVER',
        'current_status', coalesce(v_rec.pickup_status, v_rec.rider_status, v_rec.status)
      );
    end if;

    update public.be_portal_pickup_requests
    set
      rider_status = 'DELIVERED_TO_WAREHOUSE',
      rider_app_stage = 'DELIVERED_TO_WAREHOUSE',
      pickup_status = 'DELIVERED_TO_WAREHOUSE',
      status = 'delivered_to_warehouse',
      assignment_status = 'awaiting_warehouse',
      warehouse_status = 'WAITING_WAREHOUSE_ACCEPTANCE',
      workflow_stage = 'DELIVERED_TO_WAREHOUSE',
      operation_status = 'warehouse_handover',
      rider_last_action = 'delivered_to_warehouse',
      rider_last_action_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'last_rider_payload', v_payload,
          'delivered_to_warehouse_at', now(),
          'handover_remark', v_remark
        ),
      updated_at = now()
    where id = v_rec.id;

    v_event_status := 'DELIVERED_TO_WAREHOUSE';

  elsif v_action = 'start_delivery' then
    if upper(coalesce(v_rec.delivery_status, '')) = 'OUT_FOR_DELIVERY'
       or upper(coalesce(v_rec.rider_status, '')) = 'OUT_FOR_DELIVERY' then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'action', v_action,
        'pickup_id', v_rec.pickup_id
      );
    end if;

    if not (
      upper(coalesce(v_rec.pickup_status, '')) in (
        'READY_FOR_DELIVERY',
        'ASSIGNED_FOR_DELIVERY'
      )
      or upper(coalesce(v_rec.delivery_status, '')) in (
        'READY_FOR_DELIVERY',
        'ASSIGNED'
      )
      or upper(coalesce(v_rec.dispatch_status, '')) in (
        'ASSIGNED_TO_RIDER',
        'READY_FOR_DELIVERY'
      )
      or upper(coalesce(v_rec.warehouse_status, '')) = 'RECEIVED_AT_ORIGIN'
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'DELIVERY_ASSIGNMENT_REQUIRED',
        'current_status', coalesce(v_rec.delivery_status, v_rec.pickup_status, v_rec.dispatch_status)
      );
    end if;

    update public.be_portal_pickup_requests
    set
      delivery_status = 'OUT_FOR_DELIVERY',
      rider_status = 'OUT_FOR_DELIVERY',
      rider_app_stage = 'OUT_FOR_DELIVERY',
      pickup_status = 'OUT_FOR_DELIVERY',
      status = 'out_for_delivery',
      assignment_status = 'out_for_delivery',
      rider_last_action = 'start_delivery',
      rider_last_action_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'last_delivery_payload', v_payload,
          'out_for_delivery_at', now()
        ),
      updated_at = now()
    where id = v_rec.id;

    v_event_status := 'OUT_FOR_DELIVERY';

  elsif v_action = 'deliver' then
    if upper(coalesce(v_rec.delivery_status, '')) = 'DELIVERED'
       or upper(coalesce(v_rec.rider_status, '')) = 'DELIVERED' then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'action', v_action,
        'pickup_id', v_rec.pickup_id
      );
    end if;

    if not (
      upper(coalesce(v_rec.delivery_status, '')) = 'OUT_FOR_DELIVERY'
      or upper(coalesce(v_rec.rider_status, '')) = 'OUT_FOR_DELIVERY'
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'START_DELIVERY_REQUIRED',
        'current_status', coalesce(v_rec.delivery_status, v_rec.rider_status, v_rec.status)
      );
    end if;

    if nullif(v_payload ->> 'recipient_name', '') is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'RECIPIENT_NAME_REQUIRED'
      );
    end if;

    if nullif(v_payload ->> 'proof_url', '') is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'DELIVERY_PROOF_REQUIRED'
      );
    end if;

    update public.be_portal_pickup_requests
    set
      delivered_at = now(),
      delivery_verified_at = now(),
      delivery_status = 'DELIVERED',
      rider_status = 'DELIVERED',
      rider_app_stage = 'DELIVERED',
      pickup_status = 'DELIVERED',
      status = 'delivered',
      rider_last_action = 'delivered',
      rider_last_action_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'last_delivery_payload', v_payload,
          'last_delivery_action_at', now()
        ),
      updated_at = now()
    where id = v_rec.id;

    insert into public.be_proof_of_delivery (
      pickup_id,
      delivery_way_id,
      proof_type,
      proof_url,
      signature_url,
      recipient_name,
      recipient_phone,
      rider_code,
      rider_name,
      status,
      metadata
    )
    values (
      v_rec.pickup_id,
      nullif(v_payload ->> 'delivery_way_id', ''),
      coalesce(nullif(v_payload ->> 'proof_type', ''), 'delivery'),
      nullif(v_payload ->> 'proof_url', ''),
      nullif(v_payload ->> 'signature_url', ''),
      nullif(v_payload ->> 'recipient_name', ''),
      nullif(v_payload ->> 'recipient_phone', ''),
      v_rider,
      v_rider_name,
      'submitted',
      v_payload
    );

    v_event_status := 'DELIVERED';

  elsif v_action = 'exception' then
    if upper(coalesce(v_rec.pickup_status, '')) in (
      'DELIVERED_TO_WAREHOUSE',
      'RECEIVED_AT_ORIGIN',
      'DELIVERED'
    )
       or upper(coalesce(v_rec.rider_status, '')) in (
         'WAREHOUSE_ACCEPTED',
         'DELIVERED'
       ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'FINAL_STATUS_CANNOT_BE_CHANGED',
        'current_status', coalesce(v_rec.pickup_status, v_rec.rider_status, v_rec.status)
      );
    end if;

    if v_remark is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'EXCEPTION_REMARK_REQUIRED'
      );
    end if;

    if v_mapped_status not in (
      'EXCEPTION',
      'PICKUP_FAILED',
      'ADDRESS_CORRECTION_REQUIRED',
      'PICKUP_ON_HOLD',
      'SPECIAL_HANDLING_REQUIRED',
      'PICKUP_REJECTED',
      'PICKUP_CANCELLED',
      'DELIVERY_ATTEMPTED',
      'CUSTOMER_REFUSED',
      'ADDRESS_ISSUE',
      'DELIVERY_RESCHEDULED',
      'DAMAGED',
      'DELIVERY_DELAYED',
      'REASSIGNMENT_REQUIRED'
    ) then
      v_mapped_status := 'EXCEPTION';
    end if;

    update public.be_portal_pickup_requests
    set
      exception_at = now(),
      exception_reason = v_remark,
      delivery_status = case
        when v_process_type = 'delivery' then v_mapped_status
        else delivery_status
      end,
      rider_status = v_mapped_status,
      rider_app_stage = 'EXCEPTION',
      pickup_status = v_mapped_status,
      status = 'exception',
      rider_last_action = 'exception',
      rider_last_action_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'last_exception_payload', v_payload,
          'exception_code', v_exception_code,
          'mapped_status', v_mapped_status,
          'exception_remark', v_remark,
          'last_exception_at', now()
        ),
      updated_at = now()
    where id = v_rec.id;

    v_event_status := v_mapped_status;
  end if;

  select to_jsonb(p.*)
  into v_record
  from public.be_portal_pickup_requests p
  where p.id = v_rec.id;

  v_message :=
    coalesce(v_rec.pickup_id, v_lookup) ||
    ': ' ||
    replace(v_action, '_', ' ') ||
    case
      when v_remark is not null then ' - ' || v_remark
      else ''
    end;

  perform public.be_workflow_emit_event(
    coalesce(v_rec.pickup_id, v_lookup),
    'rider_' || v_action,
    v_event_status,
    v_message,
    'rider_app',
    'rider',
    v_rider,
    v_rider_name,
    v_payload
  );

  perform public.be_workflow_notify(
    coalesce(v_rec.pickup_id, v_lookup),
    'supervisor',
    null,
    'Rider workflow update',
    v_message,
    v_payload
  );

  if v_action in ('verify_pickup', 'collect', 'delivered_to_warehouse') then
    perform public.be_workflow_notify(
      coalesce(v_rec.pickup_id, v_lookup),
      'warehouse',
      null,
      case
        when v_action = 'delivered_to_warehouse'
          then 'Parcel waiting for warehouse acceptance'
        else 'Pickup workflow update'
      end,
      v_message,
      v_payload
    );
  end if;

  if v_action = 'verify_pickup' then
    perform public.be_workflow_notify(
      coalesce(v_rec.pickup_id, v_lookup),
      'data_entry',
      null,
      'Pickup verified by rider',
      v_message,
      v_payload
    );
  end if;

  if v_action = 'exception' then
    perform public.be_workflow_notify(
      coalesce(v_rec.pickup_id, v_lookup),
      'customer_service',
      null,
      'Rider exception requires review',
      v_message,
      v_payload
    );

    perform public.be_workflow_notify(
      coalesce(v_rec.pickup_id, v_lookup),
      'warehouse',
      null,
      'Rider exception update',
      v_message,
      v_payload
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', coalesce(v_rec.pickup_id, v_lookup),
    'action', v_action,
    'status', v_event_status,
    'record', v_record
  );
end;
$$;

create or replace function public.be_warehouse_intake_action(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_lookup text := coalesce(
    nullif(v_payload ->> 'pickup_id', ''),
    nullif(v_payload ->> 'pickup_way_id', '')
  );
  v_action text := lower(coalesce(nullif(v_payload ->> 'action', ''), ''));
  v_remark text := coalesce(
    nullif(v_payload ->> 'remarks', ''),
    nullif(v_payload ->> 'remark', '')
  );
  v_exception_code text := upper(coalesce(
    nullif(v_payload ->> 'exception_code', ''),
    'OTHER_EXCEPTION'
  ));
  v_mapped_status text := upper(coalesce(
    nullif(v_payload ->> 'mapped_status', ''),
    'WAREHOUSE_HOLD'
  ));
  v_actor_code text := coalesce(
    nullif(v_payload ->> 'actor_code', ''),
    'WAREHOUSE'
  );
  v_actor_name text := coalesce(
    nullif(v_payload ->> 'actor_name', ''),
    'Warehouse Staff'
  );
  v_rec public.be_portal_pickup_requests%rowtype;
  v_record jsonb;
  v_event_status text;
  v_title text;
  v_message text;
begin
  if v_lookup is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'PICKUP_ID_REQUIRED'
    );
  end if;

  if v_action not in (
    'accepted',
    'accepted_condition',
    'exception'
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_WAREHOUSE_ACTION',
      'action', v_action
    );
  end if;

  select *
  into v_rec
  from public.be_portal_pickup_requests
  where pickup_id = v_lookup
     or pickup_way_id = v_lookup
  limit 1
  for update;

  if v_rec.id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'PICKUP_NOT_FOUND',
      'pickup_id', v_lookup
    );
  end if;

  if upper(coalesce(v_rec.warehouse_status, '')) = 'RECEIVED_AT_ORIGIN'
     or upper(coalesce(v_rec.pickup_status, '')) = 'RECEIVED_AT_ORIGIN'
     or upper(coalesce(v_rec.rider_status, '')) = 'WAREHOUSE_ACCEPTED' then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'pickup_id', v_rec.pickup_id,
      'action', v_action,
      'status', 'RECEIVED_AT_ORIGIN'
    );
  end if;

  if not (
    upper(coalesce(v_rec.pickup_status, '')) = 'DELIVERED_TO_WAREHOUSE'
    or upper(coalesce(v_rec.rider_status, '')) = 'DELIVERED_TO_WAREHOUSE'
    or upper(coalesce(v_rec.rider_app_stage, '')) = 'DELIVERED_TO_WAREHOUSE'
    or upper(coalesce(v_rec.warehouse_status, '')) = 'WAITING_WAREHOUSE_ACCEPTANCE'
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'RIDER_HANDOVER_REQUIRED',
      'current_status', coalesce(
        v_rec.pickup_status,
        v_rec.rider_status,
        v_rec.warehouse_status,
        v_rec.status
      )
    );
  end if;

  if v_action = 'accepted' then
    update public.be_portal_pickup_requests
    set
      pickup_status = 'RECEIVED_AT_ORIGIN',
      status = 'received_at_origin',
      rider_status = 'WAREHOUSE_ACCEPTED',
      rider_app_stage = 'WAREHOUSE_ACCEPTED',
      warehouse_status = 'RECEIVED_AT_ORIGIN',
      workflow_stage = 'RECEIVED_AT_ORIGIN',
      operation_status = 'warehouse_received',
      assignment_status = 'warehouse_received',
      data_entry_status = 'WAITING_DATA_ENTRY',
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'warehouse_action', v_action,
          'warehouse_actor_code', v_actor_code,
          'warehouse_actor_name', v_actor_name,
          'warehouse_accepted_at', now(),
          'warehouse_remark', null
        ),
      updated_at = now()
    where id = v_rec.id;

    v_event_status := 'RECEIVED_AT_ORIGIN';
    v_title := 'Accepted by Warehouse';

  elsif v_action = 'accepted_condition' then
    if v_remark is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'WAREHOUSE_CONDITION_REMARK_REQUIRED'
      );
    end if;

    update public.be_portal_pickup_requests
    set
      pickup_status = 'RECEIVED_AT_ORIGIN',
      status = 'received_at_origin',
      rider_status = 'WAREHOUSE_ACCEPTED_WITH_CONDITION',
      rider_app_stage = 'WAREHOUSE_ACCEPTED_WITH_CONDITION',
      warehouse_status = 'RECEIVED_AT_ORIGIN',
      workflow_stage = 'RECEIVED_AT_ORIGIN',
      operation_status = 'warehouse_received_with_condition',
      assignment_status = 'warehouse_received',
      data_entry_status = 'WAITING_DATA_ENTRY',
      exception_reason = v_remark,
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'warehouse_action', v_action,
          'warehouse_actor_code', v_actor_code,
          'warehouse_actor_name', v_actor_name,
          'warehouse_accepted_at', now(),
          'warehouse_condition', true,
          'warehouse_remark', v_remark
        ),
      updated_at = now()
    where id = v_rec.id;

    v_event_status := 'RECEIVED_AT_ORIGIN';
    v_title := 'Accepted by Warehouse with Condition';

  elsif v_action = 'exception' then
    if v_remark is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'WAREHOUSE_EXCEPTION_REMARK_REQUIRED'
      );
    end if;

    if v_mapped_status not in (
      'WAREHOUSE_HOLD',
      'QC_FAILED',
      'DAMAGED',
      'DOCUMENT_REQUIRED',
      'MISROUTED',
      'SCAN_WARNING',
      'FINANCE_HOLD',
      'CS_HOLD'
    ) then
      v_mapped_status := 'WAREHOUSE_HOLD';
    end if;

    update public.be_portal_pickup_requests
    set
      pickup_status = 'WAREHOUSE_HOLD',
      status = 'warehouse_exception',
      rider_status = 'WAREHOUSE_EXCEPTION',
      rider_app_stage = 'WAREHOUSE_EXCEPTION',
      warehouse_status = v_mapped_status,
      workflow_stage = v_mapped_status,
      operation_status = 'warehouse_hold',
      assignment_status = 'warehouse_review',
      data_entry_status = 'WAITING_REVIEW',
      exception_at = now(),
      exception_reason = v_remark,
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'warehouse_action', v_action,
          'warehouse_exception_code', v_exception_code,
          'warehouse_mapped_status', v_mapped_status,
          'warehouse_actor_code', v_actor_code,
          'warehouse_actor_name', v_actor_name,
          'warehouse_exception_at', now(),
          'warehouse_remark', v_remark,
          'warehouse_payload', v_payload
        ),
      updated_at = now()
    where id = v_rec.id;

    v_event_status := v_mapped_status;
    v_title := 'Warehouse Exception';
  end if;

  select to_jsonb(p.*)
  into v_record
  from public.be_portal_pickup_requests p
  where p.id = v_rec.id;

  v_message :=
    coalesce(v_rec.pickup_id, v_lookup) ||
    ': ' ||
    v_title ||
    case
      when v_remark is not null then ' - ' || v_remark
      else ''
    end;

  perform public.be_workflow_emit_event(
    coalesce(v_rec.pickup_id, v_lookup),
    'warehouse_' || v_action,
    v_event_status,
    v_message,
    'warehouse_intake',
    'warehouse',
    v_actor_code,
    v_actor_name,
    v_payload
  );

  perform public.be_workflow_notify(
    coalesce(v_rec.pickup_id, v_lookup),
    'rider',
    v_rec.assigned_rider_code,
    v_title,
    v_message,
    v_payload
  );

  perform public.be_workflow_notify(
    coalesce(v_rec.pickup_id, v_lookup),
    'supervisor',
    null,
    v_title,
    v_message,
    v_payload
  );

  if v_action in ('accepted', 'accepted_condition') then
    perform public.be_workflow_notify(
      coalesce(v_rec.pickup_id, v_lookup),
      'dispatch',
      null,
      'Warehouse intake completed',
      v_message,
      v_payload
    );

    perform public.be_workflow_notify(
      coalesce(v_rec.pickup_id, v_lookup),
      'data_entry',
      null,
      'Warehouse parcel ready for processing',
      v_message,
      v_payload
    );
  else
    perform public.be_workflow_notify(
      coalesce(v_rec.pickup_id, v_lookup),
      'customer_service',
      null,
      'Warehouse exception requires review',
      v_message,
      v_payload
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', coalesce(v_rec.pickup_id, v_lookup),
    'action', v_action,
    'status', v_event_status,
    'record', v_record
  );
end;
$$;

grant execute on function public.be_rider_pickup_action(jsonb)
to anon, authenticated, service_role;

grant execute on function public.be_warehouse_intake_action(jsonb)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
'''

MIGRATION.write_text(sql, encoding="utf-8")

print("Updated:")
print(f"  {RIDER}")
print(f"  {WAREHOUSE}")
print(f"  {MIGRATION}")
print()
print("Backups:")
print(f"  {RIDER.with_suffix('.tsx.bak-rider-warehouse')}")
print(f"  {WAREHOUSE.with_suffix('.tsx.bak-rider-warehouse')}")