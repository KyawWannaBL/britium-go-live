const destinationAliases: Record<string, string> = {
  "မော်ကျွန်း": "မော်လမြိုင်ကျွန်း",
  mawgyun: "မော်လမြိုင်ကျွန်း",
  mawlamyinegyun: "မော်လမြိုင်ကျွန်း",
  ahthoke: "အသုတ်",
  athoke: "အသုတ်",
};

export function royalTariffDestinationKey(value: unknown): string {
  const key = String(value ?? "").trim().normalize("NFC").toLowerCase()
    .replace(/[()（）.,၊။/|·_\s\u200b\ufeff-]/gu, "")
    .replace(/(?:royalexpress|royal|မြို့နယ်|မြို့)+$/u, "");
  return destinationAliases[key] ?? key;
}
