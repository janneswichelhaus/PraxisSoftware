import { useCallback, useEffect, useRef, useState } from 'react';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { MARKE_SEITENVERHAELTNIS } from '@/components/ui/markeRegeln';
import { startbildVormerken } from '@/lib/startbildMerker';
import {
  AUSSCHNITT,
  BILDENDE,
  KACHEL,
  KACHEL_RADIUS,
  MARKE_640,
  REDUZIERT_DAUER,
  REDUZIERT_MARKE_AB,
  SEITENLEISTE,
  STARTBILD_DAUER,
  ankommen,
  anteil,
  bildZu,
  clip,
  clipRest,
  geraetFuer,
  landeplatz,
  mitte,
  monogrammLagen,
  verwandeln,
  zwischen,
  type Bild,
  type Lage,
} from './startbildGeometrie';

/**
 * Das Startbild „Speiche wird O" (Handoff Rahmen vom 2026-10-05, Abschnitt
 * 6; RAH-009): das Website-Intro von Jannes als Start der Anwendung.
 *
 * Ein Laufrad rollt von links herein, bremst an der Stelle des O, die
 * Speichen ziehen sich zur Nabe, die Felge wird das O der Marke, W und N
 * wischen auf, MOTION fährt ein - harter Schnitt auf die unveränderte
 * Markendatei, dann wandert die Marke an ihren Platz im Rahmen, und die Seite
 * blendet ein. 1,8 s bis zur Seite.
 *
 * **Die App zeichnet das Stück selbst**: SVG für Rad und O, dazu die
 * Markendatei aus `marke/` als Bild, nur beschnitten (`clip-path`) und
 * verschoben - nie umgefärbt, gedreht oder gedehnt (`marke/README.md`). Der
 * Kompositions-Motor, React-Standalone und Babel aus dem Export sind nicht
 * übernommen; der Takt kommt aus `requestAnimationFrame`, Kurven und Maße
 * stehen in `startbildGeometrie.ts`. Keine neue Abhängigkeit.
 *
 * **Wann**: einmal je Sitzung (`startbildMerker.ts`, ANN-243), entschieden in
 * `App.tsx`. Das Intro wartet auf nichts - Profil und Tagesliste laden
 * darunter; steht die Seite danach noch nicht, erscheint der Ladezustand wie
 * bisher.
 *
 * **Barrierefreiheit**: Das Intro liegt in einem `aria-hidden`-Container über
 * der Seite; Vorlesesoftware bekommt die Seite sofort, der Fokus bleibt dort.
 * „Überspringen" ist ein echter Knopf für Maus und Finger (`tabIndex=-1`, damit
 * er den Fokus nicht aus der Seite holt). Bei `prefers-reduced-motion` steht
 * nur die Marke 0,14 s, dann folgt der harte Schnitt auf die Seite (0,3 s).
 */

const FARBIG = '/marke/own-motion-block-farbig.svg';
const PAPIER = '/marke/own-motion-block-papier.svg';

function Markenbild({
  lage,
  quelle = FARBIG,
  clipPath,
  opacity = 1,
  transform,
  kennung,
}: {
  lage: Lage;
  quelle?: string;
  clipPath?: string;
  opacity?: number;
  transform?: string;
  kennung: string;
}) {
  return (
    <img
      src={quelle}
      alt=""
      data-marke={kennung}
      style={{
        position: 'absolute',
        left: lage.x,
        top: lage.y,
        width: lage.breite,
        height: lage.breite / MARKE_SEITENVERHAELTNIS,
        clipPath,
        opacity,
        transform,
      }}
    />
  );
}

/** Das Laufrad bzw. das O: eine Gruppe im Fenster-SVG. */
function Rad({
  cx,
  cy,
  k,
  drehung,
  verwandlung,
}: {
  cx: number;
  cy: number;
  k: number;
  /** Drehwinkel in Grad. */
  drehung: number;
  /** 0 Laufrad, 1 das O. */
  verwandlung: number;
}) {
  const r = MARKE_640.radRadius * k;
  const rx = r + (MARKE_640.oRx * k - r) * verwandlung;
  const ry = r + (MARKE_640.oRy * k - r) * verwandlung;
  const strich =
    (MARKE_640.radStrich + (MARKE_640.oStrich - MARKE_640.radStrich) * verwandlung) * k;
  const speichenlaenge = r * (1 - verwandlung);
  const nabe = MARKE_640.nabe * k * (1 - verwandlung);
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${drehung})`} fill="none" stroke="currentColor">
      <ellipse rx={rx} ry={ry} strokeWidth={strich} />
      {verwandlung < 1
        ? Array.from({ length: MARKE_640.speichen }, (_, i) => {
            const winkel = (i / MARKE_640.speichen) * Math.PI * 2;
            return (
              <line
                key={i}
                x1={Math.cos(winkel) * nabe}
                y1={Math.sin(winkel) * nabe}
                x2={Math.cos(winkel) * speichenlaenge}
                y2={Math.sin(winkel) * speichenlaenge}
                strokeWidth={MARKE_640.radStrich * k}
              />
            );
          })
        : null}
      {verwandlung < 1 ? <circle r={nabe} strokeWidth={MARKE_640.radStrich * k} /> : null}
    </g>
  );
}

/** Die Seite blendet gestaffelt ein (`src/index.css`, `.startbild-landung`). */
const LANDUNG_KLASSE = 'startbild-landung';
const LANDUNG_DAUER_MS = 560 + 70 * 6;

export function Startbild({
  onFertig,
  uhrzeit,
}: {
  /** Das Intro ist vorbei; der Rahmen entfernt den Baustein. */
  onFertig: () => void;
  /**
   * Nur für die Prüfseite: eine feste Zeit in Sekunden statt der Uhr. Das
   * Intro steht dann still, und `onFertig` wird nie gerufen.
   */
  uhrzeit?: number | undefined;
}) {
  const [reduziert] = useState(
    () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [fenster] = useState(() => ({ breite: window.innerWidth, hoehe: window.innerHeight }));
  const geraet = geraetFuer(fenster.breite);
  const [t, setT] = useState(uhrzeit ?? 0);
  const start = useRef<number | null>(null);
  const ziel = useRef<Lage | null>(null);
  const fertig = useRef(false);
  const dauer = reduziert ? REDUZIERT_DAUER : STARTBILD_DAUER;
  // `onFertig` als Referenz: Der Takt hängt nicht an der Identität der
  // Rückruffunktion, sonst starteten Uhr und Bild bei jedem Rendern des
  // Aufrufers neu.
  const fertigMelden = useRef(onFertig);
  fertigMelden.current = onFertig;
  const beenden = useCallback(() => {
    if (fertig.current) return;
    fertig.current = true;
    fertigMelden.current();
  }, []);

  // Der Merker beim Start, nicht am Ende: Ein abgebrochenes Intro wiederholt
  // sich nicht beim nächsten Seitenwechsel.
  useEffect(() => {
    if (uhrzeit === undefined) startbildVormerken();
  }, [uhrzeit]);

  useEffect(() => {
    if (uhrzeit !== undefined) return;
    let anfrage = 0;
    const schritt = (jetzt: number) => {
      if (start.current === null) start.current = jetzt;
      const sekunden = (jetzt - start.current) / 1000;
      if (sekunden >= dauer) {
        setT(dauer);
        beenden();
        return;
      }
      setT(sekunden);
      anfrage = requestAnimationFrame(schritt);
    };
    anfrage = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(anfrage);
  }, [beenden, dauer, uhrzeit]);

  const bild: Bild = reduziert ? (t < REDUZIERT_MARKE_AB ? 1 : t < dauer ? 5 : 6) : bildZu(t);

  // Die Seite blendet mit Bild 6 gestaffelt ein - als Klasse am Dokument, weil
  // die Seite unter dem Intro liegt und nichts von ihm weiß.
  useEffect(() => {
    if (uhrzeit !== undefined || reduziert || bild !== 6) return;
    document.documentElement.classList.add(LANDUNG_KLASSE);
    const timer = window.setTimeout(
      () => document.documentElement.classList.remove(LANDUNG_KLASSE),
      LANDUNG_DAUER_MS,
    );
    return () => {
      window.clearTimeout(timer);
      document.documentElement.classList.remove(LANDUNG_KLASSE);
    };
  }, [bild, reduziert, uhrzeit]);

  /** Springt an den Anfang von Bild 6 - die Seite blendet trotzdem ein. */
  const ueberspringen = useCallback(() => {
    if (uhrzeit !== undefined) return;
    if (reduziert) {
      beenden();
      return;
    }
    const jetzt = performance.now();
    const bisher = start.current === null ? 0 : (jetzt - start.current) / 1000;
    if (bisher >= BILDENDE.wortmarke) return;
    start.current = jetzt - BILDENDE.wortmarke * 1000;
    setT(BILDENDE.wortmarke);
  }, [beenden, reduziert, uhrzeit]);

  const zentrum = mitte(geraet, fenster.breite, fenster.hoehe);
  const k = zentrum.breite / MARKE_640.breite;

  // Bild 6: Landeplatz einmal messen, wenn es losgeht.
  if (bild === 6 && ziel.current === null) ziel.current = landeplatz(geraet);
  const abgang = bild === 6 ? verwandeln(anteil(t, BILDENDE.wortmarke, BILDENDE.abgang)) : 0;
  // Handy und Rechner: die ganze Marke wandert. Tablet: O und M wandern je
  // für sich in die Kachel, der Rest bleibt stehen und blendet aus.
  const lage =
    bild === 6 && ziel.current && geraet !== 'tablet'
      ? zwischen(zentrum, ziel.current, abgang)
      : zentrum;
  const monogramm =
    bild === 6 && ziel.current && geraet === 'tablet' ? monogrammLagen(ziel.current) : null;

  // Bild 2 und 3: das Rad.
  const oMitteX = zentrum.x + MARKE_640.oMitteX * k;
  const oMitteY = zentrum.y + MARKE_640.oMitteY * k;
  const radius = MARKE_640.radRadius * k;
  const startX = -radius - 8;
  const weg = ankommen(anteil(t, BILDENDE.papier, BILDENDE.rad));
  const radX = startX + (oMitteX - startX) * weg;
  const verwandlung = bild === 3 ? verwandeln(anteil(t, BILDENDE.rad, BILDENDE.speiche)) : 0;
  // Drehung folgt dem Weg (φ = s / r), dazu 18° Restdrehung in Bild 3.
  const drehung = ((radX - startX) / radius) * (180 / Math.PI) + 18 * verwandlung;

  // Bild 4: W und N wischen von links auf, MOTION fährt 24 px ein.
  const wAnteil = ankommen(anteil(t, BILDENDE.speiche, BILDENDE.speiche + 0.22));
  const nAnteil = ankommen(anteil(t, BILDENDE.speiche + 0.06, BILDENDE.speiche + 0.28));
  const motionAnteil = ankommen(anteil(t, BILDENDE.speiche, BILDENDE.speiche + 0.24));

  // Bild 6 je Gerät.
  const leisteX = geraet === 'pc' ? -SEITENLEISTE + SEITENLEISTE * abgang : -SEITENLEISTE;
  const ueberTiefgruen = geraet === 'pc' && lage.x < leisteX + SEITENLEISTE;
  const kachelSichtbar = geraet === 'tablet' ? Math.max(0, (abgang - 0.7) / 0.3) : 0;
  const restSichtbar = geraet === 'tablet' ? 1 - Math.min(1, abgang / 0.5) : 1;

  const hintergrund = bild === 6 ? 1 - abgang : 1;

  return (
    <div
      data-startbild
      data-bild={bild}
      data-geraet={geraet}
      aria-hidden="true"
      className="fixed inset-0 z-50 overflow-hidden"
      style={{ pointerEvents: bild === 6 ? 'none' : 'auto' }}
      // Ab Bild 2 beendet auch ein Tipp irgendwo auf die Fläche.
      onClick={bild >= 2 ? ueberspringen : undefined}
    >
      {/* Die Fläche, nicht Papier: dieselbe Farbe wie `background_color` im
          Manifest, deshalb kein Sprung vom Systemstart ins Intro. */}
      <div className="bg-canvas absolute inset-0" style={{ opacity: hintergrund }} />

      {geraet === 'pc' && bild === 6 ? (
        <div
          data-leiste
          className="bg-surface-inverse absolute inset-y-0 left-0"
          style={{ width: SEITENLEISTE, transform: `translateX(${leisteX}px)` }}
        />
      ) : null}

      {!reduziert && (bild === 2 || bild === 3) ? (
        <svg
          data-rad
          className="text-accent absolute inset-0 h-full w-full"
          viewBox={`0 0 ${fenster.breite} ${fenster.hoehe}`}
        >
          <Rad cx={radX} cy={oMitteY} k={k} drehung={drehung} verwandlung={verwandlung} />
        </svg>
      ) : null}

      {!reduziert && bild === 4 ? (
        <>
          <svg
            data-rad
            className="text-accent absolute inset-0 h-full w-full"
            viewBox={`0 0 ${fenster.breite} ${fenster.hoehe}`}
          >
            <Rad cx={oMitteX} cy={oMitteY} k={k} drehung={0} verwandlung={1} />
          </svg>
          <Markenbild
            kennung="w"
            lage={zentrum}
            clipPath={clip(
              AUSSCHNITT.w,
              k,
              MARKE_640.w[0] + (MARKE_640.w[1] - MARKE_640.w[0]) * wAnteil,
            )}
          />
          <Markenbild
            kennung="n"
            lage={zentrum}
            clipPath={clip(
              AUSSCHNITT.n,
              k,
              MARKE_640.n[0] + (MARKE_640.n[1] - MARKE_640.n[0]) * nAnteil,
            )}
          />
          <Markenbild
            kennung="motion"
            lage={zentrum}
            clipPath={clip(AUSSCHNITT.motion, k)}
            opacity={motionAnteil}
            transform={`translateX(${24 * (1 - motionAnteil)}px)`}
          />
        </>
      ) : null}

      {bild === 5 ? <Markenbild kennung="voll" lage={zentrum} /> : null}

      {bild === 6 && geraet !== 'tablet' ? (
        <Markenbild kennung="voll" lage={lage} quelle={ueberTiefgruen ? PAPIER : FARBIG} />
      ) : null}

      {monogramm && ziel.current ? (
        <>
          <div
            data-kachel
            className="bg-surface-inverse absolute"
            style={{
              left: ziel.current.x,
              top: ziel.current.y,
              width: KACHEL,
              height: KACHEL,
              borderRadius: KACHEL_RADIUS,
              opacity: kachelSichtbar,
            }}
          />
          {clipRest(k).map((pfad, i) => (
            <Markenbild
              key={pfad}
              kennung={`rest-${i}`}
              lage={zentrum}
              clipPath={pfad}
              opacity={restSichtbar}
            />
          ))}
          {(['o', 'm'] as const).map((buchstabe) => {
            const lageBuchstabe = zwischen(zentrum, monogramm[buchstabe], abgang);
            return (
              <Markenbild
                key={buchstabe}
                kennung={buchstabe}
                lage={lageBuchstabe}
                clipPath={clip(AUSSCHNITT[buchstabe], lageBuchstabe.breite / MARKE_640.breite)}
                quelle={kachelSichtbar > 0.5 ? PAPIER : FARBIG}
              />
            );
          })}
        </>
      ) : null}

      {bild < 6 ? (
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            ueberspringen();
          }}
          className={kartenAktionKlassen('secondary', 'absolute top-4 right-4')}
        >
          Überspringen
        </button>
      ) : null}
    </div>
  );
}
