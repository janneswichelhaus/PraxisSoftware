import { STATUSZEICHEN, type Ton } from '@/components/ui/Badge';
import { monatKurz } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import type { Reimbursement, ReimbursementStatus } from './api';

/**
 * Regeln der Erstattungen (ERS-001), die die Seiten teilen: Betrag des
 * Ladestroms, wählbare Monate, IBAN-Prüfung vor dem Absenden, Zustände als
 * Zeichen und Wort. Verbindlich rechnet und prüft der Server; hier steht
 * dasselbe, damit die Zusammenfassung vorher zeigt, was der Antrag ergibt.
 */

/**
 * Tage × Ladung × Satz in Cent, kaufmännisch auf ganze Cent - die Rechnung
 * der Anträge vor ORG-008 (ANN-599); sie behalten ihre Werte.
 */
export function electricityCents(days: number, whPerDay: number, centsPerKwh: number): number {
  return Math.floor((days * whPerDay * centsPerKwh + 500) / 1000);
}

/** „18 × 0,5 kWh × 0,37 €“ - die Rechnung, wie sie die Zusammenfassung nennt. */
export function electricityFormula(days: number, whPerDay: number, centsPerKwh: number): string {
  const kwh = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(whPerDay / 1000);
  return `${days} × ${kwh} kWh × ${formatEuro(centsPerKwh)}`;
}

/**
 * Seit ORG-008: geplante Minuten × Strecke je Stunde × Verbrauch × Satz in
 * Cent, kaufmännisch auf ganze Cent - dieselbe Rechnung wie
 * `app.electricity_amount_cents` und die Bedingung an der Tabelle.
 * (Minuten/60 · km · Wh / 1000) kWh · ct = Minuten · km · Wh · ct / 60 000.
 */
export function electricityCentsFromMinutes(
  minutes: number,
  kmPerHour: number,
  whPerKm: number,
  centsPerKwh: number,
): number {
  return Math.floor((minutes * kmPerHour * whPerKm * centsPerKwh + 30_000) / 60_000);
}

const DEZIMAL = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/** „160 h“ oder „157,5 h“ aus Minuten. */
export function hoursText(minutes: number): string {
  return `${DEZIMAL.format(minutes / 60)} h`;
}

/** „160 h × 6 km/h × 18 Wh/km × 0,37 €/kWh“ - die Rechnung, wie der Antrag sie nennt. */
export function electricityHoursFormula(
  minutes: number,
  kmPerHour: number,
  whPerKm: number,
  centsPerKwh: number,
): string {
  return `${hoursText(minutes)} × ${kmPerHour} km/h × ${whPerKm} Wh/km × ${formatEuro(centsPerKwh)}/kWh`;
}

/**
 * Seit BEF-181: km der geplanten Touren × Verbrauch × Satz in Cent,
 * kaufmännisch auf ganze Cent - dieselbe Rechnung wie
 * `record_electricity_tour_distance` und die Bedingung an der Tabelle.
 */
export function electricityCentsFromKm(km: number, whPerKm: number, centsPerKwh: number): number {
  return Math.floor((km * whPerKm * centsPerKwh + 500) / 1000);
}

/** „412 km × 18 Wh/km × 0,37 €/kWh“ - die Rechnung eines Antrags aus Touren. */
export function electricityKmFormula(km: number, whPerKm: number, centsPerKwh: number): string {
  return `${km} km × ${whPerKm} Wh/km × ${formatEuro(centsPerKwh)}/kWh`;
}

/** Die Rechnung eines Antrags - in der Form, in der er gestellt wurde; sonst `undefined`. */
export function electricityFormulaOf(
  r: Pick<
    Reimbursement,
    | 'kind'
    | 'working_days'
    | 'energy_wh_per_day'
    | 'working_minutes'
    | 'km_per_hour'
    | 'wh_per_km'
    | 'tour_km'
    | 'rate_cents_per_kwh'
  >,
): string | undefined {
  if (r.kind !== 'electricity' || r.rate_cents_per_kwh === null) return undefined;
  if (r.tour_km !== null && r.wh_per_km !== null) {
    return electricityKmFormula(r.tour_km, r.wh_per_km, r.rate_cents_per_kwh);
  }
  if (r.working_minutes !== null && r.km_per_hour !== null && r.wh_per_km !== null) {
    return electricityHoursFormula(
      r.working_minutes,
      r.km_per_hour,
      r.wh_per_km,
      r.rate_cents_per_kwh,
    );
  }
  if (r.working_days !== null && r.energy_wh_per_day !== null) {
    return electricityFormula(r.working_days, r.energy_wh_per_day, r.rate_cents_per_kwh);
  }
  return undefined;
}

/**
 * Die wählbaren Monate für Ladestrom: die zwölf abgeschlossenen vor dem
 * laufenden, der jüngste zuerst - als Erster des Monats `YYYY-MM-01`.
 */
export function selectableMonths(today: string): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 2 - i, 1));
    return d.toISOString().slice(0, 10);
  });
}

const MONTH_LONG = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** „September 2026“. */
export function monthLong(firstDay: string): string {
  return MONTH_LONG.format(new Date(`${firstDay}T00:00:00Z`));
}

/** „Sept.“ - für die Kachel, dieselbe Kurzform wie beim Urlaub; das Jahr steht in der Gruppe. */
export function monthShort(firstDay: string): string {
  return monatKurz(firstDay);
}

/** Tage eines Monats, `YYYY-MM-01`. */
export function daysInMonth(firstDay: string): number {
  return new Date(
    Date.UTC(Number(firstDay.slice(0, 4)), Number(firstDay.slice(5, 7)), 0),
  ).getUTCDate();
}

/** Ohne Leerzeichen, in Großbuchstaben - so speichert der Server sie. */
export function normalizeIban(input: string): string {
  return input.replace(/\s/g, '').toUpperCase();
}

/**
 * Die Prüfziffer der IBAN nach ISO 13616 (mod 97 == 1), wie
 * `app.iban_checksum_ok`. Verbindlich ist die am Server; hier fällt ein
 * Zahlendreher schon vor dem Absenden auf.
 */
export function ibanValid(input: string): boolean {
  const iban = normalizeIban(input);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  let rest = 0;
  for (const char of iban.slice(4) + iban.slice(0, 4)) {
    rest =
      char >= '0' && char <= '9'
        ? (rest * 10 + Number(char)) % 97
        : (rest * 100 + (char.charCodeAt(0) - 55)) % 97;
  }
  return rest === 1;
}

/** Zustand als Zeichen und Wort (DESIGN.md Regel 5); der Regelfall ohne Abzeichen nicht nötig. */
export const STATUS_LABEL: Record<ReimbursementStatus, string> = {
  requested: 'Beantragt',
  approved: 'Genehmigt',
  rejected: 'Abgelehnt',
  withdrawn: 'Zurückgezogen',
  paid: 'Ausgezahlt',
};

export const STATUS_TONE: Record<ReimbursementStatus, Ton> = {
  requested: 'warnung',
  approved: 'positiv',
  rejected: 'kritisch',
  withdrawn: 'neutral',
  paid: 'positiv',
};

/**
 * Das Zeichen eines Zustands ohne eigenen Ton: „× Zurückgezogen“ wie
 * „× Abgesagt“ - bewusst nicht (Design-Review Überholung 10, Regel 5).
 */
export const STATUS_SIGN: Partial<Record<ReimbursementStatus, string>> = {
  withdrawn: STATUSZEICHEN.abgelehnt,
};

/** „Ladestrom September 2026“ oder „Einkauf: Massageöl, Tape“. */
export function reimbursementTitle(r: Pick<Reimbursement, 'kind' | 'period_month' | 'receipts'>) {
  if (r.kind === 'electricity') {
    return r.period_month ? `Ladestrom ${monthLong(r.period_month)}` : 'Ladestrom';
  }
  const purposes = r.receipts.map((receipt) => receipt.purpose);
  return purposes.length > 0 ? `Einkauf: ${purposes.join(', ')}` : 'Einkauf';
}
