/** Ein Stück eines Tages in Minuten seit Mitternacht, etwa eine Arbeitszeit oder ein Termin. */
export interface Zeitband {
  vonMinute: number;
  bisMinute: number;
}

/**
 * Die freien Lücken innerhalb der Bänder: Bänder minus Belegtes, ab `minLaenge` Minuten.
 * Überschneidungen im Belegten werden zusammengelegt.
 */
export function freieLuecken(
  baender: readonly Zeitband[],
  belegt: readonly Zeitband[],
  minLaenge: number,
): Zeitband[] {
  const besetzt = [...belegt].sort((a, b) => a.vonMinute - b.vonMinute);
  const luecken: Zeitband[] = [];
  for (const band of [...baender].sort((a, b) => a.vonMinute - b.vonMinute)) {
    let stand = band.vonMinute;
    for (const b of besetzt) {
      if (b.bisMinute <= stand || b.vonMinute >= band.bisMinute) continue;
      if (b.vonMinute > stand) luecken.push({ vonMinute: stand, bisMinute: b.vonMinute });
      stand = Math.max(stand, b.bisMinute);
      if (stand >= band.bisMinute) break;
    }
    if (stand < band.bisMinute) luecken.push({ vonMinute: stand, bisMinute: band.bisMinute });
  }
  return luecken.filter((l) => l.bisMinute - l.vonMinute >= minLaenge);
}
