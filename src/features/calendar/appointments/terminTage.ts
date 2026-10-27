import { dayKey, tagePlus } from '@/lib/datum';
import { fetchAppointments } from './api';

/** Tage je Abfrage; der Server nimmt höchstens 31 (`list_appointments`). */
const FENSTER = 28;

export interface TerminTag {
  on_date: string;
  appointments: number;
}

/**
 * Die Tage mit bestätigten Terminen der Person von `von` bis `bis`, gezählt über den Kalender:
 * sehen darf sie, wer Termine sieht; der Server prüft es bei jeder Abfrage.
 */
export async function fetchTerminTage(
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
