import { describe, expect, it } from 'vitest';
import {
  addressCountText,
  addressMarkers,
  postalCodeLines,
  unlocatedAddresses,
} from './addressPoints';
import type { ActiveAddressPoint, Territory } from './api';

const PUNKTE: ActiveAddressPoint[] = [
  { postal_code: '72072', lat: 48.522, lon: 9.058, addresses: 1 },
  { postal_code: '72070', lat: 48.522, lon: 9.058, addresses: 2 },
  { postal_code: '72070', lat: 48.531, lon: 9.049, addresses: 1 },
  { postal_code: '72070', lat: null, lon: null, addresses: 3 },
];

const NORD: Territory = {
  id: 't1',
  name: 'Nord',
  day_parts: [],
  postal_codes: ['72072'],
  updated_at: '2026-11-02T08:00:00+00:00',
};

describe('Planungskarte: Hilfen (ANN-835)', () => {
  it('fasst je Postleitzahl zusammen, aufsteigend, mit dem Gebiet der Seite', () => {
    expect(postalCodeLines(PUNKTE, [NORD])).toEqual([
      { postalCode: '72070', addresses: 6, territory: null },
      { postalCode: '72072', addresses: 1, territory: 'Nord' },
    ]);
  });

  it('zählt Anschriften ohne Punkt', () => {
    expect(unlocatedAddresses(PUNKTE)).toBe(3);
    expect(unlocatedAddresses([])).toBe(0);
  });

  it('setzt je Punkt einen Marker mit der Zahl dort, nie mit Namen', () => {
    expect(addressMarkers(PUNKTE)).toEqual([
      { position: { lat: 48.522, lon: 9.058 }, label: '3' },
      { position: { lat: 48.531, lon: 9.049 }, label: '1' },
    ]);
  });

  it('schreibt die Zahl als Wort mit Einzahl', () => {
    expect(addressCountText(1)).toBe('1 Anschrift');
    expect(addressCountText(4)).toBe('4 Anschriften');
  });
});
