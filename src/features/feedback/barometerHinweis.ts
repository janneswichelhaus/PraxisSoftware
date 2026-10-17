import { useQuery } from '@tanstack/react-query';
import type { Hinweis } from '@/features/today/zwischendurch';
import { mitRueckweg } from '@/lib/rueckweg';
import { FEEDBACK_STATUS_KEY, fetchFeedbackStatus, type FeedbackStatus } from './api';
import { monatsname } from './fragen';
import { BAROMETER_PFAD } from './inhalt';

/**
 * Der Barometer-Hinweis für „Hinweise zwischendurch“ (ORG-005/-006, ANN-603):
 * nur für Beschäftigte ohne owner, nur solange das Barometer des laufenden
 * Monats nicht abgegeben ist. Der Schlüssel trägt den Monat - nach dem
 * Monatsende erscheint dieser Hinweis nicht mehr.
 */
export function barometerHinweise(stand: FeedbackStatus): Hinweis[] {
  if (!stand.can_take_part || stand.barometer_submitted) return [];
  const monat = monatsname(stand.month);
  return [
    {
      schluessel: `barometer-${stand.month.slice(0, 7)}`,
      titel: `Barometer ${monat}`,
      text: 'Fünf kurze Fragen, wie es dir gerade geht – mit oder ohne Namen.',
      ziel: mitRueckweg(BAROMETER_PFAD, '/'),
    },
  ];
}

/** Die Hinweise des Barometers; `null`, solange der Stand lädt oder fehlt. */
export function useBarometerHinweise(an: boolean): Hinweis[] | null {
  const status = useQuery({
    queryKey: FEEDBACK_STATUS_KEY,
    queryFn: fetchFeedbackStatus,
    enabled: an,
    retry: false,
  });
  if (!an) return [];
  return status.data ? barometerHinweise(status.data) : null;
}
