import { useState } from 'react';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
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
 * steht in einer kurzen Legende unter dem Bild und in der Liste darunter, in
 * den Worten der Praxis. Durchgeführte Termine sind Striche an der Zeitachse.
 *
 * Unter dem Bild stehen die Werte als Text — die Rohdaten, lesbar auch ohne
 * Bild und für Vorlesesoftware.
 */
const BREITE = 320;
const HOEHE = 150;
const LINKS = 26;
const RECHTS = 8;
const OBEN = 18;
const UNTEN = 26;

/**
 * Schriftgröße im Bild, in Bildeinheiten (RSP-09). Das Bild ist 320 Einheiten
 * breit und skaliert mit: Ab 300 px Bildbreite ergibt das mindestens 12 px am
 * Schirm. Bis UXR-009 waren es 9 Einheiten, am Telefon rund 10 px.
 */
const SCHRIFT = 13;

/** So nah beieinander überlagern sich zwei Wertebeschriftungen (Breite zweier Ziffern, Zeilenhöhe). */
const ABSTAND_X = SCHRIFT * 1.3;
const ABSTAND_Y = SCHRIFT;

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

  // Ereignisse desselben Tages stehen an **einer** Linie mit allen Nummern,
  // „1, 2" (BEF-20) - zwei Linien an derselben Stelle schrieben ihre Nummern
  // übereinander. Die Nummer ist die der Liste.
  const tage = new Map<string, number[]>();
  ereignisse.forEach((ereignis, i) => {
    tage.set(ereignis.occurred_on, [...(tage.get(ereignis.occurred_on) ?? []), i + 1]);
  });

  // Liegen zwei Punkte so nah, dass sich ihre Zahlen überlagern, trägt nur der
  // erste eine: Den Wert des zweiten nennt die Zeile „Werte" darunter.
  const beschriftet: { x: number; y: number }[] = [];
  const mitZahl = reihe.punkte.map((punkt) => {
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
      <figcaption className="text-ink text-sm font-medium">
        {beschriftung(reihe.item)}
        {/* Ein Wert ohne Richtung steht mit seiner Leseart da, ohne Wertung
            (Tegner: „höher = aktiver", ABN-014, BEF-101 Punkt 3). */}
        {reihe.instrument.scoring.leseart ? (
          <span className="text-ink-muted block font-normal">
            {reihe.instrument.scoring.leseart}
          </span>
        ) : null}
      </figcaption>
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
        {reihe.punkte.map((punkt, i) => (
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
        Werte: {reihe.punkte.map((p) => `${formatDate(p.datum)}: ${p.wert}`).join(' · ')}
      </p>
      {/* Die Legende steht unter jedem Bild (BEF-20): Bei vier Skalen lag die
          Liste der Ereignisse am Telefon bis zu 1 000 px unter dem ersten. */}
      {ereignisse.length > 0 ? (
        <p className="text-ink-muted text-sm">
          Ereignisse: {ereignisse.map((e, i) => `${i + 1} ${ereignisartTexte[e.kind]}`).join(' · ')}
        </p>
      ) : null}
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
  /**
   * Entfernt ein Ereignis. Liefert es ein Versprechen, wartet die Rückfrage
   * darauf und zeigt einen Fehlschlag im offenen Kasten (BEF-01).
   */
  onEntfernen?: ((ereignis: Verlaufsereignis) => void | Promise<unknown>) | undefined;
}) {
  if (ereignisse.length === 0) {
    return <p className="text-ink-muted text-sm">Noch kein Ereignis vermerkt.</p>;
  }
  return (
    <ol className="flex flex-col gap-1 text-sm">
      {ereignisse.map((ereignis, i) => (
        <Ereigniszeile
          key={ereignis.id}
          nummer={i + 1}
          ereignis={ereignis}
          onEntfernen={onEntfernen}
        />
      ))}
    </ol>
  );
}

/**
 * Eine Zeile der Liste. „Entfernen" nimmt das Ereignis aus dem Verlauf; es
 * bleibt unter „Entfernte Ereignisse" nachvollziehbar (ABN-013) - erst
 * nach einer Rückfrage, die Art und Tag nennt, und gesperrt, solange es läuft
 * (BEF-01, ZST-14, ZST-20). Bis UXR-009 genügte ein Tipp, und ein zweiter
 * endete in „Das Ereignis wurde nicht gefunden."
 */
function Ereigniszeile({
  nummer,
  ereignis,
  onEntfernen,
}: {
  nummer: number;
  ereignis: Verlaufsereignis;
  onEntfernen: ((ereignis: Verlaufsereignis) => void | Promise<unknown>) | undefined;
}) {
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  const art = ereignisartTexte[ereignis.kind];
  const tag = formatDate(ereignis.occurred_on);

  async function entfernen() {
    setFehler(undefined);
    try {
      await onEntfernen?.(ereignis);
    } catch (ursache) {
      // Der Kasten bleibt offen und nennt den Grund.
      setFehler(ursache instanceof Error ? ursache.message : undefined);
      throw ursache;
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3">
      <span className="text-ink-muted w-6 shrink-0 tabular-nums">{nummer}</span>
      <span className="text-ink-muted w-24 shrink-0 tabular-nums">{tag}</span>
      <span className="text-ink min-w-0 flex-1">
        {art}
        {ereignis.note ? ` · ${ereignis.note}` : ''}
      </span>
      {onEntfernen ? (
        // Am Telefon in einer eigenen Zeile: Neben Nummer, Tag und Knopf
        // blieben dem Text sonst rund 80 px, sechs Zeilen je Ereignis.
        <div className="basis-full sm:basis-auto">
          <Rueckfrage
            ausloeser="Entfernen"
            ausloeserVariante="quiet"
            bezeichnung={`Ereignis ${nummer} entfernen`}
            bestaetigen="Ja, Ereignis entfernen"
            bestaetigenLaeuft="Wird entfernt …"
            fehler={fehler}
            onAbbrechen={() => setFehler(undefined)}
            onBestaetigen={entfernen}
          >
            „{art}“ vom {tag} wird aus dem Verlauf entfernt. Es bleibt unter „Entfernte Ereignisse“
            nachvollziehbar.
          </Rueckfrage>
        </div>
      ) : null}
    </li>
  );
}
