import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AKTIVITAET_KEY,
  KANAELE_KEY,
  THREADS_KEY,
  ZAEHLER_KEY,
  markiereGelesen,
  markiereThreadGelesen,
} from './api';
import { zeitVergleich } from './verlauf';

/**
 * Der eigene Lesestand (TEAM-002, ANN-640): gelesen ist, was die Person
 * gesehen hat - nicht, was beim Öffnen auf dem Server lag.
 *
 * Jede Nachricht meldet sich mit ihrer Zeit an; was zu mindestens drei
 * Vierteln im sichtbaren Teil des Verlaufs steht (oder ganz, wenn sie
 * kürzer ist), zählt als gesehen. Nach einer kurzen Ruhe geht die Zeit der
 * neuesten gesehenen Nachricht an den Server - im Gespräch an den Stand des
 * Gesprächs, im Thread an den des Threads. Bis TEAM-001 zog schon das Laden
 * den ganzen Kanal vor, auch Antworten in Threads, die niemand geöffnet hatte.
 *
 * Nur bei sichtbarem Tab. Nach „ab hier ungelesen“ ruht das Markieren, bis die
 * Ansicht verlassen wird - sonst stünde die Nachricht sofort wieder gelesen
 * da (wie Slack).
 */

const RUHE_MS = 600;

export function useLesestand({
  kanalId,
  threadId,
  behaelter,
}: {
  kanalId: string;
  /** Im Thread: dessen Ausgangsnachricht. */
  threadId: string | null;
  /** Der rollende Bereich des Verlaufs. */
  behaelter: RefObject<HTMLElement | null>;
}): {
  /** An jede Nachricht: Ref-Rückruf mit ihrer Zeit. */
  beobachte: (zeit: string) => (element: HTMLElement | null) => void;
  /** Nach „ab hier ungelesen“. */
  aussetzen: () => void;
} {
  const queryClient = useQueryClient();
  const gesehenBis = useRef<string | null>(null);
  const gemeldetBis = useRef<string | null>(null);
  const ausgesetzt = useRef(false);
  const zeiten = useRef(new WeakMap<Element, string>());
  // Was sich vor dem Beobachter angemeldet hat - die Refs laufen vor den Effekten.
  const elemente = useRef(new Set<Element>());
  const beobachter = useRef<IntersectionObserver | null>(null);
  const zeitgeber = useRef<ReturnType<typeof setTimeout> | null>(null);

  const melden = useCallback(() => {
    zeitgeber.current = null;
    const bis = gesehenBis.current;
    if (!bis || ausgesetzt.current) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (gemeldetBis.current && zeitVergleich(bis, gemeldetBis.current) <= 0) return;
    gemeldetBis.current = bis;
    const anfrage = threadId ? markiereThreadGelesen(threadId, bis) : markiereGelesen(kanalId, bis);
    void anfrage
      .then(async () => {
        await Promise.all(
          [KANAELE_KEY, ZAEHLER_KEY, AKTIVITAET_KEY, THREADS_KEY].map((queryKey) =>
            queryClient.invalidateQueries({ queryKey }),
          ),
        );
      })
      .catch(() => {
        // Ohne Netz bleibt es neu; der nächste Blick meldet es erneut.
        gemeldetBis.current = null;
      });
  }, [kanalId, threadId, queryClient]);

  const gesehen = useCallback(
    (zeit: string) => {
      if (gesehenBis.current && zeitVergleich(zeit, gesehenBis.current) <= 0) return;
      gesehenBis.current = zeit;
      if (zeitgeber.current) clearTimeout(zeitgeber.current);
      zeitgeber.current = setTimeout(melden, RUHE_MS);
    },
    [melden],
  );

  useEffect(() => {
    const wurzel = behaelter.current;
    if (typeof IntersectionObserver === 'undefined' || !wurzel) return;
    const io = new IntersectionObserver(
      (eintraege) => {
        for (const e of eintraege) {
          const zeit = zeiten.current.get(e.target);
          if (!zeit || !e.isIntersecting) continue;
          const ganz =
            e.intersectionRatio >= 0.75 ||
            (e.rootBounds !== null && e.boundingClientRect.bottom <= e.rootBounds.bottom + 1);
          if (ganz) gesehen(zeit);
        }
      },
      { root: wurzel, threshold: [0, 0.75, 1] },
    );
    beobachter.current = io;
    for (const element of elemente.current) {
      if (element.isConnected) io.observe(element);
      else elemente.current.delete(element);
    }
    return () => {
      io.disconnect();
      beobachter.current = null;
    };
  }, [behaelter, gesehen]);

  // Beim Wiederkehren in den Tab das Gesehene melden.
  useEffect(() => {
    const sichtbar = () => {
      if (document.visibilityState === 'visible') melden();
    };
    document.addEventListener('visibilitychange', sichtbar);
    return () => {
      document.removeEventListener('visibilitychange', sichtbar);
      if (zeitgeber.current) clearTimeout(zeitgeber.current);
    };
  }, [melden]);

  const beobachte = useCallback(
    (zeit: string) => (element: HTMLElement | null) => {
      if (!element) return;
      zeiten.current.set(element, zeit);
      elemente.current.add(element);
      if (beobachter.current) {
        beobachter.current.observe(element);
      } else if (typeof IntersectionObserver === 'undefined') {
        // Ohne Beobachter (ältere Umgebung, Tests): was gezeichnet ist, zählt.
        gesehen(zeit);
      }
    },
    [gesehen],
  );

  const aussetzen = useCallback(() => {
    ausgesetzt.current = true;
    if (zeitgeber.current) clearTimeout(zeitgeber.current);
  }, []);

  return { beobachte, aussetzen };
}
