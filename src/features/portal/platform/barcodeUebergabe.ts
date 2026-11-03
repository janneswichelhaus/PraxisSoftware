// Der Barcode für „Eigenes anlegen“ nach einem unbekannten Scan: nur im Arbeitsspeicher dieses
// Tabs, nie in der Adresse, sie verriete, was eine Person isst (ADR-027 Punkt 8, ANN-841).
let uebergeben: string | null = null;

export function barcodeUebergeben(code: string): void {
  uebergeben = code;
}

/** Nimmt den übergebenen Barcode genau einmal. */
export function barcodeUebernehmen(): string | null {
  const code = uebergeben;
  uebergeben = null;
  return code;
}
