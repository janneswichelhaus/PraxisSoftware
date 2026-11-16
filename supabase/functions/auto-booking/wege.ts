import { MAX_MATRIX_PUNKTE, type Coordinate } from '../location-provider/typen.ts';
import type { Kartendienst, Matrixantwort } from './kartendienst.ts';
import type { Fahrzeit, Weg } from './typen.ts';

// Die Fahrzeiten der Wege: je eine Matrix zur Adresse hin und von ihr weg, nur Koordinaten
// (ADR-019 Punkt 13). Scheitert eine Anfrage, gibt es kein Ergebnis und keine Schätzung.

const gleich = (a: Coordinate, b: Coordinate) => a.lat === b.lat && a.lon === b.lon;

function stuecke<T>(liste: readonly T[], groesse: number): T[][] {
  const teile: T[][] = [];
  for (let i = 0; i < liste.length; i += groesse) teile.push(liste.slice(i, i + groesse));
  return teile;
}

/** Eine Fahrzeit des Kartendienstes, oder `null`, wenn sie fehlt oder keine sinnvolle Zahl ist. */
function sekunden(wert: number | null | undefined): number | null {
  if (typeof wert !== 'number' || !Number.isFinite(wert) || wert < 0 || wert > 86_400) return null;
  return Math.round(wert);
}

interface Optionen {
  readonly kartendienst: Kartendienst;
  readonly authorization: string;
  readonly ziel: Coordinate;
  readonly wege: readonly Weg[];
}

export type Fahrzeiten =
  | { readonly ok: true; readonly fahrzeiten: Fahrzeit[] }
  | { readonly ok: false; readonly grund: 'not_configured' | 'unavailable' };

export async function berechneFahrzeiten({
  kartendienst,
  authorization,
  ziel,
  wege,
}: Optionen): Promise<Fahrzeiten> {
  const hin = wege.filter((w) => gleich(w.to, ziel) && !gleich(w.from, ziel));
  const weiter = wege.filter((w) => gleich(w.from, ziel) && !gleich(w.to, ziel));
  const fahrzeiten: Fahrzeit[] = [];
  // Ein Weg, der die Adresse nicht berührt, wird nicht gefragt und bleibt ungeprüft.
  for (const w of wege) {
    if (!hin.includes(w) && !weiter.includes(w)) fahrzeiten.push({ key: w.key, seconds: null });
  }

  const frage = (
    origins: readonly Coordinate[],
    destinations: readonly Coordinate[],
  ): Promise<Matrixantwort> =>
    kartendienst
      .matrix(authorization, origins, destinations)
      .catch((): Matrixantwort => ({ ok: false, grund: 'unavailable' }));

  for (const teil of stuecke(hin, MAX_MATRIX_PUNKTE)) {
    const antwort = await frage(
      teil.map((w) => w.from),
      [ziel],
    );
    if (!antwort.ok) return antwort;
    teil.forEach((w, i) =>
      fahrzeiten.push({ key: w.key, seconds: sekunden(antwort.sekunden[i]?.[0]) }),
    );
  }
  for (const teil of stuecke(weiter, MAX_MATRIX_PUNKTE)) {
    const antwort = await frage(
      [ziel],
      teil.map((w) => w.to),
    );
    if (!antwort.ok) return antwort;
    teil.forEach((w, i) =>
      fahrzeiten.push({ key: w.key, seconds: sekunden(antwort.sekunden[0]?.[i]) }),
    );
  }
  return { ok: true, fahrzeiten };
}
