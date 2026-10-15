import type { Kandidat, Rechnung } from './api';

/**
 * Die Monatsabrechnung in einem Lauf (Bereichsüberholung 4, K13).
 *
 * Welche Zeile aus „Abzurechnen“ der Lauf aufnimmt, steht nur hier (ANN-544):
 *
 *   * **mit Verordnung** erst, wenn sie in die Abrechnung gestellt ist
 *     (ADR-009 Punkt 24) - eine Rechnung je Verordnung, und die Freigabe sagt,
 *     dass nichts mehr dazukommt;
 *   * **ohne Verordnung** (Monat, Training, Abo-Monat, Ausfallhonorar) ein
 *     abgeschlossener Kalendermonat - sonst bekäme ein Monat zwei Rechnungen;
 *   * **nie** Leistungen einer stornierten Rechnung: Deren Korrektur bleibt ein
 *     einzelner Weg mit Bezug (UX-008b);
 *   * eine Zeile mit stehendem Entwurf nicht noch einmal - der Entwurf selbst
 *     ist im Lauf.
 *
 * Ausgestellt wird jede Rechnung einzeln über `issue_invoice`; jede Regel der
 * Ausstellung bleibt am Server (ADR-009 Punkte 8 bis 10, 16 bis 18).
 */
export type Laufstand =
  'im_lauf' | 'entwurf_steht' | 'korrektur' | 'nicht_freigegeben' | 'laufender_monat';

/** Der erste Tag des Monats von `tag` (`JJJJ-MM-TT`). */
function monatsanfang(tag: string): string {
  return `${tag.slice(0, 7)}-01`;
}

/** ANN-544: Nimmt der Lauf diese Zeile auf - und wenn nicht, warum nicht? */
export function laufstand(kandidat: Kandidat, heute: string): Laufstand {
  if (kandidat.cancelled_invoice_id) return 'korrektur';
  if (kandidat.has_draft) return 'entwurf_steht';
  if (kandidat.treatment_basis_id) {
    return kandidat.basis_released_at ? 'im_lauf' : 'nicht_freigegeben';
  }
  return kandidat.period_month < monatsanfang(heute) ? 'im_lauf' : 'laufender_monat';
}

/** Warum eine Zeile nicht im Lauf steht - ein Wort an der Zeile, kein Warnzustand. */
export const laufstandTexte: Partial<Record<Laufstand, string>> = {
  nicht_freigegeben: 'Verordnung nicht freigegeben',
  laufender_monat: 'Monat läuft noch',
};

/** Die Zeilen, die der Lauf als Entwurf anlegt. */
export function laufKandidaten(kandidaten: readonly Kandidat[], heute: string): Kandidat[] {
  return kandidaten.filter((kandidat) => laufstand(kandidat, heute) === 'im_lauf');
}

/** Anzahl je Nummernkreis, für die Rückfrage vor dem Ausstellen. */
export function jeKreis(rechnungen: readonly Pick<Rechnung, 'service_area'>[]): {
  therapy: number;
  training: number;
} {
  return {
    therapy: rechnungen.filter((r) => r.service_area === 'therapy').length,
    training: rechnungen.filter((r) => r.service_area === 'training').length,
  };
}
