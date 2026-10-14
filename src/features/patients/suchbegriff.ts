// -----------------------------------------------------------------------------
// Der Suchbegriff der Kartei für den Rückweg aus der Akte (PAT-08)
//
// Meist ist er ein Name. Er steht deshalb nie in der Adresse (ADR-011,
// ADR-013 Punkt 9 Nr. 5), sondern nur im Arbeitsspeicher der Anwendung - wie
// die Abstecher (`src/lib/abstecher.ts`). Neu laden oder Abmelden leert ihn.
// -----------------------------------------------------------------------------

let begriff = '';

export function gemerkterSuchbegriff(): string {
  return begriff;
}

export function suchbegriffMerken(wert: string): void {
  begriff = wert;
}
