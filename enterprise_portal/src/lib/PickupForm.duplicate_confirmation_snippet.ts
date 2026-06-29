// PickupForm duplicate-confirmation RPC flow.
// Add this logic where the Pickup Form currently calls be_create_pickup_request_from_master.

type PickupRpcResponse = {
  ok?: boolean;
  requires_confirmation?: boolean;
  reason?: string;
  message?: string;
  confirmation_message?: string;
  pickup_id?: string;
  pickup_way_id?: string;
};

async function createPickupWithDuplicateConfirmation(baseArgs: Record<string, unknown>) {
  const first = await supabase.rpc("be_create_pickup_request_from_master", {
    ...baseArgs,
    p_duplicate_confirmed: false,
  });

  if (first.error) {
    throw first.error;
  }

  const firstData = first.data as PickupRpcResponse | null;

  if (firstData?.requires_confirmation) {
    const proceed = window.confirm(
      firstData.confirmation_message ||
        firstData.message ||
        "This merchant already has a pickup request for this date. Is this another order picking request?"
    );

    if (!proceed) {
      return {
        ok: false,
        cancelled: true,
        message: "Pickup request cancelled by user.",
      };
    }

    const second = await supabase.rpc("be_create_pickup_request_from_master", {
      ...baseArgs,
      p_duplicate_confirmed: true,
    });

    if (second.error) {
      throw second.error;
    }

    return second.data;
  }

  return firstData;
}

// Example usage:
// const result = await createPickupWithDuplicateConfirmation({
//   p_actor_email: user?.email ?? "testcustomer_service@britiumexpress.com",
//   p_city_override: cityOverride || null,
//   p_expected_parcels: Number(expectedParcels || 1),
//   p_merchant_code: selectedMerchantCode,
//   p_payment_type: paymentType || "COD",
//   p_pickup_address_override: pickupAddressOverride || null,
//   p_pickup_date: pickupDate,
//   p_pickup_remark: pickupRemark || null,
//   p_region_state_override: regionStateOverride || null,
//   p_township_override: townshipOverride || null,
//   p_vehicle_required: vehicleType || "None", // Bike/Car/Truck/None
// });
