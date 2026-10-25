import type { EigenerPlan } from './api';
import type { Ablageplan } from './ablage';
import { dauerDerEinheit, dauerText } from './dauer';
import { uebungstageAm } from './uebungstage';

/**
 * Die Vorschau der Einheit im Reiter „Übungen“ (Handoff 2026-10-24,
 * Abschnitt 3, „Vorschau der Einheit“) als reine Rechnung ohne Datenzugriff:
 * in welcher Lage der Plan heute ist, was man braucht und wo es weitergeht.
 * Alles aus dem, was der Server ohnehin liefert (`platform_exercise_plans`) -
 * nichts Neues gespeichert. Den nächsten Übungstag rechnet `uebungstage.ts`,
 * für die Vorschau wie für die Endseite der Durchführung.
 */

/** Die Lagen der Tabelle in Abschnitt 3; „Plan vom Gerät“ kennt nur die Ablage. */
export type Lage =
  'heute' | 'anderer-tag' | 'ohne-tage' | 'begonnen' | 'geuebt' | 'ab' | 'lesefrist';

type Position = Ablageplan['items'][number];

/** ANN-722: die Lage der Vorschau - offene Einheit vor „geübt“, ein künftiger Plan „Ab …“. */
export function lageDesPlans(plan: EigenerPlan, heute: string): Lage {
  if (plan.status === 'ended') return 'lesefrist';
  // Eine offene Einheit gilt vor „geübt“: Wer heute ein zweites Mal beginnt,
  // macht dort weiter.
  if (plan.open_session) return 'begonnen';
  if (plan.recent_sessions.some((e) => e.performed_on === heute && e.finished)) return 'geuebt';
  if (plan.runs_from && plan.runs_from > heute) return 'ab';
  if (uebungstageAm([plan], heute).length > 0) return 'heute';
  return plan.weekdays.length > 0 ? 'anderer-tag' : 'ohne-tage';
}

/**
 * Der Plan der Vorschau: der erste mit heutigem Übungstag, sonst der erste
 * (Abschnitt 5.1, „Mehrere Pläne“). Die übrigen folgen in ihrer Reihenfolge.
 */
export function planDerVorschau<P extends EigenerPlan>(plaene: readonly P[], heute: string): P {
  const heutig = uebungstageAm([...plaene], heute)[0];
  return (plaene.find((p) => p.id === heutig?.id) ?? plaene[0])!;
}

/**
 * „Sie brauchen: …“ - alle Hilfsmittel und Lasten der Übungen in der
 * Reihenfolge des Plans, ohne Doppelte (Abschnitt 0). ANN-725: doppelt ist,
 * was ohne Groß- und Kleinschreibung gleich lautet.
 */
export function wasManBraucht(items: readonly Position[]): string[] {
  const liste: string[] = [];
  for (const p of [...items].sort((a, b) => a.position - b.position)) {
    for (const ding of [...p.equipment, p.load]) {
      const wort = ding?.trim();
      if (wort && !liste.some((l) => l.toLowerCase() === wort.toLowerCase())) liste.push(wort);
    }
  }
  return liste;
}

/**
 * „3 Übungen · etwa 10 Minuten“; lässt sich die Dauer nicht schätzen, nur
 * „3 Übungen“ (ANN-704). Dieselbe Zeile in der Vorschau des Reiters und auf
 * der Übungskarte der Übersicht.
 */
export function umfangSatz(anzahl: number, minuten: number | null): string {
  // Zahl und Wort bleiben zusammen: nicht „· 2“ am Zeilenende, „Übungen“ darunter.
  const uebungen = anzahl === 1 ? 'Eine Übung' : `${anzahl}\u00a0Übungen`;
  return minuten === null ? uebungen : `${uebungen} · ${dauerText(minuten)}`;
}

/** `umfangSatz` für die Übungen eines Plans. */
export function umfangText(items: readonly Position[]): string {
  return umfangSatz(items.length, dauerDerEinheit(items));
}

/** Wie oft die Übung in der offenen Einheit schon gehakt ist. */
function gehakt(
  item: Pick<Position, 'id'>,
  offen: Pick<Ablageplan, 'open_session'>['open_session'],
): number {
  return offen ? offen.sets.filter((s) => s.item_id === item.id).length : 0;
}

/**
 * Alle Durchgänge der Übung in der heutigen, offenen Einheit gehakt. ANN-720:
 * Grundlage ist allein `open_session.sets`; nach dem Beenden kennt der Reiter
 * die Haken nicht mehr und sagt „Heute geübt“ in der Vorschau.
 */
export function heuteErledigt(
  item: Pick<Position, 'id' | 'sets'>,
  offen: Pick<Ablageplan, 'open_session'>['open_session'],
): boolean {
  return offen !== null && gehakt(item, offen) >= item.sets;
}

/**
 * Wo „Weiter üben“ weitermacht (Abschnitt 0): die erste Übung mit offenem
 * Durchgang, nach `open_session.sets`. Ohne offene Einheit oder mit allen
 * Haken keine.
 */
export function ersteOffeneUebung(
  plan: Pick<Ablageplan, 'items' | 'open_session'>,
): Position | null {
  if (!plan.open_session) return null;
  return (
    [...plan.items]
      .sort((a, b) => a.position - b.position)
      .find((p) => !heuteErledigt(p, plan.open_session)) ?? null
  );
}
