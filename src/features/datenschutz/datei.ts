/**
 * Die Kopie als Datei (OPS-006).
 *
 * Eigene Datei, weil die Seite sonst neben Komponenten auch Funktionen
 * exportierte (`react-refresh/only-export-components`) — und weil sich beides
 * hier ohne gerenderte Seite prüfen lässt.
 */

/** Dateiname der Kopie: sprechend, sortierbar, ohne Namen im Dateinamen. */
export function dateiname(patientId: string, erstelltAm: string): string {
  const tag = new Date(erstelltAm);
  const datum = Number.isNaN(tag.getTime())
    ? 'unbekannt'
    : tag.toISOString().slice(0, 10).replace(/-/g, '');
  return `auskunft-${datum}-${patientId.slice(0, 8)}.json`;
}

/**
 * Speichert die Kopie als Datei.
 *
 * Über einen Blob und nicht über einen `data:`-Verweis: Der wäre einfacher und
 * scheitert an der Größe einer vollständigen Akte.
 */
export function sichereAlsDatei(name: string, inhalt: string): void {
  const url = URL.createObjectURL(new Blob([inhalt], { type: 'application/json' }));
  const anker = document.createElement('a');
  anker.href = url;
  anker.download = name;
  anker.click();
  URL.revokeObjectURL(url);
}
