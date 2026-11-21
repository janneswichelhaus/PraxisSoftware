import { useEffect, useRef, useState } from 'react';
import type { Auswahl } from './lastenrad3d/auswahl';
import type { LastenradAnsicht } from './lastenrad3d/viewer';

/** Was eine markierte Gruppe bedeutet; die Farbe dazu kommt aus den Tokens. */
export type Markenton = 'kritisch' | 'achtung';

const TON_TOKEN: Record<Markenton, string> = {
  kritisch: '--color-danger',
  achtung: '--color-warnung-mittel',
};

export interface Radauswahl {
  /** Die Gruppe, zu der ein Teil des Modells gehört; ohne Gruppe ist es nicht wählbar. */
  gruppeVon: (teil: string) => string | null;
  /** Nur diese Gruppen sind wählbar, der Rest tritt zurück; ohne Angabe alle. */
  waehlbar?: readonly string[] | undefined;
  /** Markierte Gruppen in der Farbe ihrer Bedeutung. */
  marken?: readonly { gruppe: string; ton: Markenton }[] | undefined;
  /** Die Gruppen unter dem Finger, die getroffene zuerst; nie leer. */
  onWahl: (gruppen: readonly string[]) => void;
}

/**
 * Das Own Motion Lastenrad als 3D-Ansicht zum Drehen. three.js lädt erst, wenn die Bühne ins Bild
 * kommt, und nie mit dem Einstieg (`lastenrad3d/einstieg.test.ts`). Mit `auswahl` meldet ein Tipp
 * aufs Rad die Gruppen unter dem Finger; derselbe Weg muss daneben ohne Rad stehen (Liste, Knöpfe).
 */
export function Lastenrad3D({
  className = 'h-64',
  label,
  auswahl,
}: {
  /** Die Höhe der Bühne, dazu Abstände; ohne Höhe bleibt die Ansicht leer. */
  className?: string;
  /** Beschreibung für Vorlesesoftware, wenn die Ansicht mehr ist als ein Bild des Rads. */
  label?: string | undefined;
  auswahl?: Radauswahl | undefined;
}) {
  const buehne = useRef<HTMLDivElement>(null);
  const [ohneAnsicht, setOhneAnsicht] = useState(false);
  const mitAuswahl = auswahl !== undefined;
  // Die jüngsten Angaben über eine Ref: Ein neuer Rückruf baut die Ansicht nicht neu.
  const aktuell = useRef(auswahl);
  const wahl = useRef<Auswahl | null>(null);
  useEffect(() => {
    aktuell.current = auswahl;
  });

  const stand = JSON.stringify([auswahl?.waehlbar ?? null, auswahl?.marken ?? []]);
  function uebertrage() {
    const container = buehne.current;
    const angaben = aktuell.current;
    if (!container || !angaben) return;
    const stil = getComputedStyle(container);
    wahl.current?.setze({
      waehlbar: angaben.waehlbar ?? null,
      marken: (angaben.marken ?? []).map(({ gruppe, ton }) => ({
        gruppe,
        farbe: stil.getPropertyValue(TON_TOKEN[ton]).trim(),
      })),
    });
  }
  const uebertragen = useRef(uebertrage);
  useEffect(() => {
    uebertragen.current = uebertrage;
  });

  useEffect(() => {
    const container = buehne.current;
    if (!container) return undefined;
    let verlassen = false;
    let ansicht: LastenradAnsicht | null = null;

    const starten = () => {
      // Ohne Zoom: Mausrad und senkrechtes Wischen gehören der Seite, gedreht wird waagerecht.
      // Zum Wählen steht das Rad still und behält seine Teile einzeln.
      const optionen = {
        zoom: false,
        ...(label ? { label } : {}),
        ...(mitAuswahl ? { merge: false, autoRotate: false } : {}),
      };
      Promise.all([
        import('./lastenrad3d/viewer').then(({ mountLastenrad }) =>
          mountLastenrad(container, optionen),
        ),
        mitAuswahl ? import('./lastenrad3d/auswahl') : null,
      ]).then(
        ([fertig, modul]) => {
          // Verlassen, bevor die Ansicht stand: Sie gibt Speicher und Grafikkontext gleich frei.
          if (verlassen) {
            fertig.dispose();
            return;
          }
          ansicht = fertig;
          if (!modul) return;
          wahl.current = modul.richteAuswahlEin(
            fertig,
            container,
            (teil) => aktuell.current?.gruppeVon(teil) ?? null,
            (gruppen) => aktuell.current?.onWahl(gruppen),
          );
          uebertragen.current();
        },
        // Kein WebGL oder das Modul kam nicht an: Der Hinweis steht da, die Seite trägt ohne Bild.
        () => {
          if (!verlassen) setOhneAnsicht(true);
        },
      );
    };

    let blickfeld: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === 'undefined') starten();
    else {
      blickfeld = new IntersectionObserver(
        (eintraege) => {
          if (!eintraege.some((eintrag) => eintrag.isIntersecting)) return;
          blickfeld?.disconnect();
          starten();
        },
        { rootMargin: '200px' },
      );
      blickfeld.observe(container);
    }

    return () => {
      verlassen = true;
      blickfeld?.disconnect();
      // Erst die Auswahl: Sie hängt die ursprünglichen Materialien zurück, die Ansicht gibt sie frei.
      wahl.current?.dispose();
      wahl.current = null;
      ansicht?.dispose();
    };
  }, [label, mitAuswahl]);

  useEffect(() => {
    uebertragen.current();
  }, [stand]);

  return (
    // Die Zeichenfläche liegt über der Bühne, statt sie aufzuspannen: So gibt die Bühne Höhe her,
    // wenn die Seite sie braucht.
    <div
      ref={buehne}
      data-lastenrad
      className={`bg-radbuehne rounded-image relative overflow-hidden [&>canvas]:absolute [&>canvas]:inset-0 ${className}`}
    >
      {ohneAnsicht ? (
        <p className="text-ink absolute inset-0 flex items-center justify-center px-4 text-center text-sm">
          3D-Ansicht nicht verfügbar
        </p>
      ) : null}
    </div>
  );
}
