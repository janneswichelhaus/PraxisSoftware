import { nurFragen } from '@/lib/erfassungsgroessen';
import type { Bogenstand, EigeneCheckins, EigenePlaene, Plattformzugang } from './api';
import { PLATTFORM_PFAD } from './pfade';
import { uebungstageAm } from './uebungstage';

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
  | { art: 'uebungen'; uebungen: number; planId: string | null };

export interface Aufgabenlage {
  zugang: Pick<Plattformzugang, 'relationship_kind' | 'access_kind' | 'read_until'>;
  /** Der Bogen, den die Person selbst ausfüllt (`fuerDiePlattform`), sonst keiner. */
  bogenId: string | undefined;
  boegen: readonly Bogenstand[] | undefined;
  checkins: EigeneCheckins | null | undefined;
  plaene: EigenePlaene | undefined;
}

export function ersteAufgabe(lage: Aufgabenlage): Aufgabe | null {
  const { zugang, bogenId, boegen, checkins, plaene } = lage;
  // Die Lesefrist hat nur der eigene Zugang; an einer Vertretung ist
  // `read_until` ihr Ende - etwa die Volljährigkeit -, auch mitten in der
  // Behandlung (wie die Übersicht es liest).
  const lesefrist = zugang.access_kind === 'self' && zugang.read_until !== null;
  if (lesefrist || zugang.relationship_kind === 'training') return null;

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

  if (plaene !== undefined) {
    const heute = uebungstageAm(plaene.plans, plaene.today).filter(
      (plan) =>
        plan.can_exercise &&
        !plan.recent_sessions.some((e) => e.performed_on === plaene.today && e.finished),
    );
    if (heute.length > 0) {
      return {
        art: 'uebungen',
        uebungen: heute.reduce((summe, plan) => summe + plan.items.length, 0),
        planId: heute.length === 1 ? heute[0]!.id : null,
      };
    }
  }
  return null;
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
