import { nurFragen } from '@/lib/erfassungsgroessen';
import type { Bogenstand, EigeneCheckins, EigenePlaene, Plattformzugang, Termin } from './api';
import { dauerDerEinheit } from './dauer';
import { PLATTFORM_PFAD } from './pfade';
import { uebungstageAm } from './uebungstage';
import { kuenftig, tagOhneJahr, tagUndMonat, tageBis, uhrzeit } from './zeit';

/**
 * Die erste Aufgabe - was als Hauptsache oben auf der Übersicht steht
 * (Handoff 2026-10-22, Abschnitt 0 „Eine Hauptsache“; ANN-692) - als reine
 * Rechnung an genau einer Stelle. „Alles bereit“ im Einstieg nennt sie und
 * bietet ihre Handlung an; die Übersicht (Schritt 1e) baut die Hauptsache
 * darauf: Gibt es keine Aufgabe, nimmt sie den nächsten Termin, in der
 * Lesefrist „Unterlagen sichern“.
 *
 * Reihenfolge nach DSN-001 4.1: der Fragebogen vor dem ersten Termin, ein
 * fälliger Check-in, die Übungen für heute. Eine Antwort der Praxis und eine
 * offene Rechnung werden nie Aufgabe - keine Dringlichkeit aus Geld. In der
 * Lesefrist ist nichts mehr zu tun, und im Training ist die Hauptsache die
 * nächste Einheit (5.1). Was unbekannt ist (nicht geladen), zählt nicht.
 */
export type Aufgabe =
  | { art: 'fragebogen'; angefangen: boolean }
  | { art: 'checkin'; fragen: number }
  | {
      art: 'uebungen';
      uebungen: number;
      /** Geschätzte Dauer aller Übungen für heute (ANN-704); `null`, wenn sie sich nicht schätzen lässt. */
      minuten: number | null;
      planId: string | null;
    };

export interface Aufgabenlage {
  zugang: Pick<Plattformzugang, 'relationship_kind' | 'access_kind' | 'read_until'>;
  /** Der Bogen, den die Person selbst ausfüllt (`fuerDiePlattform`), sonst keiner. */
  bogenId: string | undefined;
  boegen: readonly Bogenstand[] | undefined;
  checkins: EigeneCheckins | null | undefined;
  plaene: EigenePlaene | undefined;
  /**
   * Läuft ein Nachsorge-Abo noch (auch gekündigt bis zu seinem Ende)? Dann
   * ist trotz `read_until` keine Lesefrist: Die Lesezeit zählt vom Ende des
   * Abos (ANN-274). Der Einstieg kennt das Abo nicht und lässt es weg.
   */
  aboLaeuft?: boolean;
}

/**
 * Die Lesefrist hat nur der eigene Zugang; an einer Vertretung ist
 * `read_until` ihr Ende - etwa die Volljährigkeit -, auch mitten in der
 * Behandlung. Solange ein Abo läuft, ist sie noch nicht da.
 */
export function inLesefrist(
  zugang: Pick<Plattformzugang, 'access_kind' | 'read_until'>,
  aboLaeuft = false,
): boolean {
  return zugang.access_kind === 'self' && zugang.read_until !== null && !aboLaeuft;
}

export function ersteAufgabe(lage: Aufgabenlage): Aufgabe | null {
  const { zugang, bogenId, boegen, checkins, plaene } = lage;
  if (inLesefrist(zugang, lage.aboLaeuft) || zugang.relationship_kind === 'training') return null;

  // Eine Begleitung füllt den Bogen nicht aus (ANN-248).
  if (zugang.access_kind !== 'companion' && bogenId !== undefined && boegen !== undefined) {
    const eigene = boegen.filter((b) => b.instrument_id === bogenId);
    if (!eigene.some((b) => b.status === 'abgeschlossen')) {
      return { art: 'fragebogen', angefangen: eigene.some((b) => b.status === 'entwurf') };
    }
  }

  // Ob der Zugang jetzt antworten darf, sagt der Server (Recht, Einwilligung).
  if (checkins?.can_answer && checkins.schedule) {
    return { art: 'checkin', fragen: nurFragen(checkins.schedule.parameter_keys).length };
  }

  return uebungenHeute(plaene);
}

/**
 * Die Übungen für heute: Pläne mit heutigem Übungstag, an denen der Zugang
 * üben darf und heute noch nicht fertig geübt hat. Die Übersicht zeigt sie
 * unter „Heute“, wenn sie nicht die Hauptsache sind.
 */
export function uebungenHeute(
  plaene: EigenePlaene | undefined,
): Extract<Aufgabe, { art: 'uebungen' }> | null {
  if (plaene === undefined) return null;
  const heute = uebungstageAm(plaene.plans, plaene.today).filter(
    (plan) =>
      plan.can_exercise &&
      !plan.recent_sessions.some((e) => e.performed_on === plaene.today && e.finished),
  );
  if (heute.length === 0) return null;
  return {
    art: 'uebungen',
    uebungen: heute.reduce((summe, plan) => summe + plan.items.length, 0),
    minuten: dauerDerEinheit(heute.flatMap((plan) => plan.items)),
    planId: heute.length === 1 ? heute[0]!.id : null,
  };
}

/**
 * Was die Person mit der Aufgabe tut: der Knopf der Hauptsache - hier und auf
 * der Übersicht derselbe. Ein Plan für heute führt direkt in die Einheit,
 * mehrere zu den Übungen.
 */
export function handlung(aufgabe: Aufgabe): { text: string; pfad: string } {
  switch (aufgabe.art) {
    case 'fragebogen':
      return {
        text: aufgabe.angefangen ? 'Fragebogen weiter ausfüllen' : 'Fragebogen beginnen',
        pfad: `${PLATTFORM_PFAD}/befundbogen`,
      };
    case 'checkin':
      return { text: 'Check-in beantworten', pfad: `${PLATTFORM_PFAD}/checkin` };
    case 'uebungen':
      return {
        text: 'Übungen beginnen',
        pfad: aufgabe.planId
          ? `${PLATTFORM_PFAD}/uebungen/einheit/${aufgabe.planId}`
          : `${PLATTFORM_PFAD}/uebungen`,
      };
  }
}

/**
 * Der nächste Termin: bestätigt und noch nicht vorbei - ein laufender zählt
 * noch, wie unter „Termine“ „kommend“. Die Reihenfolge des Servers ist keine
 * Zusage; deshalb hier nach Beginn.
 */
export function naechsterTermin(
  termine: readonly Termin[],
  jetzt: Date = new Date(),
): Termin | undefined {
  return termine
    .filter((t) => t.status === 'confirmed' && kuenftig(t.ends_at, jetzt))
    .sort((a, b) => zeitwert(a.starts_at) - zeitwert(b.starts_at))[0];
}

/**
 * Ist der nächste Termin der erste? Ja, wenn kein anderer vor ihm liegt, der
 * stattfand oder stattfinden sollte - ein abgesagter zählt nicht. „Ihr erster
 * Besuch“ statt „Nächster Besuch“ (Handoff 2026-10-22, 5.1).
 */
export function ersterTermin(termine: readonly Termin[], naechster: Termin): boolean {
  return !termine.some(
    (t) =>
      t.id !== naechster.id &&
      t.status !== 'cancelled' &&
      zeitwert(t.starts_at) < zeitwert(naechster.starts_at),
  );
}

/** Zeitpunkte vergleicht die Uhr, nicht der Text: Der Versatz wechselt mit der Sommerzeit. */
function zeitwert(zeitpunkt: string): number {
  return new Date(zeitpunkt).getTime();
}

/**
 * Was oben auf der Übersicht steht (Handoff 2026-10-22, Abschnitt 0 und 5.1;
 * ANN-698): in der Lesefrist „Unterlagen sichern“, sonst die erste Aufgabe,
 * sonst der nächste Termin; gibt es nichts davon, der Leerzustand.
 */
export type Hauptsache =
  | { art: 'unterlagen'; bis: string }
  | { art: 'aufgabe'; aufgabe: Aufgabe }
  | { art: 'termin'; termin: Termin }
  | { art: 'nichts' };

export function hauptsache(lage: Aufgabenlage & { naechster: Termin | undefined }): Hauptsache {
  const { zugang } = lage;
  if (inLesefrist(zugang, lage.aboLaeuft) && zugang.read_until !== null) {
    return { art: 'unterlagen', bis: zugang.read_until };
  }
  const aufgabe = ersteAufgabe(lage);
  if (aufgabe) return { art: 'aufgabe', aufgabe };
  if (lage.naechster) return { art: 'termin', termin: lage.naechster };
  return { art: 'nichts' };
}

const WOCHENTAG = new Intl.DateTimeFormat('de-DE', { weekday: 'long' });

const ART: Record<Termin['appointment_type'], string> = {
  home_visit: 'Besuch',
  practice: 'Termin',
  video: 'Videotermin',
};

/**
 * Der Titel eines Termins als Hauptsache: „Besuch am Samstag“, im Training
 * „Training am Freitag“; heute und morgen beim Wort, über sechs Tage mit
 * Datum („Besuch am 2. November“). Für eine Vertretung ohne Tag, dafür mit
 * der Person: „Besuch bei Max Mustermann“ - der Tag steht dann im Satz.
 */
export function terminTitel(
  termin: Termin,
  bereich: Plattformzugang['relationship_kind'],
  fuer: string | null,
  jetzt: Date = new Date(),
): string {
  const art = bereich === 'training' ? 'Training' : ART[termin.appointment_type];
  if (fuer) return `${art} ${termin.appointment_type === 'home_visit' ? 'bei' : 'für'} ${fuer}`;
  const tage = tageBis(termin.starts_at, jetzt);
  if (tage <= 0) return `${art} heute`;
  if (tage === 1) return `${art} morgen`;
  if (tage <= 6) return `${art} am ${WOCHENTAG.format(new Date(termin.starts_at))}`;
  return `${art} am ${tagUndMonat(termin.starts_at, jetzt)}`;
}

/**
 * Wann, als Satz unter dem Titel: „23. Oktober, 18:00 bis 19:00“; für eine
 * Vertretung mit dem Wochentag, weil der Titel keinen Tag trägt. Steht das
 * Datum schon im Titel (über sechs Tage), nur die Zeit.
 */
export function terminZeit(
  termin: Termin,
  mitWochentag: boolean,
  jetzt: Date = new Date(),
): string {
  const zeit = `${uhrzeit(termin.starts_at)} bis ${uhrzeit(termin.ends_at)}`;
  if (mitWochentag) return `${tagOhneJahr(termin.starts_at)}, ${zeit}`;
  if (tageBis(termin.starts_at, jetzt) > 6) return zeit;
  return `${tagUndMonat(termin.starts_at, jetzt)}, ${zeit}`;
}

/**
 * Wer kommt: „Anna Beispiel kommt zu Ihnen“, für eine Vertretung „Anna
 * Beispiel kommt“; in der Praxis und per Video, bei wem. Ohne Namen keine
 * Zeile.
 */
export function terminPerson(termin: Termin, vertretung: boolean): string | null {
  const wer = termin.staff_name;
  if (!wer) return null;
  if (termin.appointment_type === 'home_visit') {
    return vertretung ? `${wer} kommt` : `${wer} kommt zu Ihnen`;
  }
  return termin.appointment_type === 'video'
    ? `Videotermin mit ${wer}`
    : `In der Praxis bei ${wer}`;
}
