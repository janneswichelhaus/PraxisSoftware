import type { DosisZumAblesen } from './Uebungsinhalt';

/**
 * Die Hauptzahl einer Dosierung für die `Buehne` (Handoff 2026-10-24,
 * Abschnitt 3) und ihre Einheit: „8 bis 12“ und „Wiederholungen je
 * Durchgang“, „30“ und „Sekunden je Seite“. Dieselben Felder und Wörter wie
 * `dosierungAlltag` (ANN-299) - reine Darstellung, nichts gerechnet.
 */
export function hauptzahl(d: DosisZumAblesen): { zahl: string; einheit: string } {
  const je = d.per_side ? 'je Seite' : 'je Durchgang';
  if (d.reps_min !== null && d.reps_max !== null) {
    return {
      zahl: d.reps_min === d.reps_max ? `${d.reps_min}` : `${d.reps_min} bis ${d.reps_max}`,
      einheit: `${d.reps_max === 1 ? 'Wiederholung' : 'Wiederholungen'} ${je}`,
    };
  }
  const sekunden = d.duration_seconds ?? 0;
  return { zahl: `${sekunden}`, einheit: `${sekunden === 1 ? 'Sekunde' : 'Sekunden'} ${je}` };
}
