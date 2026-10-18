import { useSyncExternalStore } from 'react';

/**
 * Entwürfe des Teamchats (TEAM-002, ANN-612, ANN-641): je Konto, Gespräch und
 * Thread, nur im Arbeitsspeicher dieser Sitzung.
 *
 * Wer am Rad unterbrochen wird und zurückkommt, findet den Text wieder; auf
 * dem Gerät bleibt nichts liegen (kein `localStorage`, kein
 * `sessionStorage`). **Gebunden an das Konto:** Bis TEAM-001 hing ein
 * Entwurf nur am Gespräch - nach einem Kontowechsel im selben Tab stand er im
 * offenen Kanal der nächsten Person. Jetzt trägt jeder Schlüssel die Kennung
 * des Kontos, `entwuerfeLeeren` räumt beim Abmelden und beim Kontowechsel
 * alles ab (`SessionProvider`), und ein fremder Entwurf gilt nie als
 * vorhanden.
 */

export interface Entwurf {
  kontoId: string;
  kanalId: string;
  threadId: string | null;
  text: string;
  /** Wann zuletzt getippt - nur für die Reihenfolge der Ansicht „Entwürfe“. */
  geaendert: number;
}

const speicher = new Map<string, Entwurf>();
const beobachter = new Set<() => void>();
let stand = 0;

function schluessel(kontoId: string, kanalId: string, threadId: string | null): string {
  return `${kontoId}|${kanalId}|${threadId ?? ''}`;
}

function melden() {
  stand += 1;
  for (const b of beobachter) b();
}

export function entwurfLesen(kontoId: string, kanalId: string, threadId: string | null): string {
  return speicher.get(schluessel(kontoId, kanalId, threadId))?.text ?? '';
}

/** Setzt den Entwurf; ein leerer Text entfernt ihn. */
export function entwurfSetzen(
  kontoId: string,
  kanalId: string,
  threadId: string | null,
  text: string,
): void {
  const key = schluessel(kontoId, kanalId, threadId);
  const vorher = speicher.get(key);
  if (text === '') {
    if (!vorher) return;
    speicher.delete(key);
  } else {
    if (vorher?.text === text) return;
    speicher.set(key, { kontoId, kanalId, threadId, text, geaendert: Date.now() });
  }
  melden();
}

/** Die Entwürfe einer Person mit Inhalt, der zuletzt geänderte zuerst. */
export function entwuerfeVon(kontoId: string): Entwurf[] {
  return [...speicher.values()]
    .filter((e) => e.kontoId === kontoId && e.text.trim() !== '')
    .sort((a, b) => b.geaendert - a.geaendert);
}

/** Alle Entwürfe aller Konten fort - beim Abmelden und Kontowechsel. */
export function entwuerfeLeeren(): void {
  if (speicher.size === 0) return;
  speicher.clear();
  melden();
}

function abonnieren(rueckruf: () => void): () => void {
  beobachter.add(rueckruf);
  return () => beobachter.delete(rueckruf);
}

/** Die Entwürfe der Person, neu bei jeder Änderung. */
export function useEntwuerfe(kontoId: string): Entwurf[] {
  useSyncExternalStore(abonnieren, () => stand);
  return entwuerfeVon(kontoId);
}

/**
 * Der Entwurf an einer Stelle - die eine Quelle für das Feld: Auch was von
 * außen kommt (eine abgelehnte Nachricht zurück ins Feld, „Verwerfen“ unter
 * „Entwürfe“), steht sofort darin.
 */
export function useEntwurf(kontoId: string, kanalId: string, threadId: string | null): string {
  return useSyncExternalStore(abonnieren, () => entwurfLesen(kontoId, kanalId, threadId));
}
