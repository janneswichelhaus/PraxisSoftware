import { formatEuro } from '@/lib/geld';

/**
 * Die fünf Kennzahlen der Praxisführung (STA-EPIC-001) — was sie heißen, in
 * welcher Richtung ihr Ziel gilt und welche eine Handlung sie auslösen.
 *
 * Gerechnet wird nichts hier: Die Zahlen kommen fertig aus
 * `get_practice_statistics` (STA-001), der einen Quelle. Diese Datei ordnet
 * sie nur ein. ANN-155: Richtung der Zielwerte und die Handlung je Kennzahl
 * stehen an genau dieser Stelle.
 */

export interface Kennzahlen {
  time_zone: string;
  today: string;
  month: string;
  previous_month: string;
  revenue_cents: number;
  revenue_therapy_cents: number;
  revenue_training_cents: number;
  revenue_previous_cents: number;
  payments_cents: number;
  payments_previous_cents: number;
  open_count: number;
  open_cents: number;
  open_not_due_count: number;
  open_not_due_cents: number;
  open_overdue_1_30_count: number;
  open_overdue_1_30_cents: number;
  open_overdue_31_60_count: number;
  open_overdue_31_60_cents: number;
  open_overdue_over_60_count: number;
  open_overdue_over_60_cents: number;
  utilization_from: string;
  utilization_to: string;
  available_minutes: number;
  booked_minutes: number;
  ending_bases: number;
  uncovered_appointments: number;
  absences_from: string;
  absences_to: string;
  patient_cancellations: number;
  no_shows: number;
  absences_with_fee: number;
  absence_fee_cents: number;
  absences_previous: number;
  absence_fee_previous_cents: number;
}

/** Die Kennung eines Zielwerts — zugleich der Name im Server (`set_practice_target`). */
export type Zielkennung =
  'revenue_cents' | 'open_items_cents' | 'utilization_percent' | 'ending_bases' | 'absences';

export type Ziele = Record<Zielkennung, number | null>;

export type Richtung = 'mindestens' | 'hoechstens';
export type Einheit = 'cent' | 'prozent' | 'anzahl';

export interface Kennzahl {
  ziel: Zielkennung;
  titel: string;
  einheit: Einheit;
  richtung: Richtung;
  /** Der Wert, an dem das Ziel gemessen wird; `null`, wo es keinen gibt. */
  wert: (k: Kennzahlen) => number | null;
  handlung: { label: string; to: string };
}

/** Anteil der gebuchten an der verfügbaren Zeit in ganzen Prozent; ohne Arbeitszeit keiner. */
export function auslastungProzent(k: Pick<Kennzahlen, 'booked_minutes' | 'available_minutes'>) {
  if (k.available_minutes <= 0) return null;
  return Math.round((k.booked_minutes / k.available_minutes) * 100);
}

export function ausfaelle(k: Pick<Kennzahlen, 'patient_cancellations' | 'no_shows'>): number {
  return k.patient_cancellations + k.no_shows;
}

// ANN-155: Richtung und Handlung je Kennzahl.
export const KENNZAHLEN: readonly Kennzahl[] = [
  {
    ziel: 'revenue_cents',
    titel: 'Umsatz',
    einheit: 'cent',
    richtung: 'mindestens',
    wert: (k) => k.revenue_cents,
    handlung: { label: 'Zu den Rechnungen', to: '/abrechnung' },
  },
  {
    ziel: 'open_items_cents',
    titel: 'Offene Posten',
    einheit: 'cent',
    richtung: 'hoechstens',
    wert: (k) => k.open_cents,
    handlung: { label: 'Offene Posten mahnen', to: '/abrechnung' },
  },
  {
    ziel: 'utilization_percent',
    titel: 'Auslastung',
    einheit: 'prozent',
    richtung: 'mindestens',
    wert: auslastungProzent,
    handlung: { label: 'Freie Fenster aus der Warteliste füllen', to: '/warteliste' },
  },
  {
    ziel: 'ending_bases',
    titel: 'Verordnungen ohne Anschluss',
    einheit: 'anzahl',
    richtung: 'hoechstens',
    wert: (k) => k.ending_bases,
    handlung: { label: 'Verordner:innen anfragen', to: '/offen' },
  },
  {
    ziel: 'absences',
    titel: 'Ausfälle',
    einheit: 'anzahl',
    richtung: 'hoechstens',
    wert: ausfaelle,
    handlung: { label: 'Anrufliste für morgen', to: '/offen/anrufe' },
  },
];

export type Zielstand = 'erreicht' | 'verfehlt' | null;

/** Liegt der Wert auf der richtigen Seite des Ziels? Ohne Ziel oder Wert keine Aussage. */
export function zielstand(wert: number | null, ziel: number | null, richtung: Richtung): Zielstand {
  if (wert === null || ziel === null) return null;
  const erreicht = richtung === 'mindestens' ? wert >= ziel : wert <= ziel;
  return erreicht ? 'erreicht' : 'verfehlt';
}

export function formatiere(wert: number | null, einheit: Einheit): string {
  if (wert === null) return '—';
  if (einheit === 'cent') return formatEuro(wert);
  if (einheit === 'prozent') return `${wert} %`;
  return new Intl.NumberFormat('de-DE').format(wert);
}

/** „2026-09-01" wird „September 2026". */
export function monatsname(isoTag: string): string {
  const [jahr, monat] = isoTag.split('-').map(Number);
  return new Intl.DateTimeFormat('de-DE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(jahr!, monat! - 1, 1)));
}

/** „2026-09-29" wird „29.09.2026". */
export function tagText(isoTag: string): string {
  const [jahr, monat, tag] = isoTag.split('-');
  return `${tag}.${monat}.${jahr}`;
}

/** Die letzten zwölf Monate bis zum Monat von `heute`, jüngster zuerst, als Monatsanfang. */
export function monatsauswahl(heute: string): string[] {
  const [jahr, monat] = heute.split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(jahr!, monat! - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  });
}

/** Eine Zielwert-Eingabe in die Zahl, die der Server erwartet; leer heißt „kein Ziel". */
export function zielAusEingabe(
  eingabe: string,
  einheit: Einheit,
): { ok: true; wert: number | null } | { ok: false } {
  const text = eingabe.trim();
  if (text === '') return { ok: true, wert: null };
  if (einheit === 'cent') {
    const bereinigt = text.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    // Verankert und ohne verschachtelte Wiederholung - linear.
    // eslint-disable-next-line security/detect-unsafe-regex
    if (!/^\d+(\.\d{1,2})?$/.test(bereinigt)) return { ok: false };
    return { ok: true, wert: Math.round(Number(bereinigt) * 100) };
  }
  if (!/^\d+$/.test(text)) return { ok: false };
  const wert = Number(text);
  if (einheit === 'prozent' && wert > 100) return { ok: false };
  return { ok: true, wert };
}

/** Ein Zielwert als Eingabetext: Euro ohne Zeichen, sonst die Zahl. */
export function zielAlsEingabe(wert: number | null, einheit: Einheit): string {
  if (wert === null) return '';
  if (einheit === 'cent') return (wert / 100).toFixed(2).replace('.', ',');
  return String(wert);
}

/**
 * Die Kennzahlen als CSV — nur Summen, keine Person (§20).
 *
 * Semikolon als Trenner und Komma in Beträgen, wie es eine deutsche
 * Tabellenkalkulation erwartet; Beträge in Euro mit zwei Stellen, ohne
 * Tausenderpunkt, damit sie als Zahl ankommen.
 */
export function alsCsv(k: Kennzahlen, ziele: Ziele): string {
  const euro = (cent: number) => (cent / 100).toFixed(2).replace('.', ',');
  const ziel = (kennung: Zielkennung, einheit: Einheit) => {
    const wert = ziele[kennung];
    if (wert === null) return '';
    return einheit === 'cent' ? euro(wert) : String(wert);
  };
  const auslastung = auslastungProzent(k);
  const zeilen: string[][] = [
    ['Kennzahl', 'Zeitraum', 'Wert', 'Vergleich', 'Vergleichszeitraum', 'Ziel', 'Einheit'],
    [
      'Umsatz (Rechnungsstellung, brutto)',
      monatsname(k.month),
      euro(k.revenue_cents),
      euro(k.revenue_previous_cents),
      monatsname(k.previous_month),
      ziel('revenue_cents', 'cent'),
      'EUR',
    ],
    ['Umsatz Behandlung', monatsname(k.month), euro(k.revenue_therapy_cents), '', '', '', 'EUR'],
    ['Umsatz Training', monatsname(k.month), euro(k.revenue_training_cents), '', '', '', 'EUR'],
    [
      'Zahlungseingang (Zufluss)',
      monatsname(k.month),
      euro(k.payments_cents),
      euro(k.payments_previous_cents),
      monatsname(k.previous_month),
      '',
      'EUR',
    ],
    [
      'Offene Posten',
      `Stand ${tagText(k.today)}`,
      euro(k.open_cents),
      '',
      '',
      ziel('open_items_cents', 'cent'),
      'EUR',
    ],
    [
      'Offene Posten, noch nicht fällig',
      `Stand ${tagText(k.today)}`,
      euro(k.open_not_due_cents),
      '',
      '',
      '',
      'EUR',
    ],
    [
      'Offene Posten, 1 bis 30 Tage überfällig',
      `Stand ${tagText(k.today)}`,
      euro(k.open_overdue_1_30_cents),
      '',
      '',
      '',
      'EUR',
    ],
    [
      'Offene Posten, 31 bis 60 Tage überfällig',
      `Stand ${tagText(k.today)}`,
      euro(k.open_overdue_31_60_cents),
      '',
      '',
      '',
      'EUR',
    ],
    [
      'Offene Posten, über 60 Tage überfällig',
      `Stand ${tagText(k.today)}`,
      euro(k.open_overdue_over_60_cents),
      '',
      '',
      '',
      'EUR',
    ],
    [
      'Auslastung',
      `${tagText(k.utilization_from)} bis ${tagText(k.utilization_to)}`,
      auslastung === null ? '' : String(auslastung),
      '',
      '',
      ziel('utilization_percent', 'prozent'),
      'Prozent',
    ],
    [
      'Verordnungen ohne Anschluss',
      `Stand ${tagText(k.today)}`,
      String(k.ending_bases),
      '',
      '',
      ziel('ending_bases', 'anzahl'),
      'Anzahl',
    ],
    [
      'Kommende Termine ohne Deckung',
      `Stand ${tagText(k.today)}`,
      String(k.uncovered_appointments),
      '',
      '',
      '',
      'Anzahl',
    ],
    [
      'Ausfälle',
      `${tagText(k.absences_from)} bis ${tagText(k.absences_to)}`,
      String(ausfaelle(k)),
      String(k.absences_previous),
      'vier Wochen davor',
      ziel('absences', 'anzahl'),
      'Anzahl',
    ],
    [
      'Ausfallhonorare',
      `${tagText(k.absences_from)} bis ${tagText(k.absences_to)}`,
      euro(k.absence_fee_cents),
      euro(k.absence_fee_previous_cents),
      'vier Wochen davor',
      '',
      'EUR',
    ],
  ];
  return zeilen.map((zeile) => zeile.map(csvFeld).join(';')).join('\r\n') + '\r\n';
}

function csvFeld(wert: string): string {
  return /[;"\r\n]/.test(wert) ? `"${wert.replace(/"/g, '""')}"` : wert;
}

/** Dateiname der CSV: Monat und Stichtag, kein Name. */
export function csvDateiname(k: Pick<Kennzahlen, 'month' | 'today'>): string {
  return `statistik-${k.month.slice(0, 7)}-stand-${k.today}.csv`;
}
