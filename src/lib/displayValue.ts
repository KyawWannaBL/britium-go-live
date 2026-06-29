export function safeText(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined) return fallback;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : value.toLocaleString();
  }

  try {
    const text = JSON.stringify(value);
    return text && text !== "{}" ? text : fallback;
  } catch {
    return fallback;
  }
}
