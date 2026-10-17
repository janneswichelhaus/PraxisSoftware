import { Zwischentitel } from './Zwischentitel';

/**
 * Ein Monat als Raster wählbarer Tage (Überholung 7, URL-001): Überschrift,
 * Wochentage, je Tag ein Knopf von 44 × 44 px - wie im Monatskalender des
 * Kalenders, damit man ihn auch mit Handschuhen trifft. Was ein Tag bedeutet
 * (gewählt, belegt, Feiertag), sagt die Seite über `angabe`; das Blatt zeigt
 * es als Fläche oder Punkt und schreibt es in den Namen des Knopfes.
 *
 * Gezeigt werden nur die Tage des Monats: Stehen mehrere Blätter
 * untereinander, stünde ein Tag sonst zweimal da. Tage vor `ab` sind
 * gesperrt. Ohne Abhängigkeit zu einem Fachmodul - die Felder rechnet das
 * Blatt selbst.
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
  /** Fläche für Belegtes, etwa eigenen Urlaub. */
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
}) {
  const name = MONATSNAME.format(datum(monat));
  return (
    <div role="group" aria-label={name}>
      <Zwischentitel>{name}</Zwischentitel>
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
                        ? 'bg-surface-sunken text-ink'
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
