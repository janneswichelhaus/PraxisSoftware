import type { QueryClient } from '@tanstack/react-query';

/**
 * Was nach einer Terminänderung neu gelesen werden muss (UBK-011).
 *
 * Anlegen, Ändern, Verschieben und Absagen änderten bisher nur die
 * Terminliste (`appointments`, teils `day-plan`); die Punkte der Tagesroute
 * (`day-route`) und die Prüfung des Fahrpuffers (`travel-buffers`) blieben im
 * Zwischenspeicher stehen. Tour, Übersicht und die Fahrwege im Kalender
 * zeigten dann bis zum Neuladen den alten Tag. Die Routen selbst brauchen
 * nichts: Ihr Schlüssel sind die Wegpunkte, und neue Punkte sind eine neue
 * Abfrage.
 */
export const TAGESLAGE: readonly (readonly string[])[] = [
  ['appointments'],
  ['day-plan'],
  ['day-route'],
  ['travel-buffers'],
];

/** Markiert die Tageslage als veraltet; aktive Abfragen laden sofort neu. */
export async function tageslageNeuLaden(queryClient: QueryClient): Promise<void> {
  await Promise.all(TAGESLAGE.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
