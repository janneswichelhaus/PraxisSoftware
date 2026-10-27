import type { MeinPaket } from './api';
import { datum } from './zeit';

/**
 * Die Bedingungen eines Trainingspakets, wie die Plattform sie vor dem Kauf
 * nennt (ANG-008, IDEA-ANG-004, PROJECT_PRINCIPLES.md 4.10).
 *
 * Eine Stelle für den Wortlaut: Laufzeit ohne Pause (ANN-277), Zahlung einmal
 * zu Beginn (ANN-276), Termine im Zeitraum abgegolten (ANN-279), Rückfall in
 * die Behandlung (ANN-280), Plattform im Preis und Abschluss in der Praxis
 * (ANN-281). Ändert sich eine dieser Annahmen, ändert sich der Satz hier.
 */
export const PAKETINHALT: readonly string[] = [
  'Ein Paket gilt für die genannte Laufzeit ab dem vereinbarten Beginn. Es lässt sich nicht pausieren und nicht vorzeitig kündigen.',
  'Sie bezahlen einmal zu Beginn und bekommen eine Rechnung über den ganzen Zeitraum.',
  'Alle Trainingstermine im Zeitraum sind im Preis enthalten, ebenso diese Plattform.',
  'Brauchen Sie während des Pakets wieder Physiotherapie, etwa mit einer neuen Verordnung, läuft das Paket weiter. Die Behandlung wird getrennt abgerechnet.',
];

/**
 * Die Bedingungen unter „Ich → Trainingspaket": der Inhalt und wie man ein
 * Paket bekommt. Nach der Behandlung schließt die Person es über das Angebot
 * im eigenen Konto (KND-003); sonst in der Praxis (ANN-281). Der Inhalt
 * (`PAKETINHALT`) ist Teil des Vertrags und steht unter dessen Fassung
 * (`VERTRAGSFASSUNG`, ANN-288).
 */
export const PAKETBEDINGUNGEN: readonly string[] = [
  ...PAKETINHALT,
  'Ein Paket schließen Sie mit der Praxis ab. Sprechen Sie uns beim nächsten Termin an.',
];

/** Der Satz zur Umsatzsteuer am Preis (Preisangabenverordnung: Gesamtpreis). */
export function steuerHinweis(enthalten: boolean, satzPromille: number): string {
  if (!enthalten) return 'Ohne Ausweis der Umsatzsteuer (Kleinunternehmerregelung).';
  return `inklusive ${String(satzPromille / 10).replace('.', ',')} % Umsatzsteuer`;
}

/**
 * Wo das eigene Paket steht, in einem Satz - unter „Ich → Trainingspaket“ und
 * auf der Übersicht im Training (Handoff 2026-10-22, 5.1: „Ihr Paket“).
 */
export function paketStand(paket: MeinPaket): string {
  switch (paket.state) {
    case 'planned':
      return `Beginnt am ${datum(paket.starts_on)}, läuft bis ${datum(paket.ends_on)}.`;
    case 'running':
      return `Läuft seit ${datum(paket.starts_on)} bis ${datum(paket.ends_on)}.`;
    case 'ended':
      return `Vom ${datum(paket.starts_on)} bis ${datum(paket.ends_on)}.`;
  }
}
