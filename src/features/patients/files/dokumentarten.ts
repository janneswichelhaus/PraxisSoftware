import { ANMELDEBOGEN_ANKER } from '@/features/patients/akte';
import { tagDerPraxis, tagUndUhrzeit } from '@/lib/dateien/kamera';

/**
 * Die Dokumentarten der Dateiablage — Beschriftung und Erläuterung (DAT-001).
 *
 * Verbindlich ist der Katalog in `public.patient_file_document_types`; er
 * trägt den Schlüssel und den Rollenschnitt (`is_clinical`). Hier stehen nur
 * die deutschen Wörter. Ein Datenbanktest hält beide Listen deckungsgleich —
 * dieselbe Aufteilung wie beim Retention Schedule (`klassen.ts`), damit die
 * SQL-Dateien frei von Umlauten bleiben, ohne dass die Oberfläche darunter
 * leidet.
 *
 * **Die Art ist keine Beschriftung, sondern eine Sichtbarkeitsgrenze**
 * (ADR-017 Punkt 12). Eine falsch gewählte Art ist eine Offenlegung nach
 * `PROJECT_PRINCIPLES.md` §13, kein Schönheitsfehler — deshalb steht neben
 * jeder Art, wer sie danach sehen kann.
 */

export const DOKUMENTARTEN = [
  'verordnungsscan',
  'befund',
  'arztbrief',
  'klinisches_bild',
  'dokumentationsfoto',
  'patientenfoto',
  'einwilligung',
  'vertrag',
] as const;

export type Dokumentart = (typeof DOKUMENTARTEN)[number];

export const dokumentartLabels: Record<Dokumentart, string> = {
  verordnungsscan: 'Verordnungsscan',
  befund: 'Befund',
  arztbrief: 'Arztbrief',
  klinisches_bild: 'Klinisches Bild',
  dokumentationsfoto: 'Dokumentationsfoto',
  // ADR-017 Punkt 43: Der Schlüssel bleibt, die Oberfläche sagt „Arbeitshilfe".
  patientenfoto: 'Arbeitshilfe',
  einwilligung: 'Einwilligung',
  vertrag: 'Vertrag',
};

export const dokumentartHinweise: Record<Dokumentart, string> = {
  verordnungsscan: 'Foto oder Scan des Rezepts. Nur an einer Verordnung.',
  befund: 'Befund einer Untersuchung.',
  arztbrief: 'Schreiben einer ärztlichen Stelle.',
  // ADR-017 Punkte 31 und 43: nie ein Foto, das die Praxis selbst von der
  // Person macht - das wäre ein Weg am Kameradialog und an der Wahl der Art
  // vorbei.
  klinisches_bild:
    'Röntgen, MRT, Ultraschall oder ein Bild aus ärztlicher oder klinischer Hand. Kein Foto, das die Praxis selbst von der Person macht.',
  // ADR-017 Abschnitte G und H: Beide Fotoarten entstehen nur im Kameradialog
  // im Verlauf, nie hier über den Dateiwähler - die Dateiliste bietet sie
  // nicht an.
  dokumentationsfoto:
    'Foto der Person, das für die Dokumentation der Behandlung erforderlich ist. Teil der Akte (zehn Jahre), keine Einwilligung, nur über die Kamera der Anwendung, löschen nur am Aufnahmetag.',
  patientenfoto:
    'Foto der Person für Übergabe und Vergleich, das die Dokumentation nicht braucht. Nur mit Einwilligung, nur über die Kamera der Anwendung, gelöscht nach spätestens zwölf Monaten.',
  einwilligung: 'Unterschriebene Einwilligung oder Datenschutzinformation.',
  vertrag: 'Behandlungsvertrag oder vergleichbare Vereinbarung.',
};

/**
 * Welche Arten klinisch sind.
 *
 * Spiegel von `patient_file_document_types.is_clinical`. Seit E15 sehen alle
 * vier Praxisrollen jede Art (ROL-002); die Einteilung bestimmt, wer eine
 * Datei hinzufügen, löschen und korrigieren darf (ADR-017 Punkt 13). Steuert
 * in der Oberfläche nur Auswahl und Hinweistext; verbindlich ist die Datenbank.
 */
export const KLINISCHE_DOKUMENTARTEN: readonly Dokumentart[] = [
  'verordnungsscan',
  'befund',
  'arztbrief',
  'klinisches_bild',
  'dokumentationsfoto',
  'patientenfoto',
];

export function istKlinisch(art: Dokumentart): boolean {
  return KLINISCHE_DOKUMENTARTEN.includes(art);
}

/**
 * Wer eine Datei dieser Art sieht und pflegt - mit den Namen der Rollen, wie
 * sie im Konto stehen (DAT-23, WRT-12): „Praxismanagement", nicht „die
 * Verwaltung".
 */
export function sichtbarkeitHinweis(art: Dokumentart): string {
  // Der Scan folgt der Grundlage, und die erfasst seit PRX-010 auch das
  // Praxismanagement (ANN-011).
  if (art === 'verordnungsscan') {
    return 'Klinisch: sichtbar für alle Praxisrollen; hinzufügen und löschen darf wie die Grundlage auch das Praxismanagement.';
  }
  return istKlinisch(art)
    ? 'Klinisch: sichtbar für alle Praxisrollen; hinzufügen und löschen nur Praxisinhaber:in, Therapeut:innen und Teamleitung.'
    : 'Organisatorisch: sichtbar für alle Praxisrollen; auch das Praxismanagement darf sie hinzufügen und löschen.';
}

/**
 * Wo in der Akte eine Datei steht (AKTE-007): Den Bereich „Dateien" gibt es
 * nicht mehr, jede Datei erscheint im Reiter ihres Bereichs - die eine Stelle
 * dieser Zuordnung.
 *
 *   * `grundlagen`  - Behandlungsgrundlagen: der Verordnungsscan;
 *   * `doku`        - Doku: was zu Befund und Behandlung gehört;
 *   * `anmeldebogen`- Stammdaten, beim Anmeldebogen: Einwilligung und Vertrag;
 *   * `sonstige`    - Stammdaten, „Sonstige Dateien": eine Art, die hier
 *     (noch) niemand zugeordnet hat. So fällt keine Datei durch.
 *
 * Die beiden Fotoarten stehen ohnehin in der Doku (`FotosImVerlauf`); die
 * Dateiliste bekommt sie vom Server gar nicht erst.
 */
export type Dateibereich = 'grundlagen' | 'doku' | 'anmeldebogen' | 'sonstige';

const DATEIBEREICHE: Record<Dokumentart, Dateibereich> = {
  verordnungsscan: 'grundlagen',
  befund: 'doku',
  arztbrief: 'doku',
  klinisches_bild: 'doku',
  dokumentationsfoto: 'doku',
  patientenfoto: 'doku',
  einwilligung: 'anmeldebogen',
  vertrag: 'anmeldebogen',
};

export function dateibereich(art: string): Dateibereich {
  return (DATEIBEREICHE as Record<string, Dateibereich | undefined>)[art] ?? 'sonstige';
}

/** Welche Arten in einem Bereich hinzugefügt werden - die Rolle filtert danach noch. */
export function artenImBereich(bereich: Dateibereich): readonly Dokumentart[] {
  return DOKUMENTARTEN.filter(
    (art) =>
      DATEIBEREICHE[art] === bereich &&
      // Fotos entstehen nur über die Kamera im Verlauf (ADR-017 G und H), der
      // Scan nur an seiner Grundlage (Punkt 10).
      art !== 'dokumentationsfoto' &&
      art !== 'patientenfoto' &&
      art !== 'verordnungsscan',
  );
}

/** Der Reiter der Akte, in dem eine Datei dieser Art steht (AKTE-007). */
export function aktenortDerDatei(patientId: string, art: string): string {
  const ort: Record<Dateibereich, string> = {
    grundlagen: 'verordnungen',
    doku: 'doku',
    anmeldebogen: `stammdaten#${ANMELDEBOGEN_ANKER}`,
    sonstige: 'stammdaten',
  };
  return `/patienten/${patientId}/${ort[dateibereich(art)]}`;
}

/**
 * Der vorgeschlagene Name einer neuen Datei (BEF-059, Entscheidung Jannes
 * 2026-10-09): „Befund vom 10.10.2026“, ein Foto aus der Kamera mit Uhrzeit
 * („Befund vom 10.10.2026, 10:42“). Ohne Dateiendung - `IMG_4711.jpg`
 * unterscheidet nichts. Der Name bleibt änderbar.
 */
export function namensvorschlag(
  art: Dokumentart,
  mitUhrzeit: boolean,
  zeitpunkt: Date,
  zeitzone?: string,
): string {
  const wann = mitUhrzeit ? tagUndUhrzeit(zeitpunkt, zeitzone) : tagDerPraxis(zeitpunkt, zeitzone);
  return `${dokumentartLabels[art]} vom ${wann}`;
}
