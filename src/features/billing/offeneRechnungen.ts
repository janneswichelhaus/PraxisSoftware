import type { RechnungDerAkte } from './api';

/** Was sich jetzt mit Karte bezahlen lässt: ausgestellt, nicht storniert, mit offenem Betrag. */
export function offeneRechnungen(rechnungen: readonly RechnungDerAkte[]): RechnungDerAkte[] {
  return rechnungen
    .filter((r) => r.status === 'issued' && !r.cancelled && r.outstanding_cents > 0)
    .sort((a, b) => (a.issued_on ?? '').localeCompare(b.issued_on ?? ''));
}
