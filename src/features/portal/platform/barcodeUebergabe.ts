// Barcodes zwischen Tagebuch und „Eigenes anlegen“: nur im Arbeitsspeicher dieses Tabs, nie in der
// Adresse, sie verriete, was eine Person isst (ADR-027 Punkt 8, ANN-841). Jeder wird einmal genommen.
let zumAnlegen: string | null = null;
let nachDemAnlegen: string | null = null;

function nehmen(wert: string | null, leeren: () => void): string | null {
  leeren();
  return wert;
}

/** Ein unbekannter Barcode für das Formular des eigenen Lebensmittels. */
export function barcodeUebergeben(code: string): void {
  zumAnlegen = code;
}

export function barcodeUebernehmen(): string | null {
  return nehmen(zumAnlegen, () => (zumAnlegen = null));
}

/** Nach dem Anlegen schlägt das Tagebuch diesen Barcode gleich nach und öffnet die Menge. */
export function nachDemAnlegenNachschlagen(code: string): void {
  nachDemAnlegen = code;
}

export function nachDemAnlegenNehmen(): string | null {
  return nehmen(nachDemAnlegen, () => (nachDemAnlegen = null));
}

let sucheNachScan = false;

/** „Suchen“ aus dem Scan der Tagesansicht: Die Seite der Mahlzeit setzt den Fokus ins Suchfeld. */
export function sucheNachScanMerken(): void {
  sucheNachScan = true;
}

export function sucheNachScanNehmen(): boolean {
  const wert = sucheNachScan;
  sucheNachScan = false;
  return wert;
}
