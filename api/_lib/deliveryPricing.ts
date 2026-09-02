import { supabaseAdmin } from "./supabaseAdmin";
import { calculateDeliveryPricingMath } from "../../src/lib/deliveryPricingMath";

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

function requiredNumber(value: unknown, field: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new RangeError(`${field} must be a non-negative finite number.`);
  return n;
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

    if (exact.error) throw new Error(exact.error.message);
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

  return calculateDeliveryPricingMath({
    baseWeightKg: requiredNumber(tariff.base_weight_kg, "tariff.base_weight_kg"),
    baseDeliveryFee: requiredNumber(tariff.base_delivery_fee, "tariff.base_delivery_fee"),
    overweightPerKg: requiredNumber(tariff.overweight_per_kg, "tariff.overweight_per_kg"),
    weightKg: requiredNumber(input.weightKg, "weightKg"),
    itemPrice: requiredNumber(input.itemPrice, "itemPrice"),
    itemPaymentStatus: input.itemPaymentStatus,
    merchantCustomerDeliveryCharge: requiredNumber(input.merchantCustomerDeliveryCharge, "merchantCustomerDeliveryCharge"),
    deliveryPaymentStatus: input.deliveryPaymentStatus,
  });
}
