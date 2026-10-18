import { useSyncExternalStore } from 'react';
import type { Suchfilter } from './api';

/**
 * Die letzte Suche im Teamchat - nur im Arbeitsspeicher, nicht in der Adresse
 * und nicht im Verlauf des Browsers (ADR-011: ein Suchbegriff kann ein Name
 * sein). Die Seitenleiste setzt sie, die Ansicht „Suche“ liest sie.
 */

export const LEERE_SUCHE: Suchfilter = { text: '', kanalId: null, personId: null, ab: null };

let filter: Suchfilter = LEERE_SUCHE;
/** Zählt jede neue Suche - der Schlüssel im Abfragespeicher trägt nur ihn. */
let lauf = 0;
const beobachter = new Set<() => void>();

function melden() {
  for (const b of beobachter) b();
}

export function sucheSetzen(neu: Suchfilter): void {
  filter = neu;
  lauf += 1;
  melden();
}

export function sucheLeeren(): void {
  filter = LEERE_SUCHE;
  lauf += 1;
  melden();
}

function abonnieren(rueckruf: () => void): () => void {
  beobachter.add(rueckruf);
  return () => beobachter.delete(rueckruf);
}

export function useSuche(): { filter: Suchfilter; lauf: number } {
  const jetzt = useSyncExternalStore(abonnieren, () => lauf);
  return { filter, lauf: jetzt };
}

/**
 * Wann eine Suche läuft - der Server verlangt dasselbe (ANN-651): ein Wort ab
 * zwei Zeichen, oder ohne Wort der Blick in ein Gespräch, nie nach einer
 * Person allein.
 */
export function sucheMoeglich(f: Suchfilter): boolean {
  const text = f.text.trim();
  if (text.length >= 2) return text.length <= 100;
  return text === '' && f.kanalId !== null && f.personId === null;
}
