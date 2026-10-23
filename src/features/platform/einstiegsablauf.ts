import { einwilligungAngeboten } from '@/lib/einwilligung';
import type { Einwilligung, Plattformzugang } from './api';
import { OHNE_NACHTEIL } from './einwilligungstexte';

/**
 * Der Einstieg nach der ersten Anmeldung als reine Rechnung (POR-019,
 * DSN-001 4.3; Handoff 2026-10-22, Abschnitt 5.3): welche Seiten in welcher
 * Reihenfolge und ihre Sätze. Die Ansicht steht in `Einstieg.tsx`.
 */

export type Einstiegsseite = 'willkommen' | 'einwilligungen' | 'mitteilungen' | 'bereit';

/**
 * Die Seiten des Einstiegs. Die Einwilligungen nur, wenn eine offen ist: Eine
 * Begleitung entscheidet keine (ADR-023 Punkt 13) und hat deshalb eine Frage
 * weniger. „Alles bereit“ ist das Ende und zählt nicht als Schritt („Schritt
 * 2 von 3“).
 */
export function einstiegsseiten(
  zugang: Pick<Plattformzugang, 'access_kind'>,
  offeneEinwilligungen: number,
): Einstiegsseite[] {
  const fragen = zugang.access_kind !== 'companion' && offeneEinwilligungen > 0;
  return fragen
    ? ['willkommen', 'einwilligungen', 'mitteilungen', 'bereit']
    : ['willkommen', 'mitteilungen', 'bereit'];
}

/**
 * Was der Einstieg zu Einwilligungen fragt (ANN-693): nur, was offen ist, die
 * Person jetzt erteilen kann und angeboten wird - Fotos und Anhänge stehen nur
 * zum Widerruf (`einwilligungAngeboten`). Erteilt, widerrufen oder in der
 * Praxis abgelehnt ist entschieden; ändern geht unter „Ich“ mit Rückfrage.
 */
export function offeneEinwilligungen(liste: readonly Einwilligung[]): Einwilligung['purpose'][] {
  return liste
    .filter((e) => e.state === 'open' && e.can_grant && einwilligungAngeboten(e.purpose, false))
    .map((e) => e.purpose);
}

/** „Zwei Fragen zu Ihren Daten“ - die Zahl folgt den offenen Einwilligungen. */
export function einwilligungstitel(
  anzahl: number,
  zugang: Pick<Plattformzugang, 'access_kind' | 'represented_name'>,
): string {
  const fragen = anzahl === 1 ? 'Eine Frage' : `${gross(zahlwort(anzahl))} Fragen`;
  return zugang.access_kind === 'legal_representative'
    ? `${fragen} zu den Daten von ${vertretenePerson(zugang)}`
    : `${fragen} zu Ihren Daten`;
}

/**
 * Freiwillig und ohne Nachteil - vor jeder Entscheidung (Art. 7 DSGVO):
 * „Beides ist freiwillig. Ihre Behandlung hängt nicht davon ab.“ Eine
 * rechtliche Vertretung hört zuerst, für wen sie entscheidet.
 */
export function freiwilligkeit(
  anzahl: number,
  zugang: Pick<Plattformzugang, 'access_kind' | 'relationship_kind' | 'represented_name'>,
): string {
  const was = anzahl === 1 ? 'Das ist' : anzahl === 2 ? 'Beides ist' : 'Alles ist';
  const fuer =
    zugang.access_kind === 'legal_representative'
      ? `Sie entscheiden hier für ${vertretenePerson(zugang)}. `
      : '';
  return `${fuer}${was} freiwillig. ${OHNE_NACHTEIL[zugang.relationship_kind]}`;
}

function gross(wort: string): string {
  return wort.charAt(0).toUpperCase() + wort.slice(1);
}

/** „eine“ bis „fünf“ - Zahlen, die man im Satz ausschreibt. */
const ZAHLWORT = ['keine', 'eine', 'zwei', 'drei', 'vier', 'fünf'] as const;

export function zahlwort(zahl: number): string {
  return ZAHLWORT[zahl] ?? String(zahl);
}

/** „Willkommen,“ und der eigene Name in eigener Zeile; ohne Namen nur „Willkommen“. */
export function willkommenstitel(zugang: Pick<Plattformzugang, 'own_name'>): string {
  const name = zugang.own_name?.trim();
  return name ? `Willkommen,\n${name}` : 'Willkommen';
}

/**
 * Wofür die Plattform da ist, in einem Satz. Eine Vertretung - Begleitung oder
 * rechtliche Vertretung - liest, was die Praxis für die vertretene Person
 * bereithält; ihr eigener Name steht im Titel, der der Person hier.
 */
export function willkommenssatz(
  zugang: Pick<Plattformzugang, 'access_kind' | 'relationship_kind' | 'represented_name'>,
  praxis: string,
): string {
  if (zugang.access_kind !== 'self') {
    return `Hier sehen Sie, was ${praxis || 'die Praxis'} für ${vertretenePerson(zugang)} bereithält.`;
  }
  const wofuer = zugang.relationship_kind === 'training' ? 'Ihrem Training' : 'Ihrer Behandlung';
  return `Schön, dass Sie da sind. Hier finden Sie alles zu ${wofuer} bei ${praxis || 'Ihrer Praxis'}.`;
}

/** Wie viele Fragen noch kommen - „Alles bereit“ ist keine. */
export function nochFragen(fragen: number): string {
  return fragen === 1
    ? 'Noch eine kurze Frage, dann sind Sie fertig.'
    : `Noch ${zahlwort(fragen)} kurze Fragen, dann sind Sie fertig.`;
}

/** Der Name der vertretenen Person; ohne ihn (nicht lesbar) neutral. */
export function vertretenePerson(zugang: Pick<Plattformzugang, 'represented_name'>): string {
  return zugang.represented_name ?? 'die Person';
}
