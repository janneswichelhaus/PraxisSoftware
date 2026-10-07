import type { Ton } from '@/components/ui/Badge';
import { formatDate } from '@/lib/datum';
import { BAUARTEN, grundlageBezeichnung, type Bauart } from '@/features/treatment-bases/api';
import { empfaengerartLabels, type Leistungsbereich, type Zahlungsstand } from './api';

/**
 * Anzeigehilfen der Abrechnung (UXR-010).
 *
 * Hier steht nur, wie ein Wert **aussieht** - nichts, was einen Wert
 * bestimmt. Beträge, Zahlungsstand, Nummern und Fristen kommen vom Server
 * (ADR-009 Punkt 12); diese Datei formt sie für den Bildschirm und das Blatt.
 *
 * Eigene Datei statt einer Hilfsfunktion in einer Seite: Eine Modul-Datei mit
 * Komponente und Funktion hebelt das schnelle Neuladen aus (`react-refresh`),
 * und Rechnungsliste, Rechnung und Blätter brauchen dieselben Formen.
 */

const MONATE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

/** „2026-08-01" als „August 2026". Ohne Zeitzonenrechnung: ein Monat ist kein Zeitpunkt. */
export function monatsname(iso: string): string {
  const [jahr, monat] = iso.split('-');
  const name = MONATE[Number(monat) - 1];
  return name === undefined || jahr === undefined ? iso : `${name} ${jahr}`;
}

/**
 * Der Zahlungsstand als Ton eines Etiketts.
 *
 * „Bezahlt" ist der ruhige Fall; die Überzahlung trägt das Warnzeichen - sie
 * verlangt eine Entscheidung (zurückzahlen oder stehen lassen) und darf nicht
 * wie ein erledigter Vorgang aussehen. „Offen" ist der Normalfall einer
 * ausgestellten Rechnung und trägt keins (ABR-16): Handlungsbedarf zeigt erst
 * „Überfällig".
 */
export const zahlungsTon: Record<Zahlungsstand, Ton> = {
  unpaid: 'neutral',
  partially_paid: 'warnung',
  paid: 'positiv',
  overpaid: 'warnung',
};

/**
 * Eine IBAN in Vierergruppen, wie sie auf Papier steht (ABR-28, DIN 5008).
 *
 * Nur die Anzeige: Gespeichert ist sie ohne Leerzeichen, und so bleibt sie
 * (`save_practice_billing_profile` entfernt sie). Abgetippt wird sie vom
 * Blatt - in Gruppen verliert man die Stelle nicht.
 */
export function ibanInGruppen(iban: string): string {
  const zeichen = iban.replace(/\s/g, '');
  return (zeichen.match(/.{1,4}/g) ?? []).join(' ');
}

function istBauart(wert: string): wert is Bauart {
  return (BAUARTEN as readonly string[]).includes(wert);
}

/**
 * Die Behandlungsgrundlage auf Rechnung und Blatt - mit denselben Wörtern wie
 * in der Akte (ABR-18, ADR-020 Punkt 7): „Erstverordnung vom 01.07.2026",
 * „Selbstzahler seit 03.09.2026".
 *
 * Das Dokument trägt nur die Kennung der Bauart; die Beschriftung entsteht in
 * der Darstellung. Eine unbekannte Kennung erscheint, wie sie ist - erfunden
 * wird keine.
 */
export function grundlageText(kind: string, tag: string): string {
  if (!istBauart(kind)) return `${kind} vom ${formatDate(tag)}`;
  const { bauart, praeposition } = grundlageBezeichnung({ treatment_basis_kind: kind });
  return `${bauart} ${praeposition} ${formatDate(tag)}`;
}

/**
 * Wie die Person heißt, für die geleistet wurde (TRN-008).
 *
 * In der Behandlung „Behandelt", im Training nicht: Training ist keine
 * Heilbehandlung (ADR-021). Snapshots vor `schema_version` 3 tragen keinen
 * Bereich und sind Behandlung.
 */
export function personLabel(bereich: Leistungsbereich | undefined, form: 'kurz' | 'blatt'): string {
  if (bereich === 'training') return 'Leistung für';
  return form === 'kurz' ? 'Behandelt' : 'Behandelte Person';
}

/**
 * Die Art des Empfängers am Dokument (TRN-008, ANN-182).
 *
 * Eine Trainingsrechnung geht an die Kund:in selbst - sie ist keine
 * Patient:in, auch wenn dieselbe Person eine Akte hat (ADR-021).
 */
export function empfaengerart(kind: string, bereich: Leistungsbereich | undefined): string {
  if (bereich === 'training' && kind === 'self') return 'Kund:in selbst';
  return empfaengerartLabels[kind] ?? 'Kostenträger';
}

/**
 * „Diagnose: M54.2 Zervikalsyndrom" - ICD-10 und Text der Verordnung, seit
 * schema_version 4 (ANN-229). `null`, wenn der Snapshot keine trägt.
 */
export function diagnoseText(basis: {
  diagnosis_icd10?: string | null | undefined;
  diagnosis?: string | null | undefined;
}): string | null {
  const teile = [basis.diagnosis_icd10, basis.diagnosis].filter(Boolean);
  return teile.length > 0 ? `Diagnose: ${teile.join(' ')}` : null;
}

/**
 * Die Klammer einer Rechnung oder eines Kandidaten (ABR-032, ANN-077
 * Fassung 2): die Verordnung, wenn eine dahintersteht, sonst der Monat.
 */
export function klammerText(eintrag: {
  basis_kind?: string | null;
  basis_issued_on?: string | null;
  period_month: string;
}): string {
  return eintrag.basis_kind && eintrag.basis_issued_on
    ? grundlageText(eintrag.basis_kind, eintrag.basis_issued_on)
    : monatsname(eintrag.period_month);
}

/**
 * Der Leistungszeitraum: „22.07.2026 bis 27.08.2026", an einem Tag nur der
 * Tag. Ohne Angabe (Snapshots vor `schema_version` 5) `null`.
 */
export function zeitraumText(
  zeitraum: { from: string; to: string } | null | undefined,
): string | null {
  if (!zeitraum) return null;
  return zeitraum.from === zeitraum.to
    ? formatDate(zeitraum.from)
    : `${formatDate(zeitraum.from)} bis ${formatDate(zeitraum.to)}`;
}

/** Eine Zeile des Rechnungsdokuments, soweit die Gruppierung sie braucht. */
interface Dokumentzeile {
  performed_on: string;
  code: string;
  label: string;
  item_kind: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  currency: string;
  tax_treatment: string;
  tax_rate_permille: number;
  /** ANG-002: letzter Tag eines Abo-Monats. */
  period_until?: string | null | undefined;
}

export interface Rechnungsposition {
  code: string;
  label: string;
  item_kind: string;
  unit_price_cents: number;
  currency: string;
  menge: number;
  summe_cents: number;
  /** Behandlungstage, aufsteigend, je Tag einmal. */
  tage: string[];
  /** ANG-002: Zeiträume der Abo-Monate, aufsteigend; leer an anderen Positionen. */
  zeitraeume: { von: string; bis: string }[];
}

/**
 * Gleiche Positionen mit ihren Behandlungstagen (ABR-032, ADR-009 Punkt 23).
 *
 * So erwarten Beihilfe und private Versicherung die Rechnung: je Heilmittel
 * eine Position mit Einzelpreis, Menge und den Tagen, an denen es erbracht
 * wurde. Gleich ist eine Position mit demselben Kürzel, derselben
 * Bezeichnung, demselben Einzelpreis und derselben steuerlichen Einordnung;
 * verschiedene Anteile am Terminhonorar bleiben getrennte Positionen. Die
 * Beträge kommen unverändert aus dem Dokument - hier wird nur addiert, was
 * dort schon steht.
 */
export function positionenMitTagen(zeilen: readonly Dokumentzeile[]): Rechnungsposition[] {
  const gruppen = new Map<string, Rechnungsposition>();
  for (const z of zeilen) {
    const schluessel = [
      z.code,
      z.label,
      z.item_kind,
      z.unit_price_cents,
      z.currency,
      z.tax_treatment,
      z.tax_rate_permille,
    ].join('|');
    const gruppe = gruppen.get(schluessel) ?? {
      code: z.code,
      label: z.label,
      item_kind: z.item_kind,
      unit_price_cents: z.unit_price_cents,
      currency: z.currency,
      menge: 0,
      summe_cents: 0,
      tage: [],
      zeitraeume: [],
    };
    gruppe.menge += z.quantity;
    gruppe.summe_cents += z.line_total_cents;
    if (!gruppe.tage.includes(z.performed_on)) gruppe.tage.push(z.performed_on);
    if (z.period_until && !gruppe.zeitraeume.some((r) => r.von === z.performed_on))
      gruppe.zeitraeume.push({ von: z.performed_on, bis: z.period_until });
    gruppen.set(schluessel, gruppe);
  }
  for (const gruppe of gruppen.values()) {
    gruppe.tage.sort();
    gruppe.zeitraeume.sort((a, b) => a.von.localeCompare(b.von));
  }
  return [...gruppen.values()];
}
