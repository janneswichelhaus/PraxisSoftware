import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { zwischen, umgebung } from './loeser';
import type { Uebungsbild as Bild } from './schema';
import { szene, type Darstellung, type Farbe, type Strich, type Szene } from './szene';

/**
 * Das Übungsbild (ANN-381): eine Linienfigur aus der Posen-Beschreibung.
 *
 * - `start-ende`: zwei Bilder nebeneinander, Ausgangs- und Endstellung;
 * - `bewegung`: ein Bild, die Ausgangsstellung blass, die Endstellung kräftig,
 *   dazu ein Pfeil - für Karten am Telefon;
 * - `vorschau`: quadratisch, ohne Pfeil - für Listen (56 px).
 *
 * Mit `animierbar` spielt ein Knopf die Bewegung ab - nur auf Tippen, nie von
 * selbst. Bei „Bewegung reduzieren" wechselt er stattdessen zwischen
 * Ausgangs- und Endstellung, ohne Übergang.
 *
 * Das Bild ergänzt den Text und ersetzt ihn nie. Gezeichnet wird mit Pfaden
 * aus Zahlen (`szene.ts`), ohne Zeichenkette aus den Daten im SVG.
 */

const FARBE: Readonly<Record<Farbe, { linie: string; flaeche: string }>> = {
  nah: { linie: 'stroke-accent', flaeche: 'fill-accent' },
  fern: { linie: 'stroke-figur-fern', flaeche: 'fill-figur-fern' },
  gegenstand: { linie: 'stroke-line-strong', flaeche: 'fill-surface' },
  band: { linie: 'stroke-figur-band', flaeche: 'fill-none' },
  pfeil: { linie: 'stroke-figur-bewegung', flaeche: 'fill-none' },
  boden: { linie: 'stroke-line-strong', flaeche: 'fill-none' },
};

function Striche({ striche }: { striche: readonly Strich[] }) {
  return (
    <>
      {striche.map((s, i) => (
        <path
          key={i}
          d={s.d}
          strokeWidth={s.breite}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`${FARBE[s.farbe].linie} ${s.flaeche ? FARBE[s.farbe].flaeche : 'fill-none'}`}
        />
      ))}
    </>
  );
}

function Zeichnung({
  s,
  beschriftung,
  dekorativ,
  className = '',
}: {
  s: Szene;
  beschriftung: string;
  dekorativ: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox={s.viewBox}
      className={`block h-auto w-full ${className}`.trim()}
      {...(dekorativ ? { 'aria-hidden': true } : { role: 'img', 'aria-label': beschriftung })}
      focusable="false"
    >
      <Striche striche={[s.boden]} />
      <Striche striche={s.unten} />
      {s.geist.length > 0 ? (
        <g opacity={0.26}>
          <Striche striche={s.geist} />
        </g>
      ) : null}
      <Striche striche={s.figur} />
      <Striche striche={s.pfeile} />
    </svg>
  );
}

function bewegungReduziert(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;
}

/** Eine Runde hin und zurück, in Millisekunden. */
const RUNDE = 2600;

export function Uebungsbild({
  bild,
  name,
  darstellung = 'bewegung',
  animierbar = false,
  dekorativ = false,
  className = '',
}: {
  bild: Bild;
  /** Wie die Übung heißt, in der Sprache der Lesenden - für die Bildbeschreibung. */
  name: string;
  darstellung?: 'start-ende' | 'bewegung' | 'vorschau';
  animierbar?: boolean;
  /** Steht der Name schon daneben (Liste), liest Vorlesesoftware das Bild nicht vor. */
  dekorativ?: boolean;
  className?: string;
}) {
  const [abspielen, setAbspielen] = useState(false);
  const [endeZeigen, setEndeZeigen] = useState(false);
  const [t, setT] = useState(0);
  const [reduziert] = useState(bewegungReduziert);

  const statisch = useMemo(() => {
    if (darstellung === 'start-ende') {
      return { start: szene(bild, 'start'), ende: szene(bild, 'ende') };
    }
    const art: Darstellung = darstellung === 'vorschau' ? 'vorschau' : 'bewegung';
    return { einzeln: szene(bild, art) };
  }, [bild, darstellung]);

  const u = useMemo(() => umgebung(bild), [bild]);

  useEffect(() => {
    if (!abspielen) return;
    let rahmen = 0;
    const beginn = performance.now();
    const schritt = (jetzt: number) => {
      const anteil = ((jetzt - beginn) % RUNDE) / RUNDE;
      setT((1 - Math.cos(anteil * 2 * Math.PI)) / 2);
      rahmen = requestAnimationFrame(schritt);
    };
    rahmen = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(rahmen);
  }, [abspielen]);

  const bewegt = useMemo(() => {
    if (abspielen) return szene(bild, 'bewegung', zwischen(bild, u, t));
    if (endeZeigen) return szene(bild, 'ende');
    return null;
  }, [abspielen, endeZeigen, bild, u, t]);

  // Bei reduzierter Bewegung zeigt die Doppelansicht ohnehin beide Stellungen.
  const knopf =
    animierbar && !(reduziert && darstellung === 'start-ende') ? (
      <Button
        type="button"
        variant="quiet"
        groesse="kompakt"
        className="mt-1 gap-2"
        aria-pressed={abspielen || endeZeigen}
        onClick={() => {
          if (reduziert) {
            setEndeZeigen((wert) => !wert);
          } else {
            setT(0);
            setAbspielen((wert) => !wert);
          }
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-current">
          {abspielen ? <path d="M4 3h3v10H4zM9 3h3v10H9z" /> : <path d="M4 2.5v11l9-5.5z" />}
        </svg>
        {abspielen
          ? 'Anhalten'
          : reduziert
            ? endeZeigen
              ? 'Ausgangsstellung zeigen'
              : 'Endstellung zeigen'
            : 'Bewegung abspielen'}
      </Button>
    ) : null;

  if ('start' in statisch && statisch.start && statisch.ende && !bewegt) {
    return (
      <div className={className}>
        <div className="grid grid-cols-2 gap-2">
          <figure className="m-0">
            <Zeichnung
              s={statisch.start}
              beschriftung={`${name}: Ausgangsstellung`}
              dekorativ={dekorativ}
              className="bg-surface-sunken rounded-image"
            />
            <figcaption className="text-ink-muted mt-1 text-center text-xs font-semibold">
              1 · Start
            </figcaption>
          </figure>
          <figure className="m-0">
            <Zeichnung
              s={statisch.ende}
              beschriftung={`${name}: Endstellung`}
              dekorativ={dekorativ}
              className="bg-surface-sunken rounded-image"
            />
            <figcaption className="text-ink-muted mt-1 text-center text-xs font-semibold">
              2 · Ende
            </figcaption>
          </figure>
        </div>
        {knopf}
      </div>
    );
  }

  const zeigen = bewegt ?? ('einzeln' in statisch ? statisch.einzeln : null);
  if (!zeigen) return null;
  return (
    <div className={className}>
      <Zeichnung
        s={zeigen}
        beschriftung={
          darstellung === 'vorschau'
            ? `Bild: ${name}`
            : `${name}: Bewegung von der Ausgangs- zur Endstellung`
        }
        dekorativ={dekorativ}
        className={
          darstellung === 'vorschau'
            ? 'bg-surface-sunken rounded-button'
            : 'bg-surface-sunken rounded-image'
        }
      />
      {knopf}
    </div>
  );
}
