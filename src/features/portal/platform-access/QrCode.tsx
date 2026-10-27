import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * Ein QR-Code als SVG (ADR-023 Punkt 8, W2).
 *
 * Die Person scannt ihn mit dem eigenen Telefon; darin steht nur die Adresse
 * der Einlöseseite mit dem Code im Fragment. Gezeichnet wird aus der Matrix
 * der Bibliothek, nicht über deren HTML-Ausgabe: kein `innerHTML`. Schwarz
 * auf Weiß unabhängig vom Farbschema - ein heller Code auf dunklem Grund
 * lesen viele Kameras nicht.
 *
 * Fehlerkorrektur `M`: genug Reserve für ein spiegelndes Display beim
 * Hausbesuch, ohne den Code unnötig dicht zu machen.
 */
export function QrCode({
  inhalt,
  groesse = 240,
  bezeichnung,
}: {
  inhalt: string;
  groesse?: number;
  bezeichnung: string;
}) {
  const { anzahl, pfad } = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(inhalt);
    code.make();
    const n = code.getModuleCount();
    const teile: string[] = [];
    for (let zeile = 0; zeile < n; zeile += 1) {
      for (let spalte = 0; spalte < n; spalte += 1) {
        if (code.isDark(zeile, spalte)) teile.push(`M${spalte} ${zeile}h1v1h-1z`);
      }
    }
    return { anzahl: n, pfad: teile.join('') };
  }, [inhalt]);

  // Vier Module Ruhezone ringsum, wie die Norm sie verlangt.
  const rand = 4;
  const seite = anzahl + 2 * rand;
  return (
    <svg
      role="img"
      aria-label={bezeichnung}
      width={groesse}
      height={groesse}
      viewBox={`${-rand} ${-rand} ${seite} ${seite}`}
      shapeRendering="crispEdges"
      className="rounded-image bg-white"
    >
      <rect x={-rand} y={-rand} width={seite} height={seite} fill="#ffffff" />
      <path d={pfad} fill="#000000" />
    </svg>
  );
}
