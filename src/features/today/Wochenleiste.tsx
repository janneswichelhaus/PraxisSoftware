import { Link } from 'react-router-dom';
import { tagePlus } from '@/features/appointments/calendar';
import { tagesPfad } from './tageswahl';
import { KURZ, alsDatum, fensterTage, tagesName } from './wochenfenster';

// -----------------------------------------------------------------------------
// Wochenleiste der Übersicht (Jannes, 2026-10-11)
//
// Sieben Tage in einer Reihe, ab heute, mit einem Punkt je eigenem Termin:
// Ein Blick zeigt, wie voll die Woche ist, ein Tipp führt auf den Tag. Sie
// löst „‹ Vortag · Folgetag ›" ab (UBK-003). Der Tag steht weiter als
// `?tag=` in der Adresse (ANN-234); die Pfeile schieben das Fenster um eine
// Woche, auch zurück - etwa zur Doku von gestern.
//
// Höchstens sechs Termine am Tag (Jannes): Die Punkte brauchen keine Zahl.
// Sie stehen in Reihen zu drei (Jannes, Bildschirmfoto vom 13.10.2026): Sechs
// Punkte in einer Reihe waren breiter als die Tageszelle (≈ 36 px bei 375 px)
// und liefen als Kette in die Nachbartage. Zwei Reihen kleiner Punkte und
// weniger Innenabstand halten die Zelle gleich hoch - der Hauptknopf des
// nächsten Besuchs bleibt bei 375 × 667 über der Tableiste (ANN-484). Mehr
// als sechs steht als Zahl da, statt Punkte abzuschneiden.
// -----------------------------------------------------------------------------

/** So viele Punkte zeigt eine Tageszelle; darüber steht die Zahl. */
export const PUNKTE_HOECHSTENS = 6;

export function Wochenleiste({
  tag,
  heute,
  anzahl,
}: {
  /** Der gezeigte Tag. */
  tag: string;
  heute: string;
  /** Eigene Termine je Tag; `undefined`, solange nichts geladen ist. */
  anzahl: (tag: string) => number | undefined;
}) {
  const tage = fensterTage(tag, heute);
  const anfang = tage[0]!;
  const pfeil =
    'text-ink-muted hover:text-accent flex min-h-12 w-7 shrink-0 items-center justify-center text-xl sm:min-h-16';

  return (
    // Am Telefon rückt die Leiste an das Datum im Kopf heran (Design-Review
    // R2, U3): Kopf und Leiste nennen zusammen den Tag, und der Hauptknopf
    // des nächsten Besuchs bleibt bei 375 × 667 über der Tableiste (ANN-484).
    <nav aria-label="Tag wählen" className="mb-2 flex items-stretch gap-1 max-sm:-mt-3 sm:mb-5">
      <Link to={tagesPfad(tagePlus(anfang, -7), heute)} className={pfeil} aria-label="Vorige Woche">
        <span aria-hidden="true">‹</span>
      </Link>
      <ol className="grid min-w-0 flex-1 grid-cols-7 gap-1">
        {tage.map((t) => {
          const gewaehlt = t === tag;
          const zahl = anzahl(t);
          return (
            <li key={t} className="min-w-0">
              <Link
                to={tagesPfad(t, heute)}
                aria-label={tagesName(t, heute, zahl)}
                aria-current={gewaehlt ? 'date' : undefined}
                className={`rounded-card flex min-h-12 flex-col items-center justify-center py-0.5 sm:min-h-16 sm:gap-0.5 sm:py-2 ${
                  gewaehlt ? 'bg-accent text-surface' : 'text-ink hover:bg-surface-sunken'
                }`}
              >
                <span
                  className={`tracking-label text-xs font-semibold uppercase ${
                    gewaehlt ? '' : t === heute ? 'text-accent' : 'text-ink-muted'
                  }`}
                >
                  {KURZ.format(alsDatum(t)).replace('.', '')}
                </span>
                <span
                  className={`text-base leading-tight font-bold tabular-nums sm:text-lg ${
                    !gewaehlt && t === heute ? 'text-accent' : ''
                  }`}
                >
                  {Number(t.slice(8, 10))}
                </span>
                {zahl !== undefined && zahl > PUNKTE_HOECHSTENS ? (
                  <span
                    aria-hidden="true"
                    className="text-xs leading-none font-semibold tabular-nums"
                    data-punkte={zahl}
                  >
                    {zahl}
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid h-2.5 grid-cols-[repeat(3,4px)] content-start justify-center gap-0.5"
                    data-punkte={zahl ?? ''}
                  >
                    {Array.from({ length: zahl ?? 0 }, (_, index) => (
                      <span
                        key={index}
                        className={`rounded-pill size-1 ${gewaehlt ? 'bg-surface' : 'bg-accent'}`}
                      />
                    ))}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
      <Link to={tagesPfad(tagePlus(anfang, 7), heute)} className={pfeil} aria-label="Nächste Woche">
        <span aria-hidden="true">›</span>
      </Link>
    </nav>
  );
}
