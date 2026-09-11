export const INTEGRATED_MASTER_BUILD = "BRITIUM_INTEGRATED_MASTER_V4_1_2026_07_31";

export type HighwayStationCode =
  | "HW_DOWNTOWN"
  | "HW_BAYINTNAUNG"
  | "HW_DAGON_THIRI"
  | "HW_AUNG_MINGALAR"
  | "HW_PARAMI";

export type FulfillmentMode =
  | "BRITIUM_DIRECT"
  | "BRANCH_DIRECT"
  | "THIRD_PARTY_OUTSOURCED"
  | "BRANCH_THIRD_PARTY";

export type ProviderCode =
  | "BRITIUM"
  | "BRITIUM_NPT_BRANCH"
  | "BRITIUM_MDY_BRANCH"
  | "DK_DELIVERY"
  | "ROYAL_EXPRESS"
  | "ARLU_POST"
  | "NINJA_VAN"
  | "SAFE_DELIVERY_SERVICES";

export type CustomerTier = "STANDARD" | "ROYAL" | "COMMITMENT";

export const HIGHWAY_STATIONS: Array<{
  code: HighwayStationCode;
  label: string;
  baseRateMmk: number;
  aliases: string[];
}> = [
  {
    code: "HW_DOWNTOWN",
    label: "Highway Station Drop Off (Downtown)",
    baseRateMmk: 4000,
    aliases: ["Downtown Highway Station", "Downtown Drop Off"],
  },
  {
    code: "HW_BAYINTNAUNG",
    label: "Bayintnaung Drop Off",
    baseRateMmk: 4000,
    aliases: ["Bayintnaung Highway Station", "Bayintnaung Bus Station"],
  },
  {
    code: "HW_DAGON_THIRI",
    label: "Hlaing Thar Yar - Dagon Thiri Highway Station Drop Off",
    baseRateMmk: 4000,
    aliases: ["Dagon Thiri", "Dagon Ayar", "Hlaing Thar Yar Highway Station"],
  },
  {
    code: "HW_AUNG_MINGALAR",
    label: "North Okkalapa - Aung Mingalar Highway Station Drop Off",
    baseRateMmk: 3000,
    aliases: ["Aung Mingalar", "Aung Mingalar Highway", "North Okkalapa Highway Station"],
  },
  {
    code: "HW_PARAMI",
    label: "Parami Highway Station Drop Off",
    baseRateMmk: 3000,
    aliases: ["Parami Bus Compound", "Parami Highway Station"],
  },
];

export const CUSTOMER_TIER_INCLUDED_KG: Record<CustomerTier, number> = {
  STANDARD: 3,
  ROYAL: 5,
  COMMITMENT: 5,
};

export const DEFAULT_EXTRA_KG_RATE_MMK = 500;

export function calculateHighwayDropoff(input: {
  stationCode: HighwayStationCode;
  actualWeightKg: number;
  tier: CustomerTier;
  cbmSurchargeMmk?: number;
  otherSurchargeMmk?: number;
  commitmentQualified?: boolean;
  commitmentRefundMmk?: number;
}) {
  const station = HIGHWAY_STATIONS.find((item) => item.code === input.stationCode);
  if (!station) throw new Error("Unknown or inactive highway station.");
  const chargeableWeightKg = Math.ceil(Math.max(0, Number(input.actualWeightKg || 0)));
  const includedKg = CUSTOMER_TIER_INCLUDED_KG[input.tier];
  const extraKg = Math.max(0, chargeableWeightKg - includedKg);
  const weightSurchargeMmk = extraKg * DEFAULT_EXTRA_KG_RATE_MMK;
  const grossSystemDeliveryChargeMmk =
    station.baseRateMmk +
    weightSurchargeMmk +
    Math.max(0, Number(input.cbmSurchargeMmk || 0)) +
    Math.max(0, Number(input.otherSurchargeMmk || 0));
  const commitmentRefundMmk = input.commitmentQualified
    ? Math.max(0, Number(input.commitmentRefundMmk ?? 500))
    : 0;
  return {
    station,
    chargeableWeightKg,
    includedKg,
    extraKg,
    weightSurchargeMmk,
    grossSystemDeliveryChargeMmk,
    commitmentRefundMmk,
    netSystemDeliveryChargeMmk: Math.max(0, grossSystemDeliveryChargeMmk - commitmentRefundMmk),
  };
}

export function resolveFulfillmentRoute(input: {
  zoneCode?: string | null;
  destination?: string | null;
  serviceType?: string | null;
}) {
  const zone = String(input.zoneCode || "").trim().toUpperCase();
  const destination = String(input.destination || "").trim().toLowerCase();
  if (String(input.serviceType || "").toUpperCase() === "HIGHWAY_STATION_DROP_OFF") {
    return {
      fulfillmentMode: "BRITIUM_DIRECT" as FulfillmentMode,
      managingBranchCode: "YGN",
      providerCode: "BRITIUM" as ProviderCode,
      reason: "Highway station drop-off is a Britium-controlled station handover product.",
    };
  }
  if (zone === "YGN" || destination.includes("yangon")) {
    return {
      fulfillmentMode: "BRITIUM_DIRECT" as FulfillmentMode,
      managingBranchCode: "YGN",
      providerCode: "BRITIUM" as ProviderCode,
      reason: "Yangon direct-service precedence.",
    };
  }
  if (zone === "NPT" || destination.includes("naypy") || destination.includes("nay pyi")) {
    return {
      fulfillmentMode: "BRANCH_DIRECT" as FulfillmentMode,
      managingBranchCode: "NPT",
      providerCode: "BRITIUM_NPT_BRANCH" as ProviderCode,
      reason: "Naypyitaw branch-managed precedence.",
    };
  }
  if (zone === "MDY" || destination.includes("mandalay")) {
    return {
      fulfillmentMode: "BRANCH_THIRD_PARTY" as FulfillmentMode,
      managingBranchCode: "MDY",
      providerCode: "DK_DELIVERY" as ProviderCode,
      reason: "Mandalay is managed by Britium and executed by DK Delivery.",
    };
  }
  return {
    fulfillmentMode: "THIRD_PARTY_OUTSOURCED" as FulfillmentMode,
    managingBranchCode: "YGN",
    providerCode: "ROYAL_EXPRESS" as ProviderCode,
    reason: "Other supported non-direct destinations default to Royal Express.",
  };
}

export function calculateNaypyitawBranchSettlement(input: {
  shareableDeliveryRevenueMmk: number;
  senderEntity: "HQ" | "NPT";
  lastMileEntity: "HQ" | "NPT";
  penaltiesMmk?: number;
  creditsMmk?: number;
  deductionsMmk?: number;
}) {
  if (input.senderEntity === input.lastMileEntity) {
    throw new Error("Sender and last-mile entities must be different for the 55/45 inter-office rule.");
  }
  const revenue = Math.max(0, Number(input.shareableDeliveryRevenueMmk || 0));
  const senderGrossMmk = Math.round(revenue * 0.55);
  const lastMileGrossMmk = revenue - senderGrossMmk;
  const nptGrossMmk = input.senderEntity === "NPT" ? senderGrossMmk : lastMileGrossMmk;
  const nptManagementFeeMmk = Math.round(nptGrossMmk * 0.1);
  const nptNetMmk =
    nptGrossMmk -
    nptManagementFeeMmk -
    Math.max(0, Number(input.penaltiesMmk || 0)) -
    Math.max(0, Number(input.deductionsMmk || 0)) +
    Math.max(0, Number(input.creditsMmk || 0));
  return {
    senderGrossMmk,
    lastMileGrossMmk,
    nptGrossMmk,
    nptManagementFeeMmk,
    nptNetMmk,
    hqOperationalShareMmk: input.senderEntity === "HQ" ? senderGrossMmk : lastMileGrossMmk,
    hqTotalRevenueMmk:
      (input.senderEntity === "HQ" ? senderGrossMmk : lastMileGrossMmk) + nptManagementFeeMmk,
  };
}

export function calculateDkFulfillment(input: {
  britiumRecognizedDeliveryRevenueMmk: number;
  highwayTransportCostMmk: number;
  dkBaseChargeMmk: number;
  dkWeightSizeSurchargeMmk?: number;
  otherHandlingCostMmk?: number;
  dkCreditsMmk?: number;
  dkPenaltiesMmk?: number;
}) {
  const totalCostMmk =
    Math.max(0, Number(input.highwayTransportCostMmk || 0)) +
    Math.max(0, Number(input.dkBaseChargeMmk || 0)) +
    Math.max(0, Number(input.dkWeightSizeSurchargeMmk || 0)) +
    Math.max(0, Number(input.otherHandlingCostMmk || 0)) -
    Math.max(0, Number(input.dkCreditsMmk || 0)) -
    Math.max(0, Number(input.dkPenaltiesMmk || 0));
  return {
    totalCostMmk,
    fulfillmentMarginMmk: Number(input.britiumRecognizedDeliveryRevenueMmk || 0) - totalCostMmk,
  };
}

export function royalCodFeeMmk(productAmountMmk: number) {
  const amount = Math.max(0, Number(productAmountMmk || 0));
  return amount <= 300000 ? 195 : Math.round(amount * 0.002);
}

export function royalRebateRate(completedWays: number) {
  const ways = Math.max(0, Math.floor(Number(completedWays || 0)));
  if (ways >= 3000) return 0.15;
  if (ways >= 2000) return 0.1;
  if (ways >= 1000) return 0.05;
  return 0;
}

export function calculateRoyalFulfillment(input: {
  normalBaseRateMmk: number;
  discountedBaseRateMmk: number;
  extraKg: number;
  nextKgRateMmk: number;
  productAmountMmk: number;
  otherPartnerChargesMmk?: number;
  partnerCreditsMmk?: number;
  confirmedRebateMmk?: number;
}) {
  const partnerExtraKgMmk = Math.max(0, Number(input.extraKg || 0)) * Math.max(0, Number(input.nextKgRateMmk || 0));
  const codFeeMmk = royalCodFeeMmk(input.productAmountMmk);
  const immediateDiscountMarginMmk =
    Math.max(0, Number(input.normalBaseRateMmk || 0)) -
    Math.max(0, Number(input.discountedBaseRateMmk || 0));
  const partnerPayableMmk =
    Math.max(0, Number(input.discountedBaseRateMmk || 0)) +
    partnerExtraKgMmk +
    codFeeMmk +
    Math.max(0, Number(input.otherPartnerChargesMmk || 0)) -
    Math.max(0, Number(input.partnerCreditsMmk || 0)) -
    Math.max(0, Number(input.confirmedRebateMmk || 0));
  return {
    partnerExtraKgMmk,
    codFeeMmk,
    immediateDiscountMarginMmk,
    partnerPayableMmk,
    fulfillmentMarginMmk:
      Math.max(0, Number(input.normalBaseRateMmk || 0)) + partnerExtraKgMmk - partnerPayableMmk,
  };
}
