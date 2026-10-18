/** Wer ein Gewicht eingetragen hat, als Zusatz zur Zeile - leer für die Praxis. */
export function gewichtVon(eintrag: { source: string; recorded_by_kind?: string | null }): string {
  if (eintrag.source !== 'platform') return '';
  return eintrag.recorded_by_kind === 'legal_representative'
    ? ' · von der rechtlichen Vertretung'
    : ' · von der Person';
}
