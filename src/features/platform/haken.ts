import type { Ablageplan } from './ablage';

/** Der Schlüssel eines Hakens in der Durchführung: Übung und Durchgang. */
export function hakenSchluessel(positionId: string, durchgang: number): string {
  return `${positionId}:${durchgang}`;
}

/**
 * Wo „Weiter üben“ einsetzt (Handoff 2026-10-24, Abschnitt 0; ANN-711): bei
 * der ersten Übung mit einem offenen Durchgang. Ohne Haken bei Übung 1; ist
 * alles gehakt, bei der letzten - von dort ist es ein Tipp zum Abschluss.
 */
export function ersteOffeneUebung(
  items: readonly Pick<Ablageplan['items'][number], 'id' | 'sets'>[],
  haken: ReadonlySet<string>,
): number {
  if (haken.size === 0) return 0;
  const offen = items.findIndex((p) =>
    Array.from({ length: p.sets }, (_, i) => i + 1).some(
      (d) => !haken.has(hakenSchluessel(p.id, d)),
    ),
  );
  return offen === -1 ? items.length - 1 : offen;
}
