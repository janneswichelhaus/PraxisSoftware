import type { MapOverlayStop } from '@/lib/location/contract';
import type { ActiveAddressPoint, Territory } from './api';

export interface PostalCodeLine {
  readonly postalCode: string;
  readonly addresses: number;
  /** Name des Gebiets, dem die Postleitzahl gehört, oder `null`. */
  readonly territory: string | null;
}

/** Je Postleitzahl die Zahl der Anschriften und ihr Gebiet, aufsteigend nach Postleitzahl. */
export function postalCodeLines(
  points: readonly ActiveAddressPoint[],
  territories: readonly Territory[],
): PostalCodeLine[] {
  const gebiet = new Map<string, string>();
  for (const t of territories) for (const plz of t.postal_codes) gebiet.set(plz, t.name);
  const summe = new Map<string, number>();
  for (const p of points) summe.set(p.postal_code, (summe.get(p.postal_code) ?? 0) + p.addresses);
  return [...summe.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([postalCode, addresses]) => ({
      postalCode,
      addresses,
      territory: gebiet.get(postalCode) ?? null,
    }));
}

/** Wie viele Anschriften ohne Punkt sind: nicht oder nur auf den Ort verortet. */
export function unlocatedAddresses(points: readonly ActiveAddressPoint[]): number {
  return points.reduce((n, p) => (p.lat === null || p.lon === null ? n + p.addresses : n), 0);
}

/** Je Punkt ein Marker mit der Zahl der Anschriften dort; Punkte zweier Postleitzahlen fallen zusammen. */
export function addressMarkers(points: readonly ActiveAddressPoint[]): MapOverlayStop[] {
  const marker = new Map<string, { lat: number; lon: number; addresses: number }>();
  for (const p of points) {
    if (p.lat === null || p.lon === null) continue;
    const schluessel = `${p.lat}|${p.lon}`;
    const da = marker.get(schluessel);
    if (da) da.addresses += p.addresses;
    else marker.set(schluessel, { lat: p.lat, lon: p.lon, addresses: p.addresses });
  }
  return [...marker.values()].map((m) => ({
    position: { lat: m.lat, lon: m.lon },
    label: String(m.addresses),
  }));
}

/** „1 Anschrift“, „5 Anschriften“. */
export function addressCountText(addresses: number): string {
  return addresses === 1 ? '1 Anschrift' : `${addresses} Anschriften`;
}
