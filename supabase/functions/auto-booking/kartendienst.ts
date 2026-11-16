import type { Coordinate, TravelProfile } from '../location-provider/typen.ts';

// Die Fahrzeiten kommen aus der eigenen Function `location-provider`, mit dem Token der Person: Dort
// sitzen Anbieter, Schalter und der eine Ausgang ins Betriebslog (ADR-019 Punkte 18, 35 und 36).
// Diese Function spricht den Kartendienst nie selbst an.

/** Das Profil, mit dem die Praxis plant (wie `PRAXISPROFIL` der Oberfläche). */
export const PROFIL: TravelProfile = 'cargo_bicycle';

const TIMEOUT_MS = 20_000;

/** `not_configured`: kein Anbieter oder vom Schalter abgewiesen; `unavailable`: keine Antwort. */
export type Matrixantwort =
  | { readonly ok: true; readonly sekunden: ReadonlyArray<ReadonlyArray<number | null>> }
  | { readonly ok: false; readonly grund: 'not_configured' | 'unavailable' };

export interface Kartendienst {
  readonly matrix: (
    authorization: string,
    origins: readonly Coordinate[],
    destinations: readonly Coordinate[],
  ) => Promise<Matrixantwort>;
}

interface Optionen {
  readonly supabaseUrl: string;
  readonly anonKey: string;
  /** Für Tests; sonst der `fetch` der Laufzeit. */
  readonly abrufen?: typeof fetch;
  readonly timeoutMs?: number;
}

const istObjekt = (wert: unknown): wert is Record<string, unknown> =>
  typeof wert === 'object' && wert !== null && !Array.isArray(wert);

/** Eine Zeile je Ursprung, eine Zelle je Ziel; alles andere ist keine Matrix. */
function matrixAus(wert: unknown, zeilen: number, spalten: number): (number | null)[][] | null {
  if (!Array.isArray(wert) || wert.length !== zeilen) return null;
  const matrix: (number | null)[][] = [];
  for (const zeile of wert as unknown[]) {
    if (!Array.isArray(zeile) || zeile.length !== spalten) return null;
    matrix.push((zeile as unknown[]).map((zelle) => (typeof zelle === 'number' ? zelle : null)));
  }
  return matrix;
}

export function erstelleKartendienst({
  supabaseUrl,
  anonKey,
  abrufen = fetch,
  timeoutMs = TIMEOUT_MS,
}: Optionen): Kartendienst {
  const adresse = supabaseUrl.trim().replace(/\/+$/, '');
  const schluessel = anonKey.trim();

  return {
    matrix: async (authorization, origins, destinations) => {
      if (adresse === '' || schluessel === '') return { ok: false, grund: 'not_configured' };
      let antwort: Response;
      let koerper: unknown;
      try {
        antwort = await abrufen(`${adresse}/functions/v1/location-provider`, {
          method: 'POST',
          headers: {
            apikey: schluessel,
            Authorization: authorization,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ aufgabe: 'matrix', profile: PROFIL, origins, destinations }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        koerper = await antwort.json();
      } catch {
        return { ok: false, grund: 'unavailable' };
      }
      if (!istObjekt(koerper)) return { ok: false, grund: 'unavailable' };
      if (antwort.status === 200 && koerper['ok'] === true && istObjekt(koerper['value'])) {
        const sekunden = matrixAus(
          koerper['value']['durationsSeconds'],
          origins.length,
          destinations.length,
        );
        return sekunden === null ? { ok: false, grund: 'unavailable' } : { ok: true, sekunden };
      }
      const fehler = istObjekt(koerper['error']) ? koerper['error']['code'] : null;
      return { ok: false, grund: fehler === 'not_configured' ? 'not_configured' : 'unavailable' };
    },
  };
}
