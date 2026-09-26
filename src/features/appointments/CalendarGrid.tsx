import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  aufRaster,
  gitterlinien,
  kachelBreite,
  linienAchse,
  minuteZuPixel,
  minuteZuZeit,
  pixelZuMinute,
  spalten,
  type Zeitband,
} from './calendar';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  abweichendeLaengeMinuten,
  abweichendeLaengeText,
  appointmentStatusLabels,
  appointmentTypeLabels,
  terminBezeichnung,
  type CalendarEntry,
} from './api';
import { Laengenzeichen } from './Laengenzeichen';
import { useTerminZiehen, type ZiehZustand } from './useTerminZiehen';
import { useSpanneAufziehen, type Spanne } from './useSpanneAufziehen';
import { AnlegenMenue, type AnlegenEintrag } from './AnlegenMenue';
import { VerschiebenRueckfrage, type VerschiebenFrage } from './VerschiebenRueckfrage';
import { useZweiFingerZoom } from './useZweiFingerZoom';

/**
 * Eine abgelegte, noch nicht bestätigte Verschiebung, wie das Gitter sie
 * zeigt (FIX-017, BEF-013): der alte Platz als Umriss, der neue als Kachel,
 * der Kasten mit der Frage direkt daneben.
 */
export interface GitterVorschlag {
  terminId: string;
  spalteId: string;
  startMinute: number;
  endeMinute: number;
  frage: VerschiebenFrage;
  laeuft: boolean;
  onBestaetigen: () => void;
  onAbbrechen: () => void;
}

/**
 * Das offene Anlegen-Menü an einer Auswahl (CAL-019).
 *
 * Das Gitter zeichnet die Auswahl und das Menü daneben; **was** die Einträge
 * bedeuten, weiß allein die aufrufende Seite - sie kennt Person, Datum,
 * Patientenfilter und Rückweg. Dasselbe Verhältnis wie bei der
 * Zieh-Rückfrage (FIX-017).
 */
export interface GitterAuswahl extends Spanne {
  eintraege: AnlegenEintrag[];
  onSchliessen: () => void;
}

/**
 * Zeitgitter des Kalenders (CAL-006).
 *
 * Eine Darstellung für beide Ansichten. Was sich unterscheidet, ist
 * ausschließlich die Bedeutung einer Spalte:
 *
 *   * Tag   - eine Spalte je behandelnder Person
 *   * Woche - eine Spalte je Wochentag, für genau eine Person
 *
 * Deshalb kennt das Gitter selbst weder Personen noch Daten, sondern nur
 * Spalten mit einer Kennung. Wohin ein Termin verschoben wurde, übersetzt die
 * aufrufende Seite zurück in Person beziehungsweise Datum.
 *
 * Waagerechtes Scrollen ist ausdrücklich erwünscht: bei sechs zeitgleich
 * arbeitenden Personen ist eine gequetschte Spalte unbrauchbar, eine schmale
 * scrollbare dagegen lesbar. Zeitachse und Spaltenköpfe bleiben dabei stehen.
 *
 * **Die Linien tragen drei Stärken (CAL-011).** Die Stunde bleibt die
 * Orientierung und ist am kräftigsten; die halbe Stunde teilt sie; das
 * Praxisraster steht als feinste Stufe darunter, sobald die Zoomstufe dafür
 * Platz lässt. Ohne diese Abstufung wäre ein durchgehendes Fünf-Minuten-Gitter
 * bloß eine graue Fläche — man sähe jede Linie und keine Uhrzeit.
 */

/** Unter dieser Breite wird eine Spalte unlesbar. Dann lieber scrollen. */
const SPALTEN_MINDESTBREITE = '9rem';

/**
 * Mindesthöhe einer Auswahl oder Vorschau im Gitter (BEF-037).
 *
 * Der Inhalt ist eine Zeile Uhrzeit: 2 px Rahmen, 4 px Innenabstand und 16 px
 * Zeile, oben und unten - zusammen 28 px, dieselbe Mindesthöhe wie eine
 * Kachel. Mit den früheren 16 px lief „08:50" über die untere Rahmenlinie.
 * Die Fläche wird dadurch bei einem einzelnen Feld höher als das Feld; die
 * Uhrzeit darin sagt, wo sie beginnt.
 */
const AUSWAHL_MINDESTHOEHE = 28;

/**
 * Stärke der drei Linienarten.
 *
 * Die erste Fassung nahm für alle drei `--color-line` und unterschied nur die
 * Deckkraft. In der Sichtprüfung war die Stunde daraufhin von der
 * Fünf-Minuten-Linie nicht zu unterscheiden: `--color-line` liegt bei 90 %
 * Helligkeit, und zwischen 30 % und 100 % einer fast weißen Linie auf fast
 * weißem Grund liegt kaum ein sichtbarer Unterschied. Das Ergebnis war die
 * gestreifte Fläche, die das Gitter gerade nicht sein soll.
 *
 * Die Stunde nimmt deshalb `--color-line-strong` (63 % Helligkeit), gedämpft
 * auf 60 %. Sie ist damit die Linie, an der man die Uhrzeit abliest; die
 * halbe Stunde teilt sie, das Praxisraster bleibt ein Hauch.
 */
const LINIE = {
  stunde: 'border-line-strong/60',
  halb: 'border-line-strong/30',
  fein: 'border-line/45',
} as const;

export interface GitterSpalte {
  id: string;
  titel: string;
  unterTitel?: string;
  /** Hervorhebung des heutigen Tages beziehungsweise der eigenen Person. */
  hervorgehoben?: boolean;
  /** Arbeitszeit dieser Spalte als Hintergrund. */
  baender: Zeitband[];
  /**
   * Wohin ein Tippen auf den Spaltenkopf führt (CAL-012).
   *
   * Das Gitter kennt weiterhin weder Personen noch Daten — was der Wechsel
   * bedeutet, entscheidet die aufrufende Seite und übergibt ihn fertig.
   * Ohne Ziel bleibt der Kopf eine Beschriftung.
   */
  ziel?: { to: string; beschriftung: string };
}

export interface GitterEintrag {
  eintrag: CalendarEntry;
  spalteId: string;
  beginnMinute: number;
  endeMinute: number;
  farbe: string;
  /** Abgesagte und abgeschlossene Termine werden nicht gezogen. */
  ziehbar: boolean;
  /** Gerade angelegt - beim Zurückkommen aus dem Formular hervorgehoben (FIX-016). */
  neu?: boolean;
}

/** Kurze Einordnung: wo der Termin stattfindet. */
function ortsHinweis(eintrag: CalendarEntry): string {
  if (eintrag.appointment_type === 'practice') return eintrag.location_name ?? 'Praxis';
  return appointmentTypeLabels[eintrag.appointment_type];
}

export function CalendarGrid({
  spaltenModell,
  eintraege,
  fenster,
  raster,
  stundenHoehe,
  ziehbarErlaubt,
  onVerschieben,
  onAuswahl,
  auswahl = null,
  rueckweg,
  beschriftung,
  vorschlag = null,
  kontext,
  onBlaettern,
  onZoom,
  ecke,
  jetzt = null,
  sprung = 0,
  laedtNach = false,
}: {
  /**
   * Was in der Ecke über der Zeitachse steht (BEF-039): der Knopf zu Ansicht
   * und Filter. Die Ecke bleibt beim Bildlauf in beide Richtungen stehen -
   * damit ist er „direkt am Raster" erreichbar, wo immer man gerade ist.
   */
  ecke?: ReactNode;
  /**
   * Die aktuelle Uhrzeit als Linie in den Spalten, die heute sind (BEF-039).
   * Ohne Angabe gibt es keine Linie.
   */
  jetzt?: { minute: number; spalten: readonly string[] } | null;
  /**
   * Zähler für „Jetzt": Jede Erhöhung bringt die Linie ins Bild, sobald ihre
   * Spalte gezeichnet ist - auch wenn der Ausschnitt dafür erst laden muss.
   */
  sprung?: number;
  /**
   * Eine Zoomstufe weiter, mit zwei Fingern im Raster (BEF-038). Ohne Angabe
   * bleibt die Geste beim Browser.
   */
  onZoom?: ((richtung: 1 | -1) => void) | undefined;
  /** Der gezeigte Stand ist der alte, der neue laedt noch (FIX-018). */
  laedtNach?: boolean;
  /** Die offene Rückfrage zum Verschieben - im Gitter gezeichnet (FIX-017). */
  vorschlag?: GitterVorschlag | null;
  /** Kennung des gezeigten Ausschnitts, etwa sein erster Tag (FIX-018). */
  kontext: string;
  /** Blättert während des Ziehens, wenn der Zeiger seitlich am Gitter verharrt (FIX-018). */
  onBlaettern?: ((richtung: -1 | 1) => void) | undefined;
  spaltenModell: GitterSpalte[];
  eintraege: GitterEintrag[];
  fenster: { vonMinute: number; bisMinute: number };
  raster: number | null;
  /** Höhe einer Stunde in Pixeln - die gewählte Zoomstufe (CAL-011). */
  stundenHoehe: number;
  /** Ohne Änderungsrecht wird gar nicht erst gezogen. */
  ziehbarErlaubt: boolean;
  onVerschieben: (ziel: { terminId: string; spalteId: string; startMinute: number }) => void;
  /**
   * Eine Auswahl auf der freien Fläche einer Spalte (UX-005, CAL-019).
   *
   * Aufgezogen als Spanne oder angetippt als Rasterpunkt - dann sind beide
   * Enden gleich. Ohne Angabe passiert nichts; die freie Fläche bleibt dann
   * schlicht Hintergrund. Beides ist eine Abkürzung für Zeigegeräte; der Weg
   * über die Tastatur sind die Schaltflächen über dem Gitter.
   */
  onAuswahl?: ((spanne: Spanne) => void) | undefined;
  /** Das offene Anlegen-Menü, von der aufrufenden Seite gefüllt (CAL-019). */
  auswahl?: GitterAuswahl | null;
  /**
   * Der Weg zurück in genau diesen Kalenderstand (UX-012).
   *
   * Die Kachel führt zum Termin; von dort soll der Weg zurück wieder hier
   * ankommen - mit Ansicht, Datum, Zoomstufe und allen Filtern. Der Kalender
   * kennt seinen eigenen Stand, das Gitter nicht; deshalb kommt er von oben.
   */
  rueckweg?: string | undefined;
  beschriftung: string;
}) {
  const spaltenRefs = useRef(new Map<string, HTMLElement>());
  const gitterRef = useRef<HTMLDivElement>(null);
  const hoehe = ((fenster.bisMinute - fenster.vonMinute) / 60) * stundenHoehe;

  const linien = gitterlinien(stundenHoehe, raster);
  const stunden = linienAchse(fenster.vonMinute, fenster.bisMinute, 60);
  // Halbe und feine Linien lassen die Stundenlinie aus: zwei Linien
  // uebereinander ergaeben einen dickeren, dunkleren Strich an genau der
  // Stelle, an der die Abstufung ihn nicht haben will.
  const halbe = linien.halbeStunde
    ? linienAchse(fenster.vonMinute, fenster.bisMinute, 30).filter((m) => m % 60 !== 0)
    : [];
  const feine = linien.fein
    ? linienAchse(fenster.vonMinute, fenster.bisMinute, linien.fein).filter(
        (m) => m % 60 !== 0 && (!linien.halbeStunde || m % 30 !== 0),
      )
    : [];

  const ziehen = useTerminZiehen({
    fensterVon: fenster.vonMinute,
    fensterBis: fenster.bisMinute,
    raster,
    stundenHoehe,
    // Die Spalte unter dem Zeiger wird aus den tatsächlichen Kästen gelesen -
    // damit stimmt sie auch bei waagerechtem Bildlauf.
    spalteAn: (clientX) => {
      for (const [id, element] of spaltenRefs.current) {
        const kasten = element.getBoundingClientRect();
        if (clientX >= kasten.left && clientX <= kasten.right) return id;
      }
      return null;
    },
    kontext,
    // Seitlich ueber dem Gitter: dort wird geblaettert (FIX-018). Ein paar
    // Pixel Toleranz, damit die Spaltenkante selbst noch Ziel ist.
    randAn: (clientX) => {
      const kasten = gitterRef.current?.getBoundingClientRect();
      if (!kasten) return 0;
      if (clientX < kasten.left + 4) return -1;
      if (clientX > kasten.right - 4) return 1;
      return 0;
    },
    onBlaettern,
    onAblegen: (zustand: ZiehZustand) =>
      onVerschieben({
        terminId: zustand.terminId,
        spalteId: zustand.spalteId,
        startMinute: zustand.startMinute,
      }),
  });

  // Die Spanne auf der freien Flaeche (CAL-019). Der obere Rand kommt aus
  // irgendeiner Spalte: Alle beginnen auf derselben Hoehe.
  const spanne = useSpanneAufziehen({
    fensterVon: fenster.vonMinute,
    fensterBis: fenster.bisMinute,
    raster,
    stundenHoehe,
    spalteAn: (clientX) => {
      for (const [id, element] of spaltenRefs.current) {
        const kasten = element.getBoundingClientRect();
        if (clientX >= kasten.left && clientX <= kasten.right) return id;
      }
      return null;
    },
    obenAn: () => {
      const erste = spaltenRefs.current.values().next().value;
      return erste ? erste.getBoundingClientRect().top : null;
    },
    onAuswahl: (gewaehlt) => onAuswahl?.(gewaehlt),
  });

  // „Jetzt" (BEF-039): Der Sprung wartet, bis die Linie gezeichnet ist - wer
  // aus einer anderen Woche springt, muss erst den neuen Ausschnitt laden.
  const jetztRef = useRef<HTMLDivElement>(null);
  const ersteHeutigeSpalte = jetzt
    ? spaltenModell.find((x) => jetzt.spalten.includes(x.id))?.id
    : undefined;
  const offenerSprung = useRef(0);
  useEffect(() => {
    if (sprung === offenerSprung.current || !jetztRef.current) return;
    offenerSprung.current = sprung;
    // jsdom kennt kein scrollIntoView; ein Browser ohne es bleibt, wo er ist.
    jetztRef.current.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'smooth' });
  });

  // Zwei Finger zoomen das Raster (BEF-038); der zweite Finger beendet,
  // was der erste begonnen hat - Verschieben und Aufziehen brechen dabei
  // nicht, sie enden ohne Ergebnis.
  const zweiFinger = useZweiFingerZoom(gitterRef, {
    onZoom,
    onZweiterFinger: () => {
      ziehen.abbrechen();
      spanne.abbrechen();
    },
  });

  return (
    <>
      <div
        ref={gitterRef}
        aria-busy={laedtNach || undefined}
        // `isolate`: Die Ebenen im Gitter (stehende Ecke, Köpfe, Kacheln)
        // bleiben unter allem, was darüber aufgeht - etwa der Trefferliste der
        // Suche am Telefon (BEF-039).
        className={`border-line rounded-card isolate mt-4 overflow-x-auto border ${laedtNach ? 'opacity-60' : ''}`}
        // touch-action: das Gitter scrollt weiterhin, aber eine begonnene Geste
        // auf einer Kachel wird nicht vom Browser übernommen.
        style={{ touchAction: 'pan-x pan-y' }}
      >
        <div
          className="grid min-w-max"
          style={{
            gridTemplateColumns: `3.25rem repeat(${spaltenModell.length}, minmax(${SPALTEN_MINDESTBREITE}, 1fr))`,
          }}
          role="grid"
          aria-label={beschriftung}
        >
          {/* Kopfzeile: bleibt beim senkrechten Bildlauf stehen. */}
          <div className="bg-surface border-line sticky top-0 left-0 z-30 flex h-11 items-center justify-center border-b">
            {ecke}
          </div>
          {spaltenModell.map((s) => {
            const beschriftung = (
              <>
                <span
                  className={[
                    'truncate text-sm font-medium',
                    s.hervorgehoben ? 'text-accent' : 'text-ink',
                  ].join(' ')}
                >
                  {s.titel}
                </span>
                {s.unterTitel ? (
                  <span className="text-ink-subtle truncate text-xs">{s.unterTitel}</span>
                ) : null}
              </>
            );

            return (
              <div
                key={s.id}
                className={[
                  'bg-surface border-line sticky top-0 z-20 flex h-11 flex-col justify-center',
                  'border-b border-l',
                  // Traegt der Kopf einen Wechsel, polstert der Link selbst -
                  // sonst waere nur der Text anklickbar und nicht die Spalte.
                  s.ziel ? '' : 'px-2',
                ].join(' ')}
              >
                {s.ziel ? (
                  <Link
                    to={s.ziel.to}
                    aria-label={s.ziel.beschriftung}
                    title={s.ziel.beschriftung}
                    className="hover:bg-surface-sunken flex h-full min-w-0 flex-col justify-center px-2 transition-colors"
                  >
                    {beschriftung}
                  </Link>
                ) : (
                  beschriftung
                )}
              </div>
            );
          })}

          {/* Zeitachse: bleibt beim waagerechten Bildlauf stehen. */}
          <div
            className="bg-surface border-line sticky left-0 z-10 border-r"
            style={{ height: `${hoehe}px` }}
            aria-hidden="true"
          >
            {stunden.map((m) => (
              // Die Beschriftung steht unter ihrer Linie, nicht auf ihr: zentriert
              // waere die oberste Stunde am Rand des Gitters halb abgeschnitten.
              <div
                key={m}
                className="text-ink-subtle absolute right-1 pt-0.5 text-[0.6875rem]"
                style={{ top: `${minuteZuPixel(m, fenster.vonMinute, stundenHoehe)}px` }}
              >
                {minuteZuZeit(m)}
              </div>
            ))}
            {/* Ab dieser Zoomstufe liegen die halben Stunden 72 px auseinander -
              genug fuer eine zweite Beschriftung, ohne dass sie sich beruehren.
              Eine feine Linie ohne Uhrzeit in der Naehe laesst sich sonst nur
              abzaehlen. */}
            {stundenHoehe >= 144
              ? halbe.map((m) => (
                  <div
                    key={m}
                    className="text-ink-subtle/70 absolute right-1 pt-0.5 text-[0.625rem]"
                    style={{ top: `${minuteZuPixel(m, fenster.vonMinute, stundenHoehe)}px` }}
                  >
                    {minuteZuZeit(m)}
                  </div>
                ))
              : null}
          </div>

          {spaltenModell.map((s) => {
            const eigene = eintraege
              .filter((e) => e.spalteId === s.id)
              .sort((a, b) => a.beginnMinute - b.beginnMinute);
            const verteilung = spalten(
              eigene.map((e) => ({ beginn: e.beginnMinute, ende: e.endeMinute })),
            );

            return (
              <div
                key={s.id}
                ref={(el) => {
                  if (el) spaltenRefs.current.set(s.id, el);
                  else spaltenRefs.current.delete(s.id);
                }}
                className={`border-line relative border-l ${onAuswahl ? 'cursor-copy' : ''}`}
                style={{ height: `${hoehe}px` }}
                role="gridcell"
                aria-label={s.titel}
                // Nur die freie Fläche: eine Kachel liegt darüber und fängt ihre
                // eigene Geste ab. Der Hintergrund (Arbeitszeitbänder,
                // Stundenlinien) ist `pointer-events-none`, damit ein Tipp
                // darauf hier ankommt und nicht ins Leere geht.
                onPointerDown={
                  onAuswahl
                    ? (event) => {
                        if (event.target !== event.currentTarget) return;
                        spanne.beginnen(event, s.id);
                      }
                    : undefined
                }
                onClick={
                  onAuswahl
                    ? (event) => {
                        if (event.target !== event.currentTarget) return;
                        if (ziehen.klickUnterdruecken()) return;
                        // Ein aufgezogener Bereich hat sein Ergebnis schon
                        // gemeldet; der folgende Klick wäre ein zweites.
                        if (spanne.klickUnterdruecken()) return;
                        // Ebenso der Klick nach dem Zoomen mit zwei Fingern (BEF-038).
                        if (zweiFinger.klickUnterdruecken()) return;
                        const kasten = event.currentTarget.getBoundingClientRect();
                        const roh = pixelZuMinute(
                          event.clientY - kasten.top,
                          fenster.vonMinute,
                          stundenHoehe,
                        );
                        const minute = Math.max(
                          fenster.vonMinute,
                          Math.min(fenster.bisMinute, aufRaster(roh, raster)),
                        );
                        // Ein Tap ohne Ziehen ist ein Rasterpunkt, keine Spanne
                        // (CAL-019): beide Enden gleich.
                        onAuswahl({ spalteId: s.id, vonMinute: minute, bisMinute: minute });
                      }
                    : undefined
                }
              >
                {/* Arbeitszeit als Hintergrund - Darstellung, keine Prüfung. */}
                {s.baender.map((b, i) => (
                  <div
                    key={i}
                    aria-hidden="true"
                    className="bg-surface-sunken pointer-events-none absolute inset-x-0"
                    style={{
                      top: `${minuteZuPixel(Math.max(b.vonMinute, fenster.vonMinute), fenster.vonMinute, stundenHoehe)}px`,
                      height: `${minuteZuPixel(Math.min(b.bisMinute, fenster.bisMinute), fenster.vonMinute, stundenHoehe) - minuteZuPixel(Math.max(b.vonMinute, fenster.vonMinute), fenster.vonMinute, stundenHoehe)}px`,
                    }}
                  />
                ))}

                {/* Die drei Linienarten von fein nach kraeftig: die spaetere
                  Regel gewinnt bei gleicher Deckkraft nicht, aber die
                  Zeichenreihenfolge haelt die Stunde obenauf. */}
                {feine.map((m) => (
                  <div
                    key={`f${m}`}
                    aria-hidden="true"
                    className={`${LINIE.fein} pointer-events-none absolute inset-x-0 border-t`}
                    style={{ top: `${minuteZuPixel(m, fenster.vonMinute, stundenHoehe)}px` }}
                  />
                ))}
                {halbe.map((m) => (
                  <div
                    key={`h${m}`}
                    aria-hidden="true"
                    className={`${LINIE.halb} pointer-events-none absolute inset-x-0 border-t`}
                    style={{ top: `${minuteZuPixel(m, fenster.vonMinute, stundenHoehe)}px` }}
                  />
                ))}
                {stunden.map((m) => (
                  <div
                    key={`s${m}`}
                    aria-hidden="true"
                    className={`${LINIE.stunde} pointer-events-none absolute inset-x-0 border-t`}
                    style={{ top: `${minuteZuPixel(m, fenster.vonMinute, stundenHoehe)}px` }}
                  />
                ))}

                {/* Die aktuelle Uhrzeit (BEF-039). Die erste heutige Spalte
                  trägt den Anker für „Jetzt"; außerhalb des Fensters steht
                  der Anker am Rand und die Linie fehlt. */}
                {jetzt && jetzt.spalten.includes(s.id)
                  ? (() => {
                      const imFenster =
                        jetzt.minute >= fenster.vonMinute && jetzt.minute <= fenster.bisMinute;
                      const minute = Math.max(
                        fenster.vonMinute,
                        Math.min(fenster.bisMinute, jetzt.minute),
                      );
                      return (
                        <div
                          ref={s.id === ersteHeutigeSpalte ? jetztRef : undefined}
                          data-testid={imFenster ? 'jetzt-linie' : undefined}
                          aria-hidden="true"
                          className={`pointer-events-none absolute inset-x-0 z-30 ${imFenster ? 'border-accent border-t-2' : ''}`}
                          style={{
                            top: `${minuteZuPixel(minute, fenster.vonMinute, stundenHoehe)}px`,
                          }}
                        />
                      );
                    })()
                  : null}

                {eigene.map((g, i) => {
                  const { spalte, anzahl } = verteilung[i]!;
                  const { links, breite } = kachelBreite(spalte, anzahl);
                  const wirdGezogen = ziehen.vorschau?.terminId === g.eintrag.id;
                  return (
                    <Kachel
                      key={g.eintrag.id}
                      gitter={g}
                      fensterVon={fenster.vonMinute}
                      stundenHoehe={stundenHoehe}
                      links={links}
                      breite={breite}
                      stapel={spalte + 1}
                      gedimmt={wirdGezogen}
                      bisher={vorschlag?.terminId === g.eintrag.id}
                      wartet={ziehen.wartetAuf === g.eintrag.id}
                      ziehbar={ziehbarErlaubt && g.ziehbar}
                      rueckweg={rueckweg}
                      onPointerDown={(event) =>
                        ziehen.beginnen(event, {
                          id: g.eintrag.id,
                          spalteId: g.spalteId,
                          startMinute: g.beginnMinute,
                          dauer: g.endeMinute - g.beginnMinute,
                        })
                      }
                      onClickCapture={(event) => {
                        if (ziehen.klickUnterdruecken()) event.preventDefault();
                      }}
                    />
                  );
                })}

                {/* Die Rueckfrage im Gitter (FIX-017): die neue Kachel am Ziel,
                  der Kasten daneben. Die alte Kachel steht als Umriss weiter
                  oben (`bisher`). Bei den rechten Spalten haengt der Kasten
                  links an, damit er nicht aus dem Gitter laeuft. */}
                {vorschlag && vorschlag.spalteId === s.id
                  ? (() => {
                      const oben = minuteZuPixel(
                        vorschlag.startMinute,
                        fenster.vonMinute,
                        stundenHoehe,
                      );
                      const kachelHoehe = Math.max(
                        28,
                        ((vorschlag.endeMinute - vorschlag.startMinute) / 60) * stundenHoehe,
                      );
                      const spalteIndex = spaltenModell.findIndex((x) => x.id === s.id);
                      const rechts =
                        spalteIndex >= spaltenModell.length / 2 && spaltenModell.length > 1;
                      // Unter der Kachel, es sei denn, dort ist kein Platz mehr.
                      const kastenOben =
                        oben + kachelHoehe + 200 <= hoehe ? oben + kachelHoehe + 4 : undefined;
                      return (
                        <>
                          <div
                            data-testid="vorschlag-kachel"
                            className="border-accent bg-surface text-accent rounded-button ring-accent absolute inset-x-1 z-40 border-2 px-2 py-1 text-xs font-semibold ring-2"
                            style={{ top: `${oben}px`, height: `${kachelHoehe}px` }}
                            aria-hidden="true"
                          >
                            Neu · {minuteZuZeit(vorschlag.startMinute)}–
                            {minuteZuZeit(vorschlag.endeMinute)}
                          </div>
                          <VerschiebenRueckfrage
                            frage={vorschlag.frage}
                            laeuft={vorschlag.laeuft}
                            onBestaetigen={vorschlag.onBestaetigen}
                            onAbbrechen={vorschlag.onAbbrechen}
                            className={[
                              'absolute z-50 w-72 max-w-[calc(100vw-5rem)]',
                              rechts ? 'right-1' : 'left-1',
                              kastenOben === undefined ? 'bottom-1' : '',
                            ].join(' ')}
                            style={
                              kastenOben === undefined ? undefined : { top: `${kastenOben}px` }
                            }
                          />
                        </>
                      );
                    })()
                  : null}

                {/* Die aufgezogene Spanne (CAL-019): Sie zeigt beide Enden,
                  solange der Zeiger unten ist. Geschrieben ist nichts - das
                  Menü fragt erst, was daraus werden soll. */}
                {spanne.vorschau && spanne.vorschau.spalteId === s.id ? (
                  <div
                    data-testid="spanne-vorschau"
                    className="border-accent bg-accent-soft/70 text-accent rounded-button pointer-events-none absolute inset-x-1 z-40 overflow-hidden border-2 border-dashed px-2 py-1 text-xs leading-4 font-medium"
                    style={{
                      top: `${minuteZuPixel(spanne.vorschau.vonMinute, fenster.vonMinute, stundenHoehe)}px`,
                      height: `${Math.max(AUSWAHL_MINDESTHOEHE, ((spanne.vorschau.bisMinute - spanne.vorschau.vonMinute) / 60) * stundenHoehe)}px`,
                    }}
                    aria-hidden="true"
                  >
                    {minuteZuZeit(spanne.vorschau.vonMinute)}
                    {spanne.vorschau.bisMinute > spanne.vorschau.vonMinute
                      ? `–${minuteZuZeit(spanne.vorschau.bisMinute)}`
                      : ''}
                  </div>
                ) : null}

                {/* Die Auswahl (CAL-019). Das Menü dazu steht als Leiste unter
                  dem Gitter, damit die Spalte frei bleibt (BEF-035). */}
                {auswahl && auswahl.spalteId === s.id ? (
                  <div
                    data-testid="auswahl-flaeche"
                    className="border-accent bg-accent-soft/70 text-accent rounded-button pointer-events-none absolute inset-x-1 z-40 overflow-hidden border-2 px-2 py-1 text-xs leading-4 font-semibold"
                    style={{
                      top: `${minuteZuPixel(auswahl.vonMinute, fenster.vonMinute, stundenHoehe)}px`,
                      height: `${Math.max(AUSWAHL_MINDESTHOEHE, ((auswahl.bisMinute - auswahl.vonMinute) / 60) * stundenHoehe)}px`,
                    }}
                    aria-hidden="true"
                  >
                    {minuteZuZeit(auswahl.vonMinute)}
                    {auswahl.bisMinute > auswahl.vonMinute
                      ? `–${minuteZuZeit(auswahl.bisMinute)}`
                      : ''}
                  </div>
                ) : null}

                {/* Vorschau: zeigt nur, wohin es ginge. Geschrieben ist noch nichts. */}
                {ziehen.vorschau && ziehen.vorschau.spalteId === s.id ? (
                  <div
                    data-testid="zieh-vorschau"
                    className="border-accent bg-accent-soft/70 text-accent rounded-button pointer-events-none absolute inset-x-1 z-40 overflow-hidden border-2 border-dashed px-2 py-1 text-xs leading-4 font-medium"
                    style={{
                      top: `${minuteZuPixel(ziehen.vorschau.startMinute, fenster.vonMinute, stundenHoehe)}px`,
                      height: `${Math.max(AUSWAHL_MINDESTHOEHE, (ziehen.vorschau.dauer / 60) * stundenHoehe)}px`,
                    }}
                    aria-hidden="true"
                  >
                    {minuteZuZeit(ziehen.vorschau.startMinute)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Das Anlegen-Menü als Leiste am unteren Rand (BEF-035, ANN-108):
        klebt beim Bildlauf am Fensterrand, über der Tableiste des
        Telefons, und lässt die Spalte der Auswahl frei. Außerhalb des
        Gitters, weil dessen waagerechter Bildlauf ein `sticky` darin an
        den Kasten statt an das Fenster bände. */}
      {auswahl ? (
        <AnlegenMenue
          auswahl={auswahl}
          className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 mt-2 sm:bottom-4"
        />
      ) : null}
    </>
  );
}

function Kachel({
  gitter,
  fensterVon,
  stundenHoehe,
  links,
  breite,
  stapel,
  gedimmt,
  bisher,
  wartet,
  ziehbar,
  rueckweg,
  onPointerDown,
  onClickCapture,
}: {
  gitter: GitterEintrag;
  /** Der alte Platz einer Verschiebung, ueber die gerade gefragt wird (FIX-017). */
  bisher: boolean;
  fensterVon: number;
  stundenHoehe: number;
  links: number;
  breite: number;
  stapel: number;
  gedimmt: boolean;
  /** Der lange Druck läuft gerade - sichtbare Rückmeldung am Finger (UX-010). */
  wartet: boolean;
  ziehbar: boolean;
  rueckweg: string | undefined;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onClickCapture: (event: React.MouseEvent) => void;
}) {
  const { eintrag, beginnMinute, endeMinute, farbe } = gitter;
  const oben = minuteZuPixel(beginnMinute, fensterVon, stundenHoehe);
  // Mindesthöhe, damit auch ein sehr kurzer Termin greifbar bleibt. Sie
  // verzerrt einen Termin unterhalb dieser Dauer nach oben; die Zieh-Vorschau
  // zeigt daneben die tatsächliche Dauer, und auf einer höheren Zoomstufe
  // greift die Mindesthöhe ohnehin nicht mehr.
  const hoehe = Math.max(28, ((endeMinute - beginnMinute) / 60) * stundenHoehe);
  const vermerk = eintrag.status === 'confirmed' ? null : appointmentStatusLabels[eintrag.status];
  // §8.1: Eine abweichende Länge wird gekennzeichnet - als Bild in der
  // Zeitzeile, als Satz für Vorlesewerkzeuge und im Tooltip (CAL-020).
  const abweichung = abweichendeLaengeMinuten(eintrag);
  // Der Ort steht als dritte Zeile und zusätzlich im Tooltip: bei einem kurzen
  // Termin ist die Kachel zu niedrig für drei Zeilen. Ein abweichender Status
  // gehört deshalb in die zweite Zeile - er ist die wichtigere Auskunft und
  // darf nicht abgeschnitten werden.

  return (
    <Link
      to={mitRueckweg(`/termine/${eintrag.id}`, rueckweg)}
      // Ein Link ist im Browser von Haus aus ziehbar. Diese eingebaute Geste
      // bricht die Zeigerverfolgung sofort mit pointercancel ab - ohne
      // draggable=false kaeme das Verschieben gar nicht erst zustande.
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={ziehbar ? onPointerDown : undefined}
      onClickCapture={onClickCapture}
      title={[
        bisher ? 'Bisher' : null,
        `${minuteZuZeit(beginnMinute)}–${minuteZuZeit(endeMinute)}`,
        // Warum eine Kachel nicht zieht, steht dran - eine stumme Kachel
        // sieht aus wie ein Fehler (BEF-015).
        !gitter.ziehbar && eintrag.status !== 'confirmed'
          ? `Nicht verschiebbar: ${appointmentStatusLabels[eintrag.status]}`
          : null,
        abweichung === null ? null : abweichendeLaengeText(abweichung),
        vermerk,
        ortsHinweis(eintrag),
      ]
        .filter(Boolean)
        .join(' · ')}
      style={{
        borderLeftColor: farbe,
        top: `${oben}px`,
        height: `${hoehe}px`,
        left: `${links}%`,
        width: `${breite}%`,
        zIndex: stapel,
        // Bewusst NICHT `none` (UX-010): eine Kachel nimmt auf dem Telefon
        // fast die ganze Spalte ein: mit `none` liesse sich der Kalender
        // ueber einem Termin gar nicht mehr scrollen. Der Bildlauf bleibt
        // beim Browser; das Verschieben beginnt erst nach dem langen Druck,
        // und der schliesst einen begonnenen Bildlauf aus.
        ...(ziehbar ? { touchAction: 'pan-x pan-y' } : {}),
      }}
      className={[
        'border-line bg-surface hover:bg-surface-sunken rounded-button absolute block overflow-hidden',
        'border border-l-4 px-1.5 py-1 text-left transition-colors',
        eintrag.status === 'cancelled' ? 'opacity-60' : '',
        gedimmt ? 'opacity-40' : '',
        // Der alte Platz: gestrichelt und blass, damit niemand ihn fuer den
        // neuen haelt (FIX-017).
        bisher ? 'border-dashed opacity-50' : '',
        // Sichtbare Rueckmeldung auf den langen Druck: sonst sieht Warten aus
        // wie nichts.
        wartet ? 'ring-accent scale-[1.02] ring-2' : '',
        gitter.neu ? 'ring-accent ring-2' : '',
        ziehbar ? 'cursor-grab' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Der Titel eines Ereignisses steht dort, wo sonst der Name steht -
          und ein Zeichen davor sagt, dass es keine Behandlung ist
          (CAL-015b). Ohne das Zeichen sähe eine Teambesprechung aus wie eine
          Patient:in mit ungewöhnlichem Namen. */}
      <span className="text-ink block truncate text-xs font-medium">
        {bisher ? <span className="text-ink-muted">Bisher · </span> : null}
        {eintrag.kind === 'internal' ? '▪ ' : ''}
        {terminBezeichnung(eintrag)}
      </span>
      <span className="text-ink-muted block truncate text-[0.6875rem]">
        {minuteZuZeit(beginnMinute)}–{minuteZuZeit(endeMinute)}{' '}
        <Laengenzeichen termin={eintrag} knapp />
        {vermerk ? ` · ${vermerk}` : ''}
      </span>
      <span className="text-ink-subtle block truncate text-[0.6875rem]">
        {ortsHinweis(eintrag)}
      </span>
    </Link>
  );
}
