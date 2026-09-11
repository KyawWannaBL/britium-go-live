import assert from "node:assert/strict";
import { calculateDeliveryPricingMath } from "../src/lib/deliveryPricingMath.ts";

const base = {
  baseWeightKg: 3,
  baseDeliveryFee: 4000,
  overweightPerKg: 500,
  itemPrice: 10000,
  itemPaymentStatus: "UNPAID",
  merchantCustomerDeliveryCharge: 6000,
  deliveryPaymentStatus: "UNPAID",
};

const atAllowance = calculateDeliveryPricingMath({ ...base, weightKg: 3 });
assert.equal(atAllowance.overweightKg, 0);
assert.equal(atAllowance.overweightSurcharge, 0);
assert.equal(atAllowance.receivable, 16000);

const fractionalOver = calculateDeliveryPricingMath({ ...base, weightKg: 3.01 });
assert.equal(fractionalOver.overweightKg, 1);
assert.equal(fractionalOver.overweightSurcharge, 500);
assert.equal(fractionalOver.osDeliveryCharge, 4500);
assert.equal(fractionalOver.receivable, 16000);

const twoStartedKg = calculateDeliveryPricingMath({ ...base, weightKg: 4.2 });
assert.equal(twoStartedKg.overweightKg, 2);
assert.equal(twoStartedKg.overweightSurcharge, 1000);

const paidItem = calculateDeliveryPricingMath({ ...base, weightKg: 3, itemPaymentStatus: "PAID" });
assert.equal(paidItem.receivable, 6000);

const paidDelivery = calculateDeliveryPricingMath({ ...base, weightKg: 3, deliveryPaymentStatus: "PAID" });
assert.equal(paidDelivery.receivable, 10000);

const fullyPaid = calculateDeliveryPricingMath({
  ...base,
  weightKg: 3,
  itemPaymentStatus: "PAID",
  deliveryPaymentStatus: "PAID",
});
assert.equal(fullyPaid.receivable, 0);

assert.throws(
  () => calculateDeliveryPricingMath({ ...base, weightKg: Number.NaN }),
  /weightKg must be a non-negative finite number/
);

console.log("deliveryPricingMath: 7 cases passed");
