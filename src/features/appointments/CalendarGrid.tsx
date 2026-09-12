import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  aufRaster,
  gitterlinien,
  kachelBreite,
  linienAchse,
  minuteZuPixel,
  pixelZuMinute,
  spalten,
  type Zeitband,
} from './calendar';
import { appointmentStatusLabels, appointmentTypeLabels, type CalendarEntry } from './api';
import { useTerminZiehen, type ZiehZustand } from './useTerminZiehen';

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
}

/** Kurze Einordnung: wo der Termin stattfindet. */
function ortsHinweis(eintrag: CalendarEntry): string {
  if (eintrag.appointment_type === 'practice') return eintrag.location_name ?? 'Praxis';
  return appointmentTypeLabels[eintrag.appointment_type];
}

function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function CalendarGrid({
  spaltenModell,
  eintraege,
  fenster,
  raster,
  stundenHoehe,
  ziehbarErlaubt,
  onVerschieben,
  onFreieZeit,
  beschriftung,
}: {
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
   * Tippen auf eine freie Stelle einer Spalte (UX-005).
   *
   * Ohne Angabe passiert nichts - die freie Fläche bleibt dann schlicht
   * Hintergrund. Der Tap ist eine Abkürzung für Zeigegeräte; der Weg über die
   * Tastatur ist die Schaltfläche „Termin anlegen" über dem Gitter.
   */
  onFreieZeit?: ((ziel: { spalteId: string; startMinute: number }) => void) | undefined;
  beschriftung: string;
}) {
  const spaltenRefs = useRef(new Map<string, HTMLElement>());
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
    onAblegen: (zustand: ZiehZustand) =>
      onVerschieben({
        terminId: zustand.terminId,
        spalteId: zustand.spalteId,
        startMinute: zustand.startMinute,
      }),
  });

  return (
    <div
      className="border-line rounded-card mt-4 overflow-x-auto border"
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
        <div className="bg-surface border-line sticky top-0 left-0 z-30 h-11 border-b" />
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
              {hhmm(m)}
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
                  {hhmm(m)}
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
              className={`border-line relative border-l ${onFreieZeit ? 'cursor-copy' : ''}`}
              style={{ height: `${hoehe}px` }}
              role="gridcell"
              aria-label={s.titel}
              // Nur die freie Fläche: eine Kachel liegt darüber und fängt ihren
              // eigenen Klick ab. Der Hintergrund (Arbeitszeitbänder,
              // Stundenlinien) ist `pointer-events-none`, damit ein Tipp
              // darauf hier ankommt und nicht ins Leere geht.
              onClick={
                onFreieZeit
                  ? (event) => {
                      if (event.target !== event.currentTarget) return;
                      if (ziehen.klickUnterdruecken()) return;
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
                      onFreieZeit({ spalteId: s.id, startMinute: minute });
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
                    wartet={ziehen.wartetAuf === g.eintrag.id}
                    ziehbar={ziehbarErlaubt && g.ziehbar}
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

              {/* Vorschau: zeigt nur, wohin es ginge. Geschrieben ist noch nichts. */}
              {ziehen.vorschau && ziehen.vorschau.spalteId === s.id ? (
                <div
                  className="border-accent bg-accent-soft/70 text-accent rounded-button pointer-events-none absolute inset-x-1 z-40 border-2 border-dashed px-2 py-1 text-xs font-medium"
                  style={{
                    top: `${minuteZuPixel(ziehen.vorschau.startMinute, fenster.vonMinute, stundenHoehe)}px`,
                    height: `${(ziehen.vorschau.dauer / 60) * stundenHoehe}px`,
                  }}
                  aria-hidden="true"
                >
                  {hhmm(ziehen.vorschau.startMinute)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
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
  wartet,
  ziehbar,
  onPointerDown,
  onClickCapture,
}: {
  gitter: GitterEintrag;
  fensterVon: number;
  stundenHoehe: number;
  links: number;
  breite: number;
  stapel: number;
  gedimmt: boolean;
  /** Der lange Druck läuft gerade - sichtbare Rückmeldung am Finger (UX-010). */
  wartet: boolean;
  ziehbar: boolean;
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
  // Der Ort steht als dritte Zeile und zusätzlich im Tooltip: bei einem kurzen
  // Termin ist die Kachel zu niedrig für drei Zeilen. Ein abweichender Status
  // gehört deshalb in die zweite Zeile - er ist die wichtigere Auskunft und
  // darf nicht abgeschnitten werden.

  return (
    <Link
      to={`/termine/${eintrag.id}`}
      // Ein Link ist im Browser von Haus aus ziehbar. Diese eingebaute Geste
      // bricht die Zeigerverfolgung sofort mit pointercancel ab - ohne
      // draggable=false kaeme das Verschieben gar nicht erst zustande.
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={ziehbar ? onPointerDown : undefined}
      onClickCapture={onClickCapture}
      title={[`${hhmm(beginnMinute)}–${hhmm(endeMinute)}`, vermerk, ortsHinweis(eintrag)]
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
        // Sichtbare Rueckmeldung auf den langen Druck: sonst sieht Warten aus
        // wie nichts.
        wartet ? 'ring-accent scale-[1.02] ring-2' : '',
        ziehbar ? 'cursor-grab' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="text-ink block truncate text-xs font-medium">
        {eintrag.patient_given_name} {eintrag.patient_family_name}
      </span>
      <span className="text-ink-muted block truncate text-[0.6875rem]">
        {hhmm(beginnMinute)}–{hhmm(endeMinute)}
        {vermerk ? ` · ${vermerk}` : ''}
      </span>
      <span className="text-ink-subtle block truncate text-[0.6875rem]">
        {ortsHinweis(eintrag)}
      </span>
    </Link>
  );
}
