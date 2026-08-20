const RIDER_HOSTS = new Set([
  "britiumexpress.app",
  "www.britiumexpress.app",
]);

export function isRiderAppHost(hostname = window.location.hostname) {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  return RIDER_HOSTS.has(normalized) || normalized.endsWith(".britiumexpress.app");
}

