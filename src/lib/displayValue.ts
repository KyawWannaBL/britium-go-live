export function safeText(value: unknown, fallback = '—'): string {
  if (value === null || value === undefined) return fallback;

  if (typeof value === 'string') {
    const v = value.trim();
    return v || fallback;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => safeText(item, ''))
      .filter(Boolean)
      .filter((item) => item !== '—');
    return parts.length ? parts.join(', ') : fallback;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const preferredKeys = [
      'name',
      'street',
      'address',
      'line1',
      'line2',
      'ward',
      'township',
      'city',
      'state',
      'region',
      'country',
      'postalCode',
      'zip',
    ];

    const preferred = preferredKeys
      .map((key) => obj[key])
      .map((item) => safeText(item, ''))
      .filter(Boolean)
      .filter((item) => item !== '—');

    if (preferred.length) return preferred.join(', ');

    const values = Object.values(obj)
      .map((item) => safeText(item, ''))
      .filter(Boolean)
      .filter((item) => item !== '—');

    return values.length ? values.join(', ') : fallback;
  }

  return fallback;
}

export function addressText(value: unknown, fallback = '—'): string {
  return safeText(value, fallback);
}
