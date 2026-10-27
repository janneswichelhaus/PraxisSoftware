import { STATUSZEICHEN, type Ton } from '@/components/ui/Badge';
import { monatPlus, monatsBeginn } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import type { Reimbursement, ReimbursementStatus } from './api';

/** Was die Seiten der Erstattungen teilen; verbindlich prüft und rechnet der Server. */

const KWH = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });
const HOURS = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/**
 * Der Rechenweg eines älteren Ladestrom-Antrags so, wie er gestellt wurde: aus Touren, Stunden
 * oder Tagen. Ausgezahlte sind Belege und behalten ihn (ANN-749); sonst `undefined`.
 */
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
  const rate = formatEuro(r.rate_cents_per_kwh);
  if (r.tour_km !== null && r.wh_per_km !== null) {
    return `${r.tour_km} km × ${r.wh_per_km} Wh/km × ${rate}/kWh`;
  }
  if (r.working_minutes !== null && r.km_per_hour !== null && r.wh_per_km !== null) {
    const hours = HOURS.format(r.working_minutes / 60);
    return `${hours} h × ${r.km_per_hour} km/h × ${r.wh_per_km} Wh/km × ${rate}/kWh`;
  }
  if (r.working_days !== null && r.energy_wh_per_day !== null) {
    return `${r.working_days} × ${KWH.format(r.energy_wh_per_day / 1000)} kWh × ${rate}`;
  }
  return undefined;
}

const MONTH_LONG = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** „September 2026“. */
function monthLong(firstDay: string): string {
  return MONTH_LONG.format(new Date(`${firstDay}T00:00:00Z`));
}

/**
 * „Ladestrom September 2026“: Der Einstieg Ladestrom belegt den Zweck mit dem jüngsten
 * abgeschlossenen Monat vor, denn abgerechnet wird ein vergangener Monat (ANN-749).
 */
export function electricityPurpose(today: string): string {
  return `Ladestrom ${monthLong(monatPlus(monatsBeginn(today), -1))}`;
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
