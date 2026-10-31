import type { ReactNode } from 'react';
import { TascheSymbol } from '@/components/ui/TascheSymbol';
import type { Dosis } from '@/features/exercise/exercises/plans/dosierung';

/**
 * Halten, je Seite und wie oft am Tag (UEB-012, ANN-384): optionale Felder
 * von `Dosis` aus der Übungsbibliothek. Fehlen sie, wird nichts gezeigt; keine
 * Angabe der Fachperson geht beim Ablesen verloren.
 */
export type DosisZumAblesen = Dosis & {
  hold_seconds?: number | null;
  per_side?: boolean;
  times_per_day?: number | null;
};

/**
 * Die übrige Dosierung einer Übung unter der Bühne (Handoff 2026-10-24,
 * Abschnitt 3): Durchgänge, Pause und Last als Marken - Angaben, keine
 * Knöpfe, deshalb eine vertiefte Fläche ohne Rand. Die Hauptzahl steht in der
 * `Buehne`, nicht hier. Darunter als Zeilen, was sich nicht als Marke lesen
 * lässt: Halten, wie oft am Tag, Tempo und die Regel der Fachperson zur
 * Steigerung, im Wortlaut der Kacheln, die sie ablösen (ANN-466, BEF-215).
 *
 * Reine Darstellung dessen, was die Fachperson eingetragen hat: Nichts hier
 * rechnet eine Steigerung aus oder schlägt eine vor (ADR-006 Punkt 10).
 * Unter 23rem wird jede Marke eine volle Zeile.
 */
export function Dosierungsmarken({ dosis: d }: { dosis: DosisZumAblesen }) {
  const marken: { schluessel: string; zeichen: ReactNode; text: string }[] = [
    {
      schluessel: 'durchgaenge',
      zeichen: DURCHGAENGE,
      text: d.sets === 1 ? '1 Durchgang' : `${d.sets} Durchgänge`,
    },
  ];
  if (d.rest_seconds !== null && d.rest_seconds > 0) {
    marken.push({
      schluessel: 'pause',
      zeichen: UHR,
      text: `${d.rest_seconds} ${sekunden(d.rest_seconds)} Pause`,
    });
  }
  if (d.load) marken.push({ schluessel: 'last', zeichen: LAST, text: `mit ${d.load}` });
  const mitWiederholungen = d.reps_min !== null && d.reps_max !== null;

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Dosierung" className="flex flex-wrap gap-2 max-[23rem]:flex-col">
        {marken.map((m) => (
          <li
            key={m.schluessel}
            className="bg-surface-sunken text-ink rounded-pill max-[23rem]:rounded-button inline-flex min-h-10 items-center gap-2 px-3.5 py-1.5 font-semibold max-[23rem]:px-2.5"
          >
            <span aria-hidden="true" className="text-accent inline-flex shrink-0">
              {m.zeichen}
            </span>
            {m.text}
          </li>
        ))}
      </ul>
      {mitWiederholungen && d.hold_seconds ? (
        <p className="text-ink">
          Jede Wiederholung {d.hold_seconds} {sekunden(d.hold_seconds)} halten.
        </p>
      ) : null}
      {d.times_per_day ? (
        <p className="text-ink">
          {d.times_per_day === 1 ? 'Einmal am Tag.' : `${d.times_per_day}-mal am Tag.`}
        </p>
      ) : null}
      {d.tempo ? <p className="text-ink">Tempo: {d.tempo}</p> : null}
      {d.double_progression && mitWiederholungen ? (
        // Die Regel stammt von der Fachperson; die Steigerung der Last
        // entscheidet sie selbst (IDEA-TRN-007, ADR-006 Punkt 4).
        <p className="text-ink">
          Beginnen Sie mit {d.reps_min} und steigern Sie bis {d.reps_max} Wiederholungen. Schaffen
          Sie in allen Durchgängen {d.reps_max}, sagen Sie es uns – dann passen wir das Gewicht an.
        </p>
      ) : null}
    </div>
  );
}

/** Die Einheit zur Zahl: „Sekunde“ oder „Sekunden“. */
function sekunden(anzahl: number): string {
  return anzahl === 1 ? 'Sekunde' : 'Sekunden';
}

/** Zeichen der Marken im Raster 24, Strich 2, 20 px - für Vorlesesoftware ausgeblendet. */
function Zeichen({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      className="size-5"
    >
      {children}
    </svg>
  );
}

/** Zwei Lagen übereinander: Durchgänge. */
const DURCHGAENGE = (
  <Zeichen>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5" />
  </Zeichen>
);
/** Die Uhr: Pause. */
const UHR = (
  <Zeichen>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Zeichen>
);
/** Eine Tasche: womit, etwa ein Rucksack mit 3 kg. */
const LAST = <TascheSymbol />;
