/**
 * Britium Rider App
 * Pickup photo-verification post-submit reset
 *
 * Use this helper from the live Rider verification screen's Submit handler.
 * It closes and clears the completed pickup only after the backend confirms
 * success. A failed submission keeps the screen and its photo/form data open.
 */

export type SubmitResult = {
  data?: unknown;
  error?: { message?: string } | null;
};

export type VerificationMessage = {
  type: "success" | "error";
  text: string;
};

type PostSubmitArgs = {
  pickupId: string;
  submitVerification: () => Promise<SubmitResult>;
  closeVerificationScreen: () => void;
  resetVerificationForm: () => void;
  clearSelectedPickup: () => void;
  refreshPickupQueue: () => Promise<void>;
  showMessage: (message: VerificationMessage) => void;
  setSubmitting: (submitting: boolean) => void;
};

function responsePickupId(data: unknown): string {
  if (Array.isArray(data)) {
    return data.length ? responsePickupId(data[0]) : "";
  }

  if (!data || typeof data !== "object") return "";

  const row = data as Record<string, unknown>;
  const directId =
    row.pickup_id ??
    row.pickupId ??
    row.pickup_request_id ??
    row.request_code;

  if (typeof directId === "string") return directId.trim();

  if (row.result) return responsePickupId(row.result);
  return "";
}

export async function submitPickupVerificationAndReset({
  pickupId,
  submitVerification,
  closeVerificationScreen,
  resetVerificationForm,
  clearSelectedPickup,
  refreshPickupQueue,
  showMessage,
  setSubmitting,
}: PostSubmitArgs): Promise<boolean> {
  const submittedPickupId = pickupId.trim();

  if (!submittedPickupId) {
    showMessage({
      type: "error",
      text: "Select a pickup ID before submitting its verification photo.",
    });
    return false;
  }

  setSubmitting(true);

  try {
    const result = await submitVerification();

    if (result.error) {
      throw new Error(
        result.error.message ||
          `Photo verification failed for ${submittedPickupId}.`,
      );
    }

    const confirmedPickupId = responsePickupId(result.data);

    if (
      confirmedPickupId &&
      confirmedPickupId.toUpperCase() !== submittedPickupId.toUpperCase()
    ) {
      throw new Error(
        `Verification response belongs to ${confirmedPickupId}, not ${submittedPickupId}.`,
      );
    }

    // Clear the completed pickup before loading the refreshed queue. This
    // prevents the previous photo or pickup ID from leaking into the next job.
    closeVerificationScreen();
    resetVerificationForm();
    clearSelectedPickup();

    await refreshPickupQueue();

    showMessage({
      type: "success",
      text:
        `${submittedPickupId}: picture uploaded successfully. ` +
        "Ready for the next pickup ID.",
    });

    return true;
  } catch (error) {
    // Keep the form open and preserve the selected photo on failure so the
    // Rider can retry without entering everything again.
    showMessage({
      type: "error",
      text:
        error instanceof Error
          ? error.message
          : `Photo verification failed for ${submittedPickupId}.`,
    });
    return false;
  } finally {
    setSubmitting(false);
  }
}

/*
Integration example inside the Rider verification component:

await submitPickupVerificationAndReset({
  pickupId: selectedPickupId,
  submitVerification: () =>
    supabase.rpc("be_rider_submit_partial_pickup_verification", {
      p_payload: verificationPayload,
    }),
  closeVerificationScreen: () => setVerificationOpen(false),
  resetVerificationForm: () => {
    setPhotoFile(null);
    setPhotoPreview("");
    setVerificationPayload(initialVerificationPayload);
  },
  clearSelectedPickup: () => setSelectedPickupId(""),
  refreshPickupQueue: loadPickupJobs,
  showMessage: setMessage,
  setSubmitting,
});
*/
