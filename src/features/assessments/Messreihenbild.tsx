import { formatDate } from '@/lib/datum';
import { beschriftung } from './darstellung';
import {
  ereignisartTexte,
  tagZahl,
  zeitraum,
  type Messreihe,
  type Verlaufsereignis,
} from './verlauf';

/**
 * Eine Messreihe als Bild: Punkte, keine Linie (FRB-002e, `IDEA-OUT-005`).
 *
 * Was hier nicht steht, ist Absicht (ADR-006 Punkt 11): keine Verbindung der
 * Punkte, kein Trend, keine Farbe nach Höhe des Wertes, kein Schwellenwert.
 * Ereignisse stehen als senkrechte Markierung mit Nummer; was sie bedeuten,
 * steht in der Liste darunter, in den Worten der Praxis. Durchgeführte Termine
 * sind Striche an der Zeitachse.
 *
 * Unter dem Bild stehen die Werte als Text — die Rohdaten, lesbar auch ohne
 * Bild und für Vorlesesoftware.
 */
const BREITE = 320;
const HOEHE = 150;
const LINKS = 26;
const RECHTS = 8;
const OBEN = 16;
const UNTEN = 26;

export function Messreihenbild({
  reihe,
  ereignisse,
  termine,
}: {
  reihe: Messreihe;
  ereignisse: readonly Verlaufsereignis[];
  /** Tage durchgeführter Termine. */
  termine: readonly string[];
}) {
  const skala = reihe.item.skala ?? { min: 0, max: 10 };
  const bereich = zeitraum([
    ...reihe.punkte.map((p) => p.datum),
    ...ereignisse.map((e) => e.occurred_on),
  ]);
  if (!bereich) return null;

  const x = (datum: string) =>
    LINKS +
    ((tagZahl(datum) - bereich.von) / (bereich.bis - bereich.von)) * (BREITE - LINKS - RECHTS);
  const y = (wert: number) =>
    OBEN + (1 - (wert - skala.min) / (skala.max - skala.min)) * (HOEHE - OBEN - UNTEN);
  const imBereich = (datum: string) => {
    const tag = tagZahl(datum);
    return tag >= bereich.von && tag <= bereich.bis;
  };
  const achse = HOEHE - UNTEN;
  const mitte = Math.round((skala.min + skala.max) / 2);

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-ink text-sm font-medium">{beschriftung(reihe.item)}</figcaption>
      <svg viewBox={`0 0 ${BREITE} ${HOEHE}`} className="h-auto w-full max-w-lg" aria-hidden="true">
        {[skala.min, mitte, skala.max].map((wert) => (
          <g key={wert}>
            <line
              x1={LINKS}
              x2={BREITE - RECHTS}
              y1={y(wert)}
              y2={y(wert)}
              className="stroke-line"
              strokeWidth={0.6}
            />
            <text
              x={LINKS - 6}
              y={y(wert) + 3}
              textAnchor="end"
              className="fill-ink-muted text-[9px]"
            >
              {wert}
            </text>
          </g>
        ))}
        {termine.filter(imBereich).map((datum, i) => (
          <line
            key={`${datum}-${i}`}
            x1={x(datum)}
            x2={x(datum)}
            y1={achse}
            y2={achse + 5}
            className="stroke-ink-muted"
            strokeWidth={1}
          />
        ))}
        {ereignisse.map((ereignis, i) => (
          <g key={ereignis.id}>
            <line
              x1={x(ereignis.occurred_on)}
              x2={x(ereignis.occurred_on)}
              y1={OBEN - 4}
              y2={achse}
              className="stroke-ink-muted"
              strokeWidth={0.8}
              strokeDasharray="3 3"
            />
            <text x={x(ereignis.occurred_on) + 2} y={OBEN - 6} className="fill-ink text-[9px]">
              {i + 1}
            </text>
          </g>
        ))}
        {reihe.punkte.map((punkt, i) => (
          <g key={`${punkt.datum}-${i}`}>
            <circle cx={x(punkt.datum)} cy={y(punkt.wert)} r={3.5} className="fill-accent" />
            <text
              x={x(punkt.datum)}
              y={y(punkt.wert) - 6}
              textAnchor="middle"
              className="fill-ink text-[9px]"
            >
              {punkt.wert}
            </text>
          </g>
        ))}
        <text x={LINKS} y={HOEHE - 6} className="fill-ink-muted text-[9px]">
          {formatDate(isoTag(bereich.von))}
        </text>
        <text
          x={BREITE - RECHTS}
          y={HOEHE - 6}
          textAnchor="end"
          className="fill-ink-muted text-[9px]"
        >
          {formatDate(isoTag(bereich.bis))}
        </text>
      </svg>
      <p className="text-ink-muted text-sm">
        Werte: {reihe.punkte.map((p) => `${formatDate(p.datum)}: ${p.wert}`).join(' · ')}
      </p>
    </figure>
  );
}

function isoTag(tag: number): string {
  return new Date(tag * 86_400_000).toISOString().slice(0, 10);
}

/** Die Legende der Markierungen — dieselbe Nummer wie im Bild. */
export function Ereignisliste({
  ereignisse,
  onEntfernen,
}: {
  ereignisse: readonly Verlaufsereignis[];
  onEntfernen?: (ereignis: Verlaufsereignis) => void;
}) {
  if (ereignisse.length === 0) {
    return <p className="text-ink-muted text-sm">Noch kein Ereignis vermerkt.</p>;
  }
  return (
    <ol className="flex flex-col gap-1 text-sm">
      {ereignisse.map((ereignis, i) => (
        <li key={ereignis.id} className="flex flex-wrap items-center gap-x-3">
          <span className="text-ink-muted w-6 shrink-0 tabular-nums">{i + 1}</span>
          <span className="text-ink-muted w-24 shrink-0 tabular-nums">
            {formatDate(ereignis.occurred_on)}
          </span>
          <span className="text-ink min-w-0 flex-1">
            {ereignisartTexte[ereignis.kind]}
            {ereignis.note ? ` · ${ereignis.note}` : ''}
          </span>
          {onEntfernen ? (
            <button
              type="button"
              className="text-ink-muted hover:text-ink min-h-11 text-sm underline"
              onClick={() => onEntfernen(ereignis)}
            >
              Entfernen
            </button>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
