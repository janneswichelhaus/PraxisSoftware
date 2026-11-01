import { RUECKWEG_PARAM } from '@/lib/rueckweg';

/**
 * Der Buchungsstapel im DATEV-Format (EXTF 700, Kategorie 21, Formatversion 13): eine CSV-Datei
 * in Windows-1252 mit Kopfzeile, Spaltenzeile und je Buchung einer Zeile. Rein und ohne Netz.
 */

export type Kontenrahmen = 'SKR03' | 'SKR04';
export type DatevBereich = 'therapy' | 'training';
export type Buchungsart = 'invoice' | 'cancellation' | 'payment' | 'payment_void';

/** Eine Zeile vom Server: Dokument, Tag und Betrag, ohne Namen und Diagnose (ANN-829). */
export interface DatevBuchung {
  kind: Buchungsart;
  document_date: string;
  invoice_number: string;
  document_number: string | null;
  tax_treatment: 'exempt_healthcare' | 'taxable' | 'not_taxable' | null;
  tax_rate_permille: number | null;
  small_business: boolean;
  amount_cents: number;
  direction: 'incoming' | 'refund' | null;
  method: 'bank_transfer' | 'other' | 'offset' | null;
  currency: string;
}

export interface DatevLauf {
  id: string;
  service_area: DatevBereich;
  period_month: string;
  sequence: number;
  consultant_number: number;
  client_number: number;
  chart_of_accounts: Kontenrahmen;
  created_stamp: string;
  bookings: DatevBuchung[];
}

export interface Konten {
  /** Sammeldebitor: kein Personenkonto, also kein Name beim Steuerbüro (ANN-829). */
  debitor: number;
  bank: number;
  kasse: number;
  geldtransit: number;
  steuerfrei: number;
  regelsatz: number;
  ermaessigt: number;
  nichtSteuerbar: number;
  kleinunternehmer: number;
}

/** ANN-828: Standardkonten je Kontenrahmen, bis die Steuerberatung andere nennt (B4). */
export const KONTENRAHMEN: Record<Kontenrahmen, Konten> = {
  SKR03: {
    debitor: 10000,
    bank: 1200,
    kasse: 1000,
    geldtransit: 1360,
    steuerfrei: 8100,
    regelsatz: 8400,
    ermaessigt: 8300,
    nichtSteuerbar: 8200,
    kleinunternehmer: 8195,
  },
  SKR04: {
    debitor: 10000,
    bank: 1800,
    kasse: 1600,
    geldtransit: 1460,
    steuerfrei: 4100,
    regelsatz: 4400,
    ermaessigt: 4300,
    nichtSteuerbar: 4200,
    kleinunternehmer: 4185,
  },
};

/** Ein Fehler, den die Seite so zeigen kann, wie er ist. */
export class DatevFehler extends Error {
  constructor(satz: string) {
    super(satz);
    this.name = 'DatevFehler';
  }
}

export interface Buchungszeile {
  umsatzCent: number;
  sollHaben: 'S' | 'H';
  konto: number;
  gegenkonto: number;
  /** YYYY-MM-DD; in der Datei als TTMM, das Jahr steht im Kopf. */
  belegdatum: string;
  belegfeld1: string;
  buchungstext: string;
}

const RANG: Record<Buchungsart, number> = {
  invoice: 1,
  cancellation: 2,
  payment: 3,
  payment_void: 4,
};

function erloeskonto(konten: Konten, b: DatevBuchung): number {
  if (b.small_business) return konten.kleinunternehmer;
  if (b.tax_treatment === 'exempt_healthcare') return konten.steuerfrei;
  if (b.tax_treatment === 'not_taxable') return konten.nichtSteuerbar;
  if (b.tax_treatment === 'taxable' && b.tax_rate_permille === 190) return konten.regelsatz;
  if (b.tax_treatment === 'taxable' && b.tax_rate_permille === 70) return konten.ermaessigt;
  throw new DatevFehler(
    `Für ${b.invoice_number} fehlt ein Erlöskonto (${(b.tax_rate_permille ?? 0) / 10} %).`,
  );
}

function geldkonto(konten: Konten, b: DatevBuchung): number {
  if (b.method === 'offset') return konten.geldtransit;
  if (b.method === 'other') return konten.kasse;
  return konten.bank;
}

function zahlungswort(b: DatevBuchung): string {
  if (b.method === 'offset') return 'Verrechnung';
  return b.direction === 'refund' ? 'Erstattung' : 'Zahlung';
}

/** Belegfeld 1 trägt die Rechnungsnummer, damit offene Posten sich ausgleichen (ANN-828). */
function belegfeld(nummer: string): string {
  const wert = nummer.trim().toUpperCase();
  if (!/^[A-Z0-9$&%*+\-/]{1,36}$/.test(wert)) {
    throw new DatevFehler(`Die Rechnungsnummer ${nummer} passt nicht in das Belegfeld.`);
  }
  return wert;
}

/** Eine Zeile vom Server als Buchung: Konto, Gegenkonto und Richtung nach ANN-828. */
export function buchungszeile(b: DatevBuchung, rahmen: Kontenrahmen): Buchungszeile {
  if (b.currency !== 'EUR') throw new DatevFehler('Nur Beträge in Euro lassen sich exportieren.');
  if (!Number.isInteger(b.amount_cents) || b.amount_cents <= 0) {
    throw new DatevFehler(`Der Betrag zu ${b.invoice_number} ist nicht exportierbar.`);
  }
  const konten = KONTENRAHMEN[rahmen];
  const nummer = belegfeld(b.invoice_number);
  const basis = { umsatzCent: b.amount_cents, belegdatum: b.document_date, belegfeld1: nummer };

  if (b.kind === 'invoice' || b.kind === 'cancellation') {
    const storno = b.kind === 'cancellation';
    return {
      ...basis,
      sollHaben: storno ? 'H' : 'S',
      konto: konten.debitor,
      gegenkonto: erloeskonto(konten, b),
      buchungstext: storno
        ? `Storno ${b.document_number ?? ''} zu ${nummer}`
        : `Rechnung ${nummer}`,
    };
  }

  const eingang = b.direction !== 'refund';
  const zurueck = b.kind === 'payment_void';
  return {
    ...basis,
    sollHaben: eingang !== zurueck ? 'S' : 'H',
    konto: geldkonto(konten, b),
    gegenkonto: konten.debitor,
    buchungstext: `${zurueck ? 'Storno ' : ''}${zahlungswort(b)} ${nummer}`,
  };
}

/** Feste Reihenfolge, gleich in welcher Folge der Server liefert: dieselbe Datei bei jedem Abruf. */
export function sortiert(buchungen: readonly DatevBuchung[]): DatevBuchung[] {
  const schluessel = (b: DatevBuchung) =>
    [
      b.document_date,
      RANG[b.kind],
      b.invoice_number,
      b.tax_treatment ?? '',
      String(b.tax_rate_permille ?? 0).padStart(4, '0'),
      b.direction ?? '',
      b.method ?? '',
      String(b.amount_cents).padStart(12, '0'),
    ].join('|');
  return [...buchungen].sort((a, b) => (schluessel(a) < schluessel(b) ? -1 : 1));
}

const SPALTEN = [
  'Umsatz (ohne Soll/Haben-Kz)',
  'Soll/Haben-Kennzeichen',
  'WKZ Umsatz',
  'Kurs',
  'Basis-Umsatz',
  'WKZ Basis-Umsatz',
  'Konto',
  'Gegenkonto (ohne BU-Schlüssel)',
  'BU-Schlüssel',
  'Belegdatum',
  'Belegfeld 1',
  'Belegfeld 2',
  'Skonto',
  'Buchungstext',
  'Postensperre',
  'Diverse Adressnummer',
  'Geschäftspartnerbank',
  'Sachverhalt',
  'Zinssperre',
  'Beleglink',
  ...Array.from({ length: 8 }, (_, i) => [
    `Beleginfo - Art ${i + 1}`,
    `Beleginfo - Inhalt ${i + 1}`,
  ]).flat(),
  'KOST1 - Kostenstelle',
  'KOST2 - Kostenstelle',
  'Kost-Menge',
  'EU-Land u. UStID (Bestimmung)',
  'EU-Steuersatz (Bestimmung)',
  'Abw. Versteuerungsart',
  'Sachverhalt L+L',
  'Funktionsergänzung L+L',
  'BU 49 Hauptfunktionstyp',
  'BU 49 Hauptfunktionsnummer',
  'BU 49 Funktionsergänzung',
  ...Array.from({ length: 20 }, (_, i) => [
    `Zusatzinformation - Art ${i + 1}`,
    `Zusatzinformation - Inhalt ${i + 1}`,
  ]).flat(),
  'Stück',
  'Gewicht',
  'Zahlweise',
  'Forderungsart',
  'Veranlagungsjahr',
  'Zugeordnete Fälligkeit',
  'Skontotyp',
  'Auftragsnummer',
  'Buchungstyp',
  'USt-Schlüssel (Anzahlungen)',
  'EU-Mitgliedstaat (Anzahlungen)',
  'Sachverhalt L+L (Anzahlungen)',
  'EU-Steuersatz (Anzahlungen)',
  'Erlöskonto (Anzahlungen)',
  'Herkunft-Kz',
  'Buchungs GUID',
  'KOST-Datum',
  'SEPA-Mandatsreferenz',
  'Skontosperre',
  'Gesellschaftername',
  'Beteiligtennummer',
  'Identifikationsnummer',
  'Zeichnernummer',
  'Postensperre bis',
  'Bezeichnung SoBil-Sachverhalt',
  'Kennzeichen SoBil-Buchung',
  'Festschreibung',
  'Leistungsdatum',
  'Datum Zuord. Steuerperiode',
  'Fälligkeit',
  'Generalumkehr (GU)',
  'Steuersatz',
  'Land',
  'Abrechnungsreferenz',
  'BVV-Position',
  'EU-Mitgliedstaat u. UStID (Ursprung)',
  'EU-Steuersatz (Ursprung)',
  'Abw. Skontokonto',
] as const;

/** Die Zahl der Spalten in Formatversion 13. */
export const SPALTENZAHL = SPALTEN.length;

function text(wert: string): string {
  return `"${wert.replaceAll('"', '""')}"`;
}

function betrag(cent: number): string {
  return `${Math.floor(cent / 100)},${String(cent % 100).padStart(2, '0')}`;
}

function ohneStriche(iso: string): string {
  return iso.replaceAll('-', '');
}

function letzterTag(monatsErster: string): string {
  const [jahr, monat] = monatsErster.split('-').map(Number) as [number, number];
  const tag = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  return `${monatsErster.slice(0, 8)}${String(tag).padStart(2, '0')}`;
}

const BEREICH: Record<DatevBereich, string> = { therapy: 'Behandlung', training: 'Training' };

/** Stapelbezeichnung, höchstens 30 Zeichen: Bereich, Monat, ab dem zweiten Lauf „Nachtrag n“. */
export function stapelname(lauf: Pick<DatevLauf, 'service_area' | 'period_month' | 'sequence'>) {
  const nachtrag = lauf.sequence > 1 ? ` Nachtrag ${lauf.sequence - 1}` : '';
  return `${BEREICH[lauf.service_area]} ${lauf.period_month.slice(0, 7)}${nachtrag}`.slice(0, 30);
}

export function dateiname(lauf: Pick<DatevLauf, 'service_area' | 'period_month' | 'sequence'>) {
  return `EXTF_Buchungsstapel_${BEREICH[lauf.service_area]}_${lauf.period_month.slice(0, 7)}_${lauf.sequence}.csv`;
}

/**
 * Die Kopfzeile, 31 Felder. Festschreibung 0, Sachkontenlänge 4 und das Wirtschaftsjahr ab
 * Januar sind ANN-828; die Steuerberatung schreibt nach ihrer Prüfung selbst fest.
 */
export function kopfzeile(lauf: DatevLauf): string {
  const von = lauf.period_month;
  const felder: (string | number)[] = [
    text('EXTF'),
    700,
    21,
    text('Buchungsstapel'),
    13,
    lauf.created_stamp,
    '',
    text('RE'),
    text(''),
    text(''),
    lauf.consultant_number,
    lauf.client_number,
    `${von.slice(0, 4)}0101`,
    4,
    ohneStriche(von),
    ohneStriche(letzterTag(von)),
    text(stapelname(lauf)),
    text(''),
    1,
    0,
    0,
    text('EUR'),
    '',
    text(''),
    '',
    '',
    text(lauf.chart_of_accounts === 'SKR03' ? '03' : '04'),
    '',
    '',
    text(''),
    text(''),
  ];
  return felder.join(';');
}

function datenzeile(z: Buchungszeile): string {
  const [, monat, tag] = z.belegdatum.split('-') as [string, string, string];
  const felder: string[] = new Array<string>(SPALTENZAHL).fill('');
  felder[0] = betrag(z.umsatzCent);
  felder[1] = text(z.sollHaben);
  felder[2] = text('EUR');
  felder[6] = String(z.konto);
  felder[7] = String(z.gegenkonto);
  felder[9] = `${tag}${monat}`;
  felder[10] = text(z.belegfeld1);
  felder[13] = text(z.buchungstext.slice(0, 60));
  return felder.join(';');
}

/** Der ganze Stapel als Text, jede Zeile mit CR LF abgeschlossen. */
export function buchungsstapel(lauf: DatevLauf): string {
  const zeilen = sortiert(lauf.bookings).map((b) => {
    // DATEV nimmt nur Belegdaten zwischen „Datum vom“ und „Datum bis“ des Kopfes an.
    if (b.document_date.slice(0, 7) !== lauf.period_month.slice(0, 7)) {
      throw new DatevFehler('Eine Buchung liegt außerhalb des Monats.');
    }
    return datenzeile(buchungszeile(b, lauf.chart_of_accounts));
  });
  return [kopfzeile(lauf), SPALTEN.map(text).join(';'), ...zeilen].map((z) => `${z}\r\n`).join('');
}

const SONDERZEICHEN_1252: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  ƒ: 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  ˆ: 0x88,
  '‰': 0x89,
  Š: 0x8a,
  '‹': 0x8b,
  Œ: 0x8c,
  Ž: 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  š: 0x9a,
  '›': 0x9b,
  œ: 0x9c,
  ž: 0x9e,
  Ÿ: 0x9f,
};

/** DATEV liest Windows-1252; ein Zeichen außerhalb bricht ab, statt still ein „?“ zu schreiben. */
export function inWindows1252(inhalt: string): Uint8Array<ArrayBuffer> {
  const bytes: number[] = [];
  for (const zeichen of inhalt) {
    const code = zeichen.codePointAt(0) ?? 0;
    const sonder = SONDERZEICHEN_1252[zeichen];
    if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) bytes.push(code);
    else if (sonder !== undefined) bytes.push(sonder);
    else throw new DatevFehler(`Das Zeichen „${zeichen}“ lässt sich nicht exportieren.`);
  }
  return Uint8Array.from(bytes);
}

// Seite und Formular der Steuerberatung, ohne React.

/** So viele Blätter nimmt ein Druckauftrag (wie der Sammeldruck). */
const BELEGE_JE_DRUCK = 100;

const ARTEN: [DatevBuchung['kind'], string, string][] = [
  ['invoice', 'Rechnung', 'Rechnungen'],
  ['cancellation', 'Storno', 'Stornos'],
  ['payment', 'Zahlung', 'Zahlungen'],
  ['payment_void', 'Zahlungsstorno', 'Zahlungsstornos'],
];

/** „3 Rechnungen · 1 Zahlung“: Rechnung und Storno je Dokument, nicht je Steuergruppe. */
export function zusammenfassung(buchungen: readonly DatevBuchung[]): string {
  const je = new Map<DatevBuchung['kind'], Set<string>>();
  buchungen.forEach((b, i) => {
    const menge = je.get(b.kind) ?? new Set<string>();
    menge.add(b.kind === 'invoice' || b.kind === 'cancellation' ? b.invoice_number : String(i));
    je.set(b.kind, menge);
  });
  return ARTEN.filter(([art]) => je.has(art))
    .map(([art, eins, viele]) => {
      const n = je.get(art)?.size ?? 0;
      return `${n} ${n === 1 ? eins : viele}`;
    })
    .join(' · ');
}

/** Der Sammeldruck je höchstens hundert Blätter: Rechnungen, dann Stornodokumente. */
export function belegdrucke(lauf: {
  invoice_ids: readonly string[];
  cancelled_invoice_ids: readonly string[];
}) {
  const blaetter = [
    ...lauf.invoice_ids.map((id) => ({ art: 'rechnungen' as const, id })),
    ...lauf.cancelled_invoice_ids.map((id) => ({ art: 'stornos' as const, id })),
  ];
  const drucke: { von: number; bis: number; to: string }[] = [];
  for (let start = 0; start < blaetter.length; start += BELEGE_JE_DRUCK) {
    const teil = blaetter.slice(start, start + BELEGE_JE_DRUCK);
    const suche = new URLSearchParams();
    for (const art of ['rechnungen', 'stornos'] as const) {
      const ids = teil.filter((b) => b.art === art).map((b) => b.id);
      if (ids.length > 0) suche.set(art, ids.join(','));
    }
    suche.set(RUECKWEG_PARAM, '/abrechnung/steuerberatung');
    drucke.push({ von: start + 1, bis: start + teil.length, to: `/abrechnung/druck?${suche}` });
  }
  return drucke;
}

export const DATEV_FELDER = ['berater', 'therapie', 'training', 'rahmen'] as const;
export type DatevFeld = (typeof DATEV_FELDER)[number];

export interface DatevEingabe {
  berater: string;
  therapie: string;
  training: string;
  rahmen: '' | 'SKR03' | 'SKR04';
}

export function datevZahl(wert: string): number | null {
  return /^\d+$/.test(wert.trim()) ? Number(wert.trim()) : null;
}

/** Dieselben Grenzen wie `save_datev_settings`; verbindlich prüft der Server. */
export function pruefeDatevAngaben(e: DatevEingabe): Partial<Record<DatevFeld, string>> {
  const fehler: Partial<Record<DatevFeld, string>> = {};
  const berater = datevZahl(e.berater);
  if (berater === null || berater < 1001 || berater > 9_999_999)
    fehler.berater = 'Vier- bis siebenstellig, ab 1001.';
  for (const feld of ['therapie', 'training'] as const) {
    const wert = datevZahl(e[feld]);
    if (e[feld].trim() !== '' && (wert === null || wert < 1 || wert > 99_999))
      fehler[feld] = 'Ein- bis fünfstellig.';
  }
  if (e.therapie.trim() === '' && e.training.trim() === '')
    fehler.therapie = 'Mindestens eine Mandantennummer.';
  if (e.rahmen === '') fehler.rahmen = 'Bitte wählen.';
  return fehler;
}
