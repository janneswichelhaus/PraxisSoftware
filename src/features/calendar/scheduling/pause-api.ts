import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import { PAUSENPROBLEM_TEXT, type Pausenlage } from './pause';

function zeit(minuten: number): string {
  return `${String(Math.floor(minuten / 60)).padStart(2, '0')}:${String(minuten % 60).padStart(2, '0')}`;
}

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
