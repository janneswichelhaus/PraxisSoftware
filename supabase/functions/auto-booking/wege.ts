import {
  MAX_MATRIX_PUNKTE,
  type Anbieteradapter,
  type Coordinate,
  type MatrixErgebnis,
  type TravelProfile,
} from '../location-provider/typen.ts';
import type { Fahrzeit, Weg } from './typen.ts';

// Die Fahrzeiten der Wege aus dem Kartendienst: je eine Matrix zur Adresse hin und von ihr weg, nur
// Koordinaten (ADR-019 Punkt 13). Scheitert ein Aufruf, gibt es kein Ergebnis und keine Schätzung;
// geloggt wird hier nichts (ADR-011).

/** Das Profil, mit dem die Praxis plant (wie `PRAXISPROFIL` der Oberfläche). */
export const PROFIL: TravelProfile = 'cargo_bicycle';

const gleich = (a: Coordinate, b: Coordinate) => a.lat === b.lat && a.lon === b.lon;

function stuecke<T>(liste: readonly T[], groesse: number): T[][] {
  const teile: T[][] = [];
  for (let i = 0; i < liste.length; i += groesse) teile.push(liste.slice(i, i + groesse));
  return teile;
}

/** Eine Fahrzeit des Anbieters, oder `null`, wenn sie fehlt oder keine sinnvolle Zahl ist. */
function sekunden(wert: number | null | undefined): number | null {
  if (typeof wert !== 'number' || !Number.isFinite(wert) || wert < 0 || wert > 86_400) return null;
  return Math.round(wert);
}

interface Optionen {
  readonly adapter: Anbieteradapter;
  readonly ziel: Coordinate;
  readonly wege: readonly Weg[];
}

export type Fahrzeiten =
  { readonly ok: true; readonly fahrzeiten: Fahrzeit[] } | { readonly ok: false };

export async function berechneFahrzeiten({ adapter, ziel, wege }: Optionen): Promise<Fahrzeiten> {
  const hin = wege.filter((w) => gleich(w.to, ziel) && !gleich(w.from, ziel));
  const weiter = wege.filter((w) => gleich(w.from, ziel) && !gleich(w.to, ziel));
  const fahrzeiten: Fahrzeit[] = [];
  // Ein Weg, der die Adresse nicht berührt, wird nicht gefragt und bleibt ungeprüft.
  for (const w of wege) {
    if (!hin.includes(w) && !weiter.includes(w)) fahrzeiten.push({ key: w.key, seconds: null });
  }

  function frage(
    origins: readonly Coordinate[],
    destinations: readonly Coordinate[],
  ): Promise<MatrixErgebnis> {
    return adapter.matrix({ origins, destinations, profile: PROFIL }).catch((): MatrixErgebnis => ({
      ok: false,
      error: { code: 'unavailable', message: 'auto-booking: Kartendienst ohne Antwort' },
    }));
  }

  for (const teil of stuecke(hin, MAX_MATRIX_PUNKTE)) {
    const ergebnis = await frage(
      teil.map((w) => w.from),
      [ziel],
    );
    if (!ergebnis.ok) return { ok: false };
    teil.forEach((w, i) =>
      fahrzeiten.push({ key: w.key, seconds: sekunden(ergebnis.value.durationsSeconds[i]?.[0]) }),
    );
  }
  for (const teil of stuecke(weiter, MAX_MATRIX_PUNKTE)) {
    const ergebnis = await frage(
      [ziel],
      teil.map((w) => w.to),
    );
    if (!ergebnis.ok) return { ok: false };
    teil.forEach((w, i) =>
      fahrzeiten.push({ key: w.key, seconds: sekunden(ergebnis.value.durationsSeconds[0]?.[i]) }),
    );
  }
  return { ok: true, fahrzeiten };
}
