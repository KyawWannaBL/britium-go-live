export type TemplateKey = "data-entry" | "portal-upload" | "warehouse";

export type TemplateSchema = {
  key: TemplateKey;
  title: string;
  description: string;
  csvFile: string;
  xlsxFile: string;
  rpc: string;
  requiredAnyOf?: string[][];
  required: string[];
  backendGenerated: string[];
  headers: string[];
};

export const GO_LIVE_TEMPLATE_SCHEMAS: TemplateSchema[] = [
  {
    key: "data-entry",
    title: "Internal Data Entry Upload",
    description: "Customer Service/Data Entry structured pickup and shipment rows. Operational IDs are backend-generated.",
    csvFile: "/templates/Britium_Data_Entry_UAT_GoLive_Template.csv",
    xlsxFile: "/templates/Britium_Data_Entry_UAT_GoLive_Template.xlsx",
    rpc: "be_go_live_bulk_data_entry_upload",
    required: [
      "Upload Action",
      "Requester Type",
      "Sender Phone",
      "Pickup Address",
      "Pickup Township",
      "Pickup City",
      "Pickup Date",
      "Pickup Parcel Count",
      "Recipient Name",
      "Recipient Phone",
      "Delivery Township",
      "Delivery Address",
      "Payment Method",
    ],
    requiredAnyOf: [["Merchant ID", "Merchant Code", "Merchant / Sender Name"]],
    backendGenerated: ["Pickup ID", "Deliver ID", "Invoice No", "Waybill No", "Upload Status", "API Message"],
    headers: [
      "Row No",
      "Upload Action",
      "Requester Type",
      "Merchant ID",
      "Merchant Code",
      "Merchant / Sender Name",
      "Sender Phone",
      "Pickup Address",
      "Pickup Township",
      "Pickup City",
      "Pickup Date",
      "Pickup Time",
      "Pickup Parcel Count",
      "Weight KG",
      "Item Value",
      "Pickup ID",
      "Deliver ID",
      "Invoice No",
      "Waybill No",
      "Recipient Name",
      "Recipient Phone",
      "Delivery Township",
      "Delivery Address",
      "Delivery Fee",
      "Extra Weight Fee",
      "Prepaid Amount",
      "COD Amount",
      "Destination",
      "Payment Method",
      "Service Type",
      "Priority",
      "Pickup By 1",
      "Pickup By 2",
      "Remarks",
      "Upload Status",
      "API Message",
      "Source Row No",
    ],
  },
  {
    key: "portal-upload",
    title: "Merchant / Customer Upload",
    description: "Self-service account-bound shipment upload. Backend restricts rows to the authenticated account.",
    csvFile: "/templates/Britium_Merchant_Customer_Upload_UAT_Template.csv",
    xlsxFile: "/templates/Britium_Merchant_Customer_Upload_UAT_Template.xlsx",
    rpc: "be_go_live_portal_account_upload",
    required: [
      "Account Type",
      "Account ID",
      "Pickup Address",
      "Pickup Township",
      "Pickup City",
      "Pickup Date",
      "Parcel Count",
      "Recipient Name",
      "Recipient Phone",
      "Delivery Township",
      "Delivery Address",
      "Payment Method",
    ],
    backendGenerated: ["Pickup ID", "Deliver ID", "Invoice No", "Waybill No", "Upload Status", "API Message"],
    headers: [
      "Account Type",
      "Account ID",
      "Account Name",
      "Contact Phone",
      "Pickup Address",
      "Pickup Township",
      "Pickup City",
      "Pickup Date",
      "Pickup Time",
      "Parcel Count",
      "Weight KG",
      "Item Value",
      "Recipient Name",
      "Recipient Phone",
      "Delivery Township",
      "Delivery Address",
      "Delivery Fee",
      "Extra Weight Fee",
      "Prepaid Amount",
      "COD Amount",
      "Payment Method",
      "Destination",
      "Service Type",
      "Priority",
      "Special Instructions",
      "Pickup ID",
      "Deliver ID",
      "Invoice No",
      "Waybill No",
      "Upload Status",
      "API Message",
    ],
  },
  {
    key: "warehouse",
    title: "Warehouse Scan / Inventory Upload",
    description: "Scan-driven intake, inventory, bagging, and exception upload linked to pickup/delivery/waybill IDs.",
    csvFile: "/templates/Britium_Warehouse_Scan_UAT_GoLive_Template.csv",
    xlsxFile: "/templates/Britium_Warehouse_Scan_UAT_GoLive_Template.xlsx",
    rpc: "be_go_live_warehouse_inventory_upload",
    required: ["Scan Date", "Scan Time", "Warehouse Branch", "Operator", "Tracking No / Waybill No", "Scan Type", "Current Status"],
    requiredAnyOf: [["Pickup ID", "Deliver ID", "Waybill No", "Tracking No / Waybill No"]],
    backendGenerated: ["Remaining Count", "Validation Status", "API Message"],
    headers: [
      "Scan Date",
      "Scan Time",
      "Warehouse Branch",
      "Operator",
      "Pickup ID",
      "Deliver ID",
      "Invoice No",
      "Waybill No",
      "Merchant ID",
      "Merchant Code",
      "Merchant Name",
      "Expected Parcel Count",
      "Scanned Parcel Count",
      "Remaining Count",
      "Tracking No / Waybill No",
      "Scan Type",
      "Current Status",
      "Next Status",
      "Bag Code",
      "Bag Destination",
      "Route / Zone",
      "Exception Reason",
      "Damage Note",
      "Missing Parcel Note",
      "Validation Status",
      "API Message",
    ],
  },
];

export const GO_LIVE_WORKFLOW_STEPS = [
  "Customer Service receives request",
  "Customer/Merchant lookup",
  "Pickup information verified",
  "Data Entry template or portal form completed",
  "Master-data auto-fill applied",
  "Pickup ID generated",
  "Deliver ID generated",
  "Invoice No generated",
  "Waybill No generated",
  "Supervisor assigns pickup",
  "Rider collects parcels",
  "Pickup proof captured",
  "Intake scan confirms Received",
  "Warehouse scan: In Warehouse / Sorting",
  "Bagging links parcel to bag",
  "Dispatch prepares route",
  "Way Management supervises movement",
  "Rider App executes delivery",
  "POD captured",
  "COD collected where applicable",
  "Delivery marked Delivered or Failed",
  "Customer Service handles exceptions / NDR",
  "COD handover completed",
  "Invoice and waybill finalized",
  "Reporting and settlement completed",
];

export const MOCK_STORAGE_KEYS = [
  "britium.mock.rows",
  "britium.mock.shipments",
  "britium.mock.pickups",
  "britium.demo.rows",
  "britium.demo.shipments",
  "mockShipments",
  "demoShipments",
  "britium.sample.shipments",
  "britium.hardcoded.rows",
  "britium.runtime.mockData",
];

export function getTemplateSchema(key: TemplateKey) {
  const schema = GO_LIVE_TEMPLATE_SCHEMAS.find((item) => item.key === key);
  if (!schema) throw new Error(`Unknown template schema: ${key}`);
  return schema;
}

export function rowsToCsv(headers: string[], rows: Record<string, unknown>[] = []) {
  const escapeCell = (value: unknown) => {
    const text = String(value ?? "");
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  return [headers.join(","), ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(","))].join("\n");
}

export function downloadCsv(schema: TemplateSchema) {
  const blob = new Blob([`\uFEFF${rowsToCsv(schema.headers)}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = schema.csvFile.split("/").pop() || `${schema.key}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

export function parseCsvText(text: string) {
  const clean = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    const next = clean[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);

  if (!rows.length) return { headers: [] as string[], rows: [] as Record<string, string>[] };

  const headers = rows[0].map((header) => header.trim());
  const records = rows.slice(1).map((values, rowIndex) => {
    const record: Record<string, string> = { "__rowNumber": String(rowIndex + 2) };
    headers.forEach((header, index) => {
      record[header] = String(values[index] ?? "").trim();
    });
    return record;
  });

  return { headers, rows: records };
}

export function validateTemplateRows(schema: TemplateSchema, parsedHeaders: string[], rows: Record<string, string>[]) {
  const missingHeaders = schema.headers.filter((header) => !parsedHeaders.includes(header));
  const rowErrors: Array<{ rowNumber: string; errors: string[] }> = [];

  rows.forEach((row) => {
    const errors: string[] = [];

    schema.required.forEach((field) => {
      if (!String(row[field] ?? "").trim()) errors.push(`${field} is required`);
    });

    (schema.requiredAnyOf || []).forEach((group) => {
      if (!group.some((field) => String(row[field] ?? "").trim())) {
        errors.push(`One of ${group.join(" / ")} is required`);
      }
    });

    schema.backendGenerated.forEach((field) => {
      if (["Pickup ID", "Deliver ID", "Invoice No", "Waybill No"].includes(field) && String(row[field] ?? "").trim()) {
        errors.push(`${field} must be blank; backend generates it`);
      }
    });

    if (isDemoLikeRow(row)) errors.push("Mock/sample/demo/test row is not allowed in UAT/go-live upload");

    if (errors.length) rowErrors.push({ rowNumber: row.__rowNumber || "-", errors });
  });

  return { missingHeaders, rowErrors, isValid: missingHeaders.length === 0 && rowErrors.length === 0 };
}

export function isDemoLikeRow(row: Record<string, unknown>) {
  const text = Object.values(row)
    .join(" ")
    .toLowerCase();
  return /\b(mock|sample|demo|dummy|test only|hardcode|lorem|john doe|jane doe)\b/.test(text);
}

export function clearLocalMockData() {
  let cleared = 0;
  MOCK_STORAGE_KEYS.forEach((key) => {
    if (localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      cleared += 1;
    }
  });
  localStorage.setItem("britium.runtime.dataMode", "production");
  localStorage.setItem("britium.goLive.mockDataClearedAt", new Date().toISOString());
  window.dispatchEvent(new CustomEvent("britium:runtime-data-mode-changed", { detail: "production" }));
  return cleared;
}

export function normalizeUploadPayload(schema: TemplateSchema, rows: Record<string, string>[]) {
  return rows.map((row, index) => ({
    source_row_no: Number(row.__rowNumber || index + 2),
    template_key: schema.key,
    payload: row,
  }));
}
