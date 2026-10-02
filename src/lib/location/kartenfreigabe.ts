/**
 * Darf die Karte Kacheln laden? (ADR-019 Fassung 5, Punkt 35, ABN-028)
 *
 * Der Schalter `LOCATION_DATA_GATE` sitzt in der Edge Function und erreicht
 * den Browser nicht; der Kachelschlüssel steht im Bundle. Ohne diese Frage
 * lüde eine Produktivumgebung mit Kachelschlüssel die Karte, bevor das Gate
 * bestanden ist. Deshalb fragt die Karte die Function, bevor sie eine einzige
 * Kachel anfordert — **ein Schalter für beide Wege**.
 *
 * Die Antwort trägt nur den Zustand. Alles außer einem ausdrücklichen „offen"
 * heißt zu: ein Fehler, eine fehlende Function, eine Antwort in fremder Form.
 */

import { useQuery } from '@tanstack/react-query';
import { rufeFunktionAuf } from './funktion';

interface Kartenstatus {
  readonly mapReleased: boolean;
}

function istStatus(wert: unknown): wert is Kartenstatus {
  return (
    typeof wert === 'object' &&
    wert !== null &&
    typeof (wert as Record<string, unknown>)['mapReleased'] === 'boolean'
  );
}

/** Fragt die Function nach dem Schalter. `true` nur bei ausdrücklichem „offen". */
export async function kartenFreigegeben(signal?: AbortSignal): Promise<boolean> {
  const antwort = await rufeFunktionAuf('status', {}, istStatus, signal);
  return antwort.ok && antwort.value.mapReleased;
}

/**
 * `undefined`, solange gefragt wird; danach `true` oder `false`. Ohne
 * Kachelschlüssel wird gar nicht gefragt (`aktiv`): Dann gibt es ohnehin keine
 * Kacheln.
 */
export function useKartenfreigabe(aktiv: boolean): boolean | undefined {
  const abfrage = useQuery({
    queryKey: ['karte', 'freigabe'],
    queryFn: ({ signal }) => kartenFreigegeben(signal),
    enabled: aktiv,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return abfrage.data;
}
