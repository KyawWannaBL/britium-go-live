export type DeliveryPricingMathInput = {
  baseWeightKg: number;
  baseDeliveryFee: number;
  overweightPerKg: number;
  weightKg: number;
  itemPrice: number;
  itemPaymentStatus: "PAID" | "UNPAID";
  merchantCustomerDeliveryCharge: number;
  deliveryPaymentStatus: "PAID" | "UNPAID";
};

export type DeliveryPricingMathOutput = {
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

function nonNegativeNumber(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative finite number.`);
  }
  return value;
}

/**
 * Pure delivery-pricing calculation shared by the portal preview and API.
 * Extra weight is billed by each started kilogram, so 3.01 kg over a 3 kg
 * allowance bills one extra kilogram rather than a fractional amount.
 */
export function calculateDeliveryPricingMath(input: DeliveryPricingMathInput): DeliveryPricingMathOutput {
  const baseWeightKg = nonNegativeNumber(input.baseWeightKg, "baseWeightKg");
  const baseDeliveryFee = nonNegativeNumber(input.baseDeliveryFee, "baseDeliveryFee");
  const overweightPerKg = nonNegativeNumber(input.overweightPerKg, "overweightPerKg");
  const weightKg = nonNegativeNumber(input.weightKg, "weightKg");
  const itemPrice = nonNegativeNumber(input.itemPrice, "itemPrice");
  const merchantCharge = nonNegativeNumber(input.merchantCustomerDeliveryCharge, "merchantCustomerDeliveryCharge");

  const overweightKg = Math.ceil(Math.max(0, weightKg - baseWeightKg));
  const overweightSurcharge = overweightKg * overweightPerKg;
  const osDeliveryCharge = baseDeliveryFee + overweightSurcharge;
  const printedWaybillDeliveryCharge = Math.max(osDeliveryCharge, merchantCharge);
  const itemCollectable = input.itemPaymentStatus === "UNPAID" ? itemPrice : 0;
  const osDeliveryCollectable = input.deliveryPaymentStatus === "UNPAID" ? osDeliveryCharge : 0;
  const waybillDeliveryCollectable = input.deliveryPaymentStatus === "UNPAID" ? printedWaybillDeliveryCharge : 0;
  const osTotalCod = itemCollectable + osDeliveryCollectable;
  const waybillTotalCod = itemCollectable + waybillDeliveryCollectable;

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
    receivable: waybillTotalCod,
  };
}
