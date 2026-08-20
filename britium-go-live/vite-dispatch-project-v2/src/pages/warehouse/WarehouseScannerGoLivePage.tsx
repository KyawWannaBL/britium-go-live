// pages/warehouse/WarehouseScannerGoLivePage.tsx
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
