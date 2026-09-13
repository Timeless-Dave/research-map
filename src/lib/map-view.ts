export type MapView = 'illustrated' | 'satellite' | 'flat';
export const ILLUSTRATED_ENABLED = process.env.NEXT_PUBLIC_ILLUSTRATED_MAP === 'true';
export function resolveMapView(value: string | null, enabled = ILLUSTRATED_ENABLED): MapView {
  if (value === 'illustrated' && enabled) return 'illustrated';
  return value === 'satellite' ? 'satellite' : 'flat';
}
