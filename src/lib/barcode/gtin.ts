/** Die Prüfziffer nach GS1 zu Ziffern ohne sie: von rechts gewichtet 3, 1, 3, …, Rest zu zehn. */
export function pruefziffer(ziffern: string): number {
  let summe = 0;
  for (let i = 1; i <= ziffern.length; i += 1) {
    summe += Number(ziffern.charAt(ziffern.length - i)) * (i % 2 === 1 ? 3 : 1);
  }
  return (10 - (summe % 10)) % 10;
}

/** GTIN-8, -12, -13 oder -14 mit gültiger Prüfziffer, wie `app.gtin_valid` am Server. */
export function gtinGueltig(code: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  return pruefziffer(code.slice(0, -1)) === Number(code.slice(-1));
}

/** Ohne führende Nullen sind EAN-8, UPC-A, EAN-13 und GTIN-14 eines Produkts gleich (`app.gtin_key`). */
export function gtinSchluessel(code: string): string {
  return code.replace(/^0+/, '');
}

/** Dieselbe Nummer, gleich wie geschrieben: mit Leerzeichen getippt oder mit Nullen vorn. */
export function gleicheGtin(a: string, b: string): boolean {
  return gtinSchluessel(a) === gtinSchluessel(b);
}

/** UPC-E (acht Ziffern, Nummernsystem 0 oder 1) als UPC-A mit zwölf Ziffern; sonst `null`. */
export function upcEZuUpcA(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const s = code.charAt(0);
  const d = code.slice(1, 7);
  const pruef = code.charAt(7);
  const letzte = d.charAt(5);
  let mitte: string;
  if (letzte <= '2') mitte = `${d.slice(0, 2)}${letzte}0000${d.slice(2, 5)}`;
  else if (letzte === '3') mitte = `${d.slice(0, 3)}00000${d.slice(3, 5)}`;
  else if (letzte === '4') mitte = `${d.slice(0, 4)}00000${d.charAt(4)}`;
  else mitte = `${d.slice(0, 5)}0000${letzte}`;
  const upcA = `${s}${mitte}${pruef}`;
  return gtinGueltig(upcA) ? upcA : null;
}

/** Eine getippte Nummer: Leerzeichen und Bindestriche fallen weg, sonst bleibt sie, wie sie ist. */
export function getippteGtin(eingabe: string): string {
  return eingabe.replace(/[\s-]/g, '');
}
