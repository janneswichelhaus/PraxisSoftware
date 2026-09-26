import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import { giltNoch, type Erhebung } from './api';
import type { ScoreDefinition, ScoreItem } from './schema';

/**
 * Der Verlauf im Befund (FRB-002e, `IDEA-OUT-005`).
 *
 * Werte über die Zeit, daneben die Ereignisse, die sie erklären könnten —
 * gesetzt von der Praxis, nicht erraten. Die Anwendung rechnet keinen Trend,
 * verbindet keine Punkte und sagt nichts über die Richtung (ADR-006 Punkt 11,
 * `verbot-verlaufsbewertung` in `src/app/mdr.ts`). Bei vier Messpunkten wäre
 * jeder Trend eine Erfindung.
 */

/**
 * Die Arten eines Ereignisses (**ANN-106**). Muss deckungsgleich mit dem
 * Constraint an `patient_course_events.kind` bleiben
 * (`supabase/migrations/20260926110000_frb_002e_course_events.sql`).
 */
export const EREIGNISARTEN = [
  'operation',
  'erkrankung',
  'urlaub',
  'medikation',
  'sonstiges',
] as const;
export type Ereignisart = (typeof EREIGNISARTEN)[number];

export const ereignisartTexte: Record<Ereignisart, string> = {
  operation: 'Operation',
  erkrankung: 'Erkrankung',
  urlaub: 'Urlaub, Pause',
  medikation: 'Medikation geändert',
  sonstiges: 'Sonstiges',
};

export const NOTIZ_MAX = 200;

const ereignisSchema = z.object({
  id: z.string(),
  occurred_on: z.string(),
  kind: z.enum(EREIGNISARTEN),
  note: z.string().nullable(),
  created_at: z.string(),
  author_name: z.string().nullable(),
});
export type Verlaufsereignis = z.infer<typeof ereignisSchema>;

export const ereignisseQueryKey = (patientId: string) => ['verlaufsereignisse', patientId] as const;

export async function fetchEreignisse(patientId: string): Promise<Verlaufsereignis[]> {
  const { data, error } = (await getSupabase().rpc('list_patient_course_events', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error('Die Ereignisse im Verlauf konnten nicht geladen werden.');
  return z.array(ereignisSchema).parse(data);
}

function meldungFuer(message: string): string {
  if (message.includes('not allowed')) return 'Für diesen Schritt fehlt die Berechtigung.';
  if (message.includes('not found')) return 'Das Ereignis wurde nicht gefunden.';
  return 'Das Ereignis konnte nicht gespeichert werden.';
}

export async function ereignisSetzen(eingabe: {
  patientId: string;
  datum: string;
  art: Ereignisart;
  notiz: string;
}): Promise<void> {
  const { error } = (await getSupabase().rpc('add_patient_course_event', {
    p_patient_id: eingabe.patientId,
    p_occurred_on: eingabe.datum,
    p_kind: eingabe.art,
    p_note: eingabe.notiz.trim() === '' ? null : eingabe.notiz.trim(),
  })) as { error: { message?: string } | null };
  if (error) throw new Error(meldungFuer(error.message ?? ''));
}

export async function ereignisEntfernen(ereignisId: string): Promise<void> {
  const { error } = (await getSupabase().rpc('remove_patient_course_event', {
    p_event_id: ereignisId,
  })) as { error: { message?: string } | null };
  if (error) throw new Error(meldungFuer(error.message ?? ''));
}

export interface Messpunkt {
  datum: string;
  wert: number;
}

export interface Messreihe {
  instrument: ScoreDefinition;
  item: ScoreItem;
  punkte: Messpunkt[];
}

/**
 * Die Skalenwerte je Frage über die Zeit.
 *
 * Nur **geltende** Erhebungen zählen: abgeschlossen und nicht durch eine
 * Korrektur ersetzt. Ein Entwurf ist keine Angabe, und ein korrigierter Wert
 * neben seiner Korrektur wäre ein Punkt, den es so nie gab. Die Punkte sind
 * die Rohwerte, unverändert — kein Mittel, keine Glättung.
 */
export function messreihen(
  erhebungen: readonly Erhebung[],
  instrumente: readonly ScoreDefinition[],
): Messreihe[] {
  const geltend = erhebungen.filter((e) => giltNoch(e, erhebungen));
  return instrumente.flatMap((instrument) =>
    instrument.items
      .filter((item) => item.typ === 'skala')
      .map((item) => ({
        instrument,
        item,
        punkte: geltend
          .filter((e) => e.instrument_id === instrument.meta.id)
          .flatMap((e) => {
            const antwort = e.answers[item.id];
            return antwort && 'wert' in antwort
              ? [{ datum: e.recorded_on, wert: antwort.wert }]
              : [];
          })
          .sort((a, b) => a.datum.localeCompare(b.datum)),
      }))
      .filter((reihe) => reihe.punkte.length > 0),
  );
}

/** Tage seit 1970 — genug, um Kalendertage auf eine Achse zu legen. */
export function tagZahl(datum: string): number {
  return Math.round(Date.parse(`${datum}T00:00:00Z`) / 86_400_000);
}

/**
 * Der gezeigte Zeitraum: vom frühesten bis zum spätesten Wert oder Ereignis,
 * mindestens zwei Wochen, damit ein einzelner Punkt nicht am Rand klebt.
 */
export function zeitraum(daten: readonly string[]): { von: number; bis: number } | null {
  if (daten.length === 0) return null;
  const tage = daten.map(tagZahl);
  let von = Math.min(...tage);
  let bis = Math.max(...tage);
  if (bis - von < 14) {
    const mitte = (von + bis) / 2;
    von = Math.floor(mitte - 7);
    bis = Math.ceil(mitte + 7);
  }
  const rand = Math.max(1, Math.round((bis - von) * 0.04));
  return { von: von - rand, bis: bis + rand };
}
