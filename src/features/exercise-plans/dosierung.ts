import type { Position } from './api';

/**
 * Die Dosierung einer Position in Worten (ANN-299) - einmal fachlich für die
 * Praxis, einmal in Alltagssprache für die Person (IDEA-QSN-002).
 *
 * Reine Darstellung dessen, was die Fachperson eingetragen hat: Nichts hier
 * rechnet eine Steigerung aus oder schlägt eine vor (ADR-006 Punkt 10).
 */

type Dosis = Pick<
  Position,
  | 'sets'
  | 'reps_min'
  | 'reps_max'
  | 'duration_seconds'
  | 'load'
  | 'tempo'
  | 'rest_seconds'
  | 'double_progression'
>;

function wiederholungen(d: Dosis, trenner: string): string | null {
  if (d.reps_min === null || d.reps_max === null) return null;
  return d.reps_min === d.reps_max ? `${d.reps_min}` : `${d.reps_min}${trenner}${d.reps_max}`;
}

/** „3 × 8–12 Wdh. · 5 kg · Tempo 3-0-1 · Pause 60 s" */
export function dosierungFachlich(d: Dosis): string {
  const teile: string[] = [];
  const wdh = wiederholungen(d, '–');
  teile.push(wdh ? `${d.sets} × ${wdh} Wdh.` : `${d.sets} × ${d.duration_seconds ?? 0} s`);
  if (d.load) teile.push(d.load);
  if (d.tempo) teile.push(`Tempo ${d.tempo}`);
  if (d.rest_seconds !== null) teile.push(`Pause ${d.rest_seconds} s`);
  if (d.double_progression) teile.push('doppelte Progression');
  return teile.join(' · ');
}

function mal(anzahl: number, einzahl: string, mehrzahl: string): string {
  return `${anzahl} ${anzahl === 1 ? einzahl : mehrzahl}`;
}

/** „3 Durchgänge mit je 8 bis 12 Wiederholungen. Mit: 5 kg. Pause: 60 Sekunden." */
export function dosierungAlltag(d: Dosis): string {
  const saetze: string[] = [];
  const wdh = wiederholungen(d, ' bis ');
  saetze.push(
    wdh
      ? `${mal(d.sets, 'Durchgang', 'Durchgänge')} mit je ${wdh} Wiederholungen.`
      : `${mal(d.sets, 'Durchgang', 'Durchgänge')} von je ${mal(d.duration_seconds ?? 0, 'Sekunde', 'Sekunden')}.`,
  );
  if (d.load) saetze.push(`Mit: ${d.load}.`);
  if (d.tempo) saetze.push(`Tempo: ${d.tempo}.`);
  if (d.rest_seconds !== null && d.rest_seconds > 0) {
    saetze.push(`Pause dazwischen: ${mal(d.rest_seconds, 'Sekunde', 'Sekunden')}.`);
  }
  if (d.double_progression && d.reps_min !== null && d.reps_max !== null) {
    // Die Regel stammt von der Fachperson; die Steigerung der Last
    // entscheidet sie selbst (IDEA-TRN-007, ADR-006 Punkt 4).
    saetze.push(
      `Beginnen Sie mit ${d.reps_min} und steigern Sie bis ${d.reps_max} Wiederholungen. Schaffen Sie in allen Durchgängen ${d.reps_max}, sagen Sie es uns – dann passen wir das Gewicht an.`,
    );
  }
  return saetze.join(' ');
}

/**
 * Was sich an einer Position gegenüber der vorigen Fassung geändert hat
 * (UEB-006) - als Zeilen „Last: 5 kg → 7 kg".
 */
export function unterschiede(
  vorher: Position,
  nachher: Pick<Position, 'variant_id' | 'variant_name'> & Dosis,
): string[] {
  const zeilen: string[] = [];
  if (vorher.variant_id !== nachher.variant_id) {
    zeilen.push(`Übung: ${vorher.variant_name} → ${nachher.variant_name}`);
  }
  const wert = (d: Dosis) =>
    wiederholungen(d, '–') ?? (d.duration_seconds === null ? '—' : `${d.duration_seconds} s`);
  if (wert(vorher) !== wert(nachher)) {
    zeilen.push(
      `${vorher.duration_seconds === null ? 'Wiederholungen' : 'Dauer'}: ${wert(vorher)} → ${wert(nachher)}`,
    );
  }
  if (vorher.sets !== nachher.sets) zeilen.push(`Sätze: ${vorher.sets} → ${nachher.sets}`);
  if ((vorher.load ?? '') !== (nachher.load ?? '')) {
    zeilen.push(`Last: ${vorher.load ?? '—'} → ${nachher.load ?? '—'}`);
  }
  if ((vorher.tempo ?? '') !== (nachher.tempo ?? '')) {
    zeilen.push(`Tempo: ${vorher.tempo ?? '—'} → ${nachher.tempo ?? '—'}`);
  }
  if (vorher.rest_seconds !== nachher.rest_seconds) {
    const s = (w: number | null) => (w === null ? '—' : `${w} s`);
    zeilen.push(`Pause: ${s(vorher.rest_seconds)} → ${s(nachher.rest_seconds)}`);
  }
  return zeilen;
}
