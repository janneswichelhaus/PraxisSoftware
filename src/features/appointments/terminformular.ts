import { alsFormularfehler, type Formularfehler } from '@/lib/formularfehler';
import { leseRueckweg } from '@/lib/rueckweg';
import { mitNeuemTermin, NEUER_TERMIN_PARAM, type AppointmentFormField } from './api';

/**
 * Was die Terminformulare gemeinsam brauchen, ohne React (UXR-005).
 *
 * Getrennt von `AppointmentFormFields.tsx` wie `formularfehler.ts` von der
 * `Fehlerzusammenfassung`: reine Regeln, für sich prüfbar - und eine Datei mit
 * Komponenten darf nur Komponenten ausführen (`react-refresh`).
 */

/**
 * Feste Kennungen der Terminfelder (UIK-02, TER-06).
 *
 * Die Fehlerzusammenfassung springt auf das Feld, in dem der Fehler steht;
 * dafür muss die Kennung von außen bekannt sein. Jede Seite trägt höchstens
 * ein Terminformular, die Kennungen kollidieren also nicht.
 */
export const TERMINFELD_IDS: Readonly<Record<AppointmentFormField, string>> = {
  staff_member_id: 'termin-person',
  appointment_type: 'termin-art',
  date: 'termin-datum',
  start_time: 'termin-beginn',
  // Das Ende ist kein Feld (CAL-010a). Übrig bleibt ein Fehler der Dauer nur,
  // wenn das Minutenfeld keine Zahl enthält - dorthin führt der Eintrag.
  end_time: 'termin-dauer-minuten',
  location_id: 'termin-standort',
};

/** Kennung der Dauerauswahl selbst; das Minutenfeld darunter hat `end_time`. */
export const DAUER_AUSWAHL_ID = 'termin-dauer';

/** Dieselbe Meldung wie am Minutenfeld, damit beide Stellen gleich sprechen. */
export const DAUER_UNGUELTIG = 'Bitte eine Dauer in ganzen Minuten eingeben.';

/**
 * Beginn und Dauer ergeben kein Ende am selben Tag (TER-06).
 *
 * Steht am Beginn, weil dort die Abhilfe liegt; das Ende selbst ist nur eine
 * Ableitung und kann nichts korrigieren.
 */
export const MITTERNACHT_MELDUNG =
  'Beginn und Dauer reichen über Mitternacht. Bitte einen früheren Beginn wählen.';

interface Pruefbefund {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/**
 * Die Feldfehler eines Terminformulars nach der Prüfung (TER-06).
 *
 * Das Ende ist eine Ableitung aus Beginn und Dauer, kein Feld. Bis UXR-005
 * meldete die Dauer deshalb „Ende ist erforderlich.", sobald der Beginn
 * fehlte - an einer richtig gewählten Dauer, neben dem eigentlichen Fehler.
 * Jetzt gilt:
 *
 *   * fehlt der Beginn, sagt es der Beginn - das Ende schweigt;
 *   * enthält das Minutenfeld keine Zahl, sagt es das Minutenfeld;
 *   * sonst reicht der Termin über Mitternacht, und das steht am Beginn.
 *
 * Je Feld gilt die erste Meldung der Prüfung.
 */
export function terminFeldfehler(
  befunde: readonly Pruefbefund[],
  werte: Readonly<Record<AppointmentFormField, string>>,
  dauerGueltig = true,
): Partial<Record<AppointmentFormField, string>> {
  const gefunden: Partial<Record<AppointmentFormField, string>> = {};
  for (const befund of befunde) {
    const feld = befund.path[0] as AppointmentFormField | undefined;
    if (feld && !gefunden[feld]) gefunden[feld] = befund.message;
  }

  if (gefunden.end_time === undefined) return gefunden;

  const ohneEnde = { ...gefunden };
  delete ohneEnde.end_time;
  if (!dauerGueltig) return { ...ohneEnde, end_time: DAUER_UNGUELTIG };
  if (werte.start_time.trim() !== '' && !ohneEnde.start_time) {
    return { ...ohneEnde, start_time: MITTERNACHT_MELDUNG };
  }
  return ohneEnde;
}

/** Reihenfolge der Felder im Formular - so liest sich die Zusammenfassung. */
const FELDREIHENFOLGE: readonly AppointmentFormField[] = [
  'staff_member_id',
  'appointment_type',
  'date',
  'start_time',
  'end_time',
  'location_id',
];

/**
 * Die Einträge der Fehlerzusammenfassung (UIK-02).
 *
 * `personBeschriftung` ohne Sternchen: „Behandelnde Person" am Termin,
 * „Beteiligte Person" an einer Fehlzeit.
 */
export function terminFehlerliste(
  fehler: Partial<Record<AppointmentFormField, string>>,
  personBeschriftung = 'Behandelnde Person',
): Formularfehler[] {
  return alsFormularfehler(
    FELDREIHENFOLGE,
    {
      staff_member_id: personBeschriftung,
      appointment_type: 'Terminart',
      date: 'Datum',
      start_time: 'Beginn',
      end_time: 'Dauer in Minuten',
      location_id: 'Standort',
    },
    fehler,
    (feld) => TERMINFELD_IDS[feld],
  );
}

/**
 * Der Text eines gescheiterten Speicherns im Hinweisfenster (ZST-12, WRT-01).
 *
 * Kennt die Schnittstelle den Grund - eine Überschneidung, das Raster -,
 * steht er da. Sonst liefert sie denselben Satz, der schon der Titel ist; dann
 * sagt der Text, was jetzt zu tun ist, statt den Titel zu wiederholen.
 */
export function speicherfehlerText(meldung: string, titel: string): string {
  return meldung.trim() === titel.trim()
    ? 'Die Eingaben stehen noch im Formular. Bitte die Verbindung prüfen und erneut speichern.'
    : meldung;
}

/**
 * Der Rückweg nach dem Anlegen, mit Hinweis auf den neuen Termin (TER-04).
 *
 * Der Kalender hebt ihn hervor (`mitNeuemTermin`, FIX-016). Die
 * Termin-Detailseite und die Terminliste der Akte lesen denselben Parameter
 * und bestätigen dort das Anlegen - vorher kam man nach „Folgetermin anlegen"
 * auf den Ausgangstermin zurück, ohne jeden Hinweis, dass etwas entstanden war.
 *
 * Nur die Kennung reist mit, kein Name (ADR-011).
 */
export function mitAngelegtemTermin(rueckweg: string, appointmentId: string): string {
  if (rueckweg.startsWith('/kalender')) return mitNeuemTermin(rueckweg, appointmentId);
  const trenner = rueckweg.indexOf('?');
  const pfad = trenner === -1 ? rueckweg : rueckweg.slice(0, trenner);
  const suche = new URLSearchParams(trenner === -1 ? '' : rueckweg.slice(trenner + 1));
  suche.set(NEUER_TERMIN_PARAM, appointmentId);
  return `${pfad}?${suche.toString()}`;
}

const TERMINSUCHE = /^\/patienten\/([^/?]+)\/plaetze$/;

/**
 * Wohin es nach dem Anlegen geht, wenn der Termin aus der Warteliste kam (BEF-071).
 *
 * Die Terminsuche ist nur ein Zwischenschritt: Ihr Eintrag ist mit dem Anlegen
 * eingeplant, und zurück auf der Suche stand nur noch „nicht mehr offen" - das
 * las sich wie ein Fehler. Der Weg führt deshalb dorthin, wo die Suche
 * begann (Warteliste oder Akte), und bestätigt dort das Anlegen.
 */
export function nachDemAnlegen(rueckweg: string, ausWarteliste: boolean): string {
  if (!ausWarteliste) return rueckweg;
  const trenner = rueckweg.indexOf('?');
  const pfad = trenner === -1 ? rueckweg : rueckweg.slice(0, trenner);
  const treffer = TERMINSUCHE.exec(pfad);
  if (!treffer) return rueckweg;
  const suche = new URLSearchParams(trenner === -1 ? '' : rueckweg.slice(trenner + 1));
  return leseRueckweg(suche, `/patienten/${treffer[1]}/termine`);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Die Kennung eines gerade angelegten Termins aus der Adresszeile, sonst `null`. */
export function leseAngelegtenTermin(suche: URLSearchParams): string | null {
  const wert = suche.get(NEUER_TERMIN_PARAM);
  return wert && UUID.test(wert) ? wert : null;
}

/**
 * Die gewählte Dauer auf dem Abstecher in die Stammdaten (TER-05).
 *
 * Nur das Terminformular selbst schreibt diesen Parameter, wenn es für eine
 * fehlende Hausbesuchsadresse in die Stammdaten verzweigt, und liest ihn beim
 * Zurückkommen. Der Kalender gibt ihn nicht mit: Dort bleibt es beim
 * Terminfenster (CAL-010a).
 */
export const DAUER_PARAM = 'dauer';

/** Eine ganze Zahl von Minuten, die am selben Tag endet - sonst `null`. */
export function leseDauer(suche: URLSearchParams): number | null {
  const wert = suche.get(DAUER_PARAM);
  if (!wert || !/^\d{1,4}$/.test(wert)) return null;
  const minuten = Number(wert);
  return minuten > 0 && minuten < 24 * 60 ? minuten : null;
}

/**
 * Eine Bestätigung, die ein anderer Vorgang beim Seitenwechsel mitgibt
 * (DOK-15, ZST-17, TER-04).
 *
 * Die Absprache ist `navigate(ziel, { state: { meldung } })`: ein kurzer Satz
 * ohne Namen, etwa „Entwurf gespeichert." oder „3 Termine angelegt.". Er
 * steht im Verlauf des Browsers, nicht in der Adresse - und nirgends sonst.
 */
export function leseMeldung(zustand: unknown): string | null {
  if (typeof zustand !== 'object' || zustand === null || !('meldung' in zustand)) return null;
  const { meldung } = zustand;
  return typeof meldung === 'string' && meldung.trim() !== '' ? meldung : null;
}
