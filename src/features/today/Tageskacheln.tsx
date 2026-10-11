import type { TravelLevel } from '@/components/ui/travelPlan';
import { liegeAntwort, type LiegeHeute } from './tagesstart';

// -----------------------------------------------------------------------------
// Liege und Abfahrt als zwei Kacheln (Jannes, 2026-10-11)
//
// Lösen die Liege-Zeile und den großen Wegbalken ab: zwei Fragen, zwei
// Antworten nebeneinander - muss die Liege mit, und wann muss ich los. Die
// Kachel „Abfahrt" gibt es nur am Hausbesuchstag mit bekannter Fahrzeit, die
// Liege nur, wenn ein Hausbesuch ansteht (BEF-051). Steht nur eine da,
// nimmt sie die ganze Breite.
// -----------------------------------------------------------------------------

export interface Abfahrt {
  /** „Abfahrt" oder „Abfahrt danach", wenn der Besuch davor schon läuft. */
  titel: string;
  /** Späteste Abfahrt als „hh:mm". */
  zeit: string;
  fahrtMin: number;
  /** Puffer in Minuten; ohne vorigen Termin (ein künftiger Tag) unbekannt. */
  pufferMin: number | null;
  stufe: TravelLevel;
}

/** Text und Farbe je Stufe, wie am Wegbalken: Farbe trägt nie allein (WCAG 1.4.1). */
const STUFEN: Record<TravelLevel, { wort: string; farbe: string }> = {
  late: { wort: 'Sofort', farbe: 'text-danger' },
  tight: { wort: 'spätestens', farbe: 'text-warnung' },
  narrow: { wort: 'spätestens', farbe: 'text-warnung' },
  clear: { wort: 'spätestens', farbe: 'text-ink' },
};

const kicker = 'tracking-label text-xs font-semibold uppercase';

export function Tageskacheln({
  liege,
  abfahrt,
  tagWort,
}: {
  /** `null`: an diesem Tag gibt es keinen Hausbesuch, also keine Liegefrage. */
  liege: LiegeHeute | null;
  abfahrt: Abfahrt | null;
  /** „heute", „morgen" … hinter „Liege". */
  tagWort: string;
}) {
  if (!liege && !abfahrt) return null;
  const beide = liege !== null && abfahrt !== null;
  const antwort = liege ? liegeAntwort(liege) : null;
  const stufe = abfahrt ? STUFEN[abfahrt.stufe] : null;

  return (
    <dl className={`grid gap-2 ${beide ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {antwort ? (
        <div className="bg-accent-soft rounded-card min-w-0 px-4 py-3">
          <dt className={`text-accent ${kicker}`}>Liege {tagWort}</dt>
          <dd className="text-accent mt-1 text-base font-bold">
            {liege?.noetig ? <span aria-hidden="true">✓ </span> : null}
            {antwort.antwort}
          </dd>
          {antwort.ab ? <dd className="text-accent text-sm tabular-nums">{antwort.ab}</dd> : null}
        </div>
      ) : null}
      {abfahrt && stufe ? (
        <div className="border-line bg-surface rounded-card min-w-0 border px-4 py-3">
          <dt className={`text-ink-muted ${kicker}`}>{abfahrt.titel}</dt>
          <dd className={`mt-1 text-base font-bold whitespace-nowrap tabular-nums ${stufe.farbe}`}>
            {abfahrt.stufe === 'clear' ? null : <span aria-hidden="true">! </span>}
            {abfahrt.stufe === 'late' ? stufe.wort : `${stufe.wort} ${abfahrt.zeit}`}
          </dd>
          <dd className="text-ink-muted text-sm tabular-nums">
            ≈ {Math.max(0, Math.round(abfahrt.fahrtMin))} min Rad
          </dd>
          {/* Der Puffer zählt erst, wenn es knapp wird; sonst ist er Rauschen. */}
          {abfahrt.pufferMin !== null && abfahrt.stufe !== 'clear' ? (
            <dd className={`text-sm font-semibold tabular-nums ${stufe.farbe}`}>
              {abfahrt.pufferMin < 0
                ? `${Math.abs(abfahrt.pufferMin)} min zu knapp`
                : `${abfahrt.pufferMin} min Puffer`}
            </dd>
          ) : null}
        </div>
      ) : null}
    </dl>
  );
}
