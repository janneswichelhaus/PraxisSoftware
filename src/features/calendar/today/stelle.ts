import { useEffect } from 'react';

// -----------------------------------------------------------------------------
// Die Stelle in der Übersicht (Jannes 2026-11-22): Wer aus einer Zeile in Doku,
// Akte oder Termin geht, landet bei der Rückkehr wieder an dieser Zeile statt
// oben auf der Seite. Gemerkt werden nur Kennung, Tag und Höhe, kein Name.
// -----------------------------------------------------------------------------

const SCHLUESSEL = 'uebersicht-stelle';

/** Länger zurück ist keine Rückkehr mehr, sondern ein neuer Blick auf den Tag. */
const GUELTIG_MS = 60 * 60 * 1000;

interface Stelle {
  tag: string;
  termin: string;
  /** Abstand der Zeile vom oberen Fensterrand beim Tipp. */
  oben: number;
  zeit: number;
}

function speicher(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function stelleMerken(stelle: Stelle): void {
  speicher()?.setItem(SCHLUESSEL, JSON.stringify(stelle));
}

/** Liest die Stelle einmal und vergisst sie; fremde Tage und alte Stände zählen nicht. */
export function stelleNehmen(tag: string, jetzt: number): Stelle | null {
  const ablage = speicher();
  const roh = ablage?.getItem(SCHLUESSEL);
  if (!roh) return null;
  ablage?.removeItem(SCHLUESSEL);
  try {
    const stelle = JSON.parse(roh) as Partial<Stelle>;
    if (
      stelle.tag !== tag ||
      typeof stelle.termin !== 'string' ||
      !/^[\w-]+$/.test(stelle.termin) ||
      typeof stelle.oben !== 'number' ||
      typeof stelle.zeit !== 'number' ||
      jetzt - stelle.zeit > GUELTIG_MS
    ) {
      return null;
    }
    return stelle as Stelle;
  } catch {
    return null;
  }
}

/** Was unten von der Tableiste verdeckt wird, und Luft unter der Kopfzeile. */
const TABLEISTE_PX = 57;
const KOPF_PX = 72;

/**
 * Merkt bei jedem Tipp in einer Terminzeile (`data-termin`) die Stelle und rollt nach der
 * Rückkehr dorthin; sonst so weit, dass die offene Karte (`fokusId`) ganz im Bild steht,
 * statt Erledigtes zusammenzuklappen. Läuft nach dem Seitenwechsel, der nach oben setzt.
 */
export function useStelleInDerUebersicht(
  tag: string,
  bereit: boolean,
  fokusId: string | null,
): void {
  useEffect(() => {
    function getippt(ereignis: MouseEvent) {
      const ziel = ereignis.target instanceof Element ? ereignis.target : null;
      const zeile = ziel?.closest<HTMLElement>('[data-termin]');
      const termin = zeile?.dataset.termin;
      if (!zeile || !termin) return;
      stelleMerken({ tag, termin, oben: zeile.getBoundingClientRect().top, zeit: Date.now() });
    }
    document.addEventListener('click', getippt, true);
    return () => document.removeEventListener('click', getippt, true);
  }, [tag]);

  useEffect(() => {
    if (!bereit) return;
    const rolle = document.scrollingElement ?? document.documentElement;
    const stelle = stelleNehmen(tag, Date.now());
    const zeile = stelle
      ? document.querySelector<HTMLElement>(`[data-termin="${stelle.termin}"]`)
      : null;
    if (stelle && zeile) {
      rolle.scrollTop += zeile.getBoundingClientRect().top - stelle.oben;
      return;
    }
    const karte = fokusId
      ? document.querySelector<HTMLElement>(`[data-termin="${fokusId}"] article`)
      : null;
    if (!karte) return;
    const kasten = karte.getBoundingClientRect();
    const unten = window.innerHeight - TABLEISTE_PX;
    if (kasten.bottom > unten) {
      rolle.scrollTop += Math.min(kasten.bottom - unten, kasten.top - KOPF_PX);
    }
    // Nur beim Öffnen und nach der Rückkehr, nicht bei jedem neuen Fokus.
  }, [tag, bereit]);
}
