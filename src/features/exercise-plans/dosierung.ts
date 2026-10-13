/**
 * Die Dosierung einer Position in Worten (ANN-299) - einmal fachlich für die
 * Praxis, einmal in Alltagssprache für die Person (IDEA-QSN-002).
 *
 * Reine Darstellung dessen, was die Fachperson eingetragen hat: Nichts hier
 * rechnet eine Steigerung aus oder schlägt eine vor (ADR-006 Punkt 10).
 */

/**
 * Die Felder der Dosierung - ohne Bezug auf die Datenzugriffe der Praxis, damit
 * auch die Plattform diese Wörter benutzt (UEB-009, ADR-023 Punkt 26).
 */
export interface Dosis {
  sets: number;
  reps_min: number | null;
  reps_max: number | null;
  duration_seconds: number | null;
  load: string | null;
  tempo: string | null;
  rest_seconds: number | null;
  double_progression: boolean;
  /** UEB-012: jede Wiederholung so viele Sekunden halten (nur mit Wiederholungen). */
  hold_seconds?: number | null;
  /** UEB-012: je Körperseite. */
  per_side?: boolean;
  /** UEB-012: wie oft am Tag; ohne Angabe gilt die Häufigkeit des Plans. */
  times_per_day?: number | null;
}

type Variante = { variant_id: string; variant_name: string };

function wiederholungen(d: Dosis, trenner: string): string | null {
  if (d.reps_min === null || d.reps_max === null) return null;
  return d.reps_min === d.reps_max ? `${d.reps_min}` : `${d.reps_min}${trenner}${d.reps_max}`;
}

/** „3 × 8–12 Wdh. · 3 s halten · je Seite · 2× tgl. · 5 kg · Tempo 3-0-1 · Pause 60 s" */
export function dosierungFachlich(d: Dosis): string {
  const teile: string[] = [];
  const wdh = wiederholungen(d, '–');
  teile.push(wdh ? `${d.sets} × ${wdh} Wdh.` : `${d.sets} × ${d.duration_seconds ?? 0} s`);
  if (wdh && d.hold_seconds) teile.push(`${d.hold_seconds} s halten`);
  if (d.per_side) teile.push('je Seite');
  if (d.times_per_day) teile.push(`${d.times_per_day}× tgl.`);
  if (d.load) teile.push(d.load);
  if (d.tempo) teile.push(`Tempo ${d.tempo}`);
  if (d.rest_seconds !== null) teile.push(`Pause ${d.rest_seconds} s`);
  if (d.double_progression) teile.push('doppelte Progression');
  return teile.join(' · ');
}

function mal(anzahl: number, einzahl: string, mehrzahl: string): string {
  return `${anzahl} ${anzahl === 1 ? einzahl : mehrzahl}`;
}

/** Eine Dauer in Worten: ab zwei vollen Minuten in Minuten. */
function dauerAlltag(sekunden: number): string {
  if (sekunden >= 120 && sekunden % 60 === 0) return mal(sekunden / 60, 'Minute', 'Minuten');
  return mal(sekunden, 'Sekunde', 'Sekunden');
}

/** „3 Durchgänge mit je 8 bis 12 Wiederholungen. Mit: 5 kg. Pause: 60 Sekunden." */
export function dosierungAlltag(d: Dosis): string {
  const saetze: string[] = [];
  const wdh = wiederholungen(d, ' bis ');
  const halten =
    wdh && d.hold_seconds ? `, jede ${mal(d.hold_seconds, 'Sekunde', 'Sekunden')} halten` : '';
  const seite = d.per_side ? ', je Seite' : '';
  saetze.push(
    wdh
      ? `${mal(d.sets, 'Durchgang', 'Durchgänge')} mit je ${wdh} Wiederholungen${halten}${seite}.`
      : `${mal(d.sets, 'Durchgang', 'Durchgänge')} von je ${dauerAlltag(d.duration_seconds ?? 0)}${seite}.`,
  );
  if (d.times_per_day) {
    saetze.push(d.times_per_day === 1 ? 'Einmal am Tag.' : `${d.times_per_day}-mal am Tag.`);
  }
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
export function unterschiede(vorher: Variante & Dosis, nachher: Variante & Dosis): string[] {
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
  const zahl = (w: number | null | undefined, einheit: string) =>
    w === null || w === undefined ? '—' : `${w}${einheit}`;
  if ((vorher.hold_seconds ?? null) !== (nachher.hold_seconds ?? null)) {
    zeilen.push(`Halten: ${zahl(vorher.hold_seconds, ' s')} → ${zahl(nachher.hold_seconds, ' s')}`);
  }
  if ((vorher.per_side ?? false) !== (nachher.per_side ?? false)) {
    zeilen.push(
      `Je Seite: ${vorher.per_side ? 'ja' : 'nein'} → ${nachher.per_side ? 'ja' : 'nein'}`,
    );
  }
  if ((vorher.times_per_day ?? null) !== (nachher.times_per_day ?? null)) {
    zeilen.push(`Am Tag: ${zahl(vorher.times_per_day, '×')} → ${zahl(nachher.times_per_day, '×')}`);
  }
  return zeilen;
}

/** „3-mal pro Woche" - die Zahl der Fachperson, in Worten (ANN-299). */
export function haeufigkeit(proWoche: number): string {
  return proWoche === 1 ? 'Einmal pro Woche' : `${proWoche}-mal pro Woche`;
}
