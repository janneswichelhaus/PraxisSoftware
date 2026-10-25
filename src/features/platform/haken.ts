import type { Ablageplan, WartendeEinheit } from './ablage';

/** Der Schlüssel eines Hakens in der Durchführung: Übung und Durchgang. */
export function hakenSchluessel(positionId: string, durchgang: number): string {
  return `${positionId}:${durchgang}`;
}

/** Hat die Einheit auf dem Gerät schon ihr Ende? */
export function istBeendet(einheit: Pick<WartendeEinheit, 'ereignisse'>): boolean {
  return einheit.ereignisse.some((x) => x.kind === 'finish');
}

/** Die heutige Einheit eines Plans, wie Server und Gerät sie zusammen kennen. */
export interface HeutigeEinheit {
  /** Wo es weitergeht: die heute auf dem Gerät begonnene oder die beim Server offene Einheit. */
  id: string | null;
  /** Die heute auf dem Gerät begonnene, noch nicht beendete Einheit. */
  lokal: WartendeEinheit | null;
  /** Die Haken der Einheit: die des Servers, darüber die des Geräts. */
  haken: ReadonlySet<string>;
  /** Heute liegt eine beendete Einheit des Plans auf dem Gerät, noch nicht übertragen. */
  beendetAufGeraet: boolean;
}

/**
 * Die heutige Einheit eines Plans aus Server und Warteschlange (BEF-218,
 * ANN-730, ersetzt ANN-720) - eine Rechnung für den Start der Durchführung und für Vorschau,
 * Übungszeilen und Plan vom Gerät im Reiter. Weiter geht es mit der heute auf
 * dem Gerät begonnenen Einheit, sonst mit der beim Server offenen. Ist diese
 * auf dem Gerät schon beendet und nur noch nicht übertragen, gehören ihre
 * Haken zu ihr: Es beginnt eine neue, statt hinter ihr Ende zu schreiben
 * (BEF-213).
 */
export function heutigeEinheit(
  plan: Pick<Ablageplan, 'id' | 'open_session'>,
  zugangId: string,
  wartend: readonly WartendeEinheit[],
  tag: string,
): HeutigeEinheit {
  const heute = wartend.filter(
    (e) => e.zugangId === zugangId && e.planId === plan.id && e.tag === tag,
  );
  const lokal = heute.find((e) => !istBeendet(e)) ?? null;
  const offen =
    plan.open_session && !wartend.some((e) => e.id === plan.open_session?.id && istBeendet(e))
      ? plan.open_session
      : null;
  const haken = new Set((offen?.sets ?? []).map((x) => hakenSchluessel(x.item_id, x.set_number)));
  for (const x of lokal?.ereignisse ?? []) {
    if (x.kind !== 'set') continue;
    if (x.done) haken.add(hakenSchluessel(x.item_id, x.set_number));
    else haken.delete(hakenSchluessel(x.item_id, x.set_number));
  }
  return {
    id: lokal?.id ?? offen?.id ?? null,
    lokal,
    haken,
    beendetAufGeraet: heute.some(istBeendet),
  };
}

/** Alle Durchgänge der Übung sind gehakt. */
export function uebungErledigt(
  item: Pick<Ablageplan['items'][number], 'id' | 'sets'>,
  haken: ReadonlySet<string>,
): boolean {
  return Array.from({ length: item.sets }, (_, i) => i + 1).every((d) =>
    haken.has(hakenSchluessel(item.id, d)),
  );
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
  const offen = items.findIndex((p) => !uebungErledigt(p, haken));
  return offen === -1 ? items.length - 1 : offen;
}
