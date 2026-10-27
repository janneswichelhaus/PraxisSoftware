import type { Prescriber, PrescriberFeld } from './api';

/**
 * Felder des Verordner-Formulars (UIK-02, ZST-11) - nach dem Muster von
 * `grundlagenfelder.ts`.
 *
 * Das Formular hat zwölf Felder und ist am Telefon länger als ein Bild. Ein
 * Fehler am dritten Feld stand beim Absenden außerhalb des Bildes, und nichts
 * zeigte, dass etwas fehlte. Die Fehlerzusammenfassung braucht dafür je Feld
 * eine feste Kennung und eine Beschriftung.
 */
export function verordnerFeldId(feld: PrescriberFeld): string {
  return `verordner-${feld}`;
}

/** Beschriftung je Feld, in der Reihenfolge des Formulars. */
export const VERORDNER_BESCHRIFTUNG: Record<PrescriberFeld, string> = {
  title: 'Titel',
  given_name: 'Vorname',
  family_name: 'Nachname',
  practice_name: 'Praxis oder Einrichtung',
  speciality: 'Fachrichtung',
  street: 'Straße',
  house_number: 'Hausnummer',
  postal_code: 'PLZ',
  city: 'Ort',
  phone: 'Telefon',
  fax: 'Telefax',
  email: 'E-Mail',
};

export const VERORDNER_REIHENFOLGE = Object.keys(VERORDNER_BESCHRIFTUNG) as PrescriberFeld[];

/**
 * Höchstlängen je Feld (VER-15) - dieselben Grenzen wie in
 * `prescriberSchemaForm` (api.ts).
 *
 * Am Feld als `maxLength` gesetzt, lässt sich die Grenze gar nicht erst
 * überschreiten; „Titel ist zu lang." ohne Angabe, wie lang es sein darf,
 * kommt so nicht mehr vor. Verbindlich prüfen weiter Schema und Server. Ein
 * Test hält beide Listen beieinander (`verordnerfelder.test.ts`). Telefon,
 * Telefax und E-Mail haben im Schema keine Grenze und hier deshalb auch keine.
 */
export const VERORDNER_HOECHSTLAENGE: Partial<Record<PrescriberFeld, number>> = {
  title: 60,
  given_name: 100,
  family_name: 100,
  practice_name: 200,
  speciality: 100,
  street: 200,
  house_number: 20,
  postal_code: 12,
  city: 100,
};

/**
 * Wie eine Verordner:in in der Auswahl des Grundlagenformulars heißt (VER-09).
 *
 * Nachname zuerst - „Probst, Petra (Dr. med.) · Praxis" statt „Dr. med. Petra
 * Probst · Praxis": Die Liste ist nach dem Nachnamen sortiert, und ein natives
 * Auswahlfeld springt beim Tippen nach dem Anfang der Beschriftung. Mit dem
 * Titel vorn begann fast jede Zeile mit „Dr.", und „A" führte nicht zu „Adler".
 * Die Praxis bleibt dahinter - sie unterscheidet zwei gleichnamige Ärzt:innen.
 *
 * Nur für die Auswahl; überall sonst bleibt die gewohnte Reihenfolge
 * (`prescriberName`, `prescriberLabel`).
 */
export function verordnerAuswahlname(verordner: Prescriber): string {
  const name = [verordner.family_name, verordner.given_name].filter(Boolean).join(', ');
  const mitTitel = verordner.title ? `${name} (${verordner.title})` : name;
  return verordner.practice_name ? `${mitTitel} · ${verordner.practice_name}` : mitTitel;
}
