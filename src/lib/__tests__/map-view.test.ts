import { expect, it } from 'vitest';
import { resolveMapView } from '../map-view';
it('keeps illustrated behind the flag and normalizes invalid URL views', () => {
  expect(resolveMapView('illustrated', false)).toBe('flat');
  expect(resolveMapView('illustrated', true)).toBe('illustrated');
  expect(resolveMapView('satellite', false)).toBe('satellite');
  expect(resolveMapView('bogus', true)).toBe('flat');
});
