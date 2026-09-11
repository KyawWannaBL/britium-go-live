export const WAYPLAN_IMPORT_HEADERS = [
  "Way ID",
  "Manifest Group",
  "Route Type",
  "Route Date",
  "Highway Drop",
  "Driver Code",
  "Driver Name",
  "Rider Code",
  "Rider Name",
  "Helper Code",
  "Helper Name",
  "Vehicle Plate",
  "Supervisor Note",
];

export const WAREHOUSE_INVENTORY_HEADERS = [
  "Status",
  "Pickup Date",
  "Way ID",
  "Merchant",
  "Recipient name",
  "Recipient phone",
  "Town",
  "Recipient address",
  "Item price",
  "Delivery Fee (OS)",
  "Weight",
  "Surcharge",
  "COD",
  "Actual Collect",
  "Destination",
  "Pickup By",
  "Remarks",
];

export const PARCEL_IMPORT_HEADERS = [
  "id",
  "way_id",
  "customer_id",
  "merchant_id",
  "status",
  "recipient_name",
  "recipient_phone",
  "township",
  "delivery_address",
  "item_price",
  "delivery_charges",
  "cod_amount",
  "weight_kg",
  "created_at",
  "updated_at",
  "environment",
];

export function normalizeExcelRow(row: any) {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = row?.[k];
      if (v !== undefined && v !== null && String(v).trim() && !["nan", "null", "undefined"].includes(String(v).toLowerCase())) {
        return v;
      }
    }
    return "";
  };

  return {
    way_id: pick("Way ID", "way_id", "delivery_way_id", "tracking_no", "id"),
    manifest_group: pick("Manifest Group", "manifest_group"),
    route_type: pick("Route Type", "route_type"),
    route_date: pick("Route Date", "route_date", "Pickup Date", "pickup_date"),
    highway_drop: pick("Highway Drop", "highway_drop"),
    driver_code: pick("Driver Code", "driver_code"),
    driver_name: pick("Driver Name", "driver_name"),
    rider_code: pick("Rider Code", "rider_code", "Pickup By", "pickup_by"),
    rider_name: pick("Rider Name", "rider_name"),
    helper_code: pick("Helper Code", "helper_code"),
    helper_name: pick("Helper Name", "helper_name"),
    vehicle_plate: pick("Vehicle Plate", "vehicle_plate", "asset_code"),
    supervisor_note: pick("Supervisor Note", "supervisor_note"),
    status: pick("Status", "status"),
    merchant: pick("Merchant", "merchant", "merchant_id"),
    recipient_name: pick("Recipient name", "recipient_name", "receiver_name"),
    recipient_phone: pick("Recipient phone", "recipient_phone", "receiver_phone"),
    township: pick("Town", "township", "Township", "destination"),
    delivery_address: pick("Recipient address", "delivery_address", "recipient_address"),
    item_price: pick("Item price", "item_price"),
    delivery_fee: pick("Delivery Fee (OS)", "delivery_charges", "delivery_fee", "deli_fee"),
    weight_kg: pick("Weight", "weight_kg"),
    surcharge: pick("Surcharge", "surcharge"),
    cod_amount: pick("COD", "cod_amount"),
    actual_collect: pick("Actual Collect", "actual_collect"),
    remarks: pick("Remarks", "remarks", "remark"),
    environment: pick("environment"),
  };
}
