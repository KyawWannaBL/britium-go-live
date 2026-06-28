import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Store,
  Package,
  Clock,
  CheckCircle2,
  Banknote,
  Download,
  Plus,
  Upload,
  Printer,
  Zap,
  Search,
  RefreshCw,
  Trash2,
} from "lucide-react";

type MerchantMaster = {
  merchant_code: string;
  merchant_name: string;
  business_type?: string;
  payment_terms?: string;
  default_pickup_address?: string;
  address_line_1?: string;
  township?: string;
  city?: string;
  region_state?: string;
  zone?: string;
  branch_code?: string;
  phone_primary?: string;
  customer_tier?: string;
  base_fee?: number;
  delivery_charge?: number;
};

type TownshipMaster = {
  township: string;
  city: string;
  region_state?: string;
  zone?: string;
  branch_code?: string;
};

type MerchantTemplateRow = {
  sr: number | string;
  merchant_code?: string;
  merchant_name: string;
  merchant_address: string;
  merchant_township: string;
  merchant_city: string;
  region_state?: string;
  zone?: string;
  branch_code?: string;
  phone_number: string;
  cod_amount: number;
  total_kg: number;
  delivery_charges: number;
  extra_kg_charges: number;
  total_collected_amount: number;
};

function asText(value: any) {
  return String(value || "").trim();
}

function asKey(value: any) {
  return asText(value).toLowerCase();
}

function normalizeMerchant(row: any): MerchantMaster {
  return {
    merchant_code: row.merchant_code || row.code || row.id || "",
    merchant_name: row.merchant_name || row.name || row.display_name || "",
    business_type: row.business_type || "",
    payment_terms: row.payment_terms || "",
    default_pickup_address: row.default_pickup_address || row.address_line_1 || row.address || "",
    address_line_1: row.address_line_1 || row.address || "",
    township: row.township || row.town || "",
    city: row.city || "",
    region_state: row.region_state || row.state_region || "",
    zone: row.zone || row.assigned_zone || "",
    branch_code: row.branch_code || "",
    phone_primary: row.phone_primary || row.phone || "",
    customer_tier: row.customer_tier || row.tier || "Standard",
    base_fee: Number(row.base_fee || row.delivery_charge || row.standard_delivery_fee || 4000),
    delivery_charge: Number(row.delivery_charge || row.base_fee || row.standard_delivery_fee || 4000),
  };
}

function normalizeTownship(row: any): TownshipMaster | null {
  const township =
    row.township ||
    row.township_name ||
    row.value ||
    row.option_value ||
    row.label ||
    row.name ||
    "";

  if (!township) return null;

  const city =
    row.city ||
    row.city_name ||
    row.parent_city ||
    row.default_city ||
    (asKey(township).includes("mandalay")
      ? "Mandalay"
      : asKey(township).includes("naypyidaw") || asKey(township).includes("naypyitaw")
        ? "Naypyidaw"
        : "Yangon");

  return {
    township,
    city,
    region_state:
      row.region_state ||
      row.state_region ||
      row.region ||
      (city === "Mandalay"
        ? "Mandalay Region"
        : city === "Naypyidaw"
          ? "Naypyidaw Union Territory"
          : "Yangon Region"),
    zone: row.zone || row.zone_name || row.assigned_zone || "",
    branch_code:
      row.branch_code ||
      (city === "Mandalay" ? "MDY" : city === "Naypyidaw" ? "NPT" : "YGN"),
  };
}

function resolveBranchCode(input: { city?: string; township?: string; address?: string }) {
  const text = `${input.city || ""} ${input.township || ""} ${input.address || ""}`.toLowerCase();
  if (text.includes("mandalay")) return "MDY";
  if (text.includes("naypyidaw") || text.includes("naypyitaw") || text.includes("npt")) return "NPT";
  return "YGN";
}

async function loadMasterSnapshot() {
  try {
    const { data, error } = await (supabase as any).rpc("be_master_data_page_snapshot");
    if (error) throw error;
    return data || {};
  } catch {
    return {};
  }
}

async function loadMerchantMasters(): Promise<MerchantMaster[]> {
  const snapshot = await loadMasterSnapshot();
  const snapshotRows =
    snapshot.merchants ||
    snapshot.merchant_master ||
    snapshot.Merchant_Master ||
    snapshot.merchantMaster ||
    [];

  if (snapshotRows.length) {
    return snapshotRows
      .map(normalizeMerchant)
      .filter((row: MerchantMaster) => row.merchant_code && row.merchant_name);
  }

  for (const tableName of ["be_merchant_master", "be_master_merchants", "merchant_master"]) {
    try {
      const { data, error } = await (supabase as any).from(tableName).select("*");
      if (error) throw error;
      if (data?.length) {
        return data
          .map(normalizeMerchant)
          .filter((row: MerchantMaster) => row.merchant_code && row.merchant_name);
      }
    } catch {
      // keep trying possible merchant master table names
    }
  }

  return [];
}

async function loadTownshipMasters(): Promise<TownshipMaster[]> {
  const snapshot = await loadMasterSnapshot();
  const snapshotRows =
    snapshot.townships ||
    snapshot.township_master ||
    snapshot.Township_Master ||
    snapshot.townshipMaster ||
    [];

  const normalizedFromSnapshot = (snapshotRows || [])
    .map(normalizeTownship)
    .filter(Boolean) as TownshipMaster[];

  if (normalizedFromSnapshot.length) return dedupeTownships(normalizedFromSnapshot);

  for (const tableName of ["be_township_master", "be_master_townships", "township_master"]) {
    try {
      const { data, error } = await (supabase as any).from(tableName).select("*");
      if (error) throw error;
      const rows = (data || []).map(normalizeTownship).filter(Boolean) as TownshipMaster[];
      if (rows.length) return dedupeTownships(rows);
    } catch {
      // keep trying possible township master table names
    }
  }

  try {
    const { data, error } = await (supabase as any)
      .from("be_master_data_options")
      .select("*")
      .in("dropdown_name", ["township", "city"]);

    if (error) throw error;

    const rows = (data || [])
      .filter((row: any) => row.dropdown_name === "township")
      .map(normalizeTownship)
      .filter(Boolean) as TownshipMaster[];

    if (rows.length) return dedupeTownships(rows);
  } catch {
    // fallback below
  }

  return dedupeTownships([
    { township: "Ahlone", city: "Yangon", region_state: "Yangon Region", zone: "Yangon Central", branch_code: "YGN" },
    { township: "Bahan", city: "Yangon", region_state: "Yangon Region", zone: "Yangon Central", branch_code: "YGN" },
    { township: "Dagon", city: "Yangon", region_state: "Yangon Region", zone: "Yangon Central", branch_code: "YGN" },
    { township: "Hlaing", city: "Yangon", region_state: "Yangon Region", zone: "Yangon West", branch_code: "YGN" },
    { township: "Insein", city: "Yangon", region_state: "Yangon Region", zone: "Yangon North", branch_code: "YGN" },
    { township: "Kamayut", city: "Yangon", region_state: "Yangon Region", zone: "Yangon West", branch_code: "YGN" },
    { township: "North Dagon", city: "Yangon", region_state: "Yangon Region", zone: "Yangon East", branch_code: "YGN" },
    { township: "South Dagon", city: "Yangon", region_state: "Yangon Region", zone: "Yangon East", branch_code: "YGN" },
    { township: "Tamwe", city: "Yangon", region_state: "Yangon Region", zone: "Yangon Central", branch_code: "YGN" },
    { township: "Thaketa", city: "Yangon", region_state: "Yangon Region", zone: "Yangon East", branch_code: "YGN" },
    { township: "Thingangyun", city: "Yangon", region_state: "Yangon Region", zone: "Yangon East", branch_code: "YGN" },
    { township: "Yankin", city: "Yangon", region_state: "Yangon Region", zone: "Yangon Central", branch_code: "YGN" },
    { township: "Chan Aye Tharzan", city: "Mandalay", region_state: "Mandalay Region", zone: "Mandalay Central", branch_code: "MDY" },
    { township: "Aungmyaythazan", city: "Mandalay", region_state: "Mandalay Region", zone: "Mandalay Central", branch_code: "MDY" },
    { township: "Maha Aungmye", city: "Mandalay", region_state: "Mandalay Region", zone: "Mandalay Central", branch_code: "MDY" },
    { township: "Zabuthiri", city: "Naypyidaw", region_state: "Naypyidaw Union Territory", zone: "Upper Myanmar", branch_code: "NPT" },
    { township: "Dekkhinathiri", city: "Naypyidaw", region_state: "Naypyidaw Union Territory", zone: "Upper Myanmar", branch_code: "NPT" },
  ]);
}

function dedupeTownships(rows: TownshipMaster[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${asKey(row.township)}|${asKey(row.city)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findTownshipByInput(value: string, townships: TownshipMaster[]) {
  const search = asKey(value);
  if (!search) return undefined;

  return townships.find(
    (township) =>
      asKey(township.township) === search ||
      `${asKey(township.township)} - ${asKey(township.city)}` === search
  );
}

function findMerchantByInput(value: string, merchants: MerchantMaster[]) {
  const search = asKey(value);
  if (!search) return undefined;

  return merchants.find((merchant) => {
    const code = asKey(merchant.merchant_code);
    const name = asKey(merchant.merchant_name);
    const phone = asKey(merchant.phone_primary);
    const combined = asKey(`${merchant.merchant_code} - ${merchant.merchant_name}`);

    return code === search || name === search || phone === search || combined === search;
  });
}

function findMerchantForRow(row: any, merchants: MerchantMaster[]) {
  return (
    merchants.find((merchant) => merchant.merchant_code === row.merchant_code) ||
    findMerchantByInput(row.merchant_name, merchants) ||
    merchants.find((merchant) => merchant.phone_primary === row.phone_number)
  );
}

function createEmptyMerchantInputRow(sr: number, merchant?: MerchantMaster | null): MerchantTemplateRow {
  const deliveryCharges = Number(merchant?.delivery_charge || merchant?.base_fee || 4000);
  const township = merchant?.township || "";
  const city = merchant?.city || "";

  return {
    sr,
    merchant_code: merchant?.merchant_code || "",
    merchant_name: merchant?.merchant_name || "",
    merchant_address: merchant?.default_pickup_address || merchant?.address_line_1 || "",
    merchant_township: township,
    merchant_city: city,
    region_state: merchant?.region_state || "",
    zone: merchant?.zone || "",
    branch_code: merchant?.branch_code || resolveBranchCode({ city, township, address: merchant?.default_pickup_address || merchant?.address_line_1 }),
    phone_number: merchant?.phone_primary || "",
    cod_amount: 0,
    total_kg: 1,
    delivery_charges: deliveryCharges,
    extra_kg_charges: 0,
    total_collected_amount: deliveryCharges,
  };
}

function calculateMerchantTemplateRow(row: any, merchants: MerchantMaster[]): MerchantTemplateRow {
  const merchant = findMerchantForRow(row, merchants);
  const codAmount = Number(row.cod_amount || row["COD Amount"] || 0);
  const totalKg = Number(row.total_kg || row["Total KG"] || 0);
  const tier = merchant?.customer_tier || "Standard";
  const allowance = tier === "Royal" ? 5 : 3;
  const roundedKg = Math.ceil(Math.max(0, totalKg));
  const extraKg = Math.max(0, roundedKg - allowance);
  const deliveryCharges = Number(merchant?.delivery_charge || merchant?.base_fee || row.delivery_charges || 4000);
  const extraKgCharges = extraKg * 500;
  const township = row.merchant_township || row["Merchant Township"] || merchant?.township || "";
  const city = row.merchant_city || row["Merchant City"] || merchant?.city || "";
  const address = row.merchant_address || row["Merchant Address"] || merchant?.default_pickup_address || merchant?.address_line_1 || "";

  return {
    sr: row.sr || row["Sr."] || "",
    merchant_code: merchant?.merchant_code || row.merchant_code || "",
    merchant_name: merchant?.merchant_name || row.merchant_name || row["Merchant Name"] || "",
    merchant_address: address,
    merchant_township: township,
    merchant_city: city,
    region_state: row.region_state || merchant?.region_state || "",
    zone: row.zone || merchant?.zone || "",
    branch_code: row.branch_code || merchant?.branch_code || resolveBranchCode({ city, township, address }),
    phone_number: merchant?.phone_primary || row.phone_number || row["Phone Number"] || "",
    cod_amount: codAmount,
    total_kg: totalKg,
    delivery_charges: deliveryCharges,
    extra_kg_charges: extraKgCharges,
    total_collected_amount: codAmount + deliveryCharges + extraKgCharges,
  };
}

function calculateDirectMerchantRow(
  row: MerchantTemplateRow,
  merchants: MerchantMaster[],
  townships: TownshipMaster[],
) {
  const merchant = findMerchantForRow(row, merchants);
  const townshipMaster = findTownshipByInput(row.merchant_township, townships);
  const township = townshipMaster?.township || merchant?.township || row.merchant_township || "";
  const city = townshipMaster?.city || merchant?.city || row.merchant_city || "";
  const address = merchant?.default_pickup_address || merchant?.address_line_1 || row.merchant_address || "";
  const deliveryCharges = Number(merchant?.delivery_charge || merchant?.base_fee || row.delivery_charges || 4000);
  const codAmount = Number(row.cod_amount || 0);
  const totalKg = Number(row.total_kg || 0);
  const tier = merchant?.customer_tier || "Standard";
  const allowance = tier === "Royal" ? 5 : 3;
  const chargeableKg = Math.ceil(Math.max(0, totalKg));
  const extraKg = Math.max(0, chargeableKg - allowance);
  const extraKgCharges = extraKg * 500;

  return {
    ...row,
    merchant_code: merchant?.merchant_code || row.merchant_code || "",
    merchant_name: merchant?.merchant_name || row.merchant_name || "",
    merchant_address: address,
    merchant_township: township,
    merchant_city: city,
    region_state: townshipMaster?.region_state || merchant?.region_state || row.region_state || "",
    zone: townshipMaster?.zone || merchant?.zone || row.zone || "",
    branch_code:
      townshipMaster?.branch_code ||
      merchant?.branch_code ||
      row.branch_code ||
      resolveBranchCode({ city, township, address }),
    phone_number: merchant?.phone_primary || row.phone_number || "",
    cod_amount: codAmount,
    total_kg: totalKg,
    delivery_charges: deliveryCharges,
    extra_kg_charges: extraKgCharges,
    total_collected_amount: codAmount + deliveryCharges + extraKgCharges,
  };
}

function parseSimpleCsv(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((item) => item.trim().replace(/^"|"$/g, ""));

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((item) => item.trim().replace(/^"|"$/g, ""));
    return headers.reduce((acc: any, header, index) => {
      const key = header
        .toLowerCase()
        .replace(/\./g, "")
        .replace(/\s+/g, "_")
        .replace(/-/g, "_");
      acc[key] = values[index] || "";
      return acc;
    }, {});
  });
}

function downloadCsv(rows: any[], fileName: string) {
  const headers = Object.keys(rows[0] || {});
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => `"${String(row[header] ?? "").replaceAll('"', '""')}"`)
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function isValidPhone(phone: string) {
  return /^09\d{6,9}$/.test(asText(phone));
}

export default function MerchantPortalPage() {
  const { t } = useLanguage();
  const [shipments, setShipments] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<MerchantMaster[]>([]);
  const [townships, setTownships] = useState<TownshipMaster[]>([]);
  const [currentMerchant, setCurrentMerchant] = useState<MerchantMaster | null>(null);
  const [templateRows, setTemplateRows] = useState<MerchantTemplateRow[]>([]);
  const [directRows, setDirectRows] = useState<MerchantTemplateRow[]>([]);
  const [submittingDirectRows, setSubmittingDirectRows] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const templateFileRef = useRef<HTMLInputElement | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [merchantRows, townshipRows] = await Promise.all([
        loadMerchantMasters(),
        loadTownshipMasters(),
      ]);

      setMerchants(merchantRows);
      setTownships(townshipRows);

      const { data: authData } = await (supabase as any).auth.getUser();
      const userMetadata = authData?.user?.user_metadata || {};
      const merchantCode = userMetadata.merchant_code || userMetadata.merchantCode || "";
      const merchantName = userMetadata.merchant_name || userMetadata.merchantName || "";

      const resolvedMerchant =
        merchantRows.find((m) => m.merchant_code === merchantCode) ||
        merchantRows.find((m) => m.merchant_name === merchantName) ||
        merchantRows[0] ||
        null;

      setCurrentMerchant(resolvedMerchant);

      let query = (supabase as any)
        .from("be_portal_pickup_request_items")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (merchantCode) query = query.eq("merchant_code", merchantCode);
      else if (resolvedMerchant?.merchant_code) query = query.eq("merchant_code", resolvedMerchant.merchant_code);

      const { data, error } = await query;
      if (error) throw error;

      setShipments(data || []);
    } catch {
      setShipments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (directRows.length === 0) {
      setDirectRows([createEmptyMerchantInputRow(1, currentMerchant)]);
    }
  }, [currentMerchant]);

  const filtered = shipments.filter(r =>
    !search ||
    asText(r.waybill_no).toLowerCase().includes(search.toLowerCase()) ||
    asText(r.recipient_name).toLowerCase().includes(search.toLowerCase()) ||
    asText(r.merchant_name).toLowerCase().includes(search.toLowerCase())
  );

  const kpis = {
    active: shipments.filter(s => !["DELIVERED", "FAILED", "RETURNED", "RETURNED_TO_SENDER"].includes(String(s.item_status).toUpperCase())).length,
    pending: shipments.filter(s => ["PENDING", "PICKUP_REQUESTED", "PICKUP_ASSIGNED"].includes(String(s.item_status).toUpperCase())).length,
    delivered: shipments.filter(s => String(s.item_status).toUpperCase() === "DELIVERED").length,
    codPending: shipments.filter(s => s.item_status === "DELIVERED").reduce((acc, curr) => acc + (Number(curr.cod_amount) || 0), 0)
  };

  const downloadWaybills = () => {
    const rows = filtered.map((row) => ({
      waybill_no: row.waybill_no || "",
      created_at: row.created_at || "",
      merchant_name: row.merchant_name || "",
      recipient_name: row.recipient_name || "",
      delivery_township: row.delivery_township || "",
      cod_amount: row.cod_amount || 0,
      item_status: row.item_status || "PENDING",
    }));

    if (!rows.length) {
      alert(t("No waybills available to download.", "ရယူရန် စာရွက်မရှိပါ။"));
      return;
    }

    downloadCsv(rows, "britium_merchant_waybills.csv");
  };

  const downloadMerchantTemplate = () => {
    const link = document.createElement("a");
    link.href = "/templates/Britium_Merchant_Web_Template.xlsx";
    link.download = "Britium_Merchant_Web_Template.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTemplateUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);

    try {
      const extension = file.name.split(".").pop()?.toLowerCase();

      if (extension === "csv") {
        const text = await file.text();
        const parsedRows = parseSimpleCsv(text)
          .map((row) => calculateMerchantTemplateRow(row, merchants))
          .filter((row) => row.merchant_name && row.phone_number);

        setTemplateRows(parsedRows);

        const { error } = await (supabase as any).rpc("be_submit_merchant_template_rows", {
          p_rows: parsedRows,
          p_source_channel: "MERCHANT_PORTAL",
          p_merchant_code: currentMerchant?.merchant_code || null,
        });

        if (error) throw error;
      } else {
        const filePath = `merchant-template-imports/${currentMerchant?.merchant_code || "merchant"}/${Date.now()}-${file.name}`;

        const { error: uploadError } = await (supabase as any).storage
          .from("merchant-imports")
          .upload(filePath, file, { upsert: false });

        if (uploadError) throw uploadError;

        const { error } = await (supabase as any).rpc("be_register_merchant_template_upload", {
          p_file_path: filePath,
          p_file_name: file.name,
          p_source_channel: "MERCHANT_PORTAL",
          p_merchant_code: currentMerchant?.merchant_code || null,
        });

        if (error) throw error;
      }

      alert(t("Merchant template uploaded successfully.", "Merchant Template တင်ခြင်း အောင်မြင်ပါသည်။"));
      loadData();
    } catch (error: any) {
      alert(error?.message || t("Merchant template upload failed.", "Merchant Template တင်ခြင်း မအောင်မြင်ပါ။"));
    } finally {
      setUploading(false);
      if (templateFileRef.current) templateFileRef.current.value = "";
    }
  };

  const patchDirectRow = (index: number, field: keyof MerchantTemplateRow, value: any) => {
    setDirectRows((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row;

        const nextRow = {
          ...row,
          [field]: field === "cod_amount" || field === "total_kg" ? Number(value || 0) : value,
        };

        return calculateDirectMerchantRow(nextRow, merchants, townships);
      }),
    );
  };

  const handleDirectMerchantSelect = (index: number, value: string) => {
    const merchant = findMerchantByInput(value, merchants);

    setDirectRows((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row;

        const patchedRow: MerchantTemplateRow = {
          ...row,
          merchant_code: merchant?.merchant_code || row.merchant_code || "",
          merchant_name: merchant?.merchant_name || value,
          merchant_address: merchant?.default_pickup_address || merchant?.address_line_1 || row.merchant_address || "",
          merchant_township: merchant?.township || row.merchant_township || "",
          merchant_city: merchant?.city || row.merchant_city || "",
          region_state: merchant?.region_state || row.region_state || "",
          zone: merchant?.zone || row.zone || "",
          branch_code: merchant?.branch_code || row.branch_code || "",
          phone_number: merchant?.phone_primary || row.phone_number || "",
          delivery_charges: Number(merchant?.delivery_charge || merchant?.base_fee || row.delivery_charges || 4000),
        };

        return calculateDirectMerchantRow(patchedRow, merchants, townships);
      }),
    );
  };

  const handleDirectTownshipSelect = (index: number, value: string) => {
    const township = findTownshipByInput(value, townships);

    setDirectRows((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row;

        const patchedRow = {
          ...row,
          merchant_township: township?.township || value,
          merchant_city: township?.city || row.merchant_city,
          region_state: township?.region_state || row.region_state,
          zone: township?.zone || row.zone,
          branch_code: township?.branch_code || row.branch_code,
        };

        return calculateDirectMerchantRow(patchedRow, merchants, townships);
      }),
    );
  };

  const handleDirectCitySelect = (index: number, value: string) => {
    setDirectRows((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const patchedRow = { ...row, merchant_city: value };
        return calculateDirectMerchantRow(patchedRow, merchants, townships);
      }),
    );
  };

  const addDirectRow = () => {
    setDirectRows((prev) => [
      ...prev,
      createEmptyMerchantInputRow(prev.length + 1, currentMerchant),
    ]);
  };

  const removeDirectRow = (index: number) => {
    setDirectRows((prev) =>
      prev
        .filter((_, rowIndex) => rowIndex !== index)
        .map((row, rowIndex) => ({ ...row, sr: rowIndex + 1 })),
    );
  };

  const clearDirectRows = () => {
    setDirectRows([createEmptyMerchantInputRow(1, currentMerchant)]);
  };

  const submitDirectInputRows = async () => {
    const rows = directRows
      .map((row) => calculateDirectMerchantRow(row, merchants, townships))
      .filter((row) => row.merchant_name && row.phone_number && row.cod_amount >= 0 && row.total_kg > 0);

    if (!rows.length) {
      alert(t("Please enter at least one valid merchant row.", "အနည်းဆုံး Row တစ်ကြောင်း ဖြည့်ရန်လိုအပ်ပါသည်။"));
      return;
    }

    const invalidRow = rows.find(
      (row) =>
        !row.merchant_name ||
        !row.merchant_address ||
        !row.merchant_township ||
        !row.merchant_city ||
        !row.phone_number ||
        !isValidPhone(row.phone_number)
    );

    if (invalidRow) {
      alert(
        t(
          "Merchant name, address, township, city, and valid 09 phone number are required.",
          "Merchant Name, Address, Township, City နှင့် 09 ဖြင့်စသော Phone ဖြည့်ရန်လိုအပ်ပါသည်။",
        ),
      );
      return;
    }

    setSubmittingDirectRows(true);

    try {
      const groups = rows.reduce<Record<string, MerchantTemplateRow[]>>((acc, row) => {
        const key = row.merchant_code || row.merchant_name || row.phone_number;
        acc[key] = acc[key] || [];
        acc[key].push(row);
        return acc;
      }, {});

      for (const groupRows of Object.values(groups)) {
        const firstRow = groupRows[0];
        const merchant =
          merchants.find((m) => m.merchant_code === firstRow.merchant_code) ||
          merchants.find((m) => m.merchant_name === firstRow.merchant_name);

        const payload = {
          source_channel: "MERCHANT_PORTAL",
          merchant_code: firstRow.merchant_code || merchant?.merchant_code || null,
          merchant_name: firstRow.merchant_name,
          business_type: merchant?.business_type || null,
          payment_terms: merchant?.payment_terms || "COD",
          contact_person: firstRow.merchant_name,
          phone_primary: firstRow.phone_number,
          pickup_address: firstRow.merchant_address,
          township: firstRow.merchant_township,
          city: firstRow.merchant_city,
          region_state: firstRow.region_state || merchant?.region_state || null,
          zone: firstRow.zone || merchant?.zone || null,
          branch_code: firstRow.branch_code || resolveBranchCode({
            city: firstRow.merchant_city,
            township: firstRow.merchant_township,
            address: firstRow.merchant_address,
          }),
          expected_parcels: groupRows.length,
          request_status: "PICKUP_REQUESTED",
          pickup_status: "Draft",
          items: groupRows.map((row) => ({
            sr: row.sr,
            merchant_code: row.merchant_code || null,
            merchant_name: row.merchant_name,
            merchant_address: row.merchant_address,
            merchant_township: row.merchant_township,
            merchant_city: row.merchant_city,
            phone_number: row.phone_number,
            cod_amount: row.cod_amount,
            total_kg: row.total_kg,
            delivery_charges: row.delivery_charges,
            extra_kg_charges: row.extra_kg_charges,
            total_collected_amount: row.total_collected_amount,
            branch_code: row.branch_code || null,
            item_status: "PICKUP_REQUESTED",
          })),
        };

        try {
          const { error } = await (supabase as any).rpc("be_submit_pickup_request", {
            p_source_channel: "MERCHANT_PORTAL",
            p_payload: payload,
          });

          if (error) throw error;
        } catch {
          const { error } = await (supabase as any).rpc("be_submit_merchant_template_rows", {
            p_rows: groupRows,
            p_source_channel: "MERCHANT_PORTAL",
            p_merchant_code: firstRow.merchant_code || merchant?.merchant_code || null,
          });

          if (error) throw error;
        }
      }

      alert(t("Direct merchant entries submitted successfully.", "Merchant Direct Entry တင်ခြင်း အောင်မြင်ပါသည်။"));
      clearDirectRows();
      loadData();
    } catch (error: any) {
      alert(error?.message || t("Direct input submit failed.", "Direct Input တင်ခြင်း မအောင်မြင်ပါ။"));
    } finally {
      setSubmittingDirectRows(false);
    }
  };

  const requestUrgentPickup = async () => {
    if (!currentMerchant) {
      alert(t("Merchant master record is required before pickup request.", "Merchant Master လိုအပ်ပါသည်။"));
      return;
    }

    try {
      const payload = {
        source_channel: "MERCHANT_PORTAL",
        merchant_code: currentMerchant.merchant_code,
        merchant_name: currentMerchant.merchant_name,
        business_type: currentMerchant.business_type || null,
        payment_terms: currentMerchant.payment_terms || null,
        contact_person: currentMerchant.merchant_name,
        phone_primary: currentMerchant.phone_primary || null,
        pickup_address: currentMerchant.default_pickup_address || currentMerchant.address_line_1 || null,
        township: currentMerchant.township || null,
        city: currentMerchant.city || null,
        region_state: currentMerchant.region_state || null,
        zone: currentMerchant.zone || null,
        branch_code: currentMerchant.branch_code || resolveBranchCode({
          city: currentMerchant.city,
          township: currentMerchant.township,
          address: currentMerchant.default_pickup_address || currentMerchant.address_line_1,
        }),
        expected_parcels: 1,
        request_status: "PICKUP_REQUESTED",
        pickup_status: "Draft",
      };

      const { error } = await (supabase as any).rpc("be_submit_pickup_request", {
        p_source_channel: "MERCHANT_PORTAL",
        p_payload: payload,
      });

      if (error) throw error;

      alert(t("Urgent pickup request submitted.", "အရေးပေါ် Pickup Request တင်ပြီးပါပြီ။"));
      loadData();
    } catch (error: any) {
      alert(error?.message || t("Urgent pickup request failed.", "အရေးပေါ် Pickup Request မအောင်မြင်ပါ။"));
    }
  };

  const cityOptions = Array.from(new Set(townships.map((item) => item.city).filter(Boolean)));

  return (
    <div className="min-h-screen bg-[#061524] p-6 md:p-8 text-[#eef8ff] font-['Inter','Pyidaungsu'] notranslate" translate="no">
      <div className="mx-auto max-w-[1600px] space-y-6">

        {/* HEADER */}
        <header className="rounded-[2rem] border border-[#1a3a5c] bg-[#0b2236] p-8 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#f6b84b]/30 bg-[#f6b84b]/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#f6b84b] mb-3">
              <Store className="h-3.5 w-3.5" />
              <span>{t("Merchant Portal", "ကုန်သည် ဝန်ဆောင်မှုစနစ်")}</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white m-0"><span>{t("Welcome, Merchant", "မင်္ဂလာပါ ကုန်သည်")}</span></h1>
            {currentMerchant && (
              <p className="text-[12px] text-[#4d7a9b] mt-2 m-0">
                <span>{currentMerchant.merchant_code} — {currentMerchant.merchant_name}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={downloadWaybills} className="flex h-12 items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#081b2e] hover:bg-[#1a3a5c] px-5 text-[12px] font-black uppercase tracking-wider text-[#c8dff0] transition-colors cursor-pointer">
              <Download size={16} /> <span>{t("Download Waybills", "စာရွက်များ ရယူမည်")}</span>
            </button>
            <button onClick={downloadMerchantTemplate} className="flex h-12 items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#081b2e] hover:bg-[#1a3a5c] px-5 text-[12px] font-black uppercase tracking-wider text-[#c8dff0] transition-colors cursor-pointer">
              <Download size={16} /> <span>{t("Download Template", "Template ရယူမည်")}</span>
            </button>
            <button onClick={() => templateFileRef.current?.click()} className="flex h-12 items-center gap-2 rounded-xl bg-[#22c55e] hover:bg-[#1ea34d] px-6 text-[12px] font-black uppercase tracking-wider text-[#061524] transition-colors shadow-lg shadow-[#22c55e]/10 cursor-pointer">
              <Plus size={16} /> <span>{uploading ? t("Uploading...", "တင်နေသည်...") : t("Upload Excel", "Excel တင်မည်")}</span>
            </button>
            <input ref={templateFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => handleTemplateUpload(e.target.files?.[0] || null)} />
          </div>
        </header>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard title={t("Active Shipments", "ပို့ဆောင်ဆဲ")} value={kpis.active} icon={Package} color="#38bdf8" />
          <KpiCard title={t("Pending Pickups", "ပစ္စည်းလာယူရန် စောင့်ဆိုင်းဆဲ")} value={kpis.pending} icon={Clock} color="#f6b84b" />
          <KpiCard title={t("Delivered", "ပို့ဆောင်ပြီး")} value={kpis.delivered} icon={CheckCircle2} color="#22c55e" />
          <KpiCard title={t("COD Pending (MMK)", "ရရန်ရှိသော ငွေ")} value={kpis.codPending.toLocaleString()} icon={Banknote} color="#a855f7" isMono />
        </div>

        {/* QUICK ACTIONS */}
        <section className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#4d7a9b] mb-4"><span>{t("Quick Actions", "အမြန်လုပ်ဆောင်မှုများ")}</span></p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => templateFileRef.current?.click()} className="flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#061524] px-5 py-3 text-[12px] font-bold text-white hover:border-[#f6b84b] transition-colors cursor-pointer">
              <Upload size={16} className="text-[#38bdf8]" /> <span>{t("Bulk Excel Upload", "Excel ဖြင့် အစုလိုက်တင်မည်")}</span>
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#061524] px-5 py-3 text-[12px] font-bold text-white hover:border-[#f6b84b] transition-colors cursor-pointer">
              <Printer size={16} className="text-[#f6b84b]" /> <span>{t("Print Manifest", "စာရင်းထုတ်မည်")}</span>
            </button>
            <button onClick={requestUrgentPickup} className="flex items-center gap-2 rounded-xl bg-[#38bdf8] text-[#061524] px-5 py-3 text-[12px] font-black uppercase hover:bg-[#0284c7] transition-colors cursor-pointer">
              <Zap size={16} /> <span>{t("Request Urgent Pickup", "အရေးပေါ် လာယူရန် တောင်းဆိုမည်")}</span>
            </button>
          </div>
        </section>

        {/* MERCHANT DIRECT INPUT WEB TEMPLATE */}
        <section className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl shadow-xl overflow-hidden">
          <div className="p-6 border-b border-[#1a3a5c] bg-[#081b2e] flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div>
              <h2 className="text-[16px] font-bold text-white m-0">
                <span>{t("Direct Input Web Template", "Direct Input Web Template")}</span>
              </h2>
              <p className="text-[11px] text-[#4d7a9b] mt-2 m-0">
                <span>
                  {t(
                    "Type or select merchant name to auto-fill code, address, township, city, and phone. Enter COD amount and total KG only; charges are calculated by the system.",
                    "Merchant Name ရွေးချယ်ပါက Code, Address, Township, City, Phone ကို စနစ်မှ ဖြည့်ပေးမည်။ COD Amount နှင့် Total KG ကိုသာ ဖြည့်ပါ။",
                  )}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button onClick={downloadMerchantTemplate} className="flex h-11 items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#061524] px-5 text-[12px] font-bold text-white hover:border-[#f6b84b] transition-colors cursor-pointer">
                <Download size={16} className="text-[#f6b84b]" />
                <span>{t("Download Excel Template", "Excel Template ရယူမည်")}</span>
              </button>

              <button onClick={() => templateFileRef.current?.click()} className="flex h-11 items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#061524] px-5 text-[12px] font-bold text-white hover:border-[#f6b84b] transition-colors cursor-pointer">
                <Upload size={16} className="text-[#38bdf8]" />
                <span>{t("Upload Excel", "Excel တင်မည်")}</span>
              </button>

              <button onClick={addDirectRow} className="flex h-11 items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#061524] px-5 text-[12px] font-bold text-white hover:border-[#22c55e] transition-colors cursor-pointer">
                <Plus size={16} className="text-[#22c55e]" />
                <span>{t("Add Row", "Row ထည့်မည်")}</span>
              </button>
            </div>
          </div>

          <datalist id="merchant-direct-options">
            {merchants.map((merchant) => (
              <option
                key={merchant.merchant_code}
                value={`${merchant.merchant_code} - ${merchant.merchant_name}`}
              />
            ))}
          </datalist>

          <datalist id="township-master-options">
            {townships.map((township) => (
              <option
                key={`${township.township}-${township.city}`}
                value={township.township}
              />
            ))}
          </datalist>

          <datalist id="city-master-options">
            {cityOptions.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>

          <div className="overflow-x-auto bg-[#061524]">
            <table className="w-full text-left border-collapse min-w-[1500px]">
              <thead className="bg-[#081b2e]">
                <tr>
                  {[
                    "Sr.",
                    "Merchant Name",
                    "Merchant Code",
                    "Merchant Address",
                    "Township",
                    "City",
                    "Phone Number",
                    "COD Amount",
                    "Total KG",
                    "Delivery Charges",
                    "Extra-KG Charges",
                    "Total Collected Amount",
                    "Action",
                  ].map((header) => (
                    <th key={header} className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]">
                      <span>{header}</span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {directRows.map((row, index) => (
                  <tr key={index} className="hover:bg-[#1a3a5c]/30 transition-colors border-b border-[#1a3a5c]/50">
                    <td className="p-3 font-mono text-[#c8dff0] text-[12px]">
                      <span>{row.sr}</span>
                    </td>

                    <td className="p-3 min-w-[240px]">
                      <input
                        list="merchant-direct-options"
                        value={row.merchant_name}
                        onChange={(e) => handleDirectMerchantSelect(index, e.target.value)}
                        placeholder={t("Type merchant name...", "Merchant Name ရိုက်ပါ...")}
                        className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 px-4 text-[13px] outline-none focus:border-[#f6b84b]"
                      />
                    </td>

                    <td className="p-3 min-w-[140px]">
                      <input
                        value={row.merchant_code || ""}
                        readOnly
                        className="w-full bg-[#081b2e] border border-[#1a3a5c] text-[#4d7a9b] rounded-xl py-3 px-4 text-[13px] outline-none cursor-not-allowed"
                      />
                    </td>

                    <td className="p-3 min-w-[260px]">
                      <input
                        value={row.merchant_address}
                        onChange={(e) => patchDirectRow(index, "merchant_address", e.target.value)}
                        className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 px-4 text-[13px] outline-none focus:border-[#f6b84b]"
                      />
                    </td>

                    <td className="p-3 min-w-[170px]">
                      <input
                        list="township-master-options"
                        value={row.merchant_township}
                        onChange={(e) => handleDirectTownshipSelect(index, e.target.value)}
                        placeholder={t("Type township...", "မြို့နယ် ရိုက်ပါ...")}
                        className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 px-4 text-[13px] outline-none focus:border-[#f6b84b]"
                      />
                    </td>

                    <td className="p-3 min-w-[150px]">
                      <input
                        list="city-master-options"
                        value={row.merchant_city}
                        onChange={(e) => handleDirectCitySelect(index, e.target.value)}
                        className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 px-4 text-[13px] outline-none focus:border-[#f6b84b]"
                      />
                    </td>

                    <td className="p-3 min-w-[160px]">
                      <input
                        value={row.phone_number}
                        onChange={(e) => patchDirectRow(index, "phone_number", e.target.value)}
                        placeholder="09xxxxxxxxx"
                        className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 px-4 text-[13px] outline-none focus:border-[#f6b84b]"
                      />
                    </td>

                    <td className="p-3 min-w-[140px]">
                      <input
                        type="number"
                        min="0"
                        value={row.cod_amount}
                        onChange={(e) => patchDirectRow(index, "cod_amount", e.target.value)}
                        className="w-full bg-[#061524] border border-[#1a3a5c] text-[#f6b84b] rounded-xl py-3 px-4 text-[13px] font-mono outline-none focus:border-[#f6b84b]"
                      />
                    </td>

                    <td className="p-3 min-w-[120px]">
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={row.total_kg}
                        onChange={(e) => patchDirectRow(index, "total_kg", e.target.value)}
                        className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 px-4 text-[13px] font-mono outline-none focus:border-[#f6b84b]"
                      />
                    </td>

                    <td className="p-3 min-w-[150px]">
                      <input
                        value={Number(row.delivery_charges || 0).toLocaleString()}
                        readOnly
                        className="w-full bg-[#081b2e] border border-[#1a3a5c] text-[#f6b84b] rounded-xl py-3 px-4 text-[13px] font-mono outline-none cursor-not-allowed"
                      />
                    </td>

                    <td className="p-3 min-w-[150px]">
                      <input
                        value={Number(row.extra_kg_charges || 0).toLocaleString()}
                        readOnly
                        className="w-full bg-[#081b2e] border border-[#1a3a5c] text-[#f6b84b] rounded-xl py-3 px-4 text-[13px] font-mono outline-none cursor-not-allowed"
                      />
                    </td>

                    <td className="p-3 min-w-[180px]">
                      <input
                        value={Number(row.total_collected_amount || 0).toLocaleString()}
                        readOnly
                        className="w-full bg-[#081b2e] border border-[#1a3a5c] text-[#22c55e] rounded-xl py-3 px-4 text-[13px] font-mono font-black outline-none cursor-not-allowed"
                      />
                    </td>

                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => removeDirectRow(index)}
                        disabled={directRows.length === 1}
                        className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-[12px] font-bold text-[#ff4d8d] hover:border-[#ff4d8d] transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-6 border-t border-[#1a3a5c] bg-[#081b2e] flex flex-col md:flex-row justify-between gap-4">
            <div className="text-[11px] text-[#4d7a9b] leading-relaxed">
              <p className="m-0">
                <span>
                  {t(
                    "Calculation: Standard allowance 3kg, Royal allowance 5kg, extra kg charge 500 MMK, total collected = COD + delivery + extra-kg charges.",
                    "တွက်ချက်မှု: Standard 3kg, Royal 5kg, Extra KG 500 MMK, Total = COD + Delivery + Extra KG Charges",
                  )}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap gap-3 justify-end">
              <button
                type="button"
                onClick={clearDirectRows}
                className="flex h-12 items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#061524] px-5 text-[12px] font-bold text-white hover:border-[#f6b84b] transition-colors cursor-pointer"
              >
                <span>{t("Clear", "ရှင်းမည်")}</span>
              </button>

              <button
                type="button"
                onClick={submitDirectInputRows}
                disabled={submittingDirectRows}
                className="flex h-12 items-center gap-2 rounded-xl bg-[#22c55e] hover:bg-[#1ea34d] px-6 text-[12px] font-black uppercase tracking-wider text-[#061524] transition-colors shadow-lg shadow-[#22c55e]/10 cursor-pointer disabled:opacity-60"
              >
                <Plus size={16} />
                <span>
                  {submittingDirectRows
                    ? t("Submitting...", "တင်နေသည်...")
                    : t("Submit Direct Entries", "Direct Entries တင်မည်")}
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* UPLOADED TEMPLATE PREVIEW */}
        <section className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl shadow-xl overflow-hidden">
          <div className="p-6 border-b border-[#1a3a5c] bg-[#081b2e] flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div>
              <h2 className="text-[16px] font-bold text-white m-0"><span>{t("Uploaded Template Preview", "တင်ထားသော Template Preview")}</span></h2>
              <p className="text-[11px] text-[#4d7a9b] mt-2 m-0">
                <span>{t("CSV preview shows calculated charges. Excel uploads are registered for backend import.", "CSV Preview တွင် တွက်ချက်ထားသော Charges ကိုပြပါမည်။ Excel ကို Backend Import အတွက် မှတ်တမ်းတင်ပါမည်။")}</span>
              </p>
            </div>
          </div>

          <div className="overflow-x-auto bg-[#061524]">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead className="bg-[#081b2e]">
                <tr>
                  {["Sr.", "Merchant Name", "Merchant Address", "Merchant Township", "Merchant City", "Phone Number", "COD Amount", "Total KG", "Delivery Charges", "Extra-KG Charges", "Total Collected Amount"].map((header) => (
                    <th key={header} className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]">
                      <span>{header}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {templateRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-10 text-center text-[#4d7a9b] font-medium">
                      <span>{t("Upload a CSV template to preview calculated charges here.", "CSV Template တင်ပြီး တွက်ချက်ထားသော Charges ကို ကြည့်နိုင်ပါသည်။")}</span>
                    </td>
                  </tr>
                ) : templateRows.slice(0, 10).map((row, index) => (
                  <tr key={`${row.sr}-${index}`} className="hover:bg-[#1a3a5c]/30 transition-colors border-b border-[#1a3a5c]/50">
                    <td className="p-4 font-mono text-[#c8dff0] text-[12px]"><span>{row.sr}</span></td>
                    <td className="p-4 font-bold text-white text-[13px]"><span>{row.merchant_name}</span></td>
                    <td className="p-4 text-[#c8dff0] text-[12px]"><span>{row.merchant_address}</span></td>
                    <td className="p-4 text-[#c8dff0] text-[12px]"><span>{row.merchant_township}</span></td>
                    <td className="p-4 text-[#c8dff0] text-[12px]"><span>{row.merchant_city}</span></td>
                    <td className="p-4 font-mono text-[#c8dff0] text-[12px]"><span>{row.phone_number}</span></td>
                    <td className="p-4 font-mono text-[#f6b84b] text-[12px]"><span>{row.cod_amount.toLocaleString()}</span></td>
                    <td className="p-4 font-mono text-[#c8dff0] text-[12px]"><span>{row.total_kg}</span></td>
                    <td className="p-4 font-mono text-[#f6b84b] text-[12px]"><span>{row.delivery_charges.toLocaleString()}</span></td>
                    <td className="p-4 font-mono text-[#f6b84b] text-[12px]"><span>{row.extra_kg_charges.toLocaleString()}</span></td>
                    <td className="p-4 font-mono font-black text-[#22c55e] text-[12px]"><span>{row.total_collected_amount.toLocaleString()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* DATA TABLE */}
        <section className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl shadow-xl overflow-hidden min-h-[500px] flex flex-col">
          <div className="p-6 border-b border-[#1a3a5c] bg-[#081b2e] flex flex-col md:flex-row gap-4 justify-between items-center">
            <h2 className="text-[16px] font-bold text-white m-0"><span>{t("Recent Shipments", "မကြာသေးမီက အော်ဒါများ")}</span></h2>
            <div className="relative w-full md:w-[350px]">
              <Search size={16} className="absolute left-4 top-3.5 text-[#4d7a9b]" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search Tracking ID or Recipient...", "ရှာဖွေရန်...")}
                className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 pl-11 pr-4 text-[13px] outline-none focus:border-[#f6b84b]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-x-auto bg-[#061524]">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="bg-[#081b2e] sticky top-0 shadow-sm z-10">
                <tr>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t("Tracking ID", "စာရွက်အမှတ်")}</span></th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t("Date", "ရက်စွဲ")}</span></th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t("Recipient", "လက်ခံမည့်သူ")}</span></th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t("Zone", "မြို့နယ်ဇုန်")}</span></th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c] text-right"><span>{t("COD (MMK)", "ကောက်ခံငွေ")}</span></th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t("Status", "အခြေအနေ")}</span></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="p-16 text-center text-[#4d7a9b]"><RefreshCw className="animate-spin mx-auto" size={24}/></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="p-16 text-center text-[#4d7a9b] font-medium"><span>{t("No shipments found.", "မှတ်တမ်းများ မရှိပါ။")}</span></td></tr>
                ) : filtered.map((row) => (
                  <tr key={row.id || row.waybill_no} className="hover:bg-[#1a3a5c]/30 transition-colors border-b border-[#1a3a5c]/50">
                    <td className="p-4 font-mono font-black text-[#38bdf8] text-[13px]"><span>{row.waybill_no || row.pickup_id || "-"}</span></td>
                    <td className="p-4 text-[#c8dff0] text-[12px]"><span>{row.created_at ? new Date(row.created_at).toLocaleDateString() : "-"}</span></td>
                    <td className="p-4 font-bold text-white text-[13px]"><span>{row.recipient_name || row.merchant_name || "-"}</span></td>
                    <td className="p-4 font-medium text-[#c8dff0] text-[13px]"><span>{row.delivery_township || row.township || "-"}</span></td>
                    <td className="p-4 font-mono font-bold text-[#f6b84b] text-[13px] text-right"><span>{Number(row.cod_amount || 0).toLocaleString()}</span></td>
                    <td className="p-4">
                      <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border border-[#1a3a5c] bg-[#061524] ${row.item_status === "DELIVERED" ? "text-[#22c55e]" : "text-[#4d7a9b]"}`}>
                        <span>{String(row.item_status || "PENDING").replace(/_/g, " ")}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, color, isMono }: any) {
  return (
    <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl shadow-lg relative overflow-hidden group">
      <div className="absolute -right-4 -top-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
        <Icon size={100} color={color} />
      </div>
      <div className="flex items-center justify-between mb-3 relative z-10">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#4d7a9b]"><span>{title}</span></span>
        <Icon size={16} color={color} />
      </div>
      <div className={`text-3xl font-black relative z-10 ${isMono ? "font-mono" : ""}`} style={{ color }}><span>{value}</span></div>
    </div>
  );
}
