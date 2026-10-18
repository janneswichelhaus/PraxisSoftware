import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Wo der Verlauf steht (TEAM-002, ANN-648).
 *
 * * **Beim ersten Öffnen** steht die Linie „Neu“ oben, sonst die neueste
 *   Nachricht unten; nach einem Sprung aus Suche oder „Für dich“ die Stelle
 *   in der Mitte.
 * * **Beim Zurückkommen** steht er, wo er war (wie Slack: dort weiter, wo man
 *   aufgehört hat) - gemerkt im Arbeitsspeicher, je Konto und Gespräch.
 * * **Ältere laden** schiebt nichts: Was zu sehen war, bleibt an seinem Platz.
 * * **Neue Nachrichten** rollen mit, solange man unten ist; wer weiter oben
 *   liest, behält seinen Platz und sieht „Neue Nachrichten“ als Sprung.
 */

type Stand = { id: string; abstand: number } | 'ende';

const staende = new Map<string, Stand>();

/** Alle gemerkten Stände fort - beim Abmelden und Kontowechsel. */
export function scrollstaendeLeeren(): void {
  staende.clear();
}

/** Abstand zum unteren Rand, unter dem der Verlauf als „unten“ gilt. */
const UNTEN_PX = 48;

/** Kennungen sind UUIDs - ohne Zeichen, die im Selektor stören. */
function nachricht(behaelter: HTMLElement, id: string): HTMLElement | null {
  return behaelter.querySelector<HTMLElement>(`[data-nachricht="${id}"]`);
}

function obenIn(behaelter: HTMLElement, element: HTMLElement): number {
  return element.getBoundingClientRect().top - behaelter.getBoundingClientRect().top;
}

export function useScrollstand({
  schluessel,
  behaelter,
  inhalt,
  ids,
  neuAb,
  sprungZu,
}: {
  /** Konto, Gespräch und Thread. */
  schluessel: string;
  behaelter: RefObject<HTMLElement | null>;
  /** Das Element im Behälter, das wächst. */
  inhalt: RefObject<HTMLElement | null>;
  /** Die gezeigten Nachrichten, aufsteigend. */
  ids: readonly string[];
  /** Die erste ungelesene beim Öffnen - oder `null`. */
  neuAb: string | null;
  /** Eine Stelle aus Suche oder „Für dich“. */
  sprungZu: string | null;
}): {
  amEnde: boolean;
  /** Neue Nachrichten unter dem sichtbaren Teil. */
  neuUnten: number;
  ansEnde: (sanft?: boolean) => void;
} {
  const [amEnde, setAmEnde] = useState(true);
  const [neuUnten, setNeuUnten] = useState(0);
  const amEndeRef = useRef(true);
  const erster = useRef(true);
  const vorher = useRef<{ aelteste: string | null; neueste: string | null; hoehe: number }>({
    aelteste: null,
    neueste: null,
    hoehe: 0,
  });

  const ansEnde = useCallback(
    (sanft = false) => {
      const el = behaelter.current;
      if (!el) return;
      el.scrollTo?.({ top: el.scrollHeight, behavior: sanft ? 'smooth' : 'auto' });
      if (!el.scrollTo) el.scrollTop = el.scrollHeight;
      amEndeRef.current = true;
      setAmEnde(true);
      setNeuUnten(0);
    },
    [behaelter],
  );

  // Beim Rollen: unten oder nicht; beim Verlassen den Stand merken.
  useEffect(() => {
    const el = behaelter.current;
    if (!el) return;
    const rollen = () => {
      const ende = el.scrollHeight - el.scrollTop - el.clientHeight < UNTEN_PX;
      amEndeRef.current = ende;
      setAmEnde(ende);
      if (ende) setNeuUnten(0);
    };
    el.addEventListener('scroll', rollen, { passive: true });
    return () => {
      el.removeEventListener('scroll', rollen);
      if (amEndeRef.current) {
        staende.set(schluessel, 'ende');
        return;
      }
      const oben = [...el.querySelectorAll<HTMLElement>('[data-nachricht]')].find(
        (n) => obenIn(el, n) >= -1,
      );
      const id = oben?.dataset.nachricht;
      if (oben && id) staende.set(schluessel, { id, abstand: obenIn(el, oben) });
    };
  }, [behaelter, schluessel]);

  const kette = ids.join('|');
  useLayoutEffect(() => {
    const el = behaelter.current;
    if (!el || ids.length === 0) return;
    const aelteste = ids[0]!;
    const neueste = ids.at(-1)!;

    if (erster.current) {
      erster.current = false;
      const gemerkt = staende.get(schluessel);
      const sprung = sprungZu ? nachricht(el, sprungZu) : null;
      const neu = neuAb ? nachricht(el, neuAb) : null;
      if (sprung) {
        el.scrollTop += obenIn(el, sprung) - el.clientHeight / 3;
      } else if (gemerkt && gemerkt !== 'ende' && nachricht(el, gemerkt.id)) {
        el.scrollTop += obenIn(el, nachricht(el, gemerkt.id)!) - gemerkt.abstand;
      } else if (neu && !gemerkt) {
        el.scrollTop += obenIn(el, neu) - 8;
      } else {
        el.scrollTop = el.scrollHeight;
      }
      const ende = el.scrollHeight - el.scrollTop - el.clientHeight < UNTEN_PX;
      amEndeRef.current = ende;
      setAmEnde(ende);
    } else {
      const v = vorher.current;
      if (v.aelteste && aelteste !== v.aelteste && ids.includes(v.aelteste)) {
        // Ältere kamen oben dazu: um ihre Höhe weiterrücken, damit nichts springt.
        el.scrollTop += el.scrollHeight - v.hoehe;
      } else if (v.neueste && neueste !== v.neueste) {
        if (amEndeRef.current) {
          el.scrollTop = el.scrollHeight;
        } else {
          const ab = ids.indexOf(v.neueste);
          const dazu = ab >= 0 ? ids.length - 1 - ab : 1;
          if (dazu > 0) setNeuUnten((n) => n + dazu);
        }
      }
    }
    vorher.current = { aelteste, neueste, hoehe: el.scrollHeight };
    // `kette` steht für `ids`: neu nur, wenn sich die Folge ändert.
  }, [kette, behaelter, schluessel, neuAb, sprungZu]);

  // Wächst der Inhalt ohne neue Nachricht (Reaktion, Bearbeitung), bleibt
  // unten, wer unten war.
  useEffect(() => {
    const el = behaelter.current;
    const innen = inhalt.current;
    if (!el || !innen || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (amEndeRef.current) el.scrollTop = el.scrollHeight;
      vorher.current = { ...vorher.current, hoehe: el.scrollHeight };
    });
    ro.observe(innen);
    return () => ro.disconnect();
  }, [behaelter, inhalt]);

  return { amEnde, neuUnten, ansEnde };
}
