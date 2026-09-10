export function defaultAmountEntryType(merchant: unknown) {
  return String(merchant ?? "").trim().toUpperCase() === "GRS"
    ? "EXACT_COLLECTION_AMOUNT"
    : "ITEM_PRICE_PLUS_DECLARED_DELIVERY";
}
