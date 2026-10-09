/**
 * ANN-316 (ADR-017 Fassung 4 Punkt 57, BEF-135): Eine Arbeitshilfe entsteht
 * nicht mehr, also wird die Einwilligung zu Fotos nicht mehr angeboten. Wer
 * sie erteilt hat, sieht sie weiter, um sie zu widerrufen - der Widerruf
 * löscht vorhandene Arbeitshilfen. Gilt in der Akte und auf der Plattform;
 * deshalb hier und nicht in einem der beiden Features (ADR-023 Punkt 26).
 */
const NUR_NOCH_WIDERRUF: readonly string[] = ['patient_photos'];

export function einwilligungAngeboten(zweck: string, erteilt: boolean): boolean {
  return erteilt || !NUR_NOCH_WIDERRUF.includes(zweck);
}
