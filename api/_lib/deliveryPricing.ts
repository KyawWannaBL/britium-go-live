import { supabaseAdmin } from "./supabaseAdmin";

export type DeliveryPricingInput = {
  township?: string | null;
  serviceType: string;
  weightKg: number;
  itemPrice: number;
  itemPaymentStatus: "PAID" | "UNPAID";
  merchantCustomerDeliveryCharge: number;
  deliveryPaymentStatus: "PAID" | "UNPAID";
};

export type DeliveryPricingOutput = {
  baseWeightKg: number;
  baseDeliveryFee: number;
  overweightPerKg: number;
  overweightKg: number;
  overweightSurcharge: number;
  osDeliveryCharge: number;
  printedWaybillDeliveryCharge: number;
  osTotalCod: number;
  waybillTotalCod: number;
  receivable: number;
};

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function loadTariff(serviceType: string, township?: string | null) {
  if (township) {
    const exact = await supabaseAdmin
      .from("tariff_rate_cards")
      .select("*")
      .eq("active", true)
      .eq("service_type", serviceType)
      .eq("township", township)
      .maybeSingle();

    if (exact.data) return exact.data;
  }

  const fallback = await supabaseAdmin
    .from("tariff_rate_cards")
    .select("*")
    .eq("active", true)
    .eq("service_type", serviceType)
    .is("township", null)
    .maybeSingle();

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  if (!fallback.data) {
    throw new Error(`No tariff found for service_type=${serviceType}`);
  }

  return fallback.data;
}

export async function calculateDeliveryPricing(
  input: DeliveryPricingInput
): Promise<DeliveryPricingOutput> {
  const tariff = await loadTariff(input.serviceType || "standard", input.township);

  const baseWeightKg = num(tariff.base_weight_kg);
  const baseDeliveryFee = num(tariff.base_delivery_fee);
  const overweightPerKg = num(tariff.overweight_per_kg);
  const weightKg = num(input.weightKg);

  const overweightKg = Math.max(0, weightKg - baseWeightKg);
  const overweightSurcharge = overweightKg * overweightPerKg;
  const osDeliveryCharge = baseDeliveryFee + overweightSurcharge;

  const printedWaybillDeliveryCharge = Math.max(
    osDeliveryCharge,
    num(input.merchantCustomerDeliveryCharge)
  );

  const itemCollectable = input.itemPaymentStatus === "UNPAID" ? num(input.itemPrice) : 0;
  const osDeliveryCollectable = input.deliveryPaymentStatus === "UNPAID" ? osDeliveryCharge : 0;
  const waybillDeliveryCollectable =
    input.deliveryPaymentStatus === "UNPAID" ? printedWaybillDeliveryCharge : 0;

  const osTotalCod = itemCollectable + osDeliveryCollectable;
  const waybillTotalCod = itemCollectable + waybillDeliveryCollectable;
  const receivable = osTotalCod;

  return {
    baseWeightKg,
    baseDeliveryFee,
    overweightPerKg,
    overweightKg,
    overweightSurcharge,
    osDeliveryCharge,
    printedWaybillDeliveryCharge,
    osTotalCod,
    waybillTotalCod,
    receivable,
  };
}
