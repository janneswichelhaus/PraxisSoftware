import { useInfiniteQuery } from '@tanstack/react-query';
import {
  GESPRAECH_MS,
  SEITE_GESPRAECH,
  SEITE_THREAD,
  fetchNachrichten,
  verlaufKey,
  type Blatt,
  type Cursor,
  type Nachricht,
} from './api';

/**
 * Der Verlauf eines Gesprächs oder Threads in Seiten (TEAM-002, ANN-641).
 *
 * Seiten liegen von neu nach alt: Die erste ist die neueste (oder, nach einem
 * Sprung aus Suche und „Für dich“, die Stelle mit ihrer Umgebung), jede
 * weitere die ältere davor, eine „vorige“ die neuere danach. Beim Nachsehen
 * lädt React Query alle Seiten neu und leitet jede aus der vorigen ab - so
 * schließen sie lückenlos aneinander, auch wenn inzwischen mehr Nachrichten
 * kamen, als auf eine Seite passen. Bis TEAM-001 hing an der neuesten Seite
 * eine zweite Liste älterer, und dazwischen konnte eine Lücke entstehen.
 */

/** Die Stelle einer Nachricht - Zeit als Text vom Server, unverändert. */
export function cursorVon(nachricht: Pick<Nachricht, 'created_at' | 'id'>): Cursor {
  return { at: nachricht.created_at, id: nachricht.id };
}

/** Die Nachrichten einer Seite ohne die Ausgangsnachricht, die im Thread auf jeder steht. */
function eigene(seite: readonly Nachricht[], threadId: string | null): Nachricht[] {
  return threadId ? seite.filter((n) => n.id !== threadId) : [...seite];
}

/**
 * Vergleicht zwei Zeiten vom Server. Text vergleicht genauer als `Date`
 * (Mikrosekunden), solange beide denselben Versatz tragen; sonst entscheidet
 * die Zeit.
 */
export function zeitVergleich(a: string, b: string): number {
  const versatz = (t: string) => /([+-]\d\d:?\d\d|Z)$/.exec(t)?.[1] ?? '';
  if (versatz(a) === versatz(b)) return a < b ? -1 : a > b ? 1 : 0;
  return Date.parse(a) - Date.parse(b);
}

/** Aus den Seiten eine Folge, aufsteigend, ohne Doppel. */
export function flach(seiten: readonly (readonly Nachricht[])[]): Nachricht[] {
  const gesehen = new Set<string>();
  const ergebnis: Nachricht[] = [];
  for (const seite of [...seiten].reverse()) {
    for (const n of seite) {
      if (gesehen.has(n.id)) continue;
      gesehen.add(n.id);
      ergebnis.push(n);
    }
  }
  return ergebnis.sort(
    (a, b) => zeitVergleich(a.created_at, b.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Die erste Seite: die neueste oder die Stelle mit ihrer Umgebung. */
function erstesBlatt(sprungZu: string | null): Blatt {
  return sprungZu ? { art: 'um', id: sprungZu } : { art: 'neueste' };
}

export function useVerlauf(kanalId: string, threadId: string | null, sprungZu: string | null) {
  const grenze = threadId ? SEITE_THREAD : SEITE_GESPRAECH;
  return useInfiniteQuery({
    queryKey: [...verlaufKey(kanalId, threadId), sprungZu ? `um:${sprungZu}` : 'neueste'] as const,
    initialPageParam: erstesBlatt(sprungZu),
    queryFn: ({ pageParam }) => fetchNachrichten(kanalId, threadId, pageParam),
    // Ältere: vor der ältesten Nachricht der ältesten Seite. Eine kurze Seite
    // heißt, davor kommt nichts mehr.
    getNextPageParam: (aelteste, _alle, param): Blatt | undefined => {
      const liste = eigene(aelteste, threadId);
      const erste = liste[0];
      if (!erste) return undefined;
      if (param.art !== 'um' && param.art !== 'nach' && liste.length < grenze) return undefined;
      return { art: 'vor', cursor: cursorVon(erste) };
    },
    // Neuere gibt es nur nach einem Sprung: nach der neuesten Nachricht der
    // neuesten Seite, bis eine Seite kurz bleibt.
    getPreviousPageParam: (neueste, _alle, param): Blatt | undefined => {
      if (param.art === 'neueste' || param.art === 'vor') return undefined;
      const liste = eigene(neueste, threadId);
      const letzte = liste.at(-1);
      if (!letzte) return undefined;
      if (param.art === 'nach' && liste.length < grenze) return undefined;
      return { art: 'nach', cursor: cursorVon(letzte) };
    },
    refetchInterval: GESPRAECH_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
