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
 * schema_version 4 (ANN-228). `null`, wenn der Snapshot keine trägt.
 */
export function diagnoseText(basis: {
  diagnosis_icd10?: string | null | undefined;
  diagnosis?: string | null | undefined;
}): string | null {
  const teile = [basis.diagnosis_icd10, basis.diagnosis].filter(Boolean);
  return teile.length > 0 ? `Diagnose: ${teile.join(' ')}` : null;
}
