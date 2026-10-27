import { tagePlus } from '@/lib/datum';

/**
 * Das Fenster, das die Urlaubsseiten lesen (`list_leave`): ab heute gut ein
 * Jahr - so weit plant man Urlaub, und so weit reicht der Kalender beim
 * Beantragen. Das Konto gilt dem laufenden Jahr (Jahr des Beginns). Der
 * Server lässt höchstens 400 Tage zu.
 */
export function urlaubsfenster(heute: string): { von: string; bis: string } {
  return { von: heute, bis: tagePlus(heute, 400) };
}
