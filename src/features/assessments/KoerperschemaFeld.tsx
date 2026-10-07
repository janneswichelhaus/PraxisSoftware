import { useState, type MouseEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { ZU_VIELE_STELLEN } from './antworten';
import bild from './koerperschema.webp';
import {
  BILD_BREITE,
  BILD_HOEHE,
  KOERPERBEREICHE,
  MAX_MARKIERUNGEN,
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
 *
 * **Zurücknehmen ohne Zielen (BEF-06).** Der Kreis misst am Telefon rund
 * 21 px; wer knapp daneben tippt, setzt einen zweiten, statt den ersten zu
 * entfernen. „Letzten Kreis entfernen" nimmt den zuletzt gesetzten zurück,
 * ohne die Stelle zu treffen. Die Trefferfläche selbst bleibt so groß wie der
 * Kreis: Sie zu vergrößern hieße, nahe Markierungen schwerer zu setzen - das
 * wägt Jannes gegen ANN-107 ab.
 *
 * **Höchstens 30 Kreise (ANN-107, BEF-03).** Der einunddreißigste entsteht
 * gar nicht erst; die Meldung sagt, was zu tun ist, statt dass beim Sichern
 * eine Prüfung scheitert.
 */
export function KoerperschemaFeld({
  legende,
  markierungen,
  onChange,
  feldId,
  fehler,
}: {
  legende: string;
  markierungen: Markierung[];
  onChange: (markierungen: Markierung[]) => void;
  /** Sprungziel der Fehlerzusammenfassung (BEF-03). */
  feldId?: string | undefined;
  /** Was an der Antwort nicht stimmt; steht an der Frage. */
  fehler?: string | undefined;
}) {
  const gewaehlt = markierungen.map((m) => m.bereich);
  const [voll, setVoll] = useState(false);
  const fehlerId = feldId ? `${feldId}-fehler` : undefined;

  function setzen(neu: Markierung[]) {
    setVoll(false);
    onChange(neu);
  }

  function hinzufuegen(markierung: Markierung) {
    if (markierungen.length >= MAX_MARKIERUNGEN) {
      setVoll(true);
      return;
    }
    setzen([...markierungen, markierung]);
  }

  function antippen(punkt: { x: number; y: number }) {
    const getroffen = markierungen.findIndex((m) => {
      const p = imBild(m);
      return Math.hypot(p.x - punkt.x, p.y - punkt.y) <= RADIUS;
    });
    if (getroffen >= 0) return setzen(markierungen.filter((_, i) => i !== getroffen));
    const bereich = bereichAn(punkt);
    if (bereich) hinzufuegen(alsMarkierung(punkt, bereich));
  }

  function umschalten(kennung: string) {
    if (gewaehlt.includes(kennung))
      return setzen(markierungen.filter((m) => m.bereich !== kennung));
    const bereich = KOERPERBEREICHE.find((b) => b.id === kennung)!;
    hinzufuegen(alsMarkierung(bereich.anker[0]!, bereich));
  }

  return (
    <fieldset
      id={feldId}
      // Sprungziel der Fehlerzusammenfassung: fokussierbar, aber nicht in der
      // Tab-Reihenfolge.
      tabIndex={feldId ? -1 : undefined}
      aria-describedby={fehler ? fehlerId : undefined}
      className="flex flex-col gap-2"
    >
      <legend className="text-ink text-liste mb-1 font-medium">{legende}</legend>
      <KoerperschemaBild markierungen={markierungen} onAntippen={antippen} />
      {/* Der Knopf steht neben dem Stand statt darunter: Mit dem ersten Kreis
          erscheint er, ohne dass der Rest des Bogens nach unten rückt. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <p className="text-ink min-w-0 flex-1 basis-48 text-sm" aria-live="polite">
          {markierungen.length > 0
            ? `Markiert: ${bereicheText(gewaehlt)}`
            : 'Noch nichts markiert. Tippen Sie auf die Stelle der Beschwerden.'}
        </p>
        {markierungen.length > 0 ? (
          <Button
            type="button"
            variant="quiet"
            groesse="kompakt"
            className="shrink-0"
            onClick={() => setzen(markierungen.slice(0, -1))}
          >
            Letzten Kreis entfernen
          </Button>
        ) : null}
      </div>
      {voll ? <Statusmeldung ton="warnung">{ZU_VIELE_STELLEN}</Statusmeldung> : null}
      {fehler ? (
        <p id={fehlerId} className="text-danger text-sm">
          {fehler}
        </p>
      ) : null}
      <Disclosure summary="Bereiche als Liste">
        <div className="grid sm:grid-cols-2">
          {KOERPERBEREICHE.map((bereich) => (
            <Checkbox
              key={bereich.id}
              label={bereich.label}
              checked={gewaehlt.includes(bereich.id)}
              onChange={() => umschalten(bereich.id)}
            />
          ))}
        </div>
      </Disclosure>
    </fieldset>
  );
}

/**
 * Die Zeichnung mit den Kreisen. Ohne `onAntippen` nur zum Ansehen — so steht
 * das Körperschema auch im Befund der Akte.
 *
 * Zum Antippen trägt die Figur den Rand eines Bedienelements (`line-strong`),
 * zum Ansehen den einer Fläche (`line`, BEF-04). Ab 640 px ist sie breiter:
 * Der Kreis wächst mit, und das Zurücknehmen trifft leichter (BEF-06).
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
    <div
      className={`bg-surface rounded-image border p-2 ${
        onAntippen ? 'border-line-strong max-w-md sm:max-w-xl' : 'border-line max-w-md'
      }`}
      aria-hidden="true"
    >
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
              // Durchscheinend, damit der Kreis die Anatomie nicht verdeckt
              // (ANN-107) - ein Überzug wie der Schleier des Dialogs, keine
              // Farbe des Systems.
              className="fill-accent/20 stroke-accent"
              strokeWidth={5}
            />
          );
        })}
      </svg>
      <div className="text-ink-muted flex flex-wrap justify-around gap-x-2 text-xs">
        <span>Vorderansicht</span>
        <span>Rückansicht</span>
      </div>
    </div>
  );
}
