import type { Ton } from '@/components/ui/Badge';
import type { Rechnungsposition, Rechnungszeile } from './api';

/**
 * Anzeigehilfen der eigenen Rechnungen (POR-013). Nur Form, kein Wert: Beträge
 * und Zustände kommen vom Server (ADR-009 Punkt 12).
 */

/** Der Zahlungsstand in der Sprache der Person, mit Ton und Zeichen. */
export function zahlungsstand(z: {
  payment_state: Rechnungszeile['payment_state'];
  overdue: boolean;
  cancelled: boolean;
}): { wort: string; ton: Ton } {
  if (z.cancelled) return { wort: 'storniert', ton: 'neutral' };
  if (z.payment_state === 'paid' || z.payment_state === 'overpaid') {
    return { wort: 'bezahlt', ton: 'positiv' };
  }
  if (z.overdue) return { wort: 'überfällig', ton: 'kritisch' };
  if (z.payment_state === 'partially_paid') return { wort: 'teilweise bezahlt', ton: 'warnung' };
  return { wort: 'offen', ton: 'warnung' };
}

/** „Patient:in selbst" ist für die Person keine Auskunft - nur ein anderer Adressat. */
export function anJemandAnderen(z: {
  recipient_kind: string | null;
  recipient_name: string | null;
}) {
  return z.recipient_kind && z.recipient_kind !== 'self' ? z.recipient_name : null;
}

export interface Positionsgruppe {
  code: string;
  label: string;
  item_kind: string;
  unit_price_cents: number;
  currency: string;
  menge: number;
  summe_cents: number;
  tage: string[];
}

/**
 * Gleiche Positionen mit ihren Behandlungstagen (ABR-032): je Leistung eine
 * Zeile mit Einzelpreis, Menge und Betrag - dieselbe Zusammenfassung wie auf
 * dem Blatt der Praxis. Addiert wird nur, was im Dokument steht.
 */
export function positionen(zeilen: readonly Rechnungsposition[]): Positionsgruppe[] {
  const gruppen = new Map<string, Positionsgruppe>();
  for (const z of zeilen) {
    const schluessel = [z.code, z.label, z.item_kind, z.unit_price_cents, z.currency].join('|');
    const gruppe = gruppen.get(schluessel) ?? {
      code: z.code,
      label: z.label,
      item_kind: z.item_kind,
      unit_price_cents: z.unit_price_cents,
      currency: z.currency,
      menge: 0,
      summe_cents: 0,
      tage: [],
    };
    gruppe.menge += z.quantity;
    gruppe.summe_cents += z.line_total_cents;
    if (!gruppe.tage.includes(z.performed_on)) gruppe.tage.push(z.performed_on);
    gruppen.set(schluessel, gruppe);
  }
  return [...gruppen.values()].map((g) => ({ ...g, tage: [...g.tage].sort() }));
}
