import { dayKey, formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import type { PatientTreatmentNotesEntry } from './api';
import { AUSZUG_TERMINE, type Auszugsquelle } from './auszuege';

/**
 * Die finalisierten Einträge der letzten dokumentierten Termine, neueste zuerst. Ein Entwurf ist
 * noch nicht die Akte (ADR-016) und bleibt draußen.
 */
export function quellenAus(
  seite: readonly PatientTreatmentNotesEntry[],
  hier: string,
): Auszugsquelle[] {
  const liste: Auszugsquelle[] = [];
  let termine = 0;
  for (const termin of seite) {
    const fertig = termin.notes.filter(
      (eintrag) => eintrag.status === 'final' && eintrag.content.trim() !== '',
    );
    if (fertig.length === 0) continue;
    if (termine === AUSZUG_TERMINE) break;
    termine += 1;
    const tag = formatDate(dayKey(termin.starts_at, termin.organization_time_zone)).slice(0, 6);
    const ziel = mitRueckweg(`/termine/${termin.appointment_id}/abschluss`, hier);
    for (const eintrag of fertig) {
      const meta = [eintrag.author_name, eintrag.addendum_to_note_id ? 'Nachtrag' : null];
      liste.push({
        id: eintrag.id,
        text: eintrag.content,
        tag,
        meta: meta.filter((teil) => teil).join(' · '),
        ziel,
      });
    }
  }
  return liste;
}
