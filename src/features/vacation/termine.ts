import { fetchAppointments } from '@/features/appointments/api';
import { mitRueckweg } from '@/lib/rueckweg';
import { dayKey, tagePlus } from '@/lib/datum';

/**
 * Termine in einem Urlaub, der schon gilt (URL-001, Praxis-Review Überholung
 * 7): Nach dem Genehmigen oder Selbsteintragen ist jeder Tag ein eigenes
 * „Tag umplanen“ (G2). Damit nach dem ersten Tag die übrigen nicht aus dem
 * Blick geraten, führt der Rückweg jedes Tags auf diese Seite - und sie zählt
 * neu, statt sich die Liste vom Entscheiden zu merken.
 */
export const URLAUB_TERMINE = '/betrieb/urlaub/termine';

/** Die Seite für eine Person und einen Zeitraum - Kennung und Tage, keine Namen (ADR-011). */
export function terminePfad(person: string, von: string, bis: string, rueckweg: string): string {
  const suche = new URLSearchParams({ person, von, bis });
  return mitRueckweg(`${URLAUB_TERMINE}?${suche.toString()}`, rueckweg);
}

/** Tage je Abfrage; der Server nimmt höchstens 31 (`list_appointments`). */
const FENSTER = 28;

export interface TerminTag {
  on_date: string;
  appointments: number;
}

/**
 * Die Tage mit bestätigten Terminen der Person von `von` bis `bis`, gezählt
 * über den Kalender: sehen darf sie, wer Termine sieht - der Server prüft es
 * bei jeder Abfrage.
 */
export async function fetchTermineImUrlaub(
  person: string,
  von: string,
  bis: string,
  zeitzone: string,
): Promise<TerminTag[]> {
  const anzahl = new Map<string, number>();
  for (let ab = von; ab <= bis; ab = tagePlus(ab, FENSTER)) {
    const letzter = tagePlus(ab, FENSTER - 1);
    const termine = await fetchAppointments({
      von: ab,
      bis: letzter < bis ? letzter : bis,
      person,
      standort: null,
      status: 'confirmed',
    });
    for (const termin of termine) {
      const tag = dayKey(termin.starts_at, zeitzone);
      anzahl.set(tag, (anzahl.get(tag) ?? 0) + 1);
    }
  }
  return [...anzahl.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([on_date, appointments]) => ({ on_date, appointments }));
}
