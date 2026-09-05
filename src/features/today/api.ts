import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

const staffMemberSchema = z.object({ id: z.string() });

/**
 * Die eigene Beschäftigtenkennung.
 *
 * „Mein Tag" braucht sie, um die eigenen Besuche von denen des Teams zu
 * trennen. Ein Abgleich über den Anzeigenamen wäre dafür untauglich - im
 * Team können zwei Personen sehr ähnlich heißen.
 *
 * Ohne Beschäftigtenrolle liefert die Abfrage `null`; das ist kein Fehler,
 * sondern der Normalfall für ein Patientenkonto.
 */
export async function fetchOwnStaffMemberId(personId: string): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from('staff_members')
    .select('id')
    .eq('person_id', personId)
    .maybeSingle();

  if (error) throw new Error('Die eigene Zuordnung konnte nicht geladen werden.');
  if (!data) return null;
  return staffMemberSchema.parse(data).id;
}
