import { z } from 'zod';
import { BEGRIFFE } from '@/lib/begriffe';
import { istInternerPfad } from '@/lib/rueckweg';

// Das gemeinsame Vokabular des Termins: Art, Zustand, Länge, Namen und die Wege dorthin. Es liegt
// außerhalb von Termine, damit Bereiche, die Termine selbst einbindet, es ohne Ring nutzen können.

export const appointmentTypeSchema = z.enum(['home_visit', 'practice', 'video']);
export type AppointmentType = z.infer<typeof appointmentTypeSchema>;

export const appointmentTypeLabels: Record<AppointmentType, string> = {
  home_visit: 'Hausbesuch',
  practice: 'Praxis',
  video: 'Video',
};

/** Der Regelfall der Terminart: Nur eine Abweichung trägt ihr Wort als Kennzeichen (ANN-192). */
export const REGEL_TERMINART: AppointmentType = 'home_visit';

/** Die Terminart als Kennzeichen - nur, wenn sie vom Regelfall abweicht (ANN-192). */
export function appointmentTypeHint(type: AppointmentType): string | null {
  return type === REGEL_TERMINART ? null : appointmentTypeLabels[type];
}

/** Zustände des Termins nach ADR-018, genau die Werte der Datenbank-Constraint. */
export const appointmentStatusSchema = z.enum([
  'confirmed',
  'cancelled',
  'no_show',
  'completed',
  'documented',
  'invoiced',
]);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

/** Ein bestätigter, noch offener Termin „steht aus" - in Tageskarte, Terminseite und Akte. */
export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  confirmed: BEGRIFFE.stehtAus,
  cancelled: 'Abgesagt',
  no_show: 'Nicht angetroffen',
  completed: 'Abgeschlossen',
  documented: 'Dokumentiert',
  invoiced: 'Abgerechnet',
};

/** Ton des Statusabzeichens; der Zustand steht immer als Wort daneben (WCAG 1.4.1). */
export const appointmentStatusTon: Record<AppointmentStatus, 'positiv' | 'warnung' | 'kritisch'> = {
  confirmed: 'positiv',
  cancelled: 'kritisch',
  no_show: 'warnung',
  completed: 'positiv',
  documented: 'positiv',
  invoiced: 'positiv',
};

/**
 * Kontext des Termins (ADR-022 Punkt 2): `therapy` mit Patient:in, `internal` ein Ereignis des
 * Praxisbetriebs ohne Patient:in und ohne Leistung (§19), `training` am Trainingsverhältnis.
 */
export const appointmentKindSchema = z.enum(['therapy', 'internal', 'training']);
export type AppointmentKind = z.infer<typeof appointmentKindSchema>;

/** Der Anlass eines Termins neben dem Kontext (ADR-022 Punkt 2). */
export const terminAnlassSchema = z.enum(['regular', 'nutrition_counselling']);
export type TerminAnlass = z.infer<typeof terminAnlassSchema>;

/** Ist der Termin eine Ernährungsberatung? Ohne Angabe nicht. */
export function istBeratung(termin: { occasion?: TerminAnlass | null | undefined }): boolean {
  return termin.occasion === 'nutrition_counselling';
}

/**
 * Mitteilungswege (ANN-040): Die Anwendung versendet nichts, der Vermerk beschreibt einen Vorgang
 * außerhalb. SMS und Messenger fehlen bewusst - einen Wert, den niemand setzt, gibt es nicht.
 */
export const notificationChannelSchema = z.enum(['slip', 'phone', 'in_person', 'email']);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

/** `kurz` steht als Abzeichen in der Terminliste, `lang` an der Auswahl auf der Terminseite. */
export const notificationChannelLabels: Record<
  NotificationChannel,
  { kurz: string; lang: string }
> = {
  in_person: { kurz: 'Persönlich', lang: 'Persönlich gesagt' },
  phone: { kurz: 'Telefon', lang: 'Telefonisch mitgeteilt' },
  slip: { kurz: 'Zettel', lang: 'Terminzettel ausgehändigt' },
  email: { kurz: 'E-Mail', lang: 'Per E-Mail mitgeteilt' },
};

/** Auswahlreihenfolge - `Object.keys` wäre eine Zusage, die das Objekt nicht gibt. */
export const notificationChannelOrder: readonly NotificationChannel[] = [
  'in_person',
  'phone',
  'slip',
  'email',
] as const;

// Länge (PROJECT_PRINCIPLES.md §8.1): frei wählbar, wer von den Regellängen abweicht, wird
// gekennzeichnet. Die Datenbank führt dieselben Werte; ein Datenbanktest hält beide gegeneinander.

/** Vorbelegte Länge eines angebotenen Terminfensters, wie `app.appointment_window_minutes()`. */
export const TERMINFENSTER_MINUTEN = 60;

/** Die Regellängen in der Reihenfolge der Auswahl, wie `app.appointment_window_options()`. */
export const TERMINFENSTER_OPTIONEN = [60, 45] as const;

/** Ist das eine der Regellängen aus §8.1? */
export function istRegellaenge(minuten: number): boolean {
  return (TERMINFENSTER_OPTIONEN as readonly number[]).includes(minuten);
}

/**
 * Länge in Minuten, wenn ein Behandlungstermin gekennzeichnet werden muss, sonst `null`. Gerechnet
 * wird auf den gespeicherten Zeitpunkten; ohne `kind` gilt der Termin als Behandlung.
 */
export function abweichendeLaengeMinuten(termin: {
  kind?: AppointmentKind | undefined;
  starts_at: string;
  ends_at: string;
}): number | null {
  // Ereignis und Trainingstermin haben keine Patient:in und damit keine Regellänge.
  if (termin.kind !== undefined && termin.kind !== 'therapy') return null;
  const dauerMs = Date.parse(termin.ends_at) - Date.parse(termin.starts_at);
  if (!Number.isFinite(dauerMs)) return null;
  const minuten = Math.round(dauerMs / 60_000);
  return istRegellaenge(minuten) ? null : minuten;
}

/** Textfassung des Kennzeichens, auch für Vorlesewerkzeuge (§8.1). */
export function abweichendeLaengeText(minuten: number): string {
  return `Dauer weicht ab: ${minuten} Minuten`;
}

export function staffName(appointment: {
  staff_given_name: string;
  staff_family_name: string;
}): string {
  return `${appointment.staff_given_name} ${appointment.staff_family_name}`;
}

export function patientName(appointment: {
  patient_given_name: string | null;
  patient_family_name: string | null;
}): string {
  return `${appointment.patient_given_name ?? ''} ${appointment.patient_family_name ?? ''}`.trim();
}

/**
 * Was am Termin steht: der Name der Patient:in oder der Titel des Ereignisses. Fehlt beides, steht
 * ein Gedankenstrich da und keine leere Zeile (PROJECT_PRINCIPLES.md §13).
 */
export function terminBezeichnung(appointment: {
  kind: AppointmentKind;
  title: string | null;
  patient_given_name: string | null;
  patient_family_name: string | null;
  training_given_name?: string | null | undefined;
  training_family_name?: string | null | undefined;
}): string {
  if (appointment.kind === 'internal') return appointment.title ?? 'Fehlzeit';
  // Ein Trainingstermin trägt den Namen aus dem Training, wo der Lesepfad ihn liefert; sonst ist
  // er die Belegung und nicht der Termin: Zeit und Mitarbeitende, sonst nichts.
  if (appointment.kind === 'training') {
    const name =
      `${appointment.training_given_name ?? ''} ${appointment.training_family_name ?? ''}`.trim();
    return name || '—';
  }
  return patientName(appointment) || '—';
}

// Wege zum Termin: Parameter der Adresszeile. Nur Kennungen reisen mit, nie ein Name (ADR-011).

/** Der Suchparameter, mit dem der Kalender einen Termin öffnet. */
export const TERMIN_PARAM = 'termin';

/** Der Weg zu einem Termin: der Kalender, der den Tag selbst aus dem Termin liest. */
export function kalenderZumTermin(id: string): string {
  return `/kalender?${TERMIN_PARAM}=${encodeURIComponent(id)}`;
}

/**
 * Zurück zu einem Termin nach einem Formular: in den Kalender, aus dem man kam, mit dem Termin
 * gewählt - sonst dorthin, wo man herkam, und ohne Rückweg in den Kalender am Tag des Termins.
 */
export function zurueckZumTermin(rueckweg: string | null | undefined, id: string): string {
  if (!istInternerPfad(rueckweg)) return kalenderZumTermin(id);
  if (!rueckweg.startsWith('/kalender')) return rueckweg;
  const [pfad, suche = ''] = rueckweg.split('?');
  const parameter = new URLSearchParams(suche);
  parameter.set(TERMIN_PARAM, id);
  return `${pfad}?${parameter.toString()}`;
}

/** Wo ein Termin geöffnet wird: der Trainingstermin im Trainingsbereich, jeder andere im Kalender. */
export function terminPfad(termin: { id: string; kind: AppointmentKind }): string {
  return termin.kind === 'training'
    ? `/training/termine/${termin.id}`
    : kalenderZumTermin(termin.id);
}

/** Parameter, mit dem der Kalender einen gerade angelegten Termin einmal hervorhebt. */
export const NEUER_TERMIN_PARAM = 'neu';

/** Hängt die Kennung eines neuen Termins an einen Rückweg in den Kalender, andere bleiben. */
export function mitNeuemTermin(rueckweg: string, appointmentId: string): string {
  if (!rueckweg.startsWith('/kalender')) return rueckweg;
  const trenner = rueckweg.includes('?') ? '&' : '?';
  return `${rueckweg}${trenner}${NEUER_TERMIN_PARAM}=${encodeURIComponent(appointmentId)}`;
}

/**
 * Der Rückweg nach dem Anlegen, mit Hinweis auf den neuen Termin: Kalender, Terminseite und
 * Terminliste der Akte lesen denselben Parameter und bestätigen dort das Anlegen.
 */
export function mitAngelegtemTermin(rueckweg: string, appointmentId: string): string {
  if (rueckweg.startsWith('/kalender')) return mitNeuemTermin(rueckweg, appointmentId);
  const trenner = rueckweg.indexOf('?');
  const pfad = trenner === -1 ? rueckweg : rueckweg.slice(0, trenner);
  const suche = new URLSearchParams(trenner === -1 ? '' : rueckweg.slice(trenner + 1));
  suche.set(NEUER_TERMIN_PARAM, appointmentId);
  return `${pfad}?${suche.toString()}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Die Kennung eines gerade angelegten Termins aus der Adresszeile, sonst `null`. */
export function leseAngelegtenTermin(suche: URLSearchParams): string | null {
  const wert = suche.get(NEUER_TERMIN_PARAM);
  return wert && UUID.test(wert) ? wert : null;
}

/** Die gewählte Dauer, wenn das Terminformular auf einen Abstecher in die Stammdaten verzweigt. */
export const DAUER_PARAM = 'dauer';

/** Eine ganze Zahl von Minuten, die am selben Tag endet - sonst `null`. */
export function leseDauer(suche: URLSearchParams): number | null {
  const wert = suche.get(DAUER_PARAM);
  if (!wert || !/^\d{1,4}$/.test(wert)) return null;
  const minuten = Number(wert);
  return minuten > 0 && minuten < 24 * 60 ? minuten : null;
}

/**
 * Vorbelegung des Terminformulars über die Adresszeile: Sie überlebt ein Neuladen, ungültige
 * Werte fallen still auf den Standard. Verbindlich prüft `create_appointment` alles (ADR-004).
 */
export interface TerminVorbelegung {
  datum?: string;
  beginn?: string;
  ende?: string;
  art?: AppointmentType;
  person?: string;
}

const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

export function leseTerminVorbelegung(suche: URLSearchParams): TerminVorbelegung {
  const datum = suche.get('datum');
  const beginn = suche.get('beginn');
  const ende = suche.get('ende');
  const art = suche.get('art');
  const person = suche.get('person');

  const vorbelegung: TerminVorbelegung = {};
  if (datum && ISO_TAG.test(datum)) vorbelegung.datum = datum;
  if (beginn && UHRZEIT.test(beginn)) vorbelegung.beginn = beginn;
  if (ende && UHRZEIT.test(ende)) vorbelegung.ende = ende;
  if (art && appointmentTypeSchema.safeParse(art).success) {
    vorbelegung.art = art as AppointmentType;
  }
  if (person && UUID.test(person)) vorbelegung.person = person;
  return vorbelegung;
}

/** Die Vorbelegung als Suchteil einer Adresse - leere Felder bleiben weg. */
export function schreibeTerminVorbelegung(vorbelegung: TerminVorbelegung): string {
  const suche = new URLSearchParams();
  if (vorbelegung.datum) suche.set('datum', vorbelegung.datum);
  if (vorbelegung.beginn) suche.set('beginn', vorbelegung.beginn);
  if (vorbelegung.ende) suche.set('ende', vorbelegung.ende);
  if (vorbelegung.art) suche.set('art', vorbelegung.art);
  if (vorbelegung.person) suche.set('person', vorbelegung.person);
  const text = suche.toString();
  return text ? `?${text}` : '';
}
