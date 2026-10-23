import type { Plattformzugang } from './api';

/**
 * Der Einstieg nach der ersten Anmeldung als reine Rechnung (POR-019,
 * DSN-001 4.3; Handoff 2026-10-22, Abschnitt 5.3): welche Seiten in welcher
 * Reihenfolge und ihre Sätze. Die Ansicht steht in `Einstieg.tsx`.
 */

export type Einstiegsseite = 'willkommen' | 'einwilligungen' | 'mitteilungen' | 'bereit';

/**
 * Die Seiten des Einstiegs. Eine Begleitung entscheidet keine Einwilligungen
 * (ADR-023 Punkt 13) und hat deshalb eine Frage weniger. „Alles bereit“ ist
 * das Ende und zählt nicht als Schritt („Schritt 2 von 3“).
 */
export function einstiegsseiten(zugang: Pick<Plattformzugang, 'access_kind'>): Einstiegsseite[] {
  return zugang.access_kind === 'companion'
    ? ['willkommen', 'mitteilungen', 'bereit']
    : ['willkommen', 'einwilligungen', 'mitteilungen', 'bereit'];
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
