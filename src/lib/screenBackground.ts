import { screenBackgrounds } from '../generated/backgrounds';

function hashRoute(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getStableBackground(routeKey: string): string {
  if (!screenBackgrounds.length) return '/logo.png';
  const index = hashRoute(routeKey) % screenBackgrounds.length;
  return screenBackgrounds[index];
}
