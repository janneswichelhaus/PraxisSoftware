import { Symbolknopf } from './Symbolknopf';
import { Zwischentitel } from './Zwischentitel';

/**
 * Ein Monat als Raster wählbarer Tage (Überholung 7, URL-001): Überschrift,
 * Wochentage, je Tag ein Knopf von 44 × 44 px - wie im Monatskalender des
 * Kalenders, damit man ihn auch mit Handschuhen trifft. Was ein Tag bedeutet
 * (gewählt, belegt, Feiertag), sagt die Seite über `angabe`; das Blatt zeigt
 * es als Fläche, gestrichelte Kante oder Punkt und schreibt es in den Namen
 * des Knopfes.
 *
 * Ein Blatt je Seite eines geführten Ablaufs, nie mehrere untereinander -
 * die Seite rollte sonst (Design-Review Überholung 7). Mit `onMonat` blättert
 * der Kopf mit ‹ › zwischen den Monaten von `ab` bis `bis`. Gezeigt werden nur
 * die Tage des Monats; Tage vor `ab` und nach `bis` sind gesperrt. Ohne
 * Abhängigkeit zu einem Fachmodul - die Felder rechnet das Blatt selbst.
 */

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

const MONATSNAME = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const TAGESNAME = new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeZone: 'UTC' });

function datum(tag: string): Date {
  return new Date(`${tag}T00:00:00Z`);
}

function monatPlus(monat: string, n: number): string {
  const d = datum(monat);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)).toISOString().slice(0, 10);
}

/**
 * Die Felder eines Monats ab Montag: leere vor dem Ersten (`null`), dann
 * jeder Tag als `YYYY-MM-DD`.
 */
function monatsfelder(monat: string): (string | null)[] {
  const erster = datum(monat);
  const vorne = (erster.getUTCDay() + 6) % 7;
  const tage = new Date(
    Date.UTC(erster.getUTCFullYear(), erster.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const praefix = monat.slice(0, 8);
  return [
    ...Array.from({ length: vorne }, () => null),
    ...Array.from({ length: tage }, (_, i) => `${praefix}${String(i + 1).padStart(2, '0')}`),
  ];
}

export interface Tagesangabe {
  /** `rand`: Beginn oder Ende einer Wahl (gefüllt); `zwischen`: darin (hell). */
  wahl?: 'rand' | 'zwischen' | undefined;
  /** Gestrichelte Kante für Belegtes, etwa eigenen Urlaub. */
  belegt?: boolean | undefined;
  /** Punkt unter der Zahl, etwa für einen Feiertag. */
  punkt?: boolean | undefined;
  /** Was Vorlesesoftware nach dem Datum hört, etwa „Feiertag (Ostermontag)“. */
  zusaetze?: readonly string[] | undefined;
}

export function Monatsblatt({
  monat,
  heute,
  ab,
  bis,
  fokus,
  angabe,
  onWaehlen,
  onMonat,
}: {
  /** Der Monatserste, `YYYY-MM-01`. */
  monat: string;
  heute: string;
  /** Erster wählbarer Tag; davor gesperrt. */
  ab: string;
  /** Letzter wählbarer Tag; danach gesperrt (ohne Angabe: keiner). */
  bis?: string | undefined;
  /** Dieser Tag bekommt `data-autofocus`. */
  fokus?: string | undefined;
  angabe: (tag: string) => Tagesangabe;
  onWaehlen: (tag: string) => void;
  /** Blättern: ‹ › im Kopf, nur innerhalb von `ab` bis `bis`. */
  onMonat?: ((monat: string) => void) | undefined;
}) {
  const name = MONATSNAME.format(datum(monat));
  const vorher = monatPlus(monat, -1);
  const nachher = monatPlus(monat, 1);
  return (
    <div role="group" aria-label={name}>
      {onMonat ? (
        <div className="flex items-center justify-between gap-2">
          <Symbolknopf
            beschriftung="Vorheriger Monat"
            className="text-lg"
            disabled={monat <= `${ab.slice(0, 7)}-01`}
            onClick={() => onMonat(vorher)}
          >
            ‹
          </Symbolknopf>
          <Zwischentitel>{name}</Zwischentitel>
          <Symbolknopf
            beschriftung="Nächster Monat"
            className="text-lg"
            disabled={bis !== undefined && nachher > bis}
            onClick={() => onMonat(nachher)}
          >
            ›
          </Symbolknopf>
        </div>
      ) : (
        <Zwischentitel>{name}</Zwischentitel>
      )}
      <div className="mt-2 grid grid-cols-7 text-center">
        {WOCHENTAGE.map((w) => (
          <span key={w} aria-hidden="true" className="text-ink-muted py-1 text-xs">
            {w}
          </span>
        ))}
        {monatsfelder(monat).map((tag, i) => {
          if (tag === null) return <span key={`leer-${i}`} aria-hidden="true" />;
          const gesperrt = tag < ab || (bis !== undefined && tag > bis);
          const a = angabe(tag);
          const rand = a.wahl === 'rand';
          const ansage = [
            TAGESNAME.format(datum(tag)),
            tag === heute ? 'heute' : null,
            ...(a.zusaetze ?? []),
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <button
              key={tag}
              type="button"
              aria-label={ansage}
              aria-pressed={a.wahl !== undefined}
              aria-current={tag === heute ? 'date' : undefined}
              disabled={gesperrt}
              onClick={() => onWaehlen(tag)}
              {...(tag === fokus ? { 'data-autofocus': true } : {})}
              className={[
                'rounded-button relative mx-auto my-0.5 inline-flex size-11 flex-col items-center justify-center text-sm tabular-nums',
                gesperrt
                  ? 'text-ink-muted cursor-not-allowed opacity-50'
                  : rand
                    ? 'bg-accent text-surface font-semibold'
                    : a.wahl === 'zwischen'
                      ? 'bg-accent-soft text-ink font-semibold'
                      : a.belegt
                        ? 'border-ink-muted bg-surface-sunken text-ink border-2 border-dashed'
                        : 'text-ink hover:bg-surface-sunken',
                tag === heute && !rand ? 'border-accent border-2' : '',
              ].join(' ')}
            >
              {Number(tag.slice(8))}
              {a.punkt ? (
                <span
                  aria-hidden="true"
                  className={`rounded-pill absolute bottom-1 size-1.5 ${
                    rand ? 'bg-surface' : 'bg-warnung'
                  }`}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
