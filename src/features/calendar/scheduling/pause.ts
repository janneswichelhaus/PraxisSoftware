import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Pause frei im Kalender (ANN-863): Dauer aus dem Plan, Lage je Tag. Dieselbe Regel
 * wie `app.break_gaps` und `app.working_ranges`, damit Raster und Rückfrage vorher stimmen.
 */

export interface Band {
  vonMinute: number;
  bisMinute: number;
}

export interface Pause extends Band {
  /** Beginn der Lücke im Plan - so findet der Server die Pause wieder. */
  planVonMinute: number;
  /** Liegt woanders als im Plan. */
  verschoben: boolean;
}

/** Die Lage einer Pause an einem Tag, wie sie die Tabelle führt. */
export interface Pausenlage {
  staff_member_id: string;
  on_date: string;
  plan_starts_at: string;
  starts_at: string;
  ends_at: string;
}

export const PAUSE_MIN = 15;
export const PAUSE_MAX = 60;
/** § 4 ArbZG: höchstens 6 Stunden am Stück, über 6 Stunden 30 und über 9 Stunden 45 Minuten Pause. */
export const AM_STUECK_MAX = 6 * 60;
const PAUSE_UEBER_NEUN = { ab: 9 * 60, minuten: 45 } as const;

function minute(zeit: string): number {
  const [h, m] = zeit.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

function zeit(minuten: number): string {
  return `${String(Math.floor(minuten / 60)).padStart(2, '0')}:${String(minuten % 60).padStart(2, '0')}`;
}

/** Bänder sortiert und Überlappendes oder Anstoßendes zusammengelegt. */
export function zusammengelegt(baender: readonly Band[]): Band[] {
  const sortiert = [...baender]
    .filter((b) => b.bisMinute > b.vonMinute)
    .sort((a, b) => a.vonMinute - b.vonMinute);
  const ergebnis: Band[] = [];
  for (const b of sortiert) {
    const letztes = ergebnis.at(-1);
    if (letztes && b.vonMinute <= letztes.bisMinute) {
      letztes.bisMinute = Math.max(letztes.bisMinute, b.bisMinute);
    } else {
      ergebnis.push({ ...b });
    }
  }
  return ergebnis;
}

function ohne(baender: readonly Band[], weg: Band): Band[] {
  return baender.flatMap((b) => {
    if (weg.bisMinute <= b.vonMinute || weg.vonMinute >= b.bisMinute) return [b];
    const teile: Band[] = [];
    if (weg.vonMinute > b.vonMinute)
      teile.push({ vonMinute: b.vonMinute, bisMinute: weg.vonMinute });
    if (weg.bisMinute < b.bisMinute)
      teile.push({ vonMinute: weg.bisMinute, bisMinute: b.bisMinute });
    return teile;
  });
}

function deckt(baender: readonly Band[], b: Band): boolean {
  return baender.some((x) => x.vonMinute <= b.vonMinute && x.bisMinute >= b.bisMinute);
}

/** Die verschiebbaren Pausen eines Plans: Lücken von 15 bis 60 Minuten. */
export function pausenLuecken(plan: readonly Band[]): Band[] {
  const tag = zusammengelegt(plan);
  const luecken: Band[] = [];
  for (let i = 1; i < tag.length; i += 1) {
    const laenge = tag[i]!.vonMinute - tag[i - 1]!.bisMinute;
    if (laenge >= PAUSE_MIN && laenge <= PAUSE_MAX) {
      luecken.push({ vonMinute: tag[i - 1]!.bisMinute, bisMinute: tag[i]!.vonMinute });
    }
  }
  return luecken;
}

/**
 * Arbeitszeit und Pausen eines Tages mit den Lagen des Tages - dieselbe Regel
 * wie `app.working_ranges`: Nur eine Lage, die zur Lücke passt und ganz in der
 * Arbeitszeit liegt, verschiebt; sonst bleibt die Pause, wo der Plan sie hat.
 */
export function tagMitPausen(
  plan: readonly Band[],
  lagen: readonly Pausenlage[],
): { arbeitszeit: Band[]; pausen: Pause[] } {
  let arbeitszeit = zusammengelegt(plan);
  const pausen: Pause[] = [];
  for (const luecke of pausenLuecken(plan)) {
    const dauer = luecke.bisMinute - luecke.vonMinute;
    const lage = lagen.find((l) => minute(l.plan_starts_at) === luecke.vonMinute);
    const ziel = lage
      ? { vonMinute: minute(lage.starts_at), bisMinute: minute(lage.ends_at) }
      : null;
    const mitLuecke = zusammengelegt([...arbeitszeit, luecke]);
    if (ziel && ziel.bisMinute - ziel.vonMinute === dauer && deckt(mitLuecke, ziel)) {
      arbeitszeit = ohne(mitLuecke, ziel);
      pausen.push({ ...ziel, planVonMinute: luecke.vonMinute, verschoben: true });
    } else {
      pausen.push({ ...luecke, planVonMinute: luecke.vonMinute, verschoben: false });
    }
  }
  return { arbeitszeit, pausen };
}

export type Pausenproblem = 'ueberlagert' | 'zu_kurz' | 'am_stueck';

/**
 * Was an der Pause eines Tages nicht stimmt (§ 4 ArbZG), aus Arbeitszeit und Terminen.
 * Darstellung, keine Sperre; gespeichert wird nichts davon (§ 20).
 */
export function pausenProbleme(
  arbeitszeit: readonly Band[],
  pausen: readonly Pause[],
  termine: readonly Band[],
): Pausenproblem[] {
  if (pausen.length === 0) return [];
  const probleme: Pausenproblem[] = [];
  if (
    pausen.some((p) => termine.some((t) => t.vonMinute < p.bisMinute && t.bisMinute > p.vonMinute))
  ) {
    probleme.push('ueberlagert');
  }
  let tag = zusammengelegt([...arbeitszeit, ...termine]);
  for (const p of pausen) {
    if (!termine.some((t) => t.vonMinute < p.bisMinute && t.bisMinute > p.vonMinute)) {
      tag = ohne(tag, p);
    }
  }
  let stueck = 0;
  let laengstes = 0;
  let arbeit = 0;
  let pause = 0;
  let ende: number | null = null;
  for (const b of tag) {
    const luecke = ende === null ? null : b.vonMinute - ende;
    if (luecke !== null && luecke >= PAUSE_MIN) pause += luecke;
    stueck =
      luecke !== null && luecke < PAUSE_MIN
        ? stueck + luecke + (b.bisMinute - b.vonMinute)
        : b.bisMinute - b.vonMinute;
    laengstes = Math.max(laengstes, stueck);
    arbeit += b.bisMinute - b.vonMinute;
    ende = b.bisMinute;
  }
  const noetig =
    arbeit > PAUSE_UEBER_NEUN.ab ? PAUSE_UEBER_NEUN.minuten : arbeit > AM_STUECK_MAX ? 30 : 0;
  if (pause < noetig) probleme.push('zu_kurz');
  if (laengstes > AM_STUECK_MAX) probleme.push('am_stueck');
  return probleme;
}

export const PAUSENPROBLEM_TEXT: Record<Pausenproblem, string> = {
  ueberlagert: 'Ein Termin liegt in der Pause.',
  zu_kurz: 'Pause zu kurz: über 6 Std. 30, über 9 Std. 45 Min. (§ 4 ArbZG).',
  am_stueck: 'Mehr als 6 Std. am Stück ohne Pause (§ 4 ArbZG).',
};

const lageSchema = z.object({
  staff_member_id: z.string(),
  on_date: z.string(),
  plan_starts_at: z.string().transform((t) => t.slice(0, 5)),
  starts_at: z.string().transform((t) => t.slice(0, 5)),
  ends_at: z.string().transform((t) => t.slice(0, 5)),
});

/** Die Lagen eines Zeitraums; welche Zeilen kommen, entscheidet die RLS. */
export async function fetchPausenlagen(von: string, bis: string): Promise<Pausenlage[]> {
  const { data, error } = await getSupabase()
    .from('staff_break_placements')
    .select('staff_member_id, on_date, plan_starts_at, starts_at, ends_at')
    .gte('on_date', von)
    .lte('on_date', bis);
  if (error) throw new Error('Pausen nicht geladen.');
  return antwort(z.array(lageSchema), data ?? [], 'Pausen nicht geladen.');
}

/** Der Server fragt zurück: Danach wären es mehr als 6 Stunden am Stück. */
export class PauseRueckfrage extends Error {}

/**
 * Legt die Pause an eine andere Stelle; zurück auf die Lage im Plan löscht
 * die Zeile. Mehr als 6 Stunden am Stück verlangt `bestaetigt`.
 */
export async function setPausenlage(eingabe: {
  staffMemberId: string;
  datum: string;
  planVonMinute: number;
  vonMinute: number;
  bestaetigt: boolean;
}): Promise<'moved' | 'plan'> {
  const { data, error } = (await getSupabase().rpc('set_break_placement', {
    p_staff_member_id: eingabe.staffMemberId,
    p_date: eingabe.datum,
    p_plan_starts_at: zeit(eingabe.planVonMinute),
    p_starts_at: zeit(eingabe.vonMinute),
    p_confirmed: eingabe.bestaetigt,
  })) as { data: unknown; error: { message?: string } | null };
  if (error) {
    const text = error.message ?? '';
    if (text.includes('more_than_six_hours_in_a_row')) {
      throw new PauseRueckfrage(PAUSENPROBLEM_TEXT.am_stueck);
    }
    if (text.includes('overlaps appointment')) {
      throw new Error('Dort liegt ein Termin. Erst den Termin verschieben.');
    }
    if (text.includes('outside working time')) {
      throw new Error('Die Pause bleibt in der Arbeitszeit des Tages.');
    }
    if (text.includes('not allowed')) {
      throw new Error('Die Pause verschiebt nur die Person selbst oder die Planung.');
    }
    throw new Error('Die Pause konnte nicht verschoben werden.');
  }
  return antwort(z.enum(['moved', 'plan']), data, 'Die Pause konnte nicht verschoben werden.');
}

/** Kennung einer Pause im Raster: neben den Terminen ziehbar, nie mit ihnen verwechselt. */
export function pausenKennung(spalteId: string, planVonMinute: number): string {
  return `pause:${spalteId}:${planVonMinute}`;
}

export function ausPausenKennung(
  kennung: string,
): { spalteId: string; planVonMinute: number } | null {
  const teile = /^pause:(.+):(\d+)$/.exec(kennung);
  return teile ? { spalteId: teile[1]!, planVonMinute: Number(teile[2]) } : null;
}
