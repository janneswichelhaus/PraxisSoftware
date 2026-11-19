import { useEffect, useRef, useState } from 'react';
import type { LastenradAnsicht } from './lastenrad3d/viewer';

/**
 * Das Own Motion Lastenrad als 3D-Ansicht zum Drehen, nur zum Ansehen. three.js lädt erst, wenn
 * die Bühne ins Bild kommt, und nie mit dem Einstieg (`lastenrad3d/einstieg.test.ts`).
 */
export function Lastenrad3D({
  className = 'h-64',
}: {
  /** Die feste Höhe der Bühne, dazu Abstände; ohne Höhe bleibt die Ansicht leer. */
  className?: string;
}) {
  const buehne = useRef<HTMLDivElement>(null);
  const [ohneAnsicht, setOhneAnsicht] = useState(false);

  useEffect(() => {
    const container = buehne.current;
    if (!container) return undefined;
    let verlassen = false;
    let ansicht: LastenradAnsicht | null = null;

    const starten = () => {
      import('./lastenrad3d/viewer')
        // Ohne Zoom: Mausrad und senkrechtes Wischen gehören der Seite, gedreht wird waagerecht.
        .then(({ mountLastenrad }) => mountLastenrad(container, { zoom: false }))
        .then(
          (fertig) => {
            // Verlassen, bevor die Ansicht stand: Sie gibt Speicher und Grafikkontext gleich frei.
            if (verlassen) fertig.dispose();
            else ansicht = fertig;
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
      ansicht?.dispose();
    };
  }, []);

  return (
    <div
      ref={buehne}
      data-lastenrad
      className={`bg-radbuehne rounded-image relative overflow-hidden ${className}`}
    >
      {ohneAnsicht ? (
        <p className="text-ink absolute inset-0 flex items-center justify-center px-4 text-center text-sm">
          3D-Ansicht nicht verfügbar
        </p>
      ) : null}
    </div>
  );
}
