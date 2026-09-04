import { formatLocalDate, formatLocalTime } from '@/features/appointments/api';

/** Datum und Uhrzeit in der Praxiszeitzone, wie sie in der Dokumentation stehen. */
export function zeitpunkt(wert: string, zone: string): string {
  return `${formatLocalDate(wert, zone)}, ${formatLocalTime(wert, zone)} Uhr`;
}
