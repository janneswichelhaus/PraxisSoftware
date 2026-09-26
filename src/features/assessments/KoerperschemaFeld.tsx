import type { MouseEvent } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';
import bild from './koerperschema.webp';
import {
  BILD_BREITE,
  BILD_HOEHE,
  KOERPERBEREICHE,
  alsMarkierung,
  bereichAn,
  bereicheText,
  imBild,
  type Markierung,
} from './koerperschema';

/** Halbmesser des Kreises im Bild; bei 375 px Breite rund 11 px am Schirm. */
const RADIUS = 26;

/**
 * Das Körperschema als Eingabe (FRB-002d, `IDEA-PRX-027`, ANN-107).
 *
 * Antippen setzt einen **Kreis an genau dieser Stelle**; ein Tipp auf einen
 * vorhandenen Kreis nimmt ihn zurück. Die Figur ist für Vorlesesoftware
 * verborgen — dieselbe Auswahl steht darunter als Liste zum Aufklappen, dort
 * setzt ein Bereich seinen Kreis in die Mitte des Bereichs.
 *
 * Der Kreis sagt nur „hier". Keine Farbe nach Stärke, kein Verlauf, der eine
 * Intensität andeutet (ADR-006 Punkt 11).
 */
export function KoerperschemaFeld({
  legende,
  markierungen,
  onChange,
}: {
  legende: string;
  markierungen: Markierung[];
  onChange: (markierungen: Markierung[]) => void;
}) {
  const gewaehlt = markierungen.map((m) => m.bereich);

  function antippen(punkt: { x: number; y: number }) {
    const getroffen = markierungen.findIndex((m) => {
      const p = imBild(m);
      return Math.hypot(p.x - punkt.x, p.y - punkt.y) <= RADIUS;
    });
    if (getroffen >= 0) return onChange(markierungen.filter((_, i) => i !== getroffen));
    const bereich = bereichAn(punkt);
    if (bereich) onChange([...markierungen, alsMarkierung(punkt, bereich)]);
  }

  function umschalten(kennung: string) {
    if (gewaehlt.includes(kennung))
      return onChange(markierungen.filter((m) => m.bereich !== kennung));
    const bereich = KOERPERBEREICHE.find((b) => b.id === kennung)!;
    onChange([...markierungen, alsMarkierung(bereich.anker[0]!, bereich)]);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-ink mb-1 text-[0.9375rem] font-medium">{legende}</legend>
      <KoerperschemaBild markierungen={markierungen} onAntippen={antippen} />
      <p className="text-ink text-sm" aria-live="polite">
        {markierungen.length > 0
          ? `Markiert: ${bereicheText(gewaehlt)}`
          : 'Noch nichts markiert. Tippen Sie auf die Stelle der Beschwerden.'}
      </p>
      <details className="text-sm">
        <summary className="text-ink-muted hover:text-ink flex min-h-11 cursor-pointer items-center">
          Bereiche als Liste
        </summary>
        <div className="mt-2 grid sm:grid-cols-2">
          {KOERPERBEREICHE.map((bereich) => (
            <Checkbox
              key={bereich.id}
              label={bereich.label}
              checked={gewaehlt.includes(bereich.id)}
              onChange={() => umschalten(bereich.id)}
            />
          ))}
        </div>
      </details>
    </fieldset>
  );
}

/**
 * Die Zeichnung mit den Kreisen. Ohne `onAntippen` nur zum Ansehen — so steht
 * das Körperschema auch im Befund der Akte.
 */
export function KoerperschemaBild({
  markierungen,
  onAntippen,
}: {
  markierungen: readonly Markierung[];
  onAntippen?: (punkt: { x: number; y: number }) => void;
}) {
  function klick(event: MouseEvent<SVGSVGElement>) {
    if (!onAntippen) return;
    const rahmen = event.currentTarget.getBoundingClientRect();
    onAntippen({
      x: ((event.clientX - rahmen.left) / rahmen.width) * BILD_BREITE,
      y: ((event.clientY - rahmen.top) / rahmen.height) * BILD_HOEHE,
    });
  }

  return (
    <div className="bg-surface rounded-field border-line max-w-md border p-2" aria-hidden="true">
      <svg
        viewBox={`0 0 ${BILD_BREITE} ${BILD_HOEHE}`}
        className={`h-auto w-full ${onAntippen ? 'cursor-crosshair' : ''}`}
        role="presentation"
        onClick={onAntippen ? klick : undefined}
      >
        <image href={bild} x={0} y={0} width={BILD_BREITE} height={BILD_HOEHE} />
        {/* Die Seiten der Person, nicht des Bildes. */}
        <text x={40} y={34} className="fill-ink-muted text-[32px]">
          R
        </text>
        <text x={400} y={34} textAnchor="end" className="fill-ink-muted text-[32px]">
          L
        </text>
        <text x={440} y={34} className="fill-ink-muted text-[32px]">
          L
        </text>
        <text x={790} y={34} textAnchor="end" className="fill-ink-muted text-[32px]">
          R
        </text>
        {markierungen.map((m, i) => {
          const p = imBild(m);
          return (
            <circle
              key={`${m.x}-${m.y}-${i}`}
              data-markierung={m.bereich}
              cx={p.x}
              cy={p.y}
              r={RADIUS}
              className="fill-accent/20 stroke-accent"
              strokeWidth={5}
            />
          );
        })}
      </svg>
      <div className="text-ink-muted flex justify-around text-xs">
        <span>Vorderansicht</span>
        <span>Rückansicht</span>
      </div>
    </div>
  );
}
