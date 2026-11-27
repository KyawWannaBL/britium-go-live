const effectiveMyanmarDate = "2026-11-27";

export function revisedFeePolicyApplies(at = new Date()): boolean {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  return date >= effectiveMyanmarDate;
}
