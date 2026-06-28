export type ModuleKey = "data_entry" | "warehouse";

export type TemplateDefinition = {
  id: string;
  modules: ModuleKey[];
  titleEn: string;
  titleMm: string;
  descriptionEn: string;
  descriptionMm: string;
  sheetName: string;
  sourceType: string;
  headers: string[];
};

export const DATA_SOURCES = [
  { id: "customer_service", en: "Customer Service Portal", mm: "Customer Service Portal" },
  { id: "merchant_portal", en: "Merchant Portal", mm: "Merchant Portal" },
  { id: "customer_portal", en: "Customer Portal", mm: "Customer Portal" },
  { id: "manual_excel", en: "Manual Excel / CSV Upload", mm: "Excel / CSV တင်သွင်းခြင်း" },
  { id: "warehouse_scan", en: "Warehouse Scan / Intake", mm: "ဂိုဒေါင် Scan / Intake" },
  { id: "dispatch_manifest", en: "Dispatch Manifest", mm: "Dispatch Manifest" },
  { id: "rider_app", en: "Rider App", mm: "Rider App" },
  { id: "finance", en: "Finance / COD", mm: "Finance / COD" }
];

export const BRANCHES = ["HQ", "YGN", "MDY", "NPT", "YGN-MAIN", "YGN-NORTH", "YGN-EAST", "MDY-MAIN", "NPT-MAIN"];

export const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    id: "manifest",
    modules: ["data_entry"],
    titleEn: "Manifest Import Template",
    titleMm: "Manifest Import Template",
    descriptionEn: "Matches attached manifest.xlsx format exactly.",
    descriptionMm: "ပူးတွဲ manifest.xlsx ပုံစံနှင့် ကိုက်ညီသည်။",
    sheetName: "manifest",
    sourceType: "manifest",
    headers: [
      "id", "way_id", "customer_id", "merchant_id", "status", "recipient_name", "recipient_phone", "township",
      "delivery_address", "item_price", "delivery_charges", "cod_amount", "weight_kg", "created_at", "updated_at", "environment"
    ]
  },
  {
    id: "parcels",
    modules: ["data_entry"],
    titleEn: "Parcel Import Template",
    titleMm: "Parcel Import Template",
    descriptionEn: "Matches attached parcels.xlsx format exactly.",
    descriptionMm: "ပူးတွဲ parcels.xlsx ပုံစံနှင့် ကိုက်ညီသည်။",
    sheetName: "parcels",
    sourceType: "parcel",
    headers: [
      "id", "way_id", "customer_id", "merchant_id", "status", "recipient_name", "recipient_phone", "township",
      "delivery_address", "item_price", "delivery_charges", "cod_amount", "weight_kg", "created_at", "updated_at", "environment"
    ]
  },
  {
    id: "warehouse_inventory_rows",
    modules: ["data_entry", "warehouse"],
    titleEn: "Warehouse Inventory Rows Template",
    titleMm: "Warehouse Inventory Rows Template",
    descriptionEn: "Matches attached be_warehouse_inventory_rows.xlsx row-2 header format exactly.",
    descriptionMm: "ပူးတွဲ be_warehouse_inventory_rows.xlsx Row 2 Header ပုံစံနှင့် ကိုက်ညီသည်။",
    sheetName: "warehouse_inventory_rows",
    sourceType: "warehouse_inventory_rows",
    headers: [
      "Status", "Pickup Date", "Way ID", "Merchant", "Recipient name", "Recipient phone", "Town", "Recipient address",
      "Item price", "Delivery Fee (OS)", "Weight", "Surcharge", "COD", "Actual Collect", "Destination", "Pickup By", "Remarks"
    ]
  },
  {
    id: "warehouse_bird_eye_inventory",
    modules: ["warehouse"],
    titleEn: "Warehouse Inventory Bird Eye Template",
    titleMm: "Warehouse Inventory Bird Eye Template",
    descriptionEn: "Matches attached BE_Warehouse_Inventory_Bird_Eye_Template.xlsx Warehouse Inventory sheet.",
    descriptionMm: "ပူးတွဲ Warehouse Inventory sheet ပုံစံနှင့် ကိုက်ညီသည်။",
    sheetName: "Warehouse Inventory",
    sourceType: "warehouse_inventory",
    headers: [
      "Action", "Warehouse Code", "Warehouse Name", "Zone", "Aisle", "Rack", "Bin", "Pickup ID", "Way ID", "Merchant",
      "Recipient Name", "Recipient Phone", "Township", "Item Description", "SKU", "Qty", "Weight KG", "COD Amount",
      "Delivery Fee", "Inventory Status", "Supervisor Code", "Assigned Staff", "Received At", "Released At", "Remarks"
    ]
  },
  {
    id: "warehouse_bird_eye_summary",
    modules: ["warehouse"],
    titleEn: "Warehouse Bird Eye Summary Template",
    titleMm: "Warehouse Bird Eye Summary Template",
    descriptionEn: "Matches attached Bird Eye View sheet summary columns.",
    descriptionMm: "ပူးတွဲ Bird Eye View sheet summary columns နှင့် ကိုက်ညီသည်။",
    sheetName: "Bird Eye View",
    sourceType: "warehouse_summary",
    headers: [
      "Warehouse Code", "Zone", "Total Parcels", "Total COD", "Total Delivery Fee", "Received", "Assigned", "Hold Exception", "Returned", "Delivered"
    ]
  }
];

export function blankRows(headers: string[], count = 5) {
  return Array.from({ length: count }, () => Object.fromEntries(headers.map((h) => [h, ""])));
}
