/**
 * DK last-mile settlement preview only.
 *
 * These historical rate bands are NOT a signed, effective-dated agreement.
 * Never use this module to authorize payment, write a finance ledger, adjust COD,
 * or overwrite merchant Financial V2 amounts. Production settlement must load an
 * approved agreement version and eligible parcel proof from the server.
 */
export type DkBand = 'INNER_MANDALAY' | 'OUTER_MANDALAY' | 'EXTENDED_LISTED_AREA';
export type DkPreviewInput = {
  band: DkBand;
  customerDeliveryRevenueMmk: number;
  allocatedLinehaulMmk?: number;
  approvedOtherCostMmk?: number;
  agreementVerified: boolean;
  deliveryVerified: boolean;
};
export type DkPreview = {
  status: 'PREVIEW_ONLY';
  eligibleForPosting: false;
  reasons: string[];
  dkBasePayableMmk: number;
  britiumRetainedBeforeCostsMmk: number;
  contributionAfterCostsMmk: number;
};

const REFERENCE_RATES: Readonly<Record<DkBand, number>> = {
  INNER_MANDALAY: 2000,
  OUTER_MANDALAY: 2500,
  EXTENDED_LISTED_AREA: 3000,
};

function nonnegativeMmk(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer amount in MMK`);
  }
  return value;
}

export function previewDkSettlement(input: DkPreviewInput): DkPreview {
  if (!Object.prototype.hasOwnProperty.call(REFERENCE_RATES, input.band)) {
    throw new Error('Unrecognized DK service band');
  }
  const revenue = nonnegativeMmk(input.customerDeliveryRevenueMmk, 'Delivery revenue');
  const linehaul = nonnegativeMmk(input.allocatedLinehaulMmk ?? 0, 'Linehaul cost');
  const other = nonnegativeMmk(input.approvedOtherCostMmk ?? 0, 'Other cost');
  const payable = REFERENCE_RATES[input.band];
  const reasons = ['Settlement remains preview-only until a server-validated signed agreement, proof of delivery, and Finance approval are all verified'];
  if (!input.agreementVerified) reasons.push('DK agreement version and effective dates unverified');
  if (!input.deliveryVerified) reasons.push('Delivery proof unverified');
  return {
    status: 'PREVIEW_ONLY',
    eligibleForPosting: false,
    reasons,
    dkBasePayableMmk: payable,
    britiumRetainedBeforeCostsMmk: revenue - payable,
    contributionAfterCostsMmk: revenue - payable - linehaul - other,
  };
}
