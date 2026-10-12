import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatDate } from '@/lib/datum';
import { isoTag, tagZahl, zeitraum } from '@/lib/zeitachse';
import { BILD_BREITE, schriftInEinheiten } from './bildSchrift';

/**
 * Werte über die Zeit als Bild: Punkte, keine Linie (FRB-002e, OUT-001,
 * `IDEA-OUT-005`). Der eine Baustein für den Befund, „Zwischen den Terminen“
 * und „Meine Angaben“.
 *
 * Was hier nicht steht, ist Absicht (ADR-006 Punkt 11): keine Verbindung der
 * Punkte, kein Trend, keine Farbe nach Höhe des Wertes, kein Schwellenwert.
 * Markierungen stehen als senkrechte Linie mit Nummer; was sie bedeuten, steht
 * unter dem Bild. Durchgeführte Termine sind Striche an der Zeitachse.
 *
 * Unter dem Bild stehen die Werte als Text – die Rohdaten, lesbar auch ohne
 * Bild und für Vorlesesoftware.
 */
const BREITE = BILD_BREITE;
const HOEHE = 150;
const LINKS = 26;
const RECHTS = 8;
const OBEN = 18;
const UNTEN = 26;

export interface Bildpunkt {
  datum: string;
  wert: number;
}

export interface Bildmarkierung {
  /** Der Tag der Markierung. */
  datum: string;
  /** Was sie bedeutet, kurz – erscheint mit ihrer Nummer unter dem Bild. */
  text: string;
}

/** Die gerenderte Breite des Bildes; ohne ResizeObserver (jsdom) `null`. */
function useBildbreite() {
  const ref = useRef<SVGSVGElement>(null);
  const [breite, setBreite] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const beobachter = new ResizeObserver(([eintrag]) => {
      if (eintrag) setBreite(Math.round(eintrag.contentRect.width));
    });
    beobachter.observe(element);
    return () => beobachter.disconnect();
  }, []);
  return { ref, breite };
}

export function Punktbild({
  beschriftung,
  skala,
  punkte,
  markierungen = [],
  termine = [],
  wertText = String,
  zeitraumDaten,
}: {
  beschriftung: ReactNode;
  skala: { min: number; max: number };
  /** Die Rohwerte, in beliebiger Reihenfolge. */
  punkte: readonly Bildpunkt[];
  /** Nummeriert in dieser Reihenfolge, ab 1. */
  markierungen?: readonly Bildmarkierung[];
  /** Tage durchgeführter Termine. */
  termine?: readonly string[];
  /** Wie ein Wert in der Zeile „Werte“ steht, etwa „stechend“ oder „30 Minuten“. */
  wertText?: (wert: number) => string;
  /**
   * Tage, die der gezeigte Zeitraum mindestens umfasst – damit mehrere Bilder
   * nebeneinander dieselbe Achse haben. Ohne Angabe: Punkte und Markierungen.
   */
  zeitraumDaten?: readonly string[];
}) {
  const { ref: bildRef, breite } = useBildbreite();
  const SCHRIFT = schriftInEinheiten(breite);
  /** So nah beieinander überlagern sich zwei Wertebeschriftungen (Breite zweier Ziffern, Zeilenhöhe). */
  const ABSTAND_X = SCHRIFT * 1.3;
  const ABSTAND_Y = SCHRIFT;
  const bereich = zeitraum(
    zeitraumDaten ?? [...punkte.map((p) => p.datum), ...markierungen.map((m) => m.datum)],
  );
  if (!bereich || punkte.length === 0) return null;
  const sortiert = [...punkte].sort((a, b) => a.datum.localeCompare(b.datum));

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

  // Markierungen desselben Tages stehen an **einer** Linie mit allen Nummern,
  // „1, 2" (BEF-20) - zwei Linien an derselben Stelle schrieben ihre Nummern
  // übereinander. Die Nummer ist die der Legende.
  const tage = new Map<string, number[]>();
  markierungen.forEach((markierung, i) => {
    if (!imBereich(markierung.datum)) return;
    tage.set(markierung.datum, [...(tage.get(markierung.datum) ?? []), i + 1]);
  });

  // Liegen zwei Punkte so nah, dass sich ihre Zahlen überlagern, trägt nur der
  // erste eine: Den Wert des zweiten nennt die Zeile „Werte" darunter.
  const beschriftet: { x: number; y: number }[] = [];
  const mitZahl = sortiert.map((punkt) => {
    const stelle = { x: x(punkt.datum), y: y(punkt.wert) };
    const frei = beschriftet.every(
      (andere) =>
        Math.abs(andere.x - stelle.x) >= ABSTAND_X || Math.abs(andere.y - stelle.y) >= ABSTAND_Y,
    );
    if (frei) beschriftet.push(stelle);
    return frei;
  });

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-ink text-sm font-medium">{beschriftung}</figcaption>
      <svg
        ref={bildRef}
        viewBox={`0 0 ${BREITE} ${HOEHE}`}
        className="h-auto w-full max-w-lg"
        aria-hidden="true"
      >
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
              x={LINKS - 5}
              y={y(wert) + SCHRIFT / 3}
              textAnchor="end"
              fontSize={SCHRIFT}
              className="fill-ink-muted"
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
        {[...tage].map(([tag, nummern]) => (
          <g key={tag}>
            <line
              x1={x(tag)}
              x2={x(tag)}
              y1={OBEN - 4}
              y2={achse}
              className="stroke-ink-muted"
              strokeWidth={0.8}
              strokeDasharray="3 3"
            />
            <text x={x(tag) + 2} y={OBEN - 5} fontSize={SCHRIFT} className="fill-ink">
              {nummern.join(', ')}
            </text>
          </g>
        ))}
        {sortiert.map((punkt, i) => (
          <g key={`${punkt.datum}-${i}`}>
            <circle cx={x(punkt.datum)} cy={y(punkt.wert)} r={3.5} className="fill-accent" />
            {mitZahl[i] ? (
              <text
                x={x(punkt.datum)}
                y={y(punkt.wert) - 6}
                textAnchor="middle"
                fontSize={SCHRIFT}
                className="fill-ink"
              >
                {punkt.wert}
              </text>
            ) : null}
          </g>
        ))}
        <text x={LINKS} y={HOEHE - 5} fontSize={SCHRIFT} className="fill-ink-muted">
          {formatDate(isoTag(bereich.von))}
        </text>
        <text
          x={BREITE - RECHTS}
          y={HOEHE - 5}
          textAnchor="end"
          fontSize={SCHRIFT}
          className="fill-ink-muted"
        >
          {formatDate(isoTag(bereich.bis))}
        </text>
      </svg>
      <p className="text-ink-muted text-sm">
        Werte: {sortiert.map((p) => `${formatDate(p.datum)}: ${wertText(p.wert)}`).join(' · ')}
      </p>
      {/* Die Legende steht unter jedem Bild (BEF-20): Bei vier Skalen lag die
          Liste der Ereignisse am Telefon bis zu 1 000 px unter dem ersten. */}
      {markierungen.length > 0 ? (
        <p className="text-ink-muted text-sm">
          Ereignisse: {markierungen.map((m, i) => `${i + 1} ${m.text}`).join(' · ')}
        </p>
      ) : null}
    </figure>
  );
}
