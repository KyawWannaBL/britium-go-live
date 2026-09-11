export function defaultAmountEntryType(merchant: unknown) {
  return ["GRS", "GRS EXPRESS"].includes(String(merchant ?? "").trim().toUpperCase())
    ? "EXACT_COLLECTION_AMOUNT"
    : "ITEM_PRICE_PLUS_DECLARED_DELIVERY";
}
