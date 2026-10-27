import { useQuery } from '@tanstack/react-query';
import { fetchAbrechnungslage } from './abrechnungslage-api';

/**
 * Zähler und Abrechnungslage eines Termins (PRX-008, ANN-139).
 *
 * Eine Abfrage für Kachel, Abschnitt und Seitenaufbau: Die Terminseite fragt
 * hier, ob sie eine Kontextspalte braucht (Design-Handoff 2026-10-01,
 * Abschnitt 6); dieselbe Abfrage trägt die Kachel „Grundlage" und den
 * Abschnitt „Abrechnung" - gelesen wird einmal.
 */
export function useAbrechnungslage(appointmentId: string) {
  return useQuery({
    // Unter dem Schlüssel des Termins: Was den Termin neu lädt, lädt auch dies.
    queryKey: ['appointment', appointmentId, 'abrechnungslage'],
    queryFn: () => fetchAbrechnungslage(appointmentId),
    retry: false,
  });
}
