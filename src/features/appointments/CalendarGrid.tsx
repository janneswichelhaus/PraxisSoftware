import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { STUNDEN_HOEHE, kachelBreite, minuteZuPixel, spalten, type Zeitband } from './calendar';
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
 */

/** Unter dieser Breite wird eine Spalte unlesbar. Dann lieber scrollen. */
const SPALTEN_MINDESTBREITE = '9rem';

export interface GitterSpalte {
  id: string;
  titel: string;
  unterTitel?: string;
  /** Hervorhebung des heutigen Tages beziehungsweise der eigenen Person. */
  hervorgehoben?: boolean;
  /** Arbeitszeit dieser Spalte als Hintergrund. */
  baender: Zeitband[];
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

function stundenAchse(vonMinute: number, bisMinute: number): number[] {
  const stunden: number[] = [];
  for (let m = Math.ceil(vonMinute / 60) * 60; m < bisMinute; m += 60) stunden.push(m);
  return stunden;
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
  ziehbarErlaubt,
  onVerschieben,
  beschriftung,
}: {
  spaltenModell: GitterSpalte[];
  eintraege: GitterEintrag[];
  fenster: { vonMinute: number; bisMinute: number };
  raster: number | null;
  /** Ohne Änderungsrecht wird gar nicht erst gezogen. */
  ziehbarErlaubt: boolean;
  onVerschieben: (ziel: { terminId: string; spalteId: string; startMinute: number }) => void;
  beschriftung: string;
}) {
  const spaltenRefs = useRef(new Map<string, HTMLElement>());
  const hoehe = ((fenster.bisMinute - fenster.vonMinute) / 60) * STUNDEN_HOEHE;

  const ziehen = useTerminZiehen({
    fensterVon: fenster.vonMinute,
    fensterBis: fenster.bisMinute,
    raster,
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
      className="border-line mt-4 overflow-x-auto rounded-lg border"
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
        {spaltenModell.map((s) => (
          <div
            key={s.id}
            className={[
              'bg-surface border-line sticky top-0 z-20 flex h-11 flex-col justify-center',
              'border-b border-l px-2',
            ].join(' ')}
          >
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
          </div>
        ))}

        {/* Zeitachse: bleibt beim waagerechten Bildlauf stehen. */}
        <div
          className="bg-surface border-line sticky left-0 z-10 border-r"
          style={{ height: `${hoehe}px` }}
          aria-hidden="true"
        >
          {stundenAchse(fenster.vonMinute, fenster.bisMinute).map((m) => (
            // Die Beschriftung steht unter ihrer Linie, nicht auf ihr: zentriert
            // waere die oberste Stunde am Rand des Gitters halb abgeschnitten.
            <div
              key={m}
              className="text-ink-subtle absolute right-1 pt-0.5 text-[0.6875rem]"
              style={{ top: `${minuteZuPixel(m, fenster.vonMinute)}px` }}
            >
              {hhmm(m)}
            </div>
          ))}
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
              className="border-line relative border-l"
              style={{ height: `${hoehe}px` }}
              role="gridcell"
              aria-label={s.titel}
            >
              {/* Arbeitszeit als Hintergrund - Darstellung, keine Prüfung. */}
              {s.baender.map((b, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className="bg-surface-sunken absolute inset-x-0"
                  style={{
                    top: `${minuteZuPixel(Math.max(b.vonMinute, fenster.vonMinute), fenster.vonMinute)}px`,
                    height: `${minuteZuPixel(Math.min(b.bisMinute, fenster.bisMinute), fenster.vonMinute) - minuteZuPixel(Math.max(b.vonMinute, fenster.vonMinute), fenster.vonMinute)}px`,
                  }}
                />
              ))}

              {/* Stundenlinien. */}
              {stundenAchse(fenster.vonMinute, fenster.bisMinute).map((m) => (
                <div
                  key={m}
                  aria-hidden="true"
                  className="border-line absolute inset-x-0 border-t"
                  style={{ top: `${minuteZuPixel(m, fenster.vonMinute)}px` }}
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
                    links={links}
                    breite={breite}
                    stapel={spalte + 1}
                    gedimmt={wirdGezogen}
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
                  className="border-accent bg-accent-soft/70 text-accent pointer-events-none absolute inset-x-1 z-40 rounded-lg border-2 border-dashed px-2 py-1 text-xs font-medium"
                  style={{
                    top: `${minuteZuPixel(ziehen.vorschau.startMinute, fenster.vonMinute)}px`,
                    height: `${(ziehen.vorschau.dauer / 60) * STUNDEN_HOEHE}px`,
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
  links,
  breite,
  stapel,
  gedimmt,
  ziehbar,
  onPointerDown,
  onClickCapture,
}: {
  gitter: GitterEintrag;
  fensterVon: number;
  links: number;
  breite: number;
  stapel: number;
  gedimmt: boolean;
  ziehbar: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onClickCapture: (event: React.MouseEvent) => void;
}) {
  const { eintrag, beginnMinute, endeMinute, farbe } = gitter;
  const oben = minuteZuPixel(beginnMinute, fensterVon);
  // Mindesthöhe, damit auch ein sehr kurzer Termin greifbar bleibt.
  const hoehe = Math.max(28, ((endeMinute - beginnMinute) / 60) * STUNDEN_HOEHE);
  const vermerk = eintrag.status === 'scheduled' ? null : appointmentStatusLabels[eintrag.status];
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
        // Ohne none übernimmt der Browser die Geste als Bildlauf, und das
        // Ziehen käme auf einem Touchgerät gar nicht erst zustande.
        ...(ziehbar ? { touchAction: 'none' } : {}),
      }}
      className={[
        'border-line bg-surface hover:bg-surface-sunken absolute block overflow-hidden rounded-lg',
        'border border-l-4 px-1.5 py-1 text-left transition-colors',
        eintrag.status === 'cancelled' ? 'opacity-60' : '',
        gedimmt ? 'opacity-40' : '',
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
